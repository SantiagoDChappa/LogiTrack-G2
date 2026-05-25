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
    // Sprint 3 - 3.3 Comentarios estructurados sobre domicilio
    ringLabel:      { type: DataTypes.STRING(40), field: 'ring_label' },
    floorApt:       { type: DataTypes.STRING(40), field: 'floor_apt' },
    referencesTxt:  { type: DataTypes.TEXT,       field: 'references_txt' },
    porterNote:     { type: DataTypes.STRING(255),field: 'porter_note' },
    restrictions:   { type: DataTypes.TEXT,       field: 'restrictions' },
},
{ tableName: 'address' });

const create = (data, options = {}) => {
    return Address.create({
        street:         data.street,
        number:         data.number,
        provinceId:     data.provinceId,
        postalCode:     data.postalCode,
        floorApartment: data.floorApartment,
        lat:            data.lat  || null,
        lng:            data.lng  || null,
        ringLabel:      data.ringLabel     || null,
        floorApt:       data.floorApt      || null,
        referencesTxt:  data.referencesTxt || null,
        porterNote:     data.porterNote    || null,
        restrictions:   data.restrictions  || null,
    }, { transaction: options.transaction });
};

module.exports = { Address, create };
