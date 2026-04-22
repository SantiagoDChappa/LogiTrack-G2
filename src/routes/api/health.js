// En src/routes/health.js
  const express = require('express');
  const router = express.Router();
  const sequelize = require('../../database/connection'); 

  router.get('/health', async (req, res) => {
      try {
          await sequelize.authenticate();
          res.json({ status: 'ok' });
      } catch (err) {
          res.status(500).json({ status: 'error' });
      }
  });

  module.exports = router;