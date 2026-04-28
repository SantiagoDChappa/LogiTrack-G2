const request = require('supertest');
const express = require('express');

// Mocks manuales ANTES de requerir las rutas
jest.mock('../src/models/shipment');
jest.mock('../src/models/person');
jest.mock('../src/models/province');
jest.mock('../src/models/address');
jest.mock('../src/models/status');
jest.mock('../src/models/shipmentHistory');
jest.mock('../src/models/typeShipment');
jest.mock('../src/models/setting');
jest.mock('../src/models/user');
jest.mock('../src/utils/notifications');

const shipmentRoutes = require('../src/routes/shipment');

const path = require('path');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'src', 'views'));

app.use((req, res, next) => {
    res.locals.currentUser = { id: 1, roleId: 2, fullName: 'Test User' }; 
    next();
});

app.use('/shipment', shipmentRoutes);

describe('Shipment Controller - Validations', () => {
    test('POST /shipment/new con datos inválidos debe retornar errores', async () => {
        const provinceModel = require('../src/models/province');
        const typeShipmentModel = require('../src/models/typeShipment');
        provinceModel.getAll.mockResolvedValue([]);
        typeShipmentModel.getAll.mockResolvedValue([]);

        const response = await request(app)
            .post('/shipment/new')
            .send({
                senderName: '',
                senderEmail: 'not-an-email',
                number: 'not-a-number'
            });

        expect(response.status).toBe(200);
        expect(response.text).toContain('El nombre del remitente es obligatorio');
        expect(response.text).toContain('Email del remitente inválido');
    });

    test('POST /shipment/new con peso negativo debe ser rechazado', async () => {
        const provinceModel = require('../src/models/province');
        const typeShipmentModel = require('../src/models/typeShipment');
        provinceModel.getAll.mockResolvedValue([]);
        typeShipmentModel.getAll.mockResolvedValue([]);

        const response = await request(app)
            .post('/shipment/new')
            .send({
                senderName: 'Santi',
                senderEmail: 'santi@gmail.com',
                senderPhone: '12345678',
                senderDocument: '38123456',
                recipientName: 'Luca',
                recipientEmail: 'luca@gmail.com',
                recipientPhone: '87654321',
                recipientDocument: '40123456',
                street: 'Falsa 123',
                number: 123,
                province: 1,
                postalCode: '1663',
                weightKg: -5,
                packageQty: 1
            });

        expect(response.text).toContain('El peso debe ser mayor a 0');
    });
});
