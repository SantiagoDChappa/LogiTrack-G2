const request = require('supertest');

jest.mock('../src/database/connection', () => ({
    define:       jest.fn(() => ({ findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn() })),
    authenticate: jest.fn().mockResolvedValue(true),
    query:        jest.fn().mockResolvedValue([{ now: new Date() }]),
}));

const app = require('../app');

// ── Health check ──────────────────────────────────────────────────────────────
describe('GET /api/health', () => {
    test('responde 200 con status ok', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: expect.any(String) });
    });
});

// ── Rutas protegidas — sin token redirigen a login ───────────────────────────
describe('Rutas protegidas — autenticación', () => {
    const protectedRoutes = [
        '/home',
        '/users',
        '/shipments',
    ];

    test.each(protectedRoutes)(
        'GET %s sin token redirige a /login',
        async (route) => {
            const res = await request(app).get(route);
            // Debe redirigir (302) o devolver 401/403 — nunca 200 sin auth
            expect([301, 302, 401, 403]).toContain(res.status);
            if (res.status === 302) {
                expect(res.headers.location).toMatch(/\/login/);
            }
        }
    );
});

// ── Portal público de tracking — sin auth ────────────────────────────────────
describe('GET /portal/tracking/:id (HU-56 — LGT-77)', () => {
    test('endpoint público responde sin cookie de sesión', async () => {
        const res = await request(app).get('/portal/tracking/ENV-001');
        // No debe redirigir a login
        expect(res.status).not.toBe(302);
    });
});
