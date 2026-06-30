// Desglose de costo del envío (cliente). Extraído del detalle de envío para poder
// reutilizarlo en la nota de crédito (LGT-214). El total es `final`.
const settingModel = require('../models/setting');
const dangerSvc = require('./dangerArea.service');
const { haversine } = require('../utils/geo');

// Destino del envío para evaluar peligrosidad/distancia. Tolera distintas formas
// según de dónde venga el shipment (modelo con `address`, pseudo-shipment del preview).
const destinationOf = (shipment) => {
    const a = shipment.address || {};
    return {
        postalCode: shipment.destPostalCode ?? a.postalCode ?? shipment.postalCode ?? null,
        lat: shipment.destLat ?? a.lat ?? shipment.lat ?? null,
        lng: shipment.destLng ?? a.lng ?? shipment.lng ?? null,
    };
};

// Origen del envío (sucursal de despacho). Si el shipment no trae sucursal cargada
// (ej. pseudo-shipment del preview), cae al punto de origen central (Ajustes).
const originOf = async (shipment) => {
    const b = shipment.currentBranch || shipment.originBranch || null;
    if (b && b.latitude != null && b.longitude != null) {
        return { lat: Number(b.latitude), lng: Number(b.longitude) };
    }
    if (shipment.originLat != null && shipment.originLng != null) {
        return { lat: Number(shipment.originLat), lng: Number(shipment.originLng) };
    }
    const lat = parseFloat(await settingModel.get('origin_lat'));
    const lng = parseFloat(await settingModel.get('origin_lng'));
    return { lat: Number.isFinite(lat) ? lat : -34.6037, lng: Number.isFinite(lng) ? lng : -58.3816 };
};

// Recargo por destino peligroso. Se CONGELA al alta del envío (igual que el seguro):
// si el shipment ya trae `dangerSurcharge`, se usa ese valor y no se recalcula. El
// cálculo en vivo (consultando las áreas peligrosas) solo corre cuando se pide
// explícitamente con liveDanger=true (alta + preview de costo), para que el ruteo y
// el detalle/NC tomen siempre el total congelado y no dependan de las áreas actuales.
const computeDangerSurcharge = async (shipment, subtotal, liveDanger) => {
    const frozen = shipment.dangerSurcharge;
    if (frozen !== null && frozen !== undefined) {
        const v = Number(frozen);
        return { surcharge: v, dangerous: v > 0, reachable: true };
    }
    if (!liveDanger) { return { surcharge: 0, dangerous: false, reachable: true }; }
    const pct = await dangerSvc.getDangerPct();
    if (pct <= 0) { return { surcharge: 0, dangerous: false, reachable: true }; }
    const ev = await dangerSvc.evaluate(destinationOf(shipment));
    const surcharge = (ev.dangerous && ev.reachable) ? Number((subtotal * (pct / 100)).toFixed(2)) : 0;
    return { surcharge, dangerous: ev.dangerous, reachable: ev.reachable };
};

// Recargo por distancia origen-destino (línea recta). Se congela al alta igual que
// el resto; solo se calcula en vivo (alta + preview) cuando liveDanger=true, porque
// requiere resolver el origen (sucursal de despacho), que no siempre está disponible.
const computeDistanceSurcharge = async (shipment, liveDanger) => {
    const frozenSurcharge = shipment.distanceSurcharge;
    const frozenKm = shipment.distanceKm;
    if (frozenSurcharge !== null && frozenSurcharge !== undefined) {
        return { surcharge: Number(frozenSurcharge), km: frozenKm !== null && frozenKm !== undefined ? Number(frozenKm) : null };
    }
    if (!liveDanger) { return { surcharge: 0, km: null }; }
    const dest = destinationOf(shipment);
    if (dest.lat == null || dest.lng == null) { return { surcharge: 0, km: null }; }
    const origin = await originOf(shipment);
    const costoPorKm = parseFloat(await settingModel.get('costo_por_km')) || 0;
    const km = haversine(origin.lat, origin.lng, dest.lat, dest.lng);
    const surcharge = Number((km * costoPorKm).toFixed(2));
    return { surcharge, km };
};

// Recargos por tipo de envío (Express) y manejo especial (Frágil): % fijo sobre
// `base` (costo de transporte, antes de zona peligrosa). Se congelan al alta;
// no dependen de nada externo, así que se recalculan siempre que no estén congelados.
const computeServiceSurcharges = async (shipment, base) => {
    const frozenExpress = shipment.expressSurcharge;
    const frozenFragile = shipment.fragileSurcharge;
    if (frozenExpress !== null && frozenExpress !== undefined && frozenFragile !== null && frozenFragile !== undefined) {
        return { expressSurcharge: Number(frozenExpress), fragileSurcharge: Number(frozenFragile) };
    }
    const isExpress = Number(shipment.shipmentTypeId) === 1;
    const isFragile = !!shipment.fragile;
    const expressPct = isExpress ? (parseFloat(await settingModel.get('recargo_express_pct')) || 0) : 0;
    const fragilePct = isFragile ? (parseFloat(await settingModel.get('recargo_fragil_pct')) || 0) : 0;
    return {
        expressSurcharge: Number((base * (expressPct / 100)).toFixed(2)),
        fragileSurcharge: Number((base * (fragilePct / 100)).toFixed(2)),
    };
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

// liveDanger: true solo al alta y en el preview de costo, para CALCULAR en vivo lo
// que depende de evaluar el mapa/origen (zona peligrosa + distancia). En el resto
// (detalle/NC/ruteo) se usan los valores congelados en el envío; si no hay, son 0.
const computeCost = async (shipment, { penaltyPct = 0, liveDanger = false } = {}) => {
    if (!shipment) { return null; }
    const costoBase = parseFloat(await settingModel.get('costo_base_envio')) || 0;
    const insurance = await computeInsurance(shipment);
    const w = Number(shipment.weightKg || 0);
    const v = Number(shipment.volumeM3 || 0);

    if (!shipment.zone) {
        const baseSinExtras = costoBase + insurance;
        const dist = await computeDistanceSurcharge(shipment, liveDanger);
        const svc = await computeServiceSurcharges(shipment, baseSinExtras);
        const base = baseSinExtras + dist.surcharge + svc.expressSurcharge + svc.fragileSurcharge;
        const dng = await computeDangerSurcharge(shipment, base, liveDanger);
        const subtotal = base + dng.surcharge;
        if (subtotal <= 0) { return null; }
        return {
            costoBase, zoneBase: 0, wSurcharge: 0, vSurcharge: 0, insurance,
            distanceKm: dist.km, distanceSurcharge: dist.surcharge,
            expressSurcharge: svc.expressSurcharge, fragileSurcharge: svc.fragileSurcharge,
            dangerSurcharge: dng.surcharge, dangerous: dng.dangerous, reachable: dng.reachable,
            subtotal, penalty: 0, final: subtotal,
        };
    }

    const zone = shipment.zone;
    const zoneBase = Number(zone.baseCost || 0);
    const wSurcharge = Number(zone.surchargePerKg || 0) * w;
    const vSurcharge = Number(zone.surchargePerM3 || 0) * v;
    const baseSinExtras = costoBase + zoneBase + wSurcharge + vSurcharge + insurance;
    const dist = await computeDistanceSurcharge(shipment, liveDanger);
    const svc = await computeServiceSurcharges(shipment, baseSinExtras);
    const base = baseSinExtras + dist.surcharge + svc.expressSurcharge + svc.fragileSurcharge;
    const dng = await computeDangerSurcharge(shipment, base, liveDanger);
    const subtotal = base + dng.surcharge;
    const penalty = penaltyPct ? subtotal * (penaltyPct / 100) : 0;
    return {
        costoBase, zoneBase, wSurcharge, vSurcharge, insurance,
        distanceKm: dist.km, distanceSurcharge: dist.surcharge,
        expressSurcharge: svc.expressSurcharge, fragileSurcharge: svc.fragileSurcharge,
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
