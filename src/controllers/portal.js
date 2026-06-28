const { Shipment } = require('../models/shipment');
const shipmentModel = require('../models/shipment');
// NFAL07 (LGT-158): mensaje único cuando el link accionable ya no sirve.
const SELF_SERVICE_LINK_INVALID_MSG = 'Este enlace ya no es válido. Para gestionar tu envío ingresá al portal o contactá a soporte.';
const { Person } = require('../models/person');
const { Status } = require('../models/status');
const { Address } = require('../models/address');
const { Province } = require('../models/province');
const { TypeShipment } = require('../models/typeShipment');
const { Branch } = require('../models/branch');
const { applyStatusExposurePolicy, sanitizeChatbotComment } = require('../services/chatbot/publicPolicy');
const { enrichShipmentsForPortal } = require('../services/portalShipmentView');
const { submitPortalModification, canModifyShipment } = require('../services/portalModificationService');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { ShipmentHistoryEvent, NotificationEvent } = require('../constants/enums');
const settingModel = require('../models/setting');
const { URLSearchParams } = require('url');
const { resolveZone } = require('../services/zoneResolver.service');
const costSvc = require('../services/shipmentCostService');
const { PROVINCES } = require('../utils/provinces');
const { geocodePostalCode } = require('../services/geocode');

// Distancia en km con decimales (haversine). No reutilizamos utils/geo.js porque
// ese redondea a km enteros (min 1), demasiado tosco para ordenar/mostrar sucursales.
const haversineKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
};

// Cotizador público: presets de tamaño para que el cliente no tenga que conocer su
// volumen en m3. Cada preset mapea a un peso y volumen representativos. El front
// también permite carga manual ("avanzado").
const QUOTE_SIZE_PRESETS = {
    chico:   { weightKg: 1,  volumeM3: 0.005 },
    mediano: { weightKg: 5,  volumeM3: 0.03 },
    grande:  { weightKg: 15, volumeM3: 0.1 },
};

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
        // Incidencias reales del envío (campos seguros ya armados por buildPublicIncidents),
        // para que el chatbot pueda listarlas cuando el cliente consulta "incidencia".
        incidents: (shipment.incidents || []).map((inc) => ({
            id: inc.id,
            typeLabel: inc.typeLabel,
            statusLabel: inc.statusLabel,
            resolutionLabel: inc.resolutionLabel,
            createdAtLabel: inc.createdAtLabel,
            closedAtLabel: inc.closedAtLabel,
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

        const shipmentsWithHistory = await enrichShipmentsForPortal(shipments);
        // US-E05 / US-C02: trazabilidad de incidencias y seguimiento de recuperación (datos seguros).
        for (const s of shipmentsWithHistory) {
            s.incidents = await buildPublicIncidents(s.id);
            s.recovery  = await buildRecovery(s.id);
            s.returns   = await buildPublicReturns(s.id);
        }

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
const crypto               = require('crypto');
const incidentModel        = require('../models/incident');
const { Incident }         = incidentModel;
const incidentTypeModel    = require('../models/incidentType');
const incidentHistoryModel = require('../models/incidentHistory');
const incidentPendingModel = require('../models/incidentPendingConfirmation');
const incidentRules        = require('../services/incidentRules');
const { snapshotChecklist } = require('../services/incidentChecklist');
const { IncidentAttachment } = require('../models/incidentAttachment');
const { IncidentStatus, IncidentChannel, IncidentEventType } = require('../constants/enums');
const incidentEmailValidation = require('../services/incidentEmailValidation');
const { sendEmail }        = require('../services/notification/emailSender');

const CONFIRMATION_TTL_HOURS = 24;
const isDevMode = () => (process.env.NODE_ENV || 'development') !== 'production';
const appBaseUrl = () => process.env.APP_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const failedAttemptModel = require('../models/failedAttempt');

// Estados de incidencia con etiqueta amigable para el portal.
const INCIDENT_STATUS_LABEL = { OPEN: 'Abierta', IN_REVIEW: 'En revisión', CLOSED: 'Cerrada' };
const INCIDENT_RESOLUTION_LABEL = { PROCEDENTE: 'Procedente', NO_PROCEDENTE: 'No procedente' };

// US-E05: incidencias del envío con campos seguros para el cliente (sin datos internos).
const buildPublicIncidents = async (shipmentId) => {
    const { IncidentType } = require('../models/incidentType');
    const rows = await Incident.findAll({
        where: { shipmentId },
        attributes: ['id', 'status', 'resolution', 'createdAt', 'closedAt'],
        include: [{ model: IncidentType, as: 'type', attributes: ['description'] }],
        order: [['createdAt', 'DESC']],
    });
    return rows.map(r => {
        const j = r.toJSON();
        return {
            id:             j.id,
            typeLabel:      j.type ? j.type.description : 'Incidencia',
            statusLabel:    INCIDENT_STATUS_LABEL[j.status] || j.status,
            resolutionLabel: j.resolution ? (INCIDENT_RESOLUTION_LABEL[j.resolution] || j.resolution) : null,
            createdAtLabel: formatDate(j.createdAt),
            closedAtLabel:  j.closedAt ? formatDate(j.closedAt) : null,
        };
    });
};

// US-C02: seguimiento de recuperación / reprogramación (intentos fallidos), campos seguros.
const buildRecovery = async (shipmentId) => {
    const attempts = await failedAttemptModel.getByShipmentId(shipmentId);
    return attempts.map(a => {
        const j = a.toJSON ? a.toJSON() : a;
        return {
            attemptDateLabel:     formatDate(j.attemptDate),
            reason:               j.reason || null,
            suggestedDateLabel:   j.suggestedDate   ? formatDate(j.suggestedDate)   : null,
            rescheduledDateLabel: j.rescheduledDate ? formatDate(j.rescheduledDate) : null,
            status:               j.status || null,
        };
    });
};

const buildPublicReturns = async (shipmentId) => {
    const returnIncidentService = require('../services/returnIncidentService');
    const { ReturnReasonLabel } = require('../constants/enums');
    const rows = await returnIncidentService.listByShipment(shipmentId);
    return rows.map(r => {
        const j = r.toJSON ? r.toJSON() : r;
        return {
            id:          j.id,
            status:      j.status,
            statusLabel: returnIncidentService.portalStatusLabel(j),
            reasonLabel: ReturnReasonLabel[j.returnReason]  || j.returnReason || 'Devolución',
            createdAt:   j.createdAt,
        };
    });
};

const findShipmentByTracking = (trackingId) => {
    const t = (trackingId || '').trim();
    if (!t) { return null; }
    return Shipment.findOne({
        where: { trackingId: t.toUpperCase() },
        include: [
            { model: Person, as: 'sender',    attributes: ['id', 'fullName', 'document', 'email'] },
            { model: Person, as: 'recipient', attributes: ['id', 'fullName', 'document', 'email'] },
            { model: Status, as: 'status',    attributes: ['description'] }
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
            types: await incidentTypeModel.getClientFacing(),
            error: 'No se encontró un envío con ese código de seguimiento.',
            form: {}
        });
    }

    res.render('portal/incidentNew', {
        shipment,
        trackingId,
        types: await incidentTypeModel.getClientFacing(),
        error: null,
        form: {}
    });
};

// Logica compartida entre createPublic (form) y createPublicApi (JSON / bot).
// Ya NO crea la incidencia directamente: la deja en `incident_pending_confirmation`
// y manda un mail al reportante con un link para confirmar. Recien al confirmar
// se promueve a `incident` real (ver confirmIncident).
//
// Retorna:
//   { ok: true, pending: { token, email, expiresAt, devLink? }, shipment, type }
//   { ok: false, status, message }
const createIncidentFromPortal = async ({ trackingId, incidentTypeId, description, reporterName, reporterEmail, reporterDocument, otherTypeText, attachment }) => {
    const tracking = (trackingId || '').trim().toUpperCase();
    if (!tracking)                                                        { return { ok: false, status: 400, message: 'Código de seguimiento requerido.' }; }
    if (!incidentTypeId)                                                  { return { ok: false, status: 400, message: 'Seleccione un tipo de incidencia.' }; }
    if (!description || String(description).trim().length === 0)          { return { ok: false, status: 400, message: 'La descripción es obligatoria.' }; }
    if (!reporterName || String(reporterName).trim().length === 0)        { return { ok: false, status: 400, message: 'Su nombre es obligatorio.' }; }
    if (!reporterEmail || String(reporterEmail).trim().length === 0)      { return { ok: false, status: 400, message: 'El email es obligatorio para validar tu reporte.' }; }

    const shipment = await findShipmentByTracking(tracking);
    if (!shipment) { return { ok: false, status: 404, message: 'No se encontró un envío con ese código de seguimiento.' }; }

    const type = await incidentTypeModel.getById(Number(incidentTypeId));
    if (!type || !type.active) { return { ok: false, status: 400, message: 'Tipo de incidencia inválido.' }; }
    // Defensa: aunque la UI ya limita los tipos, rechazamos por las dudas si llega uno
    // que el cliente no debería poder reportar (form manipulado / type fuera del set).
    if (!incidentTypeModel.isClientFacing(type.code)) {
        return { ok: false, status: 400, message: 'Ese tipo de incidencia no está disponible para reportar desde el portal.' };
    }

    const openIncidents = await incidentModel.findOpenByShipment(shipment.id);
    // Mismas validaciones que el alta interna: duplicado del mismo tipo + estado
    // bloqueado, y además bloqueo de demora si el envío sigue dentro del plazo
    // (los canales cliente no tienen el "confirmar igual" del operador).
    const eligibilityError = incidentRules.getClientEligibilityError(shipment, type, openIncidents);
    // field: 'eligibility' → no es un problema de email; el chatbot NO debe mandar a
    // "cambiá el email" sino mostrar el motivo (ej: el envío aún no está demorado).
    if (eligibilityError) { return { ok: false, status: 400, field: 'eligibility', message: eligibilityError }; }

    // Validar que el email del reportante coincida con sender o recipient.
    const emailCheck = incidentEmailValidation.validateReporterEmail(shipment, reporterEmail);
    if (!emailCheck.ok) {
        return { ok: false, status: 400, field: 'email', message: emailCheck.message };
    }

    // Limpiar tokens expirados antes de insertar uno nuevo (lazy GC).
    incidentPendingModel.deleteExpired().catch(e => console.warn('[incident-pending] cleanup:', e.message));

    const token = crypto.randomBytes(24).toString('hex'); // 48 chars hex
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_HOURS * 60 * 60 * 1000);

    // Tipo "Otro": el cliente escribe el tipo libremente; lo anteponemos a la descripción
    // para que el operador lo vea (el tipo del catálogo sigue siendo OTHER).
    const otherTxt = String(otherTypeText || '').trim().slice(0, 80);
    const fullDescription = (type.code === 'OTHER' && otherTxt)
        ? `Tipo indicado por el cliente: ${otherTxt}.\n\n${String(description).trim()}`
        : String(description).trim();

    await incidentPendingModel.create({
        token,
        shipmentId:       shipment.id,
        incidentTypeId:   type.id,
        description:      fullDescription.slice(0, 2000),
        reporterName:     String(reporterName).trim().slice(0, 120),
        reporterEmail:    String(reporterEmail).trim().slice(0, 160),
        reporterDocument: reporterDocument ? String(reporterDocument).trim().slice(0, 20) : null,
        matchedPersonId:  emailCheck.matchedPersonId,
        matchedRole:      emailCheck.matchedRole,
        attachmentName:   attachment && attachment.dataBase64 ? String(attachment.fileName || 'evidencia').slice(0, 200) : null,
        attachmentMime:   attachment && attachment.dataBase64 ? attachment.mimeType : null,
        attachmentData:   attachment && attachment.dataBase64 ? attachment.dataBase64 : null,
        expiresAt
    });

    const confirmUrl = `${appBaseUrl()}/portal/incident/confirm?token=${encodeURIComponent(token)}`;
    const subject = `[LogiTrack] Confirmá tu reporte de incidencia sobre ${shipment.trackingId}`;
    const body =
`Hola ${String(reporterName).trim()},

Recibimos un reporte de incidencia sobre el envío ${shipment.trackingId}:
- Tipo: ${type.description}
- Descripción: ${String(description).trim().slice(0, 500)}

Para confirmar que sos vos quien lo reporta, hacé click en este link dentro de ${CONFIRMATION_TTL_HOURS} horas:

${confirmUrl}

Si no fuiste vos, podés ignorar este mail. La solicitud se descarta sola al expirar.

— LogiTrack`;

    let mailDelivered = false;
    try {
        const r = await sendEmail(String(reporterEmail).trim(), subject, body);
        mailDelivered = Boolean(r);
    } catch (e) {
        console.warn('[incident-pending] sendEmail fallo:', e.message);
    }

    const pending = {
        token,
        email: String(reporterEmail).trim(),
        expiresAt,
        mailDelivered,
        // En dev mostramos el link al reportante en pantalla. En prod NUNCA.
        devLink: isDevMode() && !mailDelivered ? confirmUrl : null
    };

    return { ok: true, pending, shipment, type };
};

// Promueve un pending a incident real. Llamado desde GET /portal/incident/confirm.
// Retorna { ok: true, incident, shipment } o { ok: false, status, message }.
const confirmIncidentByToken = async (rawToken) => {
    const token = String(rawToken || '').trim();
    if (!token) { return { ok: false, status: 400, message: 'Token inválido.' }; }

    const pending = await incidentPendingModel.findByToken(token);
    if (!pending) {
        return { ok: false, status: 404, message: 'No encontramos esa solicitud de confirmación. Puede haber expirado o ya haberse confirmado.' };
    }
    if (pending.expiresAt && new Date(pending.expiresAt) < new Date()) {
        await incidentPendingModel.deleteByToken(token).catch(() => {});
        return { ok: false, status: 410, message: 'La solicitud expiró. Volvé a iniciar el reporte desde el portal.' };
    }

    const shipment = await Shipment.findByPk(pending.shipmentId, {
        include: [
            { model: Person, as: 'sender',    attributes: ['id', 'fullName', 'document', 'email'] },
            { model: Person, as: 'recipient', attributes: ['id', 'fullName', 'document', 'email'] }
        ]
    });
    if (!shipment) {
        await incidentPendingModel.deleteByToken(token).catch(() => {});
        return { ok: false, status: 404, message: 'El envío referenciado ya no existe.' };
    }

    const type = await incidentTypeModel.getById(pending.incidentTypeId);
    if (!type || !type.active) {
        return { ok: false, status: 400, message: 'El tipo de incidencia ya no está disponible.' };
    }

    // Re-evaluamos elegibilidad: puede haber cambiado el estado del envio en este lapso.
    // Mismas reglas que el alta (incluye bloqueo de demora dentro de plazo y duplicados).
    const openIncidents = await incidentModel.findOpenByShipment(shipment.id);
    const eligibilityError = incidentRules.getClientEligibilityError(shipment, type, openIncidents);
    if (eligibilityError) {
        await incidentPendingModel.deleteByToken(token).catch(() => {});
        return { ok: false, status: 400, message: `No se puede confirmar el reporte: ${eligibilityError}` };
    }

    const incident = await sequelize.transaction(async (t) => {
        const created = await Incident.create({
            shipmentId:       shipment.id,
            incidentTypeId:   type.id,
            status:           IncidentStatus.OPEN,
            priority:         2,
            escalated:        false,
            description:      pending.description,
            openedChannel:    IncidentChannel.PORTAL,
            openedByPersonId: pending.matchedPersonId,
            reporterName:     pending.reporterName,
            reporterEmail:    pending.reporterEmail
        }, { transaction: t });

        await incidentHistoryModel.create({
            incidentId: created.id,
            eventType:  IncidentEventType.CREATED,
            toValue:    IncidentStatus.OPEN,
            comment:    `Reportada por ${pending.reporterName} y confirmada por email (${pending.matchedRole || 'sin match'}) — ${type.code}`,
            personId:   pending.matchedPersonId,
            transaction: t
        });

        // Snapshot del checklist de tareas para la incidencia recién confirmada.
        await snapshotChecklist(created.id, type.id, t);

        // Si el reportante adjuntó evidencia en el alta, la promovemos a la incidencia.
        if (pending.attachmentData) {
            await IncidentAttachment.create({
                incidentId:         created.id,
                fileName:           pending.attachmentName || 'evidencia',
                mimeType:           pending.attachmentMime || 'application/octet-stream',
                dataBase64:         pending.attachmentData,
                source:             'PORTAL',
                uploadedByPersonId: pending.matchedPersonId,
                createdAt:          new Date()
            }, { transaction: t });
            await incidentHistoryModel.create({
                incidentId: created.id,
                eventType:  IncidentEventType.EVIDENCE_ADDED,
                comment:    `Evidencia adjuntada desde el portal: ${String(pending.attachmentName || 'archivo').slice(0, 120)}`,
                personId:   pending.matchedPersonId,
                transaction: t
            });
        }

        await incidentPendingModel.IncidentPendingConfirmation.destroy({ where: { token }, transaction: t });

        return created;
    });

    // Disparar notificaciones (admin + otro extremo del envio, segun config y matchedRole).
    // Fire-and-forget: no bloquear la confirmacion si el mail falla.
    const { notifyIncidentCreated } = require('./incident');
    notifyIncidentCreated(incident.id, shipment, type, {
        assignee:      null,
        openedBy:      null,
        reporterName:  pending.reporterName,
        reporterEmail: pending.reporterEmail,
        matchedRole:   pending.matchedRole
    }).catch(e => console.error('[portal] notif incidencia confirmada:', e.message));
    // El aviso accionable de demora (SHIPMENT_DELAYED) ya lo dispara notifyIncidentCreated
    // para el tipo DELAY, así que no se reenvía acá (evita duplicado).

    return { ok: true, incident, shipment, type };
};

const ALLOWED_ATTACHMENT_MIME = ['image/jpeg', 'image/png', 'application/pdf'];

const buildAttachmentFromFile = (file) => {
    if (!file || !ALLOWED_ATTACHMENT_MIME.includes(file.mimetype)) { return null; }
    return {
        fileName:   file.originalname,
        mimeType:   file.mimetype,
        dataBase64: file.buffer.toString('base64')
    };
};

const createPublic = async (req, res) => {
    const result = await createIncidentFromPortal({ ...req.body, attachment: buildAttachmentFromFile(req.file) });
    if (!result.ok) {
        const types = await incidentTypeModel.getClientFacing();
        return res.status(result.status).render('portal/incidentNew', {
            shipment: await findShipmentByTracking((req.body.trackingId || '').trim().toUpperCase()),
            trackingId: (req.body.trackingId || '').trim().toUpperCase(),
            types,
            error: result.message,
            form: req.body
        });
    }
    // En vez de "incidencia creada", ahora mostramos "te enviamos un mail para confirmar".
    res.render('portal/incidentPending', {
        email:        result.pending.email,
        expiresAt:    result.pending.expiresAt,
        mailDelivered: result.pending.mailDelivered,
        devLink:      result.pending.devLink,
        trackingId:   result.shipment.trackingId
    });
};

// API JSON para el chatbot (wizard inline). Mismas validaciones que createPublic.
const createPublicApi = async (req, res) => {
    const result = await createIncidentFromPortal(req.body || {});
    if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.message });
    }
    res.json({
        ok: true,
        // El bot todavia no tiene un id de incidencia (esta pendiente). Le devolvemos
        // datos suficientes para guiar al usuario a confirmar por mail.
        pending: {
            email:         result.pending.email,
            expiresAt:     result.pending.expiresAt,
            mailDelivered: result.pending.mailDelivered,
            devLink:       result.pending.devLink || null
        },
        trackingId:      result.shipment.trackingId,
        typeCode:        result.type.code,
        typeDescription: result.type.description,
    });
};

// GET /portal/incident/confirm?token=... — el usuario click en el link del mail.
const confirmIncident = async (req, res) => {
    const result = await confirmIncidentByToken(req.query.token);
    if (!result.ok) {
        return res.status(result.status).render('portal/incidentConfirmError', {
            error: result.message
        });
    }
    res.render('portal/incidentConfirmed', {
        incidentId: result.incident.id,
        trackingId: result.shipment.trackingId,
        typeDescription: result.type.description
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

// =========================================================================
// Sprint 3 - 3.2 Autogestión del destinatario: ver y editar franja horaria,
// modalidad de entrega y comentarios estructurados del domicilio sin login.
// Acceso vía portalToken único por envío (no expone otros datos del sistema).
// =========================================================================
const getSelfServiceForm = async (req, res) => {
    try {
        const token = String(req.params.token || '');
        if (!token) { return res.status(400).render('error', { message: 'Token inválido' }); }
        const shipment = await Shipment.findOne({
            where: { portalToken: token },
            include: [
                { model: Person, as: 'recipient', attributes: ['fullName'], required: false },
                { model: Status, as: 'status',    attributes: ['description'], required: false },
                { model: Address, as: 'address',  required: false, include: [{ model: Province, as: 'province' }] },
                { model: Branch,  as: 'pickupBranch', required: false },
            ],
        });
        if (!shipment) { return res.status(404).render('error', { message: 'Envío no encontrado' }); }
        // NFAL07: link de un solo uso + vencimiento. Si ya se usó o venció, se rechaza.
        // Excepción: justo después de reprogramar (?saved=1) se muestra la confirmación.
        if (shipmentModel.selfServiceTokenState(shipment) !== 'ok' && req.query.saved !== '1') {
            return res.status(410).render('error', { status: 410, reason: SELF_SERVICE_LINK_INVALID_MSG });
        }
        // Sólo permite cambios mientras el envío esté Pendiente / En preparación / Asignado / En sucursal.
        const editable = canModifyShipment(shipment);
        const timeWindows = await require('../models/deliveryTimeWindow').getActive();
        const branches = await Branch.findAll({ where: { pickupEnabled: true, closed: false } });
        // Recalcula la fecha estimada para cada modalidad: el destinatario ve, en vivo,
        // cuándo recibiría a domicilio vs cuándo podría retirar por sucursal y decide.
        const { estimateDeliveryDate } = require('../utils/deliveryEstimate');
        const etaFmt = { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' };
        // Recálculo ML (urgencia express): nueva fecha más pronta para el envío demorado.
        // Si el ML no está disponible cae a una heurística rápida (no bloquea la carga).
        const expressEta = await require('../services/deliveryEtaPredictor').predictExpressEta(shipment);
        res.render('portal/selfService', {
            shipment,
            timeWindows,
            branches,
            editable,
            saved: req.query.saved === '1',
            accepted: req.query.accepted === '1',
            appliedCount: Number(req.query.applied) || 0,
            pendingCount: Number(req.query.pending) || 0,
            etaHomeLabel:   formatDate(estimateDeliveryDate({ mode: 'home' }), etaFmt),
            etaPickupLabel: formatDate(estimateDeliveryDate({ mode: 'branch_pickup' }), etaFmt),
            expressEtaLabel: formatDate(expressEta.date, etaFmt),
            expressEtaIso:   expressEta.date.toISOString().slice(0, 10),
            expressEtaSource: expressEta.source,
        });
    } catch (err) {
        console.error('getSelfServiceForm:', err.message);
        res.status(500).render('error', { message: 'Error al cargar autogestión' });
    }
};

const saveSelfService = async (req, res) => {
    try {
        const token = String(req.params.token || '');
        const shipment = await Shipment.findOne({
            where: { portalToken: token },
            include: [
                { model: Person, as: 'recipient', attributes: ['document'], required: false },
                { model: Status, as: 'status', attributes: ['description'], required: false },
                { model: Address, as: 'address', required: false },
            ],
        });
        if (!shipment) { return res.status(404).json({ error: 'Envío no encontrado' }); }
        // NFAL07: no permitir reprogramar con un link ya usado o vencido.
        if (shipmentModel.selfServiceTokenState(shipment) !== 'ok') {
            return res.status(410).render('error', { status: 410, reason: SELF_SERVICE_LINK_INVALID_MSG });
        }

        // ── Demora: el destinatario ACEPTA esperar la nueva fecha (recálculo express) ──
        // No cambia franja/modalidad, solo confirma la nueva fecha estimada. Antes este
        // caso caía en "No se detectaron cambios" y dejaba la página colgada; ahora se
        // persiste expectedDeliveryDate (visible en detalle de envío) y se consume el link.
        const wantsJson = (req.get('accept') || '').includes('application/json');
        if (req.body.action === 'accept_new_date') {
            if (!canModifyShipment(shipment)) {
                const msg = 'Este envío ya no admite cambios desde autogestión.';
                return wantsJson ? res.status(409).json({ ok: false, error: msg })
                    : res.status(409).render('error', { status: 409, reason: msg });
            }
            const iso = String(req.body.newExpectedDate || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(new Date(iso).getTime())) {
                const msg = 'La nueva fecha de entrega no es válida.';
                return wantsJson ? res.status(400).json({ ok: false, error: msg })
                    : res.status(400).render('error', { status: 400, reason: msg });
            }
            await Shipment.update({ expectedDeliveryDate: iso }, { where: { id: shipment.id } });
            await shipmentHistoryModel.create({
                shipmentId:   shipment.id,
                fromStatusId: shipment.statusId,
                toStatusId:   shipment.statusId,
                comment:      `El destinatario aceptó esperar la nueva fecha estimada de entrega (${iso}) desde autogestión por demora.`,
                userId:       null,
                eventType:    ShipmentHistoryEvent.MODIFICATION_APPLIED,
            }).catch(e => console.error('saveSelfService accept history:', e.message));
            // Aviso de reprogramación al cliente (best-effort).
            try {
                require('./shipment').notifyShipmentEvent(NotificationEvent.SHIPMENT_RESCHEDULED, shipment.id).catch(() => {});
            } catch { /* notif best-effort */ }
            await shipmentModel.markSelfServiceTokenUsed(shipment.id)
                .catch(e => console.error('markSelfServiceTokenUsed:', e.message));

            if (wantsJson) {
                return res.json({ ok: true, trackingId: shipment.trackingId, newDate: iso });
            }
            return res.redirect(`/portal/self-saved/${shipment.trackingId}?accepted=1`);
        }

        const result = await submitPortalModification({
            shipment,
            client: {
                document: shipment.recipient?.document ?? null,
                email: null,
            },
            body: req.body,
        });

        if (!result.ok) {
            const { estimateDeliveryDate } = require('../utils/deliveryEstimate');
            const etaFmt = { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' };
            return res.status(result.status || 400).render('portal/selfService', {
                shipment,
                timeWindows: await require('../models/deliveryTimeWindow').getActive(),
                branches: await Branch.findAll({ where: { pickupEnabled: true, closed: false } }),
                editable: canModifyShipment(shipment),
                saved: false,
                appliedCount: 0,
                pendingCount: 0,
                error: result.message,
                etaHomeLabel:   formatDate(estimateDeliveryDate({ mode: 'home' }), etaFmt),
                etaPickupLabel: formatDate(estimateDeliveryDate({ mode: 'branch_pickup' }), etaFmt),
            });
        }

        // NFAL07: consumir el link tras una reprogramación exitosa (un solo uso).
        await shipmentModel.markSelfServiceTokenUsed(shipment.id)
            .catch(e => console.error('markSelfServiceTokenUsed:', e.message));

        const qs = new URLSearchParams({ saved: '1' });
        if (result.applied?.length) { qs.set('applied', String(result.applied.length)); }
        if (result.pending?.length) { qs.set('pending', String(result.pending.length)); }
        res.redirect(`/portal/self-saved/${shipment.trackingId}?${qs.toString()}`);
    } catch (err) {
        console.error('saveSelfService:', err.message);
        res.status(500).json({ error: err.message });
    }
};

const getSelfServiceSaved = (req, res) => {
    const { trackingId } = req.params;
    const appliedCount = Number(req.query.applied) || 0;
    const pendingCount = Number(req.query.pending) || 0;
    res.render('portal/selfServiceSaved', {
        trackingId, appliedCount, pendingCount,
        accepted: req.query.accepted === '1',
    });
};

// Cotizador público (sin login). Muestra el formulario con el listado de provincias.
const getCotizador = async (req, res) => {
    const provinces = await Province.findAll({
        attributes: ['id', 'description'],
        order: [['description', 'ASC']],
    });
    res.render('portal/cotizar', { provinces });
};

// Estimación pública del costo de un envío. Reutiliza el mismo motor que el alta
// (resolveZone + computeCost) pero NO expone datos personales ni evalúa zonas
// peligrosas (liveDanger: false) para no revelar qué áreas están marcadas como
// peligrosas en una consulta pública. El valor es aproximado.
const cotizarPublic = async (req, res) => {
    try {
        const { provinceId, postalCode, size, weightKg, volumeM3, declaredValue } = req.body || {};

        const preset = QUOTE_SIZE_PRESETS[String(size || '').toLowerCase()];
        const w = preset ? preset.weightKg : Number(weightKg) || 0;
        const v = preset ? preset.volumeM3 : Number(volumeM3) || 0;

        if ((!provinceId && !postalCode) || w <= 0) {
            return res.json({ ok: false });
        }

        const zone = await resolveZone({
            postalCode: postalCode || null,
            provinceId: provinceId ? Number(provinceId) : null,
        });

        const pseudoShipment = {
            zone,
            weightKg: w,
            volumeM3: v,
            declaredValue: Number(declaredValue) || 0,
        };
        const breakdown = await costSvc.computeCost(pseudoShipment, { liveDanger: false });
        if (!breakdown) { return res.json({ ok: false }); }

        // Solo parámetros de tarifa, ningún dato de personas.
        return res.json({
            ok: true,
            zoneName: zone?.name || null,
            breakdown: {
                costoBase: breakdown.costoBase,
                zoneBase: breakdown.zoneBase,
                wSurcharge: breakdown.wSurcharge,
                vSurcharge: breakdown.vSurcharge,
                insurance: breakdown.insurance,
                final: breakdown.final,
            },
        });
    } catch (e) {
        console.error('[portal/cotizar]', e.message);
        return res.status(500).json({ ok: false });
    }
};

// Sucursales más cercanas para que el cliente sepa dónde despachar el paquete.
// Recibe la ubicación del cliente (lat/lng, típicamente de la geolocalización del
// navegador) y devuelve las sucursales operativas ordenadas por distancia. Solo
// expone datos de la empresa (nombre, dirección, teléfono), ningún dato personal.
// No afecta la cotización: es información orientativa para el cliente.
const sucursalesCercanas = async (req, res) => {
    try {
        let lat = Number(req.body?.lat);
        let lng = Number(req.body?.lng);
        let valid = Number.isFinite(lat) && Number.isFinite(lng)
            && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

        // Si no vino una ubicación válida pero sí un código postal, lo geocodificamos.
        if (!valid && req.body?.postalCode) {
            try {
                const geo = await geocodePostalCode(req.body.postalCode);
                lat = Number(geo.lat);
                lng = Number(geo.lng);
                valid = Number.isFinite(lat) && Number.isFinite(lng);
            } catch {
                return res.json({ ok: false, reason: 'geocode' });
            }
        }

        if (!valid) { return res.json({ ok: false }); }

        const branches = await Branch.findAll({
            where: { closed: false },
            attributes: ['name', 'address', 'phone', 'postalCode', 'provinceId', 'latitude', 'longitude'],
        });

        const nearest = branches
            .map((b) => {
                const blat = Number(b.latitude);
                const blng = Number(b.longitude);
                if (!Number.isFinite(blat) || !Number.isFinite(blng)) { return null; }
                return {
                    name: b.name,
                    address: b.address,
                    phone: b.phone || null,
                    postalCode: b.postalCode || null,
                    province: PROVINCES[b.provinceId]?.name || null,
                    lat: blat,
                    lng: blng,
                    distanceKm: Number(haversineKm(lat, lng, blat, blng).toFixed(1)),
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 5);

        return res.json({ ok: true, branches: nearest });
    } catch (e) {
        console.error('[portal/sucursales-cercanas]', e.message);
        return res.status(500).json({ ok: false });
    }
};

module.exports = { getPortal, getPublicCreateForm, createPublic, createPublicApi, confirmIncident, getIncidentTypesApi, publicSuccess, createIncidentFromPortal, confirmIncidentByToken, getSelfServiceForm, saveSelfService, getSelfServiceSaved, getCotizador, cotizarPublic, sucursalesCercanas };
