(function () {
    'use strict';

    var MIN_TOUR_STEPS = 2;
    var TOUR_REDIRECT_KEY = 'lgt_tour_redirected';
    var START_DELAY_MS = 450;
    var MOBILE_BP = '(max-width: 1024px)';

    function asRole(roleId) {
        return Number(roleId);
    }

    function getTourHome(roleId) {
        return asRole(roleId) === 3 ? '/delivery' : '/home';
    }

    function isNavStep(element) {
        if (!element) return false;
        return element.indexOf('.nav') === 0 || element.indexOf('#nav-group-') === 0;
    }

    function openMobileNav() {
        if (!window.matchMedia(MOBILE_BP).matches) return;
        var leftHeader = document.querySelector('.left-header');
        var navOverlay = document.getElementById('nav-overlay');
        if (leftHeader) leftHeader.classList.add('open');
        if (navOverlay) navOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileNav() {
        if (!window.matchMedia(MOBILE_BP).matches) return;
        var leftHeader = document.querySelector('.left-header');
        var navOverlay = document.getElementById('nav-overlay');
        if (leftHeader) leftHeader.classList.remove('open');
        if (navOverlay) navOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function withNavHooks(step) {
        if (!isNavStep(step.element)) return step;
        var originalHighlight = step.onHighlightStarted;
        var originalDeselected = step.onDeselected;
        return Object.assign({}, step, {
            onHighlightStarted: function (element, stepObj, opts) {
                openMobileNav();
                if (typeof originalHighlight === 'function') {
                    originalHighlight(element, stepObj, opts);
                }
            },
            onDeselected: function (element, stepObj, opts) {
                closeMobileNav();
                if (typeof originalDeselected === 'function') {
                    originalDeselected(element, stepObj, opts);
                }
            },
        });
    }

    function filterSteps(steps) {
        return steps.filter(function (step) {
            if (!step.element) return true;
            return document.querySelector(step.element) !== null;
        });
    }

    // ── Pasos compartidos ──────────────────────────────────────────────────────

    function welcomeStep(description) {
        return {
            element: '.logo',
            popover: {
                title: '¡Bienvenido/a a LogiTrack!',
                description: description,
                side: 'right',
                align: 'start',
            },
        };
    }

    function searchStep(isDelivery) {
        return {
            element: '#univ-search',
            popover: {
                title: 'Búsqueda rápida',
                description: isDelivery
                    ? 'Buscá envíos, incidencias o tus rutas asignadas escribiendo al menos 2 caracteres.'
                    : 'Buscá envíos e incidencias al instante escribiendo al menos 2 caracteres.',
                side: 'bottom',
            },
        };
    }

    // ── Pasos por rol ──────────────────────────────────────────────────────────

    var STEPS_SUPERVISOR_ADMIN = [
        welcomeStep('Este es el panel de control de tu operación logística. Te mostramos en unos pasos qué podés hacer desde acá.'),
        searchStep(false),
        {
            element: '.stats-grid',
            popover: {
                title: 'Resumen del día',
                description: 'Acá vas a ver en tiempo real los envíos activos, entregas de hoy y alertas de demora.',
                side: 'top',
                align: 'start',
            },
        },
        {
            element: '.nav a[href="/shipment"]',
            popover: {
                title: 'Envíos',
                description: 'Gestioná todos los envíos: creación, búsqueda, seguimiento de estado y detalle completo de cada uno.',
                side: 'right',
            },
        },
        {
            element: '.nav a[href="/route"]',
            popover: {
                title: 'Ruteo',
                description: 'Planificá y optimizá las rutas de entrega asignadas a tus repartidores.',
                side: 'right',
            },
        },
        {
            element: '.nav a[href="/incident"]',
            popover: {
                title: 'Incidencias',
                description: 'Registrá y hacé seguimiento de problemas operativos: demoras, daños, extravíos y más.',
                side: 'right',
            },
        },
        {
            element: '#nav-group-reportes',
            popover: {
                title: 'Reportes',
                description: 'Analizá el rendimiento: volumen de envíos, entregas a tiempo, satisfacción del cliente y fallas.',
                side: 'right',
            },
        },
    ];

    var STEPS_ADMIN_EXTRA = [
        {
            element: '#nav-group-ajustes',
            popover: {
                title: 'Ajustes',
                description: 'Configurá el sistema: empresa, comunicaciones, plantillas de email, zonas y más.',
                side: 'right',
            },
        },
    ];

    var STEPS_OPERATOR = [
        welcomeStep('Desde acá podés gestionar envíos, incidencias y solicitudes del portal de clientes.'),
        searchStep(false),
        {
            element: '.stats-grid',
            popover: {
                title: 'Resumen operativo',
                description: 'Seguí el estado general de la operación en tiempo real.',
                side: 'top',
                align: 'start',
            },
        },
        {
            element: '.nav a[href="/shipment"]',
            popover: {
                title: 'Envíos',
                description: 'Buscá, editá y hacé seguimiento de todos los envíos en curso.',
                side: 'right',
            },
        },
        {
            element: '.nav a[href="/incident"]',
            popover: {
                title: 'Incidencias',
                description: 'Registrá problemas operativos y hacé seguimiento de su resolución.',
                side: 'right',
            },
        },
        {
            element: '.nav a[href="/shipment/modifications"]',
            popover: {
                title: 'Modificaciones portal',
                description: 'Gestioná las solicitudes de cambio que los clientes hacen desde el portal externo.',
                side: 'right',
            },
        },
    ];

    function buildDeliverySteps() {
        var steps = [
            welcomeStep('Acá vas a encontrar todo lo que necesitás para gestionar tus entregas del día.'),
            searchStep(true),
        ];

        if (document.querySelector('.active-hero')) {
            steps.push({
                element: '.active-hero',
                popover: {
                    title: 'Tu ruta activa',
                    description: 'Esta tarjeta muestra tu ruta en curso: progreso de entregas, dirección siguiente y estado general.',
                    side: 'bottom',
                    align: 'start',
                },
            });
        } else if (document.querySelector('.empty-routes')) {
            steps.push({
                element: '.empty-routes',
                popover: {
                    title: 'Sin ruta asignada',
                    description: 'Todavía no tenés una ruta activa. Cuando un operador te asigne una, aparecerá acá para que puedas iniciarla.',
                    side: 'bottom',
                    align: 'start',
                },
            });
        }

        if (document.querySelector('.route-card')) {
            steps.push({
                element: '.route-card',
                popover: {
                    title: 'Rutas asignadas',
                    description: 'Tus próximas rutas aparecen acá. Hacé click en cualquiera para ver el detalle.',
                    side: 'top',
                    align: 'start',
                },
            });
        }

        steps.push({
            element: '.nav a[href="/incident"]',
            popover: {
                title: 'Mis incidencias',
                description: 'Si encontrás un problema durante la entrega (daño, dirección incorrecta, etc.) podés reportarlo desde acá.',
                side: 'right',
            },
        });

        return steps;
    }

    function getSteps(roleId) {
        var role = asRole(roleId);
        if (role === 4) return STEPS_SUPERVISOR_ADMIN.concat(STEPS_ADMIN_EXTRA);
        if (role === 1) return STEPS_SUPERVISOR_ADMIN;
        if (role === 2) return STEPS_OPERATOR;
        if (role === 3) return buildDeliverySteps();
        return [];
    }

    function clearTourRedirectFlag() {
        try { sessionStorage.removeItem(TOUR_REDIRECT_KEY); } catch (_) { /* ignore */ }
    }

    function markComplete() {
        clearTourRedirectFlag();
        fetch('/api/onboarding/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }).catch(function () {});
    }

    function ensureTourLanding(roleId) {
        var home = getTourHome(roleId);
        if (window.location.pathname === home) return true;
        if (sessionStorage.getItem(TOUR_REDIRECT_KEY)) return true;
        try { sessionStorage.setItem(TOUR_REDIRECT_KEY, '1'); } catch (_) { /* ignore */ }
        window.location.replace(home);
        return false;
    }

    function startTour() {
        if (!window.__LGT || window.__LGT.onboarded) return;

        var roleId = asRole(window.__LGT.roleId);
        if (!ensureTourLanding(roleId)) return;

        var steps = filterSteps(getSteps(roleId).map(withNavHooks));
        if (steps.length < MIN_TOUR_STEPS) return;

        var tourStarted = false;

        var driverObj = window.driver.js.driver({
            showProgress: true,
            progressText: '{{current}} de {{total}}',
            allowClose: false,
            stagePadding: 6,
            stageRadius: 10,
            nextBtnText: 'Siguiente →',
            prevBtnText: '← Anterior',
            doneBtnText: '¡Listo!',
            onPopoverRender: function (popover) {
                if (popover.footer.querySelector('.lgt-tour-skip')) return;
                var skipBtn = document.createElement('button');
                skipBtn.textContent = 'Saltar tour';
                skipBtn.className = 'lgt-tour-skip';
                skipBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    driverObj.destroy();
                });
                var navBtns = popover.footer.querySelector('.driver-popover-navigation-btns');
                if (navBtns) {
                    popover.footer.insertBefore(skipBtn, navBtns);
                } else {
                    popover.footer.appendChild(skipBtn);
                }
            },
            onDestroyStarted: function () {
                if (tourStarted) markComplete();
                closeMobileNav();
                driverObj.destroy();
            },
            steps: steps,
        });

        tourStarted = true;
        driverObj.drive();
    }

    function scheduleTour() {
        setTimeout(startTour, START_DELAY_MS);
    }

    // Botón "Ver tour de nuevo" del header
    var replayBtn = document.getElementById('btn-replay-tour');
    if (replayBtn) {
        replayBtn.addEventListener('click', function (e) {
            e.preventDefault();
            var roleId = window.__LGT ? asRole(window.__LGT.roleId) : 1;
            fetch('/api/onboarding/replay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
                .then(function () {
                    clearTourRedirectFlag();
                    window.location.href = getTourHome(roleId);
                })
                .catch(function () {});
        });
    }

    if (!window.__LGT || window.__LGT.onboarded) return;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleTour);
    } else {
        scheduleTour();
    }
})();
