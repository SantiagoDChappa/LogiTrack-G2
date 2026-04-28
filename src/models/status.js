const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Status = sequelize.define('status', {
    id:          { type: DataTypes.INTEGER, primaryKey: true },
    description: { type: DataTypes.STRING }
},
{ tableName: 'status', timestamps: false });

const getAll = () => {
    return Status.findAll({ order: [['id', 'ASC']] });
};

const getById = (id) => {
    return Status.findOne({ where: { id } });
};

module.exports = { Status, getAll, getById };
