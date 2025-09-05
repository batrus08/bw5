require('./src/config/env');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const health = require('./src/routes/health');
const status = require('./src/routes/status');
const stock = require('./src/routes/stock');
const sheetSync = require('./src/routes/sheet-sync');
const variantsSync = require('./src/routes/variants-sync');
const preapprovals = require('./src/routes/preapprovals');
const claims = require('./src/routes/claims');
const telegramWebhook = require('./src/telegram/webhook');
const waWebhook = require('./src/whatsapp/webhook');
const { startWorkers } = require('./src/services/worker');
const { requestLogger } = require('./src/utils/logger');
const { migrateIfEnabled } = require('./src/preflight/migrate');
const { runGuard } = require('./src/preflight/guard');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);

// security & perf
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(requestLogger());

// Parse JSON and keep raw body for HMAC verification on WhatsApp webhook
app.use(express.json({
  limit: '512kb',
  type: ['application/json', 'application/*+json'],
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id,X-Admin-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/healthz', health);
app.use('/status', status);
app.use('/stock', stock);
app.use('/api', sheetSync);
app.use('/api', variantsSync);
app.use('/preapprovals', preapprovals);
app.use('/claims', claims);
app.use('/webhook/wa', waWebhook);

const tgPath = process.env.WEBHOOK_SECRET_PATH ? `/webhook/telegram/${process.env.WEBHOOK_SECRET_PATH}` : '/webhook/telegram';
app.use(tgPath, telegramWebhook);

app.get('/', (_req, res) => res.json({ ok: true, healthz: '/healthz', status: '/status', telegram_webhook: tgPath, wa_webhook: '/webhook/wa' }));

// error handlers
app.use((err, _req, res, next) => { if (err && err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'INVALID_JSON' }); next(err); });
app.use((_req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));

const server = app.listen(PORT, async () => {
  console.log(`Node ${process.version} listening on :${PORT}`);
  if (process.env.PUBLIC_URL) console.log(`Public URL: ${process.env.PUBLIC_URL}`);
  console.log(`Telegram webhook mounted at: ${tgPath}`);
  await migrateIfEnabled();
  await runGuard();
  await startWorkers();
});

process.on('SIGTERM', () => { console.log('SIGTERM received, closing...'); server.close(() => process.exit(0)); });
