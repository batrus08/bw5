# Bot Backend — Advanced

Fitur: Rate limiting per user, Audit Events lengkap + idempotency, Notifikasi kritis Telegram, Integrasi Spreadsheet CSV, Menu WA interaktif (buttons/list), Pengingat deadline & auto-expire, Inline keyboard Telegram, Task Queue dengan SLA, Toggle bot ON/OFF, Auto-pause produk, Retry Queue (WA/TG), Dead Letter events, Observability.

## Run
```bash
npm i
npx prisma migrate dev
npm run seed
npm start
```

## Webhook
- WA: `POST /webhook/wa`
- Telegram: `POST /webhook/telegram/<SECRET>`

## Commands (Telegram)
`/start`, `/on`, `/off`, `/sheet_sync`, `/confirm INV-xxx`, `/reject INV-xxx`

## Spreadsheet
Set `SHEET_MODE=csv` dan `SHEET_CSV_URL` berisi CSV dengan kolom:
`product_code,username,password,otp_secret,max_uses,current_uses,status`

## Notes
- WA menu interaktif membutuhkan kredensial WA Cloud API (`WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`).
- Retry & Dead-letter aktif otomatis bila API gagal berkali-kali.
