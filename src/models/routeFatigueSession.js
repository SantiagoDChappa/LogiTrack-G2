const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

// Ojo de Patrón (LGT-199) — estado del re-chequeo de fatiga durante la ruta.
// Una fila por ruta. Rastrea el tramo de conducción actual, la detención manual
// ("Estoy detenido") y el descanso para reintentar tras un bloqueo en viaje.
const RouteFatigueSession = sequelize.define('route_fatigue_session', {
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    routeId:            { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'route_id' },
    driveStartedAt:     { type: DataTypes.DATE, allowNull: true, field: 'drive_started_at' },
    stoppedAt:          { type: DataTypes.DATE, allowNull: true, field: 'stopped_at' },
    recheckRequestedAt: { type: DataTypes.DATE, allowNull: true, field: 'recheck_requested_at' },
    pausedAt:           { type: DataTypes.DATE, allowNull: true, field: 'paused_at' },
    restUntil:          { type: DataTypes.DATE, allowNull: true, field: 'rest_until' },
    state:              { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRIVING' },
    updatedAt:          { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
}, { tableName: 'route_fatigue_session', timestamps: false });

const RecheckState = Object.freeze({
    DRIVING:         'DRIVING',         // conduciendo, sin detención registrada
    STOPPED:         'STOPPED',         // presionó "Estoy detenido", contando detención
    RECHECK_PENDING: 'RECHECK_PENDING', // se cumplieron los umbrales: debe hacer la prueba
    PAUSED:          'PAUSED',          // re-chequeo bloqueado: ruta pausada por fatiga
});

module.exports = { RouteFatigueSession, RecheckState };
