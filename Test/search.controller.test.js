'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../src/models/incident', () => ({
    list: jest.fn(),
}));

jest.mock('../src/models/shipmentModificationRequest', () => ({
    searchForUniversal: jest.fn(),
}));

jest.mock('../src/models/index', () => ({
    Shipment: { findAll: jest.fn() },
    Person: {},
    Status: {},
    Branch: {},
    Route: { findAll: jest.fn(), findOne: jest.fn() },
    Transport: {},
    User: { findAll: jest.fn() },
    Incident: { findAll: jest.fn() },
    IncidentType: {},
}));

const incidentModel = require('../src/models/incident');
const modificationModel = require('../src/models/shipmentModificationRequest');
const { Shipment, Route, User, Incident } = require('../src/models/index');
const searchRoutes = require('../src/routes/api/search');

const FETCH_LIMIT = 7;

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
        Incident.findAll.mockResolvedValue([]);
        incidentModel.list.mockResolvedValue([]);
        modificationModel.searchForUniversal.mockResolvedValue([]);
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
            limit: FETCH_LIMIT,
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
        expect(res.body.meta.routes.hasMore).toBe(false);
        expect(Incident.findAll).not.toHaveBeenCalled();
        expect(User.findAll).not.toHaveBeenCalled();
        expect(modificationModel.searchForUniversal).not.toHaveBeenCalled();
    });

    test('operador: incidencias con staffScope y puede buscar rutas', async () => {
        await request(buildApp({ id: 5, roleId: 2, branchId: 10 }))
            .get('/api/search?q=42')
            .expect(200);

        expect(incidentModel.list).toHaveBeenCalledWith(expect.objectContaining({
            id: 42,
            staffScope: { branchId: 10, userId: 5 },
        }));
        expect(Route.findAll).toHaveBeenCalled();
        const routeCall = Route.findAll.mock.calls[0][0];
        expect(routeCall.where).toEqual(expect.objectContaining({ originBranchId: 10 }));
        expect(modificationModel.searchForUniversal).toHaveBeenCalledWith(expect.objectContaining({
            branchId: 10,
        }));
    });

    test('supervisor: puede buscar rutas y devoluciones acotadas a sucursal', async () => {
        await request(buildApp({ id: 1, roleId: 1, branchId: 10 }))
            .get('/api/search?q=Juan')
            .expect(200);

        expect(Route.findAll).toHaveBeenCalled();
        const routeCall = Route.findAll.mock.calls[0][0];
        expect(routeCall.where).toEqual(expect.objectContaining({ originBranchId: 10 }));

        expect(Incident.findAll).toHaveBeenCalled();
        const retCall = Incident.findAll.mock.calls.find(c =>
            c[0].include?.some(i => i.as === 'type' && i.where?.code === 'RETURN')
        );
        expect(retCall).toBeTruthy();
        const retInclude = retCall[0].include[0];
        expect(retInclude.where).toEqual(expect.objectContaining({ currentBranchId: 10 }));
    });

    test('admin: puede buscar usuarios por nombre o email', async () => {
        await request(buildApp({ id: 1, roleId: 4, branchId: null }))
            .get('/api/search?q=Ana')
            .expect(200);

        expect(User.findAll).toHaveBeenCalled();
        const userWhere = User.findAll.mock.calls[0][0].where;
        expect(userWhere[require('sequelize').Op.or]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ fullName: expect.any(Object) }),
                expect.objectContaining({ email: expect.any(Object) }),
            ])
        );
        expect(modificationModel.searchForUniversal).toHaveBeenCalledWith(expect.objectContaining({
            branchId: null,
        }));
    });

    test('query corta devuelve arrays vacíos y meta', async () => {
        const res = await request(buildApp({ id: 1, roleId: 4 }))
            .get('/api/search?q=a')
            .expect(200);

        expect(res.body.shipments).toEqual([]);
        expect(res.body.modifications).toEqual([]);
        expect(res.body.portalClients).toEqual([]);
        expect(res.body.meta).toBeDefined();
        expect(incidentModel.list).not.toHaveBeenCalled();
    });
});

describe('Universal search enhancements', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Route.findAll.mockResolvedValue([]);
        Route.findOne.mockResolvedValue(null);
        User.findAll.mockResolvedValue([]);
        Incident.findAll.mockResolvedValue([]);
        incidentModel.list.mockResolvedValue([]);
        modificationModel.searchForUniversal.mockResolvedValue([]);
    });

    test('shipments: hasMore cuando hay más de 6 resultados', async () => {
        const rows = Array.from({ length: 7 }, (_, i) => ({
            id: i + 1,
            trackingId: 'ENV-' + i,
            legacyTrackingId: null,
            recipient: { fullName: 'Test' },
            status: { description: 'En tránsito' },
        }));
        Shipment.findAll.mockResolvedValue(rows);

        const res = await request(buildApp({ id: 1, roleId: 4, branchId: null }))
            .get('/api/search?q=ENV')
            .expect(200);

        expect(res.body.shipments).toHaveLength(6);
        expect(res.body.meta.shipments.hasMore).toBe(true);
    });

    test('shipments: incluye búsqueda por legacyTrackingId', async () => {
        Shipment.findAll.mockImplementation((opts) => {
            if (opts.where?.legacyTrackingId) {
                return Promise.resolve([{
                    id: 5,
                    trackingId: 'ENV-005',
                    legacyTrackingId: 'OLD-99',
                    recipient: null,
                    sender: { fullName: 'Legacy User' },
                    status: { description: 'Entregado' },
                }]);
            }
            return Promise.resolve([]);
        });

        const res = await request(buildApp({ id: 1, roleId: 4, branchId: null }))
            .get('/api/search?q=OLD')
            .expect(200);

        expect(res.body.shipments).toHaveLength(1);
        expect(res.body.shipments[0].matchedBy).toBe('legacy');
        expect(res.body.shipments[0].secondary).toContain('Legacy: OLD-99');
        expect(res.body.shipments[0].matchLabel).toBe('Tracking legacy');
    });

    test('shipments: indica coincidencia por remitente', async () => {
        Shipment.findAll.mockImplementation((opts) => {
            if (opts.include?.some((i) => i.as === 'sender' && i.required)) {
                return Promise.resolve([{
                    id: 8,
                    trackingId: 'ENV-008',
                    legacyTrackingId: null,
                    sender: { fullName: 'Juan Remitente' },
                    recipient: { fullName: 'María Destino' },
                    status: { description: 'En tránsito' },
                }]);
            }
            return Promise.resolve([]);
        });

        const res = await request(buildApp({ id: 1, roleId: 4, branchId: null }))
            .get('/api/search?q=Juan')
            .expect(200);

        expect(res.body.shipments).toHaveLength(1);
        expect(res.body.shipments[0].matchedBy).toBe('sender');
        expect(res.body.shipments[0].matchLabel).toBe('Remitente');
        expect(res.body.shipments[0].matchValue).toBe('Juan Remitente');
        expect(res.body.shipments[0].senderName).toBe('Juan Remitente');
        expect(res.body.shipments[0].statusSlug).toBe('en_transito');
    });

    test('incidents: excluye RETURN del listado de incidencias', async () => {
        incidentModel.list.mockResolvedValue([
            {
                id: 1,
                status: 'OPEN',
                shipment: { trackingId: 'ENV-1' },
                type: { code: 'RETURN', description: 'Devolución' },
            },
            {
                id: 2,
                status: 'OPEN',
                shipment: { trackingId: 'ENV-2' },
                type: { code: 'DAMAGE', description: 'Daño' },
            },
        ]);

        const res = await request(buildApp({ id: 1, roleId: 4, branchId: null }))
            .get('/api/search?q=ENV')
            .expect(200);

        expect(res.body.incidents).toHaveLength(1);
        expect(res.body.incidents[0].id).toBe(2);
    });

    test('incidents: búsqueda por tipo de incidencia', async () => {
        incidentModel.list.mockResolvedValue([]);
        Incident.findAll.mockImplementation((opts) => {
            if (opts.include?.some(i => i.as === 'type' && i.where?.description)) {
                return Promise.resolve([{
                    id: 9,
                    status: 'OPEN',
                    shipment: { trackingId: 'ENV-9' },
                    type: { code: 'DAMAGE', description: 'Paquete dañado' },
                }]);
            }
            return Promise.resolve([]);
        });

        const res = await request(buildApp({ id: 1, roleId: 4, branchId: null }))
            .get('/api/search?q=daño')
            .expect(200);

        expect(Incident.findAll).toHaveBeenCalled();
        expect(res.body.incidents).toHaveLength(1);
        expect(res.body.incidents[0].type).toBe('Paquete dañado');
        expect(res.body.incidents[0].matchedBy).toBe('type');
        expect(res.body.incidents[0].matchLabel).toBe('Tipo de incidencia');
    });

    test('modifications: devuelve solicitudes para staff', async () => {
        modificationModel.searchForUniversal.mockResolvedValue([{
            id: 12,
            shipmentId: 45,
            changeType: 'ADDRESS_CHANGE',
            status: 'PENDING_REVIEW',
            shipment: { trackingId: 'ENV-011', recipient: { fullName: 'Ana' } },
        }]);

        const res = await request(buildApp({ id: 1, roleId: 1, branchId: 10 }))
            .get('/api/search?q=ENV')
            .expect(200);

        expect(res.body.modifications).toHaveLength(1);
        expect(res.body.modifications[0].trackingId).toBe('ENV-011');
    });

    test('portalClients: agrupa identidades por documento y email', async () => {
        Shipment.findAll.mockImplementation((opts) => {
            if (opts.include?.some(i => i.as === 'sender')) {
                return Promise.resolve([{
                    id: 1,
                    sender: { document: 38456789, email: 'juan@test.com', fullName: 'Juan Pérez' },
                }]);
            }
            if (opts.include?.some(i => i.as === 'recipient')) {
                return Promise.resolve([{
                    id: 2,
                    recipient: { document: 38456789, email: 'juan@test.com', fullName: 'Juan Pérez' },
                }]);
            }
            return Promise.resolve([]);
        });

        const res = await request(buildApp({ id: 1, roleId: 4, branchId: null }))
            .get('/api/search?q=Juan')
            .expect(200);

        expect(res.body.portalClients).toHaveLength(1);
        expect(res.body.portalClients[0].document).toBe(38456789);
        expect(res.body.portalClients[0].shipmentCount).toBe(2);
    });
});
