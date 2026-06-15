// LGT-215 — generación de envío de reposición por reemplazo.
// Mecanismo compartido: lo dispara el paquete roto (incidencia) y la devolución genérica.
// Hereda destinatario/dirección del original, sin cargo (codAmount 0), enlazado para trazabilidad.
const shipmentModel = require('../models/shipment');
const { Shipment } = require('../models/shipment');

const findExistingByOrigin = (originalShipmentId) =>
    Shipment.findOne({ where: { replacementOfShipmentId: originalShipmentId } });

const generate = async ({ originalShipmentId }) => {
    const existing = await findExistingByOrigin(originalShipmentId);
    if (existing) { return { ok: true, shipment: existing, duplicated: true }; }

    const orig = await shipmentModel.getById(originalShipmentId);
    if (!orig) { return { ok: false, message: 'Envío original no encontrado' }; }

    const created = await shipmentModel.create({
        senderId:       orig.senderId,
        recipientId:    orig.recipientId,
        addressId:      orig.addressId,
        shipmentTypeId: orig.shipmentTypeId,
        weightKg:       orig.weightKg,
        volumeM3:       orig.volumeM3,
        packageQty:     orig.packageQty,
        zoneId:         orig.zoneId,
        currentBranchId: orig.currentBranchId,
        deliveryMode:   orig.deliveryMode,
        pickupBranchId: orig.pickupBranchId,
        statusId:       1, // Pendiente / En preparación
    });

    // Sin nuevo cobro por el reemplazo + enlace con el original (Esc.2/3).
    await created.update({ replacementOfShipmentId: orig.id, codAmount: 0 });

    return { ok: true, shipment: created };
};

module.exports = { generate, findExistingByOrigin };
