// Última Milla — lógica del chat de entrega. El chat es por envío y efímero: vive sólo
// mientras la entrega está en curso. Ni el cliente ni el repartidor ven el teléfono del
// otro; todo queda registrado en delivery_chat_message.
const { DeliveryChat, ChatStatus } = require('../models/deliveryChat');
const { DeliveryChatMessage, SenderRole } = require('../models/deliveryChatMessage');

const MAX_BODY = 1000;

const sanitize = (body) => String(body || '').replace(/\s+$/g, '').slice(0, MAX_BODY).trim();

// Abre el chat del envío si no hay uno abierto. Devuelve el chat (existente o nuevo).
async function ensureOpen(shipmentId, routeStopId = null) {
    const existing = await DeliveryChat.findOne({
        where: { shipmentId, status: ChatStatus.OPEN },
        order: [['id', 'DESC']],
    });
    if (existing) { return existing; }
    return DeliveryChat.create({ shipmentId, routeStopId, status: ChatStatus.OPEN });
}

// Cierra el/los chats abiertos del envío (al entregar o marcar fallido).
async function close(shipmentId) {
    await DeliveryChat.update(
        { status: ChatStatus.CLOSED, closedAt: new Date() },
        { where: { shipmentId, status: ChatStatus.OPEN } }
    );
}

async function getOpenByShipment(shipmentId) {
    return DeliveryChat.findOne({
        where: { shipmentId, status: ChatStatus.OPEN },
        order: [['id', 'DESC']],
    });
}

// Estado + mensajes del chat de un envío. since = id de mensaje ya visto (para polling).
// Devuelve { chatId, status, open, messages } o { status:'NONE', open:false } si no hay chat.
async function getThread(shipmentId, sinceId = 0) {
    const chat = await DeliveryChat.findOne({
        where: { shipmentId },
        order: [['id', 'DESC']],
    });
    if (!chat) { return { status: 'NONE', open: false, chatId: null, messages: [] }; }
    const { Op } = require('sequelize');
    const where = { chatId: chat.id };
    if (Number(sinceId) > 0) { where.id = { [Op.gt]: Number(sinceId) }; }
    const rows = await DeliveryChatMessage.findAll({ where, order: [['id', 'ASC']] });
    return {
        status:  chat.status,
        open:    chat.status === ChatStatus.OPEN,
        chatId:  chat.id,
        messages: rows.map(m => ({ id: m.id, role: m.senderRole, body: m.body, at: m.createdAt })),
    };
}

// Agrega un mensaje. Sólo si hay chat abierto. Devuelve el mensaje o null si no se pudo.
async function addMessage(shipmentId, role, rawBody) {
    const body = sanitize(rawBody);
    if (!body) { return null; }
    const senderRole = role === SenderRole.DRIVER ? SenderRole.DRIVER : SenderRole.CLIENT;
    const chat = await getOpenByShipment(shipmentId);
    if (!chat) { return null; }
    const msg = await DeliveryChatMessage.create({ chatId: chat.id, senderRole, body });
    return { id: msg.id, role: msg.senderRole, body: msg.body, at: msg.createdAt };
}

// Cierra todos los chats abiertos de los envíos de una ruta (al finalizar/cancelar/
// interrumpir la ruta — la entrega ya no continúa).
async function closeForRoute(routeId) {
    const sequelize = require('../database/connection');
    await sequelize.query(
        `UPDATE logitrack.delivery_chat
            SET "status" = 'CLOSED', "closed_at" = NOW()
          WHERE "status" = 'OPEN'
            AND "shipment_id" IN (
                SELECT "shipment_id" FROM logitrack.route_stop
                 WHERE "route_id" = :rid AND "shipment_id" IS NOT NULL)`,
        { replacements: { rid: Number(routeId) } }
    );
}

// Resuelve el id de envío a partir del código de seguimiento (lado cliente del portal).
async function shipmentIdByTracking(trackingId) {
    const { Shipment } = require('../models/shipment');
    const s = await Shipment.findOne({ where: { trackingId }, attributes: ['id'] });
    return s ? s.id : null;
}

module.exports = {
    ensureOpen, close, closeForRoute, getOpenByShipment, getThread, addMessage, shipmentIdByTracking,
    SenderRole, MAX_BODY,
};
