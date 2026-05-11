const { Shipment }        = require('../models/shipment');
const { ShipmentHistory } = require('../models/shipmentHistory');
const { Person }          = require('../models/person');
const { Status }          = require('../models/status');
const { Address }         = require('../models/address');
const { Province }        = require('../models/province');
const { TypeShipment }    = require('../models/typeShipment');
const { Branch }          = require('../models/branch');

const publicIncludes = [
    { model: Person,       as: 'sender',       attributes: ['fullName'] },
    { model: Person,       as: 'recipient',    attributes: ['fullName', 'document'] },
    { model: Status,       as: 'status',       attributes: ['description'] },
    { model: Address,      as: 'address',      attributes: ['street', 'number', 'postalCode', 'lat', 'lng'],
      include: [{ model: Province, as: 'province', attributes: ['description'] }] },
    { model: TypeShipment, as: 'shipmentType', attributes: ['description'] },
    { model: Branch,       as: 'currentBranch', attributes: ['name', 'latitude', 'longitude'], required: false },
];

const getPortal = async (req, res) => {
    const raw = req.query.q;
    const q = (Array.isArray(raw) ? raw.find(v => v.trim() !== '') || '' : raw || '').trim();

    if (!q) {
        return res.render('portal', { searched: false, query: '' });
    }

    try {
        const [byTracking, byDocument] = await Promise.all([
            Shipment.findAll({
                where: { trackingId: q.toUpperCase() },
                include: publicIncludes,
                limit: 1,
            }),
            Shipment.findAll({
                include: [
                    { model: Person, as: 'sender',    attributes: ['fullName'] },
                    { model: Person, as: 'recipient', attributes: ['fullName', 'document'],
                      where: { document: Number(q) || -1 }, required: true },
                    { model: Status,       as: 'status',       attributes: ['description'] },
                    { model: Address,      as: 'address',      attributes: ['street', 'number', 'postalCode', 'lat', 'lng'],
                      include: [{ model: Province, as: 'province', attributes: ['description'] }] },
                    { model: TypeShipment, as: 'shipmentType', attributes: ['description'] },
                    { model: Branch,       as: 'currentBranch', attributes: ['name', 'latitude', 'longitude'], required: false },
                ],
                limit: 1,
            }),
        ]);

        const seen = new Set();
        const shipments = [...byTracking, ...byDocument].filter(s => {
            if (seen.has(s.id)) { return false; }
            seen.add(s.id);
            return true;
        });

        const searchType = /^\d+$/.test(q) ? 'dni' : 'codigo';

        if (shipments.length === 0) {
            const errorMsg = searchType === 'dni' 
                ? 'No se encontraron envíos asociados a ese DNI.' 
                : 'No se encontró ningún envío con ese código de seguimiento.';
            return res.render('portal', { searched: true, query: q, error: errorMsg, searchType });
        }

        const histories = await Promise.all(
            shipments.map(s =>
                ShipmentHistory.findAll({
                    where: { shipmentId: s.id },
                    include: [
                        { model: Status, as: 'fromStatus', attributes: ['description'] },
                        { model: Status, as: 'toStatus',   attributes: ['description'] },
                        { model: Branch, as: 'branch',     attributes: ['name', 'latitude', 'longitude'], required: false },
                    ],
                    order: [['changedAt', 'ASC']],
                })
            )
        );

        const shipmentsWithHistory = await Promise.all(shipments.map(async (s, i) => {
            const json = s.toJSON();
            const history = histories[i].map(h => h.toJSON());
            // Construir mapa de tracking publico
            const stops = [];
            // Origen: primera branch en history o currentBranch
            const firstBranch = history.find(h => h.branch && h.branch.latitude);
            if (firstBranch) {
                stops.push({
                    type: 'origin',
                    lat: Number(firstBranch.branch.latitude),
                    lng: Number(firstBranch.branch.longitude),
                    label: firstBranch.branch.name.startsWith('Sucursal') ? firstBranch.branch.name : `Sucursal ${firstBranch.branch.name}`,
                });
            } else if (json.currentBranch && json.currentBranch.latitude) {
                stops.push({
                    type: 'origin',
                    lat: Number(json.currentBranch.latitude),
                    lng: Number(json.currentBranch.longitude),
                    label: json.currentBranch.name.startsWith('Sucursal') ? json.currentBranch.name : `Sucursal ${json.currentBranch.name}`,
                });
            }
            // Branch events intermedios (excluyendo el primero ya agregado)
            for (let k = 1; k < history.length; k++) {
                const h = history[k];
                if (h.branch && h.branch.latitude) {
                    stops.push({
                        type: 'transit',
                        lat: Number(h.branch.latitude),
                        lng: Number(h.branch.longitude),
                        label: h.branch.name.startsWith('Sucursal') ? h.branch.name : `Sucursal ${h.branch.name}`,
                        timestamp: h.changedAt,
                    });
                } else if (h.latitude && h.longitude && h.eventType === 'DELIVERED') {
                    stops.push({
                        type: 'pod',
                        lat: Number(h.latitude),
                        lng: Number(h.longitude),
                        label: 'Entregado',
                        timestamp: h.changedAt,
                    });
                }
            }
            // Destino final si address tiene coords y aun no entregado
            if (json.address && json.address.lat && json.address.lng && !stops.find(s => s.type === 'pod')) {
                stops.push({
                    type: 'destination',
                    lat: Number(json.address.lat),
                    lng: Number(json.address.lng),
                    label: `${json.address.street || ''} ${json.address.number || ''}`.trim() || 'Destino',
                });
            }

            // Buscar route activa con este shipment para poll de GPS
            let activeRouteId = null;
            try {
                const sequelize = require('../database/connection');
                const { QueryTypes } = require('sequelize');
                const routeRows = await sequelize.query(
                    `SELECT r.id FROM logitrack.route r
                       JOIN logitrack.route_stop rs ON rs.route_id=r.id
                      WHERE rs."shipmentId"=:sid AND r."statusId" IN (1,2)
                      ORDER BY r."createdAt" DESC LIMIT 1`,
                    { replacements: { sid: json.id }, type: QueryTypes.SELECT }
                );
                activeRouteId = routeRows[0]?.id || null;
            } catch { /* ignore */ }

            return { ...json, history, mapStops: stops, activeRouteId };
        }));

        res.render('portal', { searched: true, query: q, shipments: shipmentsWithHistory });
    } catch (err) {
        console.error('Portal search error:', err);
        res.render('portal', { searched: true, query: q, error: 'Ocurrió un error al realizar la búsqueda. Por favor, intente nuevamente.' });
    }
};

module.exports = { getPortal };
