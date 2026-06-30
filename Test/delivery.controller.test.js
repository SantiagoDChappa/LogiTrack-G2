// tests/controllers/deliveryController.test.js
const { Status } = require('../src/constants/enums');

jest.mock('../src/models', () => ({
    DeliveryEvidence: {
        create: jest.fn()
    },
    Shipment: {
        findOne: jest.fn(),
        update: jest.fn()
    }
}));

jest.mock('../src/services/shipmentStateMachine', () => ({
    canTransition: jest.fn()
}));

jest.mock('../src/models/shipmentHistory', () => ({
    create: jest.fn()
}));

jest.mock('../src/models/shipment', () => ({
    updateStatus: jest.fn()
}));

jest.mock('../src/models/failedAttempt', () => ({
    create: jest.fn()
}));

jest.mock('../src/utils/failedAttempt', () => ({
    getSuggestedDate: jest.fn()
}));

const {
    DeliveryEvidence,
    Shipment
} = require('../src/models');

const stateMachine = require('../src/services/shipmentStateMachine');
const shipmentHistoryModel = require('../src/models/shipmentHistory');
const ShipmentModel = require('../src/models/shipment');
const failedAttemptModel = require('../src/models/failedAttempt');
const { getSuggestedDate } = require('../src/utils/failedAttempt');

const {
    showActionScreen,
    showEvidenceForm,
    saveEvidence,
    showFailedForm,
    saveFailedAttempt
} = require('../src/controllers/delivery');

describe('deliveryController', () => {

    let req;
    let res;

    beforeEach(() => {

        jest.clearAllMocks();

        req = {
            params: {
                id: 'TRACK123'
            },
            body: {}
        };

        res = {
            render: jest.fn(),
            redirect: jest.fn(),
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
            locals: {
                currentUser: {
                    id: 10,
                    roleId: 2
                }
            }
        };
    });

    describe('showFailedForm', () => {

        test('deberia renderizar el formulario si el envio existe', async () => {

            Shipment.findOne.mockResolvedValue({
                id: 1,
                trackingId: 'TRACK123'
            });

            await showFailedForm(req, res);

            expect(Shipment.findOne).toHaveBeenCalledWith({
                where: { trackingId: 'TRACK123' }
            });

            expect(res.render).toHaveBeenCalledWith(
                'delivery/failed',
                { trackingCode: 'TRACK123' }
            );
        });

        test('deberia devolver 404 si el envio no existe', async () => {

            Shipment.findOne.mockResolvedValue(null);

            await showFailedForm(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('Envío no encontrado');
        });
    });

    describe('saveFailedAttempt', () => {

        test('deberia guardar intento fallido y actualizar estado', async () => {

            Shipment.findOne.mockResolvedValue({
                id: 1,
                trackingId: 'TRACK123',
                statusId: 1
            });

            getSuggestedDate.mockReturnValue('2026-05-20');

            req.body = {
                reason: 'Cliente ausente',
                observation: 'No respondió',
                latitude: '-34.5',
                longitude: '-58.7',
                photoBase64: 'base64photo'
            };

            await saveFailedAttempt(req, res);

            expect(failedAttemptModel.create).toHaveBeenCalled();

            expect(shipmentHistoryModel.create).toHaveBeenCalledWith({
                shipmentId: 1,
                fromStatusId: 1,
                toStatusId: Status.FAILED_ATTEMPT.id,
                comment: 'Intento fallido: Cliente ausente',
                userId: 10,
                eventType: 'STATUS_CHANGE'
            });

            expect(Shipment.update).toHaveBeenCalledWith(
                { statusId: Status.FAILED_ATTEMPT.id },
                { where: { id: 1 } }
            );

            expect(res.redirect).toHaveBeenCalledWith(
                '/delivery?failed=true'
            );
        });

        test('deberia devolver 404 si el envio no existe', async () => {

            Shipment.findOne.mockResolvedValue(null);

            await saveFailedAttempt(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('Envío no encontrado');
        });
    });

    describe('showEvidenceForm', () => {

        test('deberia renderizar formulario de evidencia', async () => {

            Shipment.findOne.mockResolvedValue({
                id: 1,
                trackingId: 'TRACK123'
            });

            await showEvidenceForm(req, res);

            expect(res.render).toHaveBeenCalledWith(
                'delivery/evidence',
                {
                    shipmentId: 'TRACK123',
                    errors: {}
                }
            );
        });

        test('deberia devolver 404 si no existe el envio', async () => {

            Shipment.findOne.mockResolvedValue(null);

            await showEvidenceForm(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('Envío no encontrado');
        });
    });

    describe('saveEvidence', () => {

        beforeEach(() => {

            req.body = {
                receiverName: 'Juan',
                receiverLastname: 'Perez',
                receiverDni: '12345678',
                latitude: '-34.6',
                longitude: '-58.4',
                photoBase64: 'photo',
                signatureBase64: 'signature'
            };
        });

        test('deberia guardar evidencia y confirmar entrega', async () => {

            Shipment.findOne.mockResolvedValue({
                id: 1,
                trackingId: 'TRACK123',
                statusId: 2
            });

            stateMachine.canTransition.mockReturnValue(true);

            await saveEvidence(req, res);

            expect(DeliveryEvidence.create).toHaveBeenCalled();

            expect(ShipmentModel.updateStatus)
                .toHaveBeenCalledWith(1, 4);

            expect(shipmentHistoryModel.create)
                .toHaveBeenCalled();

            expect(res.redirect).toHaveBeenCalledWith(
                '/delivery?delivered=true'
            );
        });

        test('deberia renderizar error si no hay ubicacion', async () => {

            Shipment.findOne.mockResolvedValue({
                id: 1,
                trackingId: 'TRACK123',
                statusId: 2
            });

            req.body.latitude = '';
            req.body.longitude = '';

            await saveEvidence(req, res);

            expect(res.render).toHaveBeenCalledWith(
                'delivery/evidence',
                {
                    shipmentId: 'TRACK123',
                    errors: {
                        ubication:
                            'La ubicación es requerida para confirmar la entrega.'
                    }
                }
            );
        });

        test('deberia renderizar error si no hay firma', async () => {

            Shipment.findOne.mockResolvedValue({
                id: 1,
                trackingId: 'TRACK123',
                statusId: 2
            });

            req.body.signatureBase64 = '';

            await saveEvidence(req, res);

            expect(res.render).toHaveBeenCalledWith(
                'delivery/evidence',
                {
                    shipmentId: 'TRACK123',
                    errors: {
                        signature:
                            'La firma es requerida para confirmar la entrega.'
                    }
                }
            );
        });

        test('deberia devolver 422 si la transicion no es valida', async () => {

            Shipment.findOne.mockResolvedValue({
                id: 1,
                trackingId: 'TRACK123',
                statusId: 2
            });

            stateMachine.canTransition.mockReturnValue(false);

            await saveEvidence(req, res);

            expect(res.status).toHaveBeenCalledWith(422);

            expect(res.send).toHaveBeenCalledWith(
                'No se puede confirmar entrega desde el estado actual.'
            );
        });

        test('deberia devolver 404 si el envio no existe', async () => {

            Shipment.findOne.mockResolvedValue(null);

            await saveEvidence(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

            expect(res.send).toHaveBeenCalledWith(
                'Envío no encontrado'
            );
        });
    });

    describe('showActionScreen', () => {

        test('deberia renderizar pantalla de acciones', async () => {

            Shipment.findOne.mockResolvedValue({
                id: 1,
                trackingId: 'TRACK123'
            });

            await showActionScreen(req, res);

            expect(res.render).toHaveBeenCalledWith(
                'delivery/action',
                { trackingCode: 'TRACK123' }
            );
        });

        test('deberia devolver 404 si el envio no existe', async () => {

            Shipment.findOne.mockResolvedValue(null);

            await showActionScreen(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

            expect(res.send).toHaveBeenCalledWith(
                'Envío no encontrado'
            );
        });
    });
});