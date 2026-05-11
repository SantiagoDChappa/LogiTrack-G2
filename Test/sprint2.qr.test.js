/**
 * Sprint 2 — CP-QR: Generación de QR y Escaneo para cambio de estado
 * LGT-103 / LGT-104 / LGT-105
 */
const request = require('supertest');
const express = require('express');
const path    = require('path');

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../src/middlewares/auth', () => ({
    requireAuth:                 (req, res, next) => next(),
    requireAdmin:                (req, res, next) => next(),
    requireSupervisor:           (req, res, next) => next(),
    requireDelivery:             (req, res, next) => next(),
    requireSupervisorOrAdmin:    (req, res, next) => next(),
    requireSupervisorOrOperator: (req, res, next) => next(),
}));
jest.mock('../src/models/shipment', () => ({
    Shipment:        { findAll: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue([]) },
    getByTrackingId: jest.fn(),
    getById:         jest.fn().mockResolvedValue(null),
    search:          jest.fn().mockResolvedValue([]),
}));
jest.mock('../src/models/address',  () => ({ Address: {} }));
jest.mock('../src/models/zone',     () => ({ Zone: {} }));
jest.mock('../src/models/person',   () => ({ Person: {} }));
jest.mock('../src/models/province', () => ({ Province: {} }));
jest.mock('../src/models/branch',   () => ({
    getAll:  jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue({ id: 1, latitude: -34.6, longitude: -58.38 }),
    Branch:  {},
}));
jest.mock('../src/models/transport', () => ({
    getEnabledForBranch: jest.fn().mockResolvedValue([]),
    getById:             jest.fn().mockResolvedValue(null),
    Transport:           {},
}));
jest.mock('../src/models/route', () => ({
    Route:              { update: jest.fn().mockResolvedValue([]) },
    RouteStatus:        { PLANNED: 1, IN_ROUTE: 2 },
    getAllByBranch:      jest.fn().mockResolvedValue([]),
    getById:            jest.fn(),
    getActiveByDriver:  jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/models/routeStop',       () => ({ RouteStop: { create: jest.fn().mockResolvedValue({}) } }));
jest.mock('../src/models/shipmentHistory', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/models/shipmentPrediction', () => ({
    getLatestByShipmentIds: jest.fn().mockResolvedValue(new Map()),
}));
jest.mock('../src/models/status', () => ({
    getById: jest.fn().mockResolvedValue({ id: 6, description: 'Asignado' }),
}));
jest.mock('../src/models/user', () => ({
    getById:     jest.fn().mockResolvedValue({ id: 1, branchId: 1 }),
    getAll:      jest.fn().mockResolvedValue([]),
    findByEmail: jest.fn(),
}));
jest.mock('../src/services/routeOptimizer.service', () => ({
    optimizeRoutes: jest.fn().mockResolvedValue({ proposals: [], unassigned: [] }),
    optimizeManual: jest.fn().mockResolvedValue({ proposals: [], unassigned: [] }),
}));
jest.mock('../src/services/shipmentStateMachine', () => ({
    canTransition:       jest.fn().mockReturnValue(true),
    transition:          jest.fn().mockResolvedValue({}),
    getAvailableActions: jest.fn().mockReturnValue([]),
    buildAutoComment:    jest.fn().mockReturnValue('auto comment'),
}));
jest.mock('../src/utils/eventLocation', () => ({
    resolveUserBranchCoords: jest.fn().mockResolvedValue({ branchId: 1, latitude: -34.6, longitude: -58.38 }),
    resolveBranchCoords:     jest.fn().mockResolvedValue({ branchId: 1, latitude: -34.6, longitude: -58.38 }),
}));
jest.mock('../src/utils/notifications', () => ({ notifyStatusChange: jest.fn() }));

// ── Helpers ────────────────────────────────────────────────────────────────
const routeModel    = require('../src/models/route');
const shipmentModel = require('../src/models/shipment');

const buildRouteApp = (roleId = 1) => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'src', 'views'));
    app.use((req, res, next) => {
        res.locals.currentUser = { id: 1, roleId, fullName: 'Supervisor', branchId: 1 };
        next();
    });
    const routeCtrl = require('../src/controllers/route');
    app.get('/route/:id/qr',             routeCtrl.getQR);
    app.get('/route/scan/:id',           routeCtrl.getScanPage);
    app.post('/route/scan/:id/dispatch', routeCtrl.dispatchRoute);
    return app;
};

const buildScanApp = (roleId = 3, userId = 1) => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'src', 'views'));
    app.use((req, res, next) => {
        res.locals.currentUser = { id: userId, roleId, fullName: 'Repartidor' };
        next();
    });
    const scanCtrl = require('../src/controllers/scan');
    app.get('/:trackingId',            scanCtrl.getScanPage);
    app.post('/:trackingId/pickup',    scanCtrl.postPickup);
    app.post('/:trackingId/at-branch', scanCtrl.postAtBranch);
    return app;
};

// ── Tests ──────────────────────────────────────────────────────────────────
describe('CP-QR — Generación de QR y Escaneo de Estado', () => {
    beforeEach(() => jest.clearAllMocks());

    // ── CP-QR01: Generación QR de ruta ──
    test('CP-QR01 — GET /route/:id/qr devuelve imagen PNG (200)', async () => {
        routeModel.getById.mockResolvedValue({ id: 5, statusId: 1, stops: [] });
        const res = await request(buildRouteApp()).get('/route/5/qr');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/png');
    });

    test('CP-QR01 — Ruta inexistente retorna 404', async () => {
        routeModel.getById.mockResolvedValue(null);
        const res = await request(buildRouteApp()).get('/route/999/qr');
        expect(res.status).toBe(404);
    });

    // ── CP-QR02: Scan page y dispatch ──
    test('CP-QR02 — GET /route/scan/:id muestra página (200)', async () => {
        routeModel.getById.mockResolvedValue({ id: 5, statusId: 1, stops: [], transport: null });
        const res = await request(buildRouteApp()).get('/route/scan/5');
        expect(res.status).toBe(200);
    });

    test('CP-QR02 — POST dispatch redirige con success', async () => {
        const { Route } = require('../src/models/route');
        const stateMachine = require('../src/services/shipmentStateMachine');
        routeModel.getById.mockResolvedValue({
            id: 5, statusId: 1,
            stops: [{ stopType: 'delivery', shipmentId: 101 }],
            transport: { driverUserId: 1 },
        });
        stateMachine.transition.mockResolvedValue({});
        Route.update.mockResolvedValue([]);
        const res = await request(buildRouteApp()).post('/route/scan/5/dispatch');
        expect(res.status).toBe(302);
        expect(res.headers.location).toMatch(/\/route\/scan\/5/);
    });

    // ── CP-QR03: Scan shipment por trackingId ──
    test('CP-QR03 — GET /scan/:trackingId envío asignado al user muestra acciones (200)', async () => {
        shipmentModel.getByTrackingId.mockResolvedValue({
            id: 101, trackingId: 'ENV-QR01', statusId: 6, deliveryUserId: 1,
            status:    { description: 'Asignado' },
            recipient: { fullName: 'Juan Perez' },
            address:   { street: 'Av. Corrientes', number: 1234, province: { description: 'CABA' } },
        });
        const res = await request(buildScanApp(3, 1)).get('/ENV-QR01');
        expect(res.status).toBe(200);
    });

    test('CP-QR03 — Envío asignado a otro repartidor retorna 403', async () => {
        shipmentModel.getByTrackingId.mockResolvedValue({
            id: 101, trackingId: 'ENV-QR01', statusId: 6, deliveryUserId: 999,
        });
        const res = await request(buildScanApp(3, 1)).get('/ENV-QR01');
        expect(res.status).toBe(403);
    });

    // ── CP-QR04: Estado inválido ──
    test('CP-QR04 — POST pickup transición inválida retorna 422', async () => {
        shipmentModel.getByTrackingId.mockResolvedValue({
            id: 101, trackingId: 'ENV-QR01', statusId: 4, deliveryUserId: 1,
        });
        const stateMachine = require('../src/services/shipmentStateMachine');
        const err = new Error('Transición no válida');
        err.name = 'StateMachineError';
        err.code = 'INVALID_TRANSITION';
        stateMachine.transition.mockRejectedValue(err);
        const res = await request(buildScanApp(3, 1)).post('/ENV-QR01/pickup');
        expect(res.status).toBe(422);
    });
});
