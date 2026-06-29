// LGT-214 — generación de nota de crédito por reembolso.
// Mecanismo compartido: lo dispara el paquete roto (incidencia) y la devolución genérica.
// Importe = total del envío (shipmentCostService). Sin duplicar nota por misma resolución.
const { CreditNote } = require('../models/creditNote');
const shipmentModel = require('../models/shipment');
const costSvc = require('./shipmentCostService');
const invoiceService = require('./invoiceService');

const findExisting = ({ incidentId, returnId }) => {
    if (incidentId) { return CreditNote.findOne({ where: { incidentId } }); }
    if (returnId)   { return CreditNote.findOne({ where: { returnId } }); }
    return Promise.resolve(null);
};

const buildNumber = (id) => `NC-0001-${String(id).padStart(8, '0')}`;

// Genera (o devuelve la existente) la nota de crédito de una resolución.
const generate = async ({ shipmentId, incidentId = null, returnId = null, userId = null }) => {
    const existing = await findExisting({ incidentId, returnId });
    if (existing) { return { ok: true, creditNote: existing, duplicated: true }; }

    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) { return { ok: false, message: 'Envío no encontrado' }; }

    // Usa el costo persistido al crear el envío (LGT-214 precondición).
    // Fallback a computeTotal para envíos anteriores sin costTotal.
    const amount = shipment.costTotal != null
        ? Number(shipment.costTotal)
        : await costSvc.computeTotal(shipment);
    // [prototype] Seguro itemizado: ya está incluido en `amount`; lo guardamos aparte
    // para mostrarlo desglosado en el comprobante. Usa el valor congelado al alta.
    const frozenInsurance = shipment.insuranceAmount;
    const insuranceAmount = (frozenInsurance !== null && frozenInsurance !== undefined) ? Number(frozenInsurance) : 0;
    try {
        const created = await CreditNote.create({
            number: 'TMP', shipmentId, incidentId, returnId,
            amount, insuranceAmount,
            // La NC de reembolso se emite al remitente: guardamos sus datos fiscales.
            senderName:     shipment.sender?.fullName || null,
            senderDocument: shipment.sender?.document || null,
            createdByUserId: userId, createdAt: new Date(),
        });
        await created.update({ number: buildNumber(created.id) });

        // La NC siempre cubre el costo completo del envío → anula la factura.
        // Best-effort: si la factura no existe (envío sin facturar), no rompe la NC.
        try {
            const invoice = await invoiceService.getByShipment(shipmentId);
            if (invoice) { await invoiceService.voidByCreditNote(invoice, created.id); }
        } catch (e) {
            console.error('[creditNoteService] error al anular factura:', e.message);
        }

        return { ok: true, creditNote: created };
    } catch (e) {
        // Carrera contra el índice único parcial: ya existe → devolvemos la existente.
        const again = await findExisting({ incidentId, returnId });
        if (again) { return { ok: true, creditNote: again, duplicated: true }; }
        return { ok: false, message: e.message };
    }
};

const getById = (id) => CreditNote.findByPk(id);
const getByShipment = (shipmentId) =>
    CreditNote.findAll({ where: { shipmentId }, order: [['createdAt', 'DESC']] });
const getByReturn = (returnId) => CreditNote.findOne({ where: { returnId } });

module.exports = { generate, getById, getByShipment, getByReturn, buildNumber };
