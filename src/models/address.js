const { DataTypes } = require('sequelize');
const sequelize = require('../database/connection');

const Address = sequelize.define('address', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    street:         { type: DataTypes.STRING },
    number:         { type: DataTypes.INTEGER },
    provinceId:     { type: DataTypes.INTEGER },
    postalCode:     { type: DataTypes.STRING },
    floorApartment: { type: DataTypes.STRING },
    lat:            { type: DataTypes.FLOAT },
    lng:            { type: DataTypes.FLOAT },
},
{ tableName: 'address' });

const create = async (data) => {
    return Address.create({
        street:         data.street,
        number:         data.number,
        provinceId:     data.provinceId,
        postalCode:     data.postalCode,
        floorApartment: data.floorApartment,
        lat:            data.lat  || null,
        lng:            data.lng  || null,
    });
};

module.exports = { Address, create };
