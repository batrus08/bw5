// server.js — Node 20.x, Express
const express = require('express');
const health = require('./src/routes/health');
const status = require('./src/routes/status');
const telegramWebhook = require('./src/telegram/webhook');
const waWebhook = require('./src/whatsapp/webhook');
const { startWorkers } = require('./src/services/worker');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);

// ===== WhatsApp webhook (needs raw body for HMAC verify) =====
app.use(
  '/webhook/wa',
  express.json({
    limit: '512kb',
    verify: (req, res, buf) => { req.rawBody = buf; },
    type: ['application/json', 'application/*+json'],
  }),
  waWebhook
);

// ===== General JSON parser (Telegram, REST, etc.) =====
app.use(express.json({ limit: '512kb', strict: true }));

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

// ---- Telegram webhook path ----
const tgPath = process.env.WEBHOOK_SECRET_PATH
  ? `/webhook/telegram/${process.env.WEBHOOK_SECRET_PATH}`
  : '/webhook/telegram';

app.use(tgPath, telegramWebhook);

// Root
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

// 404
app.use((_req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));

// Start server
const server = app.listen(PORT, () => {
  console.log(`Node ${process.version} listening on :${PORT}`);
  if (process.env.PUBLIC_URL) console.log(`Public URL: ${process.env.PUBLIC_URL}`);
  console.log(`Telegram webhook mounted at: ${tgPath}`);
  startWorkers(); // start in-process workers
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => process.exit(0));
});
