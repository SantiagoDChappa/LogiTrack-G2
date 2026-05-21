const sequelize = require('../database/connection');
const incidentModel        = require('../models/incident');
const incidentTypeModel    = require('../models/incidentType');
const incidentHistoryModel = require('../models/incidentHistory');
const { Incident }         = incidentModel;
const shipmentModel        = require('../models/shipment');
const { User }             = require('../models/user');
const {
    RoleType, IncidentStatus, IncidentResolution, IncidentChannel, IncidentEventType
} = require('../constants/enums');

const STAFF_ROLES = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.ADMIN.id];
const isStaff      = (u) => STAFF_ROLES.includes(u?.roleId);
const isDelivery   = (u) => u?.roleId === RoleType.DELIVERY.id;
const isSupOrAdmin = (u) => u?.roleId === RoleType.SUPERVISOR.id || u?.roleId === RoleType.ADMIN.id;

const incidentVisibleTo = (incident, user) => {
    if (!incident) { return false; }
    if (isStaff(user)) { return true; }
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

const list = async (req, res) => {
    const user = res.locals.currentUser;
    const filters = {
        status:            req.query.status   || null,
        priority:          req.query.priority ? Number(req.query.priority) : null,
        assignedToUserId:  req.query.assignedToUserId ? Number(req.query.assignedToUserId) : null,
        shipmentId:        req.query.shipmentId ? Number(req.query.shipmentId) : null
    };
    if (req.query.escalated === '1' || req.query.escalated === 'true')  { filters.escalated = true;  }
    if (req.query.escalated === '0' || req.query.escalated === 'false') { filters.escalated = false; }

    if (isDelivery(user)) {
        filters.deliveryUserId = user.id;
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
        canCreate: true
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

    const types = await incidentTypeModel.getActive();
    res.render('incident/new', { shipment, types, error: null, form: {} });
};

const create = async (req, res) => {
    const user = res.locals.currentUser;
    const { shipmentId, incidentTypeId, description, priority } = req.body;

    if (!shipmentId || !incidentTypeId || !description || description.trim().length === 0) {
        const types = await incidentTypeModel.getActive();
        return res.status(400).render('incident/new', {
            shipment: shipmentId ? await shipmentModel.getById(Number(shipmentId)) : null,
            types,
            error: 'shipmentId, tipo y descripción son obligatorios',
            form: req.body
        });
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

    const incident = await sequelize.transaction(async (t) => {
        const created = await Incident.create({
            shipmentId:     shipment.id,
            incidentTypeId: type.id,
            status:         IncidentStatus.OPEN,
            priority:       priority ? Math.min(4, Math.max(1, Number(priority))) : 2,
            escalated:      false,
            description:    description.trim().slice(0, 2000),
            openedChannel:  IncidentChannel.INTERNAL,
            openedByUserId: user.id
        }, { transaction: t });

        await incidentHistoryModel.create({
            incidentId: created.id,
            eventType:  IncidentEventType.CREATED,
            toValue:    IncidentStatus.OPEN,
            comment:    `Incidencia creada (${type.code})`,
            userId:     user.id,
            transaction: t
        });

        return created;
    });

    res.redirect(`/incident/${incident.id}`);
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

    const [history, assignableUsers] = await Promise.all([
        incidentHistoryModel.getByIncidentId(id),
        isSupOrAdmin(user) ? User.findAll({
            where: { roleId: [RoleType.OPERATOR.id, RoleType.SUPERVISOR.id], active: true },
            attributes: ['id', 'fullName'],
            order: [['fullName', 'ASC']]
        }) : Promise.resolve([])
    ]);

    res.render('incident/detail', {
        incident,
        history,
        assignableUsers,
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
    const { resolution, comment } = req.body;

    if (![IncidentResolution.PROCEDENTE, IncidentResolution.NO_PROCEDENTE].includes(resolution)) {
        return res.status(400).redirect(`/incident/${id}?error=resolution_required`);
    }
    const incident = await Incident.findByPk(id);
    if (!incident) { return res.status(404).send('Incidencia no encontrada'); }
    if (incident.status === IncidentStatus.CLOSED) {
        return res.status(400).redirect(`/incident/${id}?error=already_closed`);
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
            comment:    comment || null,
            userId:     user.id,
            transaction: t
        });
    });
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

module.exports = {
    list, getCreateForm, create, getDetail, addComment,
    assign, changeStatus, escalate, close, reopen
};
