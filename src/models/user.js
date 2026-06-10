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
    });
};

const update = async (id, data) => {
    const updateData = { ...data };
    if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, SALT_ROUNDS);
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

module.exports = { User, getAll, getById, create, update, deleteById, search, existsByDocument, existsByEmail, existsByDocumentExcluding, existsByEmailExcluding, findByEmail, findByDocument };
