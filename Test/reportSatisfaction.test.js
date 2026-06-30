const request = require('supertest');
const express = require('express');
const path = require('path');

jest.mock('../src/database/connection', () => ({
    query: jest.fn(),
    define: jest.fn(() => ({
        findAll: jest.fn(),
        findOne: jest.fn(),
    })),
    QueryTypes: { SELECT: 'SELECT' },
}));

const sequelize = require('../src/database/connection');
const { getSatisfactionData, computeNps } = require('../src/services/reportData');
const reportRoutes = require('../src/routes/report');
const reportController = require('../src/controllers/report');

const buildApp = (currentUser = { id: 1, roleId: 1, fullName: 'Supervisor Test', branchId: 10 }) => {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'src', 'views'));
    app.use((req, res, next) => {
        res.locals.currentUser = currentUser;
        res.locals.nombreEmpresa = 'LogiTrack';
        next();
    });
    app.use('/report', reportRoutes);
    return app;
};

const mockDeps = {
    sequelize: { query: jest.fn() },
    QueryTypes: { SELECT: 'SELECT' },
};

const mockKpiRow = (overrides = {}) => ({
    total: 15, overall_avg: 4.2, dim1_avg: 3.8, dim2_avg: 4.0, dim3_avg: 4.5,
    ...overrides,
});

const mockResponseRateRow = (overrides = {}) => ({
    eligible: 25, responded: 15, ...overrides,
});

const mockTrend = () => [
    { month: '2026-05', avg_overall: 4.1, total: 8, promoters: 6, detractors: 1 },
    { month: '2026-06', avg_overall: 4.3, total: 7, promoters: 5, detractors: 0 },
];

const mockComparison = () => [
    { survey_type: 'delivery', avg_overall: 4.0, avg_dim1: 3.5, avg_dim2: 4.2, avg_dim3: 4.3, total: 10 },
    { survey_type: 'incident', avg_overall: 4.5, avg_dim1: 4.1, avg_dim2: 3.8, avg_dim3: 4.8, total: 5 },
];

const mockDistribution = () => [
    { rating: 2, count: 1 },
    { rating: 3, count: 2 },
    { rating: 4, count: 5 },
    { rating: 5, count: 7 },
];

const mockComments = () => [
    { survey_type: 'delivery', rating: 5, comment: 'Excelente servicio', createdAt: '2026-06-02', ref: 'ENV-42' },
    { survey_type: 'incident', rating: 3, comment: 'Demoró un poco', createdAt: '2026-06-01', ref: 'INC-7' },
];

const mockIncidentTypes = () => [
    { id: 1, description: 'Paquete dañado' },
    { id: 2, description: 'Demora' },
    { id: 3, description: 'Extravío' },
];

const setupFullMock = (target, overrides = {}) => {
    target.query
        .mockResolvedValueOnce(overrides.incidentTypes ?? mockIncidentTypes())
        .mockResolvedValueOnce([mockKpiRow(overrides.kpi)])
        .mockResolvedValueOnce([mockResponseRateRow(overrides.responseRate)])
        .mockResolvedValueOnce(overrides.trend ?? mockTrend())
        .mockResolvedValueOnce(overrides.comparison ?? mockComparison())
        .mockResolvedValueOnce(overrides.distribution ?? mockDistribution())
        .mockResolvedValueOnce(overrides.comments ?? mockComments());
};

beforeEach(() => {
    jest.clearAllMocks();
    mockDeps.sequelize.query.mockReset();
});

describe('computeNps()', () => {
    test('calcula NPS correctamente con promotores y detractores', () => {
        const dist = [{ rating: 1, count: 2 }, { rating: 3, count: 3 }, { rating: 4, count: 3 }, { rating: 5, count: 2 }];
        expect(computeNps(dist)).toBe(30);
    });

    test('retorna 0 para distribución vacía', () => {
        expect(computeNps([])).toBe(0);
    });

    test('retorna 100 si todos son promotores', () => {
        const dist = [{ rating: 5, count: 10 }];
        expect(computeNps(dist)).toBe(100);
    });

    test('retorna -100 si todos son detractores', () => {
        const dist = [{ rating: 1, count: 5 }, { rating: 2, count: 5 }];
        expect(computeNps(dist)).toBe(-100);
    });
});

describe('getSatisfactionData()', () => {
    test('retorna error si dateFrom > dateTo', async () => {
        const result = await getSatisfactionData({ from: '2026-06-10', to: '2026-06-01' }, mockDeps);
        expect(result.error).toBe('La fecha de inicio no puede ser mayor a la fecha de fin.');
        expect(mockDeps.sequelize.query).not.toHaveBeenCalled();
    });

    test('retorna KPIs, NPS, tasa de respuesta, comentarios con filtro all', async () => {
        setupFullMock(mockDeps.sequelize);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'all' }, mockDeps);

        expect(result.error).toBeNull();
        expect(result.kpis.totalSurveys).toBe(15);
        expect(result.kpis.overallAvg).toBe(4.2);
        expect(result.kpis.nps).toBe(computeNps(mockDistribution()));
        expect(result.kpis.dimensions).toHaveLength(3);
        expect(result.kpis.responseRate).toEqual({
            eligible: 25, responded: 15, pending: 10, pct: 60,
        });
        expect(result.trend).toHaveLength(2);
        expect(result.trend[0]).toHaveProperty('nps');
        expect(result.comparison).toHaveLength(2);
        expect(result.distribution).toHaveLength(4);
        expect(result.recentComments).toHaveLength(2);
        expect(result.incidentTypes).toHaveLength(3);
        expect(mockDeps.sequelize.query).toHaveBeenCalledTimes(7);
    });

    test('usa labels de delivery cuando type=delivery', async () => {
        setupFullMock(mockDeps.sequelize);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'delivery' }, mockDeps);

        expect(result.kpis.dimensions[0].label).toBe('Puntualidad');
        expect(result.kpis.dimensions[1].label).toBe('Estado del paquete');
        expect(result.kpis.dimensions[2].label).toBe('Atención del servicio');
    });

    test('usa labels de incident cuando type=incident', async () => {
        setupFullMock(mockDeps.sequelize);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'incident' }, mockDeps);

        expect(result.kpis.dimensions[0].label).toBe('Tiempo de resolución');
        expect(result.kpis.dimensions[1].label).toBe('Comunicación');
        expect(result.kpis.dimensions[2].label).toBe('Resultado obtenido');
    });

    test('no usa labels genéricos (Dimensión) cuando type=all', async () => {
        setupFullMock(mockDeps.sequelize);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'all' }, mockDeps);

        result.kpis.dimensions.forEach((d) => {
            expect(d.label).not.toMatch(/Dimensión/);
        });
    });

    test('pasa branchId a las queries SQL', async () => {
        setupFullMock(mockDeps.sequelize);

        await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', branchId: '10' }, mockDeps);

        const calls = mockDeps.sequelize.query.mock.calls;
        const kpiCall = calls[1];
        expect(kpiCall[0]).toContain('currentBranchId');
        expect(kpiCall[1].replacements.branchId).toBe(10);
    });

    test('pasa incidentTypeId a las queries SQL de incident', async () => {
        setupFullMock(mockDeps.sequelize);

        await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'incident', incidentTypeId: '2' }, mockDeps);

        const calls = mockDeps.sequelize.query.mock.calls;
        const kpiCall = calls[1];
        expect(kpiCall[0]).toContain('incidentTypeId');
        expect(kpiCall[1].replacements.incidentTypeId).toBe(2);
    });

    test('pasa deliveryStatus a las queries SQL de delivery', async () => {
        setupFullMock(mockDeps.sequelize);

        await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'delivery', deliveryStatus: '5' }, mockDeps);

        const calls = mockDeps.sequelize.query.mock.calls;
        const kpiCall = calls[1];
        expect(kpiCall[1].replacements.deliveryStatus).toBe(5);
    });

    test('incluye statusId IN (4,5) por defecto para delivery (no solo 4)', async () => {
        setupFullMock(mockDeps.sequelize);

        await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'delivery' }, mockDeps);

        const calls = mockDeps.sequelize.query.mock.calls;
        const kpiCall = calls[1][0];
        expect(kpiCall).toContain('IN (4,5)');
    });

    test('retorna datos vacíos correctamente', async () => {
        mockDeps.sequelize.query
            .mockResolvedValueOnce(mockIncidentTypes())
            .mockResolvedValueOnce([mockKpiRow({ total: 0, overall_avg: null, dim1_avg: null, dim2_avg: null, dim3_avg: null })])
            .mockResolvedValueOnce([mockResponseRateRow({ eligible: 0, responded: 0 })])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03' }, mockDeps);

        expect(result.kpis.totalSurveys).toBe(0);
        expect(result.kpis.overallAvg).toBe(0);
        expect(result.kpis.nps).toBe(0);
        expect(result.kpis.responseRate.pct).toBe(0);
        expect(result.trend).toEqual([]);
        expect(result.recentComments).toEqual([]);
    });

    test('exportQuery incluye nuevos filtros', async () => {
        setupFullMock(mockDeps.sequelize);

        const result = await getSatisfactionData({
            from: '2026-05-01', to: '2026-06-03', type: 'incident',
            branchId: '10', incidentTypeId: '2',
        }, mockDeps);

        expect(result.exportQuery).toContain('branchId=10');
        expect(result.exportQuery).toContain('incidentTypeId=2');
    });

    test('NPS en tendencia se calcula por mes', async () => {
        setupFullMock(mockDeps.sequelize);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03' }, mockDeps);

        expect(result.trend[0].nps).toBe(Math.round((6 - 1) / 8 * 100));
        expect(result.trend[1].nps).toBe(Math.round((5 - 0) / 7 * 100));
    });
});

describe('Report controller - satisfaction', () => {
    test('getSatisfactionReport renders with NPS and branch context', async () => {
        setupFullMock(sequelize);

        const render = jest.fn();
        const res = { render, locals: { currentUser: { id: 1, roleId: 1, branchId: 10 } } };
        await reportController.getSatisfactionReport(
            { query: { from: '2026-05-01', to: '2026-06-01' } },
            res
        );

        expect(render).toHaveBeenCalledWith(
            'report/satisfaction',
            expect.objectContaining({
                kpis: expect.objectContaining({
                    totalSurveys: 15,
                    nps: expect.any(Number),
                    responseRate: expect.objectContaining({ eligible: 25 }),
                }),
                incidentTypes: expect.arrayContaining([
                    expect.objectContaining({ description: 'Paquete dañado' }),
                ]),
                isAdmin: false,
                currentBranchId: 10,
            })
        );
    });

    test('admin puede ver sin restricción de branch', async () => {
        setupFullMock(sequelize);

        const render = jest.fn();
        const res = { render, locals: { currentUser: { id: 1, roleId: 4, branchId: 10 } } };
        await reportController.getSatisfactionReport(
            { query: { from: '2026-05-01', to: '2026-06-01' } },
            res
        );

        expect(render).toHaveBeenCalledWith(
            'report/satisfaction',
            expect.objectContaining({ isAdmin: true })
        );
    });
});

describe('Report routes - satisfaction export', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-06-03T12:00:00Z'));
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    test('exporta satisfaction a CSV', async () => {
        setupFullMock(sequelize);

        const res = await request(buildApp())
            .get('/report/satisfaction/export?format=csv&from=2026-05-01&to=2026-06-01');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/i);
        expect(res.headers['content-disposition']).toContain('satisfaccion_cliente');
    });

    test('exporta satisfaction a PDF con NPS en resumen', async () => {
        setupFullMock(sequelize);

        const res = await request(buildApp())
            .get('/report/satisfaction/export?format=pdf&from=2026-05-01&to=2026-06-01');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/pdf/i);
    });

    test('devuelve 400 con fechas invertidas', async () => {
        const res = await request(buildApp())
            .get('/report/satisfaction/export?format=csv&from=2026-06-10&to=2026-06-01');

        expect(res.status).toBe(400);
    });
});
