// LGT-183 — gestión interna de devoluciones (bandeja del Supervisor: aprobar / rechazar).
const returnService = require('../services/returnService');
const { ReturnStatusLabel, ReturnReasonLabel, ReturnResult } = require('../constants/enums');

const list = async (req, res) => {
    const pending = await returnService.listPending();
    res.render('return/list', {
        returns: pending,
        ReturnStatusLabel,
        ReturnReasonLabel,
        query: req.query,
    });
};

const detail = async (req, res) => {
    const id = Number(req.params.id);
    const ret = await returnService.getByIdFull(id);
    if (!ret) {
        return res.status(404).render('error', { message: 'Devolución no encontrada' });
    }
    res.render('return/detail', {
        ret,
        ReturnStatusLabel,
        ReturnReasonLabel,
        ReturnResult,
        canManage: returnService.PENDING_STATUSES.includes(ret.status),
        query: req.query,
    });
};

const resolve = async (req, res) => {
    const id = Number(req.params.id);
    const result = await returnService.resolveReturn({
        returnId: id,
        userId: res.locals.currentUser?.id,
        decision: req.body.decision,
        result: req.body.result,
        rejectionReason: req.body.rejectionReason,
    });
    if (!result.ok) {
        return res.redirect(`/returns/${id}?error=${encodeURIComponent(result.message)}`);
    }
    res.redirect(`/returns/${id}?ok=1`);
};

module.exports = { list, detail, resolve };
