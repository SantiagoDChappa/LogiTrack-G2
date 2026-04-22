const nodemailer = require('nodemailer');

// ── Etiquetas de estado en español ──────────────────────────────────────────
const STATUS_LABELS = {
    pendiente:    'Pendiente',
    en_transito:  'En Tránsito',
    'en tránsito':'En Tránsito',
    entregado:    'Entregado',
    cancelado:    'Cancelado',
    cancelada:    'Cancelada',
    retrasado:    'Retrasado',
    en_sucursal:  'En Sucursal',
    'en sucursal':'En Sucursal',
    inicial:      'Inicial',
};

function statusLabel(description) {
    const key = (description || '').toLowerCase().replace(/[\s-]+/g, '_');
    return STATUS_LABELS[key] || STATUS_LABELS[description.toLowerCase()] || description;
}

// ── Nodemailer transporter (opcional) ────────────────────────────────────────
function buildTransporter() {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

    if (process.env.SMTP_SERVICE) {
        return nodemailer.createTransport({
            service: process.env.SMTP_SERVICE,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
    }

    return nodemailer.createTransport({
        host:   process.env.SMTP_HOST || 'smtp.gmail.com',
        port:   parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
}

// ── Email ────────────────────────────────────────────────────────────────────
async function sendEmail(recipient, trackingId, label) {
    if (!recipient?.email) return;
    const transporter = buildTransporter();
    if (!transporter) return;

    const from = process.env.SMTP_FROM || process.env.SMTP_USER;

    const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px">
            <h2 style="color:#2563eb;margin-bottom:4px">LogiTrack</h2>
            <p style="color:#64748b;margin-top:0">Sistema de gestión de envíos</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
            <p style="font-size:15px;color:#1e293b">Hola <strong>${recipient.fullName || 'cliente'}</strong>,</p>
            <p style="font-size:15px;color:#1e293b">
                Tu envío con ID de tracking <strong>${trackingId}</strong>
                ha cambiado de estado:
            </p>
            <div style="background:#2563eb;color:#fff;border-radius:6px;padding:12px 20px;display:inline-block;font-size:16px;font-weight:600;margin:8px 0">
                ${label}
            </div>
            <p style="font-size:13px;color:#64748b;margin-top:20px">
                Si tenés alguna consulta, contactá con tu sucursal de LogiTrack.
            </p>
        </div>`;

    try {
        await transporter.sendMail({
            from,
            to:      recipient.email,
            subject: `Tu envío ${trackingId} cambió a "${label}" — LogiTrack`,
            html,
            text: `Hola ${recipient.fullName || 'cliente'}, tu envío ${trackingId} cambió al estado "${label}".`,
        });
    } catch (err) {
        console.error('[notifications] Error email:', err.message);
    }
}

// ── SMS vía Twilio (opcional) ─────────────────────────────────────────────────
async function sendSms(recipient, trackingId, label) {
    if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN || !process.env.TWILIO_FROM) return;
    if (!recipient?.phone) return;

    let phone = String(recipient.phone).replace(/\D/g, '');
    // Formato Argentina: +549XXXXXXXXXX (móvil) o +5411XXXXXXXX (fijo CABA)
    if (phone.startsWith('0')) phone = phone.slice(1);
    if (!phone.startsWith('54'))  phone = '54' + phone;
    phone = '+' + phone;

    try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        await client.messages.create({
            to:   phone,
            from: process.env.TWILIO_FROM,
            body: `LogiTrack: Tu envío ${trackingId} cambió al estado "${label}". Ante cualquier consulta contactá con tu sucursal.`,
        });
    } catch (err) {
        console.error('[notifications] Error SMS:', err.message);
    }
}

// ── Punto de entrada principal ────────────────────────────────────────────────
/**
 * Notifica al destinatario sobre un cambio de estado del envío.
 * No bloquea la respuesta HTTP (fire-and-forget).
 *
 * @param {object} shipment   - objeto Shipment con .recipient y .trackingId
 * @param {string} newStatusDescription - descripción del nuevo estado (ej: "En tránsito")
 */
function notifyStatusChange(shipment, newStatusDescription) {
    const label = statusLabel(newStatusDescription);
    const { recipient, trackingId } = shipment;

    Promise.all([
        sendEmail(recipient, trackingId, label),
        sendSms(recipient,   trackingId, label),
    ]).catch(err => console.error('[notifications] Error general:', err));
}

module.exports = { notifyStatusChange };
