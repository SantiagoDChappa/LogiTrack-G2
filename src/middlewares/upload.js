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

module.exports = { csvUpload, MAX_BYTES };
