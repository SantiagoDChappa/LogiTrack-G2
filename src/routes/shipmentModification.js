const express = require('express');
const router = express.Router();
const { list, postApprove, postReject } = require('../controllers/shipmentModification');

router.get('/', list);
router.post('/:id/approve', postApprove);
router.post('/:id/reject', postReject);

module.exports = router;
