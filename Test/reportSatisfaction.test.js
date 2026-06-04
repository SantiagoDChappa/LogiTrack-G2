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
const { getSatisfactionData } = require('../src/services/reportData');
const reportRoutes = require('../src/routes/report');
const reportController = require('../src/controllers/report');

const buildApp = (currentUser = { id: 1, roleId: 1, fullName: 'Supervisor Test' }) => {
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

beforeEach(() => {
    jest.clearAllMocks();
    mockDeps.sequelize.query.mockReset();
});

describe('getSatisfactionData()', () => {
    test('retorna error si dateFrom > dateTo', async () => {
        const result = await getSatisfactionData({ from: '2026-06-10', to: '2026-06-01' }, mockDeps);
        expect(result.error).toBe('La fecha de inicio no puede ser mayor a la fecha de fin.');
        expect(mockDeps.sequelize.query).not.toHaveBeenCalled();
    });

    test('retorna KPIs y datos con filtro all', async () => {
        mockDeps.sequelize.query
            .mockResolvedValueOnce([{ total: 15, overall_avg: 4.2, dim1_avg: 3.8, dim2_avg: 4.0, dim3_avg: 4.5 }])
            .mockResolvedValueOnce([{ month: '2026-05', avg_overall: 4.1, total: 8 }, { month: '2026-06', avg_overall: 4.3, total: 7 }])
            .mockResolvedValueOnce([{ survey_type: 'delivery', avg_overall: 4.0, avg_dim1: 3.5, avg_dim2: 4.2, avg_dim3: 4.3, total: 10 }, { survey_type: 'incident', avg_overall: 4.5, avg_dim1: 4.1, avg_dim2: 3.8, avg_dim3: 4.8, total: 5 }])
            .mockResolvedValueOnce([{ rating: 3, count: 2 }, { rating: 4, count: 5 }, { rating: 5, count: 8 }]);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'all' }, mockDeps);

        expect(result.error).toBeNull();
        expect(result.kpis.totalSurveys).toBe(15);
        expect(result.kpis.overallAvg).toBe(4.2);
        expect(result.kpis.dimensions).toHaveLength(3);
        expect(result.trend).toHaveLength(2);
        expect(result.comparison).toHaveLength(2);
        expect(result.distribution).toHaveLength(3);
        expect(mockDeps.sequelize.query).toHaveBeenCalledTimes(4);
    });

    test('filtra solo por delivery', async () => {
        mockDeps.sequelize.query
            .mockResolvedValueOnce([{ total: 10, overall_avg: 4.0, dim1_avg: 3.5, dim2_avg: 4.2, dim3_avg: 4.3 }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ survey_type: 'delivery', avg_overall: 4.0, avg_dim1: 3.5, avg_dim2: 4.2, avg_dim3: 4.3, total: 10 }])
            .mockResolvedValueOnce([]);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'delivery' }, mockDeps);

        expect(result.kpis.dimensions[0].label).toBe('Puntualidad');
        expect(result.kpis.dimensions[1].label).toBe('Estado del paquete');
        expect(result.kpis.dimensions[2].label).toBe('Atención del servicio');

        const firstQuery = mockDeps.sequelize.query.mock.calls[0][0];
        expect(firstQuery).toContain('delivery_survey');
        expect(firstQuery).not.toContain('incident_survey');
    });

    test('filtra solo por incident', async () => {
        mockDeps.sequelize.query
            .mockResolvedValueOnce([{ total: 5, overall_avg: 4.5, dim1_avg: 4.1, dim2_avg: 3.8, dim3_avg: 4.8 }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03', type: 'incident' }, mockDeps);

        expect(result.kpis.dimensions[0].label).toBe('Tiempo de resolución');
        expect(result.kpis.dimensions[1].label).toBe('Comunicación');
        expect(result.kpis.dimensions[2].label).toBe('Resultado obtenido');

        const firstQuery = mockDeps.sequelize.query.mock.calls[0][0];
        expect(firstQuery).toContain('incident_survey');
        expect(firstQuery).not.toContain('delivery_survey');
    });

    test('retorna datos vacíos correctamente', async () => {
        mockDeps.sequelize.query
            .mockResolvedValueOnce([{ total: 0, overall_avg: null, dim1_avg: null, dim2_avg: null, dim3_avg: null }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await getSatisfactionData({ from: '2026-05-01', to: '2026-06-03' }, mockDeps);

        expect(result.kpis.totalSurveys).toBe(0);
        expect(result.kpis.overallAvg).toBe(0);
        expect(result.trend).toEqual([]);
    });
});

describe('Report controller - satisfaction', () => {
    test('getSatisfactionReport renders satisfaction view', async () => {
        sequelize.query
            .mockResolvedValueOnce([{ total: 5, overall_avg: 4.0, dim1_avg: 3.5, dim2_avg: 4.0, dim3_avg: 4.5 }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const render = jest.fn();
        await reportController.getSatisfactionReport(
            { query: { from: '2026-05-01', to: '2026-06-01' } },
            { render }
        );

        expect(render).toHaveBeenCalledWith(
            'report/satisfaction',
            expect.objectContaining({
                kpis: expect.objectContaining({ totalSurveys: 5 }),
                exportQuery: expect.stringContaining('from=2026-05-01'),
            })
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
        sequelize.query
            .mockResolvedValueOnce([{ total: 10, overall_avg: 4.2, dim1_avg: 3.8, dim2_avg: 4.0, dim3_avg: 4.5 }])
            .mockResolvedValueOnce([{ month: '2026-05', avg_overall: 4.1, total: 10 }])
            .mockResolvedValueOnce([{ survey_type: 'delivery', avg_overall: 4.0, avg_dim1: 3.5, avg_dim2: 4.2, avg_dim3: 4.3, total: 10 }])
            .mockResolvedValueOnce([{ rating: 4, count: 5 }, { rating: 5, count: 5 }]);

        const res = await request(buildApp())
            .get('/report/satisfaction/export?format=csv&from=2026-05-01&to=2026-06-01');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/i);
        expect(res.headers['content-disposition']).toContain('satisfaccion_cliente');
        expect(res.text).toContain('fecha_desde');
        expect(res.text).toContain('Entregas');
    });

    test('exporta satisfaction a PDF', async () => {
        sequelize.query
            .mockResolvedValueOnce([{ total: 10, overall_avg: 4.2, dim1_avg: 3.8, dim2_avg: 4.0, dim3_avg: 4.5 }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ survey_type: 'delivery', avg_overall: 4.0, avg_dim1: 3.5, avg_dim2: 4.2, avg_dim3: 4.3, total: 10 }])
            .mockResolvedValueOnce([]);

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
