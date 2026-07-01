(function () {
    'use strict';

    var MIN_TOUR_STEPS = 2;

    var TOURS = {
        kanban: {
            module: 'kanban',
            path: '/shipment/kanban',
            roles: [1, 4],
            helpSlug: 'kanban',
            steps: [
                { element: '.kanban-page-header', popover: { title: 'Tablero Kanban', description: 'Vista operativa de envíos activos por estado. Desde acá seguís el flujo del día y movés paquetes entre columnas.', side: 'bottom', align: 'start' } },
                { element: '.kanban-metrics-bar', popover: { title: 'Métricas por columna', description: 'Contadores en tiempo real de cada estado. Si hay intentos fallidos, el pill se resalta en alerta.', side: 'bottom' } },
                { element: '.kanban-filter-bar', popover: { title: 'Filtros', description: 'Buscá por tracking o destinatario, filtrá por repartidor y mostrá/ocultá columnas de fallos.', side: 'bottom' } },
                { element: '#kanban-board', popover: { title: 'Columnas de estado', description: 'Cada columna agrupa envíos. Arrastrá tarjetas entre columnas permitidas o usá los botones de acción en cada tarjeta.', side: 'top' } },
                { element: '.k-card:not(.k-card-filtered-out)', popover: { title: 'Tarjetas de envío', description: 'Cada tarjeta muestra tracking, destinatario y acciones. Hacé click en el ícono de detalle para ver el envío completo.', side: 'left' } },
                { element: '#k-refresh-btn', popover: { title: 'Actualizar', description: 'Recargá el tablero para ver cambios hechos por otros usuarios.', side: 'bottom', align: 'end' } },
            ],
        },
        ruteo: {
            module: 'ruteo',
            path: '/route/optimize',
            roles: [1, 4],
            helpSlug: 'ruteo',
            steps: [
                { element: '.route-optimize-header', popover: { title: 'Optimizar ruteo', description: 'Armá rutas eficientes eligiendo envíos pendientes y dejando que el optimizador asigne transportes y paradas.', side: 'bottom', align: 'start' } },
                { element: '#route-optimize-shipments', popover: { title: 'Envíos a incluir', description: 'Tildá los envíos que querés incluir. Podés usar el checkbox del encabezado para seleccionar todos.', side: 'top' } },
                { element: '#route-optimize-transports', popover: { title: 'Transportes', description: 'En modo automático el sistema elige vehículos libres. Con el botón de ajuste podés forzar transportes manualmente.', side: 'top' } },
                { element: '#route-optimize-submit', popover: { title: 'Calcular ruta', description: 'Generá una vista previa con paradas ordenadas antes de confirmar el despacho.', side: 'top', align: 'end' } },
            ],
        },
        incidencias: {
            module: 'incidencias',
            path: '/incident',
            roles: [1, 2, 4],
            helpSlug: 'incidencias',
            steps: [
                { element: '.incident-page-header', popover: { title: 'Incidencias', description: 'Listado de problemas operativos vinculados a envíos. Desde acá hacés seguimiento y asignación.', side: 'bottom', align: 'start' } },
                { element: '.incident-filters', popover: { title: 'Filtros', description: 'Filtrá por estado, prioridad, origen (portal o interno), asignado y código de envío.', side: 'bottom' } },
                { element: '.incident-table-wrapper', popover: { title: 'Listado', description: 'Cada fila muestra tipo, estado, resolución y prioridad. Hacé click en el ojo para ver el detalle.', side: 'top' } },
                { element: '.incident-new-btn', popover: { title: 'Nueva incidencia', description: 'Registrá un problema manualmente cuando no existe aún en el sistema.', side: 'bottom', align: 'end' } },
            ],
        },
        'ojo-patron': {
            module: 'ojo-patron',
            path: '/fatigue',
            roles: [1, 4],
            helpSlug: 'ojo-patron',
            steps: [
                { element: '.fatigue-page-header', popover: { title: 'Ojo de Patrón', description: 'Monitoreo de fatiga de repartidores. Supervisá bloqueos, avisos y patrones recurrentes.', side: 'bottom', align: 'start' } },
                { element: '#fatigue-blocked-section', popover: { title: 'Rutas bloqueadas', description: 'Rutas detenidas por fatiga. Podés liberar con motivo o reasignar el transporte.', side: 'top' } },
                { element: '#fatigue-review-section', popover: { title: 'Avisos sin bloqueo', description: 'Transportistas que no superaron el control pero siguieron en ruta (si el bloqueo automático está desactivado).', side: 'top' } },
            ],
        },
        'import-csv': {
            module: 'import-csv',
            path: '/shipment/import',
            roles: [4],
            helpSlug: 'import-csv',
            steps: [
                { element: '.import-page-header', popover: { title: 'Importación masiva', description: 'Cargá envíos en lote desde un CSV. Ideal para migración o altas masivas.', side: 'bottom', align: 'start' } },
                { element: '#import-step-template', popover: { title: 'Paso 1 — Template', description: 'Descargá el archivo modelo y completalo respetando los nombres de columnas.', side: 'top' } },
                { element: '#import-step-upload', popover: { title: 'Paso 2 — Subir archivo', description: 'Arrastrá o seleccioná tu CSV (máx. 10 MB, 1.000 filas). El sistema validará antes de importar.', side: 'top' } },
                { element: '.import-history-btn', popover: { title: 'Historial', description: 'Revisá importaciones anteriores y sus resultados desde el ícono de historial.', side: 'bottom', align: 'end' } },
            ],
        },
        envios: {
            module: 'envios',
            path: '/shipment',
            roles: [1, 2, 4],
            helpSlug: 'envios',
            steps: [
                { element: '.shipment-page-header', popover: { title: 'Administrador de envíos', description: 'Buscá, filtrá y accedé al detalle de todos los envíos de tu alcance.', side: 'bottom', align: 'start' } },
                { element: '#search-form', popover: { title: 'Buscador', description: 'Filtrá por tracking, remitente, destinatario o documento. Elegí si buscás en uno o ambos roles.', side: 'bottom' } },
                { element: '.shipments-table-wrap', popover: { title: 'Resultados', description: 'La tabla muestra estado, sucursal y datos principales. Click en una fila para ver el detalle.', side: 'top' } },
                { element: '.shipment-new-btn', popover: { title: 'Alta de envío', description: 'Creá un envío individual con remitente, destinatario y dirección validada.', side: 'bottom', align: 'end' } },
            ],
        },
        'modificaciones-portal': {
            module: 'modificaciones-portal',
            path: '/shipment/modifications',
            roles: [2, 4],
            helpSlug: 'modificaciones-portal',
            steps: [
                { element: '.modifications-page-header', popover: { title: 'Modificaciones del portal', description: 'Solicitudes de cambio que los clientes envían desde el portal externo.', side: 'bottom', align: 'start' } },
                { element: '.modifications-filters', popover: { title: 'Filtros', description: 'Filtrá por estado: pendientes de revisión, aplicadas o rechazadas.', side: 'bottom' } },
                { element: '.modifications-table-wrap', popover: { title: 'Solicitudes', description: 'Cada fila muestra el envío, tipo de cambio y estado. Aprobá o rechazá desde las acciones.', side: 'top' } },
            ],
        },
        'mi-ruteo': {
            module: 'mi-ruteo',
            path: '/delivery',
            roles: [3],
            helpSlug: 'mi-ruteo',
            steps: [
                { element: '.delivery-home-header', popover: { title: 'Mi ruteo', description: 'Tu pantalla principal como repartidor: ruta activa y próximas asignaciones.', side: 'bottom', align: 'start' } },
                { element: '.active-hero', popover: { title: 'Ruta activa', description: 'Tu ruta en curso con progreso y acceso directo al detalle de entregas.', side: 'bottom' } },
                { element: '.empty-routes', popover: { title: 'Sin ruta asignada', description: 'Cuando un operador te asigne una ruta, aparecerá acá para que puedas iniciarla.', side: 'bottom' } },
                { element: '.route-card', popover: { title: 'Próximas rutas', description: 'Tus rutas planificadas o finalizadas. Hacé click para ver el detalle o el resumen.', side: 'top' } },
            ],
        },
        'entregas-repartidor': {
            module: 'entregas-repartidor',
            pathPrefix: '/delivery/route',
            roles: [3],
            helpSlug: 'entregas-repartidor',
            steps: [
                { element: '#map', popover: { title: 'Mapa de ruta', description: 'Visualizá las paradas y tu posición. Usá recentrar para volver a tu ubicación.', side: 'bottom' } },
                { element: '#bottom-sheet', popover: { title: 'Lista de paradas', description: 'Deslizá el panel para ver cada envío. Confirmá entregas, fallidos o pausas desde cada parada.', side: 'top' } },
                { element: '#btn-incident', popover: { title: 'Reportar incidente', description: 'Informá accidentes o problemas vehiculares durante el recorrido.', side: 'bottom', align: 'end' } },
                { element: '#btn-panic', popover: { title: 'Botón de pánico', description: 'Envía tu ubicación al despacho en situaciones de emergencia.', side: 'bottom', align: 'end' } },
            ],
        },
    };

    function asRole(roleId) {
        return Number(roleId);
    }

    function filterSteps(steps) {
        return steps.filter(function (step) {
            if (!step.element) return true;
            return document.querySelector(step.element) !== null;
        });
    }

    function isModuleSeen(moduleKey) {
        if (!window.__LGT || !window.__LGT.helpSeen) return false;
        return !!window.__LGT.helpSeen[moduleKey];
    }

    function markModuleSeen(moduleKey) {
        if (window.__LGT) {
            if (!window.__LGT.helpSeen) window.__LGT.helpSeen = {};
            window.__LGT.helpSeen[moduleKey] = true;
        }
        fetch('/api/onboarding/module-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({ module: moduleKey }),
        }).catch(function () {});
    }

    function startContextualTour(tour, force) {
        if (!window.__LGT || !window.driver || !window.driver.js) return;
        if (!force && isModuleSeen(tour.module)) return;

        var roleId = asRole(window.__LGT.roleId);
        if (tour.roles.indexOf(roleId) < 0) return;

        var steps = filterSteps(tour.steps);
        if (steps.length < MIN_TOUR_STEPS) return;

        var tourFinished = false;

        function finishOnce(driverObj) {
            if (tourFinished) return;
            tourFinished = true;
            markModuleSeen(tour.module);
            if (driverObj) driverObj.destroy(false);
        }

        var driverObj = window.driver.js.driver({
            showProgress: true,
            progressText: '{{current}} de {{total}}',
            allowClose: false,
            popoverClass: 'lgt-tour-popover',
            stagePadding: 6,
            stageRadius: 10,
            nextBtnText: 'Siguiente →',
            prevBtnText: '← Anterior',
            doneBtnText: '¡Listo!',
            onPopoverRender: function (popover) {
                if (window.lgtTourPopover && window.lgtTourPopover.enhanceFooter) {
                    window.lgtTourPopover.enhanceFooter(popover, {
                        skipLabel: 'Saltar',
                        helpSlug: tour.helpSlug,
                        onSkip: function () { finishOnce(driverObj); },
                    });
                }
            },
            onDestroyStarted: function () {
                finishOnce(driverObj);
            },
            steps: steps,
        });

        driverObj.drive();
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-lgt-help-tour]');
        if (!btn) return;
        e.preventDefault();
        var moduleKey = btn.getAttribute('data-lgt-help-tour');
        var tour = TOURS[moduleKey];
        if (tour) startContextualTour(tour, true);
    });

    // Tours contextuales solo bajo demanda (ícono bandera en pantalla), nunca al cargar.
})();
