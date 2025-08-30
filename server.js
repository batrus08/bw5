// server.js — CommonJS, Node 20.x
const express = require('express');
const health = require('./src/routes/health');
const status = require('./src/routes/status');
const telegramWebhook = require('./src/telegram/webhook');
const waWebhook = require('./src/whatsapp/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

// ===== WhatsApp webhook (needs raw body for HMAC verify) =====
app.use(
  '/webhook/wa',
  express.json({
    limit: '512kb',
    verify: (req, res, buf) => {
      // keep raw buffer for signature HMAC in handler
      req.rawBody = buf;
    },
    type: ['application/json', 'application/*+json'],
  }),
  waWebhook
);

// ===== General JSON parser (Telegram, REST, etc.) =====
app.use(
  express.json({
    limit: '512kb',
    strict: true,
    type: ['application/json', 'application/*+json'],
  })
);

// ===== Minimal CORS =====
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ===== App routes =====
app.use('/healthz', health);
app.use('/status', status);

// ---- Telegram webhook ----
// Mount router at path with secret if provided
const tgPath = process.env.WEBHOOK_SECRET_PATH
  ? `/webhook/telegram/${process.env.WEBHOOK_SECRET_PATH}`
  : '/webhook/telegram';

app.use(tgPath, telegramWebhook);

// Root info
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    healthz: '/healthz',
    status: '/status',
    telegram_webhook: tgPath,
    wa_webhook: '/webhook/wa',
  });
});

// JSON syntax error handler
app.use((err, _req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'INVALID_JSON' });
  }
  next(err);
});

// Not found handler
app.use((_req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));

// Start server
const server = app.listen(PORT, () => {
  console.log(`Node ${process.version} listening on :${PORT}`);
  if (process.env.PUBLIC_URL) console.log(`Public URL: ${process.env.PUBLIC_URL}`);
  console.log(`Telegram webhook mounted at: ${tgPath}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => process.exit(0));
});
