const { parse } = require('csv-parse/sync');

const personModel          = require('../models/person');
const addressModel         = require('../models/address');
const shipmentModel        = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const { validate }         = require('./shipmentRowValidator');
const { geocodeAddress, GeocodeError } = require('./geocode');

const MAX_ROWS = 1000;
const GEOCODE_THROTTLE_MS = 250;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseBuffer = (buffer) => {
    return parse(buffer, {
        columns:           true,
        trim:              true,
        skip_empty_lines:  true,
        bom:               true,
        relax_column_count: false,
    });
};

const processRow = async (row, rowNumber, userId, deps) => {
    const { validate: validateRow, geocode } = deps;

    const validation = validateRow(row);
    if (!validation.ok) {
        return {
            ok: false,
            row: rowNumber,
            raw: row,
            errors: validation.errors.map(e => ({ field: e.field, message: e.message })),
        };
    }

    const data = validation.normalized;

    let coords;
    try {
        coords = await geocode({
            street:     data.street,
            number:     data.number,
            provinceId: data.provinceId,
        });
    } catch (err) {
        const message = err instanceof GeocodeError ? err.message : `Error de geocodificación: ${err.message}`;
        return {
            ok: false,
            row: rowNumber,
            raw: row,
            errors: [{ field: 'address', message }],
        };
    }

    try {
        const sender = await personModel.createOrUpdate({
            name:     data.senderName,
            document: data.senderDocument,
            phone:    data.senderPhone,
            email:    data.senderEmail,
        });

        const recipient = await personModel.createOrUpdate({
            name:     data.recipientName,
            document: data.recipientDocument,
            phone:    data.recipientPhone,
            email:    data.recipientEmail,
        });

        const address = await addressModel.create({
            street:         data.street,
            number:         data.number,
            provinceId:     data.provinceId,
            postalCode:     data.postalCode || coords.postalCode || null,
            floorApartment: data.floorApartment,
            lat:            coords.lat,
            lng:            coords.lng,
        });

        const shipment = await shipmentModel.create({
            senderId:       sender.id,
            recipientId:    recipient.id,
            addressId:      address.id,
            shipmentTypeId: data.shipmentTypeId,
            weightKg:       data.weightKg,
            packageQty:     data.packageQty,
            statusId:       data.statusId,
        });

        await shipmentHistoryModel.create({
            shipmentId:   shipment.id,
            fromStatusId: null,
            toStatusId:   shipment.statusId,
            eventType:    'CREATED',
            comment:      'Importación masiva CSV — envío histórico',
            userId:       userId || null,
        });

        return {
            ok: true,
            row: rowNumber,
            shipment: { id: shipment.id, trackingId: shipment.trackingId },
        };
    } catch (err) {
        return {
            ok: false,
            row: rowNumber,
            raw: row,
            errors: [{ field: 'database', message: `Error al insertar: ${err.message}` }],
        };
    }
};

const processBuffer = async (buffer, { userId, deps = {}, throttleMs = GEOCODE_THROTTLE_MS } = {}) => {
    const validateRow = deps.validate || validate;
    const geocode     = deps.geocode  || geocodeAddress;

    let rows;
    try {
        rows = parseBuffer(buffer);
    } catch (err) {
        return {
            total:    0,
            imported: [],
            errors:   [{ row: 0, field: 'csv', message: `CSV mal formado: ${err.message}` }],
            aborted:  true,
        };
    }

    if (rows.length === 0) {
        return {
            total:    0,
            imported: [],
            errors:   [{ row: 0, field: 'csv', message: 'El archivo no contiene filas' }],
            aborted:  true,
        };
    }

    if (rows.length > MAX_ROWS) {
        return {
            total:    rows.length,
            imported: [],
            errors:   [{ row: 0, field: 'csv', message: `El archivo supera el límite de ${MAX_ROWS} filas` }],
            aborted:  true,
        };
    }

    const imported = [];
    const errors   = [];

    for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2; // +1 por 1-based, +1 por header
        const result = await processRow(rows[i], rowNumber, userId, { validate: validateRow, geocode });
        if (result.ok) {
            imported.push(result.shipment);
        } else {
            for (const e of result.errors) {
                errors.push({ row: result.row, field: e.field, message: e.message, raw: result.raw });
            }
        }
        if (i < rows.length - 1 && throttleMs > 0) {
            await sleep(throttleMs);
        }
    }

    return {
        total:    rows.length,
        imported,
        errors,
        aborted:  false,
    };
};

const buildErrorReportCsv = (errors) => {
    const header = 'fila,campo,mensaje';
    const escape = (v) => {
        if (v === null || v === undefined) { return ''; }
        const s = String(v);
        if (/[",\n]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };
    const lines = errors.map(e => [escape(e.row), escape(e.field), escape(e.message)].join(','));
    return [header, ...lines].join('\n');
};

module.exports = { processBuffer, buildErrorReportCsv, MAX_ROWS };
