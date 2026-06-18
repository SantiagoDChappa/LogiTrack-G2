const crypto = require('crypto');
const QRCode = require('qrcode');
const shipmentModel = require('../models/shipment');
const personModel = require('../models/person');
const provinceModel = require('../models/province');
const addressModel = require('../models/address');
const statusModel = require('../models/status');
const shipmentHistoryModel = require('../models/shipmentHistory');
const typeShipmentModel = require('../models/typeShipment');
const settingModel = require('../models/setting');
const userModel = require('../models/user');
const { PROVINCES } = require('../utils/provinces');
const { calcutaleUpdatePriority } = require('../utils/updatePriorityShipment');
const { notifyStatusChange } = require('../utils/notifications');
const { RoleType, Status, ShipmentType, ShipmentPriority, NotificationEvent } = require('../constants/enums');
const actionLogModel = require('../models/actionLog');

// Default ETA si el operador no carga fecha estimada al crear/modificar.
// Express → +2 días, Standard → +5, sin tipo → +3. Devuelve 'YYYY-MM-DD' (DATEONLY).
const computeDefaultExpectedDeliveryDate = (shipmentTypeId) => {
    const typeId = Number(shipmentTypeId);
    let days = 3;
    if (typeId === ShipmentType.EXPRESS.id)  { days = 2; }
    if (typeId === ShipmentType.STANDARD.id) { days = 5; }
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

// La fecha estimada de entrega debe ser posterior a hoy: no se admite una fecha
// anterior ni igual al día de hoy. Si no viene (se calculará por default), es válida.
const isValidFutureDeliveryDate = (val) => {
    if (!val) { return true; }
    const d = new Date(`${val}T00:00:00`);
    if (Number.isNaN(d.getTime())) { return false; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d.getTime() > today.getTime();
};
const { validationResult } = require('express-validator');
const csvImport = require('../services/csvImport');
const csvExport = require('../services/csvExport');
const shipmentImportModel = require('../models/shipmentImport');
const branchModel = require('../models/branch');
const { resolveUserBranchCoords } = require('../utils/eventLocation');
const { resolveZone } = require('../services/zoneResolver.service');
const { sendEmail } = require('../services/notification/emailSender');
const notificationConfigModel = require('../models/notificationConfig');
const emailTemplateModel = require('../models/emailTemplate');
const notificationVariableModel = require('../models/notificationVariable');
const placeholders = require('../services/notificationPlaceholders');
const notificationEventModel = require('../models/notificationEvents')
const { queueEmail } = require('../services/notification/notificationEmailService');
const failedAttemptModel = require('../models/failedAttempt');
const sequelize = require('../database/connection');

const isAdminUser = (user) => user?.roleId === RoleType.ADMIN.id;
const stateMachine = require('../services/shipmentStateMachine');
const routePlanner = require('../services/routePlanner');
const console = require('console');

const renderStateMachineError = (err, res, redirectUrl) => {
    if (err && err.name === 'StateMachineError') {
        const map = {
            INVALID_TRANSITION: 422,
            FORBIDDEN_ROLE: 403,
            COMMENT_REQUIRED: 400,
            SHIPMENT_NOT_FOUND: 404,
        };
        const status = map[err.code] || 400;
        const qs = `smError=${encodeURIComponent(err.code)}&smMsg=${encodeURIComponent(err.message)}`;
        res.status(status).redirect(`${redirectUrl}?${qs}`);
        return true;
    }
    return false;
};

const home = async (req, res) => {
    const isAdmin = isAdminUser(res.locals.currentUser);
    const [statuses, branches] = await Promise.all([
        statusModel.getAll(),
        isAdmin ? branchModel.getAll() : Promise.resolve([]),
    ]);
    res.render('shipment/index', { shipments: [], query: {}, statuses, branches, isAdmin });
};

const searchShipments = async (req, res) => {
    const currentUser = res.locals.currentUser;
    const isAdmin = isAdminUser(currentUser);
    const { trackingId, role, name, document, senderName, senderDocument, recipientName, recipientDocument, statusIds, currentBranchId } = req.query;
    // RBAC por sucursal: admin elige sucursal por filtro; no-admin queda forzado a su propia branchId.
    const effectiveBranchId = isAdmin
        ? (Number(currentBranchId) || null)
        : (currentUser?.branchId || null);
    const query = {
        trackingId,
        role,
        name: name?.trim(),
        document: document?.trim(),
        senderName: senderName?.trim(),
        senderDocument: senderDocument?.trim(),
        recipientName: recipientName?.trim(),
        recipientDocument: recipientDocument?.trim(),
        statusIds: statusIds ? [].concat(statusIds) : [],
        currentBranchId: effectiveBranchId,
    };
    const [shipments, statuses, branches] = await Promise.all([
        shipmentModel.search(query),
        statusModel.getAll(),
        isAdmin ? branchModel.getAll() : Promise.resolve([]),
    ]);
    const predictionModel = require('../models/shipmentPrediction');
    const predMap = await predictionModel.getLatestByShipmentIds(shipments.map(s => s.id));
    for (const s of shipments) { s.latestPrediction = predMap.get(s.id) || null; }
    res.render('shipment/index', { shipments, query, statuses, branches, isAdmin });
};

const getDetail = async (req, res) => {
    const { id } = req.params;
    const [shipment, history, originLat, originLng, originStreet, originNumber] = await Promise.all([
        shipmentModel.getById(id),
        shipmentHistoryModel.getByShipmentId(id),
        settingModel.get('origin_lat'),
        settingModel.get('origin_lng'),
        settingModel.get('origin_street'),
        settingModel.get('origin_number'),
    ]);

    if (!shipment) { return res.status(404).send('Envío no encontrado'); }

    // RBAC por sucursal: admin ve todo; delivery ve los asignados a él;
    // staff (supervisor/operador) ve solo envíos de su sucursal actual.
    const viewer = res.locals.currentUser;
    if (viewer && !isAdminUser(viewer)) {
        if (viewer.roleId === RoleType.DELIVERY.id) {
            if (shipment.deliveryUserId !== viewer.id) {
                return res.status(403).send('No tenés acceso a este envío.');
            }
        } else if (viewer.branchId && shipment.currentBranchId !== viewer.branchId) {
            return res.status(403).send('Este envío no pertenece a tu sucursal.');
        }
    }

    const destProv = PROVINCES[shipment.address.provinceId];
    const destLat = shipment.address.lat || (destProv ? destProv.lat : null);
    const destLng = shipment.address.lng || (destProv ? destProv.lng : null);
    const stops = history
        .filter(h => h.latitude !== null && h.latitude !== undefined && h.longitude !== null && h.longitude !== undefined)
        .map(h => {
            const isPOD = h.eventType === 'POD' || (h.toStatus && h.toStatus.id === Status.DELIVERED.id);
            const branchName = h.branch?.name || null;
            return {
                lat: Number(h.latitude),
                lng: Number(h.longitude),
                label: isPOD ? 'Entrega final (GPS)' : (branchName || h.eventType),
                status: h.toStatus?.description || '',
                timestamp: h.changedAt,
                isPOD,
                isCreated: h.eventType === 'CREATED',
            };
        });
    const firstBranchEvent = history.find(h => h.branch);
    let originBranch = firstBranchEvent?.branch || shipment.currentBranch || null;

    if (!originBranch) {
        const createdEvent = history.find(h => h.eventType === 'CREATED' && h.user?.id);
        const creatorId = createdEvent?.user?.id;
        if (creatorId) {
            const creator = await userModel.getById(creatorId);
            if (creator?.branchId) {
                originBranch = await branchModel.getById(creator.branchId);
            }
        }
    }

    const lastBranchEvent = [...history].reverse().find(h => h.branch);
    const currentBranch = lastBranchEvent?.branch || shipment.currentBranch || null;
    const fallbackStreet = [originStreet, originNumber].filter(Boolean).join(' ');
    const mapData = {
        origin: originBranch ? {
            lat: Number(originBranch.latitude),
            lng: Number(originBranch.longitude),
            label: originBranch.name.startsWith('Sucursal') ? originBranch.name : `Sucursal ${originBranch.name}`,
        } : {
            lat: parseFloat(originLat) || -34.6037,
            lng: parseFloat(originLng) || -58.3816,
            label: fallbackStreet || 'Punto de origen central',
        },
        currentBranch: currentBranch ? {
            lat: Number(currentBranch.latitude),
            lng: Number(currentBranch.longitude),
            label: currentBranch.name.startsWith('Sucursal') ? currentBranch.name : `Sucursal ${currentBranch.name}`,
        } : null,
        destination: destLat ? {
            lat: destLat,
            lng: destLng,
            label: [shipment.address.street, shipment.address.number].filter(Boolean).join(' ')
                || (destProv ? destProv.name : ''),
        } : null,
        stops,
        route: null,
    };

    if (mapData.destination
        && Number.isFinite(mapData.origin.lat)
        && Number.isFinite(mapData.origin.lng)
        && Number.isFinite(mapData.destination.lat)
        && Number.isFinite(mapData.destination.lng)) {
        try {
            mapData.route = await routePlanner.planShipmentRoute({
                origin: { lat: mapData.origin.lat, lng: mapData.origin.lng, label: mapData.origin.label },
                destination: { lat: mapData.destination.lat, lng: mapData.destination.lng, label: mapData.destination.label },
                originBranchId: originBranch?.id || null,
            });
        } catch (err) {
            console.error('ERROR planShipmentRoute:', err.message);
        }
    }

    const returnUrl = req.query.from || '/shipment';
    const returnLabel = req.query.fromLabel || 'Administrador de envíos';

    // SLA penalty + desglose costo cliente
    const sla = (() => {
        if (!shipment.expectedDeliveryDate) { return null; }
        const expected = new Date(shipment.expectedDeliveryDate);
        const deliveredEvent = (history || []).find(h => h.toStatusId === 4);
        if (!deliveredEvent) {
            const today = new Date();
            const daysOver = Math.max(0, Math.floor((today - expected) / 86400000));
            return { delivered: false, expected, daysOver, penaltyPct: Math.min(50, daysOver * 5) };
        }
        const actual = new Date(deliveredEvent.changedAt);
        const daysLate = Math.max(0, Math.floor((actual - expected) / 86400000));
        return { delivered: true, expected, actual, daysLate, penaltyPct: Math.min(50, daysLate * 5), onTime: daysLate === 0 };
    })();

    // Desglose costo cliente (zona base + recargo peso/vol). Centralizado en shipmentCostService
    // para reutilizarlo en la nota de crédito (LGT-214).
    const costClient = await require('../services/shipmentCostService')
        .computeCost(shipment, { penaltyPct: sla?.penaltyPct || 0 });


    const replacementSvc = require('../services/replacementService');
    const [incidentsForShipment, replacementShipment, originalShipment, invoice, creditNotes] = await Promise.all([
        require('../models/incident').list({ shipmentId: id, limit: 50 }),
        // Este envío generó un reemplazo (es el original).
        replacementSvc.findExistingByOrigin(id),
        // Este envío ES un reemplazo (busca el original al que apunta).
        shipment.replacementOfShipmentId
            ? shipmentModel.getById(shipment.replacementOfShipmentId)
            : Promise.resolve(null),
        // Factura del envío (comprobante al remitente).
        require('../services/invoiceService').getByShipment(id),
        // Notas de crédito del envío (reembolsos por devolución / incidencia).
        require('../services/creditNoteService').getByShipment(id),
    ]);

    // Alta interna de devolución: visible a staff cuando el envío es elegible
    // (entregado + dentro de ventana + sin devolución previa). El form vuelve a validar igual.
    const STAFF_ROLE_IDS = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.ADMIN.id];
    let canCreateReturn = false;
    if (viewer && STAFF_ROLE_IDS.includes(viewer.roleId)) {
        const elig = await require('../services/returnIncidentService').checkEligibility(shipment).catch(() => ({ ok: false }));
        canCreateReturn = !!elig.ok;
    }

    res.render('shipment/detail', {
        shipment, history, mapData, returnUrl, returnLabel, sla, costClient, invoice, creditNotes,
        modifications: (await require('../services/portalModificationService').listByShipment(id))
            .map(require('../controllers/shipmentModification').formatRow),
        incidents: incidentsForShipment,
        replacementShipment,
        originalShipment,
        isAdmin: isAdminUser(viewer),
        currentBranch,
        canCreateReturn,
        returnError: req.query.returnError || null,
    });
};

const getNewShipmentForm = async (req, res) => {
    const [provinces, typesShipment, pickupBranches, seguroPct] = await Promise.all([
        provinceModel.getAll(),
        typeShipmentModel.getAll(),
        branchModel.getPickupEnabled(),
        settingModel.get('seguro_pct'),
    ]);
    res.render('shipment/new', { errors: [], body: {}, provinces, typesShipment, pickupBranches, seguroPct: parseFloat(seguroPct) || 0 });
};

const createShipment = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const [provinces, typesShipment, pickupBranches, seguroPct] = await Promise.all([
            provinceModel.getAll(),
            typeShipmentModel.getAll(),
            branchModel.getPickupEnabled(),
            settingModel.get('seguro_pct'),
        ]);
        return res.render('shipment/new', {
            errors: errors.array().map(e => e.msg),
            body: req.body,
            provinces,
            typesShipment,
            pickupBranches,
            seguroPct: parseFloat(seguroPct) || 0
        });
    }

    try {
        const body = req.body;
        const deliveryMode = body.deliveryMode === 'branch_pickup' ? 'branch_pickup' : 'home';
        const isPickup = deliveryMode === 'branch_pickup';

        if (parseFloat(body.weightKg) <= 0) { throw new Error('El peso debe ser mayor a 0'); }
        if (parseInt(body.packageQty) <= 0) { throw new Error('La cantidad de bultos debe ser al menos 1'); }
        if (!isValidFutureDeliveryDate(body.expectedDeliveryDate)) {
            throw new Error('La fecha estimada de entrega debe ser posterior a hoy.');
        }

        let pickupBranch = null;
        if (isPickup) {
            if (!body.pickupBranchId) { throw new Error('Debe seleccionar una sucursal de retiro'); }
            pickupBranch = await branchModel.getById(Number(body.pickupBranchId));
            if (!pickupBranch) { throw new Error('Sucursal de retiro no encontrada'); }
            if (!pickupBranch.pickupEnabled) { throw new Error('La sucursal seleccionada no está habilitada para retiro'); }
        }

        // Validar contra parámetros configurables del sistema
        const settings = await settingModel.getAll();
        const pesoMaximo = parseFloat(settings.peso_maximo_envio) || 50;
        const cantMaxima = parseInt(settings.cantidad_maxima_paquetes) || 20;

        if (parseFloat(body.weightKg) > pesoMaximo) {
            throw new Error(`El peso no puede superar ${pesoMaximo} kg (configurado en Ajustes)`);
        }
        if (parseInt(body.packageQty) > cantMaxima) {
            throw new Error(`La cantidad de paquetes no puede superar ${cantMaxima} (configurado en Ajustes)`);
        }

        if (!isPickup && body.addressLat && body.addressLng && body.province) {
            const { isCoordInProvince, findProvinceByCoord } = require('../utils/provinceBbox');
            const lat = parseFloat(body.addressLat);
            const lng = parseFloat(body.addressLng);
            const check = isCoordInProvince(lat, lng, body.province);
            if (!check.ok) {
                const found = findProvinceByCoord(lat, lng);
                const hint = found ? ` Las coordenadas parecen pertenecer a ${found.name} (id ${found.provinceId}).` : '';
                throw new Error(`Coordenadas no coinciden con la provincia seleccionada. ${check.reason}.${hint}`);
            }
        }

        const { normalizePostalCode } = require('../utils/postalCode');
        if (!isPickup && body.postalCode && body.province) {
            const norm = normalizePostalCode(body.postalCode, body.province);
            if (!norm.ok) { throw new Error(norm.reason); }
            body.postalCode = norm.value;
        }

        if (!isPickup && body.skipDuplicateCheck !== 'true') {
            const dup = await shipmentModel.findPotentialDuplicate({
                senderDocument: body.senderDocument,
                recipientDocument: body.recipientDocument,
                street: body.street,
                number: body.number,
                provinceId: body.province,
                statusId: 1,
            });
            if (dup) {
                throw new Error(`Posible duplicado: ya existe envío ${dup.trackingId} con mismo remitente, destinatario y dirección en estado Pendiente. Si querés crearlo igual, marcá "Crear de todos modos".`);
            }
        }

        // Bloque transaccional: crea persona(s), dirección, envío e historial inicial de forma atómica.
        // Si cualquier paso falla, rollback evita registros huérfanos (ej: address sin shipment, shipment sin history).
        const shipment = await sequelize.transaction(async (t) => {
        const sender = await personModel.createOrUpdate({
            name: body.senderName,
            document: body.senderDocument,
            phone: body.senderPhone,
            email: body.senderEmail,
        }, { transaction: t });

        const recipient = await personModel.createOrUpdate({
            name: body.recipientName,
            document: body.recipientDocument,
            phone: body.recipientPhone,
            email: body.recipientEmail
        }, { transaction: t });

        const addressPayload = isPickup
            ? {
                street:         pickupBranch.address || pickupBranch.name,
                number:         0,
                provinceId:     pickupBranch.provinceId,
                postalCode:     pickupBranch.postalCode,
                floorApartment: null,
                lat:            pickupBranch.latitude  ? Number(pickupBranch.latitude)  : null,
                lng:            pickupBranch.longitude ? Number(pickupBranch.longitude) : null,
            }
            : {
                street:         body.street,
                number:         body.number,
                provinceId:     body.province,
                postalCode:     body.postalCode,
                floorApartment: body.floorApartment,
                lat:            body.addressLat ? parseFloat(body.addressLat) : null,
                lng:            body.addressLng ? parseFloat(body.addressLng) : null,
            };

        const [address, creatorCoordsForCreate] = await Promise.all([
            addressModel.create(addressPayload, { transaction: t }),
            resolveUserBranchCoords(res.locals.currentUser?.id),
        ]);

        // Fallback de currentBranchId si el creador no tiene sucursal (ej: admin):
        //   1. branch del creador
        //   2. pickupBranchId (si es retiro en sucursal)
        //   3. sucursal mas cercana a la direccion destino (haversine)
        const resolveCurrentBranchId = async () => {
            if (creatorCoordsForCreate.branchId) { return creatorCoordsForCreate.branchId; }
            if (isPickup && pickupBranch?.id) { return pickupBranch.id; }
            const destLat = addressPayload.lat;
            const destLng = addressPayload.lng;
            if (destLat == null || destLng == null) { return null; }
            const allBranches = await branchModel.getAll();
            const usable = allBranches.filter(b => b.latitude != null && b.longitude != null && !b.closed);
            if (usable.length === 0) { return null; }
            const toRad = d => d * Math.PI / 180;
            const dist = (a, b) => {
                const R = 6371;
                const dLat = toRad(Number(b.lat) - Number(a.lat));
                const dLng = toRad(Number(b.lng) - Number(a.lng));
                const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(Number(a.lat))) * Math.cos(toRad(Number(b.lat))) * Math.sin(dLng / 2) ** 2;
                return 2 * R * Math.asin(Math.sqrt(x));
            };
            let nearest = usable[0];
            let nearestD = dist({ lat: destLat, lng: destLng }, { lat: nearest.latitude, lng: nearest.longitude });
            for (const b of usable.slice(1)) {
                const d = dist({ lat: destLat, lng: destLng }, { lat: b.latitude, lng: b.longitude });
                if (d < nearestD) { nearest = b; nearestD = d; }
            }
            return nearest.id;
        };
        const resolvedCurrentBranchId = await resolveCurrentBranchId();

        const destLatForPriority = isPickup ? Number(pickupBranch.latitude)  : (body.addressLat ? parseFloat(body.addressLat) : null);
        const destLngForPriority = isPickup ? Number(pickupBranch.longitude) : (body.addressLng ? parseFloat(body.addressLng) : null);

        const initialPriority = calInitialPriority({
            weight: body.weightKg || null,
            type:   body.shipmentTypeId || null,
            destinationUbication: { lat: destLatForPriority, lng: destLngForPriority },
            originUbication: {
                lat: res.locals.currentUser?.branch?.latitude,
                lng: res.locals.currentUser?.branch?.longitude,
            },
        });

        const resolvedZone = await resolveZone({
            postalCode: isPickup ? pickupBranch.postalCode : body.postalCode,
            provinceId: isPickup ? pickupBranch.provinceId : body.province,
        });

        const normalizeTime = (t) => {
            if (!t) { return null; }
            const v = String(t).trim();
            if (!v) { return null; }
            return v.length === 5 ? `${v}:00` : v;
        };

        const created = await shipmentModel.create({
            senderId:        sender.id,
            recipientId:     recipient.id,
            addressId:       address.id,
            deliveryMode:    deliveryMode,
            pickupBranchId:  isPickup ? pickupBranch.id : null,
            shipmentTypeId:  body.shipmentTypeId || null,
            weightKg:        body.weightKg       || null,
            packageQty:      body.packageQty     || null,
            volumeM3:        body.volumeM3       || null,
            declaredValue:   body.declaredValue ? Math.max(0, parseFloat(body.declaredValue) || 0) : null,
            basePriority:    initialPriority,
            priority:        initialPriority,
            currentBranchId: resolvedCurrentBranchId,
            zoneId: resolvedZone?.id || null,
            expectedDeliveryDate: body.expectedDeliveryDate || computeDefaultExpectedDeliveryDate(body.shipmentTypeId),
            expectedDeliveryFrom: normalizeTime(body.expectedDeliveryFrom),
            expectedDeliveryTo: normalizeTime(body.expectedDeliveryTo),
        }, { transaction: t });

        const creatorCoords = await resolveUserBranchCoords(res.locals.currentUser?.id);
        await shipmentHistoryModel.create({
            shipmentId: created.id,
            fromStatusId: null,
            toStatusId: created.statusId,
            eventType: 'CREATED',
            userId: res.locals.currentUser?.id || null,
            branchId: creatorCoords.branchId,
            latitude: creatorCoords.latitude,
            longitude: creatorCoords.longitude,
            transaction: t,
        });

        return created;
        });

        const freshShipment = await shipmentModel.getById(shipment.id);

        // LGT-214 precondición: persistir costo al momento de creación.
        // [prototype] El desglose ya incluye el seguro de mercadería; persistimos también
        // insuranceAmount aparte para itemizarlo en factura/NC sin recalcularlo después.
        const costSvc = require('../services/shipmentCostService');
        const breakdown = await costSvc.computeCost(freshShipment);
        const costTotal = breakdown ? breakdown.final : 0;
        const insuranceAmount = breakdown ? breakdown.insurance : 0;
        const costUpdates = {};
        if (costTotal > 0)        { costUpdates.costTotal = costTotal;             freshShipment.costTotal = costTotal; }
        if (insuranceAmount > 0)  { costUpdates.insuranceAmount = insuranceAmount; freshShipment.insuranceAmount = insuranceAmount; }
        if (Object.keys(costUpdates).length) {
            await shipmentModel.Shipment.update(costUpdates, { where: { id: freshShipment.id } });
        }

        // Factura del envío (comprobante al remitente) con el desglose de costo.
        // Best-effort: un fallo de facturación no debe tumbar el alta del envío.
        try {
            await require('../services/invoiceService').generate({
                shipmentId: freshShipment.id,
                userId: res.locals.currentUser?.id || null,
            });
        } catch (e) {
            console.error('[createShipment] factura:', e.message);
        }

        await notifyShipmentEvent(NotificationEvent.SHIPMENT_PENDING, freshShipment);

        actionLogModel.record(res.locals.currentUser?.id, 'CREATE', 'SHIPMENT', shipment.id, { trackingId: shipment.trackingId }, req);
        res.redirect(`/shipment/detail/${shipment.id}?created=true`);
    } catch (err) {
        console.error('ERROR createShipment:', err.message);
        const [provinces, typesShipment, pickupBranches, seguroPct] = await Promise.all([
            provinceModel.getAll(),
            typeShipmentModel.getAll(),
            branchModel.getPickupEnabled(),
            settingModel.get('seguro_pct'),
        ]);
        res.render('shipment/new', {
            errors: [err.message],
            body: req.body,
            provinces,
            typesShipment,
            pickupBranches,
            seguroPct: parseFloat(seguroPct) || 0
        });
    }
};

const getUpdateShipment = async (req, res) => {
    const { id } = req.params;
    const [provinces, statuses, shipment, history, typesShipment, originLat, originLng, originStreet, originNumber, deliveryUsers] = await Promise.all([
        provinceModel.getAll(),
        statusModel.getAll(),
        shipmentModel.getById(id),
        shipmentHistoryModel.getByShipmentId(id),
        typeShipmentModel.getAll(),
        settingModel.get('origin_lat'),
        settingModel.get('origin_lng'),
        settingModel.get('origin_street'),
        settingModel.get('origin_number'),
        userModel.search({ roleId: RoleType.DELIVERY.id })
    ]);

    const destProv = PROVINCES[shipment.address.provinceId];
    const destLat = shipment.address.lat || (destProv ? destProv.lat : null);
    const destLng = shipment.address.lng || (destProv ? destProv.lng : null);
    const mapData = {
        origin: {
            lat: parseFloat(originLat) || -34.6037,
            lng: parseFloat(originLng) || -58.3816,
            label: [originStreet, originNumber].filter(Boolean).join(' ') || 'Origen',
        },
        destination: destLat ? {
            lat: destLat,
            lng: destLng,
            label: [shipment.address.street, shipment.address.number].filter(Boolean).join(' ') || (destProv ? destProv.name : ''),
        } : null,
    };

    // Resolver sucursal origen desde historial (igual que getDetail)
    const firstBranchEvent = history.find(h => h.branch);
    let originBranch = firstBranchEvent?.branch || null;
    if (!originBranch) {
        const createdEvent = history.find(h => h.eventType === 'CREATED' && h.user?.id);
        if (createdEvent?.user?.id) {
            const creator = await userModel.getById(createdEvent.user.id);
            if (creator?.branchId) {
                const branchModel = require('../models/branch');
                originBranch = await branchModel.getById(creator.branchId);
            }
        }
    }
    if (originBranch) {
        mapData.origin = {
            lat: Number(originBranch.latitude),
            lng: Number(originBranch.longitude),
            label: originBranch.name,
        };
    }

    mapData.route = null;
    if (mapData.destination
        && Number.isFinite(mapData.origin.lat) && Number.isFinite(mapData.origin.lng)
        && Number.isFinite(mapData.destination.lat) && Number.isFinite(mapData.destination.lng)) {
        try {
            mapData.route = await routePlanner.planShipmentRoute({
                origin: { lat: mapData.origin.lat, lng: mapData.origin.lng, label: mapData.origin.label },
                destination: { lat: mapData.destination.lat, lng: mapData.destination.lng, label: mapData.destination.label },
                originBranchId: originBranch?.id || res.locals.currentUser?.branchId || null,
            });
        } catch (err) {
            console.error('ERROR planShipmentRoute (update):', err.message);
        }
    }

    const returnUrl = req.query.from || '/shipment';
    const currentUser = res.locals.currentUser;
    const canChangeStatus = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.ADMIN.id].includes(currentUser?.roleId);
    // Estados que son hechos físicos de campo (los confirma el repartidor por scan/ruta/POD):
    // En Tránsito, En Sucursal, Entregado e Intento Fallido NO se setean a dedo desde el escritorio.
    // La máquina de estados los sigue permitiendo por sus flujos operativos (despacho de ruta, scans);
    // acá solo los sacamos de los botones de "modificar envío".
    const DESK_BLOCKED_STATUSES = new Set([
        Status.IN_TRANSIT.id, Status.AT_BRANCH.id, Status.DELIVERED.id, Status.FAILED_ATTEMPT.id,
    ]);
    const availableActions = stateMachine
        .getAvailableActions({ shipment, actor: currentUser })
        .filter(a => !DESK_BLOCKED_STATUSES.has(a.toStatusId));
    res.render('shipment/update', { errors: [], shipment, provinces, statuses, history, typesShipment, mapData, deliveryUsers, returnUrl, isSupervisor: canChangeStatus, availableActions });
};

const updateShipment = async (req, res) => {
    try {
        const { id } = req.params;
        const body = { ...req.body, id };
        const currentUser = res.locals.currentUser;
        const isOperator = currentUser.roleId === RoleType.OPERATOR.id;

        const shipment = await shipmentModel.getById(id);
        if (!shipment) { return res.status(404).send('Envío no encontrado'); }

        if (isOperator && (shipment.statusId === Status.DELIVERED.id || shipment.statusId === Status.CANCELLED.id)) {
            return res.redirect(`/shipment/update/${id}`);
        }

        if (body.newStatusId) {
            const targetStatusId = Number(body.newStatusId);

            if (!stateMachine.canTransition({ fromStatusId: shipment.statusId, toStatusId: targetStatusId, actorRoleId: currentUser.roleId })) {
                return res.status(403).redirect(`/shipment/update/${id}?smError=FORBIDDEN_ROLE&smMsg=${encodeURIComponent('No tenés permiso para realizar esa transición de estado')}`);
            }

            if (targetStatusId === Status.IN_TRANSIT.id) {
                const submittedDeliveryUserId = body.deliveryUserId || null;
                if (!submittedDeliveryUserId) {
                    const [provinces, statuses, history, typesShipment, deliveryUsers, originLat, originLng, originStreet, originNumber] = await Promise.all([
                        provinceModel.getAll(),
                        statusModel.getAll(),
                        shipmentHistoryModel.getByShipmentId(id),
                        typeShipmentModel.getAll(),
                        userModel.search({ roleId: RoleType.DELIVERY.id }),
                        settingModel.get('origin_lat'),
                        settingModel.get('origin_lng'),
                        settingModel.get('origin_street'),
                        settingModel.get('origin_number')
                    ]);

                    const destProv = PROVINCES[shipment.address?.provinceId];
                    const destLat = shipment.address?.lat || (destProv ? destProv.lat : null);
                    const destLng = shipment.address?.lng || (destProv ? destProv.lng : null);
                    const mapData = {
                        origin: {
                            lat: parseFloat(originLat) || -34.6037,
                            lng: parseFloat(originLng) || -58.3816,
                            label: [originStreet, originNumber].filter(Boolean).join(' ') || 'Origen',
                        },
                        destination: destLat ? {
                            lat: destLat,
                            lng: destLng,
                            label: [shipment.address?.street, shipment.address?.number].filter(Boolean).join(' ') || (destProv ? destProv.name : ''),
                        } : null,
                    };

                    return res.render('shipment/update', {
                        errors: ['Debe asignar un repartidor antes de pasar el envío a estado "En Tránsito".'],
                        shipment, provinces, statuses, history, typesShipment, mapData, deliveryUsers,
                        returnUrl: req.query.from || '/shipment',
                        isSupervisor: [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id].includes(currentUser?.roleId),
                    });
                }
            }

            const newStatus = await statusModel.getById(targetStatusId);
            // Bloque transaccional: cambio de estado + historial + update de envío + prioridad atómicos.
            // Sin esto, un fallo a mitad de camino deja envío con estado nuevo y sin historial (o viceversa).
            await sequelize.transaction(async (t) => {
                if (shipment.statusId !== targetStatusId) {
                    const actorCoords = await resolveUserBranchCoords(currentUser?.id);
                    await shipmentHistoryModel.create({
                        shipmentId: id,
                        fromStatusId: shipment.statusId,
                        toStatusId: Number(body.newStatusId),
                        comment: body.statusComment || null,
                        userId: currentUser?.id || null,
                        eventType: 'STATUS_CHANGE',
                        branchId: actorCoords.branchId,
                        latitude: actorCoords.latitude,
                        longitude: actorCoords.longitude,
                        transaction: t,
                    });

                    await shipmentModel.updateStatus(id, Number(body.newStatusId), { transaction: t });

                    // Sync ruteo: cerrar RouteStop si el estado nuevo es terminal.
                    const { RouteStop } = require('../models/routeStop');
                    const closing = new Set([Status.DELIVERED.id, Status.FAILED_ATTEMPT.id, Status.PACKAGE_FAILED.id, Status.CANCELLED.id]);
                    if (closing.has(Number(body.newStatusId))) {
                        await RouteStop.update(
                            { completed: true, completedAt: new Date() },
                            { where: { shipmentId: Number(id), stopType: 'delivery', completed: false }, transaction: t }
                        );
                    }
                }

                if (isOperator) {
                    body.street = shipment.address.street;
                    body.number = shipment.address.number;
                    body.province = shipment.address.provinceId;
                    body.postalCode = shipment.address.postalCode;
                    body.floorApartment = shipment.address.floorApartment;
                    body.addressLat = shipment.address.lat;
                    body.addressLng = shipment.address.lng;
                    body.weightKg = shipment.weightKg;
                    body.packageQty = shipment.packageQty;
                    body.shipmentTypeId = shipment.shipmentTypeId;
                }

                if (shipment.statusId === Status.IN_TRANSIT.id) {
                    body.deliveryUserId = shipment.deliveryUserId;
                }

                await shipmentModel.update(body, { transaction: t });

                const newPriority = await calcutaleUpdatePriority(shipment.id, shipment.basePriority);
                await shipmentModel.updatePriority(shipment.id, newPriority, { transaction: t });
            });
            
        } else {
            // No hay cambio de estado: igual envolvemos update + prioridad en una transacción.
            await sequelize.transaction(async (t) => {
                if (isOperator) {
                    body.street = shipment.address.street;
                    body.number = shipment.address.number;
                    body.province = shipment.address.provinceId;
                    body.postalCode = shipment.address.postalCode;
                    body.floorApartment = shipment.address.floorApartment;
                    body.addressLat = shipment.address.lat;
                    body.addressLng = shipment.address.lng;
                    body.weightKg = shipment.weightKg;
                    body.packageQty = shipment.packageQty;
                    body.shipmentTypeId = shipment.shipmentTypeId;
                }

                if (shipment.statusId === Status.IN_TRANSIT.id) {
                    body.deliveryUserId = shipment.deliveryUserId;
                }

                await shipmentModel.update(body, { transaction: t });
                const newPriority = await calcutaleUpdatePriority(shipment.id, shipment.basePriority);
                await shipmentModel.updatePriority(shipment.id, newPriority, { transaction: t });
            });
        }
        actionLogModel.record(res.locals.currentUser?.id, 'UPDATE', 'SHIPMENT', shipment.id, null, req);
        res.redirect('/shipment?success=2');
    } catch (err) {
        console.error('ERROR updateShipment:', err.message);
        res.status(500).send('Error interno al actualizar el envío');
    }
};

const updateShipmentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { newStatusId, comment } = req.body;
        const [shipment, newStatus] = await Promise.all([
            shipmentModel.getById(id),
            statusModel.getById(Number(newStatusId)),
        ]);

        const actorCoords = await resolveUserBranchCoords(res.locals.currentUser?.id);
        // Bloque transaccional: historial + cambio de estado + cierre de RouteStop atómicos.
        await sequelize.transaction(async (t) => {
            await shipmentHistoryModel.create({
                shipmentId: id,
                fromStatusId: shipment.statusId,
                toStatusId: Number(newStatusId),
                comment: comment || null,
                userId: res.locals.currentUser?.id || null,
                eventType: 'STATUS_CHANGE',
                branchId: actorCoords.branchId,
                latitude: actorCoords.latitude,
                longitude: actorCoords.longitude,
                transaction: t,
            });

            await shipmentModel.updateStatus(id, Number(newStatusId), { transaction: t });

            const { RouteStop } = require('../models/routeStop');
            const closing = new Set([Status.DELIVERED.id, Status.FAILED_ATTEMPT.id, Status.PACKAGE_FAILED.id, Status.CANCELLED.id]);
            if (closing.has(Number(newStatusId))) {
                await RouteStop.update(
                    { completed: true, completedAt: new Date() },
                    { where: { shipmentId: Number(id), stopType: 'delivery', completed: false }, transaction: t }
                );
            }
        });
/*
        const eventCode = await notificationEventModel.getEventCodeByShipmentStatus(Number(newStatusId));
        const freshShipment = await shipmentModel.getById(id);
        await notifyShipmentEvent(eventCode || NotificationEvent.SHIPMENT_ASSIGNED, freshShipment);
*/
        if (Number(newStatusId) === 4) {
            try {
                const { updateActualResult } = require('../models/shipmentPrediction');
                const { ShipmentHistory } = require('../models/shipmentHistory');
                const historial = await ShipmentHistory.findAll({ where: { shipmentId: id }, order: [['changedAt', 'ASC']] });
                const fechaCreacion = historial.length > 0 ? historial[0].changedAt : new Date();
                const diasReales = Math.ceil((new Date() - new Date(fechaCreacion)) / (1000 * 60 * 60 * 24));
                const wasDelayed = diasReales > 3;
                await updateActualResult(id, diasReales, wasDelayed);
            } catch (e) {
                console.error('Error actualizando predicción real:', e.message);
            }
        }
        if (newStatus) { notifyStatusChange(shipment, newStatus.description); }

        res.redirect(`/shipment/update/${id}`);
    } catch (err) {
        console.error('ERROR updateShipmentStatus:', err.message);
        res.status(500).send('Error interno al actualizar estado');
    }
};

const assignDelivery = async (req, res) => {
    try {
        const { id } = req.params;
        const { deliveryUserId } = req.body;
        const currentUser = res.locals.currentUser;

        const supervisorCoords = await resolveUserBranchCoords(currentUser?.id);
        await stateMachine.assignDelivery({
            shipmentId: Number(id),
            deliveryUserId: deliveryUserId || null,
            actor: currentUser,
            branchId: supervisorCoords.branchId,
            latitude: supervisorCoords.latitude,
            longitude: supervisorCoords.longitude,
        });
/*
        const shipment = await shipmentModel.getById(id);
        await notifyShipmentEvent(NotificationEvent.SHIPMENT_ASSIGNED, shipment);
*/
        res.redirect(`/shipment/update/${id}?success=3`);
    } catch (err) {
        const handled = renderStateMachineError(err, res, `/shipment/update/${req.params.id}`);
        if (handled) { return; }
        console.error('ERROR assignDelivery:', err.message);
        res.status(500).send('Error interno al asignar repartidor');
    }
};

const prepareShipment = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = res.locals.currentUser;

        const actorCoords = await resolveUserBranchCoords(currentUser?.id);
        await stateMachine.transition({
            shipmentId: Number(id),
            toStatusId: Status.IN_PREPARATION.id,
            actor: currentUser,
            branchId: actorCoords.branchId,
            latitude: actorCoords.latitude,
            longitude: actorCoords.longitude,
        });
/*
        const shipment = await shipmentModel.getById(id);
        await notifyShipmentEvent(NotificationEvent.SHIPMENT_IN_PREPARATION, shipment);
*/
        res.redirect(`/shipment/update/${id}?success=4`);
    } catch (err) {
        const handled = renderStateMachineError(err, res, `/shipment/update/${req.params.id}`);
        if (handled) { return; }
        console.error('ERROR prepareShipment:', err.message);
        res.status(500).send('Error interno al iniciar preparación');
    }
};

const cancelShipment = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const currentUser = res.locals.currentUser;

        const actorCoords = await resolveUserBranchCoords(currentUser?.id);
        await stateMachine.transition({
            shipmentId: Number(id),
            toStatusId: Status.CANCELLED.id,
            actor: currentUser,
            comment,
            branchId: actorCoords.branchId,
            latitude: actorCoords.latitude,
            longitude: actorCoords.longitude,
        });
/*
        const shipment = await shipmentModel.getById(id);
        await notifyShipmentEvent(NotificationEvent.SHIPMENT_CANCELLED, shipment);
*/
        actionLogModel.record(res.locals.currentUser?.id, 'CANCEL', 'SHIPMENT', Number(id), null, req);
        res.redirect(`/shipment/update/${id}?success=5`);
    } catch (err) {
        const handled = renderStateMachineError(err, res, `/shipment/update/${req.params.id}`);
        if (handled) { return; }
        console.error('ERROR cancelShipment:', err.message);
        res.status(500).send('Error interno al cancelar envío');
    }
};

const markPackageFailed = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment, reason } = req.body;
        const currentUser = res.locals.currentUser;

        // Mapeo motivo → variante del template del cliente. Si no llega reason valido,
        // queda el genérico SHIPMENT_PACKAGE_FAILED (backward compatible).
        const REASON_TO_EVENT = {
            UNDELIVERED: NotificationEvent.SHIPMENT_PACKAGE_FAILED_UNDELIVERED,
            DELAY:       NotificationEvent.SHIPMENT_PACKAGE_FAILED_DELAY,
            ATTEMPT:     NotificationEvent.SHIPMENT_PACKAGE_FAILED_ATTEMPT,
        };
        const notificationEventOverride = REASON_TO_EVENT[String(reason || '').toUpperCase()] || null;

        const actorCoords = await resolveUserBranchCoords(currentUser?.id);
        await stateMachine.transition({
            shipmentId: Number(id),
            toStatusId: Status.PACKAGE_FAILED.id,
            actor: currentUser,
            comment,
            branchId: actorCoords.branchId,
            latitude: actorCoords.latitude,
            longitude: actorCoords.longitude,
            notificationEventOverride,
        });
/*
        const shipment = await shipmentModel.getById(id);
        await notifyShipmentEvent(NotificationEvent.SHIPMENT_PACKAGE_FAILED, shipment);
*/
        // US-E02: generar incidencia automática por paquete fallido (dedup interno).
        try {
            const { autoCreateIncident } = require('../services/incidentAutoGen');
            let createdIncident = null;
            await sequelize.transaction(async (t) => {
                createdIncident = await autoCreateIncident({
                    shipmentId:  Number(id),
                    typeCode:    'PACKAGE_BROKEN',
                    description: `Paquete fallido${comment ? `: ${comment}` : ''}.`
                }, t);
            });
            // PAQUETE DAÑADO → avisar SIEMPRE al cliente para que elija reembolso/reemplazo
            // (mismo pipeline que el alta manual / portal). Solo si efectivamente se creó
            // la incidencia (autoCreateIncident devuelve null por dedup).
            if (createdIncident) {
                require('../services/incidentDamageResolution').notifySenderIfDamage({
                    incidentId: createdIncident.id,
                    shipment:   { id: Number(id) },
                    type:       { code: 'PACKAGE_BROKEN' },
                }).catch(e => console.error('[shipment] notif daño cliente:', e.message));
            }
        } catch (e) { console.error('[shipment] autoCreateIncident:', e.message); }

        res.redirect(`/shipment/update/${id}?success=6`);
    } catch (err) {
        const handled = renderStateMachineError(err, res, `/shipment/update/${req.params.id}`);
        if (handled) { return; }
        console.error('ERROR markPackageFailed:', err.message);
        res.status(500).send('Error interno al marcar paquete fallido');
    }
};

const getKanban = async (req, res) => {
    const KANBAN_STATUS_IDS = [
        Status.PENDING.id,
        Status.ASSIGNED.id,
        Status.IN_PREPARATION.id,
        Status.IN_TRANSIT.id,
        Status.AT_BRANCH.id,
        Status.FAILED_ATTEMPT.id,
        Status.PACKAGE_FAILED.id,
    ];

    const user = res.locals.currentUser;
    const isAdmin = isAdminUser(user);
    const branchIdQ = Number(req.query.branchId) || null;
    const branchId = isAdmin ? branchIdQ : (user?.branchId || null);

    const [shipments, deliveryUsers, branches] = await Promise.all([
        shipmentModel.getForKanban(KANBAN_STATUS_IDS, { branchId }),
        userModel.search({ roleId: RoleType.DELIVERY.id, active: 'true' }),
        isAdmin ? branchModel.getAll() : Promise.resolve([]),
    ]);

    const columns = {};
    KANBAN_STATUS_IDS.forEach(sid => { columns[sid] = []; });
    shipments.forEach(s => { if (columns[s.statusId]) columns[s.statusId].push(s); });

    // Agrupar EN TRANSITO por transporte usando rutas activas
    const inTransitIds = columns[Status.IN_TRANSIT.id].map(s => s.id);
    let inTransitGroups = [];
    if (inTransitIds.length > 0) {
        const { RouteStop } = require('../models/routeStop');
        const { Route, RouteStatus } = require('../models/route');
        const { Transport } = require('../models/transport');
        const stops = await RouteStop.findAll({
            where: { shipmentId: inTransitIds, stopType: 'delivery' },
            include: [{
                model: Route,
                as: 'route',
                required: true,
                include: [{ model: Transport, as: 'transport', include: [{ model: userModel.User, as: 'driver', required: false }] }],
            }],
            order: [[{ model: Route, as: 'route' }, 'createdAt', 'DESC']],
        });
        // Preferir ruta activa (PLANNED/IN_ROUTE); fallback a la más reciente.
        const transportByShipment = new Map();
        const ACTIVE = new Set([RouteStatus.PLANNED, RouteStatus.IN_ROUTE]);
        for (const st of stops) {
            const t = st.route?.transport;
            if (!t) { continue; }
            const existing = transportByShipment.get(st.shipmentId);
            if (!existing) {
                transportByShipment.set(st.shipmentId, t);
            } else if (!ACTIVE.has(existing._routeStatus) && ACTIVE.has(st.route.statusId)) {
                t._routeStatus = st.route.statusId;
                transportByShipment.set(st.shipmentId, t);
            }
            if (transportByShipment.get(st.shipmentId) === t) {
                t._routeStatus = st.route.statusId;
            }
        }
        const groupMap = new Map();
        const transitShipments = [];
        for (const s of columns[Status.IN_TRANSIT.id]) {
            const t = transportByShipment.get(s.id);
            if (!t) { continue; } // ocultar envíos sin transporte
            const key = `t-${t.id}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, {
                    key,
                    transportName: t.name,
                    plate: t.plate || '',
                    driverName: t.driver?.fullName || s.deliveryUser?.fullName || '',
                    shipments: [],
                });
            }
            groupMap.get(key).shipments.push(s);
            transitShipments.push(s);
        }
        // Reemplazar la columna IN_TRANSIT con solo los envíos que tienen transporte
        columns[Status.IN_TRANSIT.id] = transitShipments;
        inTransitGroups = Array.from(groupMap.values());
    }

    const driversJson = JSON.stringify(
        deliveryUsers.map(u => ({ id: u.id, fullName: u.fullName }))
    );

    res.render('shipment/kanban', { columns, driversJson, inTransitGroups, branches, branchId, isAdmin });
};

const getQR = async (req, res) => {
    try {
        const { id } = req.params;
        const shipment = await shipmentModel.getById(id);
        if (!shipment) return res.status(404).send('Envío no encontrado');
        const scanUrl = `${req.protocol}://${req.get('host')}/scan/${shipment.trackingId}`;
        const buffer = await QRCode.toBuffer(scanUrl, { width: 300, margin: 2 });
        const appUrl = process.env.APP_URL || 'https://logitrack-prototype.onrender.com';
        const qrContent = `${appUrl}/delivery/evidence/${shipment.trackingId}`;
        res.setHeader('Content-Type', 'image/png');
        res.send(buffer);
    } catch (err) {
        console.error('ERROR getQR:', err.message);
        res.status(500).send('Error al generar QR');
    }
};

const getLabel = async (req, res) => {
    try {
        const { id } = req.params;
        const shipment = await shipmentModel.getById(id);
        if (!shipment) { return res.status(404).send('Envío no encontrado'); }
        res.render('shipment/label', { shipment });
    } catch (err) {
        console.error('ERROR getLabel:', err.message);
        res.status(500).send('Error al generar etiqueta');
    }
};

const calculateInitialPriority = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const originUbication = {
        latitude: res.locals.currentUser?.branch?.latitude,
        longitude: res.locals.currentUser?.branch?.longitude,
    };

    const data = {
        weight: req.body.weight,
        type: req.body.type,
        destinationUbication: req.body.destinationUbication,
        originUbication
    };

    return res.json({ priority: calInitialPriority(data) });
};

function calInitialPriority(data) {
    if (Number(data.type) === ShipmentType.EXPRESS.id) return ShipmentPriority.URGENT.id;

    let priority = ShipmentPriority.LOW.id;
    const weight = parseFloat(data.weight) || 0;

    if (weight >= 100) priority += 1;
    else if (weight >= 50) priority += 0.4;

    const distance = calculateDistance(data.destinationUbication, data.originUbication);

    if (distance >= 200) priority += 1;
    else if (distance >= 100) priority += 0.5;
    else priority += 0.2;

    if (priority > ShipmentPriority.URGENT.id) priority = ShipmentPriority.URGENT.id;

    return Math.round(priority);
}

function calculateDistance(destinationUbication, originUbication) {
    const lat1 = originUbication?.latitude;
    const lon1 = originUbication?.longitude;
    const lat2 = destinationUbication?.lat;
    const lon2 = destinationUbication?.lng;

    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;

    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

async function resolveShipmentForNotification(shipmentOrId) {
    if (shipmentOrId && typeof shipmentOrId === 'object' && shipmentOrId.sender && shipmentOrId.recipient) {
        return shipmentOrId;
    }
    const id = typeof shipmentOrId === 'object' ? shipmentOrId.id : shipmentOrId;
    return shipmentModel.getById(id);
}

// NFAL07 (LGT-158): eventos cuyo email lleva el link de autogestión accionable.
// Al enviarlos se "arma" el token (vence en N días, rearmado para un uso).
const ACTIONABLE_SELF_SERVICE_EVENTS = new Set([
    NotificationEvent.SHIPMENT_FAILED_ATTEMPT,
    NotificationEvent.SHIPMENT_DELAYED,
    NotificationEvent.SHIPMENT_RETURNED_BRANCH,
]);

async function notifyShipmentEvent(eventCode, shipmentOrId, extraVars = {}) {
    try {
        const cfg = await notificationConfigModel.getConfigByEvent(eventCode);
        if (!cfg || !cfg.enabled) { return; }

        const template = await emailTemplateModel.getTemplateByEventCode(eventCode);
        if (!template) { return; }

        const shipment = await resolveShipmentForNotification(shipmentOrId);
        if (!shipment) { return; }

        const mode = cfg.recipientMode || 'recipient';
        const recipients = [];
        if ((mode === 'recipient' || mode === 'both') && shipment.recipient?.email) { recipients.push(shipment.recipient.email); }
        if ((mode === 'sender'    || mode === 'both') && shipment.sender?.email)    { recipients.push(shipment.sender.email);    }
        if (mode === 'custom' && cfg.customEmail)                                   { recipients.push(cfg.customEmail);           }

        if (recipients.length === 0) {
            console.warn(`notifyShipmentEvent: ${eventCode} sin destinatarios (mode=${mode})`);
            return;
        }

        // NFAL07: arma el link accionable cuando efectivamente se envía el aviso.
        if (ACTIONABLE_SELF_SERVICE_EVENTS.has(eventCode)) {
            shipmentModel.armSelfServiceToken(shipment.id)
                .catch(e => console.error('notifyShipmentEvent armSelfServiceToken:', e.message));
        }

        // Catálogo de datos del envío + variables custom del cliente + variables extra (ej. contexto de incidencia).
        const vars = { ...placeholders.buildVars(shipment), ...await notificationVariableModel.getAllAsMap(), ...extraVars };
        if (eventCode === NotificationEvent.SHIPMENT_FAILED_ATTEMPT) {
            const attempts = await failedAttemptModel.getByShipmentId(shipment.id);
            const latest = attempts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            vars.failedReason = latest?.reason || '';
        }
        if (eventCode === NotificationEvent.SHIPMENT_DELAYED) {
            const expected = new Date(shipment.expectedDeliveryDate);
            const diffMs = Date.now() - expected.getTime();
            const diffDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            vars.daysDelayed = String(diffDays);
        }
        // Avisos sobre una incidencia ya creada (paquete dañado / incidencia / cambio de
        // estado): el enlace debe llevar a ESA incidencia, no al alta de una nueva.
        const INCIDENT_EVENTS = [NotificationEvent.SHIPMENT_INCIDENT, NotificationEvent.SHIPMENT_PACKAGE_FAILED, NotificationEvent.SHIPMENT_PACKAGE_DAMAGED];
        if (!vars._incidentId && INCIDENT_EVENTS.includes(eventCode)) {
            try {
                const { Incident } = require('../models/incident');
                const inc = await Incident.findOne({ where: { shipmentId: shipment.id }, order: [['id', 'DESC']] });
                if (inc) { vars._incidentId = String(inc.id); }
            } catch { /* sin incidencia → queda el enlace de alta */ }
        }
        if (vars._incidentId) {
            vars.incidentUrl = `${placeholders.baseUrl()}/portal/mis-envios/incidencia/${vars._incidentId}`;
        }
        const fill = (s) => placeholders.render(s, vars);

        // LGT-219: el evento se envía por los canales configurados (multi-selección).
        // Default 'email' preserva el comportamiento previo. In-app no aplica a eventos de
        // envío (el destinatario es el cliente, un Person, no un usuario del sistema); ese
        // canal lo consumen los eventos internos (ver LGT-89).
        const channels = String(cfg.channels || 'email').split(',').map(s => s.trim()).filter(Boolean);
        const wantEmail = channels.length === 0 || channels.includes('email');
        const wantSms   = channels.includes('sms');

        if (wantEmail) {
            await queueEmail({
                recipient: recipients.join(','),
                subject:   fill(template.subject),
                body:      fill(template.body),
                format:    template.format || 'text',
            });
        }

        if (wantSms) {
            // Esc.3/4: SMS real por Twilio al teléfono del destinatario según el modo;
            // si no tiene teléfono o no hay credenciales, se omite (los demás canales igual van).
            const { sendSms } = require('../services/notification/smsSender');
            const phones = [];
            if ((mode === 'recipient' || mode === 'both') && shipment.recipient?.phone) { phones.push(shipment.recipient.phone); }
            if ((mode === 'sender'    || mode === 'both') && shipment.sender?.phone)    { phones.push(shipment.sender.phone);    }
            const smsText = fill(template.subject);
            phones.forEach((ph) => { sendSms(ph, smsText).catch((e) => console.error('[sms] notify:', e.message)); });
        }
    } catch (err) {
        console.error('notifyShipmentEvent error:', err.message);
    }
}

// Wrapper legacy — algunos llamadores usaban data={recipientEmail,...}
async function notifyRecipient(eventCode, dataOrShipment) {
    if (dataOrShipment && (dataOrShipment.sender || dataOrShipment.recipient || dataOrShipment.id)) {
        return notifyShipmentEvent(eventCode, dataOrShipment);
    }
    // Compatibilidad mínima: si solo viene email suelto, mandar usando template sin recipient_mode
    const cfg = await notificationConfigModel.getConfigByEvent(eventCode);
    if (!cfg || !cfg.enabled) { return; }
    const template = await emailTemplateModel.getTemplateByEventCode(eventCode);
    if (!template || !dataOrShipment?.recipientEmail) { return; }
    const vars = {
        ...await notificationVariableModel.getAllAsMap(),
        fullName:     dataOrShipment.recipientFullName || '',
        trackingCode: dataOrShipment.shipmentTrackingCode || '',
    };
    const fill = (s) => placeholders.render(s, vars);
    await queueEmail({
        recipient: dataOrShipment.recipientEmail,
        subject:   fill(template.subject),
        body:      fill(template.body),
        format:    template.format || 'text',
    });
}

const importPreviews = new Map();
const importReports = new Map();
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const REPORT_TTL_MS = 60 * 60 * 1000;

const cleanupExpired = (map, ttl) => {
    const now = Date.now();
    for (const [id, entry] of map.entries()) {
        if (now - entry.createdAt > ttl) {
            map.delete(id);
        }
    }
};

const showImportForm = (req, res) => {
    res.render('shipment/import', { result: null, error: null });
};

const processImportPreview = async (req, res) => {
    if (!req.file) {
        return res.render('shipment/import', {
            result: null,
            error: 'Debe seleccionar un archivo CSV',
        });
    }

    const analysis = await csvImport.analyzeBuffer(req.file.buffer);

    cleanupExpired(importPreviews, PREVIEW_TTL_MS);
    const previewId = crypto.randomUUID();
    importPreviews.set(previewId, {
        analysis,
        filename: req.file.originalname,
        createdAt: Date.now(),
    });

    res.render('shipment/import-preview', {
        previewId,
        analysis,
        filename: req.file.originalname,
    });
};

const commitImport = async (req, res) => {
    cleanupExpired(importPreviews, PREVIEW_TTL_MS);
    const previewId = req.body.previewId;
    const entry = importPreviews.get(previewId);
    if (!entry) {
        return res.status(410).render('shipment/import', {
            result: null,
            error: 'El preview expiró o no existe. Volvé a subir el archivo.',
        });
    }

    const userId = res.locals.currentUser?.id || null;
    const force = req.body.force === 'true';

    const commit = await csvImport.commitAnalysis(entry.analysis, { userId, includeDuplicates: force });

    const result = csvImport.buildResultFromAnalysisAndCommit(entry.analysis, commit);

    try {
        await shipmentImportModel.create({
            userId,
            filename: entry.filename,
            totalRows: entry.analysis.total,
            importedCount: commit.imported.length,
            errorCount: result.errors.length,
            duplicateCount: entry.analysis.summary.duplicates,
            forced: force,
            aborted: entry.analysis.aborted,
        });
    } catch (err) {
        console.error('ERROR persistiendo shipment_import:', err.message);
    }

    importPreviews.delete(previewId);

    let reportId = null;
    if (result.errors.length > 0) {
        cleanupExpired(importReports, REPORT_TTL_MS);
        reportId = crypto.randomUUID();
        importReports.set(reportId, {
            csv: csvImport.buildErrorReportCsv(result.errors),
            createdAt: Date.now(),
        });
    }

    res.render('shipment/import-result', { result, reportId, error: null });
};

const downloadImportReport = (req, res) => {
    cleanupExpired(importReports, REPORT_TTL_MS);
    const entry = importReports.get(req.params.id);
    if (!entry) {
        return res.status(404).send('El reporte expiró o no existe');
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="errores-import-${req.params.id}.csv"`);
    res.send(entry.csv);
};

const showImportHistory = async (req, res) => {
    const imports = await shipmentImportModel.getAll({ limit: 100 });
    res.render('shipment/import-history', { imports });
};

const exportShipments = async (req, res) => {
    try {
        const shipments = await shipmentModel.getAll();
        const csv = csvExport.buildShipmentsCsv(shipments);
        const today = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="envios-${today}.csv"`);
        res.send(csv);
    } catch (err) {
        console.error('ERROR exportShipments:', err.message);
        res.status(500).send('Error al exportar envíos');
    }
};

module.exports = { home, getDetail, getNewShipmentForm, getUpdateShipment, createShipment, updateShipment, updateShipmentStatus, searchShipments, assignDelivery, prepareShipment, cancelShipment, markPackageFailed, getKanban, getQR, getLabel, showImportForm, processImportPreview, commitImport, downloadImportReport, showImportHistory, exportShipments, calculateInitialPriority, notifyShipmentEvent };
