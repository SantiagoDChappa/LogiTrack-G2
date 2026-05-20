(function () {
    'use strict';

    const shell = document.querySelector('[data-chatbot-shell]');
    if (!shell) { return; }

    const toggleButton = shell.querySelector('[data-chatbot-toggle]');
    const closeButton = shell.querySelector('[data-chatbot-close]');
    const windowEl = shell.querySelector('[data-chatbot-window]');
    const messagesEl = shell.querySelector('[data-chatbot-messages]');
    const formEl = shell.querySelector('[data-chatbot-form]');
    const inputEl = shell.querySelector('[data-chatbot-input]');
    const bootstrapEl = document.getElementById('portal-chatbot-data');
    const searchForm = document.getElementById('portal-search-form');
    const trackingInput = document.getElementById('tracking');
    const documentInput = document.getElementById('document');

    const STORAGE_KEYS = {
        open: 'portalChatbotOpen',
        selectedShipmentId: 'portalChatbotSelectedShipmentId',
    };

    const bootstrap = parseBootstrap(bootstrapEl);
    const shipments = Array.isArray(bootstrap.shipments) ? bootstrap.shipments : [];
    const support = bootstrap.support || {};

    const state = {
        pendingAction: null,
        selectedShipmentId: null,
    };

    const STATUS_COPY = {
        pendiente: {
            label: 'Pendiente',
            summary: 'El envio fue registrado en el sistema y todavia no entro en movimiento operativo.',
            next: 'Lo habitual es que luego pase a asignado, preparacion o transito.',
        },
        inicial: {
            label: 'Inicial',
            summary: 'El envio recien fue cargado o esta en una etapa muy temprana del circuito.',
            next: 'Todavia puede faltar asignacion o preparacion antes de salir.',
        },
        asignado: {
            label: 'Asignado',
            summary: 'El envio ya fue tomado por la operacion y tiene un recurso asignado para seguir el circuito.',
            next: 'El siguiente paso normal es la preparacion o la salida a transito.',
        },
        en_preparacion: {
            label: 'En Preparacion',
            summary: 'El envio se esta acondicionando o consolidando antes de continuar el recorrido.',
            next: 'Despues suele pasar a transito o a una sucursal de despacho.',
        },
        en_transito: {
            label: 'En Transito',
            summary: 'El paquete esta circulando entre nodos logisticos o hacia el destino final.',
            next: 'Segun el circuito, puede pasar por sucursal o quedar entregado.',
        },
        en_sucursal: {
            label: 'En Sucursal',
            summary: 'El envio fue escaneado en una sucursal o centro logistico intermedio.',
            next: 'Puede quedar listo para derivacion, reparto o retiro, segun la operacion.',
        },
        intento_fallido: {
            label: 'Intento Fallido',
            summary: 'Hubo un intento de entrega que no se pudo completar.',
            next: 'Suele resolverse con reintento, coordinacion o retiro por sucursal.',
        },
        paquete_fallido: {
            label: 'Paquete Fallido',
            summary: 'Se detecto una incidencia operativa y el envio necesita revision antes de continuar.',
            next: 'Normalmente requiere gestion interna antes de reanudar el circuito.',
        },
        retrasado: {
            label: 'Retrasado',
            summary: 'La entrega presenta una demora respecto del circuito esperado.',
            next: 'La fecha final puede ajustarse segun la operacion y el motivo de la demora.',
        },
        entregado: {
            label: 'Entregado',
            summary: 'El envio fue marcado como entregado al destinatario o receptor autorizado.',
            next: 'Desde este estado ya no deberia haber nuevos movimientos logisiticos.',
        },
        cancelado: {
            label: 'Cancelado',
            summary: 'El envio fue dado de baja y no seguira avanzando en el circuito.',
            next: 'Si necesitabas mas contexto, soporte puede revisar el motivo de la cancelacion.',
        },
        cancelada: {
            label: 'Cancelada',
            summary: 'El envio fue dado de baja y no seguira avanzando en el circuito.',
            next: 'Si necesitabas mas contexto, soporte puede revisar el motivo de la cancelacion.',
        },
        default: {
            label: 'Estado actual',
            summary: 'Puedo ayudarte a interpretar el estado una vez que identifiquemos el envio.',
            next: '',
        },
    };

    const STATUS_ALIASES = {
        pendiente: ['pendiente', 'confirmado', 'inicial'],
        asignado: ['asignado'],
        en_preparacion: ['en preparacion', 'preparacion'],
        en_transito: ['en transito', 'transito'],
        en_sucursal: ['en sucursal', 'sucursal'],
        intento_fallido: ['intento fallido'],
        paquete_fallido: ['paquete fallido'],
        retrasado: ['retrasado', 'demorado', 'demora'],
        entregado: ['entregado', 'entregada'],
        cancelado: ['cancelado', 'cancelada'],
    };

    init();

    function init() {
        restoreSelection();
        bindEvents();
        renderWelcome();

        if (readStorage(STORAGE_KEYS.open) === '1') {
            openChat(false);
        }
    }

    function restoreSelection() {
        if (shipments.length === 1) {
            state.selectedShipmentId = Number(shipments[0].id);
            highlightShipmentCard(state.selectedShipmentId);
            return;
        }

        const storedId = Number(readStorage(STORAGE_KEYS.selectedShipmentId));
        if (!storedId) { return; }

        if (shipments.some((shipment) => Number(shipment.id) === storedId)) {
            state.selectedShipmentId = storedId;
            highlightShipmentCard(storedId);
        }
    }

    function bindEvents() {
        toggleButton?.addEventListener('click', function () {
            if (windowEl.hidden) {
                openChat(true);
                return;
            }
            closeChat();
        });

        closeButton?.addEventListener('click', function () {
            closeChat();
        });

        formEl?.addEventListener('submit', function (event) {
            event.preventDefault();
            const value = inputEl.value.trim();
            if (!value) { return; }

            addUserMessage(value);
            inputEl.value = '';
            routeText(value);
        });

        messagesEl?.addEventListener('click', function (event) {
            const actionButton = event.target.closest('[data-action]');
            if (!actionButton) { return; }

            const actionLabel = actionButton.textContent.trim();
            if (actionLabel) {
                addUserMessage(actionLabel);
            }

            handleAction(actionButton.dataset.action, actionButton.dataset.value || '');
        });
    }

    function openChat(focusInput) {
        shell.classList.add('is-open');
        windowEl.hidden = false;
        toggleButton?.setAttribute('aria-expanded', 'true');
        writeStorage(STORAGE_KEYS.open, '1');

        if (focusInput) {
            window.setTimeout(function () {
                inputEl?.focus();
            }, 60);
        }

        scrollThreadToBottom();
    }

    function closeChat() {
        shell.classList.remove('is-open');
        windowEl.hidden = true;
        toggleButton?.setAttribute('aria-expanded', 'false');
        writeStorage(STORAGE_KEYS.open, '0');
    }

    function renderWelcome() {
        addBotMessage({
            text: 'Soy el asistente del portal publico. Puedo ayudarte con seguimiento, estados, historial, incidencias, sucursales, entregas y soporte.',
        });

        if (bootstrap.error) {
            addBotMessage({
                text: bootstrap.error + ' Si quieres, podemos intentar otra busqueda o revisar opciones generales del portal.',
                actions: [
                    { label: 'Buscar otro envio', action: 'request-lookup' },
                    { label: 'Preguntas frecuentes', action: 'scroll-faq' },
                    { label: 'Soporte humano', action: 'show-support' },
                ],
            });
            showMainMenu(true);
            return;
        }

        if (shipments.length === 1) {
            const selected = selectShipment(shipments[0].id, {
                announce: false,
                scroll: false,
            });

            if (selected) {
                addBotMessage({
                    text: 'Ya tome este envio como contexto activo.',
                    html: buildShipmentSummary(selected),
                    actions: buildShipmentContextActions(selected),
                });
            }

            showMainMenu(true);
            return;
        }

        if (shipments.length > 1) {
            addBotMessage({
                text: 'Encontre varios envios para esta busqueda. Puedes elegir uno para ver su detalle o seguir con consultas generales.',
                actions: buildShipmentSelectionActions(),
            });
            showMainMenu(true);
            return;
        }

        if (bootstrap.searched && !shipments.length) {
            addBotMessage({
                text: 'No veo resultados cargados para esta consulta. Puedes intentar con otro tracking, buscar por DNI o ir directo a soporte.',
                actions: [
                    { label: 'Buscar envio', action: 'request-lookup' },
                    { label: 'Soporte humano', action: 'show-support' },
                ],
            });
            showMainMenu(true);
            return;
        }

        addBotMessage({
            text: 'Para empezar, escribe un numero de seguimiento como ENV-001 o un DNI del destinatario.',
            actions: [
                { label: 'Buscar envio', action: 'request-lookup' },
                { label: 'Ver FAQ', action: 'scroll-faq' },
            ],
        });
        showMainMenu(true);
    }

    function showMainMenu(isInitial) {
        addBotMessage({
            text: isInitial
                ? 'Estas son las ramas principales que ya cubre esta primera implementacion:'
                : 'Estas son las opciones principales del asistente:',
            actions: [
                { label: 'Buscar envio', action: 'request-lookup' },
                { label: 'Estado actual', action: 'show-status' },
                { label: 'Significado de estados', action: 'show-status-guide' },
                { label: 'Ubicacion y recorrido', action: 'show-location' },
                { label: 'Fecha estimada', action: 'show-eta' },
                { label: 'Historial de movimientos', action: 'show-history' },
                { label: 'Incidencias', action: 'show-issues' },
                { label: 'Sucursal o retiro', action: 'show-branch' },
                { label: 'Comprobante de entrega', action: 'show-pod' },
                { label: 'Cambios o gestion', action: 'show-management' },
                { label: 'Notificaciones', action: 'show-notifications' },
                { label: 'Soporte humano', action: 'show-support' },
            ],
        });
    }

    function handleAction(action, value) {
        switch (action) {
        case 'request-lookup':
            openChat(true);
            addBotMessage({
                text: 'Escribeme un tracking o un DNI y lo busco en el portal. Ejemplos: ENV-001 o 12345678.',
                actions: [
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            inputEl?.focus();
            break;
        case 'show-main-menu':
            showMainMenu(false);
            break;
        case 'show-status':
            if (shipments.length > 1 && !getSelectedShipment()) {
                state.pendingAction = 'show-status';
                showShipmentSelectionPrompt('ver el estado actual');
                break;
            }
            showStatus(getSelectedShipment());
            break;
        case 'show-status-guide':
            showStatusGuide(detectStatusKeyFromText(normalizeText(value)));
            break;
        case 'show-location':
            if (shipments.length > 1 && !getSelectedShipment()) {
                state.pendingAction = 'show-location';
                showShipmentSelectionPrompt('ver la ubicacion y el recorrido');
                break;
            }
            showLocation(getSelectedShipment());
            break;
        case 'show-eta':
            if (shipments.length > 1 && !getSelectedShipment()) {
                state.pendingAction = 'show-eta';
                showShipmentSelectionPrompt('consultar la fecha estimada');
                break;
            }
            showEta(getSelectedShipment());
            break;
        case 'show-history':
            if (shipments.length > 1 && !getSelectedShipment()) {
                state.pendingAction = 'show-history';
                showShipmentSelectionPrompt('ver el historial');
                break;
            }
            showHistory(getSelectedShipment());
            break;
        case 'show-issues':
            if (shipments.length > 1 && !getSelectedShipment()) {
                state.pendingAction = 'show-issues';
                showShipmentSelectionPrompt('revisar incidencias');
                break;
            }
            showIssues(getSelectedShipment());
            break;
        case 'show-branch':
            if (shipments.length > 1 && !getSelectedShipment()) {
                state.pendingAction = 'show-branch';
                showShipmentSelectionPrompt('revisar sucursal o retiro');
                break;
            }
            showBranch(getSelectedShipment());
            break;
        case 'show-pod':
            if (shipments.length > 1 && !getSelectedShipment()) {
                state.pendingAction = 'show-pod';
                showShipmentSelectionPrompt('revisar el comprobante');
                break;
            }
            showPod(getSelectedShipment());
            break;
        case 'show-management':
            showManagement(getSelectedShipment());
            break;
        case 'show-notifications':
            showNotifications(getSelectedShipment());
            break;
        case 'show-support':
            showSupport();
            break;
        case 'focus-shipment':
            selectShipment(value, {
                announce: true,
                scroll: true,
            });
            break;
        case 'scroll-faq':
            scrollToElement(document.getElementById('portal-faq-section'));
            addBotMessage({
                text: 'Te lleve a la seccion de preguntas frecuentes. Si luego quieres, aqui seguimos con cualquier consulta puntual.',
                actions: [
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            break;
        case 'go-support':
            scrollToElement(document.getElementById('portal-support-section'));
            addBotMessage({
                text: 'Te lleve a la seccion de contacto y soporte.',
                actions: [
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            break;
        case 'go-results':
            scrollToElement(document.getElementById('portal-results-section'));
            addBotMessage({
                text: 'Te lleve a los resultados del seguimiento cargados en esta pagina.',
                actions: [
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            break;
        case 'go-login':
            window.location.href = '/login';
            break;
        default:
            showFallback();
            break;
        }
    }

    function routeText(input) {
        const trimmed = input.trim();
        const normalized = normalizeText(trimmed);
        const trackingMatch = trimmed.toUpperCase().match(/\b[A-Z]{3,6}-\d{2,}\b/);
        const digitsOnly = trimmed.replace(/\D/g, '');

        if (trackingMatch) {
            submitLookup(trackingMatch[0]);
            return;
        }

        if (/^\d{7,10}$/.test(digitsOnly)) {
            submitLookup(digitsOnly);
            return;
        }

        const explicitStatus = detectStatusKeyFromText(normalized);
        if (explicitStatus && (
            normalized.includes('que significa') ||
            normalized.includes('significa') ||
            normalized.includes('estado ') ||
            normalized === explicitStatus.replace(/_/g, ' ')
        )) {
            showStatusGuide(explicitStatus);
            return;
        }

        if (containsAny(normalized, ['menu', 'opciones', 'inicio'])) {
            showMainMenu(false);
            return;
        }

        if (containsAny(normalized, ['preguntas frecuentes', 'faq'])) {
            handleAction('scroll-faq');
            return;
        }

        if (containsAny(normalized, ['soporte', 'asesor', 'agente', 'humano', 'ayuda', 'contacto', 'reclamo'])) {
            showSupport();
            return;
        }

        if (containsAny(normalized, ['que significa', 'significa', 'estados', 'estado pendiente', 'estado en transito', 'estado en sucursal'])) {
            showStatusGuide(explicitStatus);
            return;
        }

        if (containsAny(normalized, ['historial', 'movimientos', 'movimiento', 'paso a paso', 'seguimiento completo'])) {
            handleAction('show-history');
            return;
        }

        if (containsAny(normalized, ['donde esta', 'ubicacion', 'recorrido', 'mapa', 'gps'])) {
            handleAction('show-location');
            return;
        }

        if (containsAny(normalized, ['cuando llega', 'fecha estimada', 'horario', 'ventana horaria', 'eta', 'estimado'])) {
            handleAction('show-eta');
            return;
        }

        if (containsAny(normalized, ['incidencia', 'problema', 'demora', 'retraso', 'intento fallido', 'paquete fallido', 'no llego', 'fallo'])) {
            handleAction('show-issues');
            return;
        }

        if (containsAny(normalized, ['sucursal', 'retiro', 'retirar'])) {
            handleAction('show-branch');
            return;
        }

        if (containsAny(normalized, ['comprobante', 'pod', 'firma', 'evidencia', 'quien recibio'])) {
            handleAction('show-pod');
            return;
        }

        if (containsAny(normalized, ['cambiar direccion', 'modificar', 'cambiar datos', 'reprogramar', 'cancelar'])) {
            handleAction('show-management');
            return;
        }

        if (containsAny(normalized, ['notificacion', 'notificaciones', 'mail', 'email', 'sms', 'avisos'])) {
            handleAction('show-notifications');
            return;
        }

        if (containsAny(normalized, ['estado', 'como va'])) {
            handleAction('show-status');
            return;
        }

        showFallback();
    }

    function showStatus(shipment) {
        if (!shipment) {
            showStatusGuide();
            return;
        }

        const copy = getStatusCopy(shipment.statusKey);
        const parts = [
            shipment.trackingId + ' figura como ' + copy.label + '.',
            copy.summary,
        ];

        if (shipment.lastMovementDateLabel) {
            parts.push('Ultima actualizacion visible: ' + shipment.lastMovementDateLabel + '.');
        }

        if (shipment.lastComment) {
            parts.push('Detalle informado: ' + shipment.lastComment + '.');
        }

        if (copy.next) {
            parts.push(copy.next);
        }

        addBotMessage({
            text: parts.join(' '),
            html: buildShipmentSummary(shipment),
            actions: [
                { label: 'Ubicacion y recorrido', action: 'show-location' },
                { label: 'Fecha estimada', action: 'show-eta' },
                { label: 'Historial', action: 'show-history' },
                { label: 'Incidencias', action: 'show-issues' },
            ],
        });
    }

    function showStatusGuide(statusKey) {
        if (statusKey) {
            const copy = getStatusCopy(statusKey);
            addBotMessage({
                text: copy.label + ': ' + copy.summary + (copy.next ? ' ' + copy.next : ''),
                actions: [
                    { label: 'Buscar un envio', action: 'request-lookup' },
                    { label: 'Ver todos los estados', action: 'show-status-guide' },
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            return;
        }

        const orderedKeys = [
            'pendiente',
            'asignado',
            'en_preparacion',
            'en_transito',
            'en_sucursal',
            'intento_fallido',
            'paquete_fallido',
            'retrasado',
            'entregado',
            'cancelado',
        ];

        const html = [
            '<ul class="portal-chatbot-rich-list">',
            orderedKeys.map(function (key) {
                const copy = getStatusCopy(key);
                return '<li><strong>' + escapeHtml(copy.label) + ':</strong> ' + escapeHtml(copy.summary) + '</li>';
            }).join(''),
            '</ul>',
        ].join('');

        addBotMessage({
            text: 'Referencia rapida de estados del portal:',
            html: html,
            actions: [
                { label: 'Buscar un envio', action: 'request-lookup' },
                { label: 'Estado actual', action: 'show-status' },
                { label: 'Volver al menu', action: 'show-main-menu' },
            ],
        });
    }

    function showLocation(shipment) {
        if (!shipment) {
            addBotMessage({
                text: 'Para ubicar un envio puntual necesito un tracking o un DNI. Si ya lo tienes, puedo decirte la ultima sucursal visible, el destino y si tiene ruta activa.',
                actions: [
                    { label: 'Buscar envio', action: 'request-lookup' },
                    { label: 'Ver FAQ', action: 'scroll-faq' },
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            return;
        }

        const parts = [];

        if (shipment.hasLiveTracking) {
            parts.push('Este envio tiene una ruta activa, asi que el mapa del portal puede mostrar actividad en vivo.');
        } else {
            parts.push('La ubicacion publica depende de los movimientos escaneados en el circuito.');
        }

        if (shipment.currentBranchName) {
            parts.push('Ultimo nodo visible: ' + shipment.currentBranchName + '.');
        }

        if (shipment.destinationAddress && shipment.destinationAddress !== '-') {
            parts.push('Destino informado: ' + shipment.destinationAddress + ', ' + shipment.destination + '.');
        } else if (shipment.destination && shipment.destination !== '-') {
            parts.push('Destino informado: ' + shipment.destination + '.');
        }

        if (shipment.lastMovementDateLabel) {
            parts.push('Ultimo movimiento visible: ' + shipment.lastMovementDateLabel + '.');
        }

        if (document.getElementById('portal-map-' + shipment.id)) {
            parts.push('Si quieres, puedes bajar al mapa de la tarjeta para ver el recorrido cargado.');
        }

        addBotMessage({
            text: parts.join(' '),
            actions: [
                { label: 'Ver tarjeta del envio', action: 'focus-shipment', value: String(shipment.id) },
                { label: 'Fecha estimada', action: 'show-eta' },
                { label: 'Historial', action: 'show-history' },
                { label: 'Volver al menu', action: 'show-main-menu' },
            ],
        });
    }

    function showEta(shipment) {
        if (!shipment) {
            addBotMessage({
                text: 'La fecha estimada depende del envio. Si existe una fecha o ventana horaria cargada, puedo mostrartela una vez que identifiquemos el seguimiento.',
                actions: [
                    { label: 'Buscar envio', action: 'request-lookup' },
                    { label: 'Incidencias', action: 'show-issues' },
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            return;
        }

        let text = '';

        if (shipment.statusKey === 'entregado') {
            text = shipment.lastMovementDateLabel
                ? 'El envio ya figura entregado. La ultima fecha visible es ' + shipment.lastMovementDateLabel + '.'
                : 'El envio ya figura entregado.';
        } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
            text = 'El envio esta cancelado, asi que ya no tiene una fecha estimada activa.';
        } else if (shipment.expectedDeliveryDateLabel && shipment.expectedDeliveryWindow) {
            text = 'La entrega estimada es para ' + shipment.expectedDeliveryDateLabel + ' en la ventana de ' + shipment.expectedDeliveryWindow + '.';
        } else if (shipment.expectedDeliveryDateLabel) {
            text = 'La entrega estimada figura para ' + shipment.expectedDeliveryDateLabel + '.';
        } else if (shipment.statusKey === 'retrasado' || shipment.statusKey === 'intento_fallido' || shipment.statusKey === 'paquete_fallido') {
            text = 'No veo una nueva ETA publica confirmada para este envio. Como hubo una incidencia o demora, el horario final puede reprogramarse.';
        } else if (shipment.statusKey === 'en_transito' || shipment.statusKey === 'en_sucursal') {
            text = 'El envio ya esta operativo, pero este portal todavia no muestra una ETA fina para este caso.';
        } else {
            text = 'Todavia no veo una fecha estimada publica cargada para este envio.';
        }

        addBotMessage({
            text: text,
            actions: [
                { label: 'Estado actual', action: 'show-status' },
                { label: 'Incidencias', action: 'show-issues' },
                { label: 'Soporte humano', action: 'show-support' },
                { label: 'Volver al menu', action: 'show-main-menu' },
            ],
        });
    }

    function showHistory(shipment) {
        if (!shipment) {
            addBotMessage({
                text: 'Para mostrar el historial necesito un envio identificado. Si ya tienes tracking o DNI, lo busco y te muestro el paso a paso.',
                actions: [
                    { label: 'Buscar envio', action: 'request-lookup' },
                    { label: 'Estado actual', action: 'show-status' },
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            return;
        }

        if (!Array.isArray(shipment.history) || shipment.history.length === 0) {
            addBotMessage({
                text: 'Todavia no hay movimientos publicos visibles para ' + shipment.trackingId + '.',
                actions: [
                    { label: 'Estado actual', action: 'show-status' },
                    { label: 'Fecha estimada', action: 'show-eta' },
                ],
            });
            return;
        }

        const html = [
            '<ol class="portal-chatbot-history-list">',
            shipment.history.map(function (item) {
                const meta = [];
                if (item.branchName) {
                    meta.push('Sucursal: ' + item.branchName);
                }
                if (item.comment) {
                    meta.push(item.comment);
                }

                return [
                    '<li>',
                    '<strong>' + escapeHtml(item.changedAtLabel || '-') + '</strong>',
                    '<span>' + escapeHtml(item.toStatus || '-') + '</span>',
                    meta.length ? '<p>' + escapeHtml(meta.join(' | ')) + '</p>' : '',
                    '</li>',
                ].join('');
            }).join(''),
            '</ol>',
        ].join('');

        addBotMessage({
            text: 'Este es el historial visible para ' + shipment.trackingId + ':',
            html: html,
            actions: [
                { label: 'Ver tarjeta del envio', action: 'focus-shipment', value: String(shipment.id) },
                { label: 'Estado actual', action: 'show-status' },
                { label: 'Incidencias', action: 'show-issues' },
                { label: 'Volver al menu', action: 'show-main-menu' },
            ],
        });
    }

    function showIssues(shipment) {
        if (!shipment) {
            const html = [
                '<ul class="portal-chatbot-rich-list">',
                '<li><strong>Intento fallido:</strong> hubo una visita de entrega que no se pudo cerrar.</li>',
                '<li><strong>Paquete fallido:</strong> hay una incidencia operativa que requiere revision.</li>',
                '<li><strong>Retrasado:</strong> existe una demora respecto del circuito esperado.</li>',
                '</ul>',
            ].join('');

            addBotMessage({
                text: 'Estas son las incidencias mas comunes que puedo explicar desde el portal:',
                html: html,
                actions: [
                    { label: 'Buscar envio', action: 'request-lookup' },
                    { label: 'Significado de estados', action: 'show-status-guide' },
                    { label: 'Soporte humano', action: 'show-support' },
                ],
            });
            return;
        }

        let text = '';

        if (shipment.statusKey === 'retrasado') {
            text = 'Este envio figura con demora. Es probable que la fecha final de entrega se mueva respecto de lo planeado.';
        } else if (shipment.statusKey === 'intento_fallido') {
            text = 'Este envio tuvo un intento de entrega sin exito. Normalmente sigue con reintento, coordinacion o retiro por sucursal.';
        } else if (shipment.statusKey === 'paquete_fallido') {
            text = 'Este envio tiene una incidencia operativa y necesita gestion interna antes de seguir avanzando.';
        } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
            text = 'El envio ya figura cancelado. No deberia seguir moviendose salvo una reapertura interna.';
        } else if (shipment.statusKey === 'entregado') {
            text = 'No veo una incidencia activa. Si tienes un reclamo posterior a la entrega, conviene pasar por soporte.';
        } else {
            text = 'No veo una incidencia explicita en este momento. El envio sigue un circuito normal segun el estado actual.';
        }

        if (shipment.lastComment) {
            text += ' Ultimo detalle visible: ' + shipment.lastComment + '.';
        }

        addBotMessage({
            text: text,
            actions: [
                { label: 'Fecha estimada', action: 'show-eta' },
                { label: 'Sucursal o retiro', action: 'show-branch' },
                { label: 'Soporte humano', action: 'show-support' },
                { label: 'Volver al menu', action: 'show-main-menu' },
            ],
        });
    }

    function showBranch(shipment) {
        if (!shipment) {
            addBotMessage({
                text: 'La sucursal visible depende del envio y de los escaneos operativos. Si quieres, busca un tracking o DNI y te digo la ultima sucursal o nodo registrado.',
                actions: [
                    { label: 'Buscar envio', action: 'request-lookup' },
                    { label: 'Soporte humano', action: 'show-support' },
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            return;
        }

        const parts = [];

        if (shipment.currentBranchName) {
            parts.push('La ultima sucursal o nodo visible es ' + shipment.currentBranchName + '.');
        } else {
            parts.push('Este portal no expone una sucursal actual confirmada para este envio.');
        }

        if (shipment.statusKey === 'en_sucursal') {
            parts.push('Como el estado actual es En Sucursal, esa referencia es la mas importante para consulta o posible retiro.');
        } else if (shipment.statusKey === 'intento_fallido') {
            parts.push('Despues de un intento fallido, el retiro por sucursal puede depender de la gestion interna.');
        } else {
            parts.push('La disponibilidad para retiro depende de la operacion y no siempre queda habilitada desde el portal publico.');
        }

        addBotMessage({
            text: parts.join(' '),
            actions: [
                { label: 'Ver tarjeta del envio', action: 'focus-shipment', value: String(shipment.id) },
                { label: 'Incidencias', action: 'show-issues' },
                { label: 'Soporte humano', action: 'show-support' },
                { label: 'Volver al menu', action: 'show-main-menu' },
            ],
        });
    }

    function showPod(shipment) {
        if (!shipment) {
            addBotMessage({
                text: 'El comprobante de entrega solo aplica a envios ya entregados. Si quieres revisar uno puntual, busca el tracking o DNI y validamos el estado.',
                actions: [
                    { label: 'Buscar envio', action: 'request-lookup' },
                    { label: 'Soporte humano', action: 'show-support' },
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            return;
        }

        let text = '';
        if (shipment.statusKey === 'entregado') {
            text = 'Este envio ya figura entregado. El portal publico no muestra todavia la evidencia completa o firma del POD, asi que ese detalle debe revisarse por soporte o por el panel empresarial.';
        } else {
            text = 'Todavia no puedo mostrar un comprobante porque el envio no figura como entregado.';
        }

        addBotMessage({
            text: text,
            actions: [
                { label: 'Estado actual', action: 'show-status' },
                { label: 'Soporte humano', action: 'show-support' },
                { label: 'Acceso empresas', action: 'go-login' },
            ],
        });
    }

    function showManagement(shipment) {
        if (!shipment) {
            addBotMessage({
                text: 'Desde el portal publico no hay autogestion para cambiar direccion, contacto, horario, cancelacion o reprogramacion. Esos pedidos hoy pasan por soporte o por el panel empresarial.',
                actions: [
                    { label: 'Soporte humano', action: 'show-support' },
                    { label: 'Acceso empresas', action: 'go-login' },
                    { label: 'Volver al menu', action: 'show-main-menu' },
                ],
            });
            return;
        }

        let text = 'Desde el portal publico no puedes autogestionar cambios de este envio.';

        if (containsAny(shipment.statusKey, ['pendiente', 'asignado', 'en_preparacion', 'inicial'])) {
            text += ' Como todavia no esta cerrado, soporte podria revisar si existe margen operativo para cambios.';
        } else if (containsAny(shipment.statusKey, ['en_transito', 'en_sucursal', 'retrasado', 'intento_fallido', 'paquete_fallido'])) {
            text += ' Como ya esta en operacion, los cambios suelen tener mas restricciones y necesitan validacion interna.';
        } else if (shipment.statusKey === 'entregado') {
            text += ' Ya fue entregado, asi que no admite reprogramaciones.';
        } else if (shipment.statusKey === 'cancelado' || shipment.statusKey === 'cancelada') {
            text += ' Ya fue cancelado, asi que no tiene gestion activa.';
        }

        addBotMessage({
            text: text,
            actions: [
                { label: 'Soporte humano', action: 'show-support' },
                { label: 'Acceso empresas', action: 'go-login' },
                { label: 'Estado actual', action: 'show-status' },
            ],
        });
    }

    function showNotifications(shipment) {
        const text = shipment
            ? 'Para ' + shipment.trackingId + ', este portal funciona como canal de consulta manual. Todavia no hay alta de notificaciones configurables desde esta vista publica.'
            : 'El portal publico todavia no ofrece autogestion de alertas por mail o SMS. La consulta hoy es manual desde esta pagina.';

        addBotMessage({
            text: text,
            actions: [
                { label: 'Historial de movimientos', action: 'show-history' },
                { label: 'Soporte humano', action: 'show-support' },
                { label: 'Volver al menu', action: 'show-main-menu' },
            ],
        });
    }

    function showSupport() {
        const email = support.email || 'soporte@logitrack.com';
        const hours = support.hours || 'Lunes a viernes, 9 a 18 hs';
        const html = [
            '<div class="portal-chatbot-support-card">',
            '<strong>Canales de soporte</strong>',
            '<p>Email: <a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + '</a></p>',
            '<p>Horario: ' + escapeHtml(hours) + '</p>',
            '</div>',
        ].join('');

        addBotMessage({
            text: 'Si necesitas ayuda humana o revisar un caso puntual, estos son los canales visibles en el portal:',
            html: html,
            actions: [
                { label: 'Ir a soporte en la pagina', action: 'go-support' },
                { label: 'Preguntas frecuentes', action: 'scroll-faq' },
                { label: 'Acceso empresas', action: 'go-login' },
            ],
        });
    }

    function showFallback() {
        addBotMessage({
            text: 'Todavia no interpreto esa consulta exacta, pero si puedo ayudarte con seguimiento, estados, historial, incidencias, sucursales, comprobantes y soporte.',
            actions: [
                { label: 'Ver menu principal', action: 'show-main-menu' },
                { label: 'Buscar envio', action: 'request-lookup' },
                { label: 'Soporte humano', action: 'show-support' },
            ],
        });
    }

    function showShipmentSelectionPrompt(reason) {
        addBotMessage({
            text: 'Encontre varios envios para esta busqueda. Elige cual quieres revisar para ' + reason + ':',
            actions: buildShipmentSelectionActions(),
        });
    }

    function buildShipmentSelectionActions() {
        return shipments.map(function (shipment) {
            return {
                label: shipment.trackingId + ' - ' + shipment.status,
                action: 'focus-shipment',
                value: String(shipment.id),
            };
        });
    }

    function buildShipmentContextActions(shipment) {
        return [
            { label: 'Estado actual', action: 'show-status' },
            { label: 'Ubicacion y recorrido', action: 'show-location' },
            { label: 'Fecha estimada', action: 'show-eta' },
            { label: 'Historial', action: 'show-history' },
            { label: 'Ver tarjeta del envio', action: 'focus-shipment', value: String(shipment.id) },
        ];
    }

    function buildShipmentSummary(shipment) {
        const lines = [
            '<div class="portal-chatbot-summary">',
            '<div class="portal-chatbot-summary-top">',
            '<strong>' + escapeHtml(shipment.trackingId || '-') + '</strong>',
            '<span class="portal-chatbot-status portal-chatbot-status--' + escapeHtml(shipment.statusKey || 'default') + '">' + escapeHtml(shipment.status || '-') + '</span>',
            '</div>',
            '<p><strong>Destinatario:</strong> ' + escapeHtml(shipment.recipient || '-') + '</p>',
            '<p><strong>Destino:</strong> ' + escapeHtml(shipment.destinationAddress && shipment.destinationAddress !== '-' ? shipment.destinationAddress + ', ' + shipment.destination : shipment.destination || '-') + '</p>',
        ];

        if (shipment.currentBranchName) {
            lines.push('<p><strong>Ultimo nodo:</strong> ' + escapeHtml(shipment.currentBranchName) + '</p>');
        }

        if (shipment.expectedDeliveryDateLabel) {
            lines.push('<p><strong>ETA:</strong> ' + escapeHtml(shipment.expectedDeliveryDateLabel + (shipment.expectedDeliveryWindow ? ' - ' + shipment.expectedDeliveryWindow : '')) + '</p>');
        }

        lines.push('</div>');
        return lines.join('');
    }

    function selectShipment(id, options) {
        const shipment = shipments.find(function (item) {
            return String(item.id) === String(id);
        });

        if (!shipment) { return null; }

        state.selectedShipmentId = Number(shipment.id);
        writeStorage(STORAGE_KEYS.selectedShipmentId, String(shipment.id));

        highlightShipmentCard(shipment.id);

        if (options && options.scroll) {
            scrollToElement(document.getElementById('portal-shipment-' + shipment.id));
        }

        if (options && options.announce) {
            addBotMessage({
                text: 'Tomo ' + shipment.trackingId + ' como envio activo.',
                html: buildShipmentSummary(shipment),
                actions: buildShipmentContextActions(shipment),
            });
        }

        if (state.pendingAction) {
            const pendingAction = state.pendingAction;
            state.pendingAction = null;
            handleAction(pendingAction, '');
        }

        return shipment;
    }

    function getSelectedShipment() {
        if (!shipments.length) { return null; }

        if (state.selectedShipmentId == null) {
            return shipments.length === 1 ? shipments[0] : null;
        }

        return shipments.find(function (shipment) {
            return Number(shipment.id) === Number(state.selectedShipmentId);
        }) || null;
    }

    function highlightShipmentCard(id) {
        const cards = document.querySelectorAll('.portal-card');
        cards.forEach(function (card) {
            card.classList.remove('portal-card--chatbot-focus');
        });

        const selectedCard = document.getElementById('portal-shipment-' + id);
        if (selectedCard) {
            selectedCard.classList.add('portal-card--chatbot-focus');
        }
    }

    function submitLookup(value) {
        const query = String(value || '').trim();
        if (!query || !searchForm || !trackingInput || !documentInput) {
            addBotMessage({
                text: 'No pude preparar la busqueda en esta pagina. Si quieres, prueba desde el formulario principal del portal.',
            });
            return;
        }

        const normalizedTracking = query.toUpperCase();
        const normalizedDigits = query.replace(/\D/g, '');
        const isDocument = /^\d{7,10}$/.test(normalizedDigits);
        const finalQuery = isDocument ? normalizedDigits : normalizedTracking;

        if (normalizeText(bootstrap.query || '') === normalizeText(finalQuery) && bootstrap.searched) {
            if (shipments.length) {
                addBotMessage({
                    text: 'Esa busqueda ya esta cargada en esta misma pagina.',
                    actions: [
                        { label: 'Ir a resultados', action: 'go-results' },
                        { label: 'Volver al menu', action: 'show-main-menu' },
                    ],
                });
            } else {
                addBotMessage({
                    text: 'Esa busqueda ya fue hecha y sigue sin resultados visibles.',
                    actions: [
                        { label: 'Buscar otro envio', action: 'request-lookup' },
                        { label: 'Soporte humano', action: 'show-support' },
                    ],
                });
            }
            return;
        }

        trackingInput.value = isDocument ? '' : normalizedTracking;
        documentInput.value = isDocument ? normalizedDigits : '';

        writeStorage(STORAGE_KEYS.open, '1');
        addBotMessage({
            text: 'Voy a buscar ' + finalQuery + ' en el portal.',
        });

        window.setTimeout(function () {
            searchForm.submit();
        }, 150);
    }

    function addBotMessage(payload) {
        addMessage('bot', payload);
    }

    function addUserMessage(text) {
        addMessage('user', { text: text });
    }

    function addMessage(role, payload) {
        const wrapper = document.createElement('article');
        wrapper.className = 'portal-chatbot-message portal-chatbot-message--' + role;

        const bubble = document.createElement('div');
        bubble.className = 'portal-chatbot-bubble';

        if (payload.text) {
            const paragraph = document.createElement('p');
            paragraph.innerHTML = escapeHtml(payload.text).replace(/\n/g, '<br>');
            bubble.appendChild(paragraph);
        }

        if (payload.html) {
            const richContent = document.createElement('div');
            richContent.className = 'portal-chatbot-rich';
            richContent.innerHTML = payload.html;
            bubble.appendChild(richContent);
        }

        wrapper.appendChild(bubble);

        if (Array.isArray(payload.actions) && payload.actions.length) {
            const actionsEl = document.createElement('div');
            actionsEl.className = 'portal-chatbot-actions';

            payload.actions.forEach(function (item) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'portal-chatbot-chip';
                button.dataset.action = item.action;
                if (item.value != null) {
                    button.dataset.value = item.value;
                }
                button.textContent = item.label;
                actionsEl.appendChild(button);
            });

            wrapper.appendChild(actionsEl);
        }

        messagesEl.appendChild(wrapper);
        scrollThreadToBottom();
    }

    function scrollThreadToBottom() {
        if (!messagesEl) { return; }
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function scrollToElement(element) {
        if (!element) { return; }
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function getStatusCopy(statusKey) {
        return STATUS_COPY[statusKey] || STATUS_COPY.default;
    }

    function detectStatusKeyFromText(text) {
        const entries = Object.entries(STATUS_ALIASES);
        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            const key = entry[0];
            const aliases = entry[1];
            if (aliases.some(function (alias) { return text.includes(alias); })) {
                return key;
            }
        }
        return '';
    }

    function parseBootstrap(element) {
        if (!element) { return {}; }

        try {
            return JSON.parse(element.textContent || '{}');
        } catch (error) {
            return {};
        }
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function containsAny(value, candidates) {
        return candidates.some(function (candidate) {
            return String(value || '').includes(candidate);
        });
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function writeStorage(key, value) {
        try {
            window.sessionStorage.setItem(key, value);
        } catch (error) {
            // ignore storage errors
        }
    }

    function readStorage(key) {
        try {
            return window.sessionStorage.getItem(key) || '';
        } catch (error) {
            return '';
        }
    }
})();
