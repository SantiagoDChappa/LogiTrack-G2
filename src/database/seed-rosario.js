/* eslint-disable no-console */
// Seed: 50 envios desde Sucursal Rosario (id=3, Santa Fe)
// 25 destino Buenos Aires (province_id=1), 25 otras provincias
// Uso: node src/database/seed-rosario.js

require('dotenv').config();
const sequelize = require('./connection');
const { Address, Person, Shipment } = require('../models/index');
const shipmentModel = require('../models/shipment');

// Sucursal Rosario = id 3 (seed.sql: 3ra branch insertada)
const ROSARIO_BRANCH_ID = 3;

const PROVINCE_BA   = 1;  // Buenos Aires
const OTHER_PROVINCES = [5, 12, 23, 7, 14, 6, 16, 3, 13, 2, 17, 18, 15, 21, 4, 19, 11, 10, 8, 9, 24, 22, 4, 5, 12];

const STATUSES = [1, 1, 1, 2, 2, 6, 7, 2, 1, 6]; // Pendiente x3, EnTransito x3, Asignado x2, EnPrep x1, cicla

const STREETS_BA = [
    ['Av. Corrientes', '1500', '-34.6037', '-58.3816'],
    ['Florida',        '800',  '-34.6131', '-58.3772'],
    ['Lavalle',        '450',  '-34.6048', '-58.3850'],
    ['Av. Santa Fe',   '2200', '-34.5967', '-58.3935'],
    ['Callao',         '350',  '-34.6060', '-58.3924'],
    ['Av. Rivadavia',  '3100', '-34.6167', '-58.4260'],
    ['Av. Cabildo',    '1200', '-34.5571', '-58.4572'],
    ['Av. del Libertador', '900', '-34.5768', '-58.4041'],
    ['Charcas',        '670',  '-34.5956', '-58.3870'],
    ['Paraguay',       '1100', '-34.5951', '-58.3858'],
    ['Av. de Mayo',    '600',  '-34.6086', '-58.3822'],
    ['Tucumán',        '950',  '-34.6003', '-58.3793'],
    ['Viamonte',       '1300', '-34.6020', '-58.3840'],
    ['Córdoba',        '750',  '-34.5990', '-58.3830'],
    ['Sarmiento',      '1650', '-34.6035', '-58.3868'],
    ['Bartolomé Mitre','1400', '-34.6070', '-58.3855'],
    ['Diagonal Norte', '500',  '-34.6078', '-58.3756'],
    ['Perón',          '880',  '-34.6055', '-58.3824'],
    ['Reconquista',    '330',  '-34.6020', '-58.3743'],
    ['Maipú',          '760',  '-34.6002', '-58.3771'],
    ['San Martín',     '640',  '-34.6078', '-58.3750'],
    ['Suipacha',       '420',  '-34.6052', '-58.3798'],
    ['Esmeralda',      '510',  '-34.6065', '-58.3790'],
    ['Carlos Pellegrini','980','-34.6027', '-58.3838'],
    ['25 de Mayo',     '350',  '-34.6025', '-58.3710'],
];

const STREETS_OTHER = [
    ['San Martín',      '200'],
    ['Belgrano',        '550'],
    ['9 de Julio',      '340'],
    ['Rivadavia',       '800'],
    ['Mitre',           '120'],
    ['Urquiza',         '670'],
    ['Sarmiento',       '430'],
    ['Av. Colón',       '1100'],
    ['San Lorenzo',     '290'],
    ['Tucumán',         '760'],
    ['Mendoza',         '450'],
    ['Corrientes',      '880'],
    ['Entre Ríos',      '315'],
    ['Neuquén',         '540'],
    ['Salta',           '230'],
    ['Córdoba',         '970'],
    ['Chaco',           '180'],
    ['Misiones',        '640'],
    ['Catamarca',       '390'],
    ['San Juan',        '720'],
    ['San Luis',        '860'],
    ['Río Negro',       '480'],
    ['Tierra del Fuego','110'],
    ['Santa Cruz',      '550'],
    ['La Rioja',        '340'],
];

const FIRST_NAMES = ['Lucas','Valentina','Martín','Camila','Agustín','Florencia','Nicolás','Sofía','Rodrigo','María','Diego','Ana','Facundo','Carolina','Gonzalo','Jimena','Sebastián','Laura','Tomás','Paula','Hernán','Natalia','Federico','Claudia','Emilio','Verónica','Ramiro','Silvana','Ignacio','Daniela'];
const LAST_NAMES  = ['García','Rodríguez','González','Fernández','López','Martínez','Pérez','Sánchez','Romero','Torres','Flores','Díaz','Morales','Ruiz','Medina','Herrera','Gómez','Castro','Vargas','Jiménez','Suárez','Vega','Mendoza','Ramos','Álvarez','Delgado','Molina','Ortiz','Silva','Aguilar'];

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

(async () => {
    try {
        await sequelize.authenticate();
        console.log('DB conectada. Insertando 50 envios...\n');

        // Remitente único desde Rosario
        const sender = await Person.create({
            fullName: 'Logística Rosario Centro',
            document: String(rndInt(20000000, 29999999)),
            personTypeId: 1,
        });
        console.log(`  + remitente id=${sender.id}`);

        for (let i = 0; i < 50; i++) {
            const isBuenosAires = i < 25;
            const provinceId    = isBuenosAires ? PROVINCE_BA : OTHER_PROVINCES[i - 25];
            const statusId      = STATUSES[i % STATUSES.length];

            let street, number, lat, lng;
            if (isBuenosAires) {
                [street, number, lat, lng] = STREETS_BA[i];
            } else {
                [street, number] = STREETS_OTHER[i - 25];
                lat = null; lng = null;
            }

            const recipientName = `${rnd(FIRST_NAMES)} ${rnd(LAST_NAMES)}`;
            const recipientDoc  = String(rndInt(10000000, 45000000));

            const [recipient, address] = await Promise.all([
                Person.create({ fullName: recipientName, document: recipientDoc, personTypeId: 2 }),
                Address.create({
                    street,
                    number,
                    provinceId,
                    postalCode: null,
                    lat: lat ? parseFloat(lat) : null,
                    lng: lng ? parseFloat(lng) : null,
                }),
            ]);

            const shipment = await shipmentModel.create({
                statusId,
                senderId:       sender.id,
                recipientId:    recipient.id,
                addressId:      address.id,
                shipmentTypeId: rndInt(1, 2),
                weightKg:       (rndInt(1, 200) / 10).toFixed(2),
                volumeM3:       (rndInt(1, 500) / 1000).toFixed(3),
                packageQty:     rndInt(1, 5),
                currentBranchId: ROSARIO_BRANCH_ID,
            });

            const dest = isBuenosAires ? 'Buenos Aires' : `prov=${provinceId}`;
            console.log(`  [${i + 1}/50] ${shipment.trackingId} → ${dest} | status=${statusId} | ${recipientName}`);
        }

        console.log('\n✓ 50 envios insertados.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
})();
