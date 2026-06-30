const {
    buildSupportHtml,
    createAction,
    createMessage,
} = require('../responseBuilder');

function buildSupportResponse(support) {
    return buildSupportResponseWithShipment(support, null);
}

function buildSupportResponseWithShipment(support, shipment) {
    const text = shipment
        ? 'Si queres revisar ' + shipment.trackingId + ' con una persona, estos son los canales que aparecen en el portal:'
        : 'Si queres hablar con una persona o revisar un caso puntual, estos son los canales que aparecen en el portal:';

    return {
        messages: [
            createMessage({
                text,
                html: buildSupportHtml(support),
                actions: [
                    createAction('Ir a soporte en la pagina', 'go-support'),
                    createAction('Reportar incidencia', 'report-incident-start'),
                    createAction(shipment ? 'Estado actual' : 'Preguntas frecuentes', shipment ? 'show-status' : 'scroll-faq'),
                    createAction('Acceso empresas', 'go-login'),
                ],
            }),
        ],
        effects: [],
    };
}

module.exports = {
    buildSupportResponse: buildSupportResponseWithShipment,
};
