/**
 * Sprint 2 — CP-SUC: Creación de Sucursales y Asignación a Supervisor/Transportista
 * LGT-107 / LGT-108
 */
const request = require('supertest');
const express = require('express');
const path    = require('path');

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../src/models/setting', () => ({
    getAll: jest.fn().mockResolvedValue({ origin_province_id: '24' }),
    set:    jest.fn().mockResolvedValue({}),
}));
jest.mock('../src/models/province', () => ({
    getAll: jest.fn().mockResolvedValue([{ id: 24, description: 'CABA' }]),
}));
jest.mock('../src/models/branch', () => ({
    getAll:  jest.fn().mockResolvedValue([
        { id: 1, name: 'Casa Central', provinceId: 24, latitude: -34.6, longitude: -58.3, address: 'Av. Corrientes 1000', postalCode: '1043', statusId: 1, closed: false },
    ]),
    getById: jest.fn().mockResolvedValue({ id: 1, name: 'Casa Central' }),
    Branch:  { create: jest.fn().mockResolvedValue({ id: 2 }) },
}));
jest.mock('../src/models/user', () => ({
    getAll:   jest.fn().mockResolvedValue([
        { id: 1, fullName: 'Sup1', roleId: 1, branchId: 1 },
        { id: 2, fullName: 'Trans1', roleId: 3, branchId: null },
    ]),
    update:   jest.fn().mockResolvedValue({}),
    getById:  jest.fn().mockResolvedValue({ id: 1, fullName: 'Admin' }),
}));
jest.mock('../src/utils/provinces', () => ({
    PROVINCES: {
        24: { lat: -34.6037, lng: -58.3816, ml: 'CABA', indec: '2' },
    },
}));

const branchModel = require('../src/models/branch');
const userModel   = require('../src/models/user');

// ── Mini app ───────────────────────────────────────────────────────────────
const buildApp = (roleId = 4) => { // 4=ADMIN
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'src', 'views'));
    app.use((req, res, next) => {
        res.locals.currentUser = { id: 1, roleId, fullName: 'Admin' };
        next();
    });
    const { requireAdmin } = require('../src/middlewares/auth');
    const settingCtrl = require('../src/controllers/setting');
    app.get('/setting',              requireAdmin, settingCtrl.getSettings);
    app.post('/setting',             requireAdmin, settingCtrl.saveSettings);
    app.post('/setting/assign-branch', requireAdmin, settingCtrl.assignBranch);
    return app;
};

// ── Tests ──────────────────────────────────────────────────────────────────
describe('CP-SUC — Sucursales y Asignación', () => {
    beforeEach(() => jest.clearAllMocks());

    // ── CP-SUC01 ──
    test('CP-SUC01 — GET /setting (admin) muestra lista de sucursales: 200', async () => {
        const res = await request(buildApp()).get('/setting');
        expect(res.status).toBe(200);
        expect(branchModel.getAll).toHaveBeenCalled();
    });

    // ── CP-SUC02 ──
    test('CP-SUC02 — POST /setting sin provinceId válido redirige sin guardar', async () => {
        const res = await request(buildApp())
            .post('/setting')
            .send({ origin_province_id: '99999' }); // provincia inexistente
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/setting');
    });

    // ── CP-SUC03 ──
    test('CP-SUC03 — POST /setting/assign-branch asigna supervisorId a sucursalId', async () => {
        const res = await request(buildApp())
            .post('/setting/assign-branch')
            .send({ 'userId[]': ['1'], 'branchId[]': ['1'] });
        expect(res.status).toBe(302);
        expect(userModel.update).toHaveBeenCalledWith(1, { branchId: 1 });
    });

    // ── CP-SUC04 ──
    test('CP-SUC04 — GET /setting responde con datos de la sucursal asignada al supervisor', async () => {
        const res = await request(buildApp()).get('/setting');
        expect(res.status).toBe(200);
        expect(res.text).toMatch(/Casa Central/i);
    });

    // ── CP-SUC05 ──
    test('CP-SUC05 — No-admin (supervisor=1) recibe 403 al acceder a /setting', async () => {
        const res = await request(buildApp(1)).get('/setting');
        expect(res.status).toBe(403);
    });

    // ── CP-SUC06 ──
    test('CP-SUC06 — POST /setting/assign-branch sin userId redirige sin llamar update', async () => {
        const res = await request(buildApp())
            .post('/setting/assign-branch')
            .send({});
        expect(res.status).toBe(302);
        expect(userModel.update).not.toHaveBeenCalled();
    });
});
