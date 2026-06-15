// LGT-211 — medición de incidencias por tipo, con desglose por procedencia y detalle "Otro".
jest.mock('../src/database/connection', () => ({ query: jest.fn() }));

const { getIncidentsByPeriodData } = require('../src/services/reportData');
const { buildIncidentsByPeriodExport } = require('../src/services/reportExport');

const makeDeps = () => ({ sequelize: { query: jest.fn() }, QueryTypes: { SELECT: 'SELECT' } });

describe('LGT-211 getIncidentsByPeriodData', () => {
    test('agrega conteo por tipo + procedencia y trae el detalle del tipo "Otro"', async () => {
        const deps = makeDeps();
        deps.sequelize.query
            .mockResolvedValueOnce([
                { incident_type_id: 1, incident_type_code: 'PACKAGE_BROKEN', incident_type: 'Paquete roto',
                  total: 5, open: 2, resolved: 3, procedente: 2, no_procedente: 1, sin_clasificar: 2 },
            ])
            .mockResolvedValueOnce([
                { id: 9, description: 'Otra cosa rara', resolution: null, created_at: '2026-06-01' },
            ]);

        const vm = await getIncidentsByPeriodData({ from: '2026-06-01', to: '2026-06-10' }, deps);

        expect(vm.error).toBeNull();
        expect(vm.totalIncidents).toBe(5);
        expect(vm.rows[0]).toMatchObject({ procedente: 2, no_procedente: 1, sin_clasificar: 2 });
        expect(vm.otherDetails).toHaveLength(1);
        expect(vm.otherDetails[0].description).toBe('Otra cosa rara');

        // la query principal desglosa por resolution; la segunda filtra el tipo "Otro"
        expect(deps.sequelize.query.mock.calls[0][0]).toContain("i.resolution = 'PROCEDENTE'");
        expect(deps.sequelize.query.mock.calls[1][0]).toContain("it.code = 'OTHER'");
    });

    test('rango inválido → error y no consulta', async () => {
        const deps = makeDeps();
        const vm = await getIncidentsByPeriodData({ from: '2026-06-10', to: '2026-06-01' }, deps);
        expect(vm.error).toBeTruthy();
        expect(deps.sequelize.query).not.toHaveBeenCalled();
    });
});

describe('LGT-211 buildIncidentsByPeriodExport', () => {
    test('el export incluye columnas de procedencia', () => {
        const ex = buildIncidentsByPeriodExport({
            dateFrom: '2026-06-01', dateTo: '2026-06-10', totalIncidents: 4,
            rows: [{ incident_type: 'Paquete roto', total: 4, open: 1, resolved: 3, procedente: 2, no_procedente: 1, sin_clasificar: 1 }],
        });
        expect(ex.columns).toEqual(expect.arrayContaining(['procedentes', 'no_procedentes', 'sin_clasificar']));
        expect(ex.rows[0]).toMatchObject({ procedentes: 2, no_procedentes: 1, sin_clasificar: 1 });
    });
});
