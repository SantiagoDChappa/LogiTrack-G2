const request = require('supertest');
const app = require('../app');
const sequelize = require('../src/database/connection');

describe('Shipment API Integration', () => {
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
