const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');
const { Status } = require('./status');
const { User }   = require('./user');

const ShipmentHistory = sequelize.define('shipment_history', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:   { type: DataTypes.INTEGER },
    fromStatusId: { type: DataTypes.INTEGER, allowNull: true },
    toStatusId:   { type: DataTypes.INTEGER },
    comment:      { type: DataTypes.TEXT,    allowNull: true },
    changedAt:    { type: DataTypes.DATE },
    userId:       { type: DataTypes.INTEGER, allowNull: true },
    eventType:    { type: DataTypes.STRING,  allowNull: false, defaultValue: 'STATUS_CHANGE' }
}, { tableName: 'shipment_history', timestamps: false });

ShipmentHistory.belongsTo(Status, { as: 'fromStatus', foreignKey: 'fromStatusId' });
ShipmentHistory.belongsTo(Status, { as: 'toStatus',   foreignKey: 'toStatusId'   });
ShipmentHistory.belongsTo(User,   { as: 'user',       foreignKey: 'userId'       });

// Autoreparación en caliente: si otro server con la rama vieja borra columnas
// agregadas por migraciones, esta función las restaura y reintenta la operación.
// Se puede sacar cuando el equipo entero esté en la rama nueva.
const withSchemaSelfHeal = async (op) => {
    try {
        return await op();
    } catch (e) {
        const msg = e.original?.message || e.message || '';
        if (/column .* does not exist/i.test(msg)) {
            console.warn('[shipmentHistory] schema drift detectado, re-aplicando migraciones...');
            const { runMigrations } = require('../database/migrate');
            await runMigrations();
            return op();
        }
        throw e;
    }
};

const create = async ({ shipmentId, fromStatusId, toStatusId, comment, userId, eventType }) => {
    return withSchemaSelfHeal(() => ShipmentHistory.create({
        shipmentId,
        fromStatusId: fromStatusId || null,
        toStatusId,
        comment:      comment   || null,
        userId:       userId    || null,
        eventType:    eventType || 'STATUS_CHANGE',
        changedAt:    new Date()
    }));
};

const getByShipmentId = async (shipmentId) => {
    return withSchemaSelfHeal(() => ShipmentHistory.findAll({
        where: { shipmentId },
        include: [
            { model: Status, as: 'fromStatus' },
            { model: Status, as: 'toStatus'   },
            { model: User,   as: 'user', attributes: ['id', 'fullName'] }
        ],
        order: [['changedAt', 'ASC']]
    }));
};

module.exports = { ShipmentHistory, create, getByShipmentId };
