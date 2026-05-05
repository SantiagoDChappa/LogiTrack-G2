const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const FailedAttempt = sequelize.define('failedAttempt', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    shipmentId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: false
    },
    attemptDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true
    },
    longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true
    },
    photoBase64: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    observation: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    suggestedDate: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    rescheduledDate: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pendiente'
    },
    operatorId: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'failedAttempt',
    timestamps: true
});

const create = (data) => FailedAttempt.create(data);

const getByShipmentId = (shipmentId) => FailedAttempt.findAll({
    where: { shipmentId },
    order: [['attemptDate', 'DESC']]
});

const getById = (id) => FailedAttempt.findOne({ where: { id } });

const updateStatus = (id, data) => FailedAttempt.update(data, { where: { id } });

const getPending = () => FailedAttempt.findAll({
    where: { status: 'pendiente' },
    order: [['attemptDate', 'DESC']]
});

module.exports = { FailedAttempt, create, getByShipmentId, getById, updateStatus, getPending };