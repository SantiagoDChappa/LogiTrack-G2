const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Province = sequelize.define('province', {
    id:          { type: DataTypes.INTEGER, primaryKey: true },
    description: { type: DataTypes.STRING }
},
{ tableName: 'province', timestamps: false });

const { withTtl } = require('../utils/memoryCache');

// Provincias: completamente inmutables. TTL 24h.
const getAll = withTtl(24 * 60 * 60 * 1000, () => Province.findAll(), 'province:all');

module.exports = { Province, getAll };
