const sequelize = require('../src/database/connection');
const optimizer = require('../src/services/routeOptimizer.service');

let Models;

describe('Route Optimization E2E', () => {
    beforeAll(async () => {
        Models = require('../src/models/index');
        await sequelize.sync({ force: true });

        const { Status, Province, Branch, User, Zone, Transport, TransportZone, Address, Person, Shipment } = Models;

        await Status.bulkCreate([
            { id: 1, description: 'Pendiente' },
            { id: 6, description: 'Asignado' },
        ]);

        await Province.bulkCreate([
            { id: 24, description: 'CABA' },
            { id: 1,  description: 'Buenos Aires' },
        ]);

        // Sucursal del supervisor (CABA)
        await Branch.bulkCreate([
            { id: 1, name: 'Casa Central CABA',  provinceId: 24, latitude: -34.6037, longitude: -58.3816, address: 'Av. Corrientes 1000', postalCode: '1043', statusId: 1 },
            { id: 2, name: 'Sucursal La Plata',  provinceId: 1,  latitude: -34.9215, longitude: -57.9545, address: 'Calle 7 1234',         postalCode: '1900', statusId: 1 },
        ]);

        // Conductores
        await User.bulkCreate([
            { id: 10, fullName: 'Driver CABA',   email: 'd1@x.com', password: 'x', document: 11111111, roleId: 3, active: true,  branchId: 1 },
            { id: 11, fullName: 'Driver Inter',  email: 'd2@x.com', password: 'x', document: 22222222, roleId: 3, active: true,  branchId: 1 },
        ]);

        // Zonas
        await Zone.bulkCreate([
            { id: 1, name: 'CABA - Palermo',    provinceId: 24, baseCost: 500, postalCodePrefixes: ['1425','1426'], enabled: true },
            { id: 2, name: 'CABA - Microcentro', provinceId: 24, baseCost: 600, postalCodePrefixes: ['1043','1001'], enabled: true },
            { id: 3, name: 'Buenos Aires',       provinceId: 1,  baseCost: 800, postalCodePrefixes: ['1900'],         enabled: true },
        ]);

        // Transportes
        await Transport.bulkCreate([
            { id: 100, name: 'Camion CABA',  plate: 'AB123CD', maxWeightKg: 100, maxVolumeM3: 5,  fixedCost: 1000, costPerKm: 50,  driverUserId: 10, branchId: 1, enabled: true },
            { id: 101, name: 'Camion Largo', plate: 'XY789ZW', maxWeightKg: 500, maxVolumeM3: 20, fixedCost: 5000, costPerKm: 200, driverUserId: 11, branchId: 1, enabled: true },
            { id: 102, name: 'Deshabilitado', plate: 'ZZ000', maxWeightKg: 1000, maxVolumeM3: 50, fixedCost: 0, costPerKm: 1, driverUserId: null, branchId: 1, enabled: false },
        ]);

        // Camion CABA -> zonas CABA. Camion Largo sin zona (puede inter-provincia).
        await TransportZone.bulkCreate([
            { transportId: 100, zoneId: 1 },
            { transportId: 100, zoneId: 2 },
        ]);

        // Direcciones de prueba
        await Address.bulkCreate([
            { id: 1, street: 'Santa Fe',  number: 1234, provinceId: 24, postalCode: '1425', lat: -34.5870, lng: -58.4096 }, // Palermo
            { id: 2, street: 'Cordoba',   number: 500,  provinceId: 24, postalCode: '1043', lat: -34.6010, lng: -58.3850 }, // Microcentro
            { id: 3, street: 'Calle 7',   number: 50,   provinceId: 1,  postalCode: '1900', lat: -34.9215, lng: -57.9545 }, // La Plata
            { id: 4, street: 'Otro',      number: 99,   provinceId: 24, postalCode: '1425', lat: -34.5900, lng: -58.4100 }, // Palermo
        ]);

        await Person.bulkCreate([
            { id: 1, fullName: 'Remitente',     document: '30000001' },
            { id: 2, fullName: 'Dest Palermo',   document: '30000002' },
            { id: 3, fullName: 'Dest Centro',    document: '30000003' },
            { id: 4, fullName: 'Dest LaPlata',   document: '30000004' },
            { id: 5, fullName: 'Dest Palermo 2', document: '30000005' },
        ]);

        // Envios PENDIENTES en sucursal del supervisor (branchId=1)
        await Shipment.bulkCreate([
            { id: 1001, trackingId: 'ENV-001', statusId: 1, senderId: 1, recipientId: 2, addressId: 1, weightKg: 30, volumeM3: 1.0, packageQty: 1, currentBranchId: 1, zoneId: 1 },
            { id: 1002, trackingId: 'ENV-002', statusId: 1, senderId: 1, recipientId: 3, addressId: 2, weightKg: 20, volumeM3: 0.5, packageQty: 1, currentBranchId: 1, zoneId: 2 },
            { id: 1003, trackingId: 'ENV-003', statusId: 1, senderId: 1, recipientId: 4, addressId: 3, weightKg: 80, volumeM3: 2.0, packageQty: 1, currentBranchId: 1, zoneId: 3 },
            { id: 1004, trackingId: 'ENV-004', statusId: 1, senderId: 1, recipientId: 5, addressId: 4, weightKg: 40, volumeM3: 1.2, packageQty: 1, currentBranchId: 1, zoneId: 1 },
            // Envio en otra sucursal (no debe ser asignado)
            { id: 1005, trackingId: 'ENV-005', statusId: 1, senderId: 1, recipientId: 2, addressId: 1, weightKg: 10, volumeM3: 0.3, packageQty: 1, currentBranchId: 2, zoneId: 1 },
        ]);
    });

    afterAll(async () => {
        await sequelize.close();
    });

    test('rechaza envios de otra sucursal (currentBranchId distinto al supervisor)', async () => {
        const result = await optimizer.optimizeRoutes({
            shipmentIds: [1005],
            supervisorBranchId: 1,
        });
        expect(result.proposals).toEqual([]);
        // unassigned puede ser array de IDs o de objetos {id, code, reason}
        const unassignedIds = result.unassigned.map(u => (typeof u === 'object' ? u.id : u));
        expect(unassignedIds).toContain(1005);
    });

    test('asigna envios CABA al transporte con zona CABA y los inter-provinciales al transporte sin zona', async () => {
        const result = await optimizer.optimizeRoutes({
            shipmentIds: [1001, 1002, 1003, 1004],
            transportIds: [100, 101],
            supervisorBranchId: 1,
        });

        expect(result.proposals.length).toBeGreaterThan(0);

        const cabaProp = result.proposals.find(p => p.transportId === 100);
        const interProp = result.proposals.find(p => p.transportId === 101);

        // Camion CABA recibe envios de zonas 1 y 2 (Palermo + Microcentro)
        expect(cabaProp).toBeDefined();
        expect(cabaProp.shipmentIds.sort()).toEqual([1001, 1002, 1004].sort());

        // Camion Largo (sin zonas) recibe el envio inter-provincial (zona 3)
        expect(interProp).toBeDefined();
        expect(interProp.shipmentIds).toEqual([1003]);
    });

    test('respeta capacidad de peso: si un transporte se llena, el siguiente envio va al proximo', async () => {
        const result = await optimizer.optimizeRoutes({
            shipmentIds: [1001, 1002, 1003, 1004],
            transportIds: [100, 101],
            supervisorBranchId: 1,
        });
        const cabaProp = result.proposals.find(p => p.transportId === 100);
        expect(cabaProp.totalWeightKg).toBeLessThanOrEqual(100);
        expect(cabaProp.utilizationWeight).toBeGreaterThan(0);
        expect(cabaProp.utilizationWeight).toBeLessThanOrEqual(1);
    });

    test('genera stops con pickup primero y deliveries despues, con sequence consecutiva', async () => {
        const result = await optimizer.optimizeRoutes({
            shipmentIds: [1001, 1002, 1004],
            transportIds: [100],
            supervisorBranchId: 1,
        });
        const prop = result.proposals[0];
        expect(prop.stops.length).toBe(1 + 3); // 1 pickup + 3 deliveries
        expect(prop.stops[0].stopType).toBe('pickup');
        expect(prop.stops.slice(1).every(s => s.stopType === 'delivery')).toBe(true);
        // Sequence consecutiva
        prop.stops.forEach((s, i) => expect(s.sequence).toBe(i + 1));
    });

    test('calcula costo total = fixedCost + costPerKm * distancia + sum(zone.baseCost)', async () => {
        const result = await optimizer.optimizeRoutes({
            shipmentIds: [1001],
            transportIds: [100],
            supervisorBranchId: 1,
        });
        const prop = result.proposals[0];
        const zoneCost = 500; // Palermo
        const expected = 1000 + 50 * prop.totalDistanceKm + zoneCost;
        // tolerancia de 0.5 por redondeo en distancia OSRM
        expect(Math.abs(prop.totalCost - expected)).toBeLessThan(1);
    });

    test('ignora transportes deshabilitados (enabled=false)', async () => {
        const result = await optimizer.optimizeRoutes({
            shipmentIds: [1001],
            supervisorBranchId: 1,
        });
        // Transport 102 tiene enabled=false → nunca debe aparecer en ninguna propuesta
        const usedTransportIds = result.proposals.map(p => p.transportId);
        expect(usedTransportIds).not.toContain(102);
        // El envio 1001 si debe asignarse (hay transportes habilitados)
        expect(result.proposals.length).toBeGreaterThan(0);
    });

    // ====================================================================
    // Trazabilidad Plan de Pruebas Sprint 2 — CP-R02..CP-R14 (LGT-126)
    // ====================================================================
    describe('CP-R Sprint 2 - Trazabilidad Plan de Pruebas', () => {
        beforeAll(async () => {
            const { Province, Zone, Transport, TransportZone, Address, Person, Shipment } = Models;

            // Provincia y zona Mendoza (para CP-R04)
            await Province.bulkCreate([{ id: 13, description: 'Mendoza' }, { id: 14, description: 'Cordoba' }]);
            await Zone.bulkCreate([
                { id: 4, name: 'Mendoza Capital', provinceId: 13, baseCost: 1500, postalCodePrefixes: ['5500'], enabled: true },
                { id: 5, name: 'Cordoba Capital', provinceId: 14, baseCost: 1200, postalCodePrefixes: ['5000'], enabled: true },
            ]);

            // Transportes extra (sin colisionar IDs existentes 100/101/102)
            await Transport.bulkCreate([
                // CP-R02: capacidad chica
                { id: 200, name: 'Camion Chico', plate: 'CH001', maxWeightKg: 50, maxVolumeM3: 5, fixedCost: 500, costPerKm: 10, branchId: 1, enabled: true },
                // CP-R08: dos transportes de cap 20 y 30 zona CABA
                { id: 201, name: 'Cap20',  plate: 'CP020', maxWeightKg: 20, maxVolumeM3: 5, fixedCost: 300, costPerKm: 10, branchId: 1, enabled: true },
                { id: 202, name: 'Cap30',  plate: 'CP030', maxWeightKg: 30, maxVolumeM3: 5, fixedCost: 300, costPerKm: 10, branchId: 1, enabled: true },
                // CP-R11: dos transportes elegibles mismo cluster, distinto costPerKm
                { id: 203, name: 'Barato', plate: 'CHEAP1', maxWeightKg: 500, maxVolumeM3: 20, fixedCost: 1000, costPerKm: 100, branchId: 1, enabled: true },
                { id: 204, name: 'Caro',   plate: 'EXPN1',  maxWeightKg: 500, maxVolumeM3: 20, fixedCost: 1000, costPerKm: 200, branchId: 1, enabled: true },
                // CP-R15: dos transportes cap 100 c/u (flota chica = déficit vs 500kg demanda)
                { id: 205, name: 'Flota100A', plate: 'FL100A', maxWeightKg: 100, maxVolumeM3: 5, fixedCost: 500, costPerKm: 20, branchId: 1, enabled: true },
                { id: 206, name: 'Flota100B', plate: 'FL100B', maxWeightKg: 100, maxVolumeM3: 5, fixedCost: 500, costPerKm: 20, branchId: 1, enabled: true },
                // CP-R16: transporte que estará ocupado con ruta activa
                { id: 207, name: 'Ocupado', plate: 'BUSY01', maxWeightKg: 300, maxVolumeM3: 15, fixedCost: 1000, costPerKm: 30, branchId: 1, enabled: true },
            ]);
            await TransportZone.bulkCreate([
                { transportId: 200, zoneId: 1 },
                { transportId: 201, zoneId: 1 },
                { transportId: 202, zoneId: 1 },
                { transportId: 205, zoneId: 1 },
                { transportId: 206, zoneId: 1 },
                { transportId: 207, zoneId: 1 },
                // 203 y 204 sin zonas (elegibles para cualquier provincia, CP-R12)
            ]);

            await Address.bulkCreate([
                { id: 10, street: 'Pesado',  number: 1, provinceId: 24, postalCode: '1425', lat: -34.588, lng: -58.410 }, // CP-R02 (CABA, 60kg)
                { id: 11, street: 'Mendoza', number: 1, provinceId: 13, postalCode: '5500', lat: -32.890, lng: -68.844 }, // CP-R04
                { id: 12, street: 'Cordoba', number: 1, provinceId: 14, postalCode: '5000', lat: -31.420, lng: -64.188 }, // CP-R03/R12
                { id: 13, street: 'Pal8a',   number: 1, provinceId: 24, postalCode: '1425', lat: -34.589, lng: -58.411 }, // CP-R08
                { id: 14, street: 'Pal8b',   number: 2, provinceId: 24, postalCode: '1425', lat: -34.590, lng: -58.412 },
                { id: 15, street: 'Pal8c',   number: 3, provinceId: 24, postalCode: '1425', lat: -34.591, lng: -58.413 },
                { id: 16, street: 'Pal8d',   number: 4, provinceId: 24, postalCode: '1425', lat: -34.592, lng: -58.414 },
            ]);

            await Person.bulkCreate([
                { id: 20, fullName: 'Dest R02',  document: '40000002' },
                { id: 21, fullName: 'Dest R04',  document: '40000004' },
                { id: 22, fullName: 'Dest R03',  document: '40000003' },
                { id: 23, fullName: 'Dest R08a', document: '40000081' },
                { id: 24, fullName: 'Dest R08b', document: '40000082' },
                { id: 25, fullName: 'Dest R08c', document: '40000083' },
                { id: 26, fullName: 'Dest R08d', document: '40000084' },
            ]);

            await Shipment.bulkCreate([
                // CP-R02: envío 60kg supera cap 50kg
                { id: 2002, trackingId: 'CP-R02', statusId: 1, senderId: 1, recipientId: 20, addressId: 10, weightKg: 60, volumeM3: 1.0, packageQty: 1, currentBranchId: 1, zoneId: 1 },
                // CP-R04: envío Mendoza sin transporte elegible
                { id: 2004, trackingId: 'CP-R04', statusId: 1, senderId: 1, recipientId: 21, addressId: 11, weightKg: 10, volumeM3: 0.3, packageQty: 1, currentBranchId: 1, zoneId: 4 },
                // CP-R03/R12: envío Cordoba (interprovincial) para transporte sin zonas
                { id: 2003, trackingId: 'CP-R03', statusId: 1, senderId: 1, recipientId: 22, addressId: 12, weightKg: 10, volumeM3: 0.3, packageQty: 1, currentBranchId: 1, zoneId: 5 },
                // CP-R08: 4 envíos de 8kg en zona CABA
                { id: 2081, trackingId: 'CP-R08-1', statusId: 1, senderId: 1, recipientId: 23, addressId: 13, weightKg: 8, volumeM3: 0.2, packageQty: 1, currentBranchId: 1, zoneId: 1 },
                { id: 2082, trackingId: 'CP-R08-2', statusId: 1, senderId: 1, recipientId: 24, addressId: 14, weightKg: 8, volumeM3: 0.2, packageQty: 1, currentBranchId: 1, zoneId: 1 },
                { id: 2083, trackingId: 'CP-R08-3', statusId: 1, senderId: 1, recipientId: 25, addressId: 15, weightKg: 8, volumeM3: 0.2, packageQty: 1, currentBranchId: 1, zoneId: 1 },
                { id: 2084, trackingId: 'CP-R08-4', statusId: 1, senderId: 1, recipientId: 26, addressId: 16, weightKg: 8, volumeM3: 0.2, packageQty: 1, currentBranchId: 1, zoneId: 1 },
            ]);
        });

        const allOtherTx = (keep) => [100, 101, 102, 200, 201, 202, 203, 204].filter(id => !keep.includes(id));

        test('CP-R02: envío 60kg supera cap 50kg → unassigned (oversized/no_fit)', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [2002],
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([200]), // solo Camion Chico (cap 50)
            });
            expect(result.proposals.find(p => p.shipmentIds.includes(2002))).toBeUndefined();
            const ids = result.unassigned.map(u => (typeof u === 'object' ? u.id : u));
            expect(ids).toContain(2002);
        });

        test('CP-R03: transporte sin zonas asignadas opera envío interprovincial', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [2003],
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([101]), // solo Camion Largo (sin zonas)
            });
            const prop = result.proposals.find(p => p.transportId === 101);
            expect(prop).toBeDefined();
            expect(prop.shipmentIds).toContain(2003);
        });

        test('CP-R04: envío zona Mendoza sin transporte elegible → unassigned', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [2004],
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([100, 200, 201, 202]), // sin transportes sin-zonas
            });
            expect(result.proposals.find(p => p.shipmentIds.includes(2004))).toBeUndefined();
            const ids = result.unassigned.map(u => (typeof u === 'object' ? u.id : u));
            expect(ids).toContain(2004);
        });

        test('CP-R05: costo total = fixedCost + costPerKm*distancia + sum(zone.baseCost)', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [1001],
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([100]),
            });
            const prop = result.proposals[0];
            const expected = 1000 + 50 * prop.totalDistanceKm + 500; // zona Palermo baseCost=500
            expect(Math.abs(prop.totalCost - expected)).toBeLessThan(1);
        });

        test('CP-R06: supervisor solo ve envíos de su sucursal', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [1001, 1005], // 1005 está en sucursal 2
                supervisorBranchId: 1,
            });
            const allAssigned = result.proposals.flatMap(p => p.shipmentIds);
            expect(allAssigned).not.toContain(1005);
            expect(allAssigned).toContain(1001);
        });

        test('CP-R07: transporte deshabilitado nunca aparece en propuestas', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [1001],
                supervisorBranchId: 1,
            });
            expect(result.proposals.map(p => p.transportId)).not.toContain(102);
        });

        test('CP-R08: vehículo se llena, restantes pasan al siguiente sin unassigned', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [2081, 2082, 2083, 2084],
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([201, 202]), // cap 20 + cap 30
            });
            const used = result.proposals;
            expect(used.length).toBeGreaterThanOrEqual(1);
            used.forEach(p => expect(p.totalWeightKg).toBeLessThanOrEqual(p.transportId === 201 ? 20 : 30));
            const totalAssigned = used.reduce((a, p) => a + p.shipmentIds.length, 0);
            expect(totalAssigned).toBe(4);
            expect(result.unassigned.filter(u => [2081, 2082, 2083, 2084].includes(typeof u === 'object' ? u.id : u))).toHaveLength(0);
        });

        test('CP-R09: intento de incluir envío de otra sucursal vía API es rechazado', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [1005], // pertenece a branchId 2
                supervisorBranchId: 1,
            });
            const ids = result.proposals.flatMap(p => p.shipmentIds);
            expect(ids).not.toContain(1005);
            const unIds = result.unassigned.map(u => (typeof u === 'object' ? u.id : u))
                .concat(result.rejected || []);
            expect(unIds).toContain(1005);
        });

        test('CP-R10: ningún transporte elegible → todos los envíos unassigned', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [1001, 1002],
                supervisorBranchId: 1,
                excludeTransportIds: [100, 101, 102, 200, 201, 202, 203, 204], // todos
            });
            expect(result.proposals).toEqual([]);
            const ids = result.unassigned.map(u => (typeof u === 'object' ? u.id : u));
            expect(ids).toEqual(expect.arrayContaining([1001, 1002]));
        });

        test('CP-R11: con dos transportes elegibles, prioriza el de menor costPerKm', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [1001],
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([203, 204]),
            });
            const used = result.proposals.map(p => p.transportId);
            expect(used).toContain(203); // Barato (100/km)
            expect(used).not.toContain(204); // Caro (200/km)
        });

        test('CP-R12: transporte sin zonas asignadas elegible para cualquier provincia', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [2003], // destino Cordoba
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([101]),
            });
            const prop = result.proposals.find(p => p.transportId === 101);
            expect(prop).toBeDefined();
            expect(prop.shipmentIds).toContain(2003);
        });

        test('CP-R13: cálculo de costo logístico completo (fijo + km + zona)', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [1001],
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([100]),
            });
            const prop = result.proposals[0];
            // fixedCost=1000, costPerKm=50, zoneCost(Palermo)=500
            const expected = 1000 + 50 * prop.totalDistanceKm + 500;
            expect(Math.abs(prop.totalCost - expected)).toBeLessThan(1);
        });

        test('CP-R14: stops correctos — pickup primero, deliveries luego, sequence consecutiva', async () => {
            const result = await optimizer.optimizeRoutes({
                shipmentIds: [1001, 1002, 1004],
                supervisorBranchId: 1,
                excludeTransportIds: allOtherTx([100]),
            });
            const prop = result.proposals[0];
            expect(prop.stops[0].stopType).toBe('pickup');
            expect(prop.stops.slice(1).every(s => s.stopType === 'delivery')).toBe(true);
            prop.stops.forEach((s, i) => expect(s.sequence).toBe(i + 1));
        });
    });
});
