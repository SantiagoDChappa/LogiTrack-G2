const crypto               = require('crypto');
const QRCode               = require('qrcode');
const shipmentModel        = require('../models/shipment');
const personModel          = require('../models/person');
const provinceModel        = require('../models/province');
const addressModel         = require('../models/address');
const statusModel          = require('../models/status');
const shipmentHistoryModel = require('../models/shipmentHistory');
const typeShipmentModel    = require('../models/typeShipment');
const settingModel         = require('../models/setting');
const userModel            = require('../models/user');
const { PROVINCES }        = require('../utils/provinces');
const { notifyStatusChange } = require('../utils/notifications');
const { RoleType, Status }   = require('../constants/enums');
const { validationResult }   = require('express-validator');
const csvImport            = require('../services/csvImport');
const csvExport            = require('../services/csvExport');
const shipmentImportModel  = require('../models/shipmentImport');
const { resolveUserBranchCoords } = require('../utils/eventLocation');
const stateMachine         = require('../services/shipmentStateMachine');

const renderStateMachineError = (err, res, redirectUrl) => {
    if (err && err.name === 'StateMachineError') {
        const map = {
            INVALID_TRANSITION: 422,
            FORBIDDEN_ROLE:     403,
            COMMENT_REQUIRED:   400,
            SHIPMENT_NOT_FOUND: 404,
        };
        const status = map[err.code] || 400;
        const qs = `smError=${encodeURIComponent(err.code)}&smMsg=${encodeURIComponent(err.message)}`;
        return res.status(status).redirect(`${redirectUrl}?${qs}`);
    }
    return null;
};

const home = async (req, res) => {
    const statuses = await statusModel.getAll();
    res.render('shipment/index', { shipments: [], query: {}, statuses });
};

const searchShipments = async (req, res) => {
    const { trackingId, role, name, document, senderName, senderDocument, recipientName, recipientDocument, statusIds } = req.query;
    const query = {
        trackingId,
        role,
        name:              name?.trim(),
        document:          document?.trim(),
        senderName:        senderName?.trim(),
        senderDocument:    senderDocument?.trim(),
        recipientName:     recipientName?.trim(),
        recipientDocument: recipientDocument?.trim(),
        statusIds:         statusIds ? [].concat(statusIds) : []
    };
    const [shipments, statuses] = await Promise.all([
        shipmentModel.search(query),
        statusModel.getAll()
    ]);
    res.render('shipment/index', { shipments, query, statuses });
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

    const destProv = PROVINCES[shipment.address.provinceId];
    const destLat  = shipment.address.lat  || (destProv ? destProv.lat  : null);
    const destLng  = shipment.address.lng  || (destProv ? destProv.lng  : null);
    const stops = history
        .filter(h => h.latitude !== null && h.latitude !== undefined && h.longitude !== null && h.longitude !== undefined)
        .map(h => {
            const isPOD = h.eventType === 'POD' || (h.toStatus && h.toStatus.id === Status.DELIVERED.id);
            const branchName = h.branch?.name || null;
            return {
                lat:       Number(h.latitude),
                lng:       Number(h.longitude),
                label:     isPOD ? 'Entrega final (GPS)' : (branchName || h.eventType),
                status:    h.toStatus?.description || '',
                timestamp: h.changedAt,
                isPOD,
                isCreated: h.eventType === 'CREATED',
            };
        });
    const firstBranchEvent = history.find(h => h.branch);
    const originBranch     = firstBranchEvent?.branch || null;
    const mapData = {
        origin: originBranch ? {
            lat:   Number(originBranch.latitude),
            lng:   Number(originBranch.longitude),
            label: `Sucursal ${originBranch.name}`,
        } : {
            lat:   parseFloat(originLat)  || -34.6037,
            lng:   parseFloat(originLng)  || -58.3816,
            label: [originStreet, originNumber].filter(Boolean).join(' ') || 'Origen',
        },
        destination: destLat ? {
            lat:   destLat,
            lng:   destLng,
            label: [shipment.address.street, shipment.address.number].filter(Boolean).join(' ')
                   || (destProv ? destProv.name : ''),
        } : null,
        stops,
    };

    const returnUrl   = req.query.from || '/shipment';
    const returnLabel = req.query.fromLabel || 'Administrador de envíos';
    res.render('shipment/detail', { shipment, history, mapData, returnUrl, returnLabel });
};

const getNewShipmentForm = async (req, res) => {
    const provinces     = await provinceModel.getAll();
    const typesShipment = await typeShipmentModel.getAll();
    res.render('shipment/new', { errors: [], body: {}, provinces, typesShipment });
};

const createShipment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const provinces = await provinceModel.getAll();
    const typesShipment = await typeShipmentModel.getAll();
    return res.render('shipment/new', { 
        errors: errors.array().map(e => e.msg), 
        body: req.body, 
        provinces, 
        typesShipment 
    });
  }

  try {
    const body = req.body;
    if (parseFloat(body.weightKg) <= 0) { throw new Error('El peso debe ser mayor a 0'); }
    if (parseInt(body.packageQty) <= 0) { throw new Error('La cantidad de bultos debe ser al menos 1'); }

    const sender = await personModel.createOrUpdate({
        name:         body.senderName,
        document:     body.senderDocument,
        phone:        body.senderPhone,
        email:        body.senderEmail
    });

    const recipient = await personModel.createOrUpdate({
        name:         body.recipientName,
        document:     body.recipientDocument,
        phone:        body.recipientPhone,
        email:        body.recipientEmail
    });

    const address = await addressModel.create({
        street:         body.street,
        number:         body.number,
        provinceId:     body.province,
        postalCode:     body.postalCode,
        floorApartment: body.floorApartment,
        lat:            body.addressLat ? parseFloat(body.addressLat) : null,
        lng:            body.addressLng ? parseFloat(body.addressLng) : null,
    });

    const shipment = await shipmentModel.create({
        senderId:       sender.id,
        recipientId:    recipient.id,
        addressId:      address.id,
        shipmentTypeId: body.shipmentTypeId || null,
        weightKg:       body.weightKg       || null,
        packageQty:     body.packageQty      || null,
        volumeM3:       body.volumeM3        || null,
    });

    const creatorCoords = await resolveUserBranchCoords(res.locals.currentUser?.id);
    await shipmentHistoryModel.create({
        shipmentId:   shipment.id,
        fromStatusId: null,
        toStatusId:   shipment.statusId,
        eventType:    'CREATED',
        userId:       res.locals.currentUser?.id || null,
        branchId:     creatorCoords.branchId,
        latitude:     creatorCoords.latitude,
        longitude:    creatorCoords.longitude,
    });

    res.redirect(`/shipment/detail/${shipment.id}?created=true`);
  } catch (err) {
    console.error('ERROR createShipment:', err.message);
    const provinces     = await provinceModel.getAll();
    const typesShipment = await typeShipmentModel.getAll();
    res.render('shipment/new', { 
        errors: [err.message], 
        body: req.body, 
        provinces, 
        typesShipment 
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
  const destLat  = shipment.address.lat  || (destProv ? destProv.lat  : null);
  const destLng  = shipment.address.lng  || (destProv ? destProv.lng  : null);
  const mapData = {
      origin: {
          lat:   parseFloat(originLat)  || -34.6037,
          lng:   parseFloat(originLng)  || -58.3816,
          label: [originStreet, originNumber].filter(Boolean).join(' ') || 'Origen',
      },
      destination: destLat ? {
          lat:   destLat,
          lng:   destLng,
          label: [shipment.address.street, shipment.address.number].filter(Boolean).join(' ') || (destProv ? destProv.name : ''),
      } : null,
  };

  const returnUrl = req.query.from || '/shipment';
  const currentUser = res.locals.currentUser;
  const canChangeStatus = [RoleType.SUPERVISOR.id, RoleType.OPERATOR.id, RoleType.ADMIN.id].includes(currentUser?.roleId);
  const availableActions = stateMachine.getAvailableActions({ shipment, actor: currentUser });
  res.render('shipment/update', { errors: [], shipment, provinces, statuses, history, typesShipment, mapData, deliveryUsers, returnUrl, isSupervisor: canChangeStatus, availableActions });
};

const updateShipment = async (req, res) => {
  try {
    const { id }      = req.params;
    const body        = { ...req.body, id };
    const currentUser = res.locals.currentUser;
    const isOperator  = currentUser.roleId === RoleType.OPERATOR.id;

    const shipment = await shipmentModel.getById(id);
    if (!shipment) { return res.status(404).send('Envío no encontrado'); }

    if (isOperator && (shipment.statusId === Status.DELIVERED.id || shipment.statusId === Status.CANCELLED.id)) {
      return res.redirect(`/shipment/update/${id}`);
    }

    if (body.newStatusId) {
      const targetStatusId = Number(body.newStatusId);

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
              const destLat  = shipment.address?.lat  || (destProv ? destProv.lat  : null);
              const destLng  = shipment.address?.lng  || (destProv ? destProv.lng  : null);
              const mapData = {
                  origin: {
                      lat:   parseFloat(originLat)  || -34.6037,
                      lng:   parseFloat(originLng)  || -58.3816,
                      label: [originStreet, originNumber].filter(Boolean).join(' ') || 'Origen',
                  },
                  destination: destLat ? {
                      lat:   destLat,
                      lng:   destLng,
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
      if (shipment.statusId !== targetStatusId) {
        const actorCoords = await resolveUserBranchCoords(currentUser?.id);
        await shipmentHistoryModel.create({
          shipmentId:   id,
          fromStatusId: shipment.statusId,
          toStatusId:   Number(body.newStatusId),
          comment:      body.statusComment || null,
          userId:       currentUser?.id    || null,
          eventType:    'STATUS_CHANGE',
          branchId:     actorCoords.branchId,
          latitude:     actorCoords.latitude,
          longitude:    actorCoords.longitude,
        });

        await shipmentModel.updateStatus(id, Number(body.newStatusId));
        if (newStatus) { notifyStatusChange(shipment, newStatus.description); }
      }
    }

    if (isOperator) {
      body.street         = shipment.address.street;
      body.number         = shipment.address.number;
      body.province       = shipment.address.provinceId;
      body.postalCode     = shipment.address.postalCode;
      body.floorApartment = shipment.address.floorApartment;
      body.addressLat     = shipment.address.lat;
      body.addressLng     = shipment.address.lng;
      body.weightKg       = shipment.weightKg;
      body.packageQty     = shipment.packageQty;
      body.shipmentTypeId = shipment.shipmentTypeId;
    }

    if (shipment.statusId === Status.IN_TRANSIT.id) {
      body.deliveryUserId = shipment.deliveryUserId;
    }

    await shipmentModel.update(body);
    res.redirect('/shipment?success=2');
  } catch (err) {
    console.error('ERROR updateShipment:', err.message);
    res.status(500).send('Error interno al actualizar el envío');
  }
};

const updateShipmentStatus = async (req, res) => {
  try {
    const { id }                   = req.params;
    const { newStatusId, comment } = req.body;
    const [shipment, newStatus]    = await Promise.all([
        shipmentModel.getById(id),
        statusModel.getById(Number(newStatusId)),
    ]);

    const actorCoords = await resolveUserBranchCoords(res.locals.currentUser?.id);
    await shipmentHistoryModel.create({
        shipmentId:   id,
        fromStatusId: shipment.statusId,
        toStatusId:   Number(newStatusId),
        comment:      comment || null,
        userId:       res.locals.currentUser?.id || null,
        eventType:    'STATUS_CHANGE',
        branchId:     actorCoords.branchId,
        latitude:     actorCoords.latitude,
        longitude:    actorCoords.longitude,
    });

    await shipmentModel.updateStatus(id, Number(newStatusId));

// Si se marca como Entregado, actualizar resultado real de la predicción
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
        const { id }             = req.params;
        const { deliveryUserId } = req.body;
        const currentUser        = res.locals.currentUser;

        await stateMachine.assignDelivery({
            shipmentId: Number(id),
            deliveryUserId: deliveryUserId || null,
            actor: currentUser,
        });

        const fresh = await shipmentModel.getById(id);
        const newStatus = await statusModel.getById(fresh.statusId);
        if (newStatus) { notifyStatusChange(fresh, newStatus.description); }

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
        const { id }      = req.params;
        const currentUser = res.locals.currentUser;

        await stateMachine.transition({
            shipmentId: Number(id),
            toStatusId: Status.IN_PREPARATION.id,
            actor: currentUser,
        });

        const fresh = await shipmentModel.getById(id);
        notifyStatusChange(fresh, Status.IN_PREPARATION.description);

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
        const { id }      = req.params;
        const { comment } = req.body;
        const currentUser = res.locals.currentUser;

        await stateMachine.transition({
            shipmentId: Number(id),
            toStatusId: Status.CANCELLED.id,
            actor: currentUser,
            comment,
        });

        const fresh = await shipmentModel.getById(id);
        notifyStatusChange(fresh, Status.CANCELLED.description);

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
        const { id }      = req.params;
        const { comment } = req.body;
        const currentUser = res.locals.currentUser;

        await stateMachine.transition({
            shipmentId: Number(id),
            toStatusId: Status.PACKAGE_FAILED.id,
            actor: currentUser,
            comment,
        });

        const fresh = await shipmentModel.getById(id);
        notifyStatusChange(fresh, Status.PACKAGE_FAILED.description);

        res.redirect(`/shipment/update/${id}?success=6`);
    } catch (err) {
        const handled = renderStateMachineError(err, res, `/shipment/update/${req.params.id}`);
        if (handled) { return; }
        console.error('ERROR markPackageFailed:', err.message);
        res.status(500).send('Error interno al marcar paquete fallido');
    }
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

// ── Importación masiva por CSV (LGT-102) ─────────────────────────────────────
// Estado en memoria con TTL: previews del análisis (30 min) y reportes de errores
// post-commit (1h). Se limpian al insertar nuevas entradas.
const importPreviews = new Map();
const importReports  = new Map();
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const REPORT_TTL_MS  = 60 * 60 * 1000;

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
            error:  'Debe seleccionar un archivo CSV',
        });
    }

    const analysis = await csvImport.analyzeBuffer(req.file.buffer);

    cleanupExpired(importPreviews, PREVIEW_TTL_MS);
    const previewId = crypto.randomUUID();
    importPreviews.set(previewId, {
        analysis,
        filename:  req.file.originalname,
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
            error:  'El preview expiró o no existe. Volvé a subir el archivo.',
        });
    }

    const userId = res.locals.currentUser?.id || null;
    const force  = req.body.force === 'true';

    const commit = await csvImport.commitAnalysis(entry.analysis, { userId, includeDuplicates: force });

    const result = csvImport.buildResultFromAnalysisAndCommit(entry.analysis, commit);

    try {
        await shipmentImportModel.create({
            userId,
            filename:       entry.filename,
            totalRows:      entry.analysis.total,
            importedCount:  commit.imported.length,
            errorCount:     result.errors.length,
            duplicateCount: entry.analysis.summary.duplicates,
            forced:         force,
            aborted:        entry.analysis.aborted,
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
            csv:       csvImport.buildErrorReportCsv(result.errors),
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
    res.setHeader('Content-Type',        'text/csv; charset=utf-8');
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
        res.setHeader('Content-Type',        'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="envios-${today}.csv"`);
        res.send(csv);
    } catch (err) {
        console.error('ERROR exportShipments:', err.message);
        res.status(500).send('Error al exportar envíos');
    }
};

module.exports = { home, getDetail, getNewShipmentForm, getUpdateShipment, createShipment, updateShipment, searchShipments, assignDelivery, prepareShipment, cancelShipment, markPackageFailed, getQR, getLabel, showImportForm, processImportPreview, commitImport, downloadImportReport, showImportHistory, exportShipments };
