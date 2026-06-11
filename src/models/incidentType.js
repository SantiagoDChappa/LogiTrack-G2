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

// Tipos que un CLIENTE externo (portal público, autogestión, chatbot) puede elegir.
// El staff sigue viendo TODOS via getActive(). Si querés cambiar el set, editá esta lista.
const CLIENT_FACING_CODES = ['PACKAGE_BROKEN', 'DELAY', 'MISSING_ITEM'];

const getClientFacing = () => IncidentType.findAll({
    where: { active: true, code: CLIENT_FACING_CODES },
    order: [['id', 'ASC']],
});

// Validación server-side: ¿este code lo puede reportar un cliente externo?
const isClientFacing = (code) => CLIENT_FACING_CODES.includes(code);

const getById = (id) => IncidentType.findOne({ where: { id } });

const getByCode = (code) => IncidentType.findOne({ where: { code } });

module.exports = { IncidentType, getActive, getClientFacing, isClientFacing, getById, getByCode, CLIENT_FACING_CODES };
