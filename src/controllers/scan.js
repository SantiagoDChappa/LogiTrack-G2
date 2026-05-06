const shipmentModel        = require('../models/shipment');
const statusModel          = require('../models/status');
const shipmentHistoryModel = require('../models/shipmentHistory');
const userModel            = require('../models/user');
const { notifyStatusChange } = require('../utils/notifications');
const { Status }             = require('../constants/enums');
const { resolveBranchCoords, resolveUserBranchCoords } = require('../utils/eventLocation');

const DELIVERY_TRANSITIONS = {
    [Status.PENDING.id]:    [Status.IN_TRANSIT.id],
    [Status.IN_TRANSIT.id]: [Status.AT_BRANCH.id, Status.DELIVERED.id],
    [Status.AT_BRANCH.id]:  [Status.IN_TRANSIT.id, Status.DELIVERED.id],
    [Status.DELIVERED.id]:  [],
    [Status.CANCELLED.id]:  [],
};

const TRANSITION_LABELS = {
    [Status.IN_TRANSIT.id]: 'En Tránsito',
    [Status.AT_BRANCH.id]:  'Llegué a sucursal',
    [Status.DELIVERED.id]:  'Entregar',
};

const getScanPage = async (req, res) => {
    try {
        const { trackingId }  = req.params;
        const currentUser     = res.locals.currentUser;
        const shipment        = await shipmentModel.getByTrackingId(trackingId);

        if (!shipment) {
            return res.render('scan/index', { shipment: null, transitions: [], error: 'Envío no encontrado.', success: null });
        }

        if (shipment.deliveryUserId !== currentUser.id) {
            return res.render('scan/index', { shipment: null, transitions: [], error: 'Este envío no está asignado a vos.', success: null });
        }

        const allowedIds  = DELIVERY_TRANSITIONS[shipment.statusId] || [];
        const transitions = allowedIds.map(id => ({ id, label: TRANSITION_LABELS[id] }));
        const success     = req.query.success === '1';

        res.render('scan/index', { shipment, transitions, error: null, success });
    } catch (err) {
        console.error('ERROR getScanPage:', err.message);
        res.status(500).render('scan/index', { shipment: null, transitions: [], error: 'Error interno. Intentá de nuevo.', success: null });
    }
};

const postScanStatus = async (req, res) => {
    try {
        const { trackingId } = req.params;
        const currentUser    = res.locals.currentUser;
        const targetStatusId = Number(req.body.newStatusId);

        const shipment = await shipmentModel.getByTrackingId(trackingId);

        if (!shipment) {
            return res.render('scan/index', { shipment: null, transitions: [], error: 'Envío no encontrado.', success: null });
        }

        if (shipment.deliveryUserId !== currentUser.id) {
            return res.render('scan/index', { shipment: null, transitions: [], error: 'Este envío no está asignado a vos.', success: null });
        }

        const allowedIds = DELIVERY_TRANSITIONS[shipment.statusId] || [];
        if (!allowedIds.includes(targetStatusId)) {
            const transitions = allowedIds.map(id => ({ id, label: TRANSITION_LABELS[id] }));
            return res.render('scan/index', { shipment, transitions, error: 'Transición de estado no permitida.', success: null });
        }

        let branchId = null;
        if (targetStatusId === Status.AT_BRANCH.id) {
            const userRecord = await userModel.getById(currentUser.id);
            branchId = userRecord?.branchId || null;
        }
        const coords = branchId
            ? await resolveBranchCoords(branchId)
            : await resolveUserBranchCoords(currentUser.id);
        const newStatus  = await statusModel.getById(targetStatusId);

        await shipmentHistoryModel.create({
            shipmentId:   shipment.id,
            fromStatusId: shipment.statusId,
            toStatusId:   targetStatusId,
            userId:       currentUser.id,
            eventType:    'STATUS_CHANGE',
            branchId:     coords.branchId || branchId,
            latitude:     coords.latitude,
            longitude:    coords.longitude,
        });

        await shipmentModel.updateStatus(shipment.id, targetStatusId);
        if (newStatus) { notifyStatusChange(shipment, newStatus.description); }

        res.redirect(`/scan/${trackingId}?success=1`);
    } catch (err) {
        console.error('ERROR postScanStatus:', err.message);
        res.status(500).render('scan/index', { shipment: null, transitions: [], error: 'Error interno. Intentá de nuevo.', success: null });
    }
};

module.exports = { getScanPage, postScanStatus };
