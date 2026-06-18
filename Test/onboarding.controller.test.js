'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../src/models/user', () => ({
    User: { update: jest.fn() },
}));

const { User } = require('../src/models/user');
const onboardingRoutes = require('../src/routes/onboarding');

const buildApp = (currentUser) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        res.locals.currentUser = currentUser;
        next();
    });
    app.use('/api/onboarding', onboardingRoutes);
    return app;
};

describe('Onboarding API', () => {
    beforeEach(() => {
        User.update.mockReset();
        User.update.mockResolvedValue([1]);
    });

    describe('POST /api/onboarding/complete', () => {
        it('marca onboarded=true para usuario autenticado', async () => {
            const app = buildApp({ id: 42 });

            const res = await request(app).post('/api/onboarding/complete');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
            expect(User.update).toHaveBeenCalledWith(
                { onboarded: true },
                { where: { id: 42 } }
            );
        });

        it('responde 401 sin usuario autenticado', async () => {
            const app = buildApp(null);

            const res = await request(app).post('/api/onboarding/complete');

            expect(res.status).toBe(401);
            expect(User.update).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/onboarding/replay', () => {
        it('marca onboarded=false para usuario autenticado', async () => {
            const app = buildApp({ id: 7 });

            const res = await request(app).post('/api/onboarding/replay');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
            expect(User.update).toHaveBeenCalledWith(
                { onboarded: false },
                { where: { id: 7 } }
            );
        });

        it('responde 401 sin usuario autenticado', async () => {
            const app = buildApp(undefined);

            const res = await request(app).post('/api/onboarding/replay');

            expect(res.status).toBe(401);
            expect(User.update).not.toHaveBeenCalled();
        });
    });
});
