const express = require('express');
const router = express.Router();
const { home, getDetail, getNewShipmentForm, createShipment, getUpdateShipment, updateShipment, updateShipmentStatus, searchShipments, assignDelivery, prepareShipment, cancelShipment, markPackageFailed, getKanban, getQR, getLabel, showImportForm, processImportPreview, commitImport, downloadImportReport, showImportHistory, exportShipments, calculateInitialPriority } = require('../controllers/shipment.js');
const { validateShipment, validateUpdateShipment, handleUpdateValidationErrors, validatePriority } = require('../middlewares/shipment.js');
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
router.post('/update/:id/status',      requireSupervisorOrAdmin, updateShipmentStatus);
router.post('/update/:id/assign',      requireSupervisorOrAdmin, assignDelivery);
router.post('/update/:id/prepare',     requireSupervisorOrAdmin, prepareShipment);
router.post('/update/:id/cancel',      requireSupervisorOrAdmin, cancelShipment);
router.post('/update/:id/mark-failed', requireSupervisorOrAdmin, markPackageFailed);
router.get('/:id/qr', requireAuth, getQR);
router.get('/:id/label', requireAuth, getLabel);

router.post('/calculate-initial-priority', calculateInitialPriority);

module.exports = router;
