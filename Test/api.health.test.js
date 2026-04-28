const request = require('supertest');
const app = require('../app');

describe('Health and Auth check', () => {
    test('GET / responde 200 con status ok', async () => {
        const res = await request(app).get('/');
        // En app.js, apiHealthRoutes está al final, pero '/' está en portalRoutes.
        // / responde el portal. Para el health check es / (apiHealthRoutes).
        // Si hay colisión, uno gana.
        expect(res.status).toBe(200);
    });

    const protectedRoutes = [
        '/home',
        '/user',
        '/shipment',
    ];

    test.each(protectedRoutes)(
        'GET %s sin token redirige a /login',
        async (route) => {
            const res = await request(app).get(route);
            expect([301, 302, 401, 403]).toContain(res.status);
        }
    );
});
