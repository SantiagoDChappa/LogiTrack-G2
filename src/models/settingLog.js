const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const SettingLog = sequelize.define('settingLog', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId:    { type: DataTypes.INTEGER },
    key:       { type: DataTypes.STRING },
    oldValue:  { type: DataTypes.TEXT },
    newValue:  { type: DataTypes.TEXT },
    changedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    timestamps: false,
    tableName: 'settingLog'
});

// Asociación definida una sola vez fuera de las funciones
const setupAssociations = () => {
    if (!SettingLog.associations.user) {
        const { User } = require('./user');
        SettingLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    }
};

const logChange = async (userId, key, oldValue, newValue) => {
    if (oldValue === newValue) return;
    return await SettingLog.create({ userId, key, oldValue, newValue });
};

const getAll = async () => {
    setupAssociations();
    const { User } = require('./user');
    return await SettingLog.findAll({
        include: [{ model: User, as: 'user', required: false }],
        order: [['changedAt', 'DESC']],
        limit: 50
    });
};

module.exports = { SettingLog, logChange, getAll };