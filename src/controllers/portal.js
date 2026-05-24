const { Shipment } = require('../models/shipment');
const { ShipmentHistory } = require('../models/shipmentHistory');
const { Person } = require('../models/person');
const { Status } = require('../models/status');
const { Address } = require('../models/address');
const { Province } = require('../models/province');
const { TypeShipment } = require('../models/typeShipment');
const { Branch } = require('../models/branch');
const { applyStatusExposurePolicy, sanitizeChatbotComment } = require('../services/chatbot/publicPolicy');
const settingModel = require('../models/setting');

const SUPPORT_INFO = {
    email: 'soporte@logitrack.com',
    hours: 'Lunes a viernes, 9 a 18 hs',
};

const publicIncludes = [
    { model: Person, as: 'sender', attributes: ['fullName'] },
    { model: Person, as: 'recipient', attributes: ['fullName', 'document'] },
    { model: Status, as: 'status', attributes: ['description'] },
    {
        model: Address,
        as: 'address',
        attributes: ['street', 'number', 'postalCode', 'lat', 'lng'],
        include: [{ model: Province, as: 'province', attributes: ['description'] }],
    },
    { model: TypeShipment, as: 'shipmentType', attributes: ['description'] },
    { model: Branch, as: 'currentBranch', attributes: ['name', 'latitude', 'longitude'], required: false },
    { model: Branch, as: 'pickupBranch',  attributes: ['name', 'address', 'phone', 'latitude', 'longitude'], required: false },
];

const normalizeStatusKey = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const formatDate = (value, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
    if (!value) { return null; }
    return new Date(value).toLocaleDateString('es-AR', options);
};

const buildSafeChatbotComment = (item) => {
    const eventType = String(item?.eventType || '').toUpperCase();
    const statusLabel = item?.toStatus?.description || item?.toStatus || '';
    const statusKey = normalizeStatusKey(statusLabel);

    if (eventType === 'CREATED') {
        return 'Tu envio fue registrado en el sistema.';
    }

    if (eventType === 'RESCHEDULED') {
        return 'Tu envio fue reprogramado.';
    }

    if (eventType === 'ARRIVED') {
        return 'El repartidor llego al punto de entrega.';
    }

    if (eventType === 'DELIVERED' || statusKey === 'entregado') {
        return 'Tu envio fue entregado.';
    }

    if (statusKey === 'intento_fallido') {
        return 'Se registro un intento de entrega.';
    }

    if (statusKey === 'en_sucursal') {
        return 'Tu envio fue registrado en sucursal.';
    }

    if (statusKey === 'en_transito') {
        return 'Tu envio sigue en camino.';
    }

    return null;
};

const buildChatbotShipment = (shipment) => {
    const statusLabel = shipment.status?.description || 'Sin estado';
    const statusKey = normalizeStatusKey(statusLabel);
    const history = shipment.history || [];
    const latestHistory = history.length ? history[history.length - 1] : null;
    const latestBranch = [...history].reverse().find((item) => item.branch?.name)?.branch
        || shipment.currentBranch
        || null;

    const expectedDeliveryWindow = shipment.expectedDeliveryFrom && shipment.expectedDeliveryTo
        ? `${String(shipment.expectedDeliveryFrom).slice(0, 5)} a ${String(shipment.expectedDeliveryTo).slice(0, 5)}`
        : null;

    return applyStatusExposurePolicy({
        id: shipment.id,
        trackingId: shipment.trackingId,
        status: statusLabel,
        statusKey,
        destination: shipment.address?.province?.description || '-',
        shipmentType: shipment.shipmentType?.description || '-',
        weightKg: shipment.weightKg ? `${Number(shipment.weightKg).toFixed(2)} kg` : '-',
        packageQty: shipment.packageQty ? `${shipment.packageQty} bulto${shipment.packageQty > 1 ? 's' : ''}` : '-',
        createdAtLabel: formatDate(shipment.createdAt, { day: '2-digit', month: 'long', year: 'numeric' }) || '-',
        currentBranchName: latestBranch?.name || null,
        expectedDeliveryDateLabel: formatDate(shipment.expectedDeliveryDate, { day: '2-digit', month: 'long', year: 'numeric' }),
        expectedDeliveryWindow,
        lastMovementLabel: latestHistory?.toStatus?.description || statusLabel,
        lastMovementDateLabel: formatDate(latestHistory?.changedAt),
        lastComment: sanitizeChatbotComment(buildSafeChatbotComment(latestHistory)),
        history: history.map((item) => ({
            changedAtLabel: formatDate(item.changedAt) || '-',
            fromStatus: item.fromStatus?.description || null,
            toStatus: item.toStatus?.description || '-',
            comment: sanitizeChatbotComment(buildSafeChatbotComment(item)),
            branchName: item.branch?.name || null,
            eventType: item.eventType || null,
        })),
    });
};

const buildChatbotData = ({ searched, query, error = '', searchType = null, shipments = [] }) => ({
    searched,
    query,
    error,
    searchType,
    support: SUPPORT_INFO,
    shipments: shipments.map(buildChatbotShipment),
});

const getPortal = async (req, res) => {
    const [nombreEmpresa, telefonoSoporte, emailSoporte] = await Promise.all([
        settingModel.get('nombre_empresa'),
        settingModel.get('telefono_soporte'),
        settingModel.get('email_soporte'),
    ]);

    const supportInfo = {
        nombre: nombreEmpresa || 'LogiTrack',
        telefono: telefonoSoporte || '0800-555-5678',
        email: emailSoporte || 'soporte@logitrack.com',
        hours: 'Lunes a viernes, 9 a 18 hs',
    };
    const raw = req.query.q;
    const q = (Array.isArray(raw) ? raw.find((value) => value.trim() !== '') || '' : raw || '').trim();
    const searchType = /^\d+$/.test(q) ? 'dni' : 'codigo';

    if (!q) {
        return res.render('portal', {
            support: supportInfo,
            searched: false,
            query: '',
            searchType: null,
            chatbotData: buildChatbotData({ searched: false, query: '' }),
        });
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
                    { model: Person, as: 'sender', attributes: ['fullName'] },
                    {
                        model: Person,
                        as: 'recipient',
                        attributes: ['fullName', 'document'],
                        where: { document: Number(q) || -1 },
                        required: true,
                    },
                    { model: Status, as: 'status', attributes: ['description'] },
                    {
                        model: Address,
                        as: 'address',
                        attributes: ['street', 'number', 'postalCode', 'lat', 'lng'],
                        include: [{ model: Province, as: 'province', attributes: ['description'] }],
                    },
                    { model: TypeShipment, as: 'shipmentType', attributes: ['description'] },
                    { model: Branch, as: 'currentBranch', attributes: ['name', 'latitude', 'longitude'], required: false },
                    { model: Branch, as: 'pickupBranch',  attributes: ['name', 'address', 'phone', 'latitude', 'longitude'], required: false },
                ],
                order: [['createdAt', 'DESC']],
            }),
        ]);

        const seen = new Set();
        const shipments = [...byTracking, ...byDocument].filter((shipment) => {
            if (seen.has(shipment.id)) { return false; }
            seen.add(shipment.id);
            return true;
        });

        if (shipments.length === 0) {
            const errorMsg = searchType === 'dni'
                ? 'No se encontraron envios asociados a ese DNI.'
                : 'No se encontro ningun envio con ese codigo de seguimiento.';
            return res.render('portal', {
                support: supportInfo,
                searched: true,
                query: q,
                error: errorMsg,
                searchType,
                chatbotData: buildChatbotData({ searched: true, query: q, error: errorMsg, searchType }),
            });
        }

        const histories = await Promise.all(
            shipments.map((shipment) => ShipmentHistory.findAll({
                where: { shipmentId: shipment.id },
                include: [
                    { model: Status, as: 'fromStatus', attributes: ['description'] },
                    { model: Status, as: 'toStatus', attributes: ['description'] },
                    { model: Branch, as: 'branch', attributes: ['name', 'latitude', 'longitude'], required: false },
                ],
                order: [['changedAt', 'ASC']],
            }))
        );

        const shipmentsWithHistory = await Promise.all(shipments.map(async (shipment, index) => {
            const json = shipment.toJSON();
            const history = histories[index].map((item) => item.toJSON());
            const stops = [];
            const firstBranch = history.find((item) => item.branch && item.branch.latitude);

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

            for (let stepIndex = 1; stepIndex < history.length; stepIndex++) {
                const step = history[stepIndex];
                if (step.branch && step.branch.latitude) {
                    stops.push({
                        type: 'transit',
                        lat: Number(step.branch.latitude),
                        lng: Number(step.branch.longitude),
                        label: step.branch.name.startsWith('Sucursal') ? step.branch.name : `Sucursal ${step.branch.name}`,
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
            } catch {
                // ignore live tracking lookup errors in public portal
            }

            return { ...json, history, mapStops: stops, activeRouteId };
        }));

        return res.render('portal', {
            support: supportInfo,
            searched: true,
            query: q,
            searchType,
            shipments: shipmentsWithHistory,
            chatbotData: buildChatbotData({ searched: true, query: q, searchType, shipments: shipmentsWithHistory }),
        });
    } catch (err) {
        console.error('Portal search error:', err);
        const errorMsg = 'Ocurrio un error al realizar la busqueda. Por favor, intenta nuevamente.';
        return res.render('portal', {
            support: supportInfo,
            searched: true,
            query: q,
            error: errorMsg,
            searchType,
            chatbotData: buildChatbotData({ searched: true, query: q, error: errorMsg, searchType }),
        });
    }
};

// ===== Incidencias publicas (sin login) =====
const sequelize           = require('../database/connection');
const { Incident }        = require('../models/incident');
const incidentTypeModel   = require('../models/incidentType');
const incidentHistoryModel = require('../models/incidentHistory');
const { IncidentStatus, IncidentChannel, IncidentEventType } = require('../constants/enums');

const findShipmentByTracking = (trackingId) => {
    const t = (trackingId || '').trim();
    if (!t) { return null; }
    return Shipment.findOne({
        where: { trackingId: t.toUpperCase() },
        include: [
            { model: Person, as: 'sender',    attributes: ['id', 'fullName', 'document', 'email'] },
            { model: Person, as: 'recipient', attributes: ['id', 'fullName', 'document', 'email'] }
        ]
    });
};

const getPublicCreateForm = async (req, res) => {
    const trackingId = (req.query.trackingId || '').trim().toUpperCase();
    const shipment = trackingId ? await findShipmentByTracking(trackingId) : null;

    if (trackingId && !shipment) {
        return res.status(404).render('portal/incidentNew', {
            shipment: null,
            trackingId,
            types: await incidentTypeModel.getActive(),
            error: 'No se encontró un envío con ese código de seguimiento.',
            form: {}
        });
    }

    res.render('portal/incidentNew', {
        shipment,
        trackingId,
        types: await incidentTypeModel.getActive(),
        error: null,
        form: {}
    });
};

// Logica compartida entre createPublic (form) y createPublicApi (JSON / bot).
// Retorna { ok: true, incident, shipment } o { ok: false, status, message }.
const createIncidentFromPortal = async ({ trackingId, incidentTypeId, description, reporterName, reporterEmail, reporterDocument }) => {
    const tracking = (trackingId || '').trim().toUpperCase();
    if (!tracking)                                                        { return { ok: false, status: 400, message: 'Código de seguimiento requerido.' }; }
    if (!incidentTypeId)                                                  { return { ok: false, status: 400, message: 'Seleccione un tipo de incidencia.' }; }
    if (!description || String(description).trim().length === 0)          { return { ok: false, status: 400, message: 'La descripción es obligatoria.' }; }
    if (!reporterName || String(reporterName).trim().length === 0)        { return { ok: false, status: 400, message: 'Su nombre es obligatorio.' }; }

    const shipment = await findShipmentByTracking(tracking);
    if (!shipment) { return { ok: false, status: 404, message: 'No se encontró un envío con ese código de seguimiento.' }; }

    const type = await incidentTypeModel.getById(Number(incidentTypeId));
    if (!type || !type.active) { return { ok: false, status: 400, message: 'Tipo de incidencia inválido.' }; }

    let openedByPersonId = null;
    const docNumber = reporterDocument ? Number(String(reporterDocument).replace(/\D/g, '')) : null;
    if (docNumber) {
        if (shipment.sender && shipment.sender.document === docNumber)    { openedByPersonId = shipment.sender.id; }
        else if (shipment.recipient && shipment.recipient.document === docNumber) { openedByPersonId = shipment.recipient.id; }
    }

    const incident = await sequelize.transaction(async (t) => {
        const created = await Incident.create({
            shipmentId:       shipment.id,
            incidentTypeId:   type.id,
            status:           IncidentStatus.OPEN,
            priority:         2,
            escalated:        false,
            description:      String(description).trim().slice(0, 2000),
            openedChannel:    IncidentChannel.PORTAL,
            openedByPersonId,
            reporterName:     String(reporterName).trim().slice(0, 120),
            reporterEmail:    reporterEmail ? String(reporterEmail).trim().slice(0, 160) : null
        }, { transaction: t });

        await incidentHistoryModel.create({
            incidentId: created.id,
            eventType:  IncidentEventType.CREATED,
            toValue:    IncidentStatus.OPEN,
            comment:    `Reportada por ${reporterName} (portal público, ${type.code})`,
            personId:   openedByPersonId,
            transaction: t
        });

        return created;
    });

    return { ok: true, incident, shipment, type };
};

const createPublic = async (req, res) => {
    const result = await createIncidentFromPortal(req.body);
    if (!result.ok) {
        const types = await incidentTypeModel.getActive();
        return res.status(result.status).render('portal/incidentNew', {
            shipment: await findShipmentByTracking((req.body.trackingId || '').trim().toUpperCase()),
            trackingId: (req.body.trackingId || '').trim().toUpperCase(),
            types,
            error: result.message,
            form: req.body
        });
    }
    res.redirect(`/portal/incident/success?id=${result.incident.id}&trackingId=${encodeURIComponent(result.shipment.trackingId)}`);
};

// API JSON para el chatbot (wizard inline). Mismas validaciones que createPublic.
const createPublicApi = async (req, res) => {
    const result = await createIncidentFromPortal(req.body || {});
    if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.message });
    }
    res.json({
        ok: true,
        incidentId: result.incident.id,
        trackingId: result.shipment.trackingId,
        typeCode: result.type.code,
        typeDescription: result.type.description,
    });
};

// API JSON para que el bot liste tipos activos en su wizard.
const getIncidentTypesApi = async (req, res) => {
    const types = await incidentTypeModel.getActive();
    res.json(types.map(t => ({ id: t.id, code: t.code, description: t.description })));
};

const publicSuccess = (req, res) => {
    res.render('portal/incidentSuccess', {
        incidentId: req.query.id || null,
        trackingId: req.query.trackingId || null
    });
};

module.exports = { getPortal, getPublicCreateForm, createPublic, createPublicApi, getIncidentTypesApi, publicSuccess, createIncidentFromPortal };
