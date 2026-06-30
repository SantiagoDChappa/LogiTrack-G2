// LGT-199 Esc.4 — escala los re-chequeos de fatiga que el conductor NO completó.
// Busca sesiones en RECHECK_PENDING cuyo pedido (recheckRequestedAt) superó el
// tiempo configurado (recheckOmitMin) y avisa al supervisor + registra en Ojo de
// Patrón. Idempotente: el servicio no duplica el aviso. Lo corre el scheduler.

const { Op } = require('sequelize');
const { RouteFatigueSession, RecheckState } = require('../models/routeFatigueSession');
const { Route } = require('../models/route');
const fatigueCfg = require('../services/fatigue/config');
const fatigueSvc = require('../services/fatigue');

async function processOmittedRechecks() {
    try {
        const pending = await RouteFatigueSession.findAll({
            where: { state: RecheckState.RECHECK_PENDING, recheckRequestedAt: { [Op.ne]: null } },
        });
        if (!pending.length) {
            console.log('[fatigueRecheckEscalation] Sin re-chequeos pendientes.');
            return;
        }
        let escalated = 0;
        for (const s of pending) {
            const route = await Route.findByPk(s.routeId, {
                include: [{ association: 'transport', attributes: ['driverUserId'] }],
            }).catch(() => null);
            if (!route) { continue; }
            const cfg = await fatigueCfg.getConfig(route.originBranchId);
            const elapsedMin = (Date.now() - new Date(s.recheckRequestedAt).getTime()) / 60000;
            if (elapsedMin < cfg.recheckOmitMin) { continue; }
            await fatigueSvc.escalateRecheckOmission({
                routeId: route.id,
                userId: route.transport?.driverUserId || null,
                branchId: route.originBranchId,
                minutes: cfg.recheckOmitMin,
                cfg,
            });
            escalated++;
        }
        console.log(`[fatigueRecheckEscalation] Avisos por re-chequeo omitido: ${escalated}.`);
    } catch (err) {
        console.error('[fatigueRecheckEscalation] Error:', err.message);
    }
}

module.exports = { processOmittedRechecks };
