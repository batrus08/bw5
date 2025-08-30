
const crypto = require('crypto');
function assertNonEmpty(name, v){ if(v===undefined||v===null||String(v).trim()===''){ throw new Error(`${name} is required`);} return v; }
const TELEGRAM_BOT_TOKEN = assertNonEmpty('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = assertNonEmpty('ADMIN_CHAT_ID', process.env.ADMIN_CHAT_ID);
const WEBHOOK_SECRET_PATH = assertNonEmpty('WEBHOOK_SECRET_PATH', process.env.WEBHOOK_SECRET_PATH);
const DATABASE_URL = assertNonEmpty('DATABASE_URL', process.env.DATABASE_URL);
const ENCRYPTION_KEY = assertNonEmpty('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY);
const keyBuf = Buffer.from(ENCRYPTION_KEY, 'base64'); if (keyBuf.length !== 32) throw new Error('ENCRYPTION_KEY must be base64 of 32 bytes');

const PUBLIC_URL = process.env.PUBLIC_URL || '';

// WhatsApp Cloud API (optional)
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const WA_API_BASE = process.env.WA_API_BASE || 'https://graph.facebook.com/v20.0';
const WA_APP_SECRET = process.env.WA_APP_SECRET || '';

// Spreadsheet
const SHEET_MODE = process.env.SHEET_MODE || 'csv';
const SHEET_CSV_URL = process.env.SHEET_CSV_URL || '';
const SHEET_SECRET = process.env.SHEET_SECRET || '';
const SHEET_POLL_MS = Number(process.env.SHEET_POLL_MS || 0);

// OTP / Rate limit / Payments
const OTP_TTL_SEC = Number(process.env.OTP_TTL_SEC || 30);
const OTP_MAX_ATTEMPT = Number(process.env.OTP_MAX_ATTEMPT || 1);
const RATE_LIMIT_EVENTS_PER_MIN = Number(process.env.RATE_LIMIT_EVENTS_PER_MIN || 20);
const RATE_LIMIT_WA_PER_MIN = Number(process.env.RATE_LIMIT_WA_PER_MIN || 12);
const RATE_LIMIT_PERSISTENT = (process.env.RATE_LIMIT_PERSISTENT || 'false').toLowerCase() === 'true';

const PAYMENT_QRIS_TEXT = process.env.PAYMENT_QRIS_TEXT || 'Bayar via QRIS statis penjual.';
const PAYMENT_QRIS_IMAGE_URL = process.env.PAYMENT_QRIS_IMAGE_URL || '';
const PAYMENT_QRIS_MEDIA_ID = process.env.PAYMENT_QRIS_MEDIA_ID || '';
const PAYMENT_DEADLINE_MIN = Number(process.env.PAYMENT_DEADLINE_MIN || 30);

// Links
const CGPT_TEAM_URL = process.env.CGPT_TEAM_URL || '';
const CANVA_TEAM_URL = process.env.CANVA_TEAM_URL || '';

module.exports = {
  TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, WEBHOOK_SECRET_PATH, DATABASE_URL, ENCRYPTION_KEY,
  PUBLIC_URL,
  WA_ACCESS_TOKEN, WA_VERIFY_TOKEN, WA_PHONE_NUMBER_ID, WA_API_BASE, WA_APP_SECRET,
  SHEET_MODE, SHEET_CSV_URL, SHEET_SECRET, SHEET_POLL_MS,
  OTP_TTL_SEC, OTP_MAX_ATTEMPT,
  RATE_LIMIT_EVENTS_PER_MIN, RATE_LIMIT_WA_PER_MIN, RATE_LIMIT_PERSISTENT,
  PAYMENT_QRIS_TEXT, PAYMENT_QRIS_IMAGE_URL, PAYMENT_QRIS_MEDIA_ID, PAYMENT_DEADLINE_MIN,
  CGPT_TEAM_URL, CANVA_TEAM_URL,
};
