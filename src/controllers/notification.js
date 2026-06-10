const notificationEmailModel = require('../models/notificationEmail');

// Pestaña Notificaciones → Fallidas: tabla de emails con su estado, intentos
// e historial de envío (qué proveedor lo mandó / por qué falló).
const listEmails = async (req, res) => {
    const status = req.query.status || null;
    const q = req.query.q ? String(req.query.q).trim() : null;

    const [emails, counts] = await Promise.all([
        notificationEmailModel.listForAdmin({ status, q, limit: 300 }),
        notificationEmailModel.countsByStatus(),
    ]);

    res.render('notification/list', {
        emails,
        counts,
        filters: { status: status || '', q: q || '' },
    });
};

module.exports = { listEmails };
