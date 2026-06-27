const { DeliveryEvidence, Shipment } = require('../models');
const stateMachine = require('../services/shipmentStateMachine');
const { Status, NotificationEvent } = require('../constants/enums');
const shipmentHistoryModel = require('../models/shipmentHistory');
const ShipmentModel = require('../models/shipment');
const sequelize = require('../database/connection');
const { RouteStop } = require('../models/routeStop');
const { RoutePause } = require('../models/routePause');


const { getSuggestedDate } = require('../utils/failedAttempt');
const failedAttemptModel = require('../models/failedAttempt');
const { autoCreateIncident } = require('../services/incidentAutoGen');
const { autoCloseForShipment } = require('../services/incidentAutoClose');

const showFailedForm = async (req, res) => {
    try {
        const trackingCode = req.params.id;
        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });
        if (!shipment) return res.status(404).send('Envío no encontrado');
        res.render('delivery/failed', { trackingCode });
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const saveFailedAttempt = async (req, res) => {
    try {
        const trackingCode = req.params.id;
        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });
        if (!shipment) return res.status(404).send('Envío no encontrado');

        // #4 Offline: idempotencia ante replay de la cola (no duplicar el intento fallido).
        const clientActionId = req.body.clientActionId || null;
        if (clientActionId && await require('../models/offlineSyncLog').exists(clientActionId)) {
            return res.redirect('/delivery?failed=true');
        }

        const { reason, observation, latitude, longitude, photoBase64 } = req.body;
        const suggestedDate = getSuggestedDate(reason);

        const settingModel = require('../models/setting');
        const settings = await settingModel.getAll();
        const maxIntentos = parseInt(settings.max_intentos_fallidos) || 3;

        // Bloque transaccional: registro de intento fallido + historial + cambio de estado
        // (y eventual cancelación por exceso) deben quedar todos o ninguno.
        await sequelize.transaction(async (t) => {
            await failedAttemptModel.create({
                shipmentId:    shipment.id,
                reason,
                observation:   observation || null,
                latitude:      latitude    || null,
                longitude:     longitude   || null,
                photoBase64:   photoBase64 || null,
                suggestedDate,
                status:        'pendiente'
            }, { transaction: t });

            const intentosPrevios = await failedAttemptModel.getByShipmentId(shipment.id, { transaction: t });
            const excede = intentosPrevios.length > maxIntentos;

            await shipmentHistoryModel.create({
                shipmentId:   shipment.id,
                fromStatusId: shipment.statusId,
                toStatusId:   Status.FAILED_ATTEMPT.id,
                comment:      `Intento fallido: ${reason}`,
                userId:       res.locals.currentUser?.id || null,
                eventType:    'STATUS_CHANGE',
                transaction:  t,
            });

            await Shipment.update(
                { statusId: Status.FAILED_ATTEMPT.id },
                { where: { id: shipment.id }, transaction: t }
            );

            if (excede) {
                await ShipmentModel.updateStatus(shipment.id, 5, { transaction: t });
                await shipmentHistoryModel.create({
                    shipmentId:   shipment.id,
                    fromStatusId: Status.FAILED_ATTEMPT.id,
                    toStatusId:   5,
                    comment:      `Envío cancelado automáticamente por superar ${maxIntentos} intentos fallidos`,
                    userId:       res.locals.currentUser?.id || null,
                    eventType:    'STATUS_CHANGE',
                    transaction:  t,
                });
                // Sync ruteo
                await RouteStop.update(
                    { completed: true, completedAt: new Date() },
                    { where: { shipmentId: shipment.id, stopType: 'delivery', completed: false }, transaction: t }
                );
            } else {
                // FAILED_ATTEMPT también cierra el stop de la ruta
                await RouteStop.update(
                    { completed: true, completedAt: new Date() },
                    { where: { shipmentId: shipment.id, stopType: 'delivery', completed: false }, transaction: t }
                );
            }

            // US-E02: generar incidencia automática por entrega fallida (dedup interno).
            await autoCreateIncident({
                shipmentId:  shipment.id,
                typeCode:    'DELIVERY_FAILED',
                description: `Intento de entrega fallido. Motivo: ${reason}.`
            }, t);
        });

        // "Llegada de entrega no completada": avisar SIEMPRE al cliente con el email
        // accionable (reprogramar / retiro en sucursal), respetando la config del evento.
        require('./shipment').notifyShipmentEvent(NotificationEvent.SHIPMENT_FAILED_ATTEMPT, shipment.id)
            .catch(e => console.error('[delivery] notif SHIPMENT_FAILED_ATTEMPT:', e.message));
        // Última Milla: la entrega de esta parada terminó (fallida) → cerrar el chat.
        require('../services/deliveryChat.service').close(shipment.id).catch(() => {});

        if (clientActionId) {
            require('../models/offlineSyncLog').create({ clientActionId, userId: res.locals.currentUser?.id || null, actionType: 'FAILED' }).catch(() => {});
        }

        res.redirect('/delivery?failed=true');

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const showEvidenceForm = async (req, res) => {
    try {
        const trackingCode = req.params.id;

        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });

        if (!shipment) {
            return res.status(404).send('Envío no encontrado');
        }

        // Sprint 3 - 4.1: si el envío tiene código clave configurado, lo pedimos en el POD
        const settingModel = require('../models/setting');
        const settings = await settingModel.getAll().catch(() => ({}));

        // Garantizar que el código exista antes de renderizar para evitar la race condition
        // entre el backfill lazy y el ciclo GET→POST: si la feature está activa y el envío
        // aún no tiene código (shipments pre-migration), lo generamos y persistimos ahora.
        if (settings.delivery_secret_enabled !== 'false' && !shipment.deliverySecretCode) {
            const { generateSecretCode } = require('../utils/shipmentTokens');
            const freshCode = generateSecretCode();
            await Shipment.update({ deliverySecretCode: freshCode }, { where: { id: shipment.id } });
            shipment.deliverySecretCode = freshCode;
        }

        const secretRequired = !!shipment.deliverySecretCode && settings.delivery_secret_enabled !== 'false';
        res.render('delivery/evidence', {
            shipmentId: shipment.trackingId,
            errors: {},
            routeId: req.query.routeId || null,
            stopId:  req.query.stopId  || null,
            secretRequired,
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const saveEvidence = async (req, res) => {
    try {

        const trackingCode = req.params.id;

        const { Op } = require('sequelize');
        const orConds = [{ trackingId: trackingCode }];
        const asNum = Number(trackingCode);
        if (Number.isInteger(asNum)) orConds.push({ id: asNum });

        const shipment = await Shipment.findOne({
            where: { [Op.or]: orConds }
        });

        if (!shipment) {
            return res.status(404).send('Envío no encontrado');
        }

        // #4 Offline: idempotencia. Si esta entrega ya se aplicó (replay de la cola), no duplicar.
        const clientActionId = req.body.clientActionId || null;
        if (clientActionId && await require('../models/offlineSyncLog').exists(clientActionId)) {
            return res.redirect('/delivery?delivered=true');
        }

        const {
            receiverName,
            receiverLastname,
            receiverDni,
            latitude,
            longitude,
            photoBase64,
            signatureBase64
        } = req.body;

        // routeId + stopId opcionales (vienen del flujo "Confirmar Entrega" desde la vista de ruta).
        // Si están presentes, validamos que el stop pertenezca a la ruta y que no haya pausa activa
        // ni stops anteriores sin resolver, y luego marcamos el stop completado.
        const routeIdRaw = req.body.routeId || req.query.routeId;
        const stopIdRaw  = req.body.stopId  || req.query.stopId;
        const routeId = Number.isInteger(Number(routeIdRaw)) ? Number(routeIdRaw) : null;
        const stopId  = Number.isInteger(Number(stopIdRaw))  ? Number(stopIdRaw)  : null;

        if (routeId && stopId) {
            const routeModel = require('../models/route');
            const route = await routeModel.getById(routeId);
            if (!route || route.transport?.driverUserId !== res.locals.currentUser.id) {
                return res.status(403).send('Esta ruta no te pertenece.');
            }
            // LGT-193/199: ruta bloqueada o pausada por fatiga → no se puede registrar entrega.
            if (route.statusId === routeModel.RouteStatus.BLOCKED_FATIGUE
                || route.statusId === routeModel.RouteStatus.PAUSED_FATIGUE) {
                return res.status(409).send('Ruta bloqueada por fatiga. Consultá con tu supervisor.');
            }
            const activePause = await RoutePause.findOne({ where: { routeId, endedAt: null } });
            if (activePause) {
                return res.status(409).send('La ruta está pausada. Reanudala antes de confirmar la entrega.');
            }
            const stops = (route.stops || []).slice().sort((a, b) => a.sequence - b.sequence);
            const target = stops.find(s => s.id === stopId);
            if (!target) { return res.status(404).send('Parada no encontrada en esta ruta.'); }
            const blocker = stops.find(s => s.sequence < target.sequence && !s.completed && !s.skipped);
            if (blocker) {
                return res.status(409).send(`Tenés que completar la parada #${blocker.sequence} antes de confirmar esta entrega.`);
            }
        }

        if (!stateMachine.canTransition({
            fromStatusId: shipment.statusId,
            toStatusId:   Status.DELIVERED.id,
            actorRoleId:  res.locals.currentUser?.roleId,
        })) {
            return res.status(422).send('No se puede confirmar entrega desde el estado actual.');
        }

        // Sprint 3 - 4.1: validar código clave si el envío lo tiene configurado.
        // Permitir override con bandera 'delivery_secret_enabled=false' en settings.
        const settingModel2 = require('../models/setting');
        const set2 = await settingModel2.getAll().catch(() => ({}));
        if (shipment.deliverySecretCode && set2.delivery_secret_enabled !== 'false') {
            const provided = String(req.body.deliverySecretCode || '').trim().toUpperCase();
            if (!provided) {
                return res.status(422).send('Código clave de entrega obligatorio (lo tiene el destinatario).');
            }
            if (provided !== String(shipment.deliverySecretCode).toUpperCase()) {
                return res.status(422).send('Código clave incorrecto. Pedíselo al destinatario.');
            }
        }

        const podLat = latitude  !== null && latitude  !== undefined && latitude  !== '' ? Number(latitude)  : null;
        const podLng = longitude !== null && longitude !== undefined && longitude !== '' ? Number(longitude) : null;

        await sequelize.transaction(async (t) => {
            await DeliveryEvidence.create({
                shipmentId: shipment.id,
                receiverName,
                receiverLastname,
                receiverDni,
                latitude:    latitude    || null,
                longitude:   longitude   || null,
                photoBase64: photoBase64 || null,
                signatureBase64: signatureBase64 || null
            }, { transaction: t });

            await ShipmentModel.updateStatus(shipment.id, Status.DELIVERED.id, { transaction: t });

            await shipmentHistoryModel.create({
                shipmentId:   shipment.id,
                fromStatusId: shipment.statusId,
                toStatusId:   Status.DELIVERED.id,
                comment:      'Entrega confirmada por repartidor',
                userId:       res.locals.currentUser?.id || null,
                eventType:    'POD',
                latitude:     Number.isFinite(podLat) ? podLat : null,
                longitude:    Number.isFinite(podLng) ? podLng : null,
                transaction:  t,
            });

            if (routeId && stopId) {
                await RouteStop.update(
                    { completed: true, completedAt: new Date() },
                    { where: { id: stopId, routeId }, transaction: t }
                );
            }

            // US-E09: cerrar automáticamente las incidencias auto-generadas del envío.
            await autoCloseForShipment(shipment.id, { reason: 'Cierre automático: envío entregado' }, t);
        });

        // CP-ENCS01: al entregar, enviar email con el link a la encuesta (fire-and-forget).
        require('../services/portalSurveyService').sendSurveyEmail(shipment.id).catch(() => {});
        // Última Milla: cierra el chat de entrega (ya no hay coordinación pendiente).
        require('../services/deliveryChat.service').close(shipment.id).catch(() => {});

        if (clientActionId) {
            require('../models/offlineSyncLog').create({ clientActionId, userId: res.locals.currentUser?.id || null, actionType: 'POD' }).catch(() => {});
        }

        if (routeId) {
            return res.redirect(`/delivery/route/${routeId}?delivered=true`);
        }
        res.redirect('/delivery?delivered=true');

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

const showActionScreen = async (req, res) => {
    try {
        const trackingCode = req.params.id;

        const shipment = await Shipment.findOne({
            where: { trackingId: trackingCode }
        });

        if (!shipment) {
            return res.status(404).send('Envío no encontrado');
        }

        res.render('delivery/action', { trackingCode });

    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};

module.exports = {
    showActionScreen,
    showEvidenceForm,
    saveEvidence,
    showFailedForm,
    saveFailedAttempt
};