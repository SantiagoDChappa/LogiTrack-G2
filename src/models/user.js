const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 12;

const User = sequelize.define('user', {
    id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fullName: { type: DataTypes.TEXT,    allowNull: false },
    email:    { type: DataTypes.TEXT,    allowNull: false, unique: true },
    password: { type: DataTypes.TEXT,    allowNull: false },
    document: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    roleId:   { type: DataTypes.INTEGER, allowNull: false },
    active:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    branchId: { type: DataTypes.INTEGER, allowNull: true  },
    // Sprint 3 - 4.2 Ventanas operativas chofer (turno)
    driverShiftStart: { type: DataTypes.TIME,    allowNull: true, field: 'driver_shift_start' },
    driverShiftEnd:   { type: DataTypes.TIME,    allowNull: true, field: 'driver_shift_end' },
    driverAvailable:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'driver_available' },
    driverUnavailableReason: { type: DataTypes.STRING(120), allowNull: true, field: 'driver_unavailable_reason' },
    driverUnavailableUntil:  { type: DataTypes.DATEONLY,    allowNull: true, field: 'driver_unavailable_until' },
    // #1 Primer ingreso — contraseña temporal pendiente de cambio + fecha del último cambio.
    mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'must_change_password' },
    passwordChangedAt:  { type: DataTypes.DATE,    allowNull: true,  field: 'password_changed_at' },
    // #2 2FA (TOTP) — secreto cifrado en reposo + JSON de hashes de códigos de respaldo.
    twoFactorEnabled:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'two_factor_enabled' },
    twoFactorSecret:      { type: DataTypes.TEXT,    allowNull: true,  field: 'two_factor_secret' },
    twoFactorBackupCodes: { type: DataTypes.TEXT,    allowNull: true,  field: 'two_factor_backup_codes' },
    // Perfil — foto (data URL base64) opcional.
    avatar: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'user', timestamps: false });

// Limite defensivo para que la UI de admin no se rompa con miles de usuarios.
// La UI deberia paginar o filtrar; este limite es solo un techo de seguridad.
const getAll = () => User.findAll({ order: [['fullName', 'ASC']], limit: 500 });

const getById = (id) => User.findByPk(id);

const create = async (data) => {
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
    return User.create({
        fullName: data.fullName,
        email:    data.email,
        password: hashedPassword,
        document: data.document,
        roleId:   data.roleId,
        branchId: data.branchId || null,
        active:   true,
        mustChangePassword: data.mustChangePassword === true || data.mustChangePassword === 'true',
    });
};

const update = async (id, data) => {
    const updateData = { ...data };
    if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, SALT_ROUNDS);
        // Reset de contraseña por admin → el usuario deberá cambiarla en su próximo ingreso.
        updateData.mustChangePassword = true;
        updateData.passwordChangedAt  = null;
    }
    if (updateData.active !== undefined) {
        updateData.active = updateData.active === 'true' || updateData.active === true;
    }
    return User.update(updateData, { where: { id } });
};

const deleteById = (id) => User.update({ active: false }, { where: { id } });

const search = ({ fullName, document, roleId, active }) => {
    const where = {};
    if (fullName) { where.fullName = { [Op.iLike]: `%${fullName}%` }; }
    if (document) { where.document = document; }
    if (roleId)   { where.roleId   = roleId; }
    
    if (active === 'true') { where.active = true; }
    else if (active === 'false') { where.active = false; }

    return User.findAll({ where, order: [['fullName', 'ASC']], limit: 500 });
};

const existsByDocument = async (document) => {
    const user = await User.findOne({ where: { document } });
    return user !== null;
};

const existsByEmail = async (email) => {
    const user = await User.findOne({ where: { email } });
    return user !== null;
};

const existsByDocumentExcluding = async (document, id) => {
    const user = await User.findOne({
        where: {
            document,
            id: { [Op.ne]: id },
        },
    });
    return user !== null;
};

const existsByEmailExcluding = async (email, id) => {
    const user = await User.findOne({
        where: {
            email,
            id: { [Op.ne]: id },
        },
    });
    return user !== null;
};

const findByEmail = (email) => User.findOne({ where: { email } });

const findByDocument = (document) => User.findOne({ where: { document } });

// Setea una nueva contraseña del propio usuario: hashea, limpia el flag de cambio
// pendiente y registra la fecha. Usado por primer ingreso y por recuperación.
const setPassword = async (id, plainPassword) => {
    const hashed = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return User.update(
        { password: hashed, mustChangePassword: false, passwordChangedAt: new Date() },
        { where: { id } }
    );
};

// ── #2 2FA ────────────────────────────────────────────────────────────────────
// Guarda el secreto cifrado dejando el 2FA inactivo hasta confirmar el primer código.
const setTwoFactorPending = (id, encryptedSecret) =>
    User.update({ twoFactorSecret: encryptedSecret, twoFactorEnabled: false }, { where: { id } });
// Activa el 2FA y guarda los códigos de respaldo (JSON de hashes).
const enableTwoFactor = (id, backupCodesJson) =>
    User.update({ twoFactorEnabled: true, twoFactorBackupCodes: backupCodesJson }, { where: { id } });
// Desactiva el 2FA y limpia secreto + códigos.
const disableTwoFactor = (id) =>
    User.update({ twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null }, { where: { id } });
const setBackupCodes = (id, backupCodesJson) =>
    User.update({ twoFactorBackupCodes: backupCodesJson }, { where: { id } });

// Perfil — actualiza nombre y/o foto del propio usuario.
const updateProfile = (id, { fullName, avatar }) => {
    const data = {};
    if (fullName !== undefined) { data.fullName = fullName; }
    if (avatar   !== undefined) { data.avatar = avatar; }
    return User.update(data, { where: { id } });
};

module.exports = { User, getAll, getById, create, update, deleteById, search, existsByDocument, existsByEmail, existsByDocumentExcluding, existsByEmailExcluding, findByEmail, findByDocument, setPassword, setTwoFactorPending, enableTwoFactor, disableTwoFactor, setBackupCodes, updateProfile };
