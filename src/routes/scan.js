const express = require('express');
const router  = express.Router();
const { requireAuth, requireDelivery } = require('../middlewares/auth.js');
const {
    getScanPage,
    postPickup,
    postAtBranch,
    postFailedAttempt,
    postRetry,
    postPackageFailed,
} = require('../controllers/scan');

router.get('/:trackingId', requireAuth, requireDelivery, getScanPage);

router.post('/:trackingId/pickup',         requireAuth, requireDelivery, postPickup);
router.post('/:trackingId/at-branch',      requireAuth, requireDelivery, postAtBranch);
router.post('/:trackingId/failed-attempt', requireAuth, requireDelivery, postFailedAttempt);
router.post('/:trackingId/retry',          requireAuth, requireDelivery, postRetry);
router.post('/:trackingId/package-failed', requireAuth, requireDelivery, postPackageFailed);

module.exports = router;
