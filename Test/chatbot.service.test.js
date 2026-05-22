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
        destination: 'Cordoba',
        shipmentType: 'Paqueteria',
        weightKg: '2.00 kg',
        packageQty: '1 bulto',
        createdAtLabel: '10 de junio de 2025',
        currentBranchName: 'Sucursal Centro',
        expectedDeliveryDateLabel: '15 de junio de 2025',
        expectedDeliveryWindow: '09:00 a 18:00',
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

function buildPayload(overrides = {}) {
    return {
        context: {
            searched: true,
            query: 'ENV-001',
            support,
            shipments: [buildShipment()],
            ...overrides.context,
        },
        state: {
            ...overrides.state,
        },
        input: {
            type: 'message',
            text: '',
            ...overrides.input,
        },
    };
}

describe('chatbotService', () => {
    test('init selecciona automaticamente el unico envio y devuelve contexto util', () => {
        const response = handleChatbotRequest(buildPayload({
            input: {
                type: 'init',
            },
            state: {},
        }));

        expect(response.state.selectedShipmentId).toBe('1');
        expect(response.messages[0].text).toContain('Hola. Te ayudo a seguir tu envio');
        expect(response.messages[1].text).toContain('Ya tengo este envio como referencia.');
        expect(response.effects).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'focus-shipment', shipmentId: '1', scroll: false }),
            ])
        );
    });

    test('mensaje de ETA responde desde backend usando el envio seleccionado', () => {
        const response = handleChatbotRequest(buildPayload({
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'cuando llega mi pedido',
            },
        }));

        expect(response.messages[0].text).toContain('la entrega esta prevista para 15 de junio de 2025 entre 09:00 a 18:00');
        expect(response.effects).toHaveLength(0);
    });

    test('lookup repetido evita resubmit cuando la pagina ya tiene esos resultados', () => {
        const response = handleChatbotRequest(buildPayload({
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'ENV001',
            },
        }));

        expect(response.messages[0].text).toContain('Esa busqueda ya esta cargada en la pagina');
        expect(response.messages[0].actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ action: 'go-results' }),
            ])
        );
        expect(response.effects).toHaveLength(0);
    });

    test('si hay multiples envios y no hay seleccion, pide elegir antes de mostrar estado', () => {
        const response = handleChatbotRequest(buildPayload({
            context: {
                query: '12345678',
                searchType: 'dni',
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
        }));

        expect(response.state.pendingAction).toBe('show-status');
        expect(response.messages[0].text).toContain('Elegi cual queres revisar para ver el estado actual');
        expect(response.messages[0].actions).toHaveLength(2);
    });

    test('al seleccionar un envio con accion pendiente, responde seleccion y follow-up', () => {
        const response = handleChatbotRequest(buildPayload({
            context: {
                query: '12345678',
                searchType: 'dni',
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
        }));

        expect(response.state.selectedShipmentId).toBe('2');
        expect(response.state.pendingAction).toBeNull();
        expect(response.messages[0].text).toContain('Ya tengo ENV-002 como referencia.');
        expect(response.messages[1].text).toContain('ENV-002 ya fue entregado.');
        expect(response.effects).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'focus-shipment', shipmentId: '2', scroll: true }),
            ])
        );
    });

    test('entiende un pedido formal de estado', () => {
        const response = handleChatbotRequest(buildPayload({
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'quiero conocer el estado',
            },
        }));

        expect(response.messages[0].text).toContain('ENV-001 esta en camino.');
    });

    test('entiende follow-up corto para historial', () => {
        const response = handleChatbotRequest(buildPayload({
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'y su historia?',
            },
        }));

        expect(response.messages[0].text).toContain('Este es el historial visible de ENV-001.');
    });

    test('buscar otro envio limpia el envio activo y pasa a modo busqueda', () => {
        const response = handleChatbotRequest(buildPayload({
            context: {
                shipments: [buildShipment({ status: 'Entregado', statusKey: 'entregado' })],
            },
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'quiero buscar otro envio',
            },
        }));

        expect(response.state.selectedShipmentId).toBeNull();
        expect(response.messages[0].text).toContain('Pasame el tracking o el DNI que queres buscar');
    });

    test('si escriben solo otro y hay contexto activo, interpreta cambio de envio', () => {
        const response = handleChatbotRequest(buildPayload({
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'otro',
            },
        }));

        expect(response.state.selectedShipmentId).toBeNull();
        expect(response.messages[0].text).toContain('Pasame el tracking o el DNI que queres buscar');
    });

    test('entiende agradecimiento corto y responde sin caer en fallback', () => {
        const response = handleChatbotRequest(buildPayload({
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'ok gracias',
            },
        }));

        expect(response.messages[0].text).toContain('Perfecto. Si queres, sigo con ENV-001 o buscamos otro envio.');
    });

    test('tolera lenguaje coloquial y typos para ubicacion', () => {
        const response = handleChatbotRequest(buildPayload({
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'dnd anda mi enviiio',
            },
        }));

        expect(response.messages[0].text).toContain('Ultima referencia: Sucursal Centro.');
    });

    test('si la consulta es ambigua, pide elegir entre dos caminos concretos', () => {
        const response = handleChatbotRequest(buildPayload({
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'donde esta o cuando llega',
            },
        }));

        expect(response.messages[0].text).toContain('Te entendi a medias.');
        expect(response.messages[0].actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ action: 'show-location' }),
                expect.objectContaining({ action: 'show-eta' }),
            ])
        );
    });

    test('prioriza entrega no reconocida cuando el envio entregado sigue activo', () => {
        const response = handleChatbotRequest(buildPayload({
            context: {
                shipments: [buildShipment({
                    status: 'Entregado',
                    statusKey: 'entregado',
                    lastMovementDateLabel: '03 de may de 2026',
                })],
            },
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'me figura entregado pero no lo tengo',
            },
        }));

        expect(response.messages[0].text).toContain('ya figura entregado');
        expect(response.messages[0].actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ action: 'show-support' }),
            ])
        );
    });

    test('entiende retiro con lenguaje natural cuando el envio esta en sucursal', () => {
        const response = handleChatbotRequest(buildPayload({
            context: {
                shipments: [buildShipment({
                    status: 'En Sucursal',
                    statusKey: 'en_sucursal',
                    currentBranchName: 'Sucursal Rosario Centro',
                })],
            },
            state: {
                selectedShipmentId: '1',
            },
            input: {
                type: 'message',
                text: 'lo puedo pasar a buscar yo?',
            },
        }));

        expect(response.messages[0].text).toContain('La ultima referencia visible es Sucursal Rosario Centro.');
        expect(response.messages[0].actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ action: 'show-support' }),
            ])
        );
    });
});
