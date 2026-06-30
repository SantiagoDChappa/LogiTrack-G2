// Vista de estado del envío (estilo seguimiento Mercado Libre): el mensaje grande de "último
// estado" + la línea de tiempo. Lo comparten la página pública /track/:trackingId y el detalle
// autenticado de "Mis Envíos", así el texto que ve el cliente es siempre el mismo.
const { Status } = require('../constants/enums');

const fmtDateTime = (d) => {
    if (!d) { return ''; }
    try {
        return new Date(d).toLocaleString('es-AR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        });
    } catch { return ''; }
};
const fmtDate = (d) => {
    if (!d) { return ''; }
    try { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch { return ''; }
};

// Mensaje principal según el estado. `eta` (opcional) viene de etaWindow.etaForShipment.
// Devuelve { headline, detail, tone, isPickup, isReady }.
function buildStatusMessage(shipment, eta) {
    const statusId = shipment.statusId;
    const isPickup = shipment.deliveryMode === 'branch_pickup';
    const branchName = shipment.currentBranch?.name || shipment.pickupBranch?.name || 'la sucursal';
    const branchAddr = shipment.currentBranch?.address || shipment.pickupBranch?.address || '';

    if (statusId === Status.READY_FOR_PICKUP.id) {
        const venc = shipment.pickupExpiresAt ? ` Tenés tiempo hasta el ${fmtDate(shipment.pickupExpiresAt)}.` : '';
        return {
            headline: 'Tu envío llegó al punto de retiro',
            detail: `Retiralo en ${branchName}${branchAddr ? ' — ' + branchAddr : ''}.${venc}`,
            tone: 'ready', isPickup: true, isReady: true,
        };
    }
    if (statusId === Status.DELIVERED.id) {
        return {
            headline: isPickup ? 'Retirado' : 'Entregado',
            detail: isPickup ? 'Retiraste tu envío en la sucursal.' : 'Tu envío fue entregado.',
            tone: 'done', isPickup, isReady: false,
        };
    }
    if (statusId === Status.CANCELLED.id) {
        return { headline: 'Cancelado', detail: 'Tu envío fue cancelado.', tone: 'bad', isPickup, isReady: false };
    }
    if (statusId === Status.RETURNED.id) {
        return { headline: 'Devuelto', detail: 'Tu envío fue devuelto.', tone: 'bad', isPickup, isReady: false };
    }
    // En curso.
    if (isPickup) {
        return {
            headline: 'En camino a la sucursal de retiro',
            detail: `Te avisamos apenas llegue a ${branchName} y puedas pasar a buscarlo.`,
            tone: 'transit', isPickup: true, isReady: false,
        };
    }
    // Domicilio: si hay ETA calculada, mostrarla.
    if (eta && eta.text) {
        return { headline: 'En camino', detail: eta.text, tone: 'transit', isPickup: false, isReady: false };
    }
    const generic = {
        [Status.PENDING.id]:        'Tu envío está registrado y a la espera de preparación.',
        [Status.PENDING_PAYMENT.id]:'Tu envío espera la confirmación del pago.',
        [Status.ASSIGNED.id]:       'Tu envío fue asignado a un repartidor.',
        [Status.IN_PREPARATION.id]: 'Tu envío está siendo preparado.',
        [Status.IN_TRANSIT.id]:     'Tu envío está en camino.',
        [Status.AT_BRANCH.id]:      'Tu envío está en una sucursal.',
        [Status.FAILED_ATTEMPT.id]: 'No pudimos entregarlo en el último intento. Vamos a reintentar.',
    };
    return {
        headline: shipment.status?.description || 'En proceso',
        detail: generic[statusId] || 'Estamos procesando tu envío.',
        tone: 'transit', isPickup, isReady: false,
    };
}

// Línea de tiempo a partir del historial enriquecido (más nuevo arriba). El último (más reciente)
// queda marcado como `current`.
function buildTimeline(history = []) {
    const sorted = [...history]
        .filter(h => h && h.createdAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted.map((h, i) => ({
        comment: h.comment || '',
        at: fmtDateTime(h.createdAt),
        toStatusId: h.toStatusId,
        current: i === 0,
    }));
}

module.exports = { buildStatusMessage, buildTimeline, fmtDate, fmtDateTime };
