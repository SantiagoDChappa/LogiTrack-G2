const shipmentModel          = require('../models/shipment');
const statusModel            = require('../models/status');
const userModel              = require('../models/user');
// const shipmentHistoryModel   = require('../models/shipmentHistory');
const stateMachine           = require('../services/shipmentStateMachine');
const { notifyStatusChange } = require('../utils/notifications');
const { Status }             = require('../constants/enums');
const { resolveBranchCoords, resolveUserBranchCoords } = require('../utils/eventLocation');
const failedAttemptModel   = require('../models/failedAttempt');
const { getSuggestedDate } = require('../utils/failedAttempt');

const renderError = (res, message, status = 200) => {
    return res.status(status).render('scan/index', { shipment: null, actions: [], error: message, success: null, suggestedDate: null });
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
            .map(a => ({ ...a, endpoint: a.endpoint.replace(':trackingId', trackingId).replace(':id', trackingId) }));
        const success = req.query.success === '1';
        const suggestedDate = req.query.suggestedDate || null;
        res.render('scan/index', { shipment, actions, error: null, success, suggestedDate });
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
const postFailedAttempt = async (req, res) => {
    const { trackingId } = req.params;
    const currentUser    = res.locals.currentUser;
    try {
        const { shipment, error, status } = await loadShipmentForActor(trackingId, currentUser);
        if (error) { return renderError(res, error, status); }

        const reason      = req.body?.reason      || req.body?.comment || '';
        const observation = req.body?.observation || null;

        const coords = await resolveUserBranchCoords(currentUser.id);
        const suggestedDate = getSuggestedDate(reason);

        await stateMachine.transition({
            shipmentId: shipment.id,
            toStatusId: Status.FAILED_ATTEMPT.id,
            actor:      currentUser,
            comment:    reason,
            branchId:   coords.branchId,
            latitude:   coords.latitude,
            longitude:  coords.longitude,
        });

        await failedAttemptModel.create({
            shipmentId:    shipment.id,
            reason,
            observation,
            suggestedDate,
            status:        'pendiente',
            operatorId:    currentUser.id,
        });

        // Verificar si superó el máximo de intentos fallidos
        const settingModel = require('../models/setting');
        const settings = await settingModel.getAll();
        const maxIntentos = parseInt(settings.max_intentos_fallidos) || 3;
        const intentosPrevios = await failedAttemptModel.getByShipmentId(shipment.id);
        console.log(`[Intentos fallidos] Envío ${shipment.id}: ${intentosPrevios.length} intentos, máximo: ${maxIntentos}`);
        if (intentosPrevios.length >= maxIntentos) {
            const shipmentHistoryModel = require('../models/shipmentHistory');
            await shipmentModel.updateStatus(shipment.id, 5);
            await shipmentHistoryModel.create({
                shipmentId:   shipment.id,
                fromStatusId: Status.FAILED_ATTEMPT.id,
                toStatusId:   5,
                comment:      `Envío cancelado automáticamente por superar ${maxIntentos} intentos fallidos`,
                userId:       currentUser?.id || null,
                eventType:    'STATUS_CHANGE',
            });
        }

        const newStatus = await statusModel.getById(Status.FAILED_ATTEMPT.id);
        if (newStatus) { notifyStatusChange(shipment, newStatus.description); }

        res.redirect(`/scan/${trackingId}?success=1&suggestedDate=${suggestedDate}`);
    } catch (err) {
        if (err && err.name === 'StateMachineError') {
            const map = { INVALID_TRANSITION: 422, FORBIDDEN_ROLE: 403, COMMENT_REQUIRED: 400, SHIPMENT_NOT_FOUND: 404 };
            return res.status(map[err.code] || 400).render('scan/index', {
                shipment: null, actions: [], error: err.message, success: null, suggestedDate: null,
            });
        }
        console.error('ERROR postFailedAttempt:', err.message);
        renderError(res, 'Error interno. Intentá de nuevo.', 500);
    }
};
const postRetry         = buildHandler(Status.IN_TRANSIT.id);
const postPackageFailed = buildHandler(Status.PACKAGE_FAILED.id);

module.exports = { getScanPage, postPickup, postAtBranch, postFailedAttempt, postRetry, postPackageFailed };