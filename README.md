# Bot Backend

Node.js Express backend with Prisma and PostgreSQL for WhatsApp and Telegram bots.

## Environment Variables

| Name | Example | Description |
| ---- | ------- | ----------- |
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Postgres connection string |
| `TELEGRAM_BOT_TOKEN` | `123456:ABCDEF` | Telegram bot token |
| `ADMIN_CHAT_ID` | `-1001234567890` | Telegram admin chat ID |
| `WEBHOOK_SECRET_PATH` | `secret123` | Secret path component for webhooks |
| `PUBLIC_URL` | `https://app.up.railway.app` | Public HTTPS URL |
| `ENCRYPTION_KEY` | `c3Vw...` | 32-byte base64 key for encryption |
| `JWT_SECRET` | `supersecretjwt` | JWT signing secret |
| `WA_APP_SECRET` | `waappsecret` | WhatsApp app secret for HMAC |
| `WA_VERIFY_TOKEN` | `verifytoken` | WhatsApp webhook verification token |
| `REMINDER_COOLDOWN_MS` | `600000` | Cooldown between reminders in ms |
| `TIMEZONE` | `Asia/Jakarta` | Timezone |
| `DATETIME_FORMAT` | `YYYY-MM-DD HH:mm:ss` | Timestamp format |

## Local Setup

```bash
npm i
npx prisma migrate dev
node src/db/migrate/seed.js
npm start
```

## Telegram Webhook

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"   -d "url=$PUBLIC_URL/webhook/telegram/$WEBHOOK_SECRET_PATH"
```

## Health Check

- `GET /healthz`
- `GET /status`

## Notes

- Node 20 has global `fetch`—no need for `node-fetch`.
- If your platform omits devDependencies, Prisma CLI is still available (we keep it in `dependencies`).

## Security

Do not log secrets or credentials. Use environment variables (e.g., Railway Variables).
