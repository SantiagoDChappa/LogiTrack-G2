const request = require('supertest');
const app = require('../app');
const sequelize = require('../src/database/connection');

// Mock auth para que todo pase
jest.mock('../src/middlewares/auth', () => ({
    requireAuth: (req, res, next) => {
        res.locals.currentUser = { id: 1, roleId: 1, fullName: 'Admin User' };
        next();
    },
    requireSupervisor: (req, res, next) => next(),
    requireOperator: (req, res, next) => next(),
    requireDelivery: (req, res, next) => next()
}));

describe('Extra Coverage Tests', () => {
    beforeAll(async () => {
        await sequelize.sync({ force: true });
        const { Status, Province, TypeShipment } = require('../src/models/index');
        await Status.bulkCreate([{ id: 1, description: 'Pendiente' }]);
        await Province.bulkCreate([{ id: 1, description: 'BSAS' }]);
        await TypeShipment.bulkCreate([{ id: 1, description: 'Est' }]);
    });

    test('GET /home should return 200', async () => {
        const res = await request(app).get('/home');
        expect(res.status).toBe(200);
    });

    test('GET /user should return 200', async () => {
        const res = await request(app).get('/user');
        expect(res.status).toBe(200);
    });

    test('GET /setting should return 200', async () => {
        const res = await request(app).get('/setting');
        expect(res.status).toBe(200);
    });

    test('GET /portal/tracking/:id should return 200', async () => {
        const res = await request(app).get('/portal/tracking/ENV-001');
        expect(res.status).toBe(200);
    });

    test('GET /api/ml-health should return 200', async () => {
        const res = await request(app).get('/api/ml-health');
        expect(res.status).toBe(200);
    });

    test('GET /delivery should return 200', async () => {
        const res = await request(app).get('/delivery');
        expect(res.status).toBe(200);
    });
});
