// Desglose de costo del envío (cliente). Extraído del detalle de envío para poder
// reutilizarlo en la nota de crédito (LGT-214). El total es `final`.
const settingModel = require('../models/setting');

// shipment debe venir con su zona (`shipment.zone`) si se quiere el desglose por zona.
// penaltyPct opcional (de la SLA): si se pasa, descuenta la penalidad del subtotal.
const computeCost = async (shipment, { penaltyPct = 0 } = {}) => {
    if (!shipment) { return null; }
    const costoBase = parseFloat(await settingModel.get('costo_base_envio')) || 0;
    const w = Number(shipment.weightKg || 0);
    const v = Number(shipment.volumeM3 || 0);

    if (!shipment.zone) {
        if (costoBase <= 0) { return null; }
        return { costoBase, zoneBase: 0, wSurcharge: 0, vSurcharge: 0, subtotal: costoBase, penalty: 0, final: costoBase };
    }

    const zone = shipment.zone;
    const zoneBase = Number(zone.baseCost || 0);
    const wSurcharge = Number(zone.surchargePerKg || 0) * w;
    const vSurcharge = Number(zone.surchargePerM3 || 0) * v;
    const subtotal = costoBase + zoneBase + wSurcharge + vSurcharge;
    const penalty = penaltyPct ? subtotal * (penaltyPct / 100) : 0;
    return {
        costoBase, zoneBase, wSurcharge, vSurcharge, subtotal,
        penalty: Number(penalty.toFixed(2)),
        final: Number((subtotal - penalty).toFixed(2)),
    };
};

// Total a cobrar del envío (lo que paga el cliente). 0 si no hay desglose.
const computeTotal = async (shipment) => {
    const c = await computeCost(shipment);
    return c ? c.final : 0;
};

module.exports = { computeCost, computeTotal };
