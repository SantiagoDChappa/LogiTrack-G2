// Formateo de fecha/hora centralizado y parametrizable desde Ajustes.
// El servidor (Render) corre en UTC; sin esto las fechas se ven en GMT+00.
// Acá aplicamos la zona horaria configurada (default America/Argentina/Buenos_Aires = GMT-03)
// y el formato 12/24 hs elegido.

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

// Zonas ofrecidas en Ajustes (label visible -> identificador IANA).
const TIMEZONES = [
    { id: 'America/Argentina/Buenos_Aires', label: 'Argentina (GMT-03)' },
    { id: 'America/Montevideo',             label: 'Uruguay (GMT-03)' },
    { id: 'America/Santiago',               label: 'Chile (GMT-03/-04)' },
    { id: 'America/Sao_Paulo',              label: 'Brasil — São Paulo (GMT-03)' },
    { id: 'America/Asuncion',               label: 'Paraguay (GMT-03/-04)' },
    { id: 'America/La_Paz',                 label: 'Bolivia (GMT-04)' },
    { id: 'America/Lima',                   label: 'Perú (GMT-05)' },
    { id: 'America/Mexico_City',            label: 'México (GMT-06)' },
    { id: 'UTC',                            label: 'UTC (GMT+00)' },
];

const toDate = (value) => {
    if (value instanceof Date) { return value; }
    if (value === null || value === undefined || value === '') { return null; }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

// Fecha + hora. Ej: "10/06/2026 14:30" (24h) ó "10/06/2026 02:30 p. m." (12h).
const formatDateTime = (value, { timeZone = DEFAULT_TZ, hour24 = true } = {}) => {
    const d = toDate(value);
    if (!d) { return '—'; }
    return d.toLocaleString('es-AR', {
        timeZone,
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        hour12: !hour24,
    });
};

// Solo fecha. Ej: "10/06/2026".
const formatDate = (value, { timeZone = DEFAULT_TZ } = {}) => {
    const d = toDate(value);
    if (!d) { return '—'; }
    return d.toLocaleDateString('es-AR', {
        timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
    });
};

// Solo hora. Ej: "14:30" (24h) ó "02:30 p. m." (12h).
const formatTime = (value, { timeZone = DEFAULT_TZ, hour24 = true } = {}) => {
    const d = toDate(value);
    if (!d) { return '—'; }
    return d.toLocaleTimeString('es-AR', {
        timeZone, hour: '2-digit', minute: '2-digit', hour12: !hour24,
    });
};

module.exports = { DEFAULT_TZ, TIMEZONES, formatDateTime, formatDate, formatTime };
