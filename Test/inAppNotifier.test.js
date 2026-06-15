// LGT-218 — servicio del centro de notificaciones in-app (lógica, con el modelo mockeado).
jest.mock('../src/models/notificationInApp', () => ({
    NotificationInApp: {
        create: jest.fn(),
        count: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
        destroy: jest.fn(),
    },
}));

const { NotificationInApp } = require('../src/models/notificationInApp');
const inApp = require('../src/services/notification/inAppNotifier');

beforeEach(() => jest.clearAllMocks());

describe('notify', () => {
    test('crea la notificación con título recortado y devuelve la fila', async () => {
        NotificationInApp.create.mockResolvedValue({ id: 7 });
        const row = await inApp.notify({ userId: 3, event: 'X', title: 'Hola', url: '/incident/9' });
        expect(row).toEqual({ id: 7 });
        expect(NotificationInApp.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 3, title: 'Hola', url: '/incident/9', readAt: null }));
    });

    test('sin userId o sin título → no crea y devuelve null', async () => {
        expect(await inApp.notify({ title: 'sin user' })).toBeNull();
        expect(await inApp.notify({ userId: 1 })).toBeNull();
        expect(NotificationInApp.create).not.toHaveBeenCalled();
    });

    test('si el create falla, no propaga (fire-and-forget)', async () => {
        NotificationInApp.create.mockRejectedValue(new Error('db down'));
        await expect(inApp.notify({ userId: 1, title: 'x' })).resolves.toBeNull();
    });
});

describe('notifyMany', () => {
    test('deduplica destinatarios y cuenta las creadas', async () => {
        NotificationInApp.create.mockResolvedValue({ id: 1 });
        const created = await inApp.notifyMany([5, 5, 6, null], { title: 'aviso' });
        expect(created).toBe(2);
        expect(NotificationInApp.create).toHaveBeenCalledTimes(2);
    });
});

describe('lectura y marcado (aislamiento por usuario)', () => {
    test('countUnread filtra por usuario y no leídas', async () => {
        NotificationInApp.count.mockResolvedValue(4);
        const n = await inApp.countUnread(8);
        expect(n).toBe(4);
        expect(NotificationInApp.count).toHaveBeenCalledWith({ where: { userId: 8, readAt: null } });
    });

    test('markRead solo afecta la fila del propio usuario', async () => {
        NotificationInApp.update.mockResolvedValue([1]);
        const affected = await inApp.markRead(8, 99);
        expect(affected).toBe(1);
        expect(NotificationInApp.update).toHaveBeenCalledWith(
            { readAt: expect.any(Date) },
            { where: { id: 99, userId: 8, readAt: null } }
        );
    });

    test('markAllRead marca todas las no leídas del usuario', async () => {
        NotificationInApp.update.mockResolvedValue([3]);
        const affected = await inApp.markAllRead(8);
        expect(affected).toBe(3);
        expect(NotificationInApp.update).toHaveBeenCalledWith(
            { readAt: expect.any(Date) },
            { where: { userId: 8, readAt: null } }
        );
    });
});
