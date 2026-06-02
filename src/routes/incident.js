const express = require('express');
const router = express.Router();
const {
    list, getCreateForm, create, getDetail, addComment,
    assign, changeStatus, escalate, close, reopen, searchShipments,
    toggleTask, uploadAttachment, downloadAttachment
} = require('../controllers/incident.js');
const templateCtrl = require('../controllers/incidentTaskTemplate.js');
const { requireSupervisorOrAdmin } = require('../middlewares/auth.js');
const { evidenceUpload } = require('../middlewares/upload.js');

// Tolera errores de multer (tipo/tamaño) y delega el manejo al controller.
const optionalEvidence = (req, res, next) => {
    evidenceUpload.single('evidence')(req, res, (err) => {
        if (err) { req.file = undefined; }
        next();
    });
};

router.get('/',                   list);
router.get('/search-shipments',   searchShipments);
router.get('/new',                getCreateForm);
router.post('/',                  create);

// ABM de plantillas de checklist (supervisor/admin). Antes de '/:id' para no colisionar.
router.get('/config/templates',              requireSupervisorOrAdmin, templateCtrl.list);
router.post('/config/templates',             requireSupervisorOrAdmin, templateCtrl.create);
router.post('/config/templates/:id',         requireSupervisorOrAdmin, templateCtrl.update);
router.post('/config/templates/:id/deactivate', requireSupervisorOrAdmin, templateCtrl.deactivate);

router.get('/:id',       getDetail);
router.post('/:id/comment',  addComment);
router.post('/:id/assign',   requireSupervisorOrAdmin, assign);
router.post('/:id/status',   requireSupervisorOrAdmin, changeStatus);
router.post('/:id/escalate', requireSupervisorOrAdmin, escalate);
router.post('/:id/close',    requireSupervisorOrAdmin, close);
router.post('/:id/reopen',   requireSupervisorOrAdmin, reopen);

// Checklist y evidencias
router.post('/:id/task/:taskId/toggle', toggleTask);
router.post('/:id/attachment',          optionalEvidence, uploadAttachment);
router.get('/:id/attachment/:attId',    downloadAttachment);

module.exports = router;
