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
const incidentNotifConfig  = require('../services/incidentNotifConfig');
const {
    RoleType, IncidentStatus, IncidentResolution, IncidentChannel, IncidentEventType,
    ShipmentHistoryEvent, NotificationEvent, Status
} = require('../constants/enums');

const roleDescriptionById = Object.values(RoleType).reduce((acc, r) => {
    acc[r.id] = r.description;
    return acc;
}, {});

const STAFF_ROLES = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.ADMIN.id];
const isStaff      = (u) => STAFF_ROLES.includes(u?.roleId);
const isDelivery   = (u) => u?.roleId === RoleType.DELIVERY.id;
const isSupOrAdmin = (u) => u?.roleId === RoleType.SUPERVISOR.id || u?.roleId === RoleType.ADMIN.id;

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
    canReopen:       isSupOrAdmin(user) && incident.status === IncidentStatus.CLOSED
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
    res.render('incident/new', { shipment, types, branches, users: usersPayload, error: null, form: {} });
};

const create = async (req, res) => {
    const user = res.locals.currentUser;
    const { shipmentId, incidentTypeId, description, priority, branchId, assignedToUserId } = req.body;

    const renderFormError = async (errorMessage) => {
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
        return res.status(400).render('incident/new', {
            shipment: shipmentId ? await shipmentModel.getById(Number(shipmentId)) : null,
            types, branches, users: usersPayload,
            error: errorMessage,
            form: req.body
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
        return res.status(400).render('error', { message: 'Envío inválido' });
    }
    if (isDelivery(user) && shipment.deliveryUserId !== user.id) {
        return res.status(403).send('Acceso denegado: el repartidor solo puede reportar incidencias sobre envíos asignados a él');
    }

    const type = await incidentTypeModel.getById(Number(incidentTypeId));
    if (!type || !type.active) {
        return res.status(400).render('error', { message: 'Tipo de incidencia inválido' });
    }

    const openIncidents = await incidentModel.findOpenByShipment(shipment.id);
    const eligibilityError = incidentRules.getEligibilityError(shipment, type, openIncidents);
    if (eligibilityError) {
        return renderFormError(eligibilityError);
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

        return created;
    });

    notifyIncidentCreated(incident.id, shipment, type, { assignee, openedBy: user })
        .catch(e => console.error('[incident] notif:', e.message));

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

    if (cfg.notifyShipmentRecipient) {
        require('./shipment').notifyShipmentEvent(NotificationEvent.SHIPMENT_INCIDENT, shipment.id)
            .catch(e => console.error('[incident] notif SHIPMENT_INCIDENT:', e.message));
    }
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

    const [history, assignableUsers, branches] = await Promise.all([
        incidentHistoryModel.getByIncidentId(id),
        isSupOrAdmin(user) ? User.findAll({
            where: { roleId: [RoleType.OPERATOR.id, RoleType.SUPERVISOR.id, RoleType.ADMIN.id], active: true },
            attributes: ['id', 'fullName', 'roleId', 'branchId'],
            order: [['fullName', 'ASC']]
        }) : Promise.resolve([]),
        isSupOrAdmin(user) ? branchModel.getAll() : Promise.resolve([])
    ]);

    const assignableUsersPayload = assignableUsers.map(u => ({
        id:              u.id,
        fullName:        u.fullName,
        roleId:          u.roleId,
        roleDescription: roleDescriptionById[u.roleId] || '',
        branchId:        u.branchId
    }));

    res.render('incident/detail', {
        incident,
        history,
        assignableUsers: assignableUsersPayload,
        branches,
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
        userId:     user.id
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

    if (![IncidentStatus.OPEN, IncidentStatus.IN_REVIEW].includes(toStatus)) {
        return res.status(400).redirect(`/incident/${id}?error=invalid_status`);
    }
    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=closed`);
    }
    if (incident.status === toStatus) {
        return res.redirect(`/incident/${id}`);
    }

    const from = incident.status;
    await sequelize.transaction(async (t) => {
        await incident.update({ status: toStatus }, { transaction: t });
        await incidentHistoryModel.create({
            incidentId: id,
            eventType:  IncidentEventType.STATUS_CHANGE,
            fromValue:  from,
            toValue:    toStatus,
            comment:    comment || null,
            userId:     user.id,
            transaction: t
        });
    });
    res.redirect(`/incident/${id}`);
};

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

const close = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const { resolution, comment, shipmentAction } = req.body;

    if (![IncidentResolution.PROCEDENTE, IncidentResolution.NO_PROCEDENTE].includes(resolution)) {
        return res.status(400).redirect(`/incident/${id}?error=resolution_required`);
    }
    const VALID_ACTIONS = ['none', 'cancel'];
    const action = VALID_ACTIONS.includes(shipmentAction) ? shipmentAction : 'none';
    if (action !== 'none' && resolution !== IncidentResolution.PROCEDENTE) {
        return res.status(400).redirect(`/incident/${id}?error=action_requires_procedente`);
    }

    if (!comment || String(comment).trim().length === 0) {
        return res.status(400).redirect(`/incident/${id}?error=comment_required`);
    }
    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=already_closed`);
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

    res.redirect(`/incident/${id}`);
};

const reopen = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status !== IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=not_closed`);
    }
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
            comment:    req.body.comment || null,
            userId:     user.id,
            transaction: t
        });
    });
    res.redirect(`/incident/${id}`);
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
    list, getCreateForm, create, getDetail, addComment,
    assign, changeStatus, escalate, close, reopen, searchShipments,
    // Exportadas para que portal.js (flujo publico de confirmacion) y otros
    // controllers reutilicen el mismo pipeline de mails.
    notifyIncidentCreated, notifyIncidentAssigned
};
