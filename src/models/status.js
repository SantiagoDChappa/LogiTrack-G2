const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Status = sequelize.define('status', {
    id:          { type: DataTypes.INTEGER, primaryKey: true },
    description: { type: DataTypes.STRING }
},
{ tableName: 'status', timestamps: false });

const { withTtl } = require('../utils/memoryCache');

// Status es catalogo casi inmutable (se modifica via migracion, no en runtime).
// TTL alto: 1 hora.
const getAll = withTtl(60 * 60 * 1000, () => Status.findAll({ order: [['id', 'ASC']] }), 'status:all');

const getById = (id) => {
    return Status.findOne({ where: { id } });
};

module.exports = { Status, getAll, getById };
