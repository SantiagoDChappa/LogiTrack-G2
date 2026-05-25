const { body, validationResult } = require("express-validator");


const deliveryValidation = [
    body('receiverName').notEmpty().withMessage({ type: 'receiverName', message: 'El nombre del destinatario es obligatorio' }),
    body('receiverLastname').notEmpty().withMessage({ type: 'receiverLastname', message: 'El apellido del destinatario es obligatorio' }),
    body('receiverDni').notEmpty().withMessage({ type: 'receiverDni', message: 'El DNI del destinatario es obligatorio' }),
    body('latitude').notEmpty().withMessage({ type: 'latitude', message: 'La latitud es obligatoria' }),
    body('longitude').notEmpty().withMessage({ type: 'longitude', message: 'La longitud es obligatoria' }),
    body('photoBase64').notEmpty().withMessage({ type: 'photoBase64', message: 'La foto es obligatoria' }),
    body('signatureBase64').notEmpty().withMessage({ type: 'signatureBase64', message: 'La firma es obligatoria' })
]

const handleCreateValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('delivery/evidence', {
            shipmentId: req.params.id,
            errors:     errors.mapped(),
            routeId:    req.body.routeId || req.query.routeId || null,
            stopId:     req.body.stopId  || req.query.stopId  || null,
        });
    }
    next();
};

module.exports = {
    deliveryValidation,
    handleCreateValidationErrors
};