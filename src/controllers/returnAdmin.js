// LGT-183 — gestión interna de devoluciones (bandeja del Supervisor).
const returnService = require('../services/returnService');
const { ReturnStatusLabel, ReturnReasonLabel, ReturnResult, ReturnStatus, ReturnReason } = require('../constants/enums');

const list = async (req, res) => {
    const filters = {
        status:     req.query.status     || '',
        reason:     req.query.reason     || '',
        trackingId: req.query.trackingId || '',
        id:         req.query.id         || '',
    };
    const returns = await returnService.listFiltered(filters);
    res.render('return/list', {
        returns, filters,
        ReturnStatusLabel, ReturnReasonLabel, ReturnStatus, ReturnReason,
        query: req.query,
    });
};

const detail = async (req, res) => {
    const id = Number(req.params.id);
    const ret = await returnService.getByIdFull(id);
    if (!ret) {
        return res.status(404).render('error', { message: 'Devolución no encontrada' });
    }

    // Se eliminó el reemplazo: la única resolución es el reembolso (nota de crédito).
    let creditNote = null;
    let replacement = null;
    if (ret.result === ReturnResult.REEMBOLSO) {
        creditNote = await require('../services/creditNoteService').getByReturn(ret.id);
    } else if (ret.result === ReturnResult.REEMPLAZO) {
        // Compatibilidad con devoluciones históricas resueltas con reemplazo.
        replacement = await require('../services/replacementService').findExistingByOrigin(ret.shipmentId);
    }

    res.render('return/detail', {
        ret,
        ReturnStatusLabel,
        ReturnReasonLabel,
        ReturnResult,
        canTake:   ret.status === ReturnStatus.SOLICITADA,
        canManage: ret.status === ReturnStatus.EN_REVISION,
        creditNote,
        replacement,
        query: req.query,
    });
};

const take = async (req, res) => {
    const id = Number(req.params.id);
    const result = await returnService.takeReturn({ returnId: id, userId: res.locals.currentUser?.id });
    if (!result.ok) {
        return res.redirect(`/returns/${id}?error=${encodeURIComponent(result.message)}`);
    }
    res.redirect(`/returns/${id}`);
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

module.exports = { list, detail, take, resolve };
