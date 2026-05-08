const express = require('express');
const router = express.Router();
const { home, getDetail, getNewShipmentForm, createShipment, getUpdateShipment, updateShipment, searchShipments, assignDelivery, prepareShipment, cancelShipment, markPackageFailed, getKanban, getQR, getLabel, showImportForm, processImportPreview, commitImport, downloadImportReport, showImportHistory, exportShipments } = require('../controllers/shipment.js');
const { validateShipment, validateUpdateShipment, handleUpdateValidationErrors } = require('../middlewares/shipment.js');
const { requireAuth, requireAdmin, requireSupervisor, requireSupervisorOrAdmin } = require('../middlewares/auth.js');
const { csvUpload } = require('../middlewares/upload.js');

router.get('/', home);
router.get('/search', searchShipments);
router.get('/kanban', requireSupervisor, getKanban);
router.get('/export', requireSupervisorOrAdmin, exportShipments);
router.get('/new', getNewShipmentForm);
router.post('/new', validateShipment, createShipment);
router.get('/import', requireAdmin, showImportForm);
router.post('/import', requireAdmin, csvUpload.single('csvFile'), processImportPreview);
router.post('/import/commit', requireAdmin, commitImport);
router.get('/import/history', requireAdmin, showImportHistory);
router.get('/import/report/:id', requireAdmin, downloadImportReport);
router.get('/detail/:id', getDetail);
router.get('/update/:id', getUpdateShipment);
router.post('/update/:id', validateUpdateShipment, handleUpdateValidationErrors, updateShipment);
router.post('/update/:id/assign',      requireSupervisorOrAdmin, assignDelivery);
router.post('/update/:id/prepare',     requireSupervisorOrAdmin, prepareShipment);
router.post('/update/:id/cancel',      requireSupervisorOrAdmin, cancelShipment);
router.post('/update/:id/mark-failed', requireSupervisorOrAdmin, markPackageFailed);
router.get('/:id/qr', requireAuth, getQR);
router.get('/:id/label', requireAuth, getLabel);

module.exports = router;
