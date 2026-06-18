// Factura del envío (comprobante al remitente). Se genera al dar de alta el envío,
// tomando el desglose de costo de shipmentCostService. Idempotente: una por envío.
const { Invoice } = require('../models/invoice');
const shipmentModel = require('../models/shipment');
const costSvc = require('./shipmentCostService');

const buildNumber = (id) => `FAC-0001-${String(id).padStart(8, '0')}`;

const findByShipment = (shipmentId) => Invoice.findOne({ where: { shipmentId } });

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

module.exports = { generate, getById, getByShipment, buildNumber };
