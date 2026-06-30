const { parse } = require('csv-parse/sync');

const personModel          = require('../models/person');
const addressModel         = require('../models/address');
const shipmentModel        = require('../models/shipment');
const shipmentHistoryModel = require('../models/shipmentHistory');
const userModel            = require('../models/user');
const { RoleType }         = require('../constants/enums');
const { validate }         = require('./shipmentRowValidator');
const { geocodeAddress, GeocodeError } = require('./geocode');
const zoneResolver         = require('./zoneResolver.service');

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

const buildFingerprint = (data) => {
    if (data.legacyTrackingId) {
        return `legacy:${data.legacyTrackingId.toLowerCase()}`;
    }
    return [
        'h',
        data.senderDocument,
        data.recipientDocument,
        String(data.street).toLowerCase().trim(),
        data.number,
        data.provinceId,
        data.statusId,
    ].join('|');
};

const analyzeRow = async (row, rowNumber, deps, intraCsv) => {
    const validation = deps.validate(row);
    if (!validation.ok) {
        return {
            rowNumber,
            status: 'invalid',
            raw:    row,
            errors: validation.errors.map(e => ({ field: e.field, message: e.message })),
        };
    }

    const data = validation.normalized;

    // Resolver repartidor si vino el DNI (opcional).
    let deliveryUserId = null;
    if (data.deliveryUserDocument) {
        const user = await deps.findUserByDocument(data.deliveryUserDocument);
        if (!user) {
            return {
                rowNumber,
                status: 'invalid',
                raw:    row,
                errors: [{
                    field:   'deliveryUserDocument',
                    message: `No se encontró un usuario con DNI ${data.deliveryUserDocument}`,
                }],
            };
        }
        if (user.roleId !== RoleType.DELIVERY.id) {
            return {
                rowNumber,
                status: 'invalid',
                raw:    row,
                errors: [{
                    field:   'deliveryUserDocument',
                    message: `El usuario con DNI ${data.deliveryUserDocument} no es un repartidor`,
                }],
            };
        }
        deliveryUserId = user.id;
    }

    let coords;
    try {
        coords = await deps.geocode({
            street:     data.street,
            number:     data.number,
            provinceId: data.provinceId,
        });
    } catch (err) {
        const message = err instanceof GeocodeError ? err.message : `Error de geocodificación: ${err.message}`;
        return {
            rowNumber,
            status: 'invalid',
            raw:    row,
            errors: [{ field: 'address', message }],
        };
    }

    const enriched = {
        ...data,
        lat:            coords.lat,
        lng:            coords.lng,
        postalCode:     data.postalCode || coords.postalCode || null,
        deliveryUserId,
    };

    // 1. Detección intra-CSV (mismo archivo)
    const fingerprint = buildFingerprint(enriched);
    if (intraCsv.has(fingerprint)) {
        const previousRow = intraCsv.get(fingerprint);
        return {
            rowNumber,
            status:      'duplicate',
            data:        enriched,
            duplicateOf: {
                source:    'csv',
                rowNumber: previousRow,
                reason:    enriched.legacyTrackingId
                    ? `Mismo legacyTrackingId que la fila ${previousRow}`
                    : `Misma combinación sender + recipient + dirección + estado que la fila ${previousRow}`,
            },
        };
    }

    // 2. Detección vs DB (legacyTrackingId primero, luego heurística)
    if (enriched.legacyTrackingId) {
        const existing = await deps.findByLegacyTrackingId(enriched.legacyTrackingId);
        if (existing) {
            intraCsv.set(fingerprint, rowNumber);
            return {
                rowNumber,
                status:      'duplicate',
                data:        enriched,
                duplicateOf: {
                    source:     'db',
                    trackingId: existing.trackingId,
                    reason:     `Ya existe un envío (${existing.trackingId}) con legacyTrackingId "${enriched.legacyTrackingId}"`,
                },
            };
        }
    }

    const heuristicMatch = await deps.findPotentialDuplicate({
        senderDocument:    enriched.senderDocument,
        recipientDocument: enriched.recipientDocument,
        street:            enriched.street,
        number:            enriched.number,
        provinceId:        enriched.provinceId,
        statusId:          enriched.statusId,
    });
    if (heuristicMatch) {
        intraCsv.set(fingerprint, rowNumber);
        return {
            rowNumber,
            status:      'duplicate',
            data:        enriched,
            duplicateOf: {
                source:     'db',
                trackingId: heuristicMatch.trackingId,
                reason:     `Coincide con ${heuristicMatch.trackingId} en sender + recipient + dirección + estado`,
            },
        };
    }

    intraCsv.set(fingerprint, rowNumber);
    return { rowNumber, status: 'ok', data: enriched };
};

const analyzeBuffer = async (buffer, { deps = {}, throttleMs = GEOCODE_THROTTLE_MS } = {}) => {
    const resolvedDeps = {
        validate:                deps.validate                || validate,
        geocode:                 deps.geocode                 || geocodeAddress,
        findByLegacyTrackingId:  deps.findByLegacyTrackingId  || shipmentModel.findByLegacyTrackingId,
        findPotentialDuplicate:  deps.findPotentialDuplicate  || shipmentModel.findPotentialDuplicate,
        findUserByDocument:      deps.findUserByDocument      || userModel.findByDocument,
    };

    let rows;
    try {
        rows = parseBuffer(buffer);
    } catch (err) {
        return {
            total:   0, aborted: true,
            summary: { ok: 0, invalid: 0, duplicates: 0 },
            rows:    [{ rowNumber: 0, status: 'invalid', errors: [{ field: 'csv', message: `CSV mal formado: ${err.message}` }] }],
        };
    }

    if (rows.length === 0) {
        return {
            total:   0, aborted: true,
            summary: { ok: 0, invalid: 0, duplicates: 0 },
            rows:    [{ rowNumber: 0, status: 'invalid', errors: [{ field: 'csv', message: 'El archivo no contiene filas' }] }],
        };
    }

    if (rows.length > MAX_ROWS) {
        return {
            total:   rows.length, aborted: true,
            summary: { ok: 0, invalid: 0, duplicates: 0 },
            rows:    [{ rowNumber: 0, status: 'invalid', errors: [{ field: 'csv', message: `El archivo supera el límite de ${MAX_ROWS} filas` }] }],
        };
    }

    const analyzedRows = [];
    const intraCsv = new Map();

    for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2; // +1 1-based, +1 header
        const result = await analyzeRow(rows[i], rowNumber, resolvedDeps, intraCsv);
        analyzedRows.push(result);
        if (i < rows.length - 1 && throttleMs > 0) {
            await sleep(throttleMs);
        }
    }

    const summary = analyzedRows.reduce((acc, r) => {
        if (r.status === 'ok')        { acc.ok++; }
        if (r.status === 'invalid')   { acc.invalid++; }
        if (r.status === 'duplicate') { acc.duplicates++; }
        return acc;
    }, { ok: 0, invalid: 0, duplicates: 0 });

    return { total: rows.length, aborted: false, summary, rows: analyzedRows };
};

const commitAnalysis = async (analysis, { userId, includeDuplicates = false } = {}) => {
    const imported = [];
    const errors   = [];

    const targetStatuses = includeDuplicates ? ['ok', 'duplicate'] : ['ok'];

    for (const row of analysis.rows) {
        if (!targetStatuses.includes(row.status)) { continue; }
        const data = row.data;

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
                postalCode:     data.postalCode,
                floorApartment: data.floorApartment,
                lat:            data.lat,
                lng:            data.lng,
            });

            const isTerminal = data.statusId === 4 || data.statusId === 5;
            const trackingPrefix = isTerminal ? 'HIST' : 'IENV';

            // Resolución automática de zona por CP/provincia. Si no matchea, queda en null.
            const resolvedZone = await zoneResolver.resolveZone({
                postalCode: data.postalCode,
                provinceId: data.provinceId,
            });

            const shipment = await shipmentModel.create({
                senderId:         sender.id,
                recipientId:      recipient.id,
                addressId:        address.id,
                shipmentTypeId:   data.shipmentTypeId,
                weightKg:         data.weightKg,
                packageQty:       data.packageQty,
                statusId:         data.statusId,
                legacyTrackingId: data.legacyTrackingId,
                deliveryUserId:   data.deliveryUserId || null,
                zoneId:           resolvedZone?.id || null,
                trackingPrefix,
            });

            await shipmentHistoryModel.create({
                shipmentId:   shipment.id,
                fromStatusId: null,
                toStatusId:   shipment.statusId,
                eventType:    'CREATED',
                comment:      isTerminal
                    ? 'Importación masiva CSV — envío histórico'
                    : 'Importación masiva CSV — envío activo importado',
                userId:       userId || null,
            });

            imported.push({ id: shipment.id, trackingId: shipment.trackingId, originalRow: row.rowNumber });
        } catch (err) {
            errors.push({
                row:     row.rowNumber,
                field:   'database',
                message: `Error al insertar: ${err.message}`,
                raw:     row.raw || row.data,
            });
        }
    }

    return { imported, errors };
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

// Compat: convierte un analysis + commit result al formato que espera la vista import-result.ejs (versión previa).
const buildResultFromAnalysisAndCommit = (analysis, commit) => {
    const errors = [];
    for (const row of analysis.rows) {
        if (row.status === 'invalid' && Array.isArray(row.errors)) {
            for (const e of row.errors) {
                errors.push({ row: row.rowNumber, field: e.field, message: e.message, raw: row.raw });
            }
        }
    }
    for (const e of commit.errors) {
        errors.push(e);
    }
    return {
        total:    analysis.total,
        imported: commit.imported,
        errors,
        aborted:  analysis.aborted,
    };
};

module.exports = {
    analyzeBuffer,
    commitAnalysis,
    buildErrorReportCsv,
    buildResultFromAnalysisAndCommit,
    buildFingerprint,
    MAX_ROWS,
};
