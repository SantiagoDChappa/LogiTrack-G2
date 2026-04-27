const request = require('supertest');
const app = require('../app');
const sequelize = require('../src/database/connection');

// Mock auth middleware
jest.mock('../src/middlewares/auth', () => ({
    requireAuth: (req, res, next) => {
        res.locals.currentUser = { id: 1, roleId: 1, fullName: 'Admin User' };
        next();
    },
    requireSupervisor: (req, res, next) => next(),
    requireOperator: (req, res, next) => next(),
    requireDelivery: (req, res, next) => next()
}));

describe('Shipment API Integration', () => {
    beforeAll(async () => {
        await sequelize.sync({ force: true });
        const { Status, Province, TypeShipment } = require('../src/models/index');
        
        await Status.bulkCreate([
            { id: 1, description: 'Pendiente' },
            { id: 2, description: 'En Tránsito' },
            { id: 3, description: 'Entregado' }
        ]);
        await Province.bulkCreate([
            { id: 1, description: 'Buenos Aires' },
            { id: 2, description: 'Santa Fe' }
        ]);
        await TypeShipment.bulkCreate([
            { id: 1, description: 'Estándar' },
            { id: 2, description: 'Express' }
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
