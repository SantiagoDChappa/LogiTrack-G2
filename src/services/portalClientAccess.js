const crypto = require('crypto');
const JWT = require('jsonwebtoken');
const { normalize } = require('./incidentEmailValidation');
const shipmentModel = require('../models/shipment');
const portalClientAccessPendingModel = require('../models/portalClientAccessPending');
const { sendEmail } = require('./notification/emailSender');
const emailTemplateModel = require('../models/emailTemplate');
const placeholders = require('./notificationPlaceholders');
const { NotificationEvent } = require('../constants/enums');

const CONFIRMATION_TTL_HOURS = 24;
const SESSION_HOURS = 8;
const COOKIE_NAME = 'portal_client';

const isDevMode = () => (process.env.NODE_ENV || 'development') !== 'production';
const appBaseUrl = () => process.env.APP_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const parseDocument = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    const docNum = Number(digits);
    if (!digits || !docNum || docNum <= 0) { return null; }
    return docNum;
};

const assertClientOwnsShipment = (shipment, { document, email }) => {
    if (!shipment) { return false; }
    const docNum = Number(document);
    const emailNorm = normalize(email);
    const json = typeof shipment.toJSON === 'function' ? shipment.toJSON() : shipment;
    const senderMatch = json.sender?.document === docNum
        && normalize(json.sender?.email) === emailNorm;
    const recipientMatch = json.recipient?.document === docNum
        && normalize(json.recipient?.email) === emailNorm;
    return senderMatch || recipientMatch;
};

const validateClientCredentials = async (document, email) => {
    const docNum = parseDocument(document);
    const emailNorm = normalize(email);

    if (!docNum) {
        return { ok: false, code: 'invalid_document', message: 'Ingresá un DNI válido (solo números).' };
    }
    if (!emailNorm) {
        return { ok: false, code: 'invalid_email', message: 'El email es obligatorio.' };
    }

    const count = await shipmentModel.countByClientIdentity({ document: docNum, email: emailNorm });
    if (count === 0) {
        return {
            ok: false,
            code: 'no_shipments',
            message: 'No se encontraron envíos vinculados a esos datos.',
        };
    }

    return { ok: true, document: docNum, email: emailNorm };
};

const signPortalClientSession = ({ document, email }) => JWT.sign(
    { type: 'portal_client', document: Number(document), email: normalize(email) },
    process.env.JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h` }
);

const verifyPortalClientSession = (token) => {
    try {
        const decoded = JWT.verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'portal_client' || !decoded.document || !decoded.email) {
            return null;
        }
        return { document: Number(decoded.document), email: normalize(decoded.email) };
    } catch {
        return null;
    }
};

const requestAccess = async ({ document, email }) => {
    const validation = await validateClientCredentials(document, email);
    if (!validation.ok) { return validation; }

    portalClientAccessPendingModel.deleteExpired().catch(() => {});

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_HOURS * 60 * 60 * 1000);

    await portalClientAccessPendingModel.create({
        token,
        document: validation.document,
        email: validation.email,
        expiresAt,
    });

    const confirmUrl = `${appBaseUrl()}/portal/mis-envios/confirm?token=${encodeURIComponent(token)}`;

    // Plantilla editable desde Ajustes → Comunicaciones (evento PORTAL_CLIENT_ACCESS).
    // Si no existe la fila (migración no corrida), se usa el texto por defecto.
    // Es un mail transaccional: se envía siempre (no respeta toggle de "habilitado").
    const tplVars = { confirmUrl, ttlHoras: CONFIRMATION_TTL_HOURS };
    let subject = '[LogiTrack] Confirmá el acceso a tus envíos';
    let body = `Hola,

Recibimos una solicitud para consultar tus envíos en el portal de LogiTrack.

Para continuar, confirmá tu acceso haciendo click en el siguiente enlace (válido por ${CONFIRMATION_TTL_HOURS} horas):

${confirmUrl}

Si no solicitaste este acceso, ignorá este mensaje.

Saludos,
Equipo LogiTrack`;
    let format = 'text';
    try {
        const tpl = await emailTemplateModel.getDefaultByEventCode(NotificationEvent.PORTAL_CLIENT_ACCESS);
        if (tpl) {
            subject = placeholders.render(tpl.subject, tplVars) || subject;
            body    = placeholders.render(tpl.body, tplVars)    || body;
            format  = tpl.format === 'html' ? 'html' : 'text';
        }
    } catch (err) {
        console.warn('[portal-access] no se pudo cargar plantilla, uso texto por defecto:', err.message);
    }

    // Envío en segundo plano (fire-and-forget): no bloqueamos la respuesta para que
    // el portal redirija de inmediato a "revisá tu correo" en vez de quedar cargando
    // esperando al SMTP. El resultado se loguea para diagnóstico.
    const dev = isDevMode();
    sendEmail(validation.email, subject, body, format)
        .then((ok) => {
            if (ok) {
                console.log(`[portal-access] mail de confirmación enviado a ${validation.email}`);
            } else {
                console.warn(`[portal-access] sendEmail devolvió false para ${validation.email} (revisar config SMTP / logs [email] ERROR)`);
            }
        })
        .catch((err) => console.error(`[portal-access] excepción enviando mail a ${validation.email}:`, err.message));

    return {
        ok: true,
        pending: {
            email: validation.email,
            document: validation.document,
            expiresAt,
            // Optimista en producción (ya disparamos el envío). En desarrollo mostramos
            // el link directo porque normalmente no hay SMTP configurado localmente.
            mailDelivered: !dev,
            devLink: dev ? confirmUrl : null,
        },
    };
};

const confirmAccess = async (rawToken) => {
    const token = String(rawToken || '').trim();
    if (!token) {
        return { ok: false, status: 400, message: 'El enlace de confirmación no es válido.' };
    }

    const pending = await portalClientAccessPendingModel.findByToken(token);
    if (!pending) {
        return { ok: false, status: 404, message: 'El enlace de confirmación no es válido o ya fue utilizado.' };
    }

    if (new Date(pending.expiresAt) < new Date()) {
        await portalClientAccessPendingModel.deleteByToken(token);
        return { ok: false, status: 410, message: 'El enlace de confirmación expiró. Volvé a solicitar acceso desde el portal.' };
    }

    const validation = await validateClientCredentials(pending.document, pending.email);
    if (!validation.ok) {
        await portalClientAccessPendingModel.deleteByToken(token);
        return { ok: false, status: 404, message: 'No se encontraron envíos vinculados a tu identidad.' };
    }

    await portalClientAccessPendingModel.deleteByToken(token);

    const sessionToken = signPortalClientSession({
        document: pending.document,
        email: pending.email,
    });

    return {
        ok: true,
        sessionToken,
        client: { document: pending.document, email: pending.email },
    };
};

const splitActiveHistorical = (shipments) => {
    const active = [];
    const historical = [];
    for (const shipment of shipments) {
        const statusId = shipment.statusId ?? shipment.status?.id;
        if (shipmentModel.TERMINAL_STATUS_IDS.includes(Number(statusId))) {
            historical.push(shipment);
        } else {
            active.push(shipment);
        }
    }
    return { active, historical };
};

module.exports = {
    COOKIE_NAME,
    SESSION_HOURS,
    parseDocument,
    assertClientOwnsShipment,
    validateClientCredentials,
    signPortalClientSession,
    verifyPortalClientSession,
    requestAccess,
    confirmAccess,
    splitActiveHistorical,
};
