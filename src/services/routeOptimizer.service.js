const { Op } = require('sequelize');
const { Shipment } = require('../models/shipment');
const { Transport } = require('../models/transport');
const { Zone } = require('../models/zone');
const { Address } = require('../models/address');
const { Branch } = require('../models/branch');
const { User } = require('../models/user');
const { Person } = require('../models/person');
const { haversine } = require('../utils/geo');

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

const ROUTABLE_STATUS_IDS = [1, 3, 7]; // Pendiente, En Sucursal, En Preparacion

const loadShipments = (shipmentIds, supervisorBranchId) => {
    return Shipment.findAll({
        where: {
            id:              { [Op.in]: shipmentIds },
            statusId:        { [Op.in]: ROUTABLE_STATUS_IDS },
            currentBranchId: supervisorBranchId,
        },
        include: [
            { model: Address, as: 'address', required: false },
            { model: Zone,    as: 'zone',    required: false },
            { model: Person,  as: 'recipient', required: false },
        ],
    });
};

const loadTransports = (transportIds) => {
    return Transport.findAll({
        where: { id: { [Op.in]: transportIds }, enabled: true },
        include: [
            { model: User, as: 'driver', required: false },
            { model: Zone, as: 'zones',  required: false, through: { attributes: [] } },
        ],
    });
};

const nearestNeighborOrder = (startLat, startLng, points) => {
    const remaining = [...points];
    const ordered = [];
    let curLat = startLat;
    let curLng = startLng;
    while (remaining.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const p = remaining[i];
            const d = haversine(curLat, curLng, p.lat, p.lng);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const next = remaining.splice(bestIdx, 1)[0];
        next.distanceFromPrevKm = Number(bestDist.toFixed(2));
        ordered.push(next);
        curLat = next.lat;
        curLng = next.lng;
    }
    return ordered;
};

const isTransportEligibleForZone = (transport, zoneId) => {
    if (!transport.zones || transport.zones.length === 0) { return true; } // sin restriccion
    if (!zoneId) { return true; } // envio sin zona resuelta -> permite cualquier transporte
    return transport.zones.some(z => z.id === zoneId);
};

const optimizeRoutes = async ({ shipmentIds, transportIds, supervisorBranchId }) => {
    if (!shipmentIds?.length || !transportIds?.length) {
        return { proposals: [], unassigned: [] };
    }

    const branch = await Branch.findByPk(supervisorBranchId);
    if (!branch) {
        return { proposals: [], unassigned: shipmentIds, error: 'supervisor_branch_not_found' };
    }

    const shipments = await loadShipments(shipmentIds, supervisorBranchId);
    const transports = await loadTransports(transportIds);

    // Envios solicitados pero rechazados (otra sucursal, no pendiente, etc.)
    const loadedIds = new Set(shipments.map(s => s.id));
    const rejected = shipmentIds.filter(id => !loadedIds.has(Number(id)));

    // Agrupar por zona (zoneId | null)
    const byZone = new Map();
    for (const s of shipments) {
        const key = s.zoneId || 'null';
        if (!byZone.has(key)) { byZone.set(key, []); }
        byZone.get(key).push(s);
    }

    // Estado por transporte: capacidad usada y envios asignados
    const txState = new Map();
    for (const t of transports) {
        txState.set(t.id, {
            transport: t,
            shipments: [],
            usedWeight: 0,
            usedVolume: 0,
        });
    }

    const unassigned = [...rejected];

    for (const [zoneKey, zoneShipments] of byZone.entries()) {
        const zoneId = zoneKey === 'null' ? null : Number(zoneKey);
        const eligible = transports
            .filter(t => isTransportEligibleForZone(t, zoneId))
            .sort((a, b) => num(a.costPerKm) - num(b.costPerKm) || num(a.fixedCost) - num(b.fixedCost));

        const sorted = [...zoneShipments].sort((a, b) => num(b.weightKg) - num(a.weightKg));

        for (const s of sorted) {
            const w = num(s.weightKg);
            const v = num(s.volumeM3);
            let placed = false;
            for (const t of eligible) {
                const st = txState.get(t.id);
                if (st.usedWeight + w <= num(t.maxWeightKg) &&
                    st.usedVolume + v <= num(t.maxVolumeM3)) {
                    st.shipments.push(s);
                    st.usedWeight += w;
                    st.usedVolume += v;
                    placed = true;
                    break;
                }
            }
            if (!placed) { unassigned.push(s.id); }
        }
    }

    // Construir propuestas con stops ordenados (NN)
    const proposals = [];
    for (const [, st] of txState) {
        if (st.shipments.length === 0) { continue; }
        const t = st.transport;

        // Pickups: agrupar por currentBranchId (en este MVP siempre = branch del supervisor)
        const byBranch = new Map();
        for (const s of st.shipments) {
            const bId = s.currentBranchId || branch.id;
            if (!byBranch.has(bId)) { byBranch.set(bId, []); }
            byBranch.get(bId).push(s);
        }

        const pickupPoints = [];
        for (const [bId, ships] of byBranch.entries()) {
            // Si el pickup es en la branch del supervisor, ya estamos ahi (start point)
            // pero igual lo modelamos como stop para que el repartidor lo vea
            const b = bId === branch.id ? branch : await Branch.findByPk(bId);
            if (!b) { continue; }
            pickupPoints.push({
                stopType: 'pickup',
                branchId: b.id,
                shipmentIds: ships.map(x => x.id),
                lat: num(b.latitude),
                lng: num(b.longitude),
                label: b.name,
            });
        }

        const deliveryPoints = st.shipments
            .filter(s => s.address && s.address.lat && s.address.lng)
            .map(s => ({
                stopType: 'delivery',
                shipmentId: s.id,
                lat: num(s.address.lat),
                lng: num(s.address.lng),
                label: `${s.trackingId} - ${s.recipient?.fullName || ''}`,
            }));

        // Pickups primero (NN desde la sucursal del supervisor), luego deliveries (NN desde el ultimo pickup)
        const orderedPickups = nearestNeighborOrder(num(branch.latitude), num(branch.longitude), pickupPoints);
        const lastPickup = orderedPickups[orderedPickups.length - 1] || { lat: num(branch.latitude), lng: num(branch.longitude) };
        const orderedDeliveries = nearestNeighborOrder(lastPickup.lat, lastPickup.lng, deliveryPoints);

        const stops = [...orderedPickups, ...orderedDeliveries].map((stop, i) => ({
            ...stop, sequence: i + 1,
        }));

        const totalDistanceKm = stops.reduce((acc, s) => acc + num(s.distanceFromPrevKm), 0);
        const zoneCostSum = st.shipments.reduce((acc, s) => acc + num(s.zone?.baseCost), 0);
        const totalCost = num(t.fixedCost) + num(t.costPerKm) * totalDistanceKm + zoneCostSum;

        proposals.push({
            transportId: t.id,
            transport: {
                id: t.id, name: t.name, plate: t.plate,
                maxWeightKg: num(t.maxWeightKg), maxVolumeM3: num(t.maxVolumeM3),
                fixedCost: num(t.fixedCost), costPerKm: num(t.costPerKm),
                driver: t.driver ? { id: t.driver.id, fullName: t.driver.fullName } : null,
            },
            stops,
            totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
            totalCost: Number(totalCost.toFixed(2)),
            totalWeightKg: Number(st.usedWeight.toFixed(2)),
            totalVolumeM3: Number(st.usedVolume.toFixed(3)),
            utilizationWeight: num(t.maxWeightKg) > 0 ? Number((st.usedWeight / num(t.maxWeightKg)).toFixed(3)) : 0,
            utilizationVolume: num(t.maxVolumeM3) > 0 ? Number((st.usedVolume / num(t.maxVolumeM3)).toFixed(3)) : 0,
            shipmentIds: st.shipments.map(s => s.id),
        });
    }

    return { proposals, unassigned };
};

module.exports = { optimizeRoutes };
