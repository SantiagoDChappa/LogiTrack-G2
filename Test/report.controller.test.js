const request = require('supertest');
const express = require('express');
const path = require('path');

jest.mock('../src/database/connection', () => ({
    query: jest.fn(),
}));

const sequelize = require('../src/database/connection');
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

describe('Report exports', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-05-24T12:00:00Z'));
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('el controller de volumen expone la query de exportacion con los filtros actuales', async () => {
        sequelize.query.mockResolvedValueOnce([
            { statusId: 1, status_label: 'Pendiente', total: 3 },
        ]);

        const render = jest.fn();
        await reportController.getShipmentsByPeriod(
            { query: { from: '2026-05-01', to: '2026-05-10' } },
            { render }
        );

        expect(render).toHaveBeenCalledWith(
            'report/shipments-by-period',
            expect.objectContaining({
                exportQuery: 'from=2026-05-01&to=2026-05-10',
            })
        );
    });

    test('exporta volumen de envios a CSV respetando filtros y nombre de archivo', async () => {
        sequelize.query.mockResolvedValueOnce([
            { statusId: 1, status_label: 'Pendiente', total: 3 },
            { statusId: 4, status_label: 'Entregado', total: 1 },
        ]);

        const res = await request(buildApp())
            .get('/report/shipments-by-period/export?format=csv&from=2026-05-01&to=2026-05-10');

        expect(res.status).toBe(200);
        expect(sequelize.query).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                replacements: { from: '2026-05-01', to: '2026-05-10' },
            })
        );
        expect(res.headers['content-type']).toMatch(/text\/csv/i);
        expect(res.headers['content-disposition']).toBe('attachment; filename="reporte_volumen_envios_2026-05-24.csv"');
        expect(res.text).toContain('fecha_desde,fecha_hasta,estado,cantidad,porcentaje');
        expect(res.text).toContain('2026-05-01,2026-05-10,Pendiente,3,75.0');
        expect(res.text).toContain('2026-05-01,2026-05-10,Entregado,1,25.0');
    });

    test('exporta entregas a tiempo a CSV con la segmentacion aplicada', async () => {
        sequelize.query
            .mockResolvedValueOnce([{ total: 5, on_time: 4, late: 1 }])
            .mockResolvedValueOnce([{ label: 'Zona Norte', total: 5, on_time: 4 }]);

        const res = await request(buildApp())
            .get('/report/on-time-deliveries/export?format=csv&from=2026-05-02&to=2026-05-07&segmentBy=zone');

        expect(res.status).toBe(200);
        expect(sequelize.query).toHaveBeenNthCalledWith(
            1,
            expect.any(String),
            expect.objectContaining({
                replacements: { from: '2026-05-02', to: '2026-05-07' },
            })
        );
        expect(sequelize.query.mock.calls[1][0]).toContain('JOIN logitrack.zone');
        expect(res.headers['content-disposition']).toBe('attachment; filename="reporte_entregas_a_tiempo_2026-05-24.csv"');
        expect(res.text).toContain('fecha_desde,fecha_hasta,segmentacion,segmento,total,a_tiempo,con_demora,porcentaje_a_tiempo');
        expect(res.text).toContain('2026-05-02,2026-05-07,zona,Zona Norte,5,4,1,80.0');
    });

    test('exporta rendimiento a PDF', async () => {
        sequelize.query.mockResolvedValueOnce([
            {
                user_id: 7,
                full_name: 'Ana Perez',
                assigned: 10,
                delivered: 8,
                on_time: 7,
                incidents: 1,
            },
        ]);

        const res = await request(buildApp())
            .get('/report/delivery-performance/export?format=pdf&from=2026-05-01&to=2026-05-31')
            .buffer(true);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/pdf/i);
        expect(res.headers['content-disposition']).toBe('attachment; filename="reporte_rendimiento_repartidores_2026-05-24.pdf"');
        expect(Buffer.isBuffer(res.body)).toBe(true);
        expect(res.body.slice(0, 8).toString('utf8')).toBe('%PDF-1.4');
    });

    test('rechaza exportar si el rango es invalido', async () => {
        const res = await request(buildApp())
            .get('/report/shipments-by-period/export?format=csv&from=2026-05-10&to=2026-05-01');

        expect(res.status).toBe(400);
        expect(res.text).toContain('La fecha de inicio no puede ser mayor a la fecha de fin.');
        expect(sequelize.query).not.toHaveBeenCalled();
    });

    test('rechaza formatos no soportados', async () => {
        sequelize.query.mockResolvedValueOnce([]);

        const res = await request(buildApp())
            .get('/report/shipments-by-period/export?format=xlsx&from=2026-05-01&to=2026-05-10');

        expect(res.status).toBe(400);
        expect(res.text).toContain('Formato de exportacion no soportado');
    });
});
