const { handleChatbotRequest } = require('../services/chatbot/chatbotService');

function postMessage(req, res) {
    try {
        const response = handleChatbotRequest(req.body || {});
        return res.json(response);
    } catch (error) {
        console.error('Chatbot error:', error);
        return res.status(500).json({
            error: 'No pude procesar la consulta del asistente.',
        });
    }
}

module.exports = {
    postMessage,
};
