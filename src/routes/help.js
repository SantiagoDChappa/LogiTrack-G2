const express = require('express');
const router = express.Router();
const { index, showArticle } = require('../controllers/help');

router.get('/', index);
router.get('/:slug', showArticle);

module.exports = router;
