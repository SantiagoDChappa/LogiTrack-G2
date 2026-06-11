const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const IncidentType = sequelize.define('incident_type', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code:        { type: DataTypes.STRING(40),  allowNull: false, unique: true },
    description: { type: DataTypes.STRING(120), allowNull: false },
    active:      { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true }
}, { tableName: 'incident_type', timestamps: false });

// "Otro" (code OTHER) siempre al final del listado; el resto por id ascendente.
const getActive = () => IncidentType.findAll({
    where: { active: true },
    order: [
        [sequelize.literal(`CASE WHEN "code" = 'OTHER' THEN 1 ELSE 0 END`), 'ASC'],
        ['id', 'ASC'],
    ],
});

const getById = (id) => IncidentType.findOne({ where: { id } });

const getByCode = (code) => IncidentType.findOne({ where: { code } });

module.exports = { IncidentType, getActive, getById, getByCode };
