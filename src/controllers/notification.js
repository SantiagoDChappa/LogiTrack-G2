const notificationEmailModel = require('../models/notificationEmail');
const settingModel = require('../models/setting');
const settingLogModel = require('../models/settingLog');
const { isAutoSendEnabled } = require('../jobs/emailProcessorJob');

// Pestaña Notificaciones → Fallidas: tabla de emails con su estado, intentos
// e historial de envío (qué proveedor lo mandó / por qué falló).
const listEmails = async (req, res) => {
    const status = req.query.status || null;
    const q = req.query.q ? String(req.query.q).trim() : null;

    const [emails, counts, autoEnabled] = await Promise.all([
        notificationEmailModel.listForAdmin({ status, q, limit: 300 }),
        notificationEmailModel.countsByStatus(),
        isAutoSendEnabled(),
    ]);

    res.render('notification/list', {
        emails,
        counts,
        autoEnabled,
        query: req.query,   // feedback de acciones (sent/retried/auto/error)
        filters: { status: status || '', q: q || '' },
    });
};

// Envío MANUAL de la cola: procesa los pendientes ahora, sin importar el kill-switch
// (llama processPendingEmails directo). Vuelve a la bandeja con el resumen del lote.
const sendPending = async (req, res) => {
    try {
        const { processPendingEmails } = require('../jobs/emailProcessorJob');
        const summary = await processPendingEmails();
        const sent = summary?.sent || 0;
        const retried = summary?.retried || 0;
        return res.redirect(`/notification/fallidas?sent=${sent}&retried=${retried}`);
    } catch (err) {
        console.error('sendPending:', err.message);
        return res.redirect('/notification/fallidas?error=send');
    }
};

// Activa/desactiva el envío AUTOMÁTICO (cron + inmediato). El valor lo leen el
// scheduler y queueEmail. Queda registrado en el log de auditoría de Ajustes.
const toggleAutoSend = async (req, res) => {
    try {
        const enabled = req.body.email_auto_send_enabled === 'on' ? '1' : '0';
        const oldValue = await settingModel.get('email_auto_send_enabled');
        await settingLogModel.logChange(res.locals.currentUser?.id, 'email_auto_send_enabled', oldValue, enabled);
        await settingModel.set('email_auto_send_enabled', enabled);
        return res.redirect(`/notification/fallidas?auto=${enabled === '1' ? 'on' : 'off'}`);
    } catch (err) {
        console.error('toggleAutoSend:', err.message);
        return res.redirect('/notification/fallidas?error=auto');
    }
};

module.exports = { listEmails, sendPending, toggleAutoSend };
