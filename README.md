// server.js — CommonJS, siap untuk Railway / Node v20.x
const express = require('express');

const health = require('./src/routes/health');
const status = require('./src/routes/status');
const telegramWebhook = require('./src/telegram/webhook');
const waWebhook = require('./src/whatsapp/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway/Proxies
app.set('trust proxy', true);

// ===== WA WEBHOOK (butuh raw body untuk verifikasi HMAC) =====
app.use(
  '/webhook/wa',
  express.json({
    limit: '256kb',
    verify: (req, res, buf) => {
      // simpan buffer mentah untuk perhitungan signature di handler
      req.rawBody = buf;
    },
  }),
  waWebhook
);

// ===== Parser umum untuk route lain (Telegram, REST, dll) =====
app.use(
  express.json({
    limit: '256kb',
    strict: true,
    type: ['application/json', 'application/*+json'],
  })
);

// Minimal CORS (opsional)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ===== Routes aplikasi =====
app.use('/healthz', health);
app.use('/status', status);

// ---- Telegram webhook ----
// Jika WEBHOOK_SECRET_PATH di-set, mount router pada path yang spesifik.
// Kalau tidak, mount ke /webhook/telegram (tanpa secret).
const tgPath = process.env.WEBHOOK_SECRET_PATH
  ? `/webhook/telegram/${process.env.WEBHOOK_SECRET_PATH}`
  : '/webhook/telegram';

app.use(tgPath, telegramWebhook);

// Root info singkat
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    msg: 'Service running',
    healthz: '/healthz',
    status: '/status',
    telegram_webhook: tgPath,
    wa_webhook: '/webhook/wa',
  });
});

// ===== 404 handler (hanya untuk request yang tidak ter-handle) =====
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'NOT_FOUND' });
});

// ===== Error handler global (mis. JSON parse error) =====
app.use((err, req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'INVALID_JSON' });
  }
  console.error('Unhandled error:', err?.message || err);
  res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
});

// ===== Start server =====
const server = app.listen(PORT, () => {
  console.log(`Node ${process.version} listening on :${PORT}`);
  if (process.env.PUBLIC_URL) console.log(`Public URL: ${process.env.PUBLIC_URL}`);
  console.log(`Telegram webhook mounted at: ${tgPath}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => process.exit(0));
});
