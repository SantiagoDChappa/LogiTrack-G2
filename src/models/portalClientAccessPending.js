const { DataTypes, Op } = require('sequelize');
const sequelize = require('../database/connection');

const PortalClientAccessPending = sequelize.define('portal_client_access_pending', {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    token:     { type: DataTypes.STRING(64),  allowNull: false, unique: true },
    document:  { type: DataTypes.INTEGER,     allowNull: false },
    email:     { type: DataTypes.STRING(160), allowNull: false },
    expiresAt: { type: DataTypes.DATE,        allowNull: false },
    createdAt: { type: DataTypes.DATE }
}, { tableName: 'portal_client_access_pending', timestamps: false });

const create = (data) => PortalClientAccessPending.create(data);

const findByToken = (token) => PortalClientAccessPending.findOne({ where: { token } });

const deleteByToken = (token) => PortalClientAccessPending.destroy({ where: { token } });

const deleteByEmail = (email) => PortalClientAccessPending.destroy({ where: { email } });

const deleteExpired = () => PortalClientAccessPending.destroy({
    where: { expiresAt: { [Op.lt]: new Date() } }
});

module.exports = { PortalClientAccessPending, create, findByToken, deleteByToken, deleteByEmail, deleteExpired };
