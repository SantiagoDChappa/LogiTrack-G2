const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

// Defino la tabla persona
const Person = sequelize.define('person', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    fullName:  { type: DataTypes.TEXT },
    document:    { type: DataTypes.INTEGER },
    phone:   { type: DataTypes.STRING },
    email:    { type: DataTypes.STRING }
    },
    { tableName: 'person' }
);

const getAll = () => Person.findAll();

const create = (data, options = {}) => Person.create({
    fullName:     data.name,
    document:     data.document,
    phone:        data.phone,
    email:        data.email
}, { transaction: options.transaction });

const createOrUpdate = async (data, options = {}) => {
    const transaction = options.transaction;
    const person = await Person.findOne({ where: { document: data.document }, transaction });

    if (person) {
        await person.update({
            phone:        data.phone,
            email:        data.email
        }, { transaction });
        return person;
    }
    return create(data, { transaction });
};

const search = ({ senderName, senderDocument, recipientName, recipientDocument }) => {
    const where = {};

    if (senderName) { where.fullName = { [Op.iLike]: `%${senderName}%` }; }
    if (senderDocument) { where.document = senderDocument; }
    if (recipientName) { where.fullName = { [Op.iLike]: `%${recipientName}%` }; }
    if (recipientDocument) { where.document = recipientDocument; }

    return Person.findAll({ where });
};

const findByDocument = (document) => Person.findOne({ where: { document } });
const findById = (id) => Person.findOne({ where: { id }});

module.exports = { Person, getAll, create, search, findByDocument, createOrUpdate, findById };
