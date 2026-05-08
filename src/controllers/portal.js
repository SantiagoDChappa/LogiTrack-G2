const { Shipment }        = require('../models/shipment');
const { ShipmentHistory } = require('../models/shipmentHistory');
const { Person }          = require('../models/person');
const { Status }          = require('../models/status');
const { Address }         = require('../models/address');
const { Province }        = require('../models/province');
const { TypeShipment }    = require('../models/typeShipment');
const { Branch }          = require('../models/branch');
const { PROVINCES }       = require('../utils/provinces');

const publicIncludes = [
    { model: Person,       as: 'sender',       attributes: ['fullName'] },
    { model: Person,       as: 'recipient',    attributes: ['fullName', 'document'] },
    { model: Status,       as: 'status',       attributes: ['id', 'description'] },
    { model: Address,      as: 'address',      attributes: ['street', 'number', 'postalCode', 'provinceId'],
      include: [{ model: Province, as: 'province', attributes: ['description'] }] },
    { model: TypeShipment, as: 'shipmentType', attributes: ['description'] },
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
                    { model: Address,      as: 'address',      attributes: ['street', 'number', 'postalCode'],
                      include: [{ model: Province, as: 'province', attributes: ['description'] }] },
                    { model: TypeShipment, as: 'shipmentType', attributes: ['description'] },
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
                        { model: Status, as: 'toStatus',   attributes: ['id', 'description'] },
                        { model: Branch, as: 'branch',     required: false },
                    ],
                    order: [['changedAt', 'ASC']],
                })
            )
        );

        const shipmentsWithHistory = shipments.map((s, i) => {
            const sJson = s.toJSON();
            const history = histories[i];

            const stops = history
                .filter(h => h.latitude != null && h.longitude != null)
                .map(h => ({
                    lat:   Number(h.latitude),
                    lng:   Number(h.longitude),
                    label: h.branch ? h.branch.name : (h.toStatus ? h.toStatus.description : 'Evento'),
                    date:  h.changedAt,
                }));

            const prov = PROVINCES[sJson.address.provinceId];
            const destination = prov
                ? { lat: prov.lat, lng: prov.lng, label: prov.name }
                : null;

            return {
                ...sJson,
                history,
                mapData: { stops, destination, currentStatusId: sJson.status.id },
            };
        });

        res.render('portal', { searched: true, query: q, shipments: shipmentsWithHistory });
    } catch (err) {
        console.error('Portal search error:', err);
        res.render('portal', { searched: true, query: q, error: 'Ocurrió un error al realizar la búsqueda. Por favor, intente nuevamente.' });
    }
};

module.exports = { getPortal };
