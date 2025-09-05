# Bot Backend

Backend Express + Prisma untuk Telegram dan WhatsApp.

## Prasyarat
- Node.js ≥18
- PostgreSQL
- Domain dengan HTTPS (untuk webhook Telegram)

## Setup
1. Salin `.env.example` menjadi `.env` dan isi kredensial penting:
   ```env
   DATABASE_URL=postgresql://bw5user:password@localhost:5432/bw5db?schema=public
   TELEGRAM_BOT_TOKEN=123456:ABCDEF
   ADMIN_CHAT_ID=1696238182
   WEBHOOK_SECRET_PATH=secret123
   PUBLIC_URL=https://yourdomain.com
   ```
   Variabel lain seperti `WA_*` dan `SHEET_*` bersifat opsional.
2. Siapkan database PostgreSQL:
   ```bash
   createuser -P bw5user
   createdb -O bw5user bw5db
   ```
3. Inisialisasi schema dan data awal:
   ```bash
   npm install
   npx prisma migrate deploy
   node src/preflight/guard.js      # tambah kolom bila belum ada
   npm run seed                      # isi produk default
   ```
4. Jalankan server:
   ```bash
   npm start
   ```
   Endpoint yang tersedia:
   - `/healthz` → cek DB
   - `/status` → ringkasan produk/akun/order
   - `/stock/options?productId=PROD` → stok durasi per produk
   - `/webhook/telegram/:secret`
   - `/webhook/wa`

   Contoh mengambil stok:
   ```bash
   curl "https://yourdomain.com/stock/options?productId=CHATGPT"
   ```

## Pengujian
Jalankan seluruh tes unit:
```bash
npm test
```

## Integrasi n8n
Backend dapat mengirim setiap event order ke workflow n8n sehingga otomatisasi bisa dilakukan tanpa mengubah kode.

1. Buat workflow di n8n dengan trigger **Webhook**. Catat URL webhook yang dihasilkan, misal `https://n8n.example/webhook/bw5`.
2. Isi variabel `N8N_BASE_URL` pada `.env` dengan URL tersebut dan `N8N_TOKEN` dengan secret internal token.
3. Jalankan ulang server. Setiap event yang tersimpan melalui `addEvent` akan dikirim sebagai JSON ke `N8N_BASE_URL + '/events'` dengan header `X-Internal-Token`.
4. Di n8n, gunakan data JSON tersebut untuk melanjutkan otomatisasi (update spreadsheet, kirim notifikasi, dll).

Contoh payload yang dikirim:
```json
{
  "orderId": 1,
  "kind": "ORDER_CREATED",
  "message": "Order INV-123 created",
  "meta": {},
  "actor": "SYSTEM",
  "source": "system"
}
```

## Telegram Webhook
Pastikan domain sudah HTTPS, kemudian set webhook:
```bash
curl -F "url=https://YOUR_DOMAIN/webhook/telegram/$WEBHOOK_SECRET_PATH" \
  https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
```

## Nginx + SSL
Contoh konfigurasi `/etc/nginx/sites-available/bot.conf`:
```nginx
server {
    server_name yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
Aktifkan dan pasang sertifikat:
```bash
ln -s /etc/nginx/sites-available/bot.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com
```

## PM2
Agar bot berjalan otomatis setelah reboot:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # jalankan perintah yang muncul
```

## Catatan
- Worker hanya berjalan jika tabel `orders` tersedia sehingga log tidak spam saat DB kosong.
- Set `MIGRATE_ON_BOOT=true` bila ingin Prisma migrate otomatis saat start.
