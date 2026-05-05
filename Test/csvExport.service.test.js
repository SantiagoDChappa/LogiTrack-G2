const { buildShipmentsCsv, COLUMNS } = require('../src/services/csvExport');

const makeShipment = (overrides = {}) => ({
    trackingId: 'ENV-001',
    createdAt:  new Date('2026-04-01T12:00:00Z'),
    weightKg:   2.5,
    packageQty: 1,
    shipmentTypeId: 1,
    deliveryUserId: null,
    sender: {
        fullName: 'Juan Perez',
        document: 12345678,
        phone:    '1123456789',
        email:    'juan@example.com',
    },
    recipient: {
        fullName: 'Maria Garcia',
        document: 87654321,
        phone:    '1198765432',
        email:    'maria@example.com',
    },
    address: {
        street:         'Av. Corrientes',
        number:         1234,
        floorApartment: '3 B',
        postalCode:     'C1043',
        lat:            -34.6,
        lng:            -58.4,
        province:       { description: 'Ciudad Autónoma de Buenos Aires' },
    },
    status: { description: 'Entregado' },
    ...overrides,
});

describe('csvExport.buildShipmentsCsv', () => {
    test('genera header con todas las columnas esperadas', () => {
        const csv = buildShipmentsCsv([]);
        expect(csv).toBe(COLUMNS.join(','));
        expect(COLUMNS).toContain('trackingId');
        expect(COLUMNS).toContain('status');
        expect(COLUMNS).toContain('senderName');
        expect(COLUMNS).toContain('recipientName');
        expect(COLUMNS).toContain('province');
        expect(COLUMNS).toContain('lat');
    });

    test('serializa un envío completo', () => {
        const csv = buildShipmentsCsv([makeShipment()]);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[1]).toContain('ENV-001');
        expect(lines[1]).toContain('Entregado');
        expect(lines[1]).toContain('2026-04-01');
        expect(lines[1]).toContain('Juan Perez');
        expect(lines[1]).toContain('Maria Garcia');
    });

    test('escapa comas y comillas en datos de texto', () => {
        const s = makeShipment({
            sender: { fullName: 'Apellido, Nombre', document: 12345678, phone: '', email: '' },
        });
        const csv = buildShipmentsCsv([s]);
        expect(csv).toContain('"Apellido, Nombre"');
    });

    test('valores nulos o ausentes quedan como string vacío', () => {
        const s = makeShipment({
            deliveryUserId: null,
            address: {
                street: 'X', number: 1, floorApartment: null, postalCode: null,
                lat: null, lng: null, province: null,
            },
        });
        const csv = buildShipmentsCsv([s]);
        const cells = csv.split('\n')[1].split(',');
        // deliveryUserId es la última columna
        expect(cells[cells.length - 1]).toBe('');
    });

    test('no incluye estados activos como filtro implícito (exporta cualquier estado)', () => {
        const pendiente = makeShipment({
            trackingId: 'ENV-002',
            status: { description: 'Pendiente' },
        });
        const enTransito = makeShipment({
            trackingId: 'ENV-003',
            status: { description: 'En Transito' },
        });
        const csv = buildShipmentsCsv([pendiente, enTransito]);
        expect(csv).toContain('ENV-002');
        expect(csv).toContain('Pendiente');
        expect(csv).toContain('ENV-003');
        expect(csv).toContain('En Transito');
    });

    test('lista vacía devuelve solo el header', () => {
        const csv = buildShipmentsCsv([]);
        expect(csv).not.toContain('\n');
    });
});
