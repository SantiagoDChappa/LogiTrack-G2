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
            transportIds: [100, 101],
            supervisorBranchId: 1,
        });
        expect(result.proposals).toEqual([]);
        expect(result.unassigned).toContain(1005);
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
        expect(prop.totalCost).toBeCloseTo(Number(expected.toFixed(2)), 1);
    });

    test('ignora transportes deshabilitados (enabled=false)', async () => {
        const result = await optimizer.optimizeRoutes({
            shipmentIds: [1001],
            transportIds: [102], // solo el deshabilitado
            supervisorBranchId: 1,
        });
        expect(result.proposals).toEqual([]);
        expect(result.unassigned).toContain(1001);
    });
});
