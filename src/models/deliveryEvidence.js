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
    },

    photoBase64: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    signatureBase64: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true
    },

    longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true
    }

}, {
    tableName: 'deliveryEvidence',
    timestamps: true
});

module.exports = { DeliveryEvidence };