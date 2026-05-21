const { containsAny, detectStatusKeyFromText, normalizeText, resolveLookupQuery } = require('./utils');

function resolveTextIntent(input) {
    const trimmed = String(input || '').trim();
    const normalized = normalizeText(trimmed);
    const lookup = resolveLookupQuery(trimmed);

    if (lookup) {
        return {
            kind: 'lookup',
            query: lookup.query,
        };
    }

    const explicitStatus = detectStatusKeyFromText(normalized);

    if (explicitStatus && (
        normalized.includes('que significa')
        || normalized.includes('significa')
        || normalized.includes('estado ')
        || normalized === explicitStatus.replace(/_/g, ' ')
    )) {
        return {
            kind: 'action',
            action: 'show-status-guide',
            value: explicitStatus,
        };
    }

    if (containsAny(normalized, ['menu', 'opciones', 'inicio'])) {
        return { kind: 'action', action: 'show-main-menu' };
    }

    if (containsAny(normalized, ['preguntas frecuentes', 'faq'])) {
        return { kind: 'action', action: 'scroll-faq' };
    }

    if (containsAny(normalized, ['soporte', 'asesor', 'agente', 'humano', 'ayuda', 'contacto', 'reclamo'])) {
        return { kind: 'action', action: 'show-support' };
    }

    if (containsAny(normalized, ['que significa', 'significa', 'estados', 'estado pendiente', 'estado en transito', 'estado en sucursal'])) {
        return {
            kind: 'action',
            action: 'show-status-guide',
            value: explicitStatus,
        };
    }

    if (containsAny(normalized, ['historial', 'movimientos', 'movimiento', 'paso a paso', 'seguimiento completo'])) {
        return { kind: 'action', action: 'show-history' };
    }

    if (containsAny(normalized, ['donde esta', 'ubicacion', 'recorrido', 'mapa', 'gps'])) {
        return { kind: 'action', action: 'show-location' };
    }

    if (containsAny(normalized, ['cuando llega', 'fecha estimada', 'horario', 'ventana horaria', 'eta', 'estimado'])) {
        return { kind: 'action', action: 'show-eta' };
    }

    if (containsAny(normalized, ['incidencia', 'problema', 'demora', 'retraso', 'intento fallido', 'paquete fallido', 'no llego', 'fallo'])) {
        return { kind: 'action', action: 'show-issues' };
    }

    if (containsAny(normalized, ['sucursal', 'retiro', 'retirar'])) {
        return { kind: 'action', action: 'show-branch' };
    }

    if (containsAny(normalized, ['comprobante', 'pod', 'firma', 'evidencia', 'quien recibio'])) {
        return { kind: 'action', action: 'show-pod' };
    }

    if (containsAny(normalized, ['cambiar direccion', 'modificar', 'cambiar datos', 'reprogramar', 'cancelar'])) {
        return { kind: 'action', action: 'show-management' };
    }

    if (containsAny(normalized, ['notificacion', 'notificaciones', 'mail', 'email', 'sms', 'avisos'])) {
        return { kind: 'action', action: 'show-notifications' };
    }

    if (containsAny(normalized, ['estado', 'como va'])) {
        return { kind: 'action', action: 'show-status' };
    }

    return { kind: 'fallback' };
}

module.exports = {
    resolveTextIntent,
};
