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
const { requireAdmin } = require('../middlewares/auth');

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

// Centro de Facturación: solo Administrador (visión global de todas las sucursales).
router.get('/invoices', requireAdmin, getInvoiceCenter);
router.get('/invoices/export', requireAdmin, exportInvoiceCenter);

// Notas de crédito: solo Administrador.
router.get('/credit-notes', requireAdmin, getCreditNoteCenter);
router.get('/credit-notes/export', requireAdmin, exportCreditNoteCenter);

// Panel de Cobranzas: solo Administrador (facturado/cobrado/pendiente por sucursal).
router.get('/billing-panel', requireAdmin, getBillingPanel);

module.exports = router;
