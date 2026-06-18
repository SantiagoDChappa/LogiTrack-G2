// LGT-219 — canales por evento: helpers de parseo/serialización + SMS con degradación.
jest.mock('../src/database/connection', () => ({ define: () => ({ belongsTo: () => {} }) }));

const cfg = require('../src/models/notificationConfig');
const { sendSms } = require('../src/services/notification/smsSender');

describe('parseChannels / serializeChannels', () => {
    test('parse filtra inválidos y respeta válidos', () => {
        expect(cfg.parseChannels('email,sms')).toEqual(['email', 'sms']);
        expect(cfg.parseChannels('email, in-app , garbage')).toEqual(['email', 'in-app']);
        expect(cfg.parseChannels('')).toEqual([]);
        expect(cfg.parseChannels(null)).toEqual([]);
    });

    test('serialize deduplica y descarta inválidos', () => {
        expect(cfg.serializeChannels(['email', 'email', 'sms'])).toBe('email,sms');
        expect(cfg.serializeChannels(['x', 'in-app'])).toBe('in-app');
        expect(cfg.serializeChannels([])).toBe('');
        expect(cfg.serializeChannels('no-array')).toBe('');
    });
});

describe('sendSms — degradación', () => {
    const OLD = process.env;
    beforeEach(() => { process.env = { ...OLD }; delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_FROM; });
    afterAll(() => { process.env = OLD; });

    test('sin teléfono → skip no_phone', async () => {
        expect(await sendSms(null, 'hola')).toEqual({ ok: false, skipped: 'no_phone' });
    });

    test('sin credenciales → skip no_credentials (no rompe)', async () => {
        const r = await sendSms('+5491111111111', 'hola');
        expect(r.ok).toBe(false);
        expect(r.skipped).toBe('no_credentials');
    });
});
