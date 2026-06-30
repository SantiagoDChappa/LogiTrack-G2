/* eslint-disable no-console */
// Seed para Casos de Prueba de Optimización de Ruteo
// Uso: node src/database/seed-cp-opt-test.js
// Limpieza: node src/database/seed-cp-opt-test.js --clean
//
// 5 casos, cada uno con supervisor + sucursal diferente:
//   CP-OPT-01 (Suc. Buenos Aires / Santiago): Vehículo sin capacidad
//   CP-OPT-02 (Suc. Córdoba / Amin):          Vehículo no disponible (ruta activa)
//   CP-OPT-03 (Suc. Rosario / Maximo):         4 envíos a 2 provincias distintas
//   CP-OPT-04 (Suc. Mendoza / nuevo sup.):     Envíos urgentes = vehículo dedicado
//   CP-OPT-05 (Suc. Tucumán / nuevo sup.):     Flota insuficiente para demanda total

require('dotenv').config();
const sequelize = require('./connection');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
    Branch, User, Address, Person, Shipment, Zone, Transport, TransportZone,
    Province, Route, RouteStop,
} = require('../models');

const CLEAN = process.argv.includes('--clean');
const PREFIX = 'OPT';

// ====== Helpers ======
const findOrCreate = async (Model, where, defaults = {}) => {
    const [row] = await Model.findOrCreate({ where, defaults: { ...where, ...defaults } });
    return row;
};

const ensureBranch = async (name, provinceId, lat, lng, address, postalCode) => {
    let b = await Branch.findOne({ where: { name } });
    if (!b) {
        b = await Branch.create({ name, provinceId, latitude: lat, longitude: lng, address, postalCode, statusId: 1 });
        console.log(`  + Sucursal: ${name} (id=${b.id})`);
    }
    return b;
};

const ensureSupervisor = async (email, fullName, document, branchId) => {
    let u = await User.findOne({ where: { email } });
    if (!u) {
        u = await User.create({
            fullName, email, document,
            password: await bcrypt.hash('Test1234@', 12),
            roleId: 1, active: true, branchId,
        });
        console.log(`  + Supervisor: ${email} (id=${u.id}, branch=${branchId})`);
    } else if (u.branchId !== branchId) {
        u.branchId = branchId;
        await u.save();
    }
    return u;
};

const ensureDriver = async (email, fullName, document, branchId) => {
    let u = await User.findOne({ where: { email } });
    if (!u) {
        u = await User.create({
            fullName, email, document,
            password: await bcrypt.hash('Test1234@', 12),
            roleId: 3, active: true, branchId,
        });
        console.log(`  + Driver: ${email} (id=${u.id})`);
    }
    return u;
};

const ensureTransport = async (plate, data) => {
    let t = await Transport.findOne({ where: { plate } });
    if (!t) {
        t = await Transport.create({ plate, ...data });
        console.log(`  + Transporte: ${data.name} [${plate}] (id=${t.id})`);
    } else {
        await t.update(data);
    }
    return t;
};

const ensureZone = async (name, provinceId, baseCost, prefixes = []) => {
    return findOrCreate(Zone, { name }, {
        provinceId, baseCost, postalCodePrefixes: prefixes, enabled: true,
    });
};

const ensureShipment = async (trackingId, data) => {
    let s = await Shipment.findOne({ where: { trackingId } });
    if (!s) {
        s = await Shipment.create({ trackingId, statusId: 1, packageQty: 1, ...data });
        console.log(`    + Envío: ${trackingId} (${data.weightKg}kg)`);
    }
    return s;
};

const linkZone = async (transportId, zoneId) => {
    await TransportZone.findOrCreate({
        where: { transportId, zoneId },
        defaults: { transportId, zoneId },
    });
};

// ====== Clean ======
const cleanAll = async () => {
    console.log('Limpiando data OPT-...');

    const txs = await Transport.findAll({ where: { plate: { [Op.like]: `${PREFIX}%` } } });
    for (const t of txs) {
        const routes = await Route.findAll({ where: { transportId: t.id } });
        for (const r of routes) {
            await RouteStop.destroy({ where: { routeId: r.id } });
        }
        await Route.destroy({ where: { transportId: t.id } });
        await TransportZone.destroy({ where: { transportId: t.id } });
    }

    const ships = await Shipment.findAll({ where: { trackingId: { [Op.like]: `${PREFIX}%` } } });
    for (const s of ships) {
        await RouteStop.destroy({ where: { shipmentId: s.id } });
    }
    await Shipment.destroy({ where: { trackingId: { [Op.like]: `${PREFIX}%` } } });
    await Transport.destroy({ where: { plate: { [Op.like]: `${PREFIX}%` } } });

    console.log('Limpio.');
};

// ====== CASO 1: Vehículo sin capacidad ======
const seedCase01 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-OPT-01: Vehículo sin capacidad');
    console.log('Sucursal: Buenos Aires | Supervisor: Santiago');
    console.log('══════════════════════════════════════════');

    const branch = await Branch.findOne({ where: { provinceId: 24 } });
    if (!branch) { console.log('  ⚠ No existe sucursal CABA'); return; }

    const zoneCaba = await Zone.findOne({ where: { provinceId: 24, enabled: true } });

    const driver = await ensureDriver(
        'opt01.driver@logitrack.com.ar', 'Driver OPT-01', 60000001, branch.id,
    );

    // Solo moto de 25kg disponible
    const moto = await ensureTransport(`${PREFIX}01-MOTO`, {
        name: 'OPT01 Moto 25kg', maxWeightKg: 25, maxVolumeM3: 0.3,
        fixedCost: 500, costPerKm: 25, branchId: branch.id,
        driverUserId: driver.id, enabled: true,
    });
    if (zoneCaba) await linkZone(moto.id, zoneCaba.id);

    const sender = await findOrCreate(Person, { document: '70000001' }, { fullName: 'Remitente OPT01' });
    const recipient = await findOrCreate(Person, { document: '70000002' }, { fullName: 'Dest OPT01 Pesado' });

    const addr = await Address.create({
        street: 'Av. Libertador', number: 5000, provinceId: 24,
        postalCode: '1425', lat: -34.5750, lng: -58.4200,
    });

    // Envío de 200kg — excede capacidad de moto (25kg)
    await ensureShipment(`${PREFIX}01-001`, {
        senderId: sender.id, recipientId: recipient.id, addressId: addr.id,
        currentBranchId: branch.id, zoneId: zoneCaba?.id,
        weightKg: 200, volumeM3: 3.0,
    });

    console.log('  Resultado esperado: Optimizador informa que envío excede capacidad de flota.');
    console.log('  Login: santiagochappa@logitrack.com.ar');
};

// ====== CASO 2: Vehículo no disponible (ruta activa) ======
const seedCase02 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-OPT-02: Vehículo no disponible (viaje asignado)');
    console.log('Sucursal: Córdoba | Supervisor: Amin');
    console.log('══════════════════════════════════════════');

    const branch = await Branch.findOne({ where: { provinceId: 5 } });
    if (!branch) { console.log('  ⚠ No existe sucursal Córdoba'); return; }

    const zoneCba = await ensureZone('Córdoba Capital', 5, 1200, ['5000']);

    const driver = await ensureDriver(
        'opt02.driver@logitrack.com.ar', 'Driver OPT-02', 60000002, branch.id,
    );

    // Único vehículo de la sucursal
    const truck = await ensureTransport(`${PREFIX}02-CAM`, {
        name: 'OPT02 Camión Córdoba', maxWeightKg: 500, maxVolumeM3: 20,
        fixedCost: 2000, costPerKm: 80, branchId: branch.id,
        driverUserId: driver.id, enabled: true,
    });
    await linkZone(truck.id, zoneCba.id);

    // Crear ruta PLANNED activa para este vehículo (lo ocupa)
    const existingRoute = await Route.findOne({ where: { transportId: truck.id, statusId: { [Op.in]: [1, 2] } } });
    if (!existingRoute) {
        const r = await Route.create({
            transportId: truck.id, originBranchId: branch.id,
            statusId: 1, // PLANNED
            totalDistanceKm: 50, totalCost: 6000, totalWeightKg: 30, totalVolumeM3: 1.0,
        });
        await RouteStop.create({
            routeId: r.id, sequence: 1, stopType: 'pickup',
            branchId: branch.id, lat: -31.4201, lng: -64.1888,
        });
        console.log(`  + Ruta activa PLANNED (id=${r.id}) → vehículo ocupado`);
    }

    const sender = await findOrCreate(Person, { document: '70000010' }, { fullName: 'Remitente OPT02' });
    const recipient = await findOrCreate(Person, { document: '70000011' }, { fullName: 'Dest OPT02' });

    const addr = await Address.create({
        street: 'Bv. San Juan', number: 800, provinceId: 5,
        postalCode: '5000', lat: -31.4300, lng: -64.2000,
    });

    // 2 envíos pendientes que no podrán asignarse
    await ensureShipment(`${PREFIX}02-001`, {
        senderId: sender.id, recipientId: recipient.id, addressId: addr.id,
        currentBranchId: branch.id, zoneId: zoneCba.id,
        weightKg: 15, volumeM3: 0.5,
    });
    await ensureShipment(`${PREFIX}02-002`, {
        senderId: sender.id, recipientId: recipient.id, addressId: addr.id,
        currentBranchId: branch.id, zoneId: zoneCba.id,
        weightKg: 20, volumeM3: 0.8,
    });

    console.log('  Resultado esperado: Optimizador descarta vehículo por ruta activa, no hay flota disponible.');
    console.log('  Login: amin@logitrack.com.ar');
};

// ====== CASO 3: 4 envíos a 2 provincias ======
const seedCase03 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-OPT-03: 4 envíos → 2 a Mendoza + 2 a Tucumán');
    console.log('Sucursal: Rosario | Supervisor: Maximo');
    console.log('══════════════════════════════════════════');

    const branch = await Branch.findOne({ where: { provinceId: 20 } });
    if (!branch) { console.log('  ⚠ No existe sucursal Rosario'); return; }

    await findOrCreate(Province, { id: 12 }, { description: 'Mendoza' });
    await findOrCreate(Province, { id: 23 }, { description: 'Tucumán' });

    const zoneMza = await ensureZone('Mendoza Capital', 12, 1500, ['5500']);
    const zoneTuc = await ensureZone('Tucumán Capital', 23, 1800, ['4000']);

    const driver1 = await ensureDriver('opt03.driver1@logitrack.com.ar', 'Driver OPT-03A', 60000003, branch.id);
    const driver2 = await ensureDriver('opt03.driver2@logitrack.com.ar', 'Driver OPT-03B', 60000004, branch.id);

    // 2 camiones grandes (largo alcance, sin zonas = aceptan cualquier destino)
    const cam1 = await ensureTransport(`${PREFIX}03-CAM1`, {
        name: 'OPT03 Camión Grande 1', maxWeightKg: 5000, maxVolumeM3: 30,
        fixedCost: 8000, costPerKm: 300, branchId: branch.id,
        driverUserId: driver1.id, enabled: true,
    });
    const cam2 = await ensureTransport(`${PREFIX}03-CAM2`, {
        name: 'OPT03 Camión Grande 2', maxWeightKg: 5000, maxVolumeM3: 30,
        fixedCost: 8000, costPerKm: 300, branchId: branch.id,
        driverUserId: driver2.id, enabled: true,
    });
    // Sin zonas asignadas → acepta cualquier destino

    const sender = await findOrCreate(Person, { document: '70000020' }, { fullName: 'Remitente OPT03' });

    // 2 destinos en Mendoza
    const recipMza1 = await findOrCreate(Person, { document: '70000021' }, { fullName: 'Dest Mendoza 1' });
    const recipMza2 = await findOrCreate(Person, { document: '70000022' }, { fullName: 'Dest Mendoza 2' });
    const addrMza1 = await Address.create({
        street: 'San Martín', number: 500, provinceId: 12,
        postalCode: '5500', lat: -32.8895, lng: -68.8458,
    });
    const addrMza2 = await Address.create({
        street: 'Las Heras', number: 200, provinceId: 12,
        postalCode: '5500', lat: -32.9000, lng: -68.8300,
    });

    // 2 destinos en Tucumán
    const recipTuc1 = await findOrCreate(Person, { document: '70000023' }, { fullName: 'Dest Tucumán 1' });
    const recipTuc2 = await findOrCreate(Person, { document: '70000024' }, { fullName: 'Dest Tucumán 2' });
    const addrTuc1 = await Address.create({
        street: '24 de Septiembre', number: 100, provinceId: 23,
        postalCode: '4000', lat: -26.8241, lng: -65.2226,
    });
    const addrTuc2 = await Address.create({
        street: 'Av. Mate de Luna', number: 3000, provinceId: 23,
        postalCode: '4000', lat: -26.8400, lng: -65.2100,
    });

    // Envíos a Mendoza
    await ensureShipment(`${PREFIX}03-MZA1`, {
        senderId: sender.id, recipientId: recipMza1.id, addressId: addrMza1.id,
        currentBranchId: branch.id, weightKg: 50, volumeM3: 1.5,
    });
    await ensureShipment(`${PREFIX}03-MZA2`, {
        senderId: sender.id, recipientId: recipMza2.id, addressId: addrMza2.id,
        currentBranchId: branch.id, weightKg: 40, volumeM3: 1.0,
    });

    // Envíos a Tucumán
    await ensureShipment(`${PREFIX}03-TUC1`, {
        senderId: sender.id, recipientId: recipTuc1.id, addressId: addrTuc1.id,
        currentBranchId: branch.id, weightKg: 60, volumeM3: 2.0,
    });
    await ensureShipment(`${PREFIX}03-TUC2`, {
        senderId: sender.id, recipientId: recipTuc2.id, addressId: addrTuc2.id,
        currentBranchId: branch.id, weightKg: 35, volumeM3: 1.2,
    });

    console.log('  Resultado esperado: 2 clusters (Mendoza + Tucumán), 1 vehículo por cluster.');
    console.log('  Login: floresmaximovalentin@gmail.com');
};

// ====== CASO 4: Envíos urgentes = vehículo dedicado ======
const seedCase04 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-OPT-04: Envíos urgentes (priority=3) → vehículo dedicado');
    console.log('Sucursal: Mendoza (nueva) | Supervisor: nuevo');
    console.log('══════════════════════════════════════════');

    await findOrCreate(Province, { id: 12 }, { description: 'Mendoza' });
    const branch = await ensureBranch(
        'Sucursal Mendoza', 12, -32.8895, -68.8458, 'San Martín 1000', 'M5500',
    );

    const zoneMza = await ensureZone('Mendoza Capital', 12, 1500, ['5500']);

    const sup = await ensureSupervisor('opt04.supervisor@logitrack.com.ar', 'Supervisor Mendoza OPT', 60000040, branch.id);
    const driver1 = await ensureDriver('opt04.driver1@logitrack.com.ar', 'Driver OPT-04A', 60000041, branch.id);
    const driver2 = await ensureDriver('opt04.driver2@logitrack.com.ar', 'Driver OPT-04B', 60000042, branch.id);
    const driver3 = await ensureDriver('opt04.driver3@logitrack.com.ar', 'Driver OPT-04C', 60000043, branch.id);

    // 3 vehículos para que alcancen: 1 por cada urgente + 1 para normales
    const van1 = await ensureTransport(`${PREFIX}04-VAN1`, {
        name: 'OPT04 Van 1', maxWeightKg: 600, maxVolumeM3: 6,
        fixedCost: 2500, costPerKm: 90, branchId: branch.id,
        driverUserId: driver1.id, enabled: true,
    });
    await linkZone(van1.id, zoneMza.id);

    const van2 = await ensureTransport(`${PREFIX}04-VAN2`, {
        name: 'OPT04 Van 2', maxWeightKg: 600, maxVolumeM3: 6,
        fixedCost: 2500, costPerKm: 90, branchId: branch.id,
        driverUserId: driver2.id, enabled: true,
    });
    await linkZone(van2.id, zoneMza.id);

    const van3 = await ensureTransport(`${PREFIX}04-VAN3`, {
        name: 'OPT04 Van 3', maxWeightKg: 600, maxVolumeM3: 6,
        fixedCost: 2500, costPerKm: 90, branchId: branch.id,
        driverUserId: driver3.id, enabled: true,
    });
    await linkZone(van3.id, zoneMza.id);

    const sender = await findOrCreate(Person, { document: '70000030' }, { fullName: 'Remitente OPT04' });

    const makeAddr = async (street, num, lat, lng) => Address.create({
        street, number: num, provinceId: 12, postalCode: '5500', lat, lng,
    });

    const recip1 = await findOrCreate(Person, { document: '70000031' }, { fullName: 'Dest Urgente 1' });
    const recip2 = await findOrCreate(Person, { document: '70000032' }, { fullName: 'Dest Urgente 2' });
    const recip3 = await findOrCreate(Person, { document: '70000033' }, { fullName: 'Dest Normal 1' });
    const recip4 = await findOrCreate(Person, { document: '70000034' }, { fullName: 'Dest Normal 2' });

    const addr1 = await makeAddr('Av. España', 100, -32.8900, -68.8400);
    const addr2 = await makeAddr('Av. San Martín', 700, -32.8950, -68.8500);
    const addr3 = await makeAddr('Calle Lavalle', 300, -32.8800, -68.8350);
    const addr4 = await makeAddr('Calle Rivadavia', 500, -32.8850, -68.8450);

    // 2 envíos URGENTES (priority=3) → cada uno debe ir en vehículo dedicado
    await ensureShipment(`${PREFIX}04-URG1`, {
        senderId: sender.id, recipientId: recip1.id, addressId: addr1.id,
        currentBranchId: branch.id, zoneId: zoneMza.id,
        weightKg: 15, volumeM3: 0.5, priority: 3,
    });
    await ensureShipment(`${PREFIX}04-URG2`, {
        senderId: sender.id, recipientId: recip2.id, addressId: addr2.id,
        currentBranchId: branch.id, zoneId: zoneMza.id,
        weightKg: 20, volumeM3: 0.8, priority: 3,
    });

    // 2 envíos NORMALES (priority=1) → pueden compartir vehículo
    await ensureShipment(`${PREFIX}04-NOR1`, {
        senderId: sender.id, recipientId: recip3.id, addressId: addr3.id,
        currentBranchId: branch.id, zoneId: zoneMza.id,
        weightKg: 25, volumeM3: 1.0, priority: 1,
    });
    await ensureShipment(`${PREFIX}04-NOR2`, {
        senderId: sender.id, recipientId: recip4.id, addressId: addr4.id,
        currentBranchId: branch.id, zoneId: zoneMza.id,
        weightKg: 30, volumeM3: 1.2, priority: 1,
    });

    console.log('  Resultado esperado: 3 rutas — 1 vehículo por urgente, 1 compartido para normales.');
    console.log('  Login: opt04.supervisor@logitrack.com.ar | Pass: Test1234@');
};

// ====== CASO 5: Flota insuficiente para demanda total ======
const seedCase05 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-OPT-05: Flota insuficiente (600kg demanda vs 200kg capacidad)');
    console.log('Sucursal: Tucumán (nueva) | Supervisor: nuevo');
    console.log('══════════════════════════════════════════');

    await findOrCreate(Province, { id: 23 }, { description: 'Tucumán' });
    const branch = await ensureBranch(
        'Sucursal Tucumán', 23, -26.8241, -65.2226, '24 de Septiembre 500', 'T4000',
    );

    const zoneTuc = await ensureZone('Tucumán Capital', 23, 1800, ['4000']);

    const sup = await ensureSupervisor('opt05.supervisor@logitrack.com.ar', 'Supervisor Tucumán OPT', 60000050, branch.id);
    const driver1 = await ensureDriver('opt05.driver1@logitrack.com.ar', 'Driver OPT-05A', 60000051, branch.id);
    const driver2 = await ensureDriver('opt05.driver2@logitrack.com.ar', 'Driver OPT-05B', 60000052, branch.id);

    // 2 vans chicas (100kg cada una = 200kg total)
    const van1 = await ensureTransport(`${PREFIX}05-VAN1`, {
        name: 'OPT05 Van Chica 1', maxWeightKg: 100, maxVolumeM3: 5,
        fixedCost: 1500, costPerKm: 50, branchId: branch.id,
        driverUserId: driver1.id, enabled: true,
    });
    await linkZone(van1.id, zoneTuc.id);

    const van2 = await ensureTransport(`${PREFIX}05-VAN2`, {
        name: 'OPT05 Van Chica 2', maxWeightKg: 100, maxVolumeM3: 5,
        fixedCost: 1500, costPerKm: 50, branchId: branch.id,
        driverUserId: driver2.id, enabled: true,
    });
    await linkZone(van2.id, zoneTuc.id);

    const sender = await findOrCreate(Person, { document: '70000060' }, { fullName: 'Remitente OPT05' });

    // 6 envíos de 100kg cada uno = 600kg total (flota soporta 200kg)
    for (let i = 1; i <= 6; i++) {
        const recip = await findOrCreate(Person, { document: `7000006${i}` }, { fullName: `Dest Tucumán ${i}` });
        const addr = await Address.create({
            street: `Calle OPT05-${i}`, number: i * 100, provinceId: 23,
            postalCode: '4000', lat: -26.8241 + (i * 0.005), lng: -65.2226 + (i * 0.003),
        });
        await ensureShipment(`${PREFIX}05-00${i}`, {
            senderId: sender.id, recipientId: recip.id, addressId: addr.id,
            currentBranchId: branch.id, zoneId: zoneTuc.id,
            weightKg: 100, volumeM3: 2.0,
        });
    }

    console.log('  Resultado esperado: Solo 2 envíos asignados (200kg), 4 quedan sin asignar.');
    console.log('  Login: opt05.supervisor@logitrack.com.ar | Pass: Test1234@');
};

// ====== Main ======
(async () => {
    try {
        await sequelize.authenticate();
        console.log('Conectado a DB\n');

        if (CLEAN) {
            await cleanAll();
            process.exit(0);
        }

        await seedCase01();
        await seedCase02();
        await seedCase03();
        await seedCase04();
        await seedCase05();

        console.log('\n' + '='.repeat(58));
        console.log('RESUMEN DE CUENTAS PARA TESTING');
        console.log('='.repeat(58));
        console.log('');
        console.log('CP-OPT-01 │ santiagochappa@logitrack.com.ar   │ (pass existente)');
        console.log('CP-OPT-02 │ amin@logitrack.com.ar              │ (pass existente)');
        console.log('CP-OPT-03 │ floresmaximovalentin@gmail.com     │ (pass existente)');
        console.log('CP-OPT-04 │ opt04.supervisor@logitrack.com.ar  │ Test1234@');
        console.log('CP-OPT-05 │ opt05.supervisor@logitrack.com.ar  │ Test1234@');
        console.log('');
        console.log('Para limpiar: node src/database/seed-cp-opt-test.js --clean');
    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
})();
