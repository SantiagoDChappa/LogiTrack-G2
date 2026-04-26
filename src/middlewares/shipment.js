const { body, validationResult } = require("express-validator");
const provinceModel        = require("../models/province");
const shipmentModel        = require("../models/shipment");
const statusModel          = require("../models/status");
const shipmentHistoryModel = require("../models/shipmentHistory");

const validateShipment = [
    body('senderName').notEmpty().trim().withMessage('El nombre del remitente es obligatorio'),
    body('senderEmail').isEmail().normalizeEmail().withMessage('Email del remitente inválido'),
    body('senderPhone').isLength({ min: 8, max: 15 }).withMessage('Teléfono del remitente inválido'),
    body('senderDocument').isLength({ min: 7, max: 11 }).withMessage('Documento del remitente inválido'),

    body('recipientName').notEmpty().trim().withMessage('El nombre del destinatario es obligatorio'),
    body('recipientEmail').isEmail().normalizeEmail().withMessage('Email del destinatario inválido'),
    body('recipientPhone').isLength({ min: 8, max: 15 }).withMessage('Teléfono del destinatario inválido'),
    body('recipientDocument')
        .isLength({ min: 7, max: 11 }).withMessage('Documento del destinatario inválido')
        .custom((value, { req }) => {
            const clean = v => v?.replace(/\./g, '');
            if (clean(value) === clean(req.body.senderDocument)) {
                throw new Error('El remitente y el destinatario no pueden ser la misma persona');
            }
            return true;
        }),

    body('street').notEmpty().withMessage('La calle es obligatoria'),
    body('number').notEmpty().withMessage('La numeración es obligatoria'),
    body('province').notEmpty().withMessage('La provincia es obligatoria'),
    body('postalCode').notEmpty().withMessage('El código postal es obligatorio'),

];

/*const handleValidationErrors = async (req, res, next) => {
    const errors = validationResult(req);
    const provinces = await provinceModel.getAll();

    const recipientDoc = req.body.recipientDocument;
    const senderDoc    = req.body.senderDocument;

    const errorsArray = errors.array();

    if (await shipmentModel.existsByDocument(recipientDoc)) {
        errorsArray.push({ msg: 'Ya existe un envío con ese documento de destinatario' });
    }
    if (await shipmentModel.existsByDocument(senderDoc)) {
        errorsArray.push({ msg: 'Ya existe un envío con ese documento de remitente' });
    }

    if (errorsArray.length > 0) {
        const typesShipment = await require('../models/typeShipment').getAll();
        return res.render('shipment/new', { errors: errorsArray, body: req.body, provinces, typesShipment });
    }

    next();
};*/

const validateUpdateShipment = [
    body('recipientName').notEmpty().trim().withMessage('El nombre del destinatario es obligatorio'),
    body('recipientEmail').isEmail().normalizeEmail().withMessage('Email del destinatario inválido'),
    body('recipientPhone').isLength({ min: 8, max: 15 }).withMessage('Teléfono del destinatario inválido'),
    body('recipientDocument').isLength({ min: 7, max: 11 }).withMessage('Documento del destinatario inválido'),

    body('street').notEmpty().trim().withMessage('La calle es obligatoria'),
    body('number').notEmpty().withMessage('La numeración es obligatoria'),
    body('province').notEmpty().withMessage('La provincia es obligatoria'),
    body('postalCode').notEmpty().withMessage('El código postal es obligatorio'),

    body('shipmentTypeId').notEmpty().withMessage('El tipo de envío es obligatorio'),
    body('weightKg')
        .notEmpty().withMessage('El peso es obligatorio')
        .isFloat({ min: 0.1, max: 999 }).withMessage('El peso debe ser entre 0.1 y 999 kg'),
    body('packageQty')
        .notEmpty().withMessage('La cantidad de paquetes es obligatoria')
        .isInt({ min: 1, max: 999 }).withMessage('La cantidad debe ser entre 1 y 999'),
];

const handleUpdateValidationErrors = async (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const { id } = req.params;
    const [provinces, statuses, shipment, history, typesShipment] = await Promise.all([
        provinceModel.getAll(),
        statusModel.getAll(),
        shipmentModel.getById(id),
        shipmentHistoryModel.getByShipmentId(id),
        require('../models/typeShipment').getAll(),
    ]);

    return res.render('shipment/update', {
        errors: errors.array(),
        shipment,
        provinces,
        statuses,
        history,
        typesShipment,
        mapData: { origin: { lat: -34.6037, lng: -58.3816, label: 'Origen' }, destination: null },
    });
};

/*module.exports = { validateShipment, handleValidationErrors, validateUpdateShipment, handleUpdateValidationErrors };*/
module.exports = { validateShipment, validateUpdateShipment, handleUpdateValidationErrors };