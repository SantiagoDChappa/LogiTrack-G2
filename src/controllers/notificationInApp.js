// LGT-218: centro de notificaciones in-app (panel + campana).
const inApp = require('../services/notification/inAppNotifier');

const serialize = (n) => ({
    id: n.id,
    event: n.event,
    title: n.title,
    body: n.body,
    url: n.url || `/notifications/${n.id}/go`,
    read: !!n.readAt,
    createdAt: n.createdAt,
});

// Página completa "Notificaciones".
const page = async (req, res) => {
    const user = res.locals.currentUser;
    const [items, unread] = await Promise.all([
        inApp.listForUser(user.id, { limit: 100 }),
        inApp.countUnread(user.id),
    ]);
    res.render('notification/center', { items, unread });
};

// JSON para la campana del header: contador + últimas N.
const dropdownData = async (req, res) => {
    const user = res.locals.currentUser;
    const [items, unread] = await Promise.all([
        inApp.listForUser(user.id, { limit: 10 }),
        inApp.countUnread(user.id),
    ]);
    res.json({ unread, items: items.map(serialize) });
};

// Marca una como leída (sin navegar) — usado por la campana. Devuelve el nuevo contador.
const markRead = async (req, res) => {
    const user = res.locals.currentUser;
    await inApp.markRead(user.id, Number(req.params.id));
    const unread = await inApp.countUnread(user.id);
    res.json({ ok: true, unread });
};

const markAllRead = async (req, res) => {
    const user = res.locals.currentUser;
    await inApp.markAllRead(user.id);
    if ((req.get('accept') || '').includes('application/json')) {
        return res.json({ ok: true, unread: 0 });
    }
    res.redirect('/notifications');
};

// Clic en una notificación: marca leída y redirige al recurso (Esc.4). Solo navega a
// rutas internas (empiezan con "/") para evitar open-redirect.
const openAndGo = async (req, res) => {
    const user = res.locals.currentUser;
    const id = Number(req.params.id);
    const n = await inApp.getOwned(user.id, id);
    if (!n) { return res.redirect('/notifications'); }
    await inApp.markRead(user.id, id);
    const target = n.url && n.url.startsWith('/') ? n.url : '/notifications';
    res.redirect(target);
};

module.exports = { page, dropdownData, markRead, markAllRead, openAndGo };
