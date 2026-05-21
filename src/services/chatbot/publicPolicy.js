const CHATBOT_PUBLIC_POLICY = {
    neverExpose: [
        'document',
        'email',
        'phone',
        'street',
        'number',
        'postalCode',
        'lat',
        'lng',
        'destinationAddress',
        'activeRouteId',
        'hasLiveTracking',
        'recipient',
        'sender',
        'driverName',
        'driverPhone',
        'pod',
        'signature',
        'internalComment',
    ],
    modes: {
        summary: {
            allow: [
                'id',
                'trackingId',
                'status',
                'statusKey',
                'createdAtLabel',
                'expectedDeliveryDateLabel',
                'destination',
            ],
        },
        detail: {
            allow: [
                'id',
                'trackingId',
                'status',
                'statusKey',
                'destination',
                'shipmentType',
                'weightKg',
                'packageQty',
                'createdAtLabel',
                'currentBranchName',
                'expectedDeliveryDateLabel',
                'expectedDeliveryWindow',
                'lastMovementLabel',
                'lastMovementDateLabel',
                'lastComment',
                'history',
            ],
        },
    },
    history: {
        allow: [
            'changedAtLabel',
            'fromStatus',
            'toStatus',
            'branchName',
            'comment',
        ],
    },
    exposureByStatus: {
        entregado: {
            hide: ['expectedDeliveryDateLabel', 'expectedDeliveryWindow'],
        },
        cancelado: {
            hide: ['expectedDeliveryDateLabel', 'expectedDeliveryWindow'],
        },
        cancelada: {
            hide: ['expectedDeliveryDateLabel', 'expectedDeliveryWindow'],
        },
    },
};

const SAFE_HISTORY_COMMENTS = new Set([
    'Tu envio fue registrado en el sistema.',
    'Tu envio fue reprogramado.',
    'El repartidor llego al punto de entrega.',
    'Tu envio fue entregado.',
    'Se registro un intento de entrega.',
    'Tu envio fue registrado en sucursal.',
    'Tu envio sigue en camino.',
]);

function sanitizeChatbotComment(value) {
    const text = String(value || '').trim();
    if (!text) { return null; }
    return SAFE_HISTORY_COMMENTS.has(text) ? text : null;
}

function applyStatusExposurePolicy(shipment) {
    const statusKey = String(shipment?.statusKey || '').trim();
    const hiddenFields = CHATBOT_PUBLIC_POLICY.exposureByStatus[statusKey]?.hide || [];

    if (!hiddenFields.length) {
        return shipment;
    }

    const nextShipment = { ...shipment };
    hiddenFields.forEach((field) => {
        delete nextShipment[field];
    });

    return nextShipment;
}

module.exports = {
    applyStatusExposurePolicy,
    CHATBOT_PUBLIC_POLICY,
    sanitizeChatbotComment,
};
