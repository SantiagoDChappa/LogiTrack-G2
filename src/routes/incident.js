const express = require('express');
const router = express.Router();
const {
    list, getCreateForm, create, getDetail, addComment,
    assign, changeStatus, escalate, close, reopen, searchShipments
} = require('../controllers/incident.js');
const { requireSupervisorOrAdmin } = require('../middlewares/auth.js');

router.get('/',                   list);
router.get('/search-shipments',   searchShipments);
router.get('/new',                getCreateForm);
router.post('/',                  create);
router.get('/:id',       getDetail);
router.post('/:id/comment',  addComment);
router.post('/:id/assign',   requireSupervisorOrAdmin, assign);
router.post('/:id/status',   requireSupervisorOrAdmin, changeStatus);
router.post('/:id/escalate', requireSupervisorOrAdmin, escalate);
router.post('/:id/close',    requireSupervisorOrAdmin, close);
router.post('/:id/reopen',   requireSupervisorOrAdmin, reopen);

module.exports = router;
