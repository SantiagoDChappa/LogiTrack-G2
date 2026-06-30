const request = require('supertest');
const express = require('express');
const path = require('path');

jest.mock('../src/services/portalModificationService', () => ({
    listPending: jest.fn(),
    approveRequest: jest.fn(),
    rejectRequest: jest.fn(),
    changeTypeLabel: jest.fn((t) => t),
    statusLabel: jest.fn((s) => s),
    describeChanges: jest.fn(() => 'cambio de dirección'),
}));

const portalModificationService = require('../src/services/portalModificationService');
const shipmentModificationRoutes = require('../src/routes/shipmentModification');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'src', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    res.locals.currentUser = { id: 1, roleId: 2, branchId: 3, fullName: 'Operador Test' };
    res.locals.nombreEmpresa = 'LogiTrack';
    next();
});
app.use('/shipment/modifications', shipmentModificationRoutes);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /shipment/modifications', () => {
    test('lista solicitudes pendientes para operador', async () => {
        portalModificationService.listPending.mockResolvedValueOnce([{
            id: 1,
            shipmentId: 10,
            changeType: 'ADDRESS_CHANGE',
            status: 'PENDING_REVIEW',
            createdAt: new Date('2026-06-01T10:00:00'),
            payload: { requested: { street: 'Nueva' } },
            shipment: {
                trackingId: 'ENV-010',
                recipient: { fullName: 'Juan' },
                status: { description: 'Pendiente' },
            },
            toJSON() { return this; },
        }]);

        const res = await request(app).get('/shipment/modifications');

        expect(res.status).toBe(200);
        expect(res.text).toContain('Modificaciones desde portal');
        expect(res.text).toContain('ENV-010');
        expect(portalModificationService.listPending).toHaveBeenCalledWith(
            expect.objectContaining({ branchId: 3, status: 'PENDING_REVIEW' })
        );
    });
});

describe('POST /shipment/modifications/:id/approve', () => {
    test('redirige con ok cuando aprueba', async () => {
        portalModificationService.approveRequest.mockResolvedValueOnce({ ok: true, requestId: 1 });

        const res = await request(app).post('/shipment/modifications/1/approve');

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/shipment/modifications?ok=approved');
    });

    test('redirige con error cuando falla', async () => {
        portalModificationService.approveRequest.mockResolvedValueOnce({
            ok: false,
            message: 'La solicitud ya fue procesada.',
        });

        const res = await request(app).post('/shipment/modifications/2/approve');

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('error=');
    });
});

describe('POST /shipment/modifications/:id/reject', () => {
    test('redirige con ok cuando rechaza', async () => {
        portalModificationService.rejectRequest.mockResolvedValueOnce({ ok: true, requestId: 3 });

        const res = await request(app)
            .post('/shipment/modifications/3/reject')
            .type('form')
            .send({ reviewComment: 'Dirección fuera de zona' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/shipment/modifications?ok=rejected');
        expect(portalModificationService.rejectRequest).toHaveBeenCalledWith(
            3,
            expect.objectContaining({ id: 1 }),
            'Dirección fuera de zona'
        );
    });
});
