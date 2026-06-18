const express = require('express');
const router = express.Router();
const { getAuditoria, exportCsv } = require('../controllers/auditoria');
const { requireAdmin } = require('../middlewares/auth');

router.get('/',           requireAdmin, getAuditoria);
router.get('/export-csv', requireAdmin, exportCsv);

module.exports = router;
