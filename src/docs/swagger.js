const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'LogiTrack API',
            version: '1.0.0',
            description: 'API de gestion de envios'
        },
    },
    apis: ['./src/routes/api/*.js'],
};

module.exports = swaggerJsdoc(options);