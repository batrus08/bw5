const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { WA_APP_SECRET, WA_VERIFY_TOKEN } = require('../config/env');
const { addEvent } = require('../services/events');
const { formatTs } = require('../utils/time');

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
    return res.send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/', async (req, res) => {
  const sig = req.headers['x-hub-signature-256'];
  if (!sig || !req.rawBody) return res.sendStatus(403);
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', WA_APP_SECRET).update(req.rawBody).digest('hex');
  const valid =
    typeof sig === 'string' &&
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid) {
    console.error('WA webhook signature mismatch');
    await addEvent(
      null,
      'WA_INVALID_SIGNATURE',
      `Signature mismatch at ${formatTs()}`
    );
    return res.sendStatus(403);
  }

  const field = req.body?.entry?.[0]?.changes?.[0]?.field;
  console.log('WA webhook', field);
  res.sendStatus(200);
});

module.exports = router;
