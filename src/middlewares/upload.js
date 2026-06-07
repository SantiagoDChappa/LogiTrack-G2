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

// LGT-172: Logo institucional. Imágenes hasta 2 MB, persistido en base (base64).
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];

const logoFileFilter = (req, file, cb) => {
    if (ALLOWED_LOGO_MIME.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato no válido. Subí una imagen PNG, JPG, SVG o WEBP.'));
    }
};

// En memoria: el logo se persiste en la base (base64), no en disco. El disco de Render
// es efímero y el archivo se perdía en cada deploy (logo roto).
const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: LOGO_MAX_BYTES },
    fileFilter: logoFileFilter,
});

module.exports = { csvUpload, evidenceUpload, logoUpload, MAX_BYTES, EVIDENCE_MAX_BYTES, LOGO_MAX_BYTES, ALLOWED_EVIDENCE_MIME };
