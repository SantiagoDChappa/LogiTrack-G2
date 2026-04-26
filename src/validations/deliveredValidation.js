require('express-validator');

const deliveredValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .matches(/^[A-Za-záéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El nombre solo puede contener letras y espacios')
    .custom(value => {
      if (value.trim().split(/\s+/).length < 2) {
        throw new Error('Debe ingresar nombre y apellido');
      }
      return true;
    }),

  body('document')
    .notEmpty().withMessage('El documento es obligatorio')
    .custom(value => {
      const limpio = value.replace(/\D/g, '');

      if (limpio.length < 7 || limpio.length > 8) {
        throw new Error('El DNI debe tener 7 u 8 dígitos');
      }

      return true;
    }),

  body('observation')
    .optional()
    .isLength({ max: 200 })
    .withMessage('La observación no puede superar los 200 caracteres'),

  body('shipmentId')
    .notEmpty().withMessage('Falta el ID del envío')
    .isInt().withMessage('El ID del envío debe ser numérico')
];

module.exports = deliveredValidator;