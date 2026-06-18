'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../src/models/incident', () => ({
    list: jest.fn(),
}));

jest.mock('../src/models/index', () => ({
    Shipment: { findAll: jest.fn() },
    Person: {},
    Status: {},
    Branch: {},
    Route: { findAll: jest.fn(), findOne: jest.fn() },
    Transport: {},
    User: { findAll: jest.fn() },
    ShipmentReturn: { findAll: jest.fn() },
}));

const incidentModel = require('../src/models/incident');
const { Shipment, Route, User, ShipmentReturn } = require('../src/models/index');
const searchRoutes = require('../src/routes/api/search');

const buildApp = (currentUser) => {
    const app = express();
    app.use((req, res, next) => {
        res.locals.currentUser = currentUser;
        next();
    });
    app.use('/api/search', searchRoutes);
    return app;
};

const emptyShipments = () => {
    Shipment.findAll.mockResolvedValue([]);
};

describe('Universal search RBAC', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        emptyShipments();
        Route.findAll.mockResolvedValue([]);
        Route.findOne.mockResolvedValue(null);
        User.findAll.mockResolvedValue([]);
        ShipmentReturn.findAll.mockResolvedValue([]);
        incidentModel.list.mockResolvedValue([]);
    });

    test('repartidor: envíos filtrados por deliveryUserId', async () => {
        await request(buildApp({ id: 99, roleId: 3, branchId: null }))
            .get('/api/search?q=ENV')
            .expect(200);

        expect(Shipment.findAll).toHaveBeenCalled();
        const firstCall = Shipment.findAll.mock.calls[0][0];
        expect(firstCall.where).toEqual(expect.objectContaining({ deliveryUserId: 99 }));
    });

    test('repartidor: incidencias filtradas por deliveryUserId (envíos asignados)', async () => {
        await request(buildApp({ id: 99, roleId: 3, branchId: null }))
            .get('/api/search?q=ENV')
            .expect(200);

        expect(incidentModel.list).toHaveBeenCalledWith(expect.objectContaining({
            deliveryUserId: 99,
            trackingId: 'ENV',
            limit: 4,
        }));
    });

    test('repartidor: busca rutas propias por ID', async () => {
        Route.findAll.mockResolvedValue([
            { id: 74, statusId: 3, transport: { name: 'S3-01 Camioneta' }, originBranch: { name: 'Centro' } },
            { id: 481, statusId: 3, transport: { name: 'Moto' }, originBranch: { name: 'Centro' } },
        ]);

        const res = await request(buildApp({ id: 99, roleId: 3, branchId: null }))
            .get('/api/search?q=74')
            .expect(200);

        expect(Route.findAll).toHaveBeenCalled();
        const routeCall = Route.findAll.mock.calls.find(c => c[0].include?.some(i => i.as === 'transport' && i.where?.driverUserId === 99));
        expect(routeCall).toBeTruthy();
        expect(res.body.routes).toHaveLength(1);
        expect(res.body.routes[0].id).toBe(74);
        expect(res.body.routes[0].status).toBe('Finalizada');
        expect(ShipmentReturn.findAll).not.toHaveBeenCalled();
        expect(User.findAll).not.toHaveBeenCalled();
    });

    test('repartidor: roleId string en JWT también devuelve rutas', async () => {
        Route.findAll.mockResolvedValue([
            { id: 74, statusId: 3, transport: { name: 'S3-01 Camioneta' }, originBranch: { name: 'Centro' } },
        ]);

        const res = await request(buildApp({ id: 99, roleId: '3', branchId: null }))
            .get('/api/search?q=74')
            .expect(200);

        expect(res.body.routes).toHaveLength(1);
        expect(res.body.routes[0].id).toBe(74);
    });

    test('operador: incidencias con staffScope (no puede buscar por id global)', async () => {
        await request(buildApp({ id: 5, roleId: 2, branchId: 10 }))
            .get('/api/search?q=42')
            .expect(200);

        expect(incidentModel.list).toHaveBeenCalledWith(expect.objectContaining({
            id: 42,
            staffScope: { branchId: 10, userId: 5 },
        }));
        expect(Route.findAll).not.toHaveBeenCalled();
    });

    test('supervisor: puede buscar rutas y devoluciones acotadas a sucursal', async () => {
        await request(buildApp({ id: 1, roleId: 1, branchId: 10 }))
            .get('/api/search?q=Juan')
            .expect(200);

        expect(Route.findAll).toHaveBeenCalled();
        const routeCall = Route.findAll.mock.calls[0][0];
        expect(routeCall.where).toEqual(expect.objectContaining({ originBranchId: 10 }));

        expect(ShipmentReturn.findAll).toHaveBeenCalled();
        const retInclude = ShipmentReturn.findAll.mock.calls[0][0].include[0];
        expect(retInclude.where).toEqual(expect.objectContaining({ currentBranchId: 10 }));
    });

    test('admin: puede buscar usuarios', async () => {
        await request(buildApp({ id: 1, roleId: 4, branchId: null }))
            .get('/api/search?q=Ana')
            .expect(200);

        expect(User.findAll).toHaveBeenCalled();
        expect(incidentModel.list).toHaveBeenCalledWith(expect.objectContaining({
            trackingId: 'Ana',
        }));
        expect(incidentModel.list.mock.calls[0][0].staffScope).toBeUndefined();
    });

    test('query corta devuelve arrays vacíos', async () => {
        const res = await request(buildApp({ id: 1, roleId: 4 }))
            .get('/api/search?q=a')
            .expect(200);

        expect(res.body).toEqual({
            shipments: [], incidents: [], routes: [], returns: [], users: [],
        });
        expect(incidentModel.list).not.toHaveBeenCalled();
    });
});
