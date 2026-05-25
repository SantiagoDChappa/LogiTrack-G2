/**
 * Sprint 3 - HU 3.1
 * Validación de modalidad de entrega (home / branch_pickup)
 * No requiere base de datos: mockea modelos y prueba el middleware + controller.
 */

const express = require('express');
const request = require('supertest');

jest.mock('../src/models/branch', () => ({
    getAll:            jest.fn(),
    getById:           jest.fn(),
    getPickupEnabled:  jest.fn(),
}));
jest.mock('../src/models/zone', () => ({
    Zone: { findByPk: jest.fn() },
}));
jest.mock('../src/services/zoneResolver.service', () => ({
    resolveZone: jest.fn().mockResolvedValue(null),
}));

const branchModel = require('../src/models/branch');
const branchesRouter = require('../src/routes/api/branches');
const { validateShipment } = require('../src/middlewares/shipment');
const { validationResult } = require('express-validator');

const buildApp = (router, prefix = '/api/branches') => {
    const app = express();
    app.use(express.json());
    app.use(prefix, router);
    return app;
};

describe('API /api/branches/pickup', () => {
    beforeEach(() => jest.clearAllMocks());

    test('devuelve solo sucursales habilitadas para retiro', async () => {
        branchModel.getPickupEnabled.mockResolvedValue([
            { id: 1, name: 'Centro',  address: 'Av. 1', postalCode: '1000', provinceId: 1, phone: '111', latitude: -34.6, longitude: -58.4 },
            { id: 2, name: 'Norte',   address: 'Av. 2', postalCode: '1600', provinceId: 1, phone: null,  latitude: -34.5, longitude: -58.5 },
        ]);

        const app = buildApp(branchesRouter);
        const res = await request(app).get('/api/branches/pickup?provinceId=1');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(branchModel.getPickupEnabled).toHaveBeenCalledWith({ provinceId: 1 });
        expect(res.body[0]).toMatchObject({ id: 1, name: 'Centro' });
    });

    test('responde 500 si el modelo falla', async () => {
        branchModel.getPickupEnabled.mockRejectedValue(new Error('DB down'));
        const app = buildApp(branchesRouter);
        const res = await request(app).get('/api/branches/pickup');
        expect(res.status).toBe(500);
    });
});

describe('Middleware validateShipment - modalidad de entrega', () => {
    const runValidation = async (body) => {
        const req = { body };
        for (const v of validateShipment) {
            await v.run(req);
        }
        return validationResult(req);
    };

    const baseBody = {
        senderName: 'Juan', senderDocument: '12345678',
        recipientName: 'María', recipientDocument: '87654321',
        shipmentTypeId: '1', weightKg: '1.5', packageQty: '2',
    };

    test('home: exige street, number, province', async () => {
        const res = await runValidation({ ...baseBody, deliveryMode: 'home' });
        const msgs = res.array().map(e => e.msg);
        expect(msgs).toEqual(expect.arrayContaining([
            expect.stringContaining('calle'),
        ]));
    });

    test('home: pasa con dirección completa', async () => {
        const res = await runValidation({
            ...baseBody,
            deliveryMode: 'home',
            street: 'Av. Corrientes', number: '1234', province: '1',
        });
        const addressErrors = res.array().filter(e =>
            ['street', 'number', 'province'].includes(e.path)
        );
        expect(addressErrors).toHaveLength(0);
    });

    test('branch_pickup: no exige dirección', async () => {
        const res = await runValidation({
            ...baseBody,
            deliveryMode: 'branch_pickup',
            pickupBranchId: '5',
        });
        const addressErrors = res.array().filter(e =>
            ['street', 'number', 'province'].includes(e.path)
        );
        expect(addressErrors).toHaveLength(0);
    });

    test('branch_pickup: exige pickupBranchId', async () => {
        const res = await runValidation({
            ...baseBody,
            deliveryMode: 'branch_pickup',
        });
        const pickupErrors = res.array().filter(e => e.path === 'pickupBranchId');
        expect(pickupErrors.length).toBeGreaterThan(0);
        expect(pickupErrors[0].msg).toMatch(/sucursal de retiro/i);
    });

    test('deliveryMode inválido es rechazado', async () => {
        const res = await runValidation({
            ...baseBody,
            deliveryMode: 'foo',
            street: 'X', number: '1', province: '1',
        });
        const modeErrors = res.array().filter(e => e.path === 'deliveryMode');
        expect(modeErrors.length).toBeGreaterThan(0);
    });
});
