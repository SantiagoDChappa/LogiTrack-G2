const { findProvinceByState } = require('../utils/provinces');
const { Status } = require('../constants/enums');

// Solo se permiten estados terminales en la importación (envíos históricos).
// Aliases por id para tolerar variantes en español/inglés y mayúsculas.
const STATUS_ALIASES = {
    [Status.DELIVERED.id]: ['delivered', 'entregado', 'entregada', String(Status.DELIVERED.id)],
    [Status.CANCELLED.id]: ['cancelled', 'canceled', 'cancelado', 'cancelada', String(Status.CANCELLED.id)],
};

const ALLOWED_STATUS_LABEL = `${Status.DELIVERED.description} o ${Status.CANCELLED.description}`;

const isInt = (v) => /^-?\d+$/.test(String(v).trim());
const isFloat = (v) => /^-?\d+(\.\d+)?$/.test(String(v).trim());
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

const stripDiacritics = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const resolveStatusId = (raw) => {
    if (raw === undefined || raw === null || String(raw).trim() === '') { return null; }
    const norm = stripDiacritics(String(raw).trim().toLowerCase());
    for (const [id, aliases] of Object.entries(STATUS_ALIASES)) {
        if (aliases.includes(norm)) { return parseInt(id, 10); }
    }
    return null;
};

const required = (value, field, label) => {
    if (value === undefined || value === null || String(value).trim() === '') {
        return `${label} es obligatorio`;
    }
    return null;
};

const maxLen = (value, field, label, max) => {
    if (String(value).length > max) {
        return `${label} no puede superar ${max} caracteres`;
    }
    return null;
};

const validatePerson = (row, role, errors) => {
    const prefix = role === 'sender' ? 'Remitente' : 'Destinatario';
    const nameField = role === 'sender' ? 'senderName' : 'recipientName';
    const docField = role === 'sender' ? 'senderDocument' : 'recipientDocument';
    const emailField = role === 'sender' ? 'senderEmail' : 'recipientEmail';
    const phoneField = role === 'sender' ? 'senderPhone' : 'recipientPhone';

    const nameErr = required(row[nameField], nameField, `Nombre del ${prefix.toLowerCase()}`);
    if (nameErr) {
        errors.push({ field: nameField, message: nameErr });
    } else if (String(row[nameField]).length > 100) {
        errors.push({ field: nameField, message: `Nombre del ${prefix.toLowerCase()} no puede superar 100 caracteres` });
    }

    const docErr = required(row[docField], docField, `Documento del ${prefix.toLowerCase()}`);
    if (docErr) {
        errors.push({ field: docField, message: docErr });
    } else {
        const docNum = parseInt(row[docField], 10);
        if (!isInt(row[docField]) || docNum < 1000000 || docNum > 99999999) {
            errors.push({ field: docField, message: `Documento del ${prefix.toLowerCase()} inválido (DNI entre 1.000.000 y 99.999.999)` });
        }
    }

    if (row[emailField]) {
        if (!isEmail(row[emailField])) {
            errors.push({ field: emailField, message: `Email del ${prefix.toLowerCase()} inválido` });
        } else if (String(row[emailField]).length > 100) {
            errors.push({ field: emailField, message: 'El email no puede superar 100 caracteres' });
        }
    }

    if (row[phoneField]) {
        const phone = String(row[phoneField]).trim();
        if (!/^\d+$/.test(phone)) {
            errors.push({ field: phoneField, message: `El teléfono del ${prefix.toLowerCase()} solo debe contener dígitos` });
        } else if (phone.length < 8 || phone.length > 15) {
            errors.push({ field: phoneField, message: `Teléfono del ${prefix.toLowerCase()} inválido (8-15 dígitos)` });
        }
    }
};

const resolveProvinceId = (raw) => {
    if (raw === undefined || raw === null || String(raw).trim() === '') { return null; }
    const trimmed = String(raw).trim();
    if (isInt(trimmed)) { return parseInt(trimmed, 10); }
    const match = findProvinceByState(trimmed);
    return match ? match.id : null;
};

const validate = (row) => {
    const errors = [];

    validatePerson(row, 'sender', errors);
    validatePerson(row, 'recipient', errors);

    if (row.senderDocument && row.recipientDocument
        && String(row.senderDocument).trim() === String(row.recipientDocument).trim()) {
        errors.push({ field: 'recipientDocument', message: 'El remitente y el destinatario no pueden ser la misma persona' });
    }

    const streetErr = required(row.street, 'street', 'La calle');
    if (streetErr) {
        errors.push({ field: 'street', message: streetErr });
    } else {
        const lenErr = maxLen(row.street, 'street', 'La calle', 200);
        if (lenErr) { errors.push({ field: 'street', message: lenErr }); }
    }

    const numErr = required(row.number, 'number', 'La numeración');
    if (numErr) {
        errors.push({ field: 'number', message: numErr });
    } else if (!isInt(row.number) || parseInt(row.number, 10) < 1) {
        errors.push({ field: 'number', message: 'La numeración debe ser un número positivo' });
    }

    if (row.floorApartment && String(row.floorApartment).length > 20) {
        errors.push({ field: 'floorApartment', message: 'Piso/Depto no puede superar 20 caracteres' });
    }

    if (row.legacyTrackingId && String(row.legacyTrackingId).length > 100) {
        errors.push({ field: 'legacyTrackingId', message: 'legacyTrackingId no puede superar 100 caracteres' });
    }

    let provinceId = null;
    const provErr = required(row.province, 'province', 'La provincia');
    if (provErr) {
        errors.push({ field: 'province', message: provErr });
    } else {
        provinceId = resolveProvinceId(row.province);
        if (provinceId === null) {
            errors.push({ field: 'province', message: `Provincia inválida: "${row.province}"` });
        }
    }

    const typeErr = required(row.shipmentTypeId, 'shipmentTypeId', 'El tipo de envío');
    if (typeErr) {
        errors.push({ field: 'shipmentTypeId', message: typeErr });
    } else if (!isInt(row.shipmentTypeId) || parseInt(row.shipmentTypeId, 10) < 1) {
        errors.push({ field: 'shipmentTypeId', message: 'Tipo de envío inválido (debe ser un id numérico)' });
    }

    const weightErr = required(row.weightKg, 'weightKg', 'El peso');
    if (weightErr) {
        errors.push({ field: 'weightKg', message: weightErr });
    } else {
        const w = parseFloat(row.weightKg);
        if (!isFloat(row.weightKg) || w < 0.1 || w > 999) {
            errors.push({ field: 'weightKg', message: 'El peso debe ser entre 0.1 y 999 kg' });
        }
    }

    const qtyErr = required(row.packageQty, 'packageQty', 'La cantidad de paquetes');
    if (qtyErr) {
        errors.push({ field: 'packageQty', message: qtyErr });
    } else if (!isInt(row.packageQty) || parseInt(row.packageQty, 10) < 1 || parseInt(row.packageQty, 10) > 999) {
        errors.push({ field: 'packageQty', message: 'La cantidad debe ser entre 1 y 999' });
    }

    let statusId = null;
    const statusErr = required(row.status, 'status', 'El estado del envío');
    if (statusErr) {
        errors.push({ field: 'status', message: statusErr });
    } else {
        statusId = resolveStatusId(row.status);
        if (statusId === null) {
            errors.push({
                field:   'status',
                message: `Estado inválido: "${row.status}". Solo se aceptan envíos cerrados (${ALLOWED_STATUS_LABEL}).`,
            });
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        normalized: errors.length === 0 ? {
            senderName:        String(row.senderName).trim(),
            senderEmail:       row.senderEmail ? String(row.senderEmail).trim() : null,
            senderPhone:       row.senderPhone ? String(row.senderPhone).trim() : null,
            senderDocument:    parseInt(row.senderDocument, 10),
            recipientName:     String(row.recipientName).trim(),
            recipientEmail:    row.recipientEmail ? String(row.recipientEmail).trim() : null,
            recipientPhone:    row.recipientPhone ? String(row.recipientPhone).trim() : null,
            recipientDocument: parseInt(row.recipientDocument, 10),
            street:            String(row.street).trim(),
            number:            parseInt(row.number, 10),
            floorApartment:    row.floorApartment ? String(row.floorApartment).trim() : null,
            provinceId,
            postalCode:        row.postalCode ? String(row.postalCode).trim() : null,
            shipmentTypeId:    parseInt(row.shipmentTypeId, 10),
            weightKg:          parseFloat(row.weightKg),
            packageQty:        parseInt(row.packageQty, 10),
            statusId,
            legacyTrackingId:  row.legacyTrackingId ? String(row.legacyTrackingId).trim() : null,
        } : null,
    };
};

module.exports = { validate, resolveProvinceId, resolveStatusId };
