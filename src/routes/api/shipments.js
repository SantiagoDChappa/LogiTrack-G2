'use strict';

const express  = require('express');
const router   = express.Router();
const shipmentModel = require('../../models/shipment');
const personModel   = require('../../models/person');
const addressModel  = require('../../models/address');

/**
 * @swagger
 * tags:
 *   name: API Envíos
 *   description: CRUD de envíos y cambio de estados (devuelve JSON)
 */

/**
 * @swagger
 * /api/shipments:
 *   get:
 *     summary: Lista todos los envíos
 *     tags: [API Envíos]
 *     responses:
 *       200:
 *         description: Array de envíos con remitente, destinatario, dirección y estado
 *         content:
 *           application/json:
 *             example:
 *               - id: 1
 *                 trackingId: "ENV-001"
 *                 status: { id: 1, description: "Pendiente" }
 *                 sender: { id: 1, fullName: "Juan Pérez", document: 12345678 }
 *                 recipient: { id: 2, fullName: "Ana López", document: 87654321 }
 *                 address: { street: "San Martín", number: 100, province: { description: "Córdoba" } }
 */
router.get('/', async (req, res) => {
    try {
        const shipments = await shipmentModel.getAll();
        res.json(shipments);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener los envíos: ' + err.message });
    }
});

/**
 * @swagger
 * /api/shipments/{id}:
 *   get:
 *     summary: Obtiene un envío por ID
 *     tags: [API Envíos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Datos del envío
 *       404:
 *         description: Envío no encontrado
 */
router.get('/:id', async (req, res) => {
    try {
        const shipment = await shipmentModel.getById(req.params.id);
        if (!shipment) {return res.status(404).json({ error: 'Envío no encontrado' });}
        res.json(shipment);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener los envíos: ' + err.message });
    }
});

/**
 * @swagger
 * /api/shipments:
 *   post:
 *     summary: Crea un nuevo envío
 *     tags: [API Envíos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [senderName, senderDocument, recipientName, recipientDocument, street, number, provinceId]
 *             properties:
 *               senderName:
 *                 type: string
 *                 example: "Juan Pérez"
 *               senderDocument:
 *                 type: integer
 *                 example: 12345678
 *               senderPhone:
 *                 type: string
 *                 example: "3514000000"
 *               senderEmail:
 *                 type: string
 *                 example: "juan@mail.com"
 *               recipientName:
 *                 type: string
 *                 example: "Ana López"
 *               recipientDocument:
 *                 type: integer
 *                 example: 87654321
 *               recipientPhone:
 *                 type: string
 *                 example: "1140000000"
 *               recipientEmail:
 *                 type: string
 *                 example: "ana@mail.com"
 *               street:
 *                 type: string
 *                 example: "San Martín"
 *               number:
 *                 type: integer
 *                 example: 100
 *               provinceId:
 *                 type: integer
 *                 example: 5
 *               postalCode:
 *                 type: string
 *                 example: "5000"
 *               floorApartment:
 *                 type: string
 *                 example: "3° B"
 *     responses:
 *       201:
 *         description: Envío creado
 *       500:
 *         description: Error interno
 */
router.post('/', async (req, res) => {
    try {
        const { senderName, senderDocument, senderPhone, senderEmail,
                recipientName, recipientDocument, recipientPhone, recipientEmail,
                street, number, provinceId, postalCode, floorApartment } = req.body;

        const sender    = await personModel.create({ name: senderName,    document: senderDocument,    phone: senderPhone,    email: senderEmail,    personTypeId: 1 });
        const recipient = await personModel.create({ name: recipientName, document: recipientDocument, phone: recipientPhone, email: recipientEmail, personTypeId: 2 });
        const address   = await addressModel.create({ street, number, provinceId, postalCode, floorApartment });

        const shipment  = await shipmentModel.create({
            senderId:    sender.id,
            recipientId: recipient.id,
            addressId:   address.id,
        });

        res.status(201).json(shipment);
    } catch (err) {
        res.status(500).json({ error: 'Error al crear el envío: ' + err.message });
    }
});

// PATCH /api/shipments/:id/status fue eliminado en LGT-109.
// Los cambios de estado deben hacerse via endpoints semanticos (ver /shipment y /scan)
// que pasan por src/services/shipmentStateMachine.js (valida transicion + RBAC + historial).

module.exports = router;
