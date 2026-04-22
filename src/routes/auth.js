const express = require('express');
const router = express.Router();
const { getLogin, login, logout } = require('../controllers/auth.js');

router.get('/login', getLogin);
router.post('/login', login);
router.get('/logout', logout);

module.exports = router;