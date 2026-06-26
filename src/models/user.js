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
    onboarded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    helpSeenModules: { type: DataTypes.TEXT, allowNull: false, defaultValue: '{}', field: 'help_seen_modules' },
    // #1 Primer ingreso — contraseña temporal pendiente de cambio + fecha del último cambio.
    mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'must_change_password' },
    passwordChangedAt:  { type: DataTypes.DATE,    allowNull: true,  field: 'password_changed_at' },
    // #2 2FA (TOTP) — secreto cifrado en reposo + JSON de hashes de códigos de respaldo.
    twoFactorEnabled:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'two_factor_enabled' },
    twoFactorSecret:      { type: DataTypes.TEXT,    allowNull: true,  field: 'two_factor_secret' },
    twoFactorBackupCodes: { type: DataTypes.TEXT,    allowNull: true,  field: 'two_factor_backup_codes' },
    // Perfil — foto (data URL base64) opcional.
    avatar: { type: DataTypes.TEXT, allowNull: true },
    // Bloqueo de cuenta tras intentos fallidos de login (3 intentos -> bloqueo escalable).
    failedLoginAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'failed_login_attempts' },
    lockedUntil:         { type: DataTypes.DATE,    allowNull: true,  field: 'locked_until' },
    // Reincidencia: cuántos bloqueos sin un login exitoso de por medio (escala la duración).
    lockoutCount:        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'lockout_count' },
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
    // El select de sucursal queda oculto (no deshabilitado) para roles sin sucursal
    // (ej. Administrador), así que igual llega "" en el form — Postgres rechaza
    // eso para una columna INTEGER si no lo normalizamos a null.
    if (updateData.branchId === '') {
        updateData.branchId = null;
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

// Una cuenta dada de baja (active=false) no "ocupa" su documento/email para
// siempre: se ignoran al validar unicidad, así se pueden reasignar a otra alta.
const existsByDocument = async (document) => {
    const user = await User.findOne({ where: { document, active: true } });
    return user !== null;
};

const existsByEmail = async (email) => {
    const user = await User.findOne({ where: { email, active: true } });
    return user !== null;
};

const existsByDocumentExcluding = async (document, id) => {
    const user = await User.findOne({
        where: {
            document,
            active: true,
            id: { [Op.ne]: id },
        },
    });
    return user !== null;
};

const existsByEmailExcluding = async (email, id) => {
    const user = await User.findOne({
        where: {
            email,
            active: true,
            id: { [Op.ne]: id },
        },
    });
    return user !== null;
};

// Solo cuentas activas: un email puede repetirse entre una cuenta dada de baja
// y una nueva (existsByEmail ya lo permite), así que el login/recuperación debe
// ignorar la inactiva y matchear siempre la vigente.
const findByEmail = (email) => User.findOne({ where: { email, active: true } });

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

// ── Bloqueo de cuenta tras intentos fallidos de login ─────────────────────────
const LOCKOUT_THRESHOLD = 3;
// Escalada por reincidencia: 1er bloqueo 30 min, 2do 2 h, 3ro o más 24 h.
// Se resetea con un login exitoso (no con un desbloqueo manual de un admin).
const LOCKOUT_DURATIONS_MIN = [30, 120, 1440];

const isLocked = (user) => !!(user.lockedUntil && new Date(user.lockedUntil) > new Date());

// Suma un intento fallido; si llega al umbral, bloquea la cuenta (duración según
// reincidencia) y reinicia el contador de intentos. Devuelve { locked, attempts, lockedUntil, lockoutCount }.
const registerFailedLogin = async (id) => {
    const user = await User.findByPk(id);
    if (!user) { return { locked: false, attempts: 0, lockedUntil: null }; }
    const attempts = user.failedLoginAttempts + 1;
    if (attempts >= LOCKOUT_THRESHOLD) {
        const lockoutCount = user.lockoutCount + 1;
        const minutes = LOCKOUT_DURATIONS_MIN[Math.min(lockoutCount, LOCKOUT_DURATIONS_MIN.length) - 1];
        const lockedUntil = new Date(Date.now() + minutes * 60 * 1000);
        await user.update({ failedLoginAttempts: 0, lockedUntil, lockoutCount });
        return { locked: true, attempts, lockedUntil, lockoutCount, minutes };
    }
    await user.update({ failedLoginAttempts: attempts });
    return { locked: false, attempts, lockedUntil: null };
};

// Login exitoso: limpia el contador, el bloqueo vigente y la reincidencia.
const resetFailedLogin = (id) =>
    User.update({ failedLoginAttempts: 0, lockedUntil: null, lockoutCount: 0 }, { where: { id } });

// Desbloqueo manual por un admin (antes de que expiren los 30 min).
const unlockAccount = (id) =>
    User.update({ failedLoginAttempts: 0, lockedUntil: null }, { where: { id } });

// Cuántas cuentas están bloqueadas ahora mismo (no por intentos viejos ya vencidos).
// Útil para detectar un posible ataque coordinado: varias cuentas cayendo a la vez.
const countCurrentlyLocked = () =>
    User.count({ where: { lockedUntil: { [Op.gt]: new Date() } } });

// Admins activos a quienes avisar ante actividad sospechosa.
const getActiveAdmins = () => {
    const { RoleType } = require('../constants/enums');
    return User.findAll({ where: { roleId: RoleType.ADMIN.id, active: true }, attributes: ['id', 'fullName', 'email'] });
};

// Perfil — actualiza nombre y/o foto del propio usuario.
const updateProfile = (id, { fullName, avatar }) => {
    const data = {};
    if (fullName !== undefined) { data.fullName = fullName; }
    if (avatar   !== undefined) { data.avatar = avatar; }
    return User.update(data, { where: { id } });
};

const parseHelpSeenModules = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const markHelpModuleSeen = async (id, moduleKey) => {
    const user = await getById(id);
    if (!user) return null;
    const seen = parseHelpSeenModules(user.helpSeenModules);
    seen[moduleKey] = true;
    await User.update({ helpSeenModules: JSON.stringify(seen) }, { where: { id } });
    return seen;
};

module.exports = { User, getAll, getById, create, update, deleteById, search, existsByDocument, existsByEmail, existsByDocumentExcluding, existsByEmailExcluding, findByEmail, findByDocument, setPassword, setTwoFactorPending, enableTwoFactor, disableTwoFactor, setBackupCodes, updateProfile, isLocked, registerFailedLogin, resetFailedLogin, unlockAccount, countCurrentlyLocked, getActiveAdmins, parseHelpSeenModules, markHelpModuleSeen };
