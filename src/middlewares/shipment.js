const { body, validationResult } = require("express-validator");
const provinceModel        = require("../models/province");
const shipmentModel        = require("../models/shipment");
const statusModel          = require("../models/status");
const shipmentHistoryModel = require("../models/shipmentHistory");
const userModel            = require("../models/user");
const settingModel         = require("../models/setting");
const { RoleType }         = require("../constants/enums");
const { PROVINCES }        = require("../utils/provinces");

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
    body('number').isInt({ min: 1 }).withMessage('La numeración debe ser un número positivo'),
    body('province').isInt().withMessage('Provincia inválida'),
    body('weightKg').optional({ checkFalsy: true }).isFloat({ min: 0.1 }).withMessage('El peso debe ser mayor a 0'),
    body('packageQty').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('La cantidad debe ser al menos 1'),
];

const validateUpdateShipment = [
    body('recipientName').notEmpty().trim().withMessage('El nombre del destinatario es obligatorio'),
    body('recipientEmail').isEmail().normalizeEmail().withMessage('Email del destinatario inválido'),
    body('recipientPhone').isLength({ min: 8, max: 15 }).withMessage('Teléfono del destinatario inválido'),
    body('recipientDocument').isLength({ min: 7, max: 11 }).withMessage('Documento del destinatario inválido'),

    body('street').notEmpty().trim().withMessage('La calle es obligatoria'),
    body('number').notEmpty().withMessage('La numeración es obligatoria'),
    body('province').notEmpty().withMessage('La provincia es obligatoria'),

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
    if (errors.isEmpty()) { return next(); }

    const { id } = req.params;
    const [provinces, statuses, shipment, history, typesShipment, deliveryUsers, originLat, originLng, originStreet, originNumber] = await Promise.all([
        provinceModel.getAll(),
        statusModel.getAll(),
        shipmentModel.getById(id),
        shipmentHistoryModel.getByShipmentId(id),
        require('../models/typeShipment').getAll(),
        userModel.search({ roleId: RoleType.DELIVERY.id }),
        settingModel.get('origin_lat'),
        settingModel.get('origin_lng'),
        settingModel.get('origin_street'),
        settingModel.get('origin_number'),
    ]);

    const destProv = shipment ? PROVINCES[shipment.address?.provinceId] : null;
    const destLat  = shipment?.address?.lat  || (destProv ? destProv.lat  : null);
    const destLng  = shipment?.address?.lng  || (destProv ? destProv.lng  : null);
    const mapData = {
        origin: {
            lat:   parseFloat(originLat)  || -34.6037,
            lng:   parseFloat(originLng)  || -58.3816,
            label: [originStreet, originNumber].filter(Boolean).join(' ') || 'Origen',
        },
        destination: destLat ? {
            lat:   destLat,
            lng:   destLng,
            label: [shipment.address?.street, shipment.address?.number].filter(Boolean).join(' ') || (destProv ? destProv.name : ''),
        } : null,
    };

    const isSupervisor = res.locals.currentUser?.roleId === RoleType.SUPERVISOR.id;

    return res.render('shipment/update', {
        errors: errors.array().map(e => e.msg),
        shipment,
        provinces,
        statuses,
        history,
        typesShipment,
        deliveryUsers,
        mapData,
        returnUrl: req.query.from || '/shipment',
        isSupervisor,
    });
};

module.exports = { validateShipment, validateUpdateShipment, handleUpdateValidationErrors };
