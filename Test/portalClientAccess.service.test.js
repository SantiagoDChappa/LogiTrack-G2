jest.mock('../src/models/shipment', () => ({
    countByClientIdentity: jest.fn(),
    findByClientIdentity: jest.fn(),
    getById: jest.fn(),
    TERMINAL_STATUS_IDS: [4, 5],
}));

jest.mock('../src/models/portalClientAccessPending', () => ({
    create: jest.fn(),
    findByToken: jest.fn(),
    deleteByToken: jest.fn(),
    deleteByEmail: jest.fn(),
    deleteExpired: jest.fn(),
}));

jest.mock('../src/services/notification/emailSender', () => ({
    sendEmail: jest.fn(),
}));

const shipmentModel = require('../src/models/shipment');
const portalClientAccessPendingModel = require('../src/models/portalClientAccessPending');
const { sendEmail } = require('../src/services/notification/emailSender');
const portalClientAccess = require('../src/services/portalClientAccess');

beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    portalClientAccessPendingModel.deleteExpired.mockResolvedValue(0);
    portalClientAccessPendingModel.deleteByEmail.mockResolvedValue(0);
    sendEmail.mockResolvedValue(true);
});

describe('validateClientCredentials()', () => {
    test('rechaza DNI inválido', async () => {
        const result = await portalClientAccess.validateClientCredentials('abc', 'a@b.com');
        expect(result.ok).toBe(false);
        expect(result.code).toBe('invalid_document');
    });

    test('rechaza email vacío', async () => {
        const result = await portalClientAccess.validateClientCredentials('12345678', '');
        expect(result.ok).toBe(false);
        expect(result.code).toBe('invalid_email');
    });

    test('rechaza cuando no hay envíos vinculados', async () => {
        shipmentModel.countByClientIdentity.mockResolvedValueOnce(0);
        const result = await portalClientAccess.validateClientCredentials('12345678', 'cliente@test.com');
        expect(result.ok).toBe(false);
        expect(result.code).toBe('no_shipments');
    });

    test('acepta DNI + email con envíos asociados', async () => {
        shipmentModel.countByClientIdentity.mockResolvedValueOnce(2);
        const result = await portalClientAccess.validateClientCredentials('12345678', 'Cliente@Test.com');
        expect(result.ok).toBe(true);
        expect(result.document).toBe(12345678);
        expect(result.email).toBe('cliente@test.com');
    });
});

describe('assertClientOwnsShipment()', () => {
    test('permite acceso como destinatario', () => {
        const shipment = {
            sender: { document: 111, email: 'otro@test.com' },
            recipient: { document: 222, email: 'yo@test.com' },
        };
        expect(portalClientAccess.assertClientOwnsShipment(shipment, { document: 222, email: 'yo@test.com' })).toBe(true);
    });

    test('permite acceso como remitente', () => {
        const shipment = {
            sender: { document: 111, email: 'yo@test.com' },
            recipient: { document: 222, email: 'otro@test.com' },
        };
        expect(portalClientAccess.assertClientOwnsShipment(shipment, { document: 111, email: 'yo@test.com' })).toBe(true);
    });

    test('deniega envío de tercero', () => {
        const shipment = {
            sender: { document: 111, email: 'a@test.com' },
            recipient: { document: 222, email: 'b@test.com' },
        };
        expect(portalClientAccess.assertClientOwnsShipment(shipment, { document: 333, email: 'c@test.com' })).toBe(false);
    });
});

describe('requestAccess()', () => {
    test('crea pending con código de 6 dígitos y envía email', async () => {
        shipmentModel.countByClientIdentity.mockResolvedValueOnce(1);
        portalClientAccessPendingModel.findByToken.mockResolvedValue(null); // código único
        portalClientAccessPendingModel.create.mockResolvedValueOnce({});

        const result = await portalClientAccess.requestAccess({
            document: '12345678',
            email: 'cliente@test.com',
        });

        expect(result.ok).toBe(true);
        // El token guardado es un código numérico de 6 dígitos.
        const createArg = portalClientAccessPendingModel.create.mock.calls[0][0];
        expect(createArg.token).toMatch(/^\d{6}$/);
        // El email incluye el código (mismo valor que el pending).
        expect(sendEmail).toHaveBeenCalledWith(
            'cliente@test.com',
            expect.stringContaining('LogiTrack'),
            expect.stringContaining(createArg.token),
            expect.any(String)
        );
    });
});

describe('confirmAccess()', () => {
    test('rechaza código vacío', async () => {
        const result = await portalClientAccess.confirmAccess('');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });

    test('rechaza código con formato inválido (no 6 dígitos)', async () => {
        const result = await portalClientAccess.confirmAccess('abc');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });

    test('rechaza código inexistente', async () => {
        portalClientAccessPendingModel.findByToken.mockResolvedValueOnce(null);
        const result = await portalClientAccess.confirmAccess('654321');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(404);
    });

    test('rechaza código que no corresponde al email', async () => {
        portalClientAccessPendingModel.findByToken.mockResolvedValueOnce({
            token: '123456',
            document: 123,
            email: 'otro@b.com',
            expiresAt: new Date(Date.now() + 3600000),
        });
        const result = await portalClientAccess.confirmAccess('123456', 'cliente@test.com');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(404);
    });

    test('rechaza código expirado con mensaje de código', async () => {
        portalClientAccessPendingModel.findByToken.mockResolvedValueOnce({
            token: '111111',
            document: 123,
            email: 'a@b.com',
            expiresAt: new Date(Date.now() - 1000),
        });
        const result = await portalClientAccess.confirmAccess('111111');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(410);
        expect(result.message).toMatch(/código/i);
        expect(portalClientAccessPendingModel.deleteByToken).toHaveBeenCalledWith('111111');
    });

    test('confirma código válido y emite sesión', async () => {
        portalClientAccessPendingModel.findByToken.mockResolvedValueOnce({
            token: '222222',
            document: 12345678,
            email: 'cliente@test.com',
            expiresAt: new Date(Date.now() + 3600000),
        });
        shipmentModel.countByClientIdentity.mockResolvedValueOnce(1);

        const result = await portalClientAccess.confirmAccess('222222', 'cliente@test.com');
        expect(result.ok).toBe(true);
        expect(result.sessionToken).toBeTruthy();
        expect(portalClientAccessPendingModel.deleteByToken).toHaveBeenCalledWith('222222');

        const client = portalClientAccess.verifyPortalClientSession(result.sessionToken);
        expect(client.document).toBe(12345678);
        expect(client.email).toBe('cliente@test.com');
    });
});

describe('splitActiveHistorical()', () => {
    test('separa activos e históricos', () => {
        const shipments = [
            { id: 1, statusId: 2 },
            { id: 2, statusId: 4 },
            { id: 3, statusId: 5 },
        ];
        const { active, historical } = portalClientAccess.splitActiveHistorical(shipments);
        expect(active).toHaveLength(1);
        expect(historical).toHaveLength(2);
    });
});
