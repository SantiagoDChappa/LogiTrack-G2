/* eslint-disable no-console */
// Seed de transportes para ruteo (LGT-134).
// Uso: node src/database/seed-transports.js
//
// Crea transportes variados (moto, van, camion chico/medio/grande) en la
// primera sucursal CABA disponible, asignados a drivers existentes (rol 3).
// Mapea cada transporte a sus zonas CABA correspondientes.
// Idempotente por patente.

require('dotenv').config();
const sequelize = require('./connection');
const {
    Branch, User, Zone, Transport, TransportZone,
} = require('../models/index');

const TRANSPORTS = [
    {
        name: 'Moto Mensajeria 1', plate: 'MOTO-001',
        maxWeightKg: 25, maxVolumeM3: 0.3, fixedCost: 500, costPerKm: 25,
        zones: ['CABA - Microcentro', 'CABA - Recoleta'],
    },
    {
        name: 'Moto Mensajeria 2', plate: 'MOTO-002',
        maxWeightKg: 25, maxVolumeM3: 0.3, fixedCost: 500, costPerKm: 25,
        zones: ['CABA - Palermo', 'CABA - Belgrano'],
    },
    {
        name: 'Van Reparto Norte', plate: 'VAN-101',
        maxWeightKg: 600, maxVolumeM3: 6, fixedCost: 2500, costPerKm: 90,
        zones: ['CABA - Palermo', 'CABA - Belgrano', 'CABA - Recoleta'],
    },
    {
        name: 'Van Reparto Centro', plate: 'VAN-102',
        maxWeightKg: 600, maxVolumeM3: 6, fixedCost: 2500, costPerKm: 90,
        zones: ['CABA - Microcentro', 'CABA - Caballito'],
    },
    {
        name: 'Camion Chico CABA', plate: 'CAM-201',
        maxWeightKg: 1500, maxVolumeM3: 14, fixedCost: 4000, costPerKm: 150,
        zones: ['CABA - Palermo', 'CABA - Belgrano', 'CABA - Caballito', 'CABA - Recoleta', 'CABA - Microcentro'],
    },
    {
        name: 'Camion Mediano CABA', plate: 'CAM-202',
        maxWeightKg: 3500, maxVolumeM3: 25, fixedCost: 6500, costPerKm: 220,
        zones: ['CABA - Otros'],
    },
    {
        name: 'Camion Grande Largo', plate: 'CAM-301',
        maxWeightKg: 8000, maxVolumeM3: 45, fixedCost: 12000, costPerKm: 380,
        zones: [], // sin zonas: acepta cualquier destino
    },
];

const upsertTransport = async (data, branchId, driverUserId) => {
    let t = await Transport.findOne({ where: { plate: data.plate } });
    if (t) {
        console.log(`  = ${data.plate} ya existe (id=${t.id})`);
        return t;
    }
    t = await Transport.create({
        name: data.name, plate: data.plate,
        maxWeightKg: data.maxWeightKg, maxVolumeM3: data.maxVolumeM3,
        fixedCost: data.fixedCost, costPerKm: data.costPerKm,
        driverUserId, branchId, enabled: true,
    });
    console.log(`  + ${data.name} ${data.plate} (id=${t.id})`);
    return t;
};

const linkZones = async (transportId, zoneNames) => {
    if (!zoneNames.length) { return; }
    const zones = await Zone.findAll({ where: { name: zoneNames } });
    for (const z of zones) {
        await TransportZone.findOrCreate({
            where:    { transportId, zoneId: z.id },
            defaults: { transportId, zoneId: z.id },
        });
    }
    console.log(`    zonas: ${zones.map(z => z.name).join(', ')}`);
};

(async () => {
    try {
        await sequelize.authenticate();

        const branch = await Branch.findOne({ where: { provinceId: 24 } })
            || await Branch.findOne();
        if (!branch) {
            console.error('No hay sucursales. Cargá al menos una primero.');
            process.exit(1);
        }
        console.log(`Sucursal: ${branch.name} (id=${branch.id})`);

        const drivers = await User.findAll({
            where: { roleId: 3, active: true },
            order: [['id', 'ASC']],
        });
        if (!drivers.length) {
            console.error('No hay usuarios DELIVERY (roleId=3). Corré seed-routing.js primero o creá drivers.');
            process.exit(1);
        }
        console.log(`Drivers disponibles: ${drivers.length}`);

        console.log('-- Transportes');
        for (let i = 0; i < TRANSPORTS.length; i++) {
            const data   = TRANSPORTS[i];
            const driver = drivers[i % drivers.length];
            const t      = await upsertTransport(data, branch.id, driver.id);
            await linkZones(t.id, data.zones);
        }

        console.log('\nListo. Verificar en /route/optimize.');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
})();
