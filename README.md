
# Bot Backend — FINAL (Stable for Railway)

- Start aman: **node server.js** (dipaksa Procfile + nixpacks)
- Prisma schema valid (baris per baris)
- Opsional `MIGRATE_ON_BOOT=true` untuk migrate saat boot
- Telegram admin: `/id`, `/start`, `/on`, `/off`, `/sheet_sync`, `/grid`, `/produk`, kartu ✅/❌/Mark/Resend
- WhatsApp: QRIS via **MEDIA_ID** (hemat kredit Railway) + fallback URL/teks

## Jalankan cepat
```bash
npm i
npx prisma db push     # buat schema ke DB
npm run seed           # isi data awal
npm start
```

## Deploy Railway
- Start Command: **node server.js**
- Sekali saat deploy: `npm run deploy:migrate && npm run seed`
- Set webhook Telegram ke: `$PUBLIC_URL/webhook/telegram/$WEBHOOK_SECRET_PATH`

## Deploy Alibaba Cloud ECS
1. Buat instance ECS dengan Node.js 18 atau lebih baru.
2. Buka port yang digunakan aplikasi (default 3000) di security group.
3. Clone repo dan masuk ke direktori proyek.
4. Pasang dependensi dan inisialisasi database:
   ```bash
   npm install
   npx prisma db push
   npm run seed    # opsional
   ```
5. Jalankan server:
   ```bash
   npm start
   ```
6. (Opsional) Gunakan PM2 atau systemd agar proses tetap berjalan.
