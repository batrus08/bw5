// src/config/env.js
const assertNonEmpty = (name, v) => {
  if (v === undefined || v === null || String(v).trim() === '') {
    throw new Error(`${name} is required`);
  }
  return v;
};

const TELEGRAM_BOT_TOKEN = assertNonEmpty('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = assertNonEmpty('ADMIN_CHAT_ID', process.env.ADMIN_CHAT_ID);
const WEBHOOK_SECRET_PATH = assertNonEmpty('WEBHOOK_SECRET_PATH', process.env.WEBHOOK_SECRET_PATH);
const DATABASE_URL = assertNonEmpty('DATABASE_URL', process.env.DATABASE_URL);

const ENCRYPTION_KEY = assertNonEmpty('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY);
// validate base64 32 bytes
try {
  const buf = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (buf.length !== 32) throw new Error('invalid length');
} catch (e) {
  throw new Error('ENCRYPTION_KEY must be base64 of 32 bytes');
}

const PUBLIC_URL = process.env.PUBLIC_URL || '';
const WA_APP_SECRET = process.env.WA_APP_SECRET || '';
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const REMINDER_COOLDOWN_MS = Number(process.env.REMINDER_COOLDOWN_MS || 600000);
const TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';
const DATETIME_FORMAT = process.env.DATETIME_FORMAT || 'YYYY-MM-DD HH:mm:ss';

module.exports = {
  TELEGRAM_BOT_TOKEN,
  ADMIN_CHAT_ID,
  WEBHOOK_SECRET_PATH,
  DATABASE_URL,
  ENCRYPTION_KEY,
  PUBLIC_URL,
  WA_APP_SECRET,
  WA_VERIFY_TOKEN,
  JWT_SECRET,
  REMINDER_COOLDOWN_MS,
  TIMEZONE,
  DATETIME_FORMAT,
};
