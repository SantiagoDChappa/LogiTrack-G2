// Desglose de costo del envío (cliente). Extraído del detalle de envío para poder
// reutilizarlo en la nota de crédito (LGT-214). El total es `final`.
const settingModel = require('../models/setting');
const dangerSvc = require('./dangerArea.service');

// Destino del envío para evaluar peligrosidad. Tolera distintas formas según de
// dónde venga el shipment (modelo con `address`, pseudo-shipment del preview, etc.).
const destinationOf = (shipment) => {
    const a = shipment.address || {};
    return {
        postalCode: shipment.destPostalCode ?? a.postalCode ?? shipment.postalCode ?? null,
        lat: shipment.destLat ?? a.lat ?? shipment.lat ?? null,
        lng: shipment.destLng ?? a.lng ?? shipment.lng ?? null,
    };
};

// Recargo por destino peligroso. Devuelve 0 si no hay áreas, el % global es 0 o
// no hay datos de destino -> totalmente retrocompatible.
const computeDangerSurcharge = async (shipment, subtotal) => {
    const pct = await dangerSvc.getDangerPct();
    if (pct <= 0) { return { surcharge: 0, dangerous: false, reachable: true }; }
    const ev = await dangerSvc.evaluate(destinationOf(shipment));
    const surcharge = (ev.dangerous && ev.reachable) ? Number((subtotal * (pct / 100)).toFixed(2)) : 0;
    return { surcharge, dangerous: ev.dangerous, reachable: ev.reachable };
};

// shipment debe venir con su zona (`shipment.zone`) si se quiere el desglose por zona.
// penaltyPct opcional (de la SLA): si se pasa, descuenta la penalidad del subtotal.
// Seguro de mercadería ([prototype]): % global (Ajustes → seguro_pct) sobre el valor
// declarado. Se "congela" al alta en shipment.insuranceAmount; si ya está, se usa ese
// valor (para no recalcular con un % distinto al vigente cuando se creó el envío).
const computeInsurance = async (shipment) => {
    const frozen = shipment.insuranceAmount;
    if (frozen !== null && frozen !== undefined) { return Number(frozen); }  // valor congelado al alta
    const declaredValue = Number(shipment.declaredValue || 0);
    if (declaredValue <= 0) { return 0; }
    const seguroPct = parseFloat(await settingModel.get('seguro_pct')) || 0;
    return Number((declaredValue * (seguroPct / 100)).toFixed(2));
};

const computeCost = async (shipment, { penaltyPct = 0 } = {}) => {
    if (!shipment) { return null; }
    const costoBase = parseFloat(await settingModel.get('costo_base_envio')) || 0;
    const insurance = await computeInsurance(shipment);
    const w = Number(shipment.weightKg || 0);
    const v = Number(shipment.volumeM3 || 0);

    if (!shipment.zone) {
        const base = costoBase + insurance;
        const dng = await computeDangerSurcharge(shipment, base);
        const subtotal = base + dng.surcharge;
        if (subtotal <= 0) { return null; }
        return {
            costoBase, zoneBase: 0, wSurcharge: 0, vSurcharge: 0, insurance,
            dangerSurcharge: dng.surcharge, dangerous: dng.dangerous, reachable: dng.reachable,
            subtotal, penalty: 0, final: subtotal,
        };
    }

    const zone = shipment.zone;
    const zoneBase = Number(zone.baseCost || 0);
    const wSurcharge = Number(zone.surchargePerKg || 0) * w;
    const vSurcharge = Number(zone.surchargePerM3 || 0) * v;
    const base = costoBase + zoneBase + wSurcharge + vSurcharge + insurance;
    const dng = await computeDangerSurcharge(shipment, base);
    const subtotal = base + dng.surcharge;
    const penalty = penaltyPct ? subtotal * (penaltyPct / 100) : 0;
    return {
        costoBase, zoneBase, wSurcharge, vSurcharge, insurance,
        dangerSurcharge: dng.surcharge, dangerous: dng.dangerous, reachable: dng.reachable,
        subtotal,
        penalty: Number(penalty.toFixed(2)),
        final: Number((subtotal - penalty).toFixed(2)),
    };
};

// Total a cobrar del envío (lo que paga el cliente). 0 si no hay desglose.
const computeTotal = async (shipment) => {
    const c = await computeCost(shipment);
    return c ? c.final : 0;
};

module.exports = { computeCost, computeTotal, computeInsurance };
