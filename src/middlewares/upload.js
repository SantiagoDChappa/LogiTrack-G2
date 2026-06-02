const multer = require('multer');

const MAX_BYTES = 10 * 1024 * 1024;

const csvFileFilter = (req, file, cb) => {
    const isCsvMime = file.mimetype === 'text/csv'
                   || file.mimetype === 'application/vnd.ms-excel'
                   || file.mimetype === 'application/csv'
                   || file.mimetype === 'text/plain';
    const isCsvExt = /\.csv$/i.test(file.originalname || '');
    if (isCsvMime || isCsvExt) {
        cb(null, true);
    } else {
        cb(new Error('Solo se aceptan archivos .csv'));
    }
};

const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: MAX_BYTES },
    fileFilter: csvFileFilter,
});

// Evidencias de incidencia: imágenes y PDF, hasta 5 MB, en memoria (se guardan en base64).
const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EVIDENCE_MIME = ['image/jpeg', 'image/png', 'application/pdf'];

const evidenceFileFilter = (req, file, cb) => {
    if (ALLOWED_EVIDENCE_MIME.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Solo se aceptan imágenes (JPG/PNG) o PDF'));
    }
};

const evidenceUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: EVIDENCE_MAX_BYTES },
    fileFilter: evidenceFileFilter,
});

module.exports = { csvUpload, evidenceUpload, MAX_BYTES, EVIDENCE_MAX_BYTES };
