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
        restorePending: 'portalChatbotRestorePending',
        thread: 'portalChatbotThread',
    };
    const INIT_GREETING = 'Hola. Te ayudo a seguir tu envio y entender que esta pasando.';

    const bootstrap = parseBootstrap(bootstrapEl);
    const state = {
        pendingAction: null,
        selectedShipmentId: readStorage(STORAGE_KEYS.selectedShipmentId) || null,
    };
    let thread = [];

    let requestInFlight = false;

    init();

    async function init() {
        bindEvents();
        await hydrateConversation();

        if (readStorage(STORAGE_KEYS.open) === '1') {
            openChat(false);
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

        formEl?.addEventListener('submit', async function (event) {
            event.preventDefault();

            if (requestInFlight) { return; }

            const value = inputEl.value.trim();
            if (!value) { return; }

            addUserMessage(value);
            inputEl.value = '';

            await dispatchToBot({
                type: 'message',
                text: value,
            });
        });

        messagesEl?.addEventListener('click', async function (event) {
            const actionButton = event.target.closest('[data-action]');
            if (!actionButton || requestInFlight) { return; }

            const actionLabel = actionButton.textContent.trim();
            if (actionLabel) {
                addUserMessage(actionLabel);
            }

            await dispatchToBot({
                type: 'action',
                action: actionButton.dataset.action || '',
                value: actionButton.dataset.value || '',
            });
        });
    }

    async function hydrateConversation() {
        const restored = restoreConversationIfNeeded();
        if (!restored) {
            messagesEl.innerHTML = '';
            thread = [];
            persistThread();
        }

        clearShipmentHighlight();

        try {
            const response = await sendBotRequest({
                type: 'init',
            });

            applyBotResponse(response, {
                skipLeadingGreeting: restored && thread.length > 0,
            });
        } catch (error) {
            addBotMessage({
                text: 'No pude iniciar el asistente en este momento. Si queres, proba de nuevo o usa el formulario principal del portal.',
            });
        }
    }

    async function dispatchToBot(input) {
        try {
            const response = await sendBotRequest(input);
            applyBotResponse(response);
        } catch (error) {
            addBotMessage({
                text: 'No pude procesar esa consulta en este momento. Si queres, intenta de nuevo o usa el formulario principal del portal.',
            });
        }
    }

    async function sendBotRequest(input) {
        requestInFlight = true;

        try {
            const response = await fetch('/chatbot/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    context: bootstrap,
                    state: {
                        pendingAction: state.pendingAction,
                        selectedShipmentId: state.selectedShipmentId,
                    },
                    input,
                }),
            });

            if (!response.ok) {
                throw new Error('Chatbot request failed');
            }

            return await response.json();
        } finally {
            requestInFlight = false;
        }
    }

    function applyBotResponse(response, options) {
        syncState(response?.state || {});

        const settings = options || {};
        let nextMessages = Array.isArray(response?.messages) ? response.messages.slice() : [];

        if (
            settings.skipLeadingGreeting
            && nextMessages.length
            && normalizeText(nextMessages[0]?.text || '') === normalizeText(INIT_GREETING)
        ) {
            nextMessages = nextMessages.slice(1);
        }

        if (nextMessages.length) {
            nextMessages.forEach(function (message) {
                addMessage(message.role || 'bot', message);
            });
        }

        executeEffects(response?.effects || []);
    }

    function syncState(nextState) {
        state.selectedShipmentId = nextState.selectedShipmentId || null;
        state.pendingAction = nextState.pendingAction || null;

        if (state.selectedShipmentId) {
            writeStorage(STORAGE_KEYS.selectedShipmentId, state.selectedShipmentId);
            highlightShipmentCard(state.selectedShipmentId);
            return;
        }

        removeStorage(STORAGE_KEYS.selectedShipmentId);
        clearShipmentHighlight();
    }

    function executeEffects(effects) {
        for (let index = 0; index < effects.length; index += 1) {
            const effect = effects[index];

            if (!effect || !effect.type) {
                continue;
            }

            if (effect.type === 'focus-shipment') {
                highlightShipmentCard(effect.shipmentId || null);
                if (effect.scroll && effect.shipmentId) {
                    scrollToElement(document.getElementById('portal-shipment-' + effect.shipmentId));
                }
                continue;
            }

            if (effect.type === 'scroll-to') {
                scrollToElement(document.getElementById(effect.targetId || ''));
                continue;
            }

            if (effect.type === 'navigate') {
                window.location.href = effect.url || '/';
                return;
            }

            if (effect.type === 'focus-input') {
                window.setTimeout(function () {
                    inputEl?.focus();
                }, 60);
                continue;
            }

            if (effect.type === 'submit-lookup') {
                submitLookup(effect.query || '');
                return;
            }
        }
    }

    function submitLookup(query) {
        const finalQuery = String(query || '').trim();

        if (!finalQuery || !searchForm || !trackingInput || !documentInput) {
            addBotMessage({
                text: 'No pude preparar la busqueda en esta pagina. Si queres, proba desde el formulario principal del portal.',
            });
            return;
        }

        const normalizedTracking = finalQuery.toUpperCase();
        const normalizedDigits = finalQuery.replace(/\D/g, '');
        const isDocument = /^\d{7,10}$/.test(normalizedDigits);

        trackingInput.value = isDocument ? '' : normalizedTracking;
        documentInput.value = isDocument ? normalizedDigits : '';

        writeStorage(STORAGE_KEYS.open, '1');
        writeStorage(STORAGE_KEYS.restorePending, '1');
        persistThread();

        window.setTimeout(function () {
            searchForm.submit();
        }, 150);
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

    function addBotMessage(payload) {
        addMessage('bot', payload);
    }

    function addUserMessage(text) {
        addMessage('user', { text: text });
    }

    function addMessage(role, payload) {
        const message = {
            role,
            text: payload.text || '',
            html: payload.html || '',
            actions: Array.isArray(payload.actions)
                ? payload.actions.map(function (item) { return { ...item }; })
                : [],
        };

        thread.push(message);
        persistThread();
        renderMessage(message.role, message);
    }

    function renderMessage(role, payload) {
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

                if (item.value != null && item.value !== '') {
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

    function restoreConversationIfNeeded() {
        if (readStorage(STORAGE_KEYS.restorePending) !== '1') {
            removeStorage(STORAGE_KEYS.thread);
            return false;
        }

        removeStorage(STORAGE_KEYS.restorePending);

        const restoredThread = readThread();
        if (!restoredThread.length) {
            return false;
        }

        messagesEl.innerHTML = '';
        thread = restoredThread;
        restoredThread.forEach(function (message) {
            renderMessage(message.role || 'bot', message);
        });

        return true;
    }

    function persistThread() {
        try {
            window.sessionStorage.setItem(STORAGE_KEYS.thread, JSON.stringify(thread));
        } catch (error) {
            // ignore storage errors
        }
    }

    function readThread() {
        try {
            const raw = window.sessionStorage.getItem(STORAGE_KEYS.thread);
            if (!raw) { return []; }

            const parsed = JSON.parse(raw);
            return Array.isArray(parsed)
                ? parsed.filter(function (message) {
                    return message && typeof message === 'object';
                })
                : [];
        } catch (error) {
            return [];
        }
    }

    function highlightShipmentCard(id) {
        const cards = document.querySelectorAll('.portal-card');
        cards.forEach(function (card) {
            card.classList.remove('portal-card--chatbot-focus');
        });

        if (!id) { return; }

        const selectedCard = document.getElementById('portal-shipment-' + id);
        if (selectedCard) {
            selectedCard.classList.add('portal-card--chatbot-focus');
        }
    }

    function clearShipmentHighlight() {
        highlightShipmentCard(null);
    }

    function scrollThreadToBottom() {
        if (!messagesEl) { return; }
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function scrollToElement(element) {
        if (!element) { return; }
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function parseBootstrap(element) {
        if (!element) { return {}; }

        try {
            return JSON.parse(element.textContent || '{}');
        } catch (error) {
            return {};
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

    function removeStorage(key) {
        try {
            window.sessionStorage.removeItem(key);
        } catch (error) {
            // ignore storage errors
        }
    }
})();
