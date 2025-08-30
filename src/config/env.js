const required = [
  'PORT',
  'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'ADMIN_CHAT_ID',
  'WEBHOOK_SECRET_PATH',
  'WA_APP_SECRET',
  'WA_VERIFY_TOKEN',
  'PUBLIC_URL',
  'ENCRYPTION_KEY',
  'JWT_SECRET'
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error('Missing required env vars: ' + missing.join(', '));
}

const PORT = parseInt(process.env.PORT, 10);
if (Number.isNaN(PORT)) {
  throw new Error('PORT must be a number');
}

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
if (!/^[-]?\d+$/.test(ADMIN_CHAT_ID)) {
  throw new Error('ADMIN_CHAT_ID must be numeric');
}

const REMINDER_COOLDOWN_MS = process.env.REMINDER_COOLDOWN_MS
  ? parseInt(process.env.REMINDER_COOLDOWN_MS, 10)
  : 10 * 60 * 1000;
if (Number.isNaN(REMINDER_COOLDOWN_MS)) {
  throw new Error('REMINDER_COOLDOWN_MS must be a number');
}

const TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';
const DATETIME_FORMAT = process.env.DATETIME_FORMAT || 'YYYY-MM-DD HH:mm:ss';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
let keyBuf;
try {
  keyBuf = Buffer.from(ENCRYPTION_KEY, 'base64');
} catch (e) {
  throw new Error('ENCRYPTION_KEY must be base64');
}
if (keyBuf.length !== 32) {
  throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
}

module.exports = {
  PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_CHAT_ID,
  WEBHOOK_SECRET_PATH: process.env.WEBHOOK_SECRET_PATH,
  WA_APP_SECRET: process.env.WA_APP_SECRET,
  WA_VERIFY_TOKEN: process.env.WA_VERIFY_TOKEN,
  PUBLIC_URL: process.env.PUBLIC_URL,
  ENCRYPTION_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  REMINDER_COOLDOWN_MS,
  TIMEZONE,
  DATETIME_FORMAT,
};
