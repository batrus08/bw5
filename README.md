
# Bot Backend — Ultra Edition

**Goal:** stabil, aman, hemat kredit Railway, dan kaya fitur.
- Express + Prisma + Postgres
- Telegram admin: `/start`, `/id`, `/on`, `/off`, `/sheet_sync`, `/grid`, `/produk`, tombol ✅/❌/Mark Invited/Resend
- WhatsApp: menu interaktif (maks 3 tombol), order → kirim **QRIS via media_id** (paling hemat Railway), upload bukti → notif admin
- AES-256-GCM untuk `password_enc`/`otp_secret_enc`
- Rate limit in-memory + opsi **persistent** (DB)
- Worker: expire order, reminder, auto-pause stok, **retry dead letters**
- Health & Status endpoint

## Railway Start Command
Gunakan **Start Command**: `node server.js`  
Jalankan migrasi saat deploy:
```bash
npm run deploy:migrate
npm run seed   # sekali saat awal
```

## Jalankan Lokal
```bash
npm i
npx prisma migrate dev
npm run seed
npm start
```

## Set Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"   -d "url=$PUBLIC_URL/webhook/telegram/$WEBHOOK_SECRET_PATH"
```

## QRIS via media_id
1. Upload `qris.jpg/png` → dapat `id`
2. Set `PAYMENT_QRIS_MEDIA_ID`
3. Bot otomatis kirim gambar QRIS + caption (nominal & deadline)

## Spreadsheet CSV
Kolom: `product_code,username,password,otp_secret,max_uses,current_uses,status`  
Password/OTP akan **dienkripsi** otomatis saat sinkron.

## Perintah Telegram
- `/start` → tes online
- `/id` → cetak chat id (mudah set `ADMIN_CHAT_ID`)
- `/grid` → keypad 1..24
- `/produk` → grid produk aktif

## Catatan
- WA buttons maksimal 3 → sisanya gunakan **List Message** atau instruksi teks.
- Dead letters akan di-retry otomatis (exponential backoff) oleh worker.
