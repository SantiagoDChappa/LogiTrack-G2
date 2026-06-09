const express           = require('express');
const router            = express.Router();
const settingController = require('../controllers/setting');
const { requireAdmin }  = require('../middlewares/auth');
const { logoUpload }    = require('../middlewares/upload');

// LGT-172: subida tolerante del logo. Si multer falla (formato/tamaño) seguimos
// y el controller responde con el error apropiado vía req.uploadError.
const optionalLogo = (req, res, next) => {
    logoUpload.single('logo')(req, res, (err) => {
        if (err) { req.file = undefined; req.uploadError = err; }
        next();
    });
};

router.get('/',              requireAdmin, settingController.getSettings);
// LGT-174: cada categoría de ajustes es su propia página (navegada desde el menú).
router.get('/:section', requireAdmin, settingController.getSettings);
router.post('/',             requireAdmin, settingController.saveSettings);
router.post('/identity',     requireAdmin, optionalLogo, settingController.saveIdentity);
router.post('/assign-branch', requireAdmin, settingController.assignBranch);
router.post('/route-optimizer', requireAdmin, settingController.saveRouteOptimizerSettings);
router.post('/params',          requireAdmin, settingController.saveParams);
router.post('/incident-params', requireAdmin, settingController.saveIncidentParams);
router.post('/status-colors',   requireAdmin, settingController.saveStatusColors);
router.post('/incident-status-colors', requireAdmin, settingController.saveIncidentStatusColors);
router.post('/notification-config',         requireAdmin, settingController.saveNotificationConfig);
// Variantes de plantilla (rutas específicas antes de las genéricas por :eventCode)
router.post('/email-template/variant/:eventCode', requireAdmin, settingController.createEmailTemplateVariant);
router.post('/email-template/update/:id',         requireAdmin, settingController.updateEmailTemplateById);
router.post('/email-template/default/:id',        requireAdmin, settingController.setDefaultEmailTemplate);
router.post('/email-template/delete/:id',         requireAdmin, settingController.deleteEmailTemplate);
router.post('/email-template/:eventCode/test',    requireAdmin, settingController.sendTestTemplate);
router.post('/email-template/:eventCode',         requireAdmin, settingController.saveEmailTemplate);

// Variables custom y snippets de email
router.post('/notification-variable',          requireAdmin, settingController.saveNotificationVariable);
router.post('/notification-variable/:id',      requireAdmin, settingController.saveNotificationVariable);
router.post('/notification-variable/:id/delete', requireAdmin, settingController.deleteNotificationVariable);
router.post('/email-snippet',                  requireAdmin, settingController.saveEmailSnippet);
router.post('/email-snippet/:id',              requireAdmin, settingController.saveEmailSnippet);
router.post('/email-snippet/:id/delete',       requireAdmin, settingController.deleteEmailSnippet);
router.post('/test-email-override',         requireAdmin, settingController.saveTestEmailOverride);
// Sprint 3 - 2.5 parámetros configurables nuevos
router.post('/failed-reason',          requireAdmin, settingController.saveFailedReason);
router.post('/failed-reason/:id',      requireAdmin, settingController.saveFailedReason);
router.post('/standard-message/:code', requireAdmin, settingController.saveStandardMessage);
router.post('/time-window',            requireAdmin, settingController.saveTimeWindow);
router.post('/time-window/:id',        requireAdmin, settingController.saveTimeWindow);
router.post('/incident-type',          requireAdmin, settingController.saveIncidentType);
router.post('/incident-type/:id',      requireAdmin, settingController.saveIncidentType);
router.post('/incident-notification',  requireAdmin, settingController.saveIncidentNotifConfig);
router.post('/fatigue-consent-notification', requireAdmin, settingController.saveFatigueConsentNotifConfig);
router.post('/test-shipment-notification', requireAdmin, settingController.testShipmentNotification);
// Envío manual de toda la cola de emails pendientes (sin esperar al cron).
router.post('/flush-email-queue',          requireAdmin, settingController.flushEmailQueue);
// Ejecutar manualmente un proceso automático ahora (expirados | notificaciones | demoras).
router.post('/run-process/:proc',          requireAdmin, settingController.runProcess);
router.post('/trigger-delay-detection',   requireAdmin, settingController.triggerDelayDetection);

module.exports = router;
