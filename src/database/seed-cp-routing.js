/* eslint-disable no-console */
// Seed idempotente para CPs Sprint 2 - Optimización de Ruteo (LGT-126)
// Uso: node src/database/seed-cp-routing.js
//
// Crea por CADA sucursal activa:
//   - Transportes test (patente prefijada "CPR<NN>-B<branchId>")
//   - Envíos test (trackingId prefijado "CPR<NN>-B<branchId>-NNN")
//   - Zonas Mendoza/Córdoba si no existen
//   - 1 ruta activa PLANNED para CP-R16
//
// Idempotente: si ya existe (por plate/trackingId) no duplica.
// Para limpiar: node src/database/seed-cp-routing.js --clean

require('dotenv').config();
const sequelize = require('./connection');
const bcrypt = require('bcryptjs');
const {
    Branch, User, Address, Person, Shipment, Zone, Transport, TransportZone,
    Province, Route, RouteStop,
} = require('../models');

const CLEAN = process.argv.includes('--clean');

const PROVINCE_IDS = { CABA: 24, MENDOZA: 13, CORDOBA: 14, BSAS: 1 };

// ====== Helpers idempotentes ======
const upsert = async (Model, where, defaults) => {
    const [row] = await Model.findOrCreate({ where, defaults: { ...where, ...defaults } });
    return row;
};

const upsertProvince = async (id, description) => upsert(Province, { id }, { description });

const upsertZone = async (name, provinceId, baseCost, prefixes) =>
    upsert(Zone, { name }, { provinceId, baseCost, postalCodePrefixes: prefixes, enabled: true });

const upsertAddress = async (key, data) => {
    let a = await Address.findOne({ where: { street: key, number: data.number } });
    if (a) { return a; }
    return Address.create({ street: key, ...data });
};

const upsertPerson = async (document, fullName) =>
    upsert(Person, { document }, { fullName });

const upsertTransport = async (plate, data) => {
    let t = await Transport.findOne({ where: { plate } });
    if (t) {
        // actualizar enabled si cambia (ej CP-R07)
        if (data.enabled !== undefined && t.enabled !== data.enabled) {
            t.enabled = data.enabled; await t.save();
        }
        return t;
    }
    return Transport.create({ plate, ...data });
};

const linkTransportZone = async (transportId, zoneId) =>
    TransportZone.findOrCreate({ where: { transportId, zoneId }, defaults: { transportId, zoneId } });

const upsertShipment = async (trackingId, data) => {
    let s = await Shipment.findOne({ where: { trackingId } });
    if (s) { return s; }
    return Shipment.create({ trackingId, statusId: 1, packageQty: 1, ...data });
};

// ====== Clean ======
const cleanAll = async () => {
    console.log('Limpiando data CP-R...');
    const txs = await Transport.findAll({ where: { plate: { [require('sequelize').Op.like]: 'CPR%' } } });
    for (const t of txs) {
        await TransportZone.destroy({ where: { transportId: t.id } });
        await Route.destroy({ where: { transportId: t.id } });
    }
    const ships = await Shipment.findAll({ where: { trackingId: { [require('sequelize').Op.like]: 'CPR%' } } });
    for (const s of ships) {
        await RouteStop.destroy({ where: { shipmentId: s.id } });
    }
    await Shipment.destroy({ where: { trackingId: { [require('sequelize').Op.like]: 'CPR%' } } });
    await Transport.destroy({ where: { plate: { [require('sequelize').Op.like]: 'CPR%' } } });
    console.log('✓ Limpio.');
};

// ====== Seed por sucursal ======
const seedBranch = async (branch, zones) => {
    const bId = branch.id;
    const prefix = `B${bId}`;
    console.log(`\n=== Sucursal ${branch.name} (id=${bId}, provinciaId=${branch.provinceId}) ===`);

    // Zona principal de la sucursal (primera zona de su provincia)
    const localZone = await Zone.findOne({ where: { provinceId: branch.provinceId, enabled: true } });
    if (!localZone) {
        console.log(`  ⚠ Sin zona en provincia ${branch.provinceId}. Skipping.`);
        return;
    }

    // ====== Transportes para CPs ======
    const tCPR02 = await upsertTransport(`CPR02-${prefix}`, {
        name: `CP-R02 Cap50 ${prefix}`, maxWeightKg: 50, maxVolumeM3: 5,
        fixedCost: 500, costPerKm: 10, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR02.id, localZone.id);

    const tCPR03 = await upsertTransport(`CPR03-${prefix}`, {
        name: `CP-R03 SinZonas ${prefix}`, maxWeightKg: 500, maxVolumeM3: 20,
        fixedCost: 2000, costPerKm: 80, branchId: bId, enabled: true,
    }); // sin zonas asignadas

    const tCPR07 = await upsertTransport(`CPR07-${prefix}`, {
        name: `CP-R07 Deshab ${prefix}`, maxWeightKg: 999, maxVolumeM3: 50,
        fixedCost: 0, costPerKm: 1, branchId: bId, enabled: false,
    });
    await linkTransportZone(tCPR07.id, localZone.id);

    const tCPR08a = await upsertTransport(`CPR08A-${prefix}`, {
        name: `CP-R08 Cap20 ${prefix}`, maxWeightKg: 20, maxVolumeM3: 5,
        fixedCost: 300, costPerKm: 10, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR08a.id, localZone.id);

    const tCPR08b = await upsertTransport(`CPR08B-${prefix}`, {
        name: `CP-R08 Cap30 ${prefix}`, maxWeightKg: 30, maxVolumeM3: 5,
        fixedCost: 300, costPerKm: 10, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR08b.id, localZone.id);

    const tCPR11a = await upsertTransport(`CPR11A-${prefix}`, {
        name: `CP-R11 Barato ${prefix}`, maxWeightKg: 500, maxVolumeM3: 20,
        fixedCost: 1000, costPerKm: 100, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR11a.id, localZone.id);

    const tCPR11b = await upsertTransport(`CPR11B-${prefix}`, {
        name: `CP-R11 Caro ${prefix}`, maxWeightKg: 500, maxVolumeM3: 20,
        fixedCost: 1000, costPerKm: 200, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR11b.id, localZone.id);

    // CP-R13: valores controlados para fórmula 1000 + 50*km + 500
    const tCPR13 = await upsertTransport(`CPR13-${prefix}`, {
        name: `CP-R13 CostoFijo ${prefix}`, maxWeightKg: 200, maxVolumeM3: 10,
        fixedCost: 1000, costPerKm: 50, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR13.id, localZone.id);

    // CP-R15: flota chica para forzar déficit (cap total = 200kg)
    const tCPR15a = await upsertTransport(`CPR15A-${prefix}`, {
        name: `CP-R15 Cap100A ${prefix}`, maxWeightKg: 100, maxVolumeM3: 5,
        fixedCost: 500, costPerKm: 20, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR15a.id, localZone.id);

    const tCPR15b = await upsertTransport(`CPR15B-${prefix}`, {
        name: `CP-R15 Cap100B ${prefix}`, maxWeightKg: 100, maxVolumeM3: 5,
        fixedCost: 500, costPerKm: 20, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR15b.id, localZone.id);

    // CP-R16: transporte ocupado con ruta activa
    const tCPR16 = await upsertTransport(`CPR16-${prefix}`, {
        name: `CP-R16 Ocupado ${prefix}`, maxWeightKg: 300, maxVolumeM3: 15,
        fixedCost: 1000, costPerKm: 30, branchId: bId, enabled: true,
    });
    await linkTransportZone(tCPR16.id, localZone.id);

    // ====== Direcciones y Personas ======
    const sender = await upsertPerson('30000000', 'Remitente CP-Test');
    const recipient = await upsertPerson(`9000${bId}001`, `Dest Generico B${bId}`);

    // Coords aproximadas según provincia
    const provCoords = {
        24: { lat: -34.60, lng: -58.40, cp: '1425' },
        13: { lat: -32.89, lng: -68.84, cp: '5500' },
        14: { lat: -31.42, lng: -64.19, cp: '5000' },
        1:  { lat: -34.92, lng: -57.95, cp: '1900' },
    };
    const local = provCoords[branch.provinceId] || provCoords[24];

    const addrLocal = await upsertAddress(`CPR-local-${prefix}`, {
        number: 100, provinceId: branch.provinceId, postalCode: local.cp, lat: local.lat, lng: local.lng,
    });
    const addrMza = await upsertAddress(`CPR-mza-${prefix}`, {
        number: 200, provinceId: PROVINCE_IDS.MENDOZA, postalCode: '5500', lat: -32.89, lng: -68.84,
    });
    const addrCba = await upsertAddress(`CPR-cba-${prefix}`, {
        number: 300, provinceId: PROVINCE_IDS.CORDOBA, postalCode: '5000', lat: -31.42, lng: -64.19,
    });
    const addrNoGeo = await upsertAddress(`CPR-nogeo-${prefix}`, {
        number: 400, provinceId: branch.provinceId, postalCode: local.cp, lat: null, lng: null,
    });

    // ====== Envíos por CP ======
    const baseShip = (recipientId = recipient.id, senderId = sender.id) => ({
        senderId, recipientId, currentBranchId: bId,
    });

    // CP-R02: 60kg
    await upsertShipment(`CPR02-${prefix}-001`, {
        ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
        weightKg: 60, volumeM3: 1.0,
    });

    // CP-R03 + CP-R12: destino interprovincial (Córdoba)
    await upsertShipment(`CPR03-${prefix}-001`, {
        ...baseShip(), addressId: addrCba.id,
        weightKg: 10, volumeM3: 0.3,
    });

    // CP-R04: destino Mendoza
    await upsertShipment(`CPR04-${prefix}-001`, {
        ...baseShip(), addressId: addrMza.id,
        weightKg: 10, volumeM3: 0.3,
    });

    // CP-R05/R13: envío liviano en zona local (para fórmula)
    await upsertShipment(`CPR05-${prefix}-001`, {
        ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
        weightKg: 5, volumeM3: 0.2,
    });

    // CP-R08: 4 envíos de 8kg
    for (let i = 1; i <= 4; i++) {
        await upsertShipment(`CPR08-${prefix}-00${i}`, {
            ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
            weightKg: 8, volumeM3: 0.2,
        });
    }

    // CP-R10/R11: envíos genéricos zona local
    await upsertShipment(`CPR10-${prefix}-001`, {
        ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
        weightKg: 10, volumeM3: 0.3,
    });
    await upsertShipment(`CPR11-${prefix}-001`, {
        ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
        weightKg: 15, volumeM3: 0.4,
    });

    // CP-R14: 3 envíos zona local (para stops pickup+delivery)
    for (let i = 1; i <= 3; i++) {
        await upsertShipment(`CPR14-${prefix}-00${i}`, {
            ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
            weightKg: 12, volumeM3: 0.3,
        });
    }

    // CP-R15: 5 envíos de 100kg cada uno (500kg vs flota 200kg)
    for (let i = 1; i <= 5; i++) {
        await upsertShipment(`CPR15-${prefix}-00${i}`, {
            ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
            weightKg: 100, volumeM3: 2.0,
        });
    }

    // CP-R16: 1 envío que estará en ruta activa + 1 nuevo (intentar reasignar)
    const shipR16a = await upsertShipment(`CPR16-${prefix}-001`, {
        ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
        weightKg: 20, volumeM3: 0.5,
    });
    await upsertShipment(`CPR16-${prefix}-002`, {
        ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
        weightKg: 20, volumeM3: 0.5,
    });

    // CP-R17: 4 envíos con problemas distintos
    await upsertShipment(`CPR17A-${prefix}-001`, { // sin coordenadas
        ...baseShip(), addressId: addrNoGeo.id, zoneId: localZone.id,
        weightKg: 10, volumeM3: 0.3,
    });
    await upsertShipment(`CPR17B-${prefix}-001`, { // sobredimensionado
        ...baseShip(), addressId: addrLocal.id, zoneId: localZone.id,
        weightKg: 9999, volumeM3: 100,
    });
    await upsertShipment(`CPR17C-${prefix}-001`, { // zona sin transporte
        ...baseShip(), addressId: addrMza.id,
        weightKg: 8, volumeM3: 0.2,
    });
    // CPR17D usa shipR16a (que estará en ruta activa)

    // ====== Ruta activa para CP-R16 ======
    const existingRoute = await Route.findOne({ where: { transportId: tCPR16.id } });
    if (!existingRoute) {
        const r = await Route.create({
            transportId: tCPR16.id, originBranchId: bId,
            statusId: 1, // PLANNED — ajustar si tu enum usa otro
            totalDistanceKm: 10, totalCost: 1300, totalWeightKg: 20, totalVolumeM3: 0.5,
        }).catch(e => { console.log(`  ⚠ Route create skipped: ${e.message}`); return null; });
        if (r) {
            await RouteStop.create({
                routeId: r.id, sequence: 1, stopType: 'pickup',
                branchId: bId, lat: local.lat, lng: local.lng,
            }).catch(() => {});
            await RouteStop.create({
                routeId: r.id, sequence: 2, stopType: 'delivery',
                shipmentId: shipR16a.id, lat: local.lat, lng: local.lng,
            }).catch(() => {});
            console.log(`  + Route activa creada para CP-R16 (id=${r.id})`);
        }
    }

    console.log(`  ✓ Sucursal ${branch.name}: transportes + envíos CP creados`);
};

// ====== Main ======
(async () => {
    try {
        await sequelize.authenticate();
        console.log('✓ Conectado a DB');

        if (CLEAN) {
            await cleanAll();
            process.exit(0);
        }

        // Provincias extra
        await upsertProvince(PROVINCE_IDS.MENDOZA, 'Mendoza');
        await upsertProvince(PROVINCE_IDS.CORDOBA, 'Cordoba');

        // Zonas Mendoza / Córdoba (para CPR04, CPR03)
        await upsertZone('Mendoza Capital', PROVINCE_IDS.MENDOZA, 1500, ['5500']);
        await upsertZone('Cordoba Capital', PROVINCE_IDS.CORDOBA, 1200, ['5000']);

        const branches = await Branch.findAll({ where: { statusId: 1 } });
        console.log(`\nSucursales activas: ${branches.length}`);

        for (const b of branches) {
            await seedBranch(b);
        }

        console.log('\n✅ Seed CP-R completo.');
        console.log('\nPara limpiar: node src/database/seed-cp-routing.js --clean');
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
})();
