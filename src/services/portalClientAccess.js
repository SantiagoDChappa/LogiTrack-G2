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

// CP-CONS03: mensaje genérico para todos los casos de fallo (DNI/email/formato/sin envíos).
// No se revela qué dato falló: evita enumeración de usuarios y filtración de información.
const INVALID_CREDENTIALS_MSG = 'Credenciales inválidas. Verifique los datos e intente nuevamente.';

const validateClientCredentials = async (document, email) => {
    const docNum = parseDocument(document);
    const emailNorm = normalize(email);

    if (!docNum) {
        return { ok: false, code: 'invalid_document', message: INVALID_CREDENTIALS_MSG };
    }
    if (!emailNorm) {
        return { ok: false, code: 'invalid_email', message: INVALID_CREDENTIALS_MSG };
    }

    const count = await shipmentModel.countByClientIdentity({ document: docNum, email: emailNorm });
    if (count === 0) {
        return { ok: false, code: 'no_shipments', message: INVALID_CREDENTIALS_MSG };
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

// CP-CONS01: genera un código numérico de 6 dígitos único entre los pendientes vigentes.
const generateAccessCode = async () => {
    for (let i = 0; i < 8; i += 1) {
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const exists = await portalClientAccessPendingModel.findByToken(code);
        if (!exists) { return code; }
    }
    // Fallback extremadamente improbable: agrega entropía para no fallar.
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
};

const requestAccess = async ({ document, email }) => {
    const validation = await validateClientCredentials(document, email);
    if (!validation.ok) { return validation; }

    await portalClientAccessPendingModel.deleteExpired().catch(() => {});
    // Invalida códigos previos del mismo cliente para que solo el último sea válido.
    await portalClientAccessPendingModel.deleteByEmail(validation.email).catch(() => {});

    const code = await generateAccessCode();
    const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_HOURS * 60 * 60 * 1000);

    await portalClientAccessPendingModel.create({
        token: code,
        document: validation.document,
        email: validation.email,
        expiresAt,
    });

    // Plantilla editable desde Ajustes → Comunicaciones (evento PORTAL_CLIENT_ACCESS).
    // Si no existe la fila (migración no corrida), se usa el texto por defecto.
    // Es un mail transaccional: se envía siempre (no respeta toggle de "habilitado").
    const tplVars = { codigo: code, ttlHoras: CONFIRMATION_TTL_HOURS };
    let subject = '[LogiTrack] Tu código de acceso a tus envíos';
    let body = `Hola,

Recibimos una solicitud para consultar tus envíos en el portal de LogiTrack.

Tu código de acceso es: ${code}

Ingresalo en el portal para continuar (válido por ${CONFIRMATION_TTL_HOURS} horas).

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
                console.log(`[portal-access] código de acceso enviado a ${validation.email}`);
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
            // el código directo porque normalmente no hay SMTP configurado localmente.
            mailDelivered: !dev,
            devCode: dev ? code : null,
        },
    };
};

// CP-CONS01/CP-CONS12: confirma con código de 6 dígitos, ligado al email que lo solicitó.
const confirmAccess = async (rawCode, rawEmail) => {
    const code = String(rawCode || '').trim();
    if (!/^\d{6}$/.test(code)) {
        return { ok: false, status: 400, message: 'El código ingresado no es válido. Verificá los 6 dígitos.' };
    }

    const pending = await portalClientAccessPendingModel.findByToken(code);
    // Si se conoce el email (flujo del portal), el código debe corresponder a ese cliente.
    const emailNorm = normalize(rawEmail);
    if (!pending || (emailNorm && normalize(pending.email) !== emailNorm)) {
        return { ok: false, status: 404, message: 'El código ingresado no es válido. Verificá los datos e intentá nuevamente.' };
    }

    if (new Date(pending.expiresAt) < new Date()) {
        await portalClientAccessPendingModel.deleteByToken(code);
        return { ok: false, status: 410, message: 'El código ingresado expiró. Solicite uno nuevo.' };
    }

    const validation = await validateClientCredentials(pending.document, pending.email);
    if (!validation.ok) {
        await portalClientAccessPendingModel.deleteByToken(code);
        return { ok: false, status: 404, message: 'No se encontraron envíos vinculados a tu identidad.' };
    }

    await portalClientAccessPendingModel.deleteByToken(code);

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
