// LGT-173: Configuración visual de estados.
// Permite que el administrador personalice el color de cada estado de envío.
// El color elegido se aplica a los badges (.status-badge.<slug>) mediante CSS
// inyectado en el <head>, sobrescribiendo los colores por defecto del tema.

// Genera el mismo slug que usan las vistas para la clase del badge.
// Ej: "En Tránsito" -> "en_transito"
const slugOf = (description) =>
    String(description || '')
        .toLowerCase()
        .replace(/[\s-]+/g, '_');

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const isValidHex = (value) => HEX_RE.test(String(value || '').trim());

// Clave de setting para el color de un estado.
const keyFor = (statusId) => `status_color_${statusId}`;

// Construye el CSS que sobrescribe los badges según los colores configurados.
// `settings` es el objeto plano key->value (settingModel.getAll()).
// `statuses` es el listado de estados [{ id, description }].
const buildCss = (settings, statuses) => {
    if (!Array.isArray(statuses) || !statuses.length) { return ''; }
    const rules = [];
    for (const s of statuses) {
        const color = settings ? settings[keyFor(s.id)] : null;
        if (!isValidHex(color)) { continue; }
        const slug = slugOf(s.description);
        if (!slug) { continue; }
        // Fondo tenue (color + alpha) y texto con el color pleno; funciona en tema claro y oscuro.
        rules.push(
            `.status-badge.${slug},.status.${slug}{background-color:${color}22 !important;color:${color} !important;}`
        );
    }
    return rules.join('\n');
};

// === Colores de estados de incidencias ===
// Las incidencias usan estados de un enum fijo (no DB) que se pintan con la
// clase `.incident-badge--<code>` (ej: .incident-badge--in_review).
// Permitimos personalizar su color desde Ajustes igual que los estados de envío.
const INCIDENT_STATUSES = [
    { code: 'OPEN',      label: 'Abierta',     defaultColor: '#1e40af' },
    { code: 'IN_REVIEW', label: 'En revisión', defaultColor: '#92400e' },
    { code: 'CLOSED',    label: 'Cerrada',     defaultColor: '#065f46' },
];

// Clave de setting para el color de un estado de incidencia.
const incidentKeyFor = (code) => `incident_status_color_${code}`;

// CSS que sobrescribe los badges de incidencia según los colores configurados.
const buildIncidentCss = (settings) => {
    const rules = [];
    for (const s of INCIDENT_STATUSES) {
        const color = settings ? settings[incidentKeyFor(s.code)] : null;
        if (!isValidHex(color)) { continue; }
        const slug = s.code.toLowerCase();
        rules.push(
            `.incident-badge--${slug}{background:${color}22 !important;color:${color} !important;border-color:${color}33 !important;}`
        );
    }
    return rules.join('\n');
};

module.exports = {
    slugOf, isValidHex, keyFor, buildCss,
    INCIDENT_STATUSES, incidentKeyFor, buildIncidentCss,
};
