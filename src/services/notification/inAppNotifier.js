// LGT-218: centro de notificaciones in-app. API para crear/consultar/marcar avisos por usuario.
// El aislamiento por usuario es duro: todas las lecturas/escrituras filtran por userId.
const { Op } = require('sequelize');
const { NotificationInApp } = require('../../models/notificationInApp');

const RETENTION_DAYS = 90;

// Crea una notificación in-app para un usuario. Fire-and-forget: nunca lanza al caller
// (un fallo de aviso no debe tumbar la acción de negocio que lo disparó).
const notify = async ({ userId, event = null, title, body = null, resourceType = null, resourceId = null, url = null }) => {
    try {
        if (!userId || !title) { return null; }
        return await NotificationInApp.create({
            userId,
            event,
            title: String(title).slice(0, 200),
            body: body ? String(body).slice(0, 4000) : null,
            resourceType,
            resourceId: (resourceId !== null && resourceId !== undefined) ? Number(resourceId) : null,
            url: url ? String(url).slice(0, 300) : null,
            readAt: null,
            createdAt: new Date(),
        });
    } catch (e) {
        console.error('[inApp] notify:', e.message);
        return null;
    }
};

// Crea la misma notificación para varios usuarios (deduplica ids). Devuelve cuántas creó.
const notifyMany = async (userIds, payload) => {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    let created = 0;
    for (const userId of ids) {
        const row = await notify({ ...payload, userId });
        if (row) { created += 1; }
    }
    return created;
};

const countUnread = (userId) =>
    NotificationInApp.count({ where: { userId, readAt: null } });

const listForUser = (userId, { limit = 50 } = {}) =>
    NotificationInApp.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit,
    });

// Marca una notificación como leída SOLO si pertenece al usuario (aislamiento).
// Devuelve la cantidad de filas afectadas (0 si no era suya o ya estaba leída).
const markRead = async (userId, id) => {
    const [affected] = await NotificationInApp.update(
        { readAt: new Date() },
        { where: { id, userId, readAt: null } }
    );
    return affected;
};

const markAllRead = async (userId) => {
    const [affected] = await NotificationInApp.update(
        { readAt: new Date() },
        { where: { userId, readAt: null } }
    );
    return affected;
};

const getOwned = (userId, id) =>
    NotificationInApp.findOne({ where: { id, userId } });

// Purga de retención (90 días). Pensada para un job; no se cablea acá.
const purgeOld = (days = RETENTION_DAYS) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return NotificationInApp.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
};

module.exports = { notify, notifyMany, countUnread, listForUser, markRead, markAllRead, getOwned, purgeOld, RETENTION_DAYS };
