const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Ojo de Patrón (LGT-195) — habilitación del transportista para iniciar rutas.
// DISABLED = inhabilitado (rechazó consentimiento o no realizó la prueba) hasta
// que un Supervisor lo restablezca. Vale cross-ruta.
const DriverFatigueStatus = sequelize.define('driver_fatigue_status', {
    userId:     { type: DataTypes.INTEGER, primaryKey: true, field: 'user_id' },
    status:     { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'ACTIVE' },
    reason:     { type: DataTypes.STRING(30), allowNull: true },
    disabledAt: { type: DataTypes.DATE, allowNull: true, field: 'disabled_at' },
    restoredBy: { type: DataTypes.INTEGER, allowNull: true, field: 'restored_by' },
    restoredAt: { type: DataTypes.DATE, allowNull: true, field: 'restored_at' },
    updatedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
}, { tableName: 'driver_fatigue_status', timestamps: false });

const DriverStatus = Object.freeze({ ACTIVE: 'ACTIVE', DISABLED: 'DISABLED' });
const DisableReason = Object.freeze({
    CONSENT_REJECTED: 'CONSENT_REJECTED',
    TEST_NOT_DONE:    'TEST_NOT_DONE',
    OTHER:            'OTHER',
});

module.exports = { DriverFatigueStatus, DriverStatus, DisableReason };
