const { body, validationResult } = require("express-validator");


const deliveryValidation = [
    body('receiverName').notEmpty().withMessage({ type: 'receiverName', message: 'El nombre del destinatario es obligatorio' }),
    body('receiverLastname').notEmpty().withMessage({ type: 'receiverLastname', message: 'El apellido del destinatario es obligatorio' }),
    body('receiverDni').notEmpty().withMessage({ type: 'receiverDni', message: 'El DNI del destinatario es obligatorio' }),
    // GPS best-effort: el repartidor puede entregar sin señal (modo offline) o con GPS denegado.
    // Si llega, se guarda como evidencia; si no, no bloquea la entrega ni el re-sync de la cola.
    body('photoBase64').notEmpty().withMessage({ type: 'photoBase64', message: 'La foto es obligatoria' }),
    body('signatureBase64').notEmpty().withMessage({ type: 'signatureBase64', message: 'La firma es obligatoria' }),
];

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