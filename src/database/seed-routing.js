/* eslint-disable no-console */
// Seed de datos de prueba para LGT-134 (optimizacion de ruteo).
// Uso: node src/database/seed-routing.js
//
// Crea (si no existen): 1 sucursal CABA (id ya seedeada, se usa la primera disponible),
// 2 conductores rol DELIVERY, 2 transportes (uno con zonas CABA, otro sin zona),
// 5 envios PENDIENTE en la sucursal con volumeM3 + postalCode.
//
// Es idempotente por trackingId/email/patente.

require('dotenv').config();
const sequelize = require('./connection');
const {
    Branch, User, Address, Person, Shipment, Zone, Transport, TransportZone,
} = require('../models/index');
const bcrypt = require('bcryptjs');

const upsertUser = async ({ email, fullName, document, branchId }) => {
    let u = await User.findOne({ where: { email } });
    if (u) { return u; }
    u = await User.create({
        fullName, email, document,
        password: await bcrypt.hash('Password123@', 10),
        roleId: 3, active: true, branchId,
    });
    console.log(`  + driver ${email} (id=${u.id})`);
    return u;
};

const upsertTransport = async (data) => {
    let t = await Transport.findOne({ where: { plate: data.plate } });
    if (t) { return t; }
    t = await Transport.create(data);
    console.log(`  + transport ${data.name} ${data.plate} (id=${t.id})`);
    return t;
};

const upsertShipment = async (data) => {
    let s = await Shipment.findOne({ where: { trackingId: data.trackingId } });
    if (s) { return s; }
    const address = await Address.create({
        street: data.street, number: data.number, provinceId: 24,
        postalCode: data.postalCode, lat: data.lat, lng: data.lng,
    });
    const sender = await Person.create({ fullName: 'Remitente Demo', document: '30000000' });
    const recipient = await Person.create({ fullName: data.recipientName, document: data.recipientDoc });
    s = await Shipment.create({
        trackingId: data.trackingId, statusId: 1, // PENDIENTE
        senderId: sender.id, recipientId: recipient.id, addressId: address.id,
        weightKg: data.weightKg, volumeM3: data.volumeM3, packageQty: 1,
        currentBranchId: data.branchId,
    });
    console.log(`  + shipment ${data.trackingId} (id=${s.id})`);
    return s;
};

(async () => {
    try {
        await sequelize.authenticate();

        // 1. Pick branch en CABA (provinceId=24); si no hay, usar la primera
        let branch = await Branch.findOne({ where: { provinceId: 24 } });
        if (!branch) { branch = await Branch.findOne(); }
        if (!branch) {
            console.error('No hay sucursales. Cargá al menos una en /branch o el seed.');
            process.exit(1);
        }
        console.log(`Sucursal de pruebas: ${branch.name} (id=${branch.id})`);

        // 2. Drivers
        console.log('-- Conductores');
        const d1 = await upsertUser({ email: 'demo.driver1@logitrack.com', fullName: 'Demo Driver CABA',  document: 41111111, branchId: branch.id });
        const d2 = await upsertUser({ email: 'demo.driver2@logitrack.com', fullName: 'Demo Driver Largo', document: 42222222, branchId: branch.id });

        // 3. Zonas (deben existir tras la migracion 010, pero por idempotencia validamos)
        const palermo = await Zone.findOne({ where: { name: 'CABA - Palermo' } });
        const micro   = await Zone.findOne({ where: { name: 'CABA - Microcentro' } });
        if (!palermo || !micro) {
            console.error('Faltan zonas CABA. Corré la migracion 010 primero.');
            process.exit(1);
        }

        // 4. Transportes
        console.log('-- Transportes');
        const tCaba = await upsertTransport({
            name: 'Camion Demo CABA', plate: 'DEMO001',
            maxWeightKg: 200, maxVolumeM3: 8, fixedCost: 1500, costPerKm: 60,
            driverUserId: d1.id, branchId: branch.id, enabled: true,
        });
        const _tLargo = await upsertTransport({
            name: 'Camion Demo Largo', plate: 'DEMO002',
            maxWeightKg: 800, maxVolumeM3: 30, fixedCost: 5000, costPerKm: 250,
            driverUserId: d2.id, branchId: branch.id, enabled: true,
        });

        // tCaba -> zonas CABA. tLargo -> sin zonas (acepta cualquier zona).
        await TransportZone.findOrCreate({ where: { transportId: tCaba.id, zoneId: palermo.id }, defaults: { transportId: tCaba.id, zoneId: palermo.id } });
        await TransportZone.findOrCreate({ where: { transportId: tCaba.id, zoneId: micro.id   }, defaults: { transportId: tCaba.id, zoneId: micro.id   } });

        // 5. Envios PENDIENTES en la sucursal
        console.log('-- Envios');
        await upsertShipment({ trackingId: 'DEMO-R-001', branchId: branch.id, street: 'Santa Fe',  number: 1234, postalCode: '1425', lat: -34.5870, lng: -58.4096, weightKg: 30, volumeM3: 1.0, recipientName: 'Demo Palermo 1',    recipientDoc: '50000001' });
        await upsertShipment({ trackingId: 'DEMO-R-002', branchId: branch.id, street: 'Cordoba',   number: 500,  postalCode: '1043', lat: -34.6010, lng: -58.3850, weightKg: 20, volumeM3: 0.5, recipientName: 'Demo Microcentro',  recipientDoc: '50000002' });
        await upsertShipment({ trackingId: 'DEMO-R-003', branchId: branch.id, street: 'Calle 7',   number: 50,   postalCode: '1900', lat: -34.9215, lng: -57.9545, weightKg: 80, volumeM3: 2.0, recipientName: 'Demo La Plata',     recipientDoc: '50000003' });
        await upsertShipment({ trackingId: 'DEMO-R-004', branchId: branch.id, street: 'Otro',      number: 99,   postalCode: '1425', lat: -34.5900, lng: -58.4100, weightKg: 40, volumeM3: 1.2, recipientName: 'Demo Palermo 2',    recipientDoc: '50000004' });
        await upsertShipment({ trackingId: 'DEMO-R-005', branchId: branch.id, street: 'Florida',   number: 200,  postalCode: '1005', lat: -34.6020, lng: -58.3750, weightKg: 25, volumeM3: 0.8, recipientName: 'Demo Microcentro 2', recipientDoc: '50000005' });

        console.log('\nListo. Ahora:');
        console.log(`  1. Logueate como supervisor con branchId=${branch.id}`);
        console.log('  2. Entra a /route/optimize y seleccioná los envios DEMO-R-001..005 + ambos transportes');
        console.log('  3. Calcula la ruta optima, revisa el preview con mapa, confirmá');
        console.log('  4. Logueate como Demo Driver CABA y entra a /delivery -> Mi Ruta');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
})();
