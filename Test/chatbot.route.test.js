const request = require('supertest');
const express = require('express');

const chatbotRoutes = require('../src/routes/chatbot');

describe('chatbot route', () => {
    test('POST /chatbot/message responde JSON del asistente', async () => {
        const app = express();
        app.use(express.json());
        app.use('/chatbot', chatbotRoutes);

        const response = await request(app)
            .post('/chatbot/message')
            .send({
                context: {
                    searched: false,
                    query: '',
                    support: {
                        email: 'soporte@logitrack.com',
                        hours: 'Lunes a viernes, 9 a 18 hs',
                    },
                    shipments: [],
                },
                state: {},
                input: {
                    type: 'message',
                    text: 'necesito soporte',
                },
            });

        expect(response.status).toBe(200);
        expect(response.body.messages[0].text).toContain('Si queres ayuda humana');
        expect(response.body.state).toEqual(
            expect.objectContaining({
                selectedShipmentId: null,
                pendingAction: null,
            })
        );
    });
});
