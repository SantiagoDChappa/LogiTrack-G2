const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Status = sequelize.define('status', {
    id:          { type: DataTypes.INTEGER, primaryKey: true },
    description: { type: DataTypes.STRING }
},
{ tableName: 'status', timestamps: false });

const getAll = async () => {
    return await Status.findAll({ order: [['id', 'ASC']] });
};

const getById = async (id) => {
    return await Status.findOne({ where: { id } });
};

module.exports = { Status, getAll, getById };
