const { User } = require('../models/user');

const complete = async (req, res) => {
    try {
        const userId = res.locals.currentUser?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        await User.update({ onboarded: true }, { where: { id: userId } });
        return res.json({ ok: true });
    } catch (err) {
        console.error('[onboarding] error al marcar como completado:', err.message);
        return res.status(500).json({ error: 'Error interno' });
    }
};

module.exports = { complete };
