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
    roleId:   { type: DataTypes.INTEGER }
}, { timestamps: false, tableName: 'user' });

const getAll = async () => {
    return await User.findAll({ order: [['id', 'ASC']] });
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
        roleId:   data.roleId
    });

};

const search = async ({ fullName, document, email, roleId }) => {
    const where = {};

    if (fullName) where.fullName = { [Op.iLike]: `%${fullName}%` };
    if (document) where.document = document;
    if (email)    where.email    = { [Op.iLike]: `%${email}%` };
    if (roleId)   where.roleId   = roleId;

    return await User.findAll({ where, order: [['id', 'ASC']] });
};

const deleteById = async (id) => {
    return await User.destroy({ where: { id } });
};

const update = async (data) => {
    return await User.update(
        {
            fullName: data.fullName,
            email:    data.email,
            document: data.document,
            roleId:   data.roleId
        },
        { where: { id: data.id } }
    );
};

const existsByDocument = async (document) => {
    const result = await User.findOne({
        where: { document: document }
    });
    console.log("RESULTADO: " + result);
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
