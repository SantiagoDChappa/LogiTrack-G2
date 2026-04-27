const { getPersonAutoComplete } = require('../controllers/person');
const express = require('express');
const router = express.Router();

router.get('/', getPersonAutoComplete);

module.exports = router;