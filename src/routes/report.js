const express = require('express');
const router = express.Router();
const {
    getShipmentsByPeriod,
    getOnTimeDeliveries,
    getDeliveryPerformance,
    getIncidentsByPeriod,
    getSatisfactionReport,
    exportShipmentsByPeriod,
    exportOnTimeDeliveries,
    exportDeliveryPerformance,
    exportIncidentsByPeriod,
    exportSatisfactionReport,
} = require('../controllers/report');
const { getUsersReport, exportUsersReport } = require('../controllers/userReport');
const { getInvoiceCenter, exportInvoiceCenter } = require('../controllers/invoiceCenter');
const { getCreditNoteCenter, exportCreditNoteCenter } = require('../controllers/creditNoteCenter');
const { getBillingPanel } = require('../controllers/billingPanel');
const { requireAdmin, requireSupervisorOrAdmin } = require('../middlewares/auth');

router.get('/shipments-by-period', getShipmentsByPeriod);
router.get('/shipments-by-period/export', exportShipmentsByPeriod);
router.get('/on-time-deliveries', getOnTimeDeliveries);
router.get('/on-time-deliveries/export', exportOnTimeDeliveries);
router.get('/delivery-performance', getDeliveryPerformance);
router.get('/delivery-performance/export', exportDeliveryPerformance);
router.get('/incidents-by-period', getIncidentsByPeriod);
router.get('/incidents-by-period/export', exportIncidentsByPeriod);
router.get('/satisfaction', getSatisfactionReport);
router.get('/satisfaction/export', exportSatisfactionReport);

// Reporte de usuarios: solo Administrador (historial de cuentas + actividad).
router.get('/users', requireAdmin, getUsersReport);
router.get('/users/export', requireAdmin, exportUsersReport);

// Centro de Facturación: Admin (todas las sucursales) y Supervisor (la suya).
router.get('/invoices', requireSupervisorOrAdmin, getInvoiceCenter);
router.get('/invoices/export', requireSupervisorOrAdmin, exportInvoiceCenter);

// Notas de crédito: idem.
router.get('/credit-notes', requireSupervisorOrAdmin, getCreditNoteCenter);
router.get('/credit-notes/export', requireSupervisorOrAdmin, exportCreditNoteCenter);

// Panel de Cobranzas: idem (facturado/cobrado/pendiente por sucursal).
router.get('/billing-panel', requireSupervisorOrAdmin, getBillingPanel);

module.exports = router;
