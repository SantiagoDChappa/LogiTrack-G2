const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 12;

const User = sequelize.define('user', {
    id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fullName: { type: DataTypes.TEXT    },
    email:    { type: DataTypes.STRING  },
    password: { type: DataTypes.STRING  },
    document: { type: DataTypes.INTEGER },
    roleId:   { type: DataTypes.INTEGER },
    active:   { type: DataTypes.BOOLEAN, defaultValue: true }
}, { timestamps: false, tableName: 'user' });

const getAll = async () => {
    return await User.findAll({ where: { active: true }, order: [['id', 'ASC']] });
};

const getById = async (id) => {
    return await User.findOne({ where: { id } });
};

const create = async (data) => {
    const password =  await bcrypt.hash(data.password, SALT_ROUNDS);
    return await User.create({
        fullName: data.fullName,
        email:    data.email,
        password: password,
        document: data.document,
        roleId:   data.roleId,
        active:   true
    });

};

const search = async ({ fullName, document, email, roleId, active }) => {
    const where = {};

    if (fullName) {where.fullName = { [Op.iLike]: `%${fullName}%` };}
    if (document) {where.document = document;}
    if (email)    {where.email    = { [Op.iLike]: `%${email}%` };}
    if (roleId)   {where.roleId   = roleId;}
    if (active !== undefined && active !== '') {
        where.active = active === 'true' || active === true;
    }

    return await User.findAll({ where, order: [['id', 'ASC']] });
};

const deleteById = async (id) => {
    const { Shipment } = require('./shipment');
    const { ShipmentHistory } = require('./shipmentHistory');

    return await sequelize.transaction(async (t) => {
        // Desasignamos al usuario de los envíos donde está como repartidor
        await Shipment.update(
            { deliveryUserId: null },
            { where: { deliveryUserId: id }, transaction: t }
        );

        // Limpiamos la referencia del usuario en el historial para evitar errores de clave foránea
        await ShipmentHistory.update(
            { userId: null },
            { where: { userId: id }, transaction: t }
        );

        // En lugar de borrar, marcamos como inactivo (Baja)
        return await User.update(
            { active: false },
            { where: { id }, transaction: t }
        );
    });
};

const update = async (data) => {
    const { Shipment } = require('./shipment');
    const { ShipmentHistory } = require('./shipmentHistory');

    return await sequelize.transaction(async (t) => {
        const isActive = data.active === 'true' || data.active === true || data.active === '1' || data.active === 1;
        
        // Si se está desactivando al usuario (pasando de activo a inactivo)
        if (!isActive) {
            // Desasignamos al usuario de los envíos donde está como repartidor
            await Shipment.update(
                { deliveryUserId: null },
                { where: { deliveryUserId: data.id }, transaction: t }
            );

            // Limpiamos la referencia del usuario en el historial
            await ShipmentHistory.update(
                { userId: null },
                { where: { userId: data.id }, transaction: t }
            );
        }

        return await User.update(
            {
                fullName: data.fullName,
                email:    data.email,
                document: data.document,
                roleId:   data.roleId,
                active:   isActive
            },
            { where: { id: data.id }, transaction: t }
        );
    });
};

const existsByDocument = async (document) => {
    const result = await User.findOne({
        where: { document: document }
    });
    return result !== null;
};

const existsByEmail = async (email) => {
    const result = await User.findOne({
        where: { email: email }
    });
    return result !== null;
};

const existsByDocumentExcluding = async (document, excludeId) => {
    const result = await User.findOne({
        where: { document: document, id: { [Op.ne]: excludeId } }
    });
    return result !== null;
};

const existsByEmailExcluding = async (email, excludeId) => {
    const result = await User.findOne({
        where: { email: email, id: { [Op.ne]: excludeId } }
    });
    return result !== null;
};


const findByEmail = async (email) => {
    return await User.findOne({ where: { email } });
};


module.exports = { User, getAll, getById, create, update, deleteById, search, existsByDocument, existsByEmail, existsByDocumentExcluding, existsByEmailExcluding, findByEmail };
