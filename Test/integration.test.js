const request = require('supertest');
const app = require('../app');
const sequelize = require('../src/database/connection');

// Mock auth middleware
jest.mock('../src/middlewares/auth', () => ({
    requireAuth: (req, res, next) => {
        res.locals.currentUser = { id: 1, roleId: 1 };
        next();
    },
    requireSupervisor: (req, res, next) => next(),
    requireOperator: (req, res, next) => next(),
    requireDelivery: (req, res, next) => next()
}));

describe('Shipment API Integration', () => {
    beforeAll(async () => {
        await sequelize.sync({ force: true });
        // Seed basic data for status, provinces, types
        const { Status } = require('../src/models/status');
        await Status.bulkCreate([
            { id: 1, description: 'Pendiente' },
            { id: 2, description: 'En Tránsito' }
        ]);
    });

    afterAll(async () => {
        await sequelize.close();
    });

    test('GET /shipment should return 200', async () => {
        const res = await request(app).get('/shipment');
        expect(res.statusCode).toBe(200);
    });

    test('GET /shipment/new should return 200', async () => {
        const res = await request(app).get('/shipment/new');
        expect(res.statusCode).toBe(200);
    });
});
