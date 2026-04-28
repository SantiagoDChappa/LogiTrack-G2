const { body, validationResult } = require("express-validator");
const userModel = require("../models/user");
const { RoleType } = require("../constants/enums");


const validateUserGeneral = [
    body('fullName')
        .notEmpty().withMessage('El nombre y apellido es obligatorio')
        .bail()
        .trim()
        .isLength({ max: 100 }).withMessage('El nombre no puede superar 100 caracteres'),
    body('email')
        .notEmpty().withMessage('El email es obligatorio')
        .bail()
        .isEmail().withMessage('El email es inválido')
        .bail()
        .isLength({ max: 100 }).withMessage('El email no puede superar 100 caracteres')
        .normalizeEmail(),
    body('document')
        .notEmpty().withMessage('El documento es obligatorio')
        .bail()
        .isInt({ min: 1000000, max: 99999999 }).withMessage('El documento debe ser un DNI válido (entre 1.000.000 y 99.999.999)'),
    body('roleId')
        .notEmpty().withMessage('El rol es obligatorio')
        .bail()
        .isIn(Object.values(RoleType).map(r => String(r.id))).withMessage('El rol seleccionado no es válido'),
];
const validateUser = [
    body('password')
        .notEmpty().withMessage('La contraseña es obligatoria')
        .bail()
        .isLength({ min: 10 }).withMessage('La contraseña debe tener al menos 10 caracteres')
        .bail()
        .isLength({ max: 128 }).withMessage('La contraseña no puede superar 128 caracteres')
        .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula')
        .matches(/\d/).withMessage('Debe contener al menos un número')
        .matches(/[^A-Za-z0-9]/).withMessage('Debe contener al menos un símbolo'),
    ...validateUserGeneral
    ];

const handleValidationErrors = async (req, res, next) => {
    const errors = validationResult(req);
    const document = req.body.document;
    const email = req.body.email;

    const errorsArray = errors.array();

    if (!errorsArray.some(e => e.path === 'document') && await userModel.existsByDocument(document)) {
        errorsArray.push({ msg: 'Ya existe un usuario con ese documento' });
    }

    if (!errorsArray.some(e => e.path === 'email') && await userModel.existsByEmail(email)) {
        errorsArray.push({ msg: 'Ya existe un usuario con ese correo electronico' });
    }

    if (errorsArray.length > 0) {
        return res.render('user/new', {
            errors:    errorsArray,
            body:      req.body,
            roleTypes: Object.values(RoleType)
        });
    }

    next();
};

const validateUpdateUser = [
    ...validateUserGeneral
];

const handleUpdateValidationErrors = async (req, res, next) => {
    const errors   = validationResult(req);
    const { id }   = req.params;
    const document = req.body.document;
    const email    = req.body.email;

    const errorsArray = errors.array();

    if (!errorsArray.some(e => e.path === 'document') && await userModel.existsByDocumentExcluding(document, id)) {
        errorsArray.push({ msg: 'Ya existe un usuario con ese documento' });
    }

    if (!errorsArray.some(e => e.path === 'email') && await userModel.existsByEmailExcluding(email, id)) {
        errorsArray.push({ msg: 'Ya existe un usuario con ese correo electronico' });
    }

    if (errorsArray.length > 0) {
        const user = { ...req.body, id };
        return res.render('user/update', {
            errors:    errorsArray,
            user,
            roleTypes: Object.values(RoleType),
            returnUrl: req.query.from || '/user',
        });
    }

    next();
};



module.exports = { validateUser, handleValidationErrors, validateUpdateUser, handleUpdateValidationErrors };
