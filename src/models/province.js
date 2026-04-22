const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Province = sequelize.define('province', {
    id:          { type: DataTypes.INTEGER, primaryKey: true },
    description: { type: DataTypes.STRING }
},
{ tableName: 'province', timestamps: false });

const getAll = async () => {
    return await Province.findAll();
};

module.exports = { Province, getAll };
