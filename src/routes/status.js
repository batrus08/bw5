// src/routes/status.js
const express = require('express');
const router = express.Router();
const { PUBLIC_URL, TIMEZONE } = require('../config/env');

router.get('/', (req, res) => {
  res.json({
    ok: true,
    now_iso: new Date().toISOString(),
    public_url: PUBLIC_URL || null,
    timezone: TIMEZONE,
  });
});

module.exports = router;
