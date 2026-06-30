jest.mock('nodemailer', () => ({
    createTransport: jest.fn(),
}));

jest.mock('../src/models/setting', () => ({
    get: jest.fn(),
}));

const nodemailer = require('nodemailer');
const settingModel = require('../src/models/setting');
const { sendEmail } = require('../src/services/notification/emailSender');

describe('notification/emailSender', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.EMAIL_USER;
        delete process.env.EMAIL_PASS;
        delete process.env.EMAIL_FROM;
        delete process.env.EMAIL_SERVICE;
        delete process.env.EMAIL_HOST;
        delete process.env.EMAIL_PORT;
        delete process.env.EMAIL_SECURE;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;
        delete process.env.SMTP_FROM;
        delete process.env.SMTP_SERVICE;
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_PORT;
        delete process.env.SMTP_SECURE;
        settingModel.get.mockResolvedValue('');
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('returns false when no mail credentials are configured', async () => {
        await expect(sendEmail('destino@example.com', 'Asunto', 'Cuerpo')).resolves.toBe(false);

        expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    test('can throw a clear error when requested and mail credentials are missing', async () => {
        await expect(
            sendEmail('destino@example.com', 'Asunto', 'Cuerpo', 'text', { throwOnConfigMissing: true })
        ).rejects.toMatchObject({
            code: 'EMAIL_CONFIG_MISSING',
        });

        expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    test('falls back to SMTP_* variables when EMAIL_* are missing', async () => {
        const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc123' });
        nodemailer.createTransport.mockReturnValue({ sendMail });

        process.env.SMTP_USER = 'smtp-user@example.com';
        process.env.SMTP_PASS = 'super-secret';
        process.env.SMTP_FROM = 'noreply@example.com';

        await sendEmail('destino@example.com', 'Asunto', 'Cuerpo');

        expect(nodemailer.createTransport).toHaveBeenCalledWith({
            service: 'gmail',
            auth: {
                user: 'smtp-user@example.com',
                pass: 'super-secret',
            },
        });
        expect(sendMail).toHaveBeenCalledWith({
            from: 'noreply@example.com',
            to: 'destino@example.com',
            subject: 'Asunto',
            text: 'Cuerpo',
        });
    });
});
