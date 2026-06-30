const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Branch = sequelize.define('branch', {
    id:         { type: DataTypes.INTEGER,     primaryKey: true, autoIncrement: true },
    name:       { type: DataTypes.STRING(150), allowNull: false },
    provinceId: { type: DataTypes.INTEGER,     allowNull: false, field: 'province_id' },
    latitude:   { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    longitude:  { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    address:    { type: DataTypes.STRING(255), allowNull: false },
    postalCode: { type: DataTypes.STRING(10),  allowNull: false, field: 'postal_code' },
    phone:      { type: DataTypes.STRING(20),  allowNull: true  },
    statusId:   { type: DataTypes.INTEGER,     allowNull: false, defaultValue: 1, field: 'status_id' },
    closed:     { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
    pickupEnabled: { type: DataTypes.BOOLEAN,  allowNull: false, defaultValue: true, field: 'pickup_enabled' },
}, { tableName: 'branch', timestamps: false });

const { withTtl, invalidate } = require('../utils/memoryCache');

// Sucursales: cambian poco. TTL 10min. Si se da de alta una, invalidar manualmente
// llamando getAll.invalidate() desde el controller de creacion.
const getAll  = withTtl(10 * 60 * 1000, () => Branch.findAll({ order: [['name', 'ASC']] }), 'branch:all');
const getById = (id) => Branch.findByPk(id);

// Exportado para que controllers de ABM de sucursales invaliden tras alta/baja/modif.
const invalidateBranchCache = () => { invalidate('branch:all'); };

const getPickupEnabled = ({ provinceId } = {}) => {
    const where = { pickupEnabled: true, closed: false };
    if (provinceId) { where.provinceId = Number(provinceId); }
    return Branch.findAll({ where, order: [['name', 'ASC']] });
};

// ── ABM de sucursales (invalidan el cache tras cada cambio) ────────────────────
const create = async (data) => { const b = await Branch.create(data); invalidate('branch:all'); return b; };
const update = async (id, data) => { const r = await Branch.update(data, { where: { id } }); invalidate('branch:all'); return r; };
const setClosed = async (id, closed) => { const r = await Branch.update({ closed: !!closed }, { where: { id } }); invalidate('branch:all'); return r; };

module.exports = { Branch, getAll, getById, getPickupEnabled, invalidateBranchCache, create, update, setClosed };
