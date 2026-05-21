const express = require('express');

const router = express.Router();
const { postMessage } = require('../controllers/chatbot');

router.post('/message', postMessage);

module.exports = router;
