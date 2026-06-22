(function () {
    'use strict';

    var MIN_TOUR_STEPS = 2;
    var START_DELAY_MS = 450;

    var TOURS = {
        kanban: {
            module: 'kanban',
            path: '/shipment/kanban',
            roles: [1, 4],
            helpSlug: 'kanban',
            steps: [
                {
                    element: '.kanban-page-header',
                    popover: {
                        title: 'Tablero Kanban',
                        description: 'Vista operativa de envíos activos por estado. Desde acá seguís el flujo del día y movés paquetes entre columnas.',
                        side: 'bottom',
                        align: 'start',
                    },
                },
                {
                    element: '.kanban-metrics-bar',
                    popover: {
                        title: 'Métricas por columna',
                        description: 'Contadores en tiempo real de cada estado. Si hay intentos fallidos, el pill se resalta en alerta.',
                        side: 'bottom',
                    },
                },
                {
                    element: '.kanban-filter-bar',
                    popover: {
                        title: 'Filtros',
                        description: 'Buscá por tracking o destinatario, filtrá por repartidor y mostrá/ocultá columnas de fallos.',
                        side: 'bottom',
                    },
                },
                {
                    element: '#kanban-board',
                    popover: {
                        title: 'Columnas de estado',
                        description: 'Cada columna agrupa envíos. Arrastrá tarjetas entre columnas permitidas o usá los botones de acción en cada tarjeta.',
                        side: 'top',
                    },
                },
                {
                    element: '.k-card:not(.k-card-filtered-out)',
                    popover: {
                        title: 'Tarjetas de envío',
                        description: 'Cada tarjeta muestra tracking, destinatario y acciones (asignar, cancelar, marcar fallido). Hacé click en el ícono de detalle para ver el envío completo.',
                        side: 'left',
                    },
                },
                {
                    element: '#k-refresh-btn',
                    popover: {
                        title: 'Actualizar',
                        description: 'Recargá el tablero para ver cambios hechos por otros usuarios sin salir de la pantalla.',
                        side: 'bottom',
                        align: 'end',
                    },
                },
            ],
        },
        ruteo: {
            module: 'ruteo',
            path: '/route/optimize',
            roles: [1, 4],
            helpSlug: 'ruteo',
            steps: [
                {
                    element: '.route-optimize-header',
                    popover: {
                        title: 'Optimizar ruteo',
                        description: 'Armá rutas eficientes eligiendo envíos pendientes y dejando que el optimizador asigne transportes y paradas.',
                        side: 'bottom',
                        align: 'start',
                    },
                },
                {
                    element: '#route-optimize-shipments',
                    popover: {
                        title: 'Envíos a incluir',
                        description: 'Tildá los envíos que querés incluir en la optimización. Podés usar el checkbox del encabezado para seleccionar todos.',
                        side: 'top',
                    },
                },
                {
                    element: '#route-optimize-transports',
                    popover: {
                        title: 'Transportes',
                        description: 'En modo automático el sistema elige vehículos libres. Con el botón de ajuste podés forzar transportes manualmente.',
                        side: 'top',
                    },
                },
                {
                    element: '#route-optimize-submit',
                    popover: {
                        title: 'Calcular ruta',
                        description: 'Generá una vista previa con paradas ordenadas, distancias y asignación de repartidor antes de confirmar el despacho.',
                        side: 'top',
                        align: 'end',
                    },
                },
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

    function findTourForPage() {
        var path = window.location.pathname;
        var keys = Object.keys(TOURS);
        for (var i = 0; i < keys.length; i++) {
            var tour = TOURS[keys[i]];
            if (path === tour.path) return tour;
        }
        return null;
    }

    function canAutoStart() {
        if (!window.__LGT) return false;
        if (window.__LGT.onboarded) return true;
        try { return sessionStorage.getItem('lgt_tour_dismissed') === '1'; } catch (_) { return false; }
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

    function scheduleAutoTour() {
        if (!canAutoStart()) return;
        var tour = findTourForPage();
        if (!tour) return;
        setTimeout(function () {
            startContextualTour(tour, false);
        }, START_DELAY_MS);
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-lgt-help-tour]');
        if (!btn) return;
        e.preventDefault();
        var moduleKey = btn.getAttribute('data-lgt-help-tour');
        var tour = TOURS[moduleKey];
        if (tour) startContextualTour(tour, true);
    });

    if (!window.__LGT) return;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleAutoTour);
    } else {
        scheduleAutoTour();
    }
})();
