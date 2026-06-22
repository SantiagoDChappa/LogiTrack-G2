'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../src/models/user', () => ({
    User: { update: jest.fn() },
    markHelpModuleSeen: jest.fn(),
}));

const { User, markHelpModuleSeen } = require('../src/models/user');
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
        markHelpModuleSeen.mockReset();
        markHelpModuleSeen.mockResolvedValue({ kanban: true });
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

    describe('POST /api/onboarding/module-complete', () => {
        it('marca módulo de ayuda como visto', async () => {
            const app = buildApp({ id: 9 });

            const res = await request(app)
                .post('/api/onboarding/module-complete')
                .send({ module: 'kanban' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, helpSeen: { kanban: true } });
            expect(markHelpModuleSeen).toHaveBeenCalledWith(9, 'kanban');
        });

        it('acepta módulos contextuales adicionales', async () => {
            markHelpModuleSeen.mockResolvedValue({ incidencias: true, 'entregas-repartidor': true });
            const app = buildApp({ id: 9 });

            const resInc = await request(app)
                .post('/api/onboarding/module-complete')
                .send({ module: 'incidencias' });
            expect(resInc.status).toBe(200);
            expect(markHelpModuleSeen).toHaveBeenCalledWith(9, 'incidencias');

            const resDel = await request(app)
                .post('/api/onboarding/module-complete')
                .send({ module: 'entregas-repartidor' });
            expect(resDel.status).toBe(200);
            expect(markHelpModuleSeen).toHaveBeenCalledWith(9, 'entregas-repartidor');
        });

        it('rechaza módulo inválido', async () => {
            const app = buildApp({ id: 9 });

            const res = await request(app)
                .post('/api/onboarding/module-complete')
                .send({ module: 'inventado' });

            expect(res.status).toBe(400);
            expect(markHelpModuleSeen).not.toHaveBeenCalled();
        });

        it('responde 401 sin usuario autenticado', async () => {
            const app = buildApp(null);

            const res = await request(app)
                .post('/api/onboarding/module-complete')
                .send({ module: 'kanban' });

            expect(res.status).toBe(401);
            expect(markHelpModuleSeen).not.toHaveBeenCalled();
        });
    });
});
