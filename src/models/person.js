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
    email:    { type: DataTypes.STRING },
    personTypeId: { type: DataTypes.INTEGER }
    },
    { tableName: 'person' }
);

const getAll = async () => {
    return await Person.findAll();
};

const create = async (data) => {
    return await Person.create({
        fullName:     data.name,
        document:     data.document,
        phone:        data.phone,
        email:        data.email,
        personTypeId: data.personTypeId
    });
};

const createOrUpdate = async (data) => {
    let person = await findByDocument(data.document);

    if(person) {
        await person.update({
            phone:        data.phone,
            email:        data.email,
            personTypeId: data.personTypeId
        });
        return person;
    }
    return await create(data);
}

const search = async ({ senderName, senderDocument, recipientName, recipientDocument }) => {
    const where = {};

    if (senderName)    where.fullName    = { [Op.iLike]: `%${senderName}%` };
    if (senderDocument) where.document = senderDocument;
    if (recipientName)    where.fullName    = { [Op.iLike]: `%${recipientName}%` };
    if (recipientDocument) where.document = recipientDocument;

    return await Person.findAll({ where });
};

const findByDocument = async (document) => {
    return await Person.findOne({ where: { document } });
}

module.exports = { Person, getAll, create, search, findByDocument };
