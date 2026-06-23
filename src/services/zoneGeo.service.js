// Agrega datos de zonas por provincia para el mapa del admin de zonas.
// Aditivo: usa SOLO tablas existentes (zone, province, shipment, transport_zone).
// No requiere schema nuevo. La geometría la pone el front desde georef.
const sequelize = require('../database/connection');
const { QueryTypes } = require('sequelize');
const { Zone } = require('../models/zone');
const provinceModel = require('../models/province');

// Color estable por zona: mismo id -> mismo color entre recargas y entre
// leyenda y mapa. Hue distribuido para separar zonas vecinas.
const zoneColor = (id) => {
    const hue = (Number(id) * 47) % 360;
    return `hsl(${hue}, 62%, 52%)`;
};

const normalize = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();

const getProvinceSummary = async () => {
    const [zones, provinces, shipmentCounts, transportCounts] = await Promise.all([
        Zone.findAll({ order: [['name', 'ASC']] }),
        provinceModel.getAll(),
        sequelize.query(
            `SELECT "zoneId" AS zone_id, COUNT(*)::int AS cnt
             FROM logitrack.shipment
             WHERE "zoneId" IS NOT NULL
             GROUP BY "zoneId"`,
            { type: QueryTypes.SELECT }
        ),
        sequelize.query(
            `SELECT zone_id, COUNT(DISTINCT transport_id)::int AS cnt
             FROM logitrack.transport_zone
             GROUP BY zone_id`,
            { type: QueryTypes.SELECT }
        ),
    ]);

    const shipByZone = new Map(shipmentCounts.map(r => [Number(r.zone_id), r.cnt]));
    const transByZone = new Map(transportCounts.map(r => [Number(r.zone_id), r.cnt]));
    const provName = new Map(provinces.map(p => [Number(p.id), p.description]));

    // Deduplicar por (provincia, nombre): la DB tiene zonas duplicadas
    // (mismo nombre/provincia repetido miles de veces). Colapsamos a una
    // zona lógica para que el mapa no explote aunque la limpieza no se haya
    // corrido. Representante = menor id (igual criterio que cleanup-zones).
    // Conteos de envíos/transportes se SUMAN sobre todas las copias.
    const groups = new Map();
    for (const z of zones) {
        const pid = z.provinceId === null || z.provinceId === undefined ? null : Number(z.provinceId);
        const key = pid + '||' + z.name;
        const ship = shipByZone.get(z.id) || 0;
        const trans = transByZone.get(z.id) || 0;
        const prefixes = Array.isArray(z.postalCodePrefixes) ? z.postalCodePrefixes : [];
        const g = groups.get(key);
        if (!g) {
            groups.set(key, {
                pid, repId: z.id, name: z.name, enabled: z.enabled,
                baseCost: Number(z.baseCost), surchargePerKg: Number(z.surchargePerKg),
                surchargePerM3: Number(z.surchargePerM3),
                prefixes: new Set(prefixes), copies: 1,
                shipmentCount: ship, transportCount: trans,
            });
        } else {
            if (z.id < g.repId) { g.repId = z.id; g.enabled = z.enabled; }
            prefixes.forEach(p => g.prefixes.add(p));
            g.copies += 1;
            g.shipmentCount += ship;
            g.transportCount += trans;
        }
    }

    // Agrupar zonas lógicas por provincia.
    const byProvince = new Map();
    for (const g of groups.values()) {
        if (!byProvince.has(g.pid)) {
            byProvince.set(g.pid, {
                provinceId:   g.pid,
                provinceName: g.pid === null ? 'Sin provincia' : (provName.get(g.pid) || `Provincia ${g.pid}`),
                provinceKey:  g.pid === null ? null : normalize(provName.get(g.pid)),
                zoneCount:    0,
                zones:        [],
            });
        }
        const bucket = byProvince.get(g.pid);
        bucket.zoneCount += 1;
        bucket.zones.push({
            id:             g.repId,
            name:           g.name,
            color:          zoneColor(g.repId),
            enabled:        g.enabled,
            baseCost:       g.baseCost,
            surchargePerKg: g.surchargePerKg,
            surchargePerM3: g.surchargePerM3,
            prefixes:       Array.from(g.prefixes),
            shipmentCount:  g.shipmentCount,
            transportCount: g.transportCount,
            duplicates:     g.copies - 1,
        });
    }

    const result = Array.from(byProvince.values())
        .sort((a, b) => (a.provinceName).localeCompare(b.provinceName, 'es'));
    result.forEach(p => p.zones.sort((a, b) => a.name.localeCompare(b.name, 'es')));

    const maxZoneCount = result.reduce((m, p) => Math.max(m, p.zoneCount), 0);
    const totalDuplicates = result.reduce((s, p) => s + p.zones.reduce((s2, z) => s2 + z.duplicates, 0), 0);
    return { provinces: result, maxZoneCount, totalDuplicates };
};

module.exports = { getProvinceSummary, zoneColor };
