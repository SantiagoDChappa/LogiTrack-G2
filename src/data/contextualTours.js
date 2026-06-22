'use strict';

/** Módulos con tour contextual disponible (clave → slug del manual). */
const CONTEXTUAL_TOUR_MODULES = Object.freeze({
    kanban:                'kanban',
    ruteo:                 'ruteo',
    incidencias:           'incidencias',
    'ojo-patron':          'ojo-patron',
    'import-csv':          'import-csv',
    envios:                'envios',
    'modificaciones-portal': 'modificaciones-portal',
    'mi-ruteo':            'mi-ruteo',
    'entregas-repartidor': 'entregas-repartidor',
});

const MODULE_KEYS = Object.freeze(Object.keys(CONTEXTUAL_TOUR_MODULES));

function isValidModule(moduleKey) {
    return MODULE_KEYS.includes(moduleKey);
}

module.exports = { CONTEXTUAL_TOUR_MODULES, MODULE_KEYS, isValidModule };
