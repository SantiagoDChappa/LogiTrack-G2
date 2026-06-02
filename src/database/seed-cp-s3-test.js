/* eslint-disable no-console */
// Seed para Casos de Prueba Sprint 3
// Uso: node src/database/seed-cp-s3-test.js
// Limpieza: node src/database/seed-cp-s3-test.js --clean
//
// Crea 6 usuarios dedicados (pass: Test1234@) + envíos / incidencias /
// settings / rutas listos para correr CP-S3-01 a CP-S3-06 sin tocar nada.

require('dotenv').config();
const sequelize = require('./connection');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
    Branch, User, Address, Person, Shipment, ShipmentHistory,
    Transport, Zone, TransportZone, Route, RouteStop,
    Province, IncidentType, Incident,
    FailedAttemptReason, StandardMessage, DeliveryTimeWindow,
} = require('../models');
const { Setting } = require('../models/setting');

const CLEAN = process.argv.includes('--clean');
const PREFIX = 'S3';
const PASS = 'Test1234@';

// ============ Helpers ============
const findOrCreate = async (Model, where, defaults = {}) => {
    const [row] = await Model.findOrCreate({ where, defaults: { ...where, ...defaults } });
    return row;
};

const ensureUser = async ({ email, fullName, document, roleId, branchId }) => {
    let u = await User.findOne({ where: { email } });
    if (!u) {
        u = await User.create({
            fullName, email, document,
            password: await bcrypt.hash(PASS, 12),
            roleId, active: true, branchId,
        });
        console.log(`  + User: ${email} (roleId=${roleId}, branch=${branchId})`);
    } else {
        // re-hash + actualizar branch/role por si cambian
        u.password = await bcrypt.hash(PASS, 12);
        u.roleId = roleId;
        u.branchId = branchId;
        u.active = true;
        await u.save();
        console.log(`  ~ User actualizado: ${email}`);
    }
    return u;
};

const ensureBranch = async (name, provinceId, lat, lng, address, postalCode) => {
    let b = await Branch.findOne({ where: { name } });
    if (!b) {
        b = await Branch.create({ name, provinceId, latitude: lat, longitude: lng, address, postalCode, statusId: 1 });
        console.log(`  + Sucursal: ${name} (id=${b.id})`);
    }
    return b;
};

const ensureShipment = async (trackingId, data) => {
    let s = await Shipment.findOne({ where: { trackingId } });
    if (!s) {
        s = await Shipment.create({ trackingId, statusId: 1, packageQty: 1, ...data });
        console.log(`    + Envío: ${trackingId} (status=${s.statusId})`);
    } else {
        await s.update(data);
        console.log(`    ~ Envío actualizado: ${trackingId}`);
    }
    return s;
};

const ensureSetting = async (key, value) => {
    await Setting.upsert({ key, value: String(value) });
};

// ============ Clean ============
const cleanAll = async () => {
    console.log('Limpiando data S3-...');
    // incidencias
    const ships = await Shipment.findAll({ where: { trackingId: { [Op.like]: `${PREFIX}-%` } } });
    const shipIds = ships.map(s => s.id);
    if (shipIds.length) {
        await Incident.destroy({ where: { shipmentId: { [Op.in]: shipIds } } });
        await ShipmentHistory.destroy({ where: { shipmentId: { [Op.in]: shipIds } } });
        await RouteStop.destroy({ where: { shipmentId: { [Op.in]: shipIds } } });
    }
    // rutas/transportes prefix
    const txs = await Transport.findAll({ where: { plate: { [Op.like]: `${PREFIX}%` } } });
    for (const t of txs) {
        const routes = await Route.findAll({ where: { transportId: t.id } });
        for (const r of routes) {
            await RouteStop.destroy({ where: { routeId: r.id } });
            await Route.destroy({ where: { id: r.id } });
        }
        await TransportZone.destroy({ where: { transportId: t.id } });
    }
    await Shipment.destroy({ where: { trackingId: { [Op.like]: `${PREFIX}-%` } } });
    await Transport.destroy({ where: { plate: { [Op.like]: `${PREFIX}%` } } });
    // users dedicados (no tocar los del seed base)
    await User.destroy({ where: { email: { [Op.like]: 's30%@logitrack.com.ar' } } });
    console.log('Limpio.');
};

// ============ Datos base parametrizables ============
const seedSettingsAndCatalogs = async () => {
    console.log('\n>> Settings y catálogos parametrizables');
    // Settings (CP-S3-04)
    await ensureSetting('codigoClaveEntregaObligatorio', 'true');
    await ensureSetting('notif.canal.email', 'true');
    await ensureSetting('notif.canal.inapp', 'true');
    await ensureSetting('notif.canal.sms', 'false');
    await ensureSetting('bot.enabled', 'true');
    await ensureSetting('maxAttempts', '3');

    // Motivos de incidencia (CP-S3-03 / CP-S3-04)
    const incidentTypes = [
        { code: 'VEH_OUT_OF_SERVICE', description: 'Vehículo fuera de servicio' },
        { code: 'WRONG_ADDRESS',      description: 'Domicilio incorrecto' },
        { code: 'CUSTOMER_ABSENT',    description: 'Cliente ausente' },
        { code: 'RECEPTION_REFUSED',  description: 'Rechazo de recepción' },
    ];
    for (const t of incidentTypes) {
        await findOrCreate(IncidentType, { code: t.code }, { description: t.description, active: true });
    }
    console.log('  + IncidentTypes parametrizados');

    // Failed attempt reasons (CP-S3-04)
    const reasons = [
        { code: 'CLIENT_NOT_HOME',  label: 'Cliente ausente', retryDays: 1, createsIncident: false },
        { code: 'WRONG_ADDRESS',    label: 'Domicilio incorrecto', retryDays: 1, createsIncident: true },
        { code: 'REFUSED_PACKAGE',  label: 'Cliente rechazó el paquete', retryDays: 0, createsIncident: true },
    ];
    for (const r of reasons) {
        await findOrCreate(FailedAttemptReason, { code: r.code }, { ...r, active: true });
    }
    console.log('  + FailedAttemptReasons parametrizados');

    // Standard messages (CP-S3-02 / CP-S3-04)
    const msgs = [
        { code: 'NOTIF_REGISTERED',   label: 'Envío registrado', body: 'Tu envío {{tracking}} fue registrado.' },
        { code: 'NOTIF_OUT_DELIVERY', label: 'Salida a reparto', body: 'Tu envío {{tracking}} salió a reparto. ETA: {{eta}}.' },
        { code: 'NOTIF_FAILED',       label: 'Intento fallido', body: 'No pudimos entregar tu envío {{tracking}}. Motivo: {{reason}}.' },
        { code: 'NOTIF_RESCHEDULED',  label: 'Reprogramación', body: 'Reprogramamos tu envío {{tracking}} para {{date}}.' },
        { code: 'NOTIF_DELIVERED',    label: 'Entrega realizada', body: 'Tu envío {{tracking}} fue entregado el {{date}}.' },
        { code: 'NOTIF_INCIDENT',     label: 'Incidencia registrada', body: 'Se registró una incidencia en tu envío {{tracking}}: {{motivo}}.' },
    ];
    for (const m of msgs) {
        await findOrCreate(StandardMessage, { code: m.code }, m);
    }
    console.log('  + StandardMessages cargados');

    // Franjas horarias (CP-S3-04 / CP-S3-06)
    const wins = [
        { label: 'Mañana',   fromTime: '09:00', toTime: '13:00' },
        { label: 'Tarde',    fromTime: '14:00', toTime: '18:00' },
        { label: 'Noche',    fromTime: '18:00', toTime: '21:00' },
    ];
    for (const w of wins) {
        await findOrCreate(DeliveryTimeWindow, { label: w.label }, { ...w, active: true });
    }
    console.log('  + DeliveryTimeWindows cargadas');
};

// ============ Sucursales reales del seed base ============
// Buenos Aires = 1 · Córdoba = 2 · Rosario = 3
const BR_BA = 1;
const BR_CBA = 2;
const BR_ROS = 3;

const getBranchOrFail = async (id) => {
    const b = await Branch.findByPk(id);
    if (!b) { throw new Error(`Branch id=${id} no existe — correr seed base primero`); }
    return b;
};

// ============ CP-S3-01: Timeline + código clave (Sucursal Rosario) ============
const seedCase01 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-S3-01: Timeline con ruteo + Código clave [Rosario]');
    console.log('══════════════════════════════════════════');

    const branch = await getBranchOrFail(BR_ROS);
    const rep = await ensureUser({
        email: 's301.rep.rosario@logitrack.com.ar',
        fullName: 'Repartidor S3-01 Rosario', document: 80000301,
        roleId: 3, branchId: branch.id,
    });

    const sender = await findOrCreate(Person, { document: '80000391' }, { fullName: 'Remitente S3-01' });
    const recipient = await findOrCreate(Person, { document: '80000392' }, { fullName: 'Dest S3-01' });
    const addr1 = await Address.create({
        street: 'Av. Cabildo', number: 1500, provinceId: branch.provinceId,
        postalCode: '1426', lat: -34.5650, lng: -58.4570,
    });
    const addr2 = await Address.create({
        street: 'Av. Rivadavia', number: 5000, provinceId: branch.provinceId,
        postalCode: '1424', lat: -34.6190, lng: -58.4500,
    });

    // Transporte + ruta asignada al repartidor
    const truck = await Transport.findOne({ where: { plate: `${PREFIX}01-CAM` } })
        || await Transport.create({
            plate: `${PREFIX}01-CAM`, name: 'S3-01 Camioneta',
            maxWeightKg: 500, maxVolumeM3: 10, fixedCost: 1200, costPerKm: 60,
            branchId: branch.id, driverUserId: rep.id, enabled: true,
        });

    // Envíos en estado Asignado (6)
    const env1 = await ensureShipment(`${PREFIX}-01-ENV1`, {
        senderId: sender.id, recipientId: recipient.id, addressId: addr1.id,
        currentBranchId: branch.id, weightKg: 10, volumeM3: 0.1,
        statusId: 6, deliveryUserId: rep.id,
        deliverySecretCode: 'ABCD-1234',
    });
    const env2 = await ensureShipment(`${PREFIX}-01-ENV2`, {
        senderId: sender.id, recipientId: recipient.id, addressId: addr2.id,
        currentBranchId: branch.id, weightKg: 8, volumeM3: 0.1,
        statusId: 6, deliveryUserId: rep.id,
        deliverySecretCode: 'KLMN-5678', // tester ingresa WXYZ-9999 (incorrecto)
    });

    // Ruta planificada con ambos envíos
    const existRoute = await Route.findOne({ where: { transportId: truck.id } });
    if (!existRoute) {
        const r = await Route.create({
            transportId: truck.id, originBranchId: branch.id,
            statusId: 1, totalDistanceKm: 30, totalCost: 1800,
            totalWeightKg: 18, totalVolumeM3: 0.2,
        });
        await RouteStop.create({ routeId: r.id, sequence: 1, stopType: 'pickup', branchId: branch.id, lat: -34.6037, lng: -58.3816 });
        await RouteStop.create({ routeId: r.id, sequence: 2, stopType: 'delivery', shipmentId: env1.id, lat: addr1.lat, lng: addr1.lng });
        await RouteStop.create({ routeId: r.id, sequence: 3, stopType: 'delivery', shipmentId: env2.id, lat: addr2.lat, lng: addr2.lng });
        console.log(`  + Ruta S3-01 con 2 envíos (id=${r.id})`);
    }

    console.log(`  Login: s301.rep.rosario@logitrack.com.ar / ${PASS}`);
    console.log('  Códigos clave: ENV1=ABCD-1234 (válido) · ENV2=KLMN-5678 (probar con WXYZ-9999 → falla)');
};

// ============ CP-S3-02: Notificaciones automáticas (Sucursal Córdoba) ============
const seedCase02 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-S3-02: Notificaciones automáticas [Córdoba]');
    console.log('══════════════════════════════════════════');

    const branch = await getBranchOrFail(BR_CBA);
    const op = await ensureUser({
        email: 's302.op.cordoba@logitrack.com.ar',
        fullName: 'Operador S3-02 Córdoba', document: 80000302,
        roleId: 2, branchId: branch.id,
    });

    const sender = await findOrCreate(Person, { document: '80000393' }, { fullName: 'Remitente S3-02' });
    const recipient = await findOrCreate(Person, { document: '80000394', email: 'cliente.s3@mail.test' }, { fullName: 'Dest S3-02 (con email)' });
    if (!recipient.email) { recipient.email = 'cliente.s3@mail.test'; await recipient.save(); }

    const addr = await Address.create({
        street: 'Belgrano', number: 2200, provinceId: branch.provinceId,
        postalCode: '1093', lat: -34.6160, lng: -58.3920,
    });

    // ENV1 listo para dar de alta (existirá ya creado pero será el tester quien dispara eventos)
    await ensureShipment(`${PREFIX}-02-ENV1`, {
        senderId: sender.id, recipientId: recipient.id, addressId: addr.id,
        currentBranchId: branch.id, weightKg: 5, volumeM3: 0.05,
        statusId: 1,
    });
    await ensureShipment(`${PREFIX}-02-ENV2`, {
        senderId: sender.id, recipientId: recipient.id, addressId: addr.id,
        currentBranchId: branch.id, weightKg: 6, volumeM3: 0.06,
        statusId: 2,
    });

    console.log(`  Login: s302.op.cordoba@logitrack.com.ar / ${PASS}`);
};

// ============ CP-S3-03: Ruteo con falla + Incidencias (Sucursal Buenos Aires) ============
const seedCase03 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-S3-03: Ruteo con falla + Incidencias [Buenos Aires]');
    console.log('══════════════════════════════════════════');

    const branch = await getBranchOrFail(BR_BA);

    const sup = await ensureUser({
        email: 's303.sup.ba@logitrack.com.ar',
        fullName: 'Supervisor S3-03 Buenos Aires', document: 80000303,
        roleId: 1, branchId: branch.id,
    });
    const driver = await ensureUser({
        email: 's303.rep.ba@logitrack.com.ar',
        fullName: 'Repartidor S3-03 Buenos Aires', document: 80000313,
        roleId: 3, branchId: branch.id,
    });

    // 2 vans (una en uso con ruta, otra de respaldo)
    const vanA = await Transport.findOne({ where: { plate: `${PREFIX}03-VANA` } })
        || await Transport.create({
            plate: `${PREFIX}03-VANA`, name: 'S3-03 Van A',
            maxWeightKg: 300, maxVolumeM3: 3, fixedCost: 1000, costPerKm: 50,
            branchId: branch.id, driverUserId: driver.id, enabled: true,
        });
    const vanB = await Transport.findOne({ where: { plate: `${PREFIX}03-VANB` } })
        || await Transport.create({
            plate: `${PREFIX}03-VANB`, name: 'S3-03 Van B (backup)',
            maxWeightKg: 300, maxVolumeM3: 3, fixedCost: 1000, costPerKm: 50,
            branchId: branch.id, enabled: true,
        });

    const sender = await findOrCreate(Person, { document: '80000395' }, { fullName: 'Remitente S3-03' });
    const recipient = await findOrCreate(Person, { document: '80000396' }, { fullName: 'Dest S3-03' });
    const mkAddr = (street, num) => Address.create({
        street, number: num, provinceId: 24, postalCode: '1043',
        lat: -34.60 + Math.random() * 0.01, lng: -58.38 + Math.random() * 0.01,
    });

    const a1 = await mkAddr('Av. Cabildo', 1500);
    const a2 = await mkAddr('Av. Rivadavia', 5000);
    const a3 = await mkAddr('Av. Santa Fe', 3200);

    const e1 = await ensureShipment(`${PREFIX}-03-E1`, {
        senderId: sender.id, recipientId: recipient.id, addressId: a1.id,
        currentBranchId: branch.id, weightKg: 20, volumeM3: 0.1, statusId: 6, deliveryUserId: driver.id,
    });
    const e2 = await ensureShipment(`${PREFIX}-03-E2`, {
        senderId: sender.id, recipientId: recipient.id, addressId: a2.id,
        currentBranchId: branch.id, weightKg: 18, volumeM3: 0.09, statusId: 6, deliveryUserId: driver.id,
    });
    const e3 = await ensureShipment(`${PREFIX}-03-E3`, {
        senderId: sender.id, recipientId: recipient.id, addressId: a3.id,
        currentBranchId: branch.id, weightKg: 15, volumeM3: 0.07, statusId: 6, deliveryUserId: driver.id,
    });

    // Ruta en ejecución con los 3 envíos sobre vanA
    const existRoute = await Route.findOne({ where: { transportId: vanA.id, statusId: { [Op.in]: [1, 2] } } });
    if (!existRoute) {
        const r = await Route.create({
            transportId: vanA.id, originBranchId: branch.id,
            statusId: 2, // En ejecución
            totalDistanceKm: 25, totalCost: 2250, totalWeightKg: 53, totalVolumeM3: 0.26,
        });
        await RouteStop.create({ routeId: r.id, sequence: 1, stopType: 'pickup', branchId: branch.id, lat: branch.latitude, lng: branch.longitude });
        await RouteStop.create({ routeId: r.id, sequence: 2, stopType: 'delivery', shipmentId: e1.id, lat: a1.lat, lng: a1.lng });
        await RouteStop.create({ routeId: r.id, sequence: 3, stopType: 'delivery', shipmentId: e2.id, lat: a2.lat, lng: a2.lng });
        await RouteStop.create({ routeId: r.id, sequence: 4, stopType: 'delivery', shipmentId: e3.id, lat: a3.lat, lng: a3.lng });
        console.log(`  + Ruta S3-03 EN EJECUCIÓN (id=${r.id}, vanA + 3 envíos)`);
    }

    console.log(`  Login: s303.sup.ba@logitrack.com.ar / ${PASS}`);
    console.log('  Vehículo backup disponible: S303-VANB');
};

// ============ CP-S3-04: Parámetros admin + ventana operativa ============
const seedCase04 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-S3-04: Parámetros admin + ventana operativa chofer');
    console.log('══════════════════════════════════════════');

    const branchCba = await getBranchOrFail(BR_CBA);
    await ensureUser({
        email: 's304.admin@logitrack.com.ar',
        fullName: 'Admin S3-04', document: 80000304,
        roleId: 4, branchId: null,
    });
    // Chofer C-001 sin ventanas (para asignar desde el test) — en Córdoba
    await ensureUser({
        email: 's304.driver.cordoba@logitrack.com.ar',
        fullName: 'Chofer C-001 S3-04 Córdoba', document: 80000314,
        roleId: 3, branchId: branchCba.id,
    });

    // Settings ya cargadas por seedSettingsAndCatalogs
    console.log(`  Login: s304.admin@logitrack.com.ar / ${PASS}`);
};

// ============ CP-S3-05: Bot portal público (envío en Buenos Aires) ============
const seedCase05 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-S3-05: Bot portal público (sin login)');
    console.log('══════════════════════════════════════════');

    const branch = await getBranchOrFail(BR_BA);
    const sender = await findOrCreate(Person, { document: '80000397' }, { fullName: 'Remitente S3-05' });
    const recipient = await findOrCreate(Person, { document: '80000398' }, { fullName: 'Dest S3-05' });
    const addr = await Address.create({
        street: 'Av. Corrientes', number: 1500, provinceId: branch.provinceId,
        postalCode: '1043', lat: -34.6037, lng: -58.3816,
    });

    await ensureShipment(`${PREFIX}-05-ENV1`, {
        trackingId: `${PREFIX}-05-ENV1`,
        senderId: sender.id, recipientId: recipient.id, addressId: addr.id,
        currentBranchId: branch.id, weightKg: 4, volumeM3: 0.05,
        statusId: 2, // En tránsito
        portalToken: 'token-s3-0501',
    });
    console.log('  Tracking público: S3-05-ENV1');
    console.log('  Portal: /tracking (sin login)');
};

// ============ CP-S3-06: Experiencia entrega (Sucursal Rosario) ============
const seedCase06 = async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('CP-S3-06: Modalidad + horarios + comentarios [Rosario]');
    console.log('══════════════════════════════════════════');

    const branch = await getBranchOrFail(BR_ROS);
    const op = await ensureUser({
        email: 's306.op.rosario@logitrack.com.ar',
        fullName: 'Operador S3-06 Rosario', document: 80000306,
        roleId: 2, branchId: branch.id,
    });

    // Sucursal habilitada para retiro
    await ensureSetting(`branch.${branch.id}.retiroHabilitado`, 'true');

    const sender = await findOrCreate(Person, { document: '80000399' }, { fullName: 'Remitente S3-06' });
    const recipient = await findOrCreate(Person, { document: '80000400' }, { fullName: 'Dest S3-06' });
    const addr = await Address.create({
        street: 'Av. Santa Fe', number: 3200, provinceId: branch.provinceId,
        postalCode: '1425', lat: -34.5912, lng: -58.4006,
    });

    await ensureShipment(`${PREFIX}-06-ENV1`, {
        senderId: sender.id, recipientId: recipient.id, addressId: addr.id,
        currentBranchId: branch.id, weightKg: 6, volumeM3: 0.06,
        statusId: 1, deliveryMode: 'home',
        expectedDeliveryFrom: '14:00:00', expectedDeliveryTo: '18:00:00',
        specialInstructions: 'Timbre 4B, dejar en portería si no hay nadie',
        portalToken: 'token-s3-0601',
    });

    console.log(`  Login: s306.op.rosario@logitrack.com.ar / ${PASS}`);
    console.log('  Portal token para autogestión: token-s3-0601');
};

// ============ Main ============
(async () => {
    try {
        await sequelize.authenticate();
        console.log('Conexión DB OK');
        if (CLEAN) {
            await cleanAll();
        } else {
            await seedSettingsAndCatalogs();
            await seedCase01();
            await seedCase02();
            await seedCase03();
            await seedCase04();
            await seedCase05();
            await seedCase06();
        }
        console.log('\n✅ Seed Sprint 3 completo.');
        process.exit(0);
    } catch (e) {
        console.error('Seed falló:', e);
        process.exit(1);
    }
})();
