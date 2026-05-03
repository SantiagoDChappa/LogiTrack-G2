const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const DeliveryEvidence = sequelize.define('deliveryEvidence', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    shipmentId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },

    receiverName: {
        type: DataTypes.STRING,
        allowNull: false
    },

    receiverLastname: {
        type: DataTypes.STRING,
        allowNull: false
    },

    receiverDni: {
        type: DataTypes.STRING,
        allowNull: false
    }

}, {
    tableName: 'deliveryEvidence',
    timestamps: true
});

module.exports = { DeliveryEvidence };