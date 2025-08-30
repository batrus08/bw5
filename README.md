
# Bot Backend — Ultra Max

- ✅ Start command aman: `node server.js` (dipaksa oleh **Procfile** + **nixpacks.toml**)
- ✅ Opsional `MIGRATE_ON_BOOT=true` untuk jalankan `prisma migrate deploy` saat boot
- ✅ Telegram admin: `/id`, `/start`, `/on`, `/off`, `/sheet_sync`, `/grid`, `/produk`, serta kartu order (✅/❌/Mark/Resend)
- ✅ WhatsApp: QRIS via `media_id` (paling hemat kredit Railway) + fallback URL/teks, upload bukti → notif admin
- ✅ Worker: expire, reminder, auto-pause stok, retry dead letters
- ✅ Health `/healthz` & `/status`

## Deploy
```bash
npm i
npm run deploy:migrate
npm run seed    # sekali saat awal
npm start
```
Set webhook Telegram:
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"   -d "url=$PUBLIC_URL/webhook/telegram/$WEBHOOK_SECRET_PATH"
```
