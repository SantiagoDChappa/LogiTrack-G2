const { User, markHelpModuleSeen } = require('../models/user');
const { isValidModule } = require('../data/contextualTours');

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

const replay = async (req, res) => {
    try {
        const userId = res.locals.currentUser?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        await User.update({ onboarded: false }, { where: { id: userId } });
        return res.json({ ok: true });
    } catch (err) {
        console.error('[onboarding] error al reiniciar tour:', err.message);
        return res.status(500).json({ error: 'Error interno' });
    }
};

const moduleComplete = async (req, res) => {
    try {
        const userId = res.locals.currentUser?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const moduleKey = String(req.body?.module || '').trim();
        if (!isValidModule(moduleKey)) {
            return res.status(400).json({ error: 'Módulo inválido' });
        }

        const helpSeen = await markHelpModuleSeen(userId, moduleKey);
        return res.json({ ok: true, helpSeen });
    } catch (err) {
        console.error('[onboarding] error al marcar tour contextual:', err.message);
        return res.status(500).json({ error: 'Error interno' });
    }
};

module.exports = { complete, replay, moduleComplete };
