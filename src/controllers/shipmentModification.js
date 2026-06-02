const { RoleType, ModificationRequestStatus } = require('../constants/enums');
const {
    listPending,
    approveRequest,
    rejectRequest,
    changeTypeLabel,
    statusLabel,
    describeChanges,
} = require('../services/portalModificationService');

const isStaffReviewer = (user) => [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.ADMIN.id]
    .includes(user?.roleId);

const formatRow = (row) => {
    const json = typeof row.toJSON === 'function' ? row.toJSON() : row;
    return {
        ...json,
        typeLabel: changeTypeLabel(json.changeType),
        statusLabel: statusLabel(json.status),
        summary: describeChanges(json.payload?.requested || {}),
        trackingId: json.shipment?.trackingId,
        recipientName: json.shipment?.recipient?.fullName,
        shipmentStatus: json.shipment?.status?.description,
    };
};

const list = async (req, res) => {
    const user = res.locals.currentUser;
    if (!isStaffReviewer(user)) {
        return res.status(403).send('Acceso denegado');
    }

    const statusFilter = req.query.status || ModificationRequestStatus.PENDING_REVIEW;
    const branchId = user.roleId === RoleType.ADMIN.id ? null : (user.branchId || null);

    const rows = await listPending({
        branchId,
        status: statusFilter,
        includeAll: statusFilter === 'ALL',
    });

    res.render('shipment/modifications/index', {
        requests: rows.map(formatRow),
        filters: { status: statusFilter },
        flash: req.query.ok || null,
        error: req.query.error || null,
    });
};

const postApprove = async (req, res) => {
    const user = res.locals.currentUser;
    if (!isStaffReviewer(user)) {
        return res.status(403).send('Acceso denegado');
    }

    const result = await approveRequest(Number(req.params.id), user);
    if (!result.ok) {
        return res.redirect(`/shipment/modifications?error=${encodeURIComponent(result.message)}`);
    }
    return res.redirect('/shipment/modifications?ok=approved');
};

const postReject = async (req, res) => {
    const user = res.locals.currentUser;
    if (!isStaffReviewer(user)) {
        return res.status(403).send('Acceso denegado');
    }

    const result = await rejectRequest(Number(req.params.id), user, req.body.reviewComment);
    if (!result.ok) {
        return res.redirect(`/shipment/modifications?error=${encodeURIComponent(result.message)}`);
    }
    return res.redirect('/shipment/modifications?ok=rejected');
};

module.exports = { list, postApprove, postReject, formatRow };
