const sequelize = require('../database/connection');
const incidentModel        = require('../models/incident');
const incidentTypeModel    = require('../models/incidentType');
const incidentHistoryModel = require('../models/incidentHistory');
const { Incident }         = incidentModel;
const shipmentModel        = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { User }             = require('../models/user');
const branchModel          = require('../models/branch');
const { sendEmail }        = require('../services/notification/emailSender');
const incidentRules        = require('../services/incidentRules');
const { Transport }        = require('../models/transport');
const incidentNotifConfig  = require('../services/incidentNotifConfig');
const { snapshotChecklist } = require('../services/incidentChecklist');
const incidentTaskModel    = require('../models/incidentTask');
const { IncidentTask }     = incidentTaskModel;
const incidentAttachmentModel = require('../models/incidentAttachment');
const { IncidentAttachment }  = incidentAttachmentModel;
const {
    RoleType, IncidentStatus, IncidentResolution, IncidentChannel, IncidentEventType,
    ShipmentHistoryEvent, NotificationEvent, Status, IncidentStatusLabel
} = require('../constants/enums');

const roleDescriptionById = Object.values(RoleType).reduce((acc, r) => {
    acc[r.id] = r.description;
    return acc;
}, {});

const STAFF_ROLES = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.ADMIN.id];
const isStaff      = (u) => STAFF_ROLES.includes(u?.roleId);
const isDelivery   = (u) => u?.roleId === RoleType.DELIVERY.id;
const isSupOrAdmin = (u) => u?.roleId === RoleType.SUPERVISOR.id || u?.roleId === RoleType.ADMIN.id;
const isOperator   = (u) => u?.roleId === RoleType.OPERATOR.id;

const { isDamageType } = require('../services/incidentDamageResolution');

// LGT-220: el Operador no puede cargar incidencias de paquete roto, así que esos tipos
// ni se le ofrecen en los selectores (defensa en UI; el backend igual lo rechaza).
const visibleTypesFor = (types, user) =>
    isOperator(user) ? types.filter(t => !isDamageType(t)) : types;

const incidentVisibleTo = (incident, user) => {
    if (!incident) { return false; }
    if (user?.roleId === RoleType.ADMIN.id) { return true; }
    if (isStaff(user)) {
        // Supervisor / operador: visible si el envio esta en su sucursal,
        // si la incidencia esta asignada a alguien de su sucursal,
        // o si fue asignada/abierta por el propio usuario.
        if (incident.assignedToUserId === user.id) { return true; }
        if (incident.openedByUserId   === user.id) { return true; }
        if (user.branchId) {
            if (incident.shipment   && incident.shipment.currentBranchId === user.branchId) { return true; }
            if (incident.assignedTo && incident.assignedTo.branchId      === user.branchId) { return true; }
        }
        return false;
    }
    if (isDelivery(user)) {
        if (incident.openedByUserId === user.id) { return true; }
        if (incident.shipment && incident.shipment.deliveryUserId === user.id) { return true; }
    }
    return false;
};

const computeActionFlags = (incident, user) => ({
    canComment:      isStaff(user) || (isDelivery(user) && incidentVisibleTo(incident, user)),
    canAssign:       isSupOrAdmin(user) && incident.status !== IncidentStatus.CLOSED,
    canChangeStatus: isSupOrAdmin(user) && incident.status !== IncidentStatus.CLOSED,
    canEscalate:     isSupOrAdmin(user) && incident.status !== IncidentStatus.CLOSED,
    canClose:        isSupOrAdmin(user) && incident.status !== IncidentStatus.CLOSED,
    canReopen:       isSupOrAdmin(user) && incident.status === IncidentStatus.CLOSED,
    // Tareas del checklist y evidencias: staff o repartidor con visibilidad, mientras no este cerrada.
    canManageTasks:  (isStaff(user) || isDelivery(user)) && incident.status !== IncidentStatus.CLOSED,
    canAttach:       (isStaff(user) || isDelivery(user)) && incident.status !== IncidentStatus.CLOSED
});

// Acepta '200', 'INC-200', 'INC200', ' 200 '. Devuelve el numero o null si no se reconoce.
const parseIncidentIdInput = (raw) => {
    if (raw === undefined || raw === null) { return null; }
    const m = String(raw).trim().match(/^(?:INC[-\s]?)?(\d+)$/i);
    return m ? Number(m[1]) : null;
};

const list = async (req, res) => {
    const user = res.locals.currentUser;
    const filters = {
        id:                parseIncidentIdInput(req.query.id),
        status:            req.query.status   || null,
        priority:          req.query.priority ? Number(req.query.priority) : null,
        assignedToUserId:  req.query.assignedToUserId ? Number(req.query.assignedToUserId) : null,
        shipmentId:        req.query.shipmentId ? Number(req.query.shipmentId) : null,
        // Búsqueda por código de envío (ej. "ENV-011").
        trackingId:        req.query.trackingId ? String(req.query.trackingId).trim() : null,
        openedChannel:     req.query.origin === 'EXTERNO' ? IncidentChannel.PORTAL
                          : req.query.origin === 'INTERNO' ? IncidentChannel.INTERNAL
                          : null,
        resolution:        req.query.resolution || null,
    };
    const rawIdInput = (req.query.id !== undefined && req.query.id !== null) ? String(req.query.id).trim() : '';
    const idInputInvalid = rawIdInput.length > 0 && filters.id === null;
    if (req.query.escalated === '1' || req.query.escalated === 'true')  { filters.escalated = true;  }
    if (req.query.escalated === '0' || req.query.escalated === 'false') { filters.escalated = false; }

    if (isDelivery(user)) {
        filters.deliveryUserId = user.id;
    }

    // RBAC staff no-admin: visible si el envio esta en su sucursal,
    // si la incidencia esta asignada a alguien de su sucursal, o asignada/abierta por el.
    if (isStaff(user) && user?.roleId !== RoleType.ADMIN.id) {
        filters.staffScope = { branchId: user.branchId || null, userId: user.id };
    }

    const [incidents, assignableUsers] = await Promise.all([
        incidentModel.list(filters),
        isSupOrAdmin(user) ? User.findAll({
            where: { roleId: [RoleType.OPERATOR.id, RoleType.SUPERVISOR.id, RoleType.ADMIN.id], active: true },
            attributes: ['id', 'fullName'],
            order: [['fullName', 'ASC']]
        }) : Promise.resolve([])
    ]);

    res.render('incident/list', {
        incidents,
        filters: req.query,
        assignableUsers,
        canCreate: true,
        idInputInvalid
    });
};

const getCreateForm = async (req, res) => {
    const user = res.locals.currentUser;
    const shipmentId = req.query.shipmentId ? Number(req.query.shipmentId) : null;

    let shipment = null;
    if (shipmentId) {
        shipment = await shipmentModel.getById(shipmentId);
        if (!shipment) {
            return res.status(404).render('error', { message: 'Envío no encontrado' });
        }
        if (isDelivery(user) && shipment.deliveryUserId !== user.id) {
            return res.status(403).send('Acceso denegado: el repartidor solo puede reportar incidencias sobre envíos asignados a él');
        }
    }

    const [types, branches, users] = await Promise.all([
        incidentTypeModel.getActive(),
        branchModel.getAll(),
        User.findAll({
            where: { active: true, roleId: STAFF_ROLES },
            attributes: ['id', 'fullName', 'roleId', 'branchId'],
            order: [['fullName', 'ASC']]
        })
    ]);
    const usersPayload = users.map(u => ({
        id:       u.id,
        fullName: u.fullName,
        roleId:   u.roleId,
        roleDescription: roleDescriptionById[u.roleId] || '',
        branchId: u.branchId
    }));
    // Si entramos desde un envío, pre-seleccionamos su sucursal actual (o "Sin sucursal" = 0)
    // para ahorrar clics: el picker la auto-selecciona y lista sus usuarios al cargar.
    const prefillForm = shipment
        ? { branchId: (shipment.currentBranchId !== null && shipment.currentBranchId !== undefined) ? String(shipment.currentBranchId) : '0' }
        : {};
    // Incidencias ya abiertas del envío: se le muestran al operador para que sepa qué
    // tiene asociado antes de crear otra (y no duplique un tipo ya abierto).
    const openIncidents = shipment ? await incidentModel.findOpenByShipmentWithType(shipment.id) : [];
    res.render('incident/new', { shipment, types: visibleTypesFor(types, user), branches, users: usersPayload, error: null, form: prefillForm, openIncidents });
};

// Datos para el modal rápido de incidencia (acción in-situ desde detalle/tabla de envíos):
// tipos activos + staff disponible. El front filtra los usuarios por la sucursal del envío.
const getQuickData = async (req, res) => {
    const user = res.locals.currentUser;
    const shipmentId = req.query.shipmentId ? Number(req.query.shipmentId) : null;
    const [types, users, openIncidents] = await Promise.all([
        incidentTypeModel.getActive(),
        User.findAll({
            where: { active: true, roleId: STAFF_ROLES },
            attributes: ['id', 'fullName', 'roleId', 'branchId'],
            order: [['fullName', 'ASC']]
        }),
        // Incidencias ya abiertas del envío (si se abrió el modal desde uno), para
        // avisarle al operador qué tiene asociado antes de crear otra.
        shipmentId ? incidentModel.findOpenByShipmentWithType(shipmentId) : Promise.resolve([])
    ]);
    res.json({
        types: visibleTypesFor(types, user).map(t => ({ id: t.id, code: t.code, description: t.description })),
        users: users.map(u => ({
            id: u.id, fullName: u.fullName, roleId: u.roleId,
            roleDescription: roleDescriptionById[u.roleId] || '', branchId: u.branchId
        })),
        incidents: openIncidents.map(i => ({
            id: i.id,
            status: i.status,
            statusLabel: IncidentStatusLabel[i.status] || i.status,
            typeCode: i.type ? i.type.code : null,
            typeLabel: i.type ? i.type.description : 'Sin tipo',
        })),
    });
};

const create = async (req, res) => {
    const user = res.locals.currentUser;
    const { shipmentId, incidentTypeId, description, priority, branchId, assignedToUserId } = req.body;
    // El modal rápido envía por fetch y espera JSON; el form clásico espera redirect/render.
    const wantsJson = (req.get('accept') || '').includes('application/json');

    const renderFormError = async (errorMessage) => {
        if (wantsJson) { return res.status(400).json({ error: errorMessage }); }
        const [types, branches, users] = await Promise.all([
            incidentTypeModel.getActive(),
            branchModel.getAll(),
            User.findAll({
                where: { active: true, roleId: STAFF_ROLES },
                attributes: ['id', 'fullName', 'roleId', 'branchId'],
                order: [['fullName', 'ASC']]
            })
        ]);
        const usersPayload = users.map(u => ({
            id: u.id, fullName: u.fullName, roleId: u.roleId,
            roleDescription: roleDescriptionById[u.roleId] || '', branchId: u.branchId
        }));
        const errShipment = shipmentId ? await shipmentModel.getById(Number(shipmentId)) : null;
        const errOpenIncidents = errShipment ? await incidentModel.findOpenByShipmentWithType(errShipment.id) : [];
        return res.status(400).render('incident/new', {
            shipment: errShipment,
            types, branches, users: usersPayload,
            error: errorMessage,
            form: req.body,
            openIncidents: errOpenIncidents
        });
    };

    const missing = [];
    if (!shipmentId)     { missing.push('envío'); }
    if (!incidentTypeId) { missing.push('tipo'); }
    if (!description || String(description).trim().length === 0) { missing.push('descripción'); }
    if (!branchId)       { missing.push('sucursal'); }
    if (!assignedToUserId) { missing.push('usuario asignado'); }
    if (missing.length) {
        return renderFormError('Faltan completar: ' + missing.join(', ') + '.');
    }

    const noBranch = Number(branchId) === 0;
    const branch = noBranch ? null : await branchModel.getById(Number(branchId));
    if (!noBranch && !branch) {
        return renderFormError('Sucursal inválida');
    }
    const assignee = await User.findOne({ where: { id: Number(assignedToUserId), active: true } });
    if (!assignee) {
        return renderFormError('Usuario asignado inválido');
    }
    if (!STAFF_ROLES.includes(assignee.roleId)) {
        return renderFormError('El usuario asignado no es staff');
    }
    if (noBranch) {
        if (assignee.branchId !== null) {
            return renderFormError('El usuario asignado pertenece a una sucursal, elegila en vez de "Sin sucursal"');
        }
    } else if (assignee.branchId !== branch.id) {
        return renderFormError('El usuario asignado no pertenece a la sucursal seleccionada');
    }

    const shipment = await shipmentModel.getById(Number(shipmentId));
    if (!shipment) {
        return wantsJson
            ? res.status(400).json({ error: 'Envío inválido' })
            : res.status(400).render('error', { message: 'Envío inválido' });
    }
    if (isDelivery(user) && shipment.deliveryUserId !== user.id) {
        const msg = 'Acceso denegado: el repartidor solo puede reportar incidencias sobre envíos asignados a él';
        return wantsJson ? res.status(403).json({ error: msg }) : res.status(403).send(msg);
    }

    const type = await incidentTypeModel.getById(Number(incidentTypeId));
    if (!type || !type.active) {
        return wantsJson
            ? res.status(400).json({ error: 'Tipo de incidencia inválido' })
            : res.status(400).render('error', { message: 'Tipo de incidencia inválido' });
    }

    // LGT-220: paquete roto solo lo cargan Supervisor/Admin, el repartidor asignado
    // (ya validado arriba) o el cliente por el portal. El Operador queda excluido en el
    // backend, además de no vérsele el tipo en la UI (defensa doble).
    if (isDamageType(type)) {
        const roleError = incidentRules.getDamageRoleError(user.roleId);
        if (roleError) {
            return wantsJson ? res.status(403).json({ error: roleError }) : renderFormError(roleError);
        }
    }

    const openIncidents = await incidentModel.findOpenByShipment(shipment.id);
    const eligibilityError = incidentRules.getEligibilityError(shipment, type, openIncidents);
    if (eligibilityError) {
        return renderFormError(eligibilityError);
    }
    // Warning soft (no bloquea): si la confirmación aún no llegó, devolvemos el form
    // con un mensaje pidiendo marcar la casilla "confirmWarning".
    // VEH_OUT_OF_SERVICE necesita el vehículo del driver del envío para armar el aviso.
    let transportForWarning = null;
    if (type.code === 'VEH_OUT_OF_SERVICE' && shipment.deliveryUserId) {
        transportForWarning = await Transport.findOne({ where: { driverUserId: shipment.deliveryUserId } });
    }
    const eligibilityWarning = incidentRules.getEligibilityWarning(shipment, type, { transport: transportForWarning });
    if (eligibilityWarning && req.body.confirmWarning !== '1') {
        return renderFormError(eligibilityWarning + ' Marcá "Confirmo crear igual" y reenviá el formulario.');
    }

    const incident = await sequelize.transaction(async (t) => {
        const created = await Incident.create({
            shipmentId:       shipment.id,
            incidentTypeId:   type.id,
            status:           IncidentStatus.OPEN,
            priority:         priority ? Math.min(4, Math.max(1, Number(priority))) : 2,
            escalated:        false,
            description:      description.trim().slice(0, 2000),
            openedChannel:    IncidentChannel.INTERNAL,
            openedByUserId:   user.id,
            assignedToUserId: assignee.id
        }, { transaction: t });

        await incidentHistoryModel.create({
            incidentId: created.id,
            eventType:  IncidentEventType.ASSIGNED,
            toValue:    String(assignee.id),
            comment:    `Asignada a ${assignee.fullName} (${roleDescriptionById[assignee.roleId] || ''})`,
            userId:     user.id,
            transaction: t
        });

        await incidentHistoryModel.create({
            incidentId: created.id,
            eventType:  IncidentEventType.CREATED,
            toValue:    IncidentStatus.OPEN,
            comment:    `Incidencia creada (${type.code})`,
            userId:     user.id,
            transaction: t
        });

        await shipmentHistoryModel.create({
            shipmentId:   shipment.id,
            fromStatusId: shipment.statusId,
            toStatusId:   shipment.statusId,
            eventType:    ShipmentHistoryEvent.INCIDENT_OPENED,
            comment:      `Incidencia #${created.id} (${type.code}) — ${description.trim().slice(0, 200)}`,
            userId:       user.id,
            transaction:  t
        });

        await snapshotChecklist(created.id, type.id, t);

        return created;
    });

    notifyIncidentCreated(incident.id, shipment, type, { assignee, openedBy: user })
        .catch(e => console.error('[incident] notif:', e.message));

    if (wantsJson) {
        return res.json({ ok: true, incidentId: incident.id, trackingId: shipment.trackingId });
    }
    res.redirect(`/incident/${incident.id}`);
};

// Notif al crear una incidencia. Se usa tanto desde el flujo interno (assignee
// + openedBy son usuarios staff) como desde el confirm del portal publico
// (assignee = null, openedBy = null, reporterEmail + matchedRole vienen del portal).
const notifyIncidentCreated = async (incidentId, shipment, type, ctx = {}) => {
    const { assignee = null, openedBy = null, reporterName = null, reporterEmail = null, matchedRole = null } = ctx;
    const cfg = await incidentNotifConfig.get();
    const emails = await incidentNotifConfig.resolveRecipients(cfg, {
        shipment, assignee, openedBy, reporterEmail, matchedRole
    });

    // Avisos accionables al cliente segun el tipo de incidencia. Los tipos donde el
    // cliente DEBE poder accionar (DELAY → reprogramar/retiro; PACKAGE_BROKEN →
    // reembolso/reemplazo) se disparan SIEMPRE, respetando solo la config propia del
    // evento (habilitado + destinatario) en Ajustes → Comunicaciones, sin depender del
    // toggle global de incidencias. Los tipos genericos siguen atados al toggle.
    const typeCode = type?.code;
    if (typeCode === 'DELAY') {
        // ENVÍO DEMORADO → siempre el aviso accionable (reprogramar / retiro), decide
        // la config del evento SHIPMENT_DELAYED (habilitado + destinatario).
        require('./shipment').notifyShipmentEvent(NotificationEvent.SHIPMENT_DELAYED, shipment.id, { _incidentId: String(incidentId) })
            .catch(e => console.error('[incident] notif SHIPMENT_DELAYED:', e.message));
    } else if (typeCode !== 'PACKAGE_BROKEN') {
        // Tipos genéricos: aviso informativo, atado al toggle global de incidencias (como antes).
        if (cfg.notifyShipmentRecipient && cfg.notifyOnGeneric !== false) {
            require('./shipment').notifyShipmentEvent(NotificationEvent.SHIPMENT_INCIDENT, shipment.id, { _incidentId: String(incidentId) })
                .catch(e => console.error('[incident] notif SHIPMENT_INCIDENT:', e.message));
        }
    }
    // LGT-204: PAQUETE DAÑADO → SIEMPRE avisar al cliente (destinatario/remitente/ambos según
    // el destinatario configurado en el evento SHIPMENT_PACKAGE_DAMAGED) para que elija
    // reembolso/reemplazo. Decide la config del evento, no el toggle global.
    require('../services/incidentDamageResolution').notifySenderIfDamage({ incidentId, shipment, type })
        .catch(e => console.error('[incident] notif daño cliente:', e.message));

    if (emails.length === 0) { return; }

    const reportedByLabel = openedBy
        ? (openedBy.fullName || openedBy.email || 'usuario interno')
        : (reporterName ? `${reporterName} (portal público)` : 'portal público');
    const assigneeLabel = assignee ? assignee.fullName : 'sin asignar';

    const subject = `[LogiTrack] Nueva incidencia #${incidentId} en envío ${shipment.trackingId || shipment.id}`;
    const body =
        `Se registró una nueva incidencia.\n\n` +
        `Incidencia: #${incidentId} (${type.code} - ${type.description})\n` +
        `Envío: ${shipment.trackingId || shipment.id}\n` +
        `Asignada a: ${assigneeLabel}\n` +
        `Reportada por: ${reportedByLabel}\n\n` +
        `Acceder al detalle: /incident/${incidentId}`;
    await sendEmail(emails.join(','), subject, body);
};

// Notif a un usuario cuando es asignado o reasignado a una incidencia.
// Se manda SIEMPRE (sin pasar por la config), porque es la accion intencional
// del admin/supervisor al asignar. Si el target no tiene email, skip silencioso.
const notifyIncidentAssigned = async (incidentId, shipment, type, targetUser, assignedBy) => {
    if (!targetUser || !targetUser.email) { return; }
    const assignedByLabel = assignedBy
        ? (assignedBy.fullName || assignedBy.email || 'un admin')
        : 'un admin';
    const subject = `[LogiTrack] Te asignaron la incidencia #${incidentId} en envío ${shipment.trackingId || shipment.id}`;
    const body =
        `${targetUser.fullName || ''},\n\n` +
        `Te asignaron la incidencia #${incidentId} (${type.code} - ${type.description})\n` +
        `Envío: ${shipment.trackingId || shipment.id}\n` +
        `Asignada por: ${assignedByLabel}\n\n` +
        `Acceder al detalle: /incident/${incidentId}`;
    await sendEmail(targetUser.email, subject, body);
};

const getDetail = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const incident = await incidentModel.findByIdFull(id);
    if (!incident) {
        return res.status(404).render('error', { message: 'Incidencia no encontrada' });
    }
    if (!incidentVisibleTo(incident, user)) {
        return res.status(403).send('Acceso denegado');
    }

    const [history, assignableUsers, branches, tasks, attachments] = await Promise.all([
        incidentHistoryModel.getByIncidentId(id),
        isSupOrAdmin(user) ? User.findAll({
            where: { roleId: [RoleType.OPERATOR.id, RoleType.SUPERVISOR.id, RoleType.ADMIN.id], active: true },
            attributes: ['id', 'fullName', 'roleId', 'branchId'],
            order: [['fullName', 'ASC']]
        }) : Promise.resolve([]),
        isSupOrAdmin(user) ? branchModel.getAll() : Promise.resolve([]),
        incidentTaskModel.getByIncidentId(id),
        incidentAttachmentModel.getMetaByIncidentId(id)
    ]);

    const assignableUsersPayload = assignableUsers.map(u => ({
        id:              u.id,
        fullName:        u.fullName,
        roleId:          u.roleId,
        roleDescription: roleDescriptionById[u.roleId] || '',
        branchId:        u.branchId
    }));

    const pendingRequired = tasks.filter(tk => tk.required && !tk.done).length;

    res.render('incident/detail', {
        incident,
        history,
        assignableUsers: assignableUsersPayload,
        branches,
        tasks,
        attachments,
        pendingRequired,
        flags: computeActionFlags(incident, user),
        query: req.query
    });
};

const addComment = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const { comment } = req.body;

    const incident = await incidentModel.findByIdFull(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (!incidentVisibleTo(incident, user)) { return res.status(403).send('Acceso denegado'); }
    if (!comment || comment.trim().length === 0) {
        return res.status(400).redirect(`/incident/${id}?error=comment_required`);
    }

    await incidentHistoryModel.create({
        incidentId: id,
        eventType:  IncidentEventType.COMMENT,
        comment:    comment.trim().slice(0, 2000),
        userId:     user.id,
        // "Solo comentar" del staff = interno: no se envía ni se ve en el portal.
        internal:   true,
    });
    res.redirect(`/incident/${id}`);
};

const assign = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const assignedToUserId = req.body.assignedToUserId ? Number(req.body.assignedToUserId) : null;

    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=closed`);
    }

    let targetUser = null;
    if (assignedToUserId) {
        targetUser = await User.findOne({ where: { id: assignedToUserId, active: true } });
        if (!targetUser || ![RoleType.OPERATOR.id, RoleType.SUPERVISOR.id, RoleType.ADMIN.id].includes(targetUser.roleId)) {
            return res.status(400).redirect(`/incident/${id}?error=invalid_user`);
        }
    }

    const previousId = incident.assignedToUserId;
    await sequelize.transaction(async (t) => {
        await incident.update({ assignedToUserId: targetUser ? targetUser.id : null }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId: id,
            eventType:  IncidentEventType.ASSIGNED,
            fromValue:  previousId ? String(previousId) : null,
            toValue:    targetUser ? String(targetUser.id) : null,
            comment:    targetUser ? `Asignada a ${targetUser.fullName}` : 'Desasignada',
            userId:     user.id,
            transaction: t
        });
    });

    // Notif al asignado si efectivamente cambio el asignado (no spammear si re-guardan el mismo).
    if (targetUser && targetUser.id !== previousId) {
        // Necesito el incident + shipment + type para armar el mail. El findByPk de arriba
        // no incluye relations; vuelvo a buscarlo con includes.
        const fullIncident = await incidentModel.findByIdFull(id).catch(() => null);
        if (fullIncident && fullIncident.shipment && fullIncident.type) {
            notifyIncidentAssigned(id, fullIncident.shipment, fullIncident.type, targetUser, user)
                .catch(e => console.error('[incident] notif assign:', e.message));
        }
    }

    res.redirect(`/incident/${id}`);
};

const changeStatus = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const { status: toStatus, comment } = req.body;

    if (!comment || String(comment).trim().length === 0) {
        return res.status(400).redirect(`/incident/${id}?error=comment_required`);
    }
    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=closed`);
    }
    // Única transición vía changeStatus: OPEN -> IN_REVIEW.
    // CLOSED se hace por close(); reapertura por reopen(); no se vuelve de IN_REVIEW a OPEN.
    if (!(incident.status === IncidentStatus.OPEN && toStatus === IncidentStatus.IN_REVIEW)) {
        return res.status(400).redirect(`/incident/${id}?error=invalid_transition`);
    }

    const from = incident.status;
    const cleanComment = String(comment).trim().slice(0, 2000);
    await sequelize.transaction(async (t) => {
        await incident.update({ status: toStatus }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId: id,
            eventType:  IncidentEventType.STATUS_CHANGE,
            fromValue:  from,
            toValue:    toStatus,
            comment:    cleanComment,
            userId:     user.id,
            transaction: t
        });
    });
    notifyIncidentStatusChange(incident.shipmentId, id, toStatus, cleanComment);
    res.redirect(`/incident/${id}`);
};

// Notifica al cliente el cambio de estado de una incidencia vía el sistema de
// plantillas editables (evento INCIDENT_STATUS_CHANGE). Fire-and-forget.
function notifyIncidentStatusChange(shipmentId, incidentId, toStatus, comentario) {
    if (!shipmentId) { return; }
    require('./shipment').notifyShipmentEvent(NotificationEvent.INCIDENT_STATUS_CHANGE, shipmentId, {
        incidentId,
        _incidentId: incidentId,   // habilita {{incidentUrl}} apuntando a ESTA incidencia
        incidentEstado: IncidentStatusLabel[toStatus] || toStatus,
        incidentComentario: comentario || '',
    }).catch((e) => console.error('notifyIncidentStatusChange:', e.message));
}

const escalate = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const escalate = req.body.escalate === 'true' || req.body.escalate === '1';
    const priorityRaw = req.body.priority ? Number(req.body.priority) : null;

    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=closed`);
    }

    const updates = {};
    let escalationEvent = null;
    if (incident.escalated !== escalate) {
        updates.escalated = escalate;
        escalationEvent = escalate ? IncidentEventType.ESCALATED : IncidentEventType.UNESCALATED;
    }
    let priorityChanged = false;
    const prevPriority = incident.priority;
    if (priorityRaw && priorityRaw >= 1 && priorityRaw <= 4 && priorityRaw !== incident.priority) {
        updates.priority = priorityRaw;
        priorityChanged = true;
    }

    if (Object.keys(updates).length === 0) {
        return res.redirect(`/incident/${id}`);
    }

    await sequelize.transaction(async (t) => {
        await incident.update(updates, { transaction: t });
        if (escalationEvent) {
            await incidentHistoryModel.create({
                incidentId: id,
                eventType:  escalationEvent,
                comment:    req.body.comment || null,
                userId:     user.id,
                transaction: t
            });
        }
        if (priorityChanged) {
            await incidentHistoryModel.create({
                incidentId: id,
                eventType:  IncidentEventType.PRIORITY_CHANGE,
                fromValue:  String(prevPriority),
                toValue:    String(updates.priority),
                userId:     user.id,
                transaction: t
            });
        }
    });
    res.redirect(`/incident/${id}`);
};

// Setea SOLO la resolución (procedente / no procedente). NO cierra la incidencia.
// Cerrar es un paso separado (POST /:id/close) que requiere resolución ya marcada.
const setResolution = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const { resolution, comment } = req.body;

    if (![IncidentResolution.PROCEDENTE, IncidentResolution.NO_PROCEDENTE].includes(resolution)) {
        return res.status(400).redirect(`/incident/${id}?error=resolution_required`);
    }
    if (!comment || String(comment).trim().length === 0) {
        return res.status(400).redirect(`/incident/${id}?error=comment_required`);
    }
    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=closed`);
    }

    const prev = incident.resolution || null;
    const cleanComment = String(comment).trim().slice(0, 2000);
    await sequelize.transaction(async (t) => {
        await incident.update({ resolution }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId: id,
            eventType:  IncidentEventType.COMMENT,
            fromValue:  prev,
            toValue:    resolution,
            comment:    `Resolución marcada como ${resolution}. ${cleanComment}`,
            userId:     user.id,
            transaction: t
        });
    });
    res.redirect(`/incident/${id}`);
};

const close = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const { comment, shipmentAction } = req.body;

    const VALID_ACTIONS = ['none', 'cancel'];
    const action = VALID_ACTIONS.includes(shipmentAction) ? shipmentAction : 'none';

    if (!comment || String(comment).trim().length === 0) {
        return res.status(400).redirect(`/incident/${id}?error=comment_required`);
    }
    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=already_closed`);
    }
    // La resolución debe haber sido marcada antes via /resolution.
    const resolution = incident.resolution;
    if (![IncidentResolution.PROCEDENTE, IncidentResolution.NO_PROCEDENTE].includes(resolution)) {
        return res.status(400).redirect(`/incident/${id}?error=resolution_required_before_close`);
    }
    if (action !== 'none' && resolution !== IncidentResolution.PROCEDENTE) {
        return res.status(400).redirect(`/incident/${id}?error=action_requires_procedente`);
    }

    // No se puede cerrar si quedan tareas obligatorias del checklist sin completar.
    const pendingRequired = await incidentTaskModel.countPendingRequired(id);
    if (pendingRequired > 0) {
        return res.status(400).redirect(`/incident/${id}?error=checklist_incomplete`);
    }

    const shipment = await shipmentModel.getById(incident.shipmentId);
    const TERMINAL = [Status.DELIVERED.id, Status.CANCELLED.id];
    if (action === 'cancel' && shipment && TERMINAL.includes(shipment.statusId)) {
        return res.status(400).redirect(`/incident/${id}?error=shipment_already_terminal`);
    }

    const from = incident.status;
    await sequelize.transaction(async (t) => {
        await incident.update({
            status:         IncidentStatus.CLOSED,
            resolution,
            closedByUserId: user.id,
            closedAt:       new Date()
        }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId: id,
            eventType:  IncidentEventType.CLOSED,
            fromValue:  from,
            toValue:    resolution,
            comment:    String(comment).trim(),
            userId:     user.id,
            transaction: t
        });

        if (action === 'cancel' && shipment) {
            const prevStatusId = shipment.statusId;
            await shipmentModel.updateStatus(shipment.id, Status.CANCELLED.id, { transaction: t });
            await shipmentHistoryModel.create({
                shipmentId:   shipment.id,
                fromStatusId: prevStatusId,
                toStatusId:   Status.CANCELLED.id,
                eventType:    ShipmentHistoryEvent.STATUS_CHANGE,
                comment:      `Cancelado por resolución de incidencia #${id} (devolución)`,
                userId:       user.id,
                transaction:  t
            });
        }
    });

    if (action === 'cancel') {
        require('./shipment').notifyShipmentEvent(NotificationEvent.SHIPMENT_CANCELLED, incident.shipmentId)
            .catch(e => console.error('[incident] notif CANCELLED:', e.message));
    }
    // Aviso al cliente: la incidencia se cerró (con comentario explicativo).
    notifyIncidentStatusChange(incident.shipmentId, id, IncidentStatus.CLOSED, String(comment).trim());

    res.redirect(`/incident/${id}`);
};

const reopen = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const { comment } = req.body;
    if (!comment || String(comment).trim().length === 0) {
        return res.status(400).redirect(`/incident/${id}?error=comment_required`);
    }
    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status !== IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=not_closed`);
    }
    const cleanComment = String(comment).trim().slice(0, 2000);
    await sequelize.transaction(async (t) => {
        await incident.update({
            status:         IncidentStatus.IN_REVIEW,
            resolution:     null,
            closedByUserId: null,
            closedAt:       null
        }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId: id,
            eventType:  IncidentEventType.REOPENED,
            toValue:    IncidentStatus.IN_REVIEW,
            comment:    cleanComment,
            userId:     user.id,
            transaction: t
        });
    });
    notifyIncidentStatusChange(incident.shipmentId, id, IncidentStatus.IN_REVIEW, cleanComment);
    res.redirect(`/incident/${id}`);
};

// Marca/desmarca una tarea del checklist. RBAC: staff o repartidor con visibilidad.
const toggleTask = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const taskId = Number(req.params.taskId);

    const incident = await incidentModel.findByIdFull(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (!incidentVisibleTo(incident, user)) { return res.status(403).send('Acceso denegado'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=closed`);
    }

    const task = await IncidentTask.findOne({ where: { id: taskId, incidentId: id } });
    if (!task) { return res.status(404).redirect(`/incident/${id}?error=task_not_found`); }

    const nowDone = !task.done;
    await sequelize.transaction(async (t) => {
        await task.update({
            done:         nowDone,
            doneByUserId: nowDone ? user.id : null,
            doneAt:       nowDone ? new Date() : null
        }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId: id,
            eventType:  IncidentEventType.CHECKLIST_ITEM,
            toValue:    nowDone ? 'DONE' : 'PENDING',
            comment:    `${nowDone ? 'Completó' : 'Reabrió'} tarea: ${task.description}`,
            userId:     user.id,
            transaction: t
        });
    });
    res.redirect(`/incident/${id}#checklist`);
};

// Carga de evidencia (foto/PDF) a una incidencia. Usa multer memoryStorage.
const uploadAttachment = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);

    const incident = await incidentModel.findByIdFull(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (!incidentVisibleTo(incident, user)) { return res.status(403).send('Acceso denegado'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=closed`);
    }
    if (!req.file) {
        return res.status(400).redirect(`/incident/${id}?error=file_required`);
    }
    const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!ALLOWED.includes(req.file.mimetype)) {
        return res.status(400).redirect(`/incident/${id}?error=file_type`);
    }

    await sequelize.transaction(async (t) => {
        await IncidentAttachment.create({
            incidentId:       id,
            fileName:         String(req.file.originalname || 'evidencia').slice(0, 200),
            mimeType:         req.file.mimetype,
            dataBase64:       req.file.buffer.toString('base64'),
            source:           'INTERNAL',
            uploadedByUserId: user.id,
            createdAt:        new Date()
        }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId: id,
            eventType:  IncidentEventType.EVIDENCE_ADDED,
            comment:    `Evidencia adjuntada: ${String(req.file.originalname || 'archivo').slice(0, 120)}`,
            userId:     user.id,
            transaction: t
        });
    });
    res.redirect(`/incident/${id}#evidencias`);
};

// Descarga/visualización de una evidencia.
const downloadAttachment = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const attId = Number(req.params.attId);

    const incident = await incidentModel.findByIdFull(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (!incidentVisibleTo(incident, user)) { return res.status(403).send('Acceso denegado'); }

    const att = await incidentAttachmentModel.getById(attId);
    if (!att || att.incidentId !== id) { return res.status(404).send('Evidencia no encontrada'); }

    const buffer = Buffer.from(att.dataBase64, 'base64');
    res.setHeader('Content-Disposition', `inline; filename="${att.fileName.replace(/"/g, '')}"`);
    res.type(att.mimeType).send(buffer);
};

// Autocomplete de envíos para el form de alta de incidencia.
// Acepta `q` (tracking parcial, nombre destinatario, o ID exacto).
// Respeta RBAC: el repartidor sólo ve envíos asignados a él.
const searchShipments = async (req, res) => {
    const { Op } = require('sequelize');
    const { Shipment } = require('../models/shipment');
    const { Person }   = require('../models/person');
    const { Address }  = require('../models/address');
    const { Status }   = require('../models/status');
    const user = res.locals.currentUser;

    const q = String(req.query.q || '').trim();
    if (q.length < 1) { return res.json([]); }

    const where = {};
    const asNum = Number(q);
    if (Number.isInteger(asNum) && asNum > 0) {
        where[Op.or] = [
            { id: asNum },
            { trackingId: { [Op.iLike]: `%${q}%` } },
        ];
    } else {
        where.trackingId = { [Op.iLike]: `%${q}%` };
    }
    if (isDelivery(user)) {
        where.deliveryUserId = user.id;
    }

    const recipientWhere = q && !Number.isInteger(asNum) ? { fullName: { [Op.iLike]: `%${q}%` } } : null;

    const baseRows = await Shipment.findAll({
        where,
        include: [
            { model: Person,  as: 'recipient' },
            { model: Address, as: 'address' },
            { model: Status,  as: 'status', attributes: ['id', 'description'] },
        ],
        limit: 10,
        order: [['createdAt', 'DESC']],
    });

    // Si el query parece nombre y no encontramos por tracking, hacemos un segundo lookup por destinatario.
    let extraRows = [];
    if (recipientWhere && baseRows.length < 10) {
        const baseIds = baseRows.map(r => r.id);
        const extraWhere = baseIds.length > 0 ? { id: { [Op.notIn]: baseIds } } : {};
        if (isDelivery(user)) { extraWhere.deliveryUserId = user.id; }
        extraRows = await Shipment.findAll({
            where: extraWhere,
            include: [
                { model: Person,  as: 'recipient', where: recipientWhere, required: true },
                { model: Address, as: 'address' },
                { model: Status,  as: 'status', attributes: ['id', 'description'] },
            ],
            limit: 10 - baseRows.length,
            order: [['createdAt', 'DESC']],
        });
    }

    const rows = [...baseRows, ...extraRows].slice(0, 10);
    res.json(rows.map(s => ({
        id:             s.id,
        trackingId:     s.trackingId,
        recipientName:  s.recipient ? s.recipient.fullName : '',
        addressLine:    s.address ? `${s.address.street || ''} ${s.address.number || ''}`.trim() : '',
        statusLabel:    s.status ? s.status.description : '',
    })));
};

module.exports = {
    list, getCreateForm, create, getQuickData, getDetail, addComment,
    assign, changeStatus, escalate, setResolution, close, reopen, searchShipments,
    toggleTask, uploadAttachment, downloadAttachment,
    // Exportadas para que portal.js (flujo publico de confirmacion) y otros
    // controllers reutilicen el mismo pipeline de mails.
    notifyIncidentCreated, notifyIncidentAssigned
};
