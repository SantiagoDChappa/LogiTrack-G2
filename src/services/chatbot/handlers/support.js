const {
    buildSupportHtml,
    createAction,
    createMessage,
} = require('../responseBuilder');

function buildSupportResponse(support) {
    return {
        messages: [
            createMessage({
                text: 'Si queres ayuda humana o revisar un caso puntual, estos son los canales visibles en el portal:',
                html: buildSupportHtml(support),
                actions: [
                    createAction('Ir a soporte en la pagina', 'go-support'),
                    createAction('Preguntas frecuentes', 'scroll-faq'),
                    createAction('Acceso empresas', 'go-login'),
                ],
            }),
        ],
        effects: [],
    };
}

module.exports = {
    buildSupportResponse,
};
