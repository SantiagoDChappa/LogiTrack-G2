// LGT-209 — propagación de demora en cascada a los envíos posteriores de la ruta.
jest.mock('../src/models/routeStop', () => ({ RouteStop: { findAll: jest.fn() } }));
jest.mock('../src/models/route', () => ({
    Route: { findByPk: jest.fn() },
    RouteStatus: { PLANNED: 1, IN_ROUTE: 2, COMPLETED: 3 },
}));
jest.mock('../src/models/shipment', () => ({ Shipment: { findByPk: jest.fn() } }));
jest.mock('../src/models/shipmentHistory', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/controllers/shipment', () => ({ notifyShipmentEvent: jest.fn().mockResolvedValue() }));

const { notifyShipmentEvent } = require('../src/controllers/shipment');
const { RouteStop } = require('../src/models/routeStop');
const { Route } = require('../src/models/route');
const { Shipment } = require('../src/models/shipment');
const shipmentHistory = require('../src/models/shipmentHistory');
const { propagate } = require('../src/services/delayPropagation');

const makeShipment = (id, statusId, extra = {}) => ({
    id, statusId, delayOriginIncidentId: null, update: jest.fn().mockResolvedValue(), ...extra,
});

beforeEach(() => { jest.clearAllMocks(); });

describe('propagate', () => {
    test('marca demorados los pendientes posteriores, ignora entregados y deja trazabilidad', async () => {
        // Parada activa del envío origen (seq 2) en ruta IN_ROUTE.
        RouteStop.findAll
            .mockResolvedValueOnce([{ routeId: 10, sequence: 2, stopType: 'delivery' }])
            .mockResolvedValueOnce([
                { shipmentId: 101, sequence: 3 },  // pendiente → se marca
                { shipmentId: 102, sequence: 4 },  // entregado → se ignora (Esc.2)
            ]);
        Route.findByPk.mockResolvedValue({ id: 10, statusId: 2 });

        const s101 = makeShipment(101, 1);   // Pendiente
        const s102 = makeShipment(102, 4);   // Entregado
        Shipment.findByPk.mockImplementation((id) => Promise.resolve(id === 101 ? s101 : s102));

        const res = await propagate({ shipment: { id: 9 }, originIncidentId: 77, userId: 5 });

        expect(res.affected).toEqual([101]);
        expect(s101.update).toHaveBeenCalledWith(expect.objectContaining({ delayOriginIncidentId: 77 }));
        expect(s102.update).not.toHaveBeenCalled();
        expect(shipmentHistory.create).toHaveBeenCalledTimes(1);
        expect(shipmentHistory.create).toHaveBeenCalledWith(expect.objectContaining({
            shipmentId: 101, eventType: 'DELAY_PROPAGATED',
        }));
        expect(notifyShipmentEvent).toHaveBeenCalledWith('SHIPMENT_DELAYED', 101);
    });

    test('sin ruta activa no afecta envíos', async () => {
        RouteStop.findAll.mockResolvedValueOnce([{ routeId: 10, sequence: 2 }]);
        Route.findByPk.mockResolvedValue({ id: 10, statusId: 3 }); // COMPLETED → no activa
        const res = await propagate({ shipment: { id: 9 }, originIncidentId: 77 });
        expect(res.affected).toEqual([]);
        expect(notifyShipmentEvent).not.toHaveBeenCalled();
    });

    test('idempotente: no re-propaga a un envío ya marcado', async () => {
        RouteStop.findAll
            .mockResolvedValueOnce([{ routeId: 10, sequence: 1 }])
            .mockResolvedValueOnce([{ shipmentId: 201, sequence: 2 }]);
        Route.findByPk.mockResolvedValue({ id: 10, statusId: 1 });
        Shipment.findByPk.mockResolvedValue(makeShipment(201, 1, { delayOriginIncidentId: 50 }));
        const res = await propagate({ shipment: { id: 9 }, originIncidentId: 77 });
        expect(res.affected).toEqual([]);
    });
});
