// Wizard inline de reporte de incidencia desde el chatbot del portal.
// Cada handler avanza state.incidentDraft.step y devuelve una respuesta
// (messages + effects). El servicio de chat es responsable de capturar
// texto libre y enrutarlo al handler del step activo.

const { createAction, createEffect, createMessage } = require('../responseBuilder');
const { getSelectedShipment } = require('../runtime');

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRACKING_RX = /^[A-Z0-9-]{3,40}$/i;

function emptyDraft() {
    return {
        step:               null,
        trackingId:         null,
        incidentTypeId:     null,
        incidentTypeLabel:  null,
        description:        null,
        reporterName:       null,
        reporterEmail:      null,
    };
}

function clearDraft(runtime) {
    runtime.state.incidentDraft = null;
}

function setDraft(runtime, partial) {
    const current = runtime.state.incidentDraft || emptyDraft();
    runtime.state.incidentDraft = { ...current, ...partial };
}

function cancelActions() {
    return [createAction('Cancelar reporte', 'report-incident-cancel')];
}

function buildTypeButtons(types) {
    return types.map(t => createAction(t.description, 'report-incident-type', String(t.id)));
}

function buildStart(runtime, types) {
    const shipment = getSelectedShipment(runtime);
    if (shipment) {
        setDraft(runtime, { step: 'type', trackingId: shipment.trackingId });
        return {
            messages: [
                createMessage({
                    text: 'Vamos a abrir una incidencia sobre ' + shipment.trackingId + '. ¿De qué tipo es?',
                    actions: [
                        ...buildTypeButtons(types),
                        ...cancelActions(),
                    ],
                }),
            ],
            effects: [],
        };
    }

    setDraft(runtime, { step: 'tracking' });
    return {
        messages: [
            createMessage({
                text: 'Para abrir una incidencia, pasame el código de seguimiento (tracking) del envío.',
                actions: cancelActions(),
            }),
        ],
        effects: [],
    };
}

function handleTrackingInput(runtime, text, types) {
    const tracking = String(text || '').trim().toUpperCase();
    if (!TRACKING_RX.test(tracking)) {
        return {
            messages: [
                createMessage({
                    text: 'Ese tracking no parece válido. Pasame un código tipo ENV-001 o el número que ves en el portal.',
                    actions: cancelActions(),
                }),
            ],
            effects: [],
        };
    }
    setDraft(runtime, { step: 'type', trackingId: tracking });
    return {
        messages: [
            createMessage({
                text: 'Listo, tomo ' + tracking + '. ¿De qué tipo es la incidencia?',
                actions: [
                    ...buildTypeButtons(types),
                    ...cancelActions(),
                ],
            }),
        ],
        effects: [],
    };
}

function handleTypeSelect(runtime, typeId, typesById) {
    const id = Number(typeId);
    const type = typesById.get(id);
    if (!type) {
        return {
            messages: [
                createMessage({
                    text: 'No reconozco ese tipo de incidencia. Elegí uno de los botones.',
                    actions: cancelActions(),
                }),
            ],
            effects: [],
        };
    }
    setDraft(runtime, { step: 'description', incidentTypeId: id, incidentTypeLabel: type.description });
    return {
        messages: [
            createMessage({
                text: 'Bien, ' + type.description + '. Contame qué pasó (al menos 10 caracteres).',
                actions: cancelActions(),
            }),
        ],
        effects: [],
    };
}

function handleDescriptionInput(runtime, text) {
    const desc = String(text || '').trim();
    if (desc.length < 10) {
        return {
            messages: [
                createMessage({
                    text: 'La descripción es muy corta. Detallá un poco más (mínimo 10 caracteres).',
                    actions: cancelActions(),
                }),
            ],
            effects: [],
        };
    }
    setDraft(runtime, { step: 'name', description: desc.slice(0, 2000) });
    return {
        messages: [
            createMessage({
                text: 'Gracias. ¿Cuál es tu nombre y apellido?',
                actions: cancelActions(),
            }),
        ],
        effects: [],
    };
}

function handleNameInput(runtime, text) {
    const name = String(text || '').trim();
    if (name.length < 2) {
        return {
            messages: [
                createMessage({
                    text: 'Necesito tu nombre para registrar el reporte.',
                    actions: cancelActions(),
                }),
            ],
            effects: [],
        };
    }
    setDraft(runtime, { step: 'email', reporterName: name.slice(0, 120) });
    return {
        messages: [
            createMessage({
                text: 'Si querés que te contactemos por mail, escribilo. Si no, tocá Omitir.',
                actions: [
                    createAction('Omitir email', 'report-incident-skip-email'),
                    ...cancelActions(),
                ],
            }),
        ],
        effects: [],
    };
}

function buildConfirmMessage(draft) {
    const emailLine = draft.reporterEmail ? draft.reporterEmail : '(sin email)';
    const html =
        '<div class="portal-chatbot-summary">'
        + '<strong>Resumen del reporte</strong><br>'
        + 'Envío: <strong>' + (draft.trackingId || '-') + '</strong><br>'
        + 'Tipo: <strong>' + (draft.incidentTypeLabel || '-') + '</strong><br>'
        + 'Reportante: ' + (draft.reporterName || '-') + ' · ' + emailLine + '<br>'
        + 'Descripción: ' + (draft.description || '-')
        + '</div>';
    return createMessage({
        text: 'Antes de enviar, revisá los datos:',
        html,
        actions: [
            createAction('Confirmar y enviar', 'report-incident-confirm'),
            createAction('Cancelar reporte', 'report-incident-cancel'),
        ],
    });
}

function handleEmailInput(runtime, text) {
    const raw = String(text || '').trim();
    if (raw && raw.toLowerCase() !== 'omitir' && !EMAIL_RX.test(raw)) {
        return {
            messages: [
                createMessage({
                    text: 'Ese email no se ve válido. Escribilo bien o tocá Omitir.',
                    actions: [
                        createAction('Omitir email', 'report-incident-skip-email'),
                        ...cancelActions(),
                    ],
                }),
            ],
            effects: [],
        };
    }
    const email = (!raw || raw.toLowerCase() === 'omitir') ? null : raw.slice(0, 160);
    setDraft(runtime, { step: 'confirm', reporterEmail: email });
    return {
        messages: [buildConfirmMessage(runtime.state.incidentDraft)],
        effects: [],
    };
}

function handleSkipEmail(runtime) {
    setDraft(runtime, { step: 'confirm', reporterEmail: null });
    return {
        messages: [buildConfirmMessage(runtime.state.incidentDraft)],
        effects: [],
    };
}

async function handleConfirm(runtime, createIncidentFromPortal) {
    const draft = runtime.state.incidentDraft;
    if (!draft || draft.step !== 'confirm') {
        return {
            messages: [createMessage({ text: 'No hay un reporte en curso para confirmar.' })],
            effects: [],
        };
    }

    const result = await createIncidentFromPortal({
        trackingId:     draft.trackingId,
        incidentTypeId: draft.incidentTypeId,
        description:    draft.description,
        reporterName:   draft.reporterName,
        reporterEmail:  draft.reporterEmail,
    });

    if (!result.ok) {
        return {
            messages: [
                createMessage({
                    text: 'No pude crear el reporte: ' + result.message,
                    actions: [
                        createAction('Reintentar', 'report-incident-confirm'),
                        createAction('Cancelar', 'report-incident-cancel'),
                    ],
                }),
            ],
            effects: [],
        };
    }

    clearDraft(runtime);
    const successText = 'Listo. Tu incidencia fue registrada con el número #' + result.incident.id
        + '. Te vamos a contactar' + (draft.reporterEmail ? ' a ' + draft.reporterEmail : '') + '.';
    return {
        messages: [
            createMessage({
                text: successText,
                actions: [
                    createAction('Volver al menú', 'show-main-menu'),
                ],
            }),
        ],
        effects: [],
    };
}

function handleCancel(runtime) {
    clearDraft(runtime);
    return {
        messages: [
            createMessage({
                text: 'Cancelé el reporte. Si querés, podés intentarlo de nuevo más tarde.',
                actions: [createAction('Volver al menú', 'show-main-menu')],
            }),
        ],
        effects: [],
    };
}

function isActive(runtime) {
    return Boolean(runtime?.state?.incidentDraft?.step);
}

function handleStepInput(runtime, text) {
    // Cancelaciones rápidas por texto.
    const t = String(text || '').trim().toLowerCase();
    if (['cancelar', 'salir', 'cancel', 'stop'].includes(t)) {
        return handleCancel(runtime);
    }
    const step = runtime.state.incidentDraft.step;
    if (step === 'tracking')    { return { needsTypes: true, kind: 'tracking', text }; }
    if (step === 'description') { return handleDescriptionInput(runtime, text); }
    if (step === 'name')        { return handleNameInput(runtime, text); }
    if (step === 'email')       { return handleEmailInput(runtime, text); }
    // En 'type' o 'confirm' esperamos botones, no texto libre.
    return {
        messages: [
            createMessage({
                text: step === 'type'
                    ? 'Elegí un tipo de incidencia tocando uno de los botones.'
                    : 'Tocá Confirmar y enviar para terminar, o Cancelar.',
                actions: cancelActions(),
            }),
        ],
        effects: [],
    };
}

module.exports = {
    isActive,
    buildStart,
    handleTrackingInput,
    handleTypeSelect,
    handleDescriptionInput,
    handleNameInput,
    handleEmailInput,
    handleSkipEmail,
    handleConfirm,
    handleCancel,
    handleStepInput,
};
