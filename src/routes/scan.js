const express = require('express');
const router  = express.Router();
const { getScanPage, postScanStatus } = require('../controllers/scan');

router.get('/:trackingId',  getScanPage);
router.post('/:trackingId', postScanStatus);

module.exports = router;
