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
    body('senderName')
        .notEmpty().withMessage('El nombre del remitente es obligatorio')
        .bail()
        .trim()
        .isLength({ max: 100 }).withMessage('El nombre del remitente no puede superar 100 caracteres'),
    body('senderEmail')
        .optional({ checkFalsy: true })
        .isEmail().withMessage('Email del remitente inválido')
        .bail()
        .isLength({ max: 100 }).withMessage('El email no puede superar 100 caracteres')
        .normalizeEmail(),
    body('senderPhone')
        .notEmpty().withMessage('El teléfono de contacto es obligatorio')
        .bail()
        .matches(/^\d+$/).withMessage('Teléfono inválido (8-15 dígitos, solo números)')
        .bail()
        .isLength({ min: 8, max: 15 }).withMessage('Teléfono inválido (8-15 dígitos, solo números)'),
    body('senderDocument')
        .notEmpty().withMessage('El documento del remitente es obligatorio')
        .bail()
        .isInt({ min: 1000000, max: 99999999 }).withMessage('Documento del remitente inválido (DNI entre 1.000.000 y 99.999.999)'),

    body('recipientName')
        .notEmpty().withMessage('El nombre del destinatario es obligatorio')
        .bail()
        .trim()
        .isLength({ max: 100 }).withMessage('El nombre del destinatario no puede superar 100 caracteres'),
    body('recipientEmail')
        .optional({ checkFalsy: true })
        .isEmail().withMessage('Email del destinatario inválido')
        .bail()
        .isLength({ max: 100 }).withMessage('El email no puede superar 100 caracteres')
        .normalizeEmail(),
    body('recipientPhone')
        .notEmpty().withMessage('El teléfono de contacto es obligatorio')
        .bail()
        .matches(/^\d+$/).withMessage('Teléfono inválido (8-15 dígitos, solo números)')
        .bail()
        .isLength({ min: 8, max: 15 }).withMessage('Teléfono inválido (8-15 dígitos, solo números)'),
    body('recipientDocument')
        .notEmpty().withMessage('El documento del destinatario es obligatorio')
        .bail()
        .isInt({ min: 1000000, max: 99999999 }).withMessage('Documento del destinatario inválido (DNI entre 1.000.000 y 99.999.999)')
        .custom((value, { req }) => {
            if (String(value) === String(req.body.senderDocument)) {
                throw new Error('El remitente y el destinatario no pueden ser la misma persona');
            }
            return true;
        }),

    body('deliveryMode')
        .optional({ checkFalsy: true })
        .isIn(['home', 'branch_pickup']).withMessage('Modalidad de entrega inválida'),
    body('pickupBranchId')
        .if((value, { req }) => req.body.deliveryMode === 'branch_pickup')
        .notEmpty().withMessage('Debe seleccionar una sucursal de retiro')
        .bail()
        .isInt({ min: 1 }).withMessage('Sucursal de retiro inválida'),
    body('street')
        .if((value, { req }) => req.body.deliveryMode !== 'branch_pickup')
        .notEmpty().withMessage('La calle es obligatoria')
        .bail()
        .isLength({ max: 200 }).withMessage('La calle no puede superar 200 caracteres'),
    body('number')
        .if((value, { req }) => req.body.deliveryMode !== 'branch_pickup')
        .isInt({ min: 1 }).withMessage('La numeración debe ser un número positivo'),
    body('province')
        .if((value, { req }) => req.body.deliveryMode !== 'branch_pickup')
        .isInt().withMessage('Provincia inválida'),
    body('floorApartment')
        .optional({ checkFalsy: true })
        .isLength({ max: 20 }).withMessage('Piso/Depto no puede superar 20 caracteres'),
    body('shipmentTypeId')
        .notEmpty().withMessage('El tipo de envío es obligatorio')
        .bail()
        .isInt({ min: 1 }).withMessage('Tipo de envío inválido'),
    body('weightKg')
        .notEmpty().withMessage('El peso es obligatorio')
        .bail()
        .isFloat({ min: 0.1, max: 999 }).withMessage('El peso debe ser entre 0.1 y 999 kg'),
    body('packageQty')
        .notEmpty().withMessage('La cantidad de paquetes es obligatoria')
        .bail()
        .isInt({ min: 1, max: 999 }).withMessage('La cantidad debe ser entre 1 y 999'),
];

const validateUpdateShipment = [
    body('recipientName')
        .notEmpty().withMessage('El nombre del destinatario es obligatorio')
        .bail()
        .trim()
        .isLength({ max: 100 }).withMessage('El nombre del destinatario no puede superar 100 caracteres'),
    body('recipientEmail')
        .notEmpty().withMessage('El email del destinatario es obligatorio')
        .bail()
        .isEmail().withMessage('Email del destinatario inválido')
        .bail()
        .isLength({ max: 100 }).withMessage('El email no puede superar 100 caracteres')
        .normalizeEmail(),
    body('recipientPhone')
        .notEmpty().withMessage('El teléfono del destinatario es obligatorio')
        .bail()
        .matches(/^\d+$/).withMessage('El teléfono solo debe contener dígitos')
        .bail()
        .isLength({ min: 8, max: 15 }).withMessage('Teléfono del destinatario inválido (8-15 dígitos)'),
    body('recipientDocument')
        .notEmpty().withMessage('El documento del destinatario es obligatorio')
        .bail()
        .isInt({ min: 1000000, max: 99999999 }).withMessage('Documento del destinatario inválido (DNI entre 1.000.000 y 99.999.999)'),

    body('street')
        .notEmpty().withMessage('La calle es obligatoria')
        .bail()
        .trim()
        .isLength({ max: 200 }).withMessage('La calle no puede superar 200 caracteres'),
    body('number')
        .notEmpty().withMessage('La numeración es obligatoria')
        .bail()
        .isInt({ min: 1 }).withMessage('La numeración debe ser un número positivo'),
    body('province').notEmpty().withMessage('La provincia es obligatoria'),
    body('floorApartment')
        .optional({ checkFalsy: true })
        .isLength({ max: 20 }).withMessage('Piso/Depto no puede superar 20 caracteres'),
    body('statusComment')
        .optional({ checkFalsy: true })
        .isLength({ max: 500 }).withMessage('El comentario no puede superar 500 caracteres'),

    body('shipmentTypeId').notEmpty().withMessage('El tipo de envío es obligatorio'),
    body('weightKg')
        .notEmpty().withMessage('El peso es obligatorio')
        .bail()
        .isFloat({ min: 0.1, max: 999 }).withMessage('El peso debe ser entre 0.1 y 999 kg'),
    body('packageQty')
        .notEmpty().withMessage('La cantidad de paquetes es obligatoria')
        .bail()
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

    const isSupervisor = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id].includes(res.locals.currentUser?.roleId);

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


const validatePriority = [
    body('weight').isInt(),
    body('type').notEmpty(),
    body('destinationUbication.lat').notEmpty(),
    body('destinationUbication.lng').notEmpty()
]


module.exports = { validateShipment, validateUpdateShipment, handleUpdateValidationErrors, validatePriority };
