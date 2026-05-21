const { handleChatbotRequest } = require('../src/services/chatbot/chatbotService');

const support = {
    email: 'soporte@logitrack.com',
    hours: 'Lunes a viernes, 9 a 18 hs',
};

function buildShipment(overrides = {}) {
    return {
        id: '1',
        trackingId: 'ENV-001',
        status: 'En Transito',
        statusKey: 'en_transito',
        recipient: 'Ana Lopez',
        sender: 'Juan Perez',
        destination: 'Cordoba',
        destinationAddress: 'San Martin 100',
        shipmentType: 'Paqueteria',
        weightKg: '2.00 kg',
        packageQty: '1 bulto',
        createdAtLabel: '10 de junio de 2025',
        currentBranchName: 'Sucursal Centro',
        expectedDeliveryDateLabel: '15 de junio de 2025',
        expectedDeliveryWindow: '09:00 a 18:00',
        hasLiveTracking: true,
        activeRouteId: '20',
        lastMovementLabel: 'En Transito',
        lastMovementDateLabel: '12 jun 2025',
        lastComment: 'En reparto',
        history: [
            {
                changedAtLabel: '11 jun 2025',
                fromStatus: 'Pendiente',
                toStatus: 'En Transito',
                comment: 'Salio a reparto',
                branchName: 'Sucursal Centro',
                eventType: 'STATUS_CHANGE',
            },
        ],
        ...overrides,
    };
}

describe('chatbotService', () => {
    test('init selecciona automaticamente el unico envio y devuelve menu inicial', () => {
        const response = handleChatbotRequest({
            context: {
                searched: true,
                query: 'ENV-001',
                support,
                shipments: [buildShipment()],
            },
            state: {},
            input: {
                type: 'init',
            },
        });

        expect(response.state.selectedShipmentId).toBe('1');
        expect(response.messages[0].text).toContain('Soy el asistente del portal publico');
        expect(response.messages[1].text).toContain('Ya tome este envio como referencia');
        expect(response.effects).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'focus-shipment', shipmentId: '1', scroll: false }),
            ])
        );
    });

    test('mensaje de ETA responde desde backend usando el envio seleccionado', () => {
        const response = handleChatbotRequest({
            context: {
                searched: true,
                query: 'ENV-001',
                support,
                shipments: [buildShipment()],
            },
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'cuando llega mi pedido',
            },
        });

        expect(response.messages[0].text).toContain('La entrega estimada es para 15 de junio de 2025');
        expect(response.effects).toHaveLength(0);
    });

    test('lookup repetido evita resubmit cuando la pagina ya tiene esos resultados', () => {
        const response = handleChatbotRequest({
            context: {
                searched: true,
                query: 'ENV-001',
                support,
                shipments: [buildShipment()],
            },
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'ENV-001',
            },
        });

        expect(response.messages[0].text).toContain('Esa busqueda ya esta cargada en esta misma pagina');
        expect(response.messages[0].actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ action: 'go-results' }),
            ])
        );
        expect(response.effects).toHaveLength(0);
    });

    test('si hay multiples envios y no hay seleccion, pide elegir antes de mostrar estado', () => {
        const response = handleChatbotRequest({
            context: {
                searched: true,
                query: '12345678',
                support,
                shipments: [
                    buildShipment({ id: '1', trackingId: 'ENV-001' }),
                    buildShipment({ id: '2', trackingId: 'ENV-002' }),
                ],
            },
            state: {},
            input: {
                type: 'action',
                action: 'show-status',
            },
        });

        expect(response.state.pendingAction).toBe('show-status');
        expect(response.messages[0].text).toContain('Elegi cual queres revisar para ver el estado actual');
        expect(response.messages[0].actions).toHaveLength(2);
    });

    test('al seleccionar un envio con accion pendiente, responde seleccion y follow-up', () => {
        const response = handleChatbotRequest({
            context: {
                searched: true,
                query: '12345678',
                support,
                shipments: [
                    buildShipment({ id: '1', trackingId: 'ENV-001' }),
                    buildShipment({ id: '2', trackingId: 'ENV-002', status: 'Entregado', statusKey: 'entregado' }),
                ],
            },
            state: {
                pendingAction: 'show-status',
            },
            input: {
                type: 'action',
                action: 'focus-shipment',
                value: '2',
            },
        });

        expect(response.state.selectedShipmentId).toBe('2');
        expect(response.state.pendingAction).toBeNull();
        expect(response.messages[0].text).toContain('Listo, tomo ENV-002 como envio activo');
        expect(response.messages[1].text).toContain('ENV-002 ahora figura como Entregado');
        expect(response.effects).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'focus-shipment', shipmentId: '2', scroll: true }),
            ])
        );
    });
});
