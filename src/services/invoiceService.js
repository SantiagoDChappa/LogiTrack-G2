// Factura del envío (comprobante al remitente). Se genera al dar de alta el envío,
// tomando el desglose de costo de shipmentCostService. Idempotente: una por envío.
const { Invoice } = require('../models/invoice');
const shipmentModel = require('../models/shipment');
const costSvc = require('./shipmentCostService');
const { generatePortalToken } = require('../utils/shipmentTokens');

const buildNumber = (id) => `FAC-0001-${String(id).padStart(8, '0')}`;

// Id de transacción simulado (estilo Mercado Pago) para el comprobante de pago.
const buildPayRef = () => `MP-${require('crypto').randomBytes(4).toString('hex').toUpperCase()}`;

const findByShipment = (shipmentId) => Invoice.findOne({ where: { shipmentId } });
const getByToken = (payToken) => (payToken ? Invoice.findOne({ where: { payToken } }) : Promise.resolve(null));

// Genera (o devuelve la existente) la factura de un envío con su desglose de costo.
const generate = async ({ shipmentId, userId = null }) => {
    const existing = await findByShipment(shipmentId);
    if (existing) { return { ok: true, invoice: existing, duplicated: true }; }

    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) { return { ok: false, message: 'Envío no encontrado' }; }

    const c = await costSvc.computeCost(shipment);
    if (!c) { return { ok: false, message: 'El envío no tiene desglose de costo' }; }

    try {
        const created = await Invoice.create({
            number:          'TMP',
            shipmentId,
            amount:          c.final,
            costBase:        c.costoBase,
            zoneBase:        c.zoneBase,
            weightSurcharge: c.wSurcharge,
            volumeSurcharge: c.vSurcharge,
            insuranceAmount: c.insurance || 0,
            subtotal:        c.subtotal,
            senderName:      shipment.sender?.fullName || null,
            senderDocument:  shipment.sender?.document || null,
            createdByUserId: userId,
            createdAt:       new Date(),
            payStatus:       'PENDIENTE',
            payToken:        generatePortalToken(),
        });
        await created.update({ number: buildNumber(created.id) });
        return { ok: true, invoice: created };
    } catch (e) {
        // Carrera contra el índice único por envío: ya existe → devolvemos la existente.
        const again = await findByShipment(shipmentId);
        if (again) { return { ok: true, invoice: again, duplicated: true }; }
        return { ok: false, message: e.message };
    }
};

const getById = (id) => Invoice.findByPk(id);
const getByShipment = (shipmentId) => findByShipment(shipmentId);

// Guarda el id de preferencia de Mercado Pago creada para esta factura (para
// no crear una nueva preferencia cada vez que el cliente reabre el link de pago).
const setMpPreference = (invoice, mpPreferenceId) => invoice.update({ mpPreferenceId });

// Marca la factura como PAGADA (pago simulado). Idempotente: si ya está pagada o
// anulada (nota de crédito por el total), devuelve la existente sin tocar nada.
const markPaid = async (invoice, { method = 'mercadopago' } = {}) => {
    if (!invoice) { return { ok: false, message: 'Factura no encontrada' }; }
    if (invoice.payStatus === 'PAGADA' || invoice.payStatus === 'ANULADA') {
        return { ok: true, invoice, duplicated: true };
    }
    await invoice.update({
        payStatus: 'PAGADA',
        payMethod: method,
        payRef:    buildPayRef(),
        paidAt:    new Date(),
    });
    return { ok: true, invoice };
};

// Pago aprobado por Mercado Pago vía webhook: marca PAGADA y guarda el payment id real.
const markPaidByMp = async (invoice, mpPaymentId) => {
    if (invoice.payStatus === 'PAGADA' || invoice.payStatus === 'ANULADA') {
        return { ok: true, invoice, duplicated: true };
    }
    await invoice.update({
        payStatus: 'PAGADA',
        payMethod: 'mercadopago',
        payRef:    mpPaymentId,
        paidAt:    new Date(),
        mpPaymentId,
    });
    return { ok: true, invoice };
};

// La nota de crédito de este sistema siempre cubre el costo completo del envío
// (no hay notas de crédito parciales), así que toda NC generada anula la factura.
const voidByCreditNote = async (invoice, creditNoteId) => {
    if (!invoice || invoice.payStatus === 'ANULADA') { return { ok: true, invoice, duplicated: true }; }
    await invoice.update({ payStatus: 'ANULADA', voidedByCreditNoteId: creditNoteId });
    return { ok: true, invoice };
};

module.exports = {
    generate, getById, getByShipment, getByToken, markPaid, buildNumber,
    setMpPreference, markPaidByMp, voidByCreditNote,
};
