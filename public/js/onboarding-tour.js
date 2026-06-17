(function () {
    'use strict';

    if (!window.__LGT || window.__LGT.onboarded) return;

    // ── Pasos por rol ──────────────────────────────────────────────────────────

    var STEPS_SUPERVISOR_ADMIN = [
        {
            element: '.logo',
            popover: {
                title: '¡Bienvenido/a a LogiTrack!',
                description: 'Este es el panel de control de tu operación logística. Te mostramos en unos pasos qué podés hacer desde acá.',
                side: 'right',
                align: 'start',
            },
        },
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
        {
            element: '.logo',
            popover: {
                title: '¡Bienvenido/a a LogiTrack!',
                description: 'Desde acá podés gestionar envíos, incidencias y solicitudes del portal de clientes.',
                side: 'right',
                align: 'start',
            },
        },
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

    var STEPS_DELIVERY = [
        {
            element: '.logo',
            popover: {
                title: '¡Bienvenido/a a LogiTrack!',
                description: 'Acá vas a encontrar todo lo que necesitás para gestionar tus entregas del día.',
                side: 'right',
                align: 'start',
            },
        },
        {
            element: '.active-hero',
            popover: {
                title: 'Tu ruta activa',
                description: 'Esta tarjeta muestra tu ruta en curso: progreso de entregas, dirección siguiente y estado general.',
                side: 'bottom',
                align: 'start',
            },
        },
        {
            element: '.route-card',
            popover: {
                title: 'Rutas asignadas',
                description: 'Tus próximas rutas aparecen acá. Hacé click en cualquiera para ver el detalle.',
                side: 'top',
                align: 'start',
            },
        },
        {
            element: '.nav a[href="/incident"]',
            popover: {
                title: 'Mis incidencias',
                description: 'Si encontrás un problema durante la entrega (daño, dirección incorrecta, etc.) podés reportarlo desde acá.',
                side: 'right',
            },
        },
    ];

    // ── Selección de pasos según rol ───────────────────────────────────────────

    function getSteps(roleId) {
        if (roleId === 4) return STEPS_SUPERVISOR_ADMIN.concat(STEPS_ADMIN_EXTRA);
        if (roleId === 1) return STEPS_SUPERVISOR_ADMIN;
        if (roleId === 2) return STEPS_OPERATOR;
        if (roleId === 3) return STEPS_DELIVERY;
        return [];
    }

    function filterSteps(steps) {
        return steps.filter(function (step) {
            if (!step.element) return true;
            return document.querySelector(step.element) !== null;
        });
    }

    // ── Marca el tour como completado en el servidor ───────────────────────────

    function markComplete() {
        fetch('/api/onboarding/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }).catch(function () {});
    }

    // ── Iniciar tour ───────────────────────────────────────────────────────────

    function startTour() {
        var steps = filterSteps(getSteps(window.__LGT.roleId));
        if (steps.length === 0) {
            markComplete();
            return;
        }

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
                // Inyectar botón "Saltar tour" a la izquierda de los botones de navegación
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
                markComplete();
                driverObj.destroy();
            },
            steps: steps,
        });

        driverObj.drive();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startTour);
    } else {
        startTour();
    }
})();
