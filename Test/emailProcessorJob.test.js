jest.mock('../src/models/notificationEmail', () => ({
    findPending: jest.fn(),
    markAsSent: jest.fn(),
    scheduleRetry: jest.fn(),
}));

jest.mock('../src/services/notification/emailSender', () => ({
    sendEmail: jest.fn(),
}));

const NotificationEmail = require('../src/models/notificationEmail');
const emailSender = require('../src/services/notification/emailSender');
const { processPendingEmails } = require('../src/jobs/emailProcessorJob');

describe('jobs/emailProcessorJob', () => {
    let errorSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    test('marks the email as sent only after a successful delivery', async () => {
        NotificationEmail.findPending.mockResolvedValue([
            { id: 15, attempts: 2, recipient: 'ok@example.com', subject: 'Hola', body: 'Mundo' },
        ]);
        emailSender.sendEmail.mockResolvedValue({ messageId: 'sent-1' });

        await processPendingEmails();

        expect(emailSender.sendEmail).toHaveBeenCalledWith('ok@example.com', 'Hola', 'Mundo');
        expect(NotificationEmail.markAsSent).toHaveBeenCalledWith(15);
        expect(NotificationEmail.scheduleRetry).not.toHaveBeenCalled();
    });

    test('schedules a retry and does not mark as sent when delivery fails', async () => {
        NotificationEmail.findPending.mockResolvedValue([
            { id: 16, attempts: 2, recipient: 'fail@example.com', subject: 'Hola', body: 'Mundo' },
        ]);
        emailSender.sendEmail.mockRejectedValue(new Error('Missing credentials for "PLAIN"'));

        await processPendingEmails();

        expect(NotificationEmail.markAsSent).not.toHaveBeenCalled();
        expect(NotificationEmail.scheduleRetry).toHaveBeenCalledWith(
            16,
            2,
            'Missing credentials for "PLAIN"'
        );
    });
});
