const shipmentModel          = require('../models/shipment');
const statusModel            = require('../models/status');
const userModel              = require('../models/user');
const shipmentHistoryModel   = require('../models/shipmentHistory');
const stateMachine           = require('../services/shipmentStateMachine');
const { notifyStatusChange } = require('../utils/notifications');
const { Status }             = require('../constants/enums');
const { resolveBranchCoords, resolveUserBranchCoords } = require('../utils/eventLocation');

const renderError = (res, message, status = 200) => {
    return res.status(status).render('scan/index', { shipment: null, actions: [], error: message, success: null });
};

const loadShipmentForActor = async (trackingId, currentUser) => {
    const shipment = await shipmentModel.getByTrackingId(trackingId);
    if (!shipment) { return { error: 'Envío no encontrado.', status: 404 }; }
    if (shipment.deliveryUserId !== currentUser.id) {
        return { error: 'Este envío no está asignado a vos.', status: 403 };
    }
    return { shipment };
};

const getScanPage = async (req, res) => {
    try {
        const { trackingId } = req.params;
        const currentUser    = res.locals.currentUser;
        const { shipment, error, status } = await loadShipmentForActor(trackingId, currentUser);
        if (error) { return renderError(res, error, status); }

        const actions = stateMachine.getAvailableActions({ shipment, actor: currentUser })
            .map(a => ({ ...a, endpoint: a.endpoint.replace(':trackingId', trackingId) }));
        const success = req.query.success === '1';
        res.render('scan/index', { shipment, actions, error: null, success });
    } catch (err) {
        console.error('ERROR getScanPage:', err.message);
        renderError(res, 'Error interno. Intentá de nuevo.', 500);
    }
};

const buildHandler = (toStatusId, options = {}) => async (req, res) => {
    const { trackingId } = req.params;
    const currentUser    = res.locals.currentUser;
    try {
        const { shipment, error, status } = await loadShipmentForActor(trackingId, currentUser);
        if (error) { return renderError(res, error, status); }

        let branchId = null;
        if (options.fillBranch) {
            const userRecord = await userModel.getById(currentUser.id);
            branchId = userRecord?.branchId || null;
        }
        const coords = branchId
            ? await resolveBranchCoords(branchId)
            : await resolveUserBranchCoords(currentUser.id);

        await shipmentHistoryModel.create({
            shipmentId:   shipment.id,
            fromStatusId: shipment.statusId,
            toStatusId,
            userId:       currentUser.id,
            eventType:    'STATUS_CHANGE',
            branchId:     coords.branchId || branchId,
            latitude:     coords.latitude,
            longitude:    coords.longitude,
        const comment = req.body?.comment || null;

        await stateMachine.transition({
            shipmentId: shipment.id,
            toStatusId,
            actor:      currentUser,
            comment,
            branchId:   coords.branchId || branchId,
            latitude:   coords.latitude,
            longitude:  coords.longitude,
        });

        const newStatus = await statusModel.getById(toStatusId);
        if (newStatus) { notifyStatusChange(shipment, newStatus.description); }

        res.redirect(`/scan/${trackingId}?success=1`);
    } catch (err) {
        if (err && err.name === 'StateMachineError') {
            const map = { INVALID_TRANSITION: 422, FORBIDDEN_ROLE: 403, COMMENT_REQUIRED: 400, SHIPMENT_NOT_FOUND: 404 };
            return res.status(map[err.code] || 400).render('scan/index', {
                shipment: null, actions: [], error: err.message, success: null,
            });
        }
        console.error('ERROR scan handler:', err.message);
        renderError(res, 'Error interno. Intentá de nuevo.', 500);
    }
};

const postPickup        = buildHandler(Status.IN_TRANSIT.id);
const postAtBranch      = buildHandler(Status.AT_BRANCH.id, { fillBranch: true });
const postFailedAttempt = buildHandler(Status.FAILED_ATTEMPT.id);
const postRetry         = buildHandler(Status.IN_TRANSIT.id);
const postPackageFailed = buildHandler(Status.PACKAGE_FAILED.id);

module.exports = { getScanPage, postPickup, postAtBranch, postFailedAttempt, postRetry, postPackageFailed };
