# Bot Backend — Advanced Grid Edition

- Telegram: inline keyboard grid (`/grid`), grid produk (`/produk`), panel admin (✅/❌/Mark Invited/Resend).
- WhatsApp: QRIS via `media_id` (hemat kredit Railway), menu interaktif, upload bukti → notif admin.
- Prisma + Postgres, events audit, worker (expire/reminder/stock-pause), retry & dead-letters.

## Run
```bash
npm i
npx prisma migrate dev
npm run seed
npm start
```

## Webhook
- POST `/webhook/wa`
- POST `/webhook/telegram/<SECRET>`

## Telegram Commands
- `/start`, `/on`, `/off`, `/sheet_sync`
- `/confirm INV-xxx`, `/reject INV-xxx`
- `/grid` → keypad 1..24
- `/produk` → grid produk aktif dari DB

## QRIS via media_id
1. Upload `qris.jpg/png` ke WhatsApp Cloud API → dapat `id`.
2. Set ENV: `PAYMENT_QRIS_MEDIA_ID=<id>`.
3. Saat order dibuat, bot kirim gambar QRIS dengan caption nominal+deadline.

## Spreadsheet CSV (opsional)
`SHEET_CSV_URL` dengan kolom:
`product_code,username,password,otp_secret,max_uses,current_uses,status`
