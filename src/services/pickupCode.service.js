// Retiro en sucursal con QR — generación y validación del código de retiro.
//
// Al "dejar en sucursal" un envío de retiro, se genera un código legible (para el mail) y un
// token (para el QR). Cuando el cliente va a la sucursal, el operador escanea el QR o tipea el
// código; este servicio valida (estado, sucursal, vencimiento) y confirma la entrega.
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Shipment } = require('../models/shipment');
const shipmentModel = require('../models/shipment');
const settingModel = require('../models/setting');
const stateMachine = require('./shipmentStateMachine');
const { Status, RoleType } = require('../constants/enums');

// Charset sin caracteres ambiguos (sin 0/O, 1/I/L) para que el código se lea/tipee sin error.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;

function randomCode() {
    const bytes = crypto.randomBytes(CODE_LEN);
    let out = '';
    for (let i = 0; i < CODE_LEN; i++) { out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]; }
    return out;
}

async function uniqueCode() {
    for (let attempt = 0; attempt < 6; attempt++) {
        const code = randomCode();
        const exists = await Shipment.findOne({ where: { pickupCode: code }, attributes: ['id'] });
        if (!exists) { return code; }
    }
    // Fallback prácticamente imposible de colisionar.
    return randomCode() + crypto.randomBytes(2).toString('hex').toUpperCase();
}

async function getRetentionDays() {
    const raw = await settingModel.get('dias_retencion_sucursal');
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 10;
}

// Genera (o reutiliza) el código/token de retiro de un envío y setea la ventana de vencimiento.
// Idempotente: si ya tiene código vigente, lo devuelve sin regenerar (reintento de drop-at-branch).
async function ensurePickupCode(shipmentId) {
    const shipment = await shipmentModel.getById(shipmentId);
    if (!shipment) { throw new Error('Envío no encontrado'); }
    if (shipment.pickupCode && shipment.pickupToken) {
        return { code: shipment.pickupCode, token: shipment.pickupToken, expiresAt: shipment.pickupExpiresAt };
    }
    const code = await uniqueCode();
    const token = crypto.randomBytes(24).toString('hex');
    const readyAt = new Date();
    const days = await getRetentionDays();
    const expiresAt = new Date(readyAt.getTime() + days * 24 * 60 * 60 * 1000);

    await Shipment.update(
        { pickupCode: code, pickupToken: token, pickupReadyAt: readyAt, pickupExpiresAt: expiresAt },
        { where: { id: shipmentId } }
    );
    return { code, token, expiresAt };
}

// Busca el envío por token (QR) o por código (tipeado). Normaliza el código a mayúsculas.
async function findByCodeOrToken(value) {
    const raw = String(value || '').trim();
    if (!raw) { return null; }
    return Shipment.findOne({
        where: { [Op.or]: [{ pickupToken: raw }, { pickupCode: raw.toUpperCase() }] },
    });
}

// Resultado de validación legible para la UI del operador.
class PickupError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

// Valida y confirma el retiro. operator = res.locals.currentUser. Devuelve el envío entregado.
async function confirmPickup(value, operator) {
    const shipment = await findByCodeOrToken(value);
    if (!shipment) { throw new PickupError('NOT_FOUND', 'Código o QR no encontrado.'); }

    if (shipment.statusId === Status.DELIVERED.id) {
        throw new PickupError('ALREADY_DELIVERED', 'Este envío ya fue retirado.');
    }
    if (shipment.statusId !== Status.READY_FOR_PICKUP.id) {
        throw new PickupError('NOT_READY', 'Este envío no está listo para retiro.');
    }
    // Vencimiento (atado a la retención de la sucursal).
    if (shipment.pickupExpiresAt && new Date(shipment.pickupExpiresAt).getTime() < Date.now()) {
        throw new PickupError('EXPIRED', 'El código de retiro venció. El envío debe gestionarse como devolución.');
    }
    // Scope por sucursal: el operador/supervisor sólo confirma retiros de su sucursal (el admin, cualquiera).
    const isAdmin = operator?.roleId === RoleType.ADMIN.id;
    if (!isAdmin) {
        const opBranch = operator?.branchId || null;
        if (!opBranch || Number(opBranch) !== Number(shipment.currentBranchId)) {
            throw new PickupError('WRONG_BRANCH', 'Este envío está en otra sucursal. No podés confirmar el retiro acá.');
        }
    }

    await stateMachine.transition({
        shipmentId: shipment.id,
        toStatusId: Status.DELIVERED.id,
        actor: operator,
        branchId: shipment.currentBranchId,
        eventTypeOverride: 'DELIVERED',
    });
    await Shipment.update(
        { pickupConfirmedByUserId: operator?.id || null },
        { where: { id: shipment.id } }
    );
    return shipmentModel.getById(shipment.id);
}

module.exports = { ensurePickupCode, findByCodeOrToken, confirmPickup, PickupError, getRetentionDays };
