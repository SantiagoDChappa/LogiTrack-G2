const { Op } = require('sequelize');
const { Shipment } = require('../models/shipment');
const { Transport } = require('../models/transport');
const { Zone } = require('../models/zone');
const { Address } = require('../models/address');
const { Province } = require('../models/province');
const { Branch } = require('../models/branch');
const { User } = require('../models/user');
const { Person } = require('../models/person');
const { distanceMatrixKm, routeViaRoads, haversineKm } = require('../utils/roadRouter');

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

const ROUTABLE_STATUS_IDS = [1, 3, 7];

// Parametros operativos
const SHIFT_START_HOUR = 9;        // arranque turno
const SHIFT_MAX_HOURS  = 8;        // turno conductor
const SERVICE_MIN_PER_STOP = 10;   // tiempo entrega por parada
const SERVICE_STOP_MIN = 30;       // tiempo extra en parada de servicio (combustible + descanso)
const SHIFT_MAX_SEC = SHIFT_MAX_HOURS * 3600;

// Prioridades: 1=normal, 2=express, 3=urgent
const PRIORITY_LABEL = { 1: 'normal', 2: 'express', 3: 'urgent' };
const PRIORITY_WEIGHT = { 1: 0, 2: 1000, 3: 100000 }; // urgent obliga vehiculo dedicado

// Parsea TIME 'HH:MM:SS' a segundos desde 00:00
const parseTimeToSec = (t) => {
    if (!t) { return null; }
    const [h, m, s] = String(t).split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

// Clasifica transporte por capacidad y asigna rango maximo razonable.
// Evita usar moto en viajes interprovinciales largos.
const classifyTransport = (t) => {
    const w = num(t.maxWeightKg);
    if (w <= 50)   { return { type: 'moto',         maxRangeKm: 50  }; }
    if (w <= 1000) { return { type: 'van',          maxRangeKm: 300 }; }
    if (w <= 2000) { return { type: 'camion-chico', maxRangeKm: 600 }; }
    return           { type: 'camion-grande', maxRangeKm: Infinity };
};

// Margen de seguridad: paramos a recargar al 85% de la autonomia para evitar quedar varados
const AUTONOMY_SAFETY = 0.85;
// Radio maximo razonable para desvio a sucursal de servicio (km)
const SERVICE_DETOUR_MAX_KM = 80;
// Pickup oportunista: detour maximo aceptable para recoger envios en sucursales del corredor
const OPPORTUNISTIC_DETOUR_MAX_KM = 60;

// Encuentra la mejor sucursal de servicio entre A y B:
// - alcanzable desde A con la autonomia restante (haversine(A,C) <= reachKm)
// - minimiza detour total: d(A,C) + d(C,B) - d(A,B)
// excludeIds: sucursales a no considerar (ej. la de origen, o ya usadas)
const findBestServiceBranch = (a, b, branches, reachKm, excludeIds = new Set()) => {
    const dAB = haversineKm(a, b);
    let best = null;
    let bestDetour = Infinity;
    for (const br of branches) {
        if (excludeIds.has(br.id)) { continue; }
        const lat = num(br.latitude);
        const lng = num(br.longitude);
        if (!lat || !lng) { continue; }
        if (br.closed) { continue; }
        const c = { lat, lng };
        const dAC = haversineKm(a, c);
        if (dAC > reachKm) { continue; }                    // no llego con tanque actual
        const dCB = haversineKm(c, b);
        const detour = dAC + dCB - dAB;
        if (detour > SERVICE_DETOUR_MAX_KM) { continue; }   // desvio excesivo
        if (detour < bestDetour) { bestDetour = detour; best = br; }
    }
    return best ? { branch: best, detourKm: bestDetour } : null;
};

// Distancia maxima de la sucursal a cualquier entrega del cluster (haversine, suficiente para filtro)
const clusterMaxDistanceKm = (branch, cluster) => {
    let max = 0;
    for (const s of cluster.shipments) {
        const lat = num(s.address?.lat);
        const lng = num(s.address?.lng);
        if (!lat || !lng) { continue; }
        const d = haversineKm({ lat: num(branch.latitude), lng: num(branch.longitude) }, { lat, lng });
        if (d > max) { max = d; }
    }
    return max;
};

const loadShipments = (shipmentIds, supervisorBranchId) => {
    return Shipment.findAll({
        where: {
            id:              { [Op.in]: shipmentIds },
            statusId:        { [Op.in]: ROUTABLE_STATUS_IDS },
            currentBranchId: supervisorBranchId,
        },
        include: [
            { model: Address, as: 'address', required: false, include: [{ model: Province, as: 'province', required: false }] },
            { model: Zone,    as: 'zone',      required: false },
            { model: Person,  as: 'recipient', required: false },
        ],
    });
};

const loadEnabledTransportsForBranch = (branchId) => {
    return Transport.findAll({
        where: { enabled: true, branchId },
        include: [
            { model: User, as: 'driver', required: false },
            { model: Zone, as: 'zones',  required: false, through: { attributes: [] } },
        ],
    });
};

const isTransportEligibleForZone = (transport, zoneId) => {
    if (!transport.zones || transport.zones.length === 0) { return true; }
    if (!zoneId) { return true; }
    return transport.zones.some(z => z.id === zoneId);
};

// nearest-neighbor inline en buildProposal (soporta startIdx variable por pickups oportunistas)

// Agrupa envios por provincia destino
const clusterByProvince = (shipments) => {
    const map = new Map();
    for (const s of shipments) {
        const key = s.address?.provinceId || 0;
        if (!map.has(key)) {
            map.set(key, {
                provinceId: key,
                provinceName: s.address?.province?.description || 'Sin provincia',
                shipments: [],
                totalWeight: 0,
                totalVolume: 0,
            });
        }
        const g = map.get(key);
        g.shipments.push(s);
        g.totalWeight += num(s.weightKg);
        g.totalVolume += num(s.volumeM3);
    }
    return [...map.values()];
};

// Asigna 1 cluster -> 1+ transportes. Greedy: transporte mas barato que entre el cluster entero;
// si no entra, parte el cluster y usa multiples.
const assignClusterToTransports = (cluster, availableTx, distKm) => {
    const sortedShipments = [...cluster.shipments].sort((a, b) => num(b.weightKg) - num(a.weightKg));
    // Filtra transportes elegibles para alguna zona del cluster (al menos uno)
    const zoneIds = [...new Set(cluster.shipments.map(s => s.zoneId).filter(Boolean))];
    const candidates = availableTx
        .filter(t => zoneIds.length === 0 || !t.zones?.length || zoneIds.some(z => t.zones.some(tz => tz.id === z)))
        .filter(t => classifyTransport(t).maxRangeKm >= distKm)
        .sort((a, b) => (num(a.fixedCost) + num(a.costPerKm)) - (num(b.fixedCost) + num(b.costPerKm)));

    if (candidates.length === 0) {
        return { buckets: [], unassigned: sortedShipments.map(s => ({ id: s.id, trackingId: s.trackingId, code: 'no_fit', reason: `No hay transporte habilitado para cubrir ${distKm.toFixed(0)}km hacia ${cluster.provinceName}. Rangos máx: moto 50km, van 300km, camión chico 600km, camión grande ilimitado. Agregar un vehículo con mayor rango a la sucursal o verificar zonas habilitadas.` })) };
    }

    const buckets = [];
    const unassigned = [];
    const used = new Set();

    // Urgent (priority=3) primero, despues express (2), normal (1)
    sortedShipments.sort((a, b) => (b.priority || 1) - (a.priority || 1) || num(b.weightKg) - num(a.weightKg));

    for (const s of sortedShipments) {
        const w = num(s.weightKg);
        const v = num(s.volumeM3);
        const isUrgent = (s.priority || 1) === 3;
        let placed = false;

        // urgent NUNCA se mezcla en bucket existente -> vehiculo dedicado
        if (!isUrgent) {
            for (const b of buckets) {
                if (b.dedicated) { continue; }
                if (!isTransportEligibleForZone(b.transport, s.zoneId)) { continue; }
                if (b.usedWeight + w > num(b.transport.maxWeightKg)) { continue; }
                if (b.usedVolume + v > num(b.transport.maxVolumeM3)) { continue; }
                b.shipments.push(s);
                b.usedWeight += w;
                b.usedVolume += v;
                placed = true;
                break;
            }
            if (placed) { continue; }
        }

        // abrir bucket nuevo con transporte mas barato no usado
        const t = candidates.find(c => !used.has(c.id) && isTransportEligibleForZone(c, s.zoneId) && w <= num(c.maxWeightKg) && v <= num(c.maxVolumeM3));
        if (t) {
            used.add(t.id);
            buckets.push({
                transport: t,
                shipments: [s],
                usedWeight: w,
                usedVolume: v,
                dedicated: isUrgent,
            });
        } else {
            unassigned.push({ id: s.id, trackingId: s.trackingId, code: 'no_fit', reason: `Ningún transporte puede cargar este envío (${w}kg / ${v}m³) hacia ${cluster.provinceName}. Todos los vehículos disponibles están llenos o son incompatibles. Agregar otro transporte a la sucursal o reducir la carga.` });
        }
    }

    return { buckets, unassigned };
};

// ===== Fase 2: pickup oportunista =====
// Busca envios pendientes en sucursales del corredor origen->destinos del cluster
// que entren en la capacidad libre del bucket. Mismo cluster.provinceId.
// Filtra envios ya asignados a rutas activas.
const enrichBucketWithOpportunisticPickups = async ({ bucket, branch, cluster }) => {
    if (!cluster.provinceId) { return; }
    const t = bucket.transport;
    const capWeightLeft = num(t.maxWeightKg) - bucket.usedWeight;
    const capVolumeLeft = num(t.maxVolumeM3) - bucket.usedVolume;
    if (capWeightLeft <= 0 || capVolumeLeft <= 0) { return; }

    const origin = { lat: num(branch.latitude), lng: num(branch.longitude) };
    const dests = bucket.shipments
        .filter(s => s.address?.lat && s.address?.lng)
        .map(s => ({ lat: num(s.address.lat), lng: num(s.address.lng) }));
    if (dests.length === 0) { return; }
    const centroid = {
        lat: dests.reduce((a, p) => a + p.lat, 0) / dests.length,
        lng: dests.reduce((a, p) => a + p.lng, 0) / dests.length,
    };
    const baseDist = haversineKm(origin, centroid);

    const allBranches = await Branch.findAll({ where: { closed: false, id: { [Op.ne]: branch.id } } });
    const corridorBranchIds = [];
    const corridorDetourByBranch = new Map(); // branchId -> { detourKm, dOrigin, dToCentroid }
    for (const b of allBranches) {
        const lat = num(b.latitude), lng = num(b.longitude);
        if (!lat || !lng) { continue; }
        const dOrigin = haversineKm(origin, { lat, lng });
        const dToCentroid = haversineKm({ lat, lng }, centroid);
        const detour = dOrigin + dToCentroid - baseDist;
        if (detour <= OPPORTUNISTIC_DETOUR_MAX_KM) {
            corridorBranchIds.push(b.id);
            corridorDetourByBranch.set(b.id, { detourKm: detour, dOrigin, dToCentroid });
        }
    }
    if (corridorBranchIds.length === 0) { return; }

    const candidates = await Shipment.findAll({
        where: {
            statusId: { [Op.in]: ROUTABLE_STATUS_IDS },
            currentBranchId: { [Op.in]: corridorBranchIds },
            id: { [Op.notIn]: bucket.shipments.map(s => s.id) },
        },
        include: [
            { model: Address, as: 'address', required: false, include: [{ model: Province, as: 'province' }] },
            { model: Zone, as: 'zone', required: false },
            { model: Person, as: 'recipient', required: false },
        ],
    });
    if (candidates.length === 0) { return; }

    // Excluir los ya asignados a una ruta activa
    const RouteStop = require('../models/routeStop').RouteStop;
    const routeModel = require('../models/route');
    const blocked = await RouteStop.findAll({
        where: { shipmentId: { [Op.in]: candidates.map(s => s.id) }, stopType: 'delivery' },
        include: [{ model: routeModel.Route, as: 'route', where: { statusId: { [Op.in]: [routeModel.RouteStatus.PLANNED, routeModel.RouteStatus.IN_ROUTE] } }, required: true }],
    }).catch(() => []);
    const blockedIds = new Set(blocked.map(rs => rs.shipmentId));

    const fits = candidates
        .filter(s => !blockedIds.has(s.id))
        .filter(s => s.address?.provinceId === cluster.provinceId)
        .filter(s => s.address?.lat && s.address?.lng)
        .filter(s => isTransportEligibleForZone(t, s.zoneId))
        .sort((a, b) => (b.priority || 1) - (a.priority || 1) || num(a.weightKg) - num(b.weightKg));

    let usedW = 0, usedV = 0;
    const added = [];
    const pickupsByBranch = new Map();
    const branchById = new Map(allBranches.map(b => [b.id, b]));
    for (const s of fits) {
        const w = num(s.weightKg), v = num(s.volumeM3);
        if (usedW + w > capWeightLeft || usedV + v > capVolumeLeft) { continue; }
        usedW += w; usedV += v;

        // Cost-benefit per shipment: comparar ir directo origen->destino vs via sucursal pickup
        const br = branchById.get(s.currentBranchId);
        const brPoint = br ? { lat: num(br.latitude), lng: num(br.longitude) } : null;
        const destPoint = { lat: num(s.address.lat), lng: num(s.address.lng) };
        const directKm = haversineKm(origin, destPoint);
        const viaKm = brPoint ? haversineKm(origin, brPoint) + haversineKm(brPoint, destPoint) : directKm;
        const extraKm = viaKm - directKm;
        const pctExtra = directKm > 0 ? (extraKm / directKm) * 100 : 0;
        const corridorInfo = corridorDetourByBranch.get(s.currentBranchId) || {};
        s._opportunisticInfo = {
            branchId: s.currentBranchId,
            branchName: br ? br.name : `Sucursal #${s.currentBranchId}`,
            directKm: Number(directKm.toFixed(1)),
            viaBranchKm: Number(viaKm.toFixed(1)),
            extraKm: Number(extraKm.toFixed(1)),
            pctExtra: Number(pctExtra.toFixed(1)),
            corridorDetourKm: Number((corridorInfo.detourKm || 0).toFixed(1)),
            costPerKm: num(t.costPerKm),
            extraCost: Number((extraKm * num(t.costPerKm)).toFixed(2)),
            capWeightBefore: capWeightLeft,
            capVolumeBefore: capVolumeLeft,
        };

        added.push(s);
        const arr = pickupsByBranch.get(s.currentBranchId) || [];
        arr.push(s);
        pickupsByBranch.set(s.currentBranchId, arr);
    }
    if (added.length === 0) { return; }

    bucket.shipments.push(...added);
    bucket.usedWeight += usedW;
    bucket.usedVolume += usedV;
    bucket.opportunisticPickups = pickupsByBranch;
    bucket.opportunisticBranches = new Map(allBranches.filter(b => pickupsByBranch.has(b.id)).map(b => [b.id, b]));
    bucket.opportunisticBranchInfo = corridorDetourByBranch; // para reasoning a nivel ruta
};

const buildProposal = async ({ bucket, branch, cluster }) => {
    const t = bucket.transport;
    const branchPoint = { lat: num(branch.latitude), lng: num(branch.longitude) };
    const deliveryPoints = bucket.shipments
        .filter(s => s.address && s.address.lat && s.address.lng)
        .map(s => ({
            stopType: 'delivery',
            shipmentId: s.id,
            lat: num(s.address.lat),
            lng: num(s.address.lng),
            label: `${s.trackingId} - ${s.recipient?.fullName || ''}`,
            priority: s.priority || 1,
            priorityLabel: PRIORITY_LABEL[Number(s.priority) || 1] ?? 'normal',
            windowFromSec: parseTimeToSec(s.expectedDeliveryFrom),
            windowToSec:   parseTimeToSec(s.expectedDeliveryTo),
        }));

    // Pickups oportunistas (Fase 2): cada sucursal del corredor con envios cargados aporta una parada extra
    const opportunisticPickupPoints = [];
    if (bucket.opportunisticBranches && bucket.opportunisticPickups) {
        const arr = [];
        for (const [bid, br] of bucket.opportunisticBranches.entries()) {
            const ships = bucket.opportunisticPickups.get(bid) || [];
            arr.push({
                stopType: 'pickup',
                branchId: br.id,
                shipmentIds: ships.map(s => s.id),
                lat: num(br.latitude),
                lng: num(br.longitude),
                label: `${br.name} (recogida adicional ${ships.length} envío${ships.length > 1 ? 's' : ''})`,
                opportunistic: true,
            });
        }
        arr.sort((a, b) => haversineKm(branchPoint, a) - haversineKm(branchPoint, b));
        opportunisticPickupPoints.push(...arr);
    }

    const allPts = [branchPoint, ...opportunisticPickupPoints, ...deliveryPoints];
    const matrix = await distanceMatrixKm(allPts);
    const oppCount = opportunisticPickupPoints.length;
    const deliveryGlobalIdxs = deliveryPoints.map((_, i) => 1 + oppCount + i);

    // Distancia encadenada para pickups oportunistas: origen -> p1 -> p2 ...
    let prevIdx = 0;
    for (let i = 0; i < oppCount; i++) {
        const gi = i + 1;
        opportunisticPickupPoints[i].distanceFromPrevKm = Number(matrix[prevIdx][gi].toFixed(2));
        prevIdx = gi;
    }

    // Nearest-neighbor de deliveries arrancando desde el ultimo pickup (origen si oppCount=0)
    const remaining = deliveryGlobalIdxs.map((gi, k) => ({ gi, p: deliveryPoints[k] }));
    const ordered = [];
    let cur = oppCount;
    while (remaining.length > 0) {
        let bestK = 0;
        let bestScore = Infinity;
        for (let k = 0; k < remaining.length; k++) {
            const d = matrix[cur][remaining[k].gi];
            const pr = remaining[k].p.priority || 1;
            const priBonus = -(PRIORITY_WEIGHT[pr] || 0);
            const winSec = remaining[k].p.windowToSec;
            const winBonus = winSec ? -Math.max(0, (18 * 3600 - winSec)) / 100 : 0;
            const score = d + priBonus + winBonus;
            if (score < bestScore) { bestScore = score; bestK = k; }
        }
        const next = remaining.splice(bestK, 1)[0];
        next.p.distanceFromPrevKm = Number(matrix[cur][next.gi].toFixed(2));
        ordered.push(next.p);
        cur = next.gi;
    }

    const opportunisticIds = new Set(opportunisticPickupPoints.flatMap(p => p.shipmentIds));
    const originShipmentIds = bucket.shipments.filter(s => !opportunisticIds.has(s.id)).map(s => s.id);

    const pickup = {
        stopType: 'pickup',
        branchId: branch.id,
        shipmentIds: originShipmentIds,
        lat: branchPoint.lat,
        lng: branchPoint.lng,
        label: branch.name.startsWith('Sucursal') ? branch.name : `Sucursal ${branch.name}`,
        distanceFromPrevKm: 0,
    };

    let stops = [pickup, ...opportunisticPickupPoints, ...ordered].map((s, i) => ({ ...s, sequence: i + 1 }));
    let routePoints = stops.map(s => ({ lat: s.lat, lng: s.lng }));
    let road = await routeViaRoads(routePoints);

    // ===== Paradas de servicio por autonomia (combustible + descanso + futuro pickup) =====
    const autonomyKm = num(t.autonomyKm);
    const serviceWarnings = [];
    if (autonomyKm > 0) {
        const reachKm = autonomyKm * AUTONOMY_SAFETY;
        const candidateBranches = await Branch.findAll({ where: { closed: false } });
        const usedServiceIds = new Set([branch.id]);
        const insertions = [];
        let acumKm = 0;

        for (let i = 1; i < stops.length; i++) {
            const legKm = road.legDistancesKm[i - 1] ?? haversineKm(routePoints[i - 1], routePoints[i]);
            if (acumKm + legKm > reachKm) {
                const a = { lat: stops[i - 1].lat, lng: stops[i - 1].lng };
                const b = { lat: stops[i].lat, lng: stops[i].lng };
                const remaining = Math.max(0, reachKm - acumKm);
                const found = findBestServiceBranch(a, b, candidateBranches, remaining, usedServiceIds);
                if (found) {
                    insertions.push({ atIndex: i, branch: found.branch, detourKm: found.detourKm });
                    usedServiceIds.add(found.branch.id);
                    acumKm = haversineKm({ lat: num(found.branch.latitude), lng: num(found.branch.longitude) }, b);
                } else {
                    serviceWarnings.push(`Tramo ${stops[i - 1].label} → ${stops[i].label} (${legKm.toFixed(0)}km) excede autonomia de ${autonomyKm}km y no hay sucursal alcanzable en el camino.`);
                    acumKm += legKm;
                }
            } else {
                acumKm += legKm;
            }
        }

        if (insertions.length > 0) {
            const newStops = [...stops];
            for (let k = insertions.length - 1; k >= 0; k--) {
                const ins = insertions[k];
                newStops.splice(ins.atIndex, 0, {
                    stopType: 'service',
                    branchId: ins.branch.id,
                    lat: num(ins.branch.latitude),
                    lng: num(ins.branch.longitude),
                    label: `${ins.branch.name} (combustible/descanso)`,
                    detourKm: Number(ins.detourKm.toFixed(2)),
                });
            }
            stops = newStops.map((s, i) => ({ ...s, sequence: i + 1 }));
            routePoints = stops.map(s => ({ lat: s.lat, lng: s.lng }));
            road = await routeViaRoads(routePoints);
        }
    }

    // ETA por stop: arrancamos turno a SHIFT_START_HOUR del dia siguiente al departure
    const departure = new Date();
    departure.setDate(departure.getDate() + 1);
    departure.setHours(SHIFT_START_HOUR, 0, 0, 0);
    let cumSec = 0;
    stops[0].etaIso = departure.toISOString();
    const windowViolations = [];
    for (let i = 1; i < stops.length; i++) {
        const legSec = road.legDurationsSec?.[i - 1] ?? ((road.legDistancesKm[i - 1] ?? haversineKm(routePoints[i - 1], routePoints[i])) / 55) * 3600;
        const stopMin = stops[i].stopType === 'service' ? SERVICE_STOP_MIN : SERVICE_MIN_PER_STOP;
        cumSec += legSec + stopMin * 60;
        stops[i].distanceFromPrevKm = Number((road.legDistancesKm[i - 1] ?? haversineKm(routePoints[i - 1], routePoints[i])).toFixed(2));
        stops[i].legMinutes = Number((legSec / 60).toFixed(1));
        const eta = new Date(departure.getTime() + cumSec * 1000);
        stops[i].etaIso = eta.toISOString();
        // Check ventana
        const stop = stops[i];
        if (stop.windowToSec) {
            const etaSecOfDay = eta.getHours() * 3600 + eta.getMinutes() * 60;
            if (etaSecOfDay > stop.windowToSec) {
                stop.windowViolation = true;
                const lateMin = Math.round((etaSecOfDay - stop.windowToSec) / 60);
                windowViolations.push(`${stop.label}: ETA ${eta.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})} excede ventana (cierra ${Math.floor(stop.windowToSec/3600).toString().padStart(2,'0')}:${Math.floor((stop.windowToSec%3600)/60).toString().padStart(2,'0')}) por ${lateMin} min`);
            }
        }
    }

    const totalDistanceKm = road.totalKm;
    const totalDurationSec = road.totalDurationSec ?? 0;
    const serviceStopsCount = stops.filter(s => s.stopType === 'service').length;
    const deliveryAndPickupCount = Math.max(0, stops.length - 1 - serviceStopsCount);
    const totalRideSec = totalDurationSec + deliveryAndPickupCount * SERVICE_MIN_PER_STOP * 60 + serviceStopsCount * SERVICE_STOP_MIN * 60;
    const exceedsShift = totalRideSec > SHIFT_MAX_SEC;
    const zoneCostSum = bucket.shipments.reduce((acc, s) => acc + num(s.zone?.baseCost), 0);
    const weightSurcharge = bucket.shipments.reduce((acc, s) => acc + num(s.zone?.surchargePerKg) * num(s.weightKg), 0);
    const volumeSurcharge = bucket.shipments.reduce((acc, s) => acc + num(s.zone?.surchargePerM3) * num(s.volumeM3), 0);
    const fuelMultiplier = Number(globalThis.__fuelMultiplier ?? 1);
    const kmCost = num(t.costPerKm) * totalDistanceKm * fuelMultiplier;
    const totalCost = num(t.fixedCost) + kmCost + zoneCostSum + weightSurcharge + volumeSurcharge;

    const cls = classifyTransport(t);
    const distInfo = cluster.maxDistanceKm !== null && cluster.maxDistanceKm !== undefined ? ` Distancia max al cluster: ${cluster.maxDistanceKm.toFixed(0)}km (rango ${cls.type}: ${cls.maxRangeKm === Infinity ? 'sin limite' : cls.maxRangeKm + 'km'}).` : '';
    const oppCountFinal = bucket.opportunisticPickups ? [...bucket.opportunisticPickups.values()].reduce((a, arr) => a + arr.length, 0) : 0;
    let opportunisticSummary = null;
    let oppInfo = '';
    if (oppCountFinal > 0) {
        const oppShips = bucket.shipments.filter(s => s._opportunisticInfo);
        const totalExtraKm = oppShips.reduce((a, s) => a + (s._opportunisticInfo?.extraKm || 0), 0);
        const avgExtraKm = totalExtraKm / oppShips.length;
        const avgPctExtra = oppShips.reduce((a, s) => a + (s._opportunisticInfo?.pctExtra || 0), 0) / oppShips.length;
        const totalExtraCost = totalExtraKm * num(t.costPerKm);
        const oppWeight = oppShips.reduce((a, s) => a + num(s.weightKg), 0);
        const oppVolume = oppShips.reduce((a, s) => a + num(s.volumeM3), 0);
        const branchNames = [...bucket.opportunisticBranches.values()].map(b => b.name).join(', ');
        oppInfo = ` Recogida adicional: ${oppCountFinal} envío${oppCountFinal > 1 ? 's' : ''} en ${bucket.opportunisticPickups.size} sucursal${bucket.opportunisticPickups.size > 1 ? 'es' : ''} del corredor (${branchNames}). Desvio promedio +${avgExtraKm.toFixed(1)}km (+${avgPctExtra.toFixed(1)}%), costo extra ~$${totalExtraCost.toFixed(0)}. Vs lanzar 1 ruta extra: ahorra costo fijo de transporte ($${num(t.fixedCost)}) + segundo conductor.`;
        opportunisticSummary = {
            count: oppCountFinal,
            branchCount: bucket.opportunisticPickups.size,
            branchNames: [...bucket.opportunisticBranches.values()].map(b => ({ id: b.id, name: b.name })),
            totalExtraKm: Number(totalExtraKm.toFixed(1)),
            avgExtraKm: Number(avgExtraKm.toFixed(1)),
            avgPctExtra: Number(avgPctExtra.toFixed(1)),
            totalExtraCost: Number(totalExtraCost.toFixed(2)),
            savedFixedCost: num(t.fixedCost),
            opportunisticWeightKg: Number(oppWeight.toFixed(2)),
            opportunisticVolumeM3: Number(oppVolume.toFixed(3)),
        };
    }
    const autonomyInfo = num(t.autonomyKm) > 0 ? ` Autonomia ${num(t.autonomyKm)}km.` : '';
    const transportPickReason = `Cluster destino: ${cluster.provinceName}. Elegido ${t.name} (${cls.type}) por menor costo unitario habilitado dentro del rango (fijo $${num(t.fixedCost)} + $${num(t.costPerKm)}/km). Capacidad ${num(t.maxWeightKg)}kg / ${num(t.maxVolumeM3)}m³. Zonas: ${t.zones?.length ? t.zones.map(z => z.name).join(', ') : 'todas'}.${distInfo}${autonomyInfo}${oppInfo}`;

    const reasons = bucket.shipments.map(s => {
        const pri = PRIORITY_LABEL[Number(s.priority) || 1] ?? 'normal';
        const win = (s.expectedDeliveryFrom && s.expectedDeliveryTo) ? ` Ventana ${s.expectedDeliveryFrom.slice(0,5)}-${s.expectedDeliveryTo.slice(0,5)}.` : '';
        const priText = pri !== 'normal' ? ` Prioridad ${pri.toUpperCase()}.` : '';
        const isOpportunistic = s.currentBranchId !== branch.id;
        let oppText = '';
        let oppDetail = null;
        if (isOpportunistic && s._opportunisticInfo) {
            const oi = s._opportunisticInfo;
            const verdict = oi.pctExtra <= 5
                ? 'desvio despreciable'
                : (oi.pctExtra <= 15 ? 'desvio moderado, vale la pena' : 'desvio alto pero aceptable');
            oppText = ` Recogida oportunista en ${oi.branchName}: ir directo desde ${branch.name} al destino son ${oi.directKm}km; pasando por ${oi.branchName} son ${oi.viaBranchKm}km (+${oi.extraKm}km, +${oi.pctExtra}%). ${verdict}. Costo extra estimado: $${oi.extraCost} (${oi.costPerKm} $/km × ${oi.extraKm}km). Aprovecha capacidad libre del transporte (quedaban ${oi.capWeightBefore.toFixed(0)}kg / ${oi.capVolumeBefore.toFixed(2)}m³ disponibles).`;
            oppDetail = oi;
        }
        return {
            shipmentId: s.id,
            trackingId: s.trackingId,
            priority: pri,
            provinceName: s.address?.province?.description || cluster.provinceName,
            zoneName: s.zone?.name || null,
            recipientName: s.recipient?.fullName || null,
            addressStreet: s.address?.street || null,
            addressNumber: s.address?.number || null,
            postalCode: s.address?.postalCode || null,
            weightKg: num(s.weightKg),
            volumeM3: num(s.volumeM3),
            packageQty: s.packageQty || null,
            windowFrom: s.expectedDeliveryFrom ? String(s.expectedDeliveryFrom).slice(0,5) : null,
            windowTo: s.expectedDeliveryTo ? String(s.expectedDeliveryTo).slice(0,5) : null,
            expectedDeliveryDate: s.expectedDeliveryDate || null,
            opportunistic: isOpportunistic,
            opportunisticDetail: oppDetail,
            why: `Destino ${cluster.provinceName} (zona ${s.zone?.name || 's/zona'}). Peso ${num(s.weightKg)}kg, vol ${num(s.volumeM3)}m³. Cabe en ${t.name}.${priText}${win}${oppText}`,
        };
    });

    return {
        transportId: t.id,
        clusterProvinceId: cluster.provinceId,
        clusterProvinceName: cluster.provinceName,
        transport: {
            id: t.id, name: t.name, plate: t.plate,
            maxWeightKg: num(t.maxWeightKg), maxVolumeM3: num(t.maxVolumeM3),
            fixedCost: num(t.fixedCost), costPerKm: num(t.costPerKm),
            driver: t.driver ? { id: t.driver.id, fullName: t.driver.fullName } : null,
        },
        stops,
        geometry: road.geometry,
        distanceSource: road.source,
        totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
        totalDurationMin: Number((totalRideSec / 60).toFixed(0)),
        exceedsShift,
        warnings: [
            ...(exceedsShift ? [`Excede turno conductor de ${SHIFT_MAX_HOURS}h (estimado ${(totalRideSec/3600).toFixed(1)}h). Considerar dividir la ruta o conductor adicional.`] : []),
            ...windowViolations.map(w => `Ventana fuera de tiempo: ${w}`),
            ...serviceWarnings,
        ],
        totalCost: Number(totalCost.toFixed(2)),
        costBreakdown: {
            fixed: num(t.fixedCost),
            perKm: Number(kmCost.toFixed(2)),
            zoneBase: Number(zoneCostSum.toFixed(2)),
            weightSurcharge: Number(weightSurcharge.toFixed(2)),
            volumeSurcharge: Number(volumeSurcharge.toFixed(2)),
            fuelMultiplier,
        },
        totalWeightKg: Number(bucket.usedWeight.toFixed(2)),
        totalVolumeM3: Number(bucket.usedVolume.toFixed(3)),
        utilizationWeight: num(t.maxWeightKg) > 0 ? Number((bucket.usedWeight / num(t.maxWeightKg)).toFixed(3)) : 0,
        utilizationVolume: num(t.maxVolumeM3) > 0 ? Number((bucket.usedVolume / num(t.maxVolumeM3)).toFixed(3)) : 0,
        shipmentIds: bucket.shipments.map(s => s.id),
        opportunisticSummary,
        reasoning: {
            transportPick: transportPickReason,
            ordering: 'Paradas ordenadas por nearest-neighbor con distancia por calles (OSRM) y fallback haversine.',
            shipments: reasons,
        },
    };
};

// Modo manual: respeta assignments [{transportId, shipmentIds}], valida capacidad/zona/rango.
// Devuelve mismas propuestas + summary.
const optimizeManual = async ({ assignments, supervisorBranchId }) => {
    await loadFuelMultiplier();
    const branch = await Branch.findByPk(supervisorBranchId);
    if (!branch) { return { proposals: [], unassigned: [], rejected: [], error: 'supervisor_branch_not_found' }; }

    const allShipmentIds = assignments.flatMap(a => a.shipmentIds || []);
    const allTxIds = assignments.map(a => a.transportId);
    const [shipments, transports] = await Promise.all([
        Shipment.findAll({
            where: { id: { [Op.in]: allShipmentIds } }, // sin filtro de branch: permite envíos oportunistas de otras sucursales
            include: [
                { model: Address, as: 'address', required: false, include: [{ model: Province, as: 'province', required: false }] },
                { model: Zone, as: 'zone', required: false },
                { model: Person, as: 'recipient', required: false },
            ],
        }),
        Transport.findAll({
            where: { id: { [Op.in]: allTxIds }, enabled: true, branchId: supervisorBranchId },
            include: [
                { model: User, as: 'driver', required: false },
                { model: Zone, as: 'zones', required: false, through: { attributes: [] } },
            ],
        }),
    ]);

    const txById = new Map(transports.map(t => [t.id, t]));
    const shipById = new Map(shipments.map(s => [s.id, s]));

    const proposals = [];
    const unassigned = [];
    let demandWeight = 0, demandVolume = 0;

    for (const a of assignments) {
        const t = txById.get(a.transportId);
        if (!t) {
            for (const sid of a.shipmentIds || []) {
                unassigned.push({ id: sid, code: 'tx_invalid', reason: `Transporte #${a.transportId} no disponible` });
            }
            continue;
        }
        const ships = (a.shipmentIds || []).map(sid => shipById.get(sid)).filter(Boolean);
        if (ships.length === 0) { continue; }

        let usedW = 0, usedV = 0;
        const ok = [];
        for (const s of ships) {
            const w = num(s.weightKg);
            const v = num(s.volumeM3);
            if (!isTransportEligibleForZone(t, s.zoneId)) {
                unassigned.push({ id: s.id, trackingId: s.trackingId, code: 'zone', reason: `Zona ${s.zone?.name || ''} no compatible con ${t.name}` });
                continue;
            }
            if (usedW + w > num(t.maxWeightKg)) {
                unassigned.push({ id: s.id, trackingId: s.trackingId, code: 'capacity', reason: `Excede capacidad peso de ${t.name} (${num(t.maxWeightKg)}kg)` });
                continue;
            }
            if (usedV + v > num(t.maxVolumeM3)) {
                unassigned.push({ id: s.id, trackingId: s.trackingId, code: 'capacity', reason: `Excede capacidad volumen de ${t.name} (${num(t.maxVolumeM3)}m³)` });
                continue;
            }
            ok.push(s);
            usedW += w; usedV += v;
            demandWeight += w; demandVolume += v;
        }
        if (ok.length === 0) { continue; }

        // Cluster con la primera provincia mayoritaria
        const provCount = new Map();
        for (const s of ok) {
            const k = s.address?.provinceId || 0;
            provCount.set(k, (provCount.get(k) || 0) + 1);
        }
        const [topProv] = [...provCount.entries()].sort((x, y) => y[1] - x[1]);
        const provName = ok.find(s => s.address?.provinceId === topProv[0])?.address?.province?.description || 'Mixto';
        const cluster = {
            provinceId: topProv[0],
            provinceName: provName,
            shipments: ok,
            totalWeight: usedW,
            totalVolume: usedV,
            maxDistanceKm: clusterMaxDistanceKm(branch, { shipments: ok }),
        };
        const bucket = { transport: t, shipments: ok, usedWeight: usedW, usedVolume: usedV, dedicated: false };

        // Reconstruir datos oportunistas para envíos que vienen de otras sucursales
        const oppShips = ok.filter(s => s.currentBranchId && s.currentBranchId !== supervisorBranchId);
        if (oppShips.length > 0) {
            const oppBranchIds = [...new Set(oppShips.map(s => s.currentBranchId))];
            const oppBranches = await Branch.findAll({ where: { id: { [Op.in]: oppBranchIds } } });
            const branchMap = new Map(oppBranches.map(b => [b.id, b]));
            const bPt = { lat: num(branch.latitude), lng: num(branch.longitude) };
            const pickupsByBranch = new Map();
            for (const s of oppShips) {
                if (s.address?.lat && s.address?.lng) {
                    const br = branchMap.get(s.currentBranchId);
                    const destPt = { lat: num(s.address.lat), lng: num(s.address.lng) };
                    const directKm = haversineKm(bPt, destPt);
                    const brPt = br ? { lat: num(br.latitude), lng: num(br.longitude) } : null;
                    const viaKm = brPt ? haversineKm(bPt, brPt) + haversineKm(brPt, destPt) : directKm;
                    const extraKm = viaKm - directKm;
                    const pctExtra = directKm > 0 ? (extraKm / directKm) * 100 : 0;
                    s._opportunisticInfo = {
                        branchId: s.currentBranchId,
                        branchName: br ? br.name : `Sucursal #${s.currentBranchId}`,
                        directKm: Number(directKm.toFixed(1)),
                        viaBranchKm: Number(viaKm.toFixed(1)),
                        extraKm: Number(extraKm.toFixed(1)),
                        pctExtra: Number(pctExtra.toFixed(1)),
                        corridorDetourKm: 0,
                        costPerKm: num(t.costPerKm),
                        extraCost: Number((extraKm * num(t.costPerKm)).toFixed(2)),
                        capWeightBefore: num(t.maxWeightKg),
                        capVolumeBefore: num(t.maxVolumeM3),
                    };
                }
                const arr = pickupsByBranch.get(s.currentBranchId) || [];
                arr.push(s);
                pickupsByBranch.set(s.currentBranchId, arr);
            }
            bucket.opportunisticPickups = pickupsByBranch;
            bucket.opportunisticBranches = branchMap;
        }

        proposals.push(await buildProposal({ bucket, branch, cluster }));
    }

    const summary = {
        totalShipments: shipments.length,
        validShipments: shipments.length - unassigned.length,
        unassignedCount: unassigned.length,
        proposalsCount: proposals.length,
        demandWeightKg: Number(demandWeight.toFixed(2)),
        demandVolumeM3: Number(demandVolume.toFixed(3)),
        manualMode: true,
    };

    return { proposals, unassigned, rejected: [], summary };
};

// ===== Piggyback: sumar envios a rutas PLANIFICADAS existentes =====
const loadPiggybackSettings = async () => {
    try {
        const settingModel = require('../models/setting');
        const get = async (k, def) => (await settingModel.get(k)) ?? def;
        const [en, pct, kmAbs, costPct] = await Promise.all([
            get('piggyback_enabled', 'false'),
            get('piggyback_max_extra_pct', '15'),
            get('piggyback_max_extra_km', '30'),
            get('piggyback_max_extra_cost_pct', '20'),
        ]);
        return {
            enabled: en === 'true' || en === 'on' || en === '1',
            maxExtraPct: Number(pct) || 0,
            maxExtraKm:  Number(kmAbs) || 0,
            maxExtraCostPct: Number(costPct) || 0,
        };
    } catch { return { enabled: false, maxExtraPct: 15, maxExtraKm: 30, maxExtraCostPct: 20 }; }
};

const evaluatePiggyback = async ({ plannedRoutes, transportsById, shipments, branch, thresholds }) => {
    const RouteStop = require('../models/routeStop').RouteStop;
    if (!plannedRoutes.length || !shipments.length) {
        return { piggybackProposals: [], piggybackedShipmentIds: new Set() };
    }
    const ctxByRouteId = new Map();
    for (const r of plannedRoutes) {
        const transport = transportsById.get(r.transportId);
        if (!transport) { continue; }
        const stops = await RouteStop.findAll({ where: { routeId: r.id }, order: [['sequence', 'ASC']] });
        if (stops.length === 0) { continue; }
        const deliveryStopShipmentIds = stops.filter(s => s.stopType === 'delivery' && s.shipmentId).map(s => s.shipmentId);
        const existingShipments = await Shipment.findAll({
            where: { id: { [Op.in]: deliveryStopShipmentIds } },
            include: [
                { model: Address, as: 'address', required: false, include: [{ model: Province, as: 'province', required: false }] },
                { model: Zone,    as: 'zone',      required: false },
            ],
        });
        const usedW = existingShipments.reduce((a, s) => a + num(s.weightKg), 0);
        const usedV = existingShipments.reduce((a, s) => a + num(s.volumeM3), 0);
        const provCount = new Map();
        for (const s of existingShipments) {
            const k = s.address?.provinceId || 0;
            provCount.set(k, (provCount.get(k) || 0) + 1);
        }
        const [topProv] = [...provCount.entries()].sort((x, y) => y[1] - x[1]) || [[0, 0]];
        const routeProvinceId = topProv ? topProv[0] : 0;
        const routeProvinceName = existingShipments.find(s => s.address?.provinceId === routeProvinceId)?.address?.province?.description || 'Mixto';

        ctxByRouteId.set(r.id, {
            route: r,
            transport,
            stops: stops.map(s => ({ lat: num(s.lat), lng: num(s.lng), stopType: s.stopType, shipmentId: s.shipmentId, branchId: s.branchId, sequence: s.sequence })),
            existingShipments,
            usedWeight: usedW,
            usedVolume: usedV,
            capWeightLeft: num(transport.maxWeightKg) - usedW,
            capVolumeLeft: num(transport.maxVolumeM3) - usedV,
            provinceId: routeProvinceId,
            provinceName: routeProvinceName,
            totalKm:  num(r.totalDistanceKm),
            totalCost: num(r.totalCost),
        });
    }

    // Calcular mejor insercion por envio
    const candidates = []; // { shipment, routeId, extraKm, extraCost, insertPos }
    for (const s of shipments) {
        const lat = num(s.address?.lat);
        const lng = num(s.address?.lng);
        if (!lat || !lng) { continue; }
        const w = num(s.weightKg), v = num(s.volumeM3);
        for (const ctx of ctxByRouteId.values()) {
            if (!isTransportEligibleForZone(ctx.transport, s.zoneId)) { continue; }
            if (s.address?.provinceId && ctx.provinceId && s.address.provinceId !== ctx.provinceId) { continue; }
            if (w > ctx.capWeightLeft || v > ctx.capVolumeLeft) { continue; }

            // Mejor posicion de insercion: minimiza haversine(a,new) + haversine(new,b) - haversine(a,b)
            let bestExtra = Infinity, bestPos = -1;
            for (let i = 1; i < ctx.stops.length; i++) {
                const a = ctx.stops[i - 1], b = ctx.stops[i];
                const detour = haversineKm(a, { lat, lng }) + haversineKm({ lat, lng }, b) - haversineKm(a, b);
                if (detour < bestExtra) { bestExtra = detour; bestPos = i; }
            }
            // Insertar al final tambien es opcion
            const last = ctx.stops[ctx.stops.length - 1];
            const tailDetour = haversineKm(last, { lat, lng });
            if (tailDetour < bestExtra) { bestExtra = tailDetour; bestPos = ctx.stops.length; }
            if (bestPos < 1) { continue; }

            const extraKm = bestExtra;
            const costPerKm = num(ctx.transport.costPerKm);
            const extraCost = extraKm * costPerKm;
            const pctExtraKm   = ctx.totalKm  > 0 ? (extraKm / ctx.totalKm)  * 100 : Infinity;
            const pctExtraCost = ctx.totalCost > 0 ? (extraCost / ctx.totalCost) * 100 : Infinity;

            const reasons = [];
            if (extraKm > thresholds.maxExtraKm)               reasons.push(`detour absoluto ${extraKm.toFixed(1)}km > ${thresholds.maxExtraKm}km`);
            if (pctExtraKm > thresholds.maxExtraPct)           reasons.push(`detour ${pctExtraKm.toFixed(1)}% > ${thresholds.maxExtraPct}%`);
            if (pctExtraCost > thresholds.maxExtraCostPct)     reasons.push(`costo extra ${pctExtraCost.toFixed(1)}% > ${thresholds.maxExtraCostPct}%`);
            if (reasons.length > 0) { continue; }

            candidates.push({
                shipment: s, routeId: ctx.route.id, ctx,
                extraKm, extraCost, pctExtraKm, pctExtraCost, insertPos: bestPos,
            });
        }
    }
    // Greedy: ordenar por menor extraKm; asignar 1 envio a 1 ruta sin pisar capacidad
    candidates.sort((a, b) => a.extraKm - b.extraKm);
    const assignedShipments = new Set();
    const additionsByRoute = new Map(); // routeId -> [{shipment, extraKm, extraCost, insertPos}]
    for (const c of candidates) {
        if (assignedShipments.has(c.shipment.id)) { continue; }
        const ctx = c.ctx;
        const w = num(c.shipment.weightKg), v = num(c.shipment.volumeM3);
        if (w > ctx.capWeightLeft || v > ctx.capVolumeLeft) { continue; }
        ctx.capWeightLeft -= w; ctx.capVolumeLeft -= v;
        ctx.usedWeight += w; ctx.usedVolume += v;
        ctx.totalKm   += c.extraKm;
        ctx.totalCost += c.extraCost;
        assignedShipments.add(c.shipment.id);
        const arr = additionsByRoute.get(c.routeId) || [];
        arr.push(c);
        additionsByRoute.set(c.routeId, arr);
    }

    // Construir propuestas piggyback (no necesitan stops/geometria nueva; el UI mostrara resumen + lista)
    const piggybackProposals = [];
    for (const [routeId, adds] of additionsByRoute.entries()) {
        const ctx = ctxByRouteId.get(routeId);
        const t = ctx.transport;
        const totalExtraKm = adds.reduce((a, c) => a + c.extraKm, 0);
        const totalExtraCost = adds.reduce((a, c) => a + c.extraCost, 0);
        const reasoningShipments = adds.map(c => ({
            shipmentId: c.shipment.id,
            trackingId: c.shipment.trackingId,
            priority: PRIORITY_LABEL[Number(c.shipment.priority) || 1] ?? 'normal',
            provinceName: c.shipment.address?.province?.description || ctx.provinceName,
            zoneName: c.shipment.zone?.name || null,
            recipientName: c.shipment.recipient?.fullName || null,
            addressStreet: c.shipment.address?.street || null,
            addressNumber: c.shipment.address?.number || null,
            postalCode: c.shipment.address?.postalCode || null,
            weightKg: num(c.shipment.weightKg),
            volumeM3: num(c.shipment.volumeM3),
            extraKm:  Number(c.extraKm.toFixed(2)),
            extraCost: Number(c.extraCost.toFixed(2)),
            pctExtraKm: Number(c.pctExtraKm.toFixed(1)),
            pctExtraCost: Number(c.pctExtraCost.toFixed(1)),
            insertPos: c.insertPos,
            why: `Cabe en ruta planificada #${routeId} con detour +${c.extraKm.toFixed(1)}km (${c.pctExtraKm.toFixed(1)}%) y costo extra $${c.extraCost.toFixed(2)} (${c.pctExtraCost.toFixed(1)}%). Capacidad libre antes: ${(ctx.capWeightLeft + num(c.shipment.weightKg)).toFixed(0)}kg / ${(ctx.capVolumeLeft + num(c.shipment.volumeM3)).toFixed(2)}m³.`,
        }));
        piggybackProposals.push({
            piggyback: true,
            existingRouteId: routeId,
            transportId: t.id,
            transport: { id: t.id, name: t.name, plate: t.plate, maxWeightKg: num(t.maxWeightKg), maxVolumeM3: num(t.maxVolumeM3), fixedCost: num(t.fixedCost), costPerKm: num(t.costPerKm), driver: t.driver ? { id: t.driver.id, fullName: t.driver.fullName } : null },
            clusterProvinceName: ctx.provinceName,
            stops: [],
            totalDistanceKm: Number(ctx.totalKm.toFixed(2)),
            totalDurationMin: null,
            totalCost: Number(ctx.totalCost.toFixed(2)),
            totalWeightKg: Number(ctx.usedWeight.toFixed(2)),
            totalVolumeM3: Number(ctx.usedVolume.toFixed(3)),
            utilizationWeight: num(t.maxWeightKg) > 0 ? Number((ctx.usedWeight / num(t.maxWeightKg)).toFixed(3)) : 0,
            utilizationVolume: num(t.maxVolumeM3) > 0 ? Number((ctx.usedVolume / num(t.maxVolumeM3)).toFixed(3)) : 0,
            addedShipmentIds: adds.map(c => c.shipment.id),
            shipmentIds: adds.map(c => c.shipment.id),
            piggybackSummary: {
                routeId,
                addedCount: adds.length,
                totalExtraKm: Number(totalExtraKm.toFixed(2)),
                totalExtraCost: Number(totalExtraCost.toFixed(2)),
                previousTotalKm: num(ctx.route.totalDistanceKm),
                previousTotalCost: num(ctx.route.totalCost),
                newTotalKm: Number(ctx.totalKm.toFixed(2)),
                newTotalCost: Number(ctx.totalCost.toFixed(2)),
                capWeightLeftAfter: Number(ctx.capWeightLeft.toFixed(2)),
                capVolumeLeftAfter: Number(ctx.capVolumeLeft.toFixed(3)),
            },
            warnings: [],
            reasoning: {
                transportPick: `Ruta #${routeId} ya planificada en ${t.name}. Sumar ${adds.length} envío(s) cuesta solo ${totalExtraKm.toFixed(1)}km extra y $${totalExtraCost.toFixed(0)} adicionales — más barato que lanzar una ruta nueva.`,
                ordering: 'Inserción por mínimo desvío haversine en la secuencia existente.',
                shipments: reasoningShipments,
            },
        });
    }
    return { piggybackProposals, piggybackedShipmentIds: assignedShipments };
};

const loadFuelMultiplier = async () => {
    try {
        const settingModel = require('../models/setting');
        const v = await settingModel.get('fuel_multiplier');
        const n = Number(v);
        globalThis.__fuelMultiplier = Number.isFinite(n) && n > 0 ? n : 1;
    } catch { globalThis.__fuelMultiplier = 1; }
};

const optimizeRoutes = async ({ shipmentIds, supervisorBranchId, excludeTransportIds = [] }) => {
    await loadFuelMultiplier();
    if (!shipmentIds?.length) { return { proposals: [], unassigned: [], rejected: [] }; }

    const branch = await Branch.findByPk(supervisorBranchId);
    if (!branch) {
        return { proposals: [], unassigned: shipmentIds, rejected: [], error: 'supervisor_branch_not_found' };
    }
    if (branch.closed) {
        return { proposals: [], unassigned: shipmentIds.map(id => ({ id, code: 'branch_closed', reason: `Sucursal ${branch.name} cerrada (feriado u operativa). No se pueden generar rutas hoy.` })), rejected: [], error: 'branch_closed', summary: {} };
    }

    const excludeSet = new Set(excludeTransportIds.map(Number));
    let [shipments, transports] = await Promise.all([
        loadShipments(shipmentIds, supervisorBranchId),
        loadEnabledTransportsForBranch(supervisorBranchId),
    ]);
    transports = transports.filter(t => !excludeSet.has(t.id));

    // Transportes sin capacidad de peso declarada (maxWeightKg=0) no pueden cargar nada
    const zeroCapTransports = transports
        .filter(t => num(t.maxWeightKg) <= 0)
        .map(t => ({ id: t.id, name: t.name, plate: t.plate }));
    transports = transports.filter(t => num(t.maxWeightKg) > 0);

    // Transportes con rutas activas. Si piggyback está habilitado, PLANNED no bloquea (se reusa la ruta);
    // IN_ROUTE siempre bloquea (el repartidor salió, no se puede modificar).
    const piggySettings = await loadPiggybackSettings();
    const { Route: _RouteCheck, RouteStatus: _RSCheck } = require('../models/route');
    const activeTxRoutes = await _RouteCheck.findAll({
        where: {
            transportId: { [Op.in]: transports.map(t => t.id) },
            statusId: { [Op.in]: [_RSCheck.PLANNED, _RSCheck.IN_ROUTE] },
        },
        attributes: ['id', 'transportId', 'statusId', 'totalDistanceKm', 'totalCost', 'totalWeightKg', 'totalVolumeM3'],
    }).catch(() => []);
    const transportsById = new Map(transports.map(t => [t.id, t]));
    const plannedRoutes = activeTxRoutes.filter(r => r.statusId === _RSCheck.PLANNED);
    const inRouteRoutes = activeTxRoutes.filter(r => r.statusId === _RSCheck.IN_ROUTE);

    const inRouteTxIds = new Set(inRouteRoutes.map(r => r.transportId));
    const plannedTxIds = new Set(plannedRoutes.map(r => r.transportId));
    const busyTxMap = new Map();
    inRouteRoutes.forEach(r => busyTxMap.set(r.transportId, r.id));
    if (!piggySettings.enabled) {
        plannedRoutes.forEach(r => busyTxMap.set(r.transportId, r.id));
    }
    const busyTransports = transports.filter(t => busyTxMap.has(t.id))
        .map(t => ({ id: t.id, name: t.name, plate: t.plate, activeRouteId: busyTxMap.get(t.id), reason: inRouteTxIds.has(t.id) ? 'in_route' : 'planned' }));
    transports = transports.filter(t => !busyTxMap.has(t.id));

    // Doble asignación: descartar envíos que ya tienen RouteStop en una ruta activa
    const RouteStop = require('../models/routeStop').RouteStop;
    const routeModel = require('../models/route');
    const activeRouteShipments = await RouteStop.findAll({
        where: { shipmentId: { [Op.in]: shipments.map(s => s.id) }, stopType: 'delivery' },
        include: [{ model: routeModel.Route, as: 'route', where: { statusId: { [Op.in]: [routeModel.RouteStatus.PLANNED, routeModel.RouteStatus.IN_ROUTE] } }, required: true }],
    }).catch(() => []);
    const alreadyAssignedIds = new Set(activeRouteShipments.map(rs => rs.shipmentId));
    if (alreadyAssignedIds.size > 0) {
        shipments = shipments.filter(s => !alreadyAssignedIds.has(s.id));
    }

    const loadedIds = new Set(shipments.map(s => s.id));
    const rejected = shipmentIds.filter(id => !loadedIds.has(Number(id)));

    if (transports.length === 0) {
        const whyParts = [];
        if (busyTransports.length > 0) whyParts.push(`${busyTransports.length} en ruta activa (${busyTransports.map(t => t.name).join(', ')}) — completar o cancelar esas rutas para liberarlos`);
        if (zeroCapTransports.length > 0) whyParts.push(`${zeroCapTransports.length} sin capacidad configurada (${zeroCapTransports.map(t => t.name).join(', ')}) — actualizar peso máximo en Transportes`);
        const whyMsg = whyParts.length > 0 ? ` Causas: ${whyParts.join('; ')}.` : ' Verificar que existan vehículos habilitados y asignados a esta sucursal.';
        const noTxSummary = { unavailableTransports: { busy: busyTransports, zeroCap: zeroCapTransports } };
        return { proposals: [], unassigned: shipments.map(s => ({ id: s.id, trackingId: s.trackingId, code: 'no_transports', reason: `Sin transportes disponibles para operar.${whyMsg}` })), rejected, summary: noTxSummary };
    }

    // ===== Pre-flight: casos borde =====
    const unassigned = [];
    for (const sid of alreadyAssignedIds) {
        unassigned.push({ id: sid, code: 'already_assigned', reason: `Envío ya asignado a una ruta activa. Cancelar la ruta previa para reasignar.` });
    }
    for (const sid of rejected) {
        unassigned.push({ id: sid, code: 'rejected', reason: 'Envío no cumple filtros (estado no ruteable o sucursal distinta).' });
    }
    let validShipments = [];

    const maxFleetWeight = transports.reduce((m, t) => Math.max(m, num(t.maxWeightKg)), 0);
    const maxFleetVolume = transports.reduce((m, t) => Math.max(m, num(t.maxVolumeM3)), 0);
    const totalFleetWeight = transports.reduce((m, t) => m + num(t.maxWeightKg), 0);
    const totalFleetVolume = transports.reduce((m, t) => m + num(t.maxVolumeM3), 0);

    let demandWeight = 0;
    let demandVolume = 0;

    for (const s of shipments) {
        const w = num(s.weightKg);
        const v = num(s.volumeM3);
        const lat = num(s.address?.lat);
        const lng = num(s.address?.lng);

        if (!lat || !lng) {
            unassigned.push({ id: s.id, trackingId: s.trackingId, code: 'no_geo', reason: 'Domicilio sin geolocalización. Editar el envío, corregir la dirección y guardar para que el sistema calcule las coordenadas automáticamente.' });
            continue;
        }
        if (w > maxFleetWeight || v > maxFleetVolume) {
            unassigned.push({ id: s.id, trackingId: s.trackingId, code: 'oversized', reason: `Envío sobredimensionado: ${w}kg / ${v}m³ supera el vehículo más grande de la flota (${maxFleetWeight}kg / ${maxFleetVolume}m³). Opciones: subdividir en múltiples envíos o contratar transporte especial.` });
            continue;
        }
        validShipments.push(s);
        demandWeight += w;
        demandVolume += v;
    }

    const capacityShortfall = {
        weightKg: Math.max(0, demandWeight - totalFleetWeight),
        volumeM3: Math.max(0, demandVolume - totalFleetVolume),
    };

    // 0) Piggyback: intentar sumar a rutas planificadas antes del clustering normal
    let piggybackProposals = [];
    if (piggySettings.enabled && plannedRoutes.length > 0 && validShipments.length > 0) {
        // Re-incluir transportes planificados para tener acceso a sus datos (no se usaran como nuevos)
        const allTxById = new Map();
        for (const t of transports) { allTxById.set(t.id, t); }
        const plannedTxFull = await Transport.findAll({
            where: { id: { [Op.in]: [...plannedTxIds] }, branchId: supervisorBranchId },
            include: [
                { model: User, as: 'driver', required: false },
                { model: Zone, as: 'zones',  required: false, through: { attributes: [] } },
            ],
        });
        for (const t of plannedTxFull) { allTxById.set(t.id, t); }
        const pb = await evaluatePiggyback({
            plannedRoutes,
            transportsById: allTxById,
            shipments: validShipments,
            branch,
            thresholds: piggySettings,
        });
        piggybackProposals = pb.piggybackProposals;
        if (pb.piggybackedShipmentIds.size > 0) {
            validShipments = validShipments.filter(s => !pb.piggybackedShipmentIds.has(s.id));
        }
    }

    // 1) Cluster por provincia destino, priorizando clusters mas pesados
    const clusters = clusterByProvince(validShipments).sort((a, b) => b.totalWeight - a.totalWeight);

    // 2) Asignar transportes por cluster (un transporte solo sirve un cluster)
    const proposals = [];
    const usedTxIds = new Set();
    for (const cluster of clusters) {
        const available = transports.filter(t => !usedTxIds.has(t.id));
        if (available.length === 0) {
            unassigned.push(...cluster.shipments.map(s => ({ id: s.id, trackingId: s.trackingId, code: 'no_fit', reason: `Sin transportes libres para provincia ${cluster.provinceName} (todos asignados a otros clusters)` })));
            continue;
        }
        const distKm = clusterMaxDistanceKm(branch, cluster);
        cluster.maxDistanceKm = distKm;
        const { buckets, unassigned: clUn } = assignClusterToTransports(cluster, available, distKm);
        unassigned.push(...clUn);
        for (const bucket of buckets) {
            usedTxIds.add(bucket.transport.id);
            await enrichBucketWithOpportunisticPickups({ bucket, branch, cluster });
            const proposal = await buildProposal({ bucket, branch, cluster });
            proposals.push(proposal);
        }
    }

    const assignedCount = proposals.reduce((a, p) => a + p.shipmentIds.length, 0);
    const capacityUnassigned = unassigned.filter(u => u.code === 'no_fit' || u.code === 'oversized' || u.code === 'capacity').length;

    let deficitWarning = null;
    if (capacityShortfall.weightKg > 0 || capacityShortfall.volumeM3 > 0) {
        const fleetDesc = transports.length === 1
            ? `${transports[0].name} (capacidad ${totalFleetWeight}kg / ${totalFleetVolume}m³)`
            : `${transports.length} transportes (capacidad total ${totalFleetWeight}kg / ${totalFleetVolume}m³)`;
        deficitWarning = assignedCount > 0
            ? `La flota no alcanza para todos los envíos seleccionados. ${assignedCount} de ${validShipments.length} envíos fueron asignados (ver propuestas abajo). Los ${capacityUnassigned} restantes quedan en "Sin asignar" por falta de espacio en ${fleetDesc}.`
            : `Ningún envío pudo asignarse. ${fleetDesc} no tiene capacidad suficiente para ninguno de los ${validShipments.length} envíos seleccionados. Revisá los pesos/volúmenes o agregá más transportes a la sucursal.`;
    }

    const allProposals = [...piggybackProposals, ...proposals];
    const totalAssigned = allProposals.reduce((a, p) => a + (p.shipmentIds?.length || 0), 0);

    const summary = {
        totalShipments: shipmentIds.length,
        validShipments: validShipments.length + piggybackProposals.reduce((a, p) => a + (p.addedShipmentIds?.length || 0), 0),
        assignedCount: totalAssigned,
        unassignedCount: unassigned.length,
        proposalsCount: allProposals.length,
        piggybackCount: piggybackProposals.length,
        piggybackEnabled: piggySettings.enabled,
        demandWeightKg: Number(demandWeight.toFixed(2)),
        demandVolumeM3: Number(demandVolume.toFixed(3)),
        fleetCapacityKg: totalFleetWeight,
        fleetCapacityM3: totalFleetVolume,
        capacityShortfall,
        deficitWarning,
        unavailableTransports: { busy: busyTransports, zeroCap: zeroCapTransports },
    };

    return { proposals: allProposals, unassigned, rejected, summary };
};

module.exports = { optimizeRoutes, optimizeManual };
