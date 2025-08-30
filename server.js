
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const health = require('./src/routes/health');
const status = require('./src/routes/status');
const telegramWebhook = require('./src/telegram/webhook');
const waWebhook = require('./src/whatsapp/webhook');
const { startWorkers } = require('./src/services/worker');
const { requestLogger } = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);

// Security & perf
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(requestLogger());

// WA webhook requires raw body preserved
app.use('/webhook/wa', express.json({
  limit: '512kb',
  verify: (req, res, buf) => { req.rawBody = buf; },
  type: ['application/json', 'application/*+json'],
}), waWebhook);

// General JSON
app.use(express.json({ limit: '512kb', strict: true }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Routes
app.use('/healthz', health);
app.use('/status', status);

const tgPath = process.env.WEBHOOK_SECRET_PATH ? `/webhook/telegram/${process.env.WEBHOOK_SECRET_PATH}` : '/webhook/telegram';
app.use(tgPath, telegramWebhook);

app.get('/', (_req, res) => res.json({ ok:true, healthz:'/healthz', status:'/status', telegram_webhook: tgPath, wa_webhook:'/webhook/wa' }));

// JSON error
app.use((err, _req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ ok:false, error:'INVALID_JSON' });
  next(err);
});

// 404
app.use((_req, res) => res.status(404).json({ ok:false, error:'NOT_FOUND' }));

const server = app.listen(PORT, () => {
  console.log(`Node ${process.version} listening on :${PORT}`);
  if (process.env.PUBLIC_URL) console.log(`Public URL: ${process.env.PUBLIC_URL}`);
  console.log(`Telegram webhook mounted at: ${tgPath}`);
  startWorkers();
});

process.on('SIGTERM', () => { console.log('SIGTERM received, closing server...'); server.close(()=>process.exit(0)); });
