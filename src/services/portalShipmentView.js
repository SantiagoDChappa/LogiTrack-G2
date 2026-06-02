const { ShipmentHistory } = require('../models/shipmentHistory');
const { Status } = require('../models/status');
const { Branch } = require('../models/branch');
const { Person } = require('../models/person');
const { Address } = require('../models/address');
const { Province } = require('../models/province');
const { TypeShipment } = require('../models/typeShipment');

const publicIncludes = [
    { model: Person, as: 'sender', attributes: ['fullName', 'document', 'email'] },
    { model: Person, as: 'recipient', attributes: ['fullName', 'document', 'email'] },
    { model: Status, as: 'status', attributes: ['id', 'description'] },
    {
        model: Address,
        as: 'address',
        attributes: ['street', 'number', 'postalCode', 'lat', 'lng'],
        include: [{ model: Province, as: 'province', attributes: ['description'] }],
    },
    { model: TypeShipment, as: 'shipmentType', attributes: ['description'] },
    { model: Branch, as: 'currentBranch', attributes: ['name', 'latitude', 'longitude'], required: false },
    { model: Branch, as: 'pickupBranch', attributes: ['name', 'address', 'phone', 'latitude', 'longitude'], required: false },
];

const historyIncludes = [
    { model: Status, as: 'fromStatus', attributes: ['description'] },
    { model: Status, as: 'toStatus', attributes: ['description'] },
    { model: Branch, as: 'branch', attributes: ['name', 'latitude', 'longitude'], required: false },
];

const buildMapStops = (json, history) => {
    const stops = [];
    const firstBranch = history.find((item) => item.branch && item.branch.latitude);

    if (firstBranch) {
        stops.push({
            type: 'origin',
            lat: Number(firstBranch.branch.latitude),
            lng: Number(firstBranch.branch.longitude),
            label: firstBranch.branch.name.startsWith('Sucursal')
                ? firstBranch.branch.name
                : `Sucursal ${firstBranch.branch.name}`,
        });
    } else if (json.currentBranch && json.currentBranch.latitude) {
        stops.push({
            type: 'origin',
            lat: Number(json.currentBranch.latitude),
            lng: Number(json.currentBranch.longitude),
            label: json.currentBranch.name.startsWith('Sucursal')
                ? json.currentBranch.name
                : `Sucursal ${json.currentBranch.name}`,
        });
    }

    for (let stepIndex = 1; stepIndex < history.length; stepIndex++) {
        const step = history[stepIndex];
        if (step.branch && step.branch.latitude) {
            stops.push({
                type: 'transit',
                lat: Number(step.branch.latitude),
                lng: Number(step.branch.longitude),
                label: step.branch.name.startsWith('Sucursal')
                    ? step.branch.name
                    : `Sucursal ${step.branch.name}`,
                timestamp: step.changedAt,
            });
        } else if (step.latitude && step.longitude && step.eventType === 'DELIVERED') {
            stops.push({
                type: 'pod',
                lat: Number(step.latitude),
                lng: Number(step.longitude),
                label: 'Entregado',
                timestamp: step.changedAt,
            });
        }
    }

    if (json.address && json.address.lat && json.address.lng && !stops.find((step) => step.type === 'pod')) {
        stops.push({
            type: 'destination',
            lat: Number(json.address.lat),
            lng: Number(json.address.lng),
            label: `${json.address.street || ''} ${json.address.number || ''}`.trim() || 'Destino',
        });
    }

    return stops;
};

const fetchActiveRouteId = async (shipmentId) => {
    try {
        const sequelize = require('../database/connection');
        const { QueryTypes } = require('sequelize');
        const routeRows = await sequelize.query(
            `SELECT r.id FROM logitrack.route r
               JOIN logitrack.route_stop rs ON rs.route_id=r.id
              WHERE rs."shipmentId"=:sid AND r."statusId" IN (1,2)
              ORDER BY r."createdAt" DESC LIMIT 1`,
            { replacements: { sid: shipmentId }, type: QueryTypes.SELECT }
        );
        return routeRows[0]?.id || null;
    } catch {
        return null;
    }
};

const enrichShipmentRecord = async (shipment) => {
    const json = typeof shipment.toJSON === 'function' ? shipment.toJSON() : { ...shipment };
    const historyRows = await ShipmentHistory.findAll({
        where: { shipmentId: json.id },
        include: historyIncludes,
        order: [['changedAt', 'ASC']],
    });
    const history = historyRows.map((item) => item.toJSON());
    const mapStops = buildMapStops(json, history);
    const activeRouteId = await fetchActiveRouteId(json.id);
    return { ...json, history, mapStops, activeRouteId };
};

const enrichShipmentsForPortal = async (shipments) => Promise.all(
    shipments.map((shipment) => enrichShipmentRecord(shipment))
);

const SELF_SERVICE_STATUS_IDS = [1, 3, 6, 7];

const canSelfService = (shipment) => SELF_SERVICE_STATUS_IDS.includes(Number(shipment.statusId ?? shipment.status?.id));

module.exports = {
    publicIncludes,
    enrichShipmentRecord,
    enrichShipmentsForPortal,
    canSelfService,
    SELF_SERVICE_STATUS_IDS,
};
