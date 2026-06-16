// LGT-183 — gestión interna de devoluciones (bandeja del Supervisor: aprobar / rechazar).
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
        returns,
        filters,
        ReturnStatusLabel,
        ReturnReasonLabel,
        ReturnStatus,
        ReturnReason,
        query: req.query,
    });
};

const detail = async (req, res) => {
    const id = Number(req.params.id);
    const ret = await returnService.getByIdFull(id);
    if (!ret) {
        return res.status(404).render('error', { message: 'Devolución no encontrada' });
    }

    let creditNote = null;
    let replacement = null;
    if (ret.result === ReturnResult.REEMBOLSO) {
        creditNote = await require('../services/creditNoteService').getByReturn(ret.id);
    } else if (ret.result === ReturnResult.REEMPLAZO) {
        replacement = await require('../services/replacementService').findExistingByOrigin(ret.shipmentId);
    }

    res.render('return/detail', {
        ret,
        ReturnStatusLabel,
        ReturnReasonLabel,
        ReturnResult,
        canManage: returnService.PENDING_STATUSES.includes(ret.status),
        creditNote,
        replacement,
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
