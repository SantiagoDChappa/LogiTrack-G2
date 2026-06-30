const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Gasto operativo cargado a mano (egreso). Base del reporte de resultado neto.
const Expense = sequelize.define('Expense', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    category:        { type: DataTypes.STRING(40), allowNull: false },
    description:     { type: DataTypes.STRING(200), allowNull: true },
    amount:          { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    incurredOn:      { type: DataTypes.DATEONLY, allowNull: false, field: 'incurred_on' },
    branchId:        { type: DataTypes.INTEGER, allowNull: true, field: 'branch_id' },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by_user_id' },
    createdAt:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, {
    tableName: 'expense',
    schema: 'logitrack',
    timestamps: false,
});

// Categorías sugeridas (el form las ofrece; el campo acepta texto libre igual).
const CATEGORIES = ['Combustible', 'Sueldos', 'Alquiler', 'Mantenimiento', 'Servicios', 'Insumos', 'Impuestos', 'Otros'];

module.exports = { Expense, CATEGORIES };
