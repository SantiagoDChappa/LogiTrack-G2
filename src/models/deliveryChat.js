// Última Milla — chat efímero repartidor ↔ cliente durante la entrega.
// Se abre cuando la entrega está próxima y se cierra al completarla (entregado/fallido).
const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const DeliveryChat = sequelize.define('deliveryChat', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shipmentId:  { type: DataTypes.INTEGER, allowNull: false, field: 'shipment_id' },
    routeStopId: { type: DataTypes.INTEGER, allowNull: true,  field: 'route_stop_id' },
    status:      { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OPEN' }, // OPEN | CLOSED
    openedAt:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'opened_at' },
    closedAt:    { type: DataTypes.DATE, allowNull: true,  field: 'closed_at' },
}, { tableName: 'delivery_chat', timestamps: false });

const ChatStatus = Object.freeze({ OPEN: 'OPEN', CLOSED: 'CLOSED' });

module.exports = { DeliveryChat, ChatStatus };
