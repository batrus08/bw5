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
   WA_ACCESS_TOKEN=EAA...
   WA_PHONE_NUMBER_ID=123456789
   PAYMENT_QRIS_TEXT=Silakan bayar
   N8N_BASE_URL=https://n8n.example/webhook/bw5
   N8N_TOKEN=supersecret
   SHEET_SYNC_SECRET=sharedsecret
   ```
   Variabel `WA_*` digunakan untuk pengiriman pesan WhatsApp, `SHEET_*` untuk sinkronisasi spreadsheet, sedangkan `N8N_*` adalah token internal untuk bridge n8n.
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
   - `/api/variants-sync`

   Contoh mengambil stok:
   ```bash
   curl "https://yourdomain.com/stock/options?productId=CHATGPT"
   ```

## Pengujian
Jalankan seluruh tes unit:
```bash
npm test
```

## Contoh Alur WhatsApp

Menu awal kini menampilkan tombol "🛡️ Klaim Garansi" bersama menu lain. Untuk memilih durasi produk dan melihat stok real-time gunakan perintah `durasi <kode>` yang akan menampilkan daftar seperti:

```
Durasi 30 hari – Stok: 5
```

Saat pembayaran dikonfirmasi, sistem akan memanggil `reserveAccount()` untuk mengunci stok agar tidak terjadi oversell.

Flow baru:

- WA: pilih produk → pilih durasi (cek stok) → tekan tombol **Beli 1**.
- WA: klaim garansi → setelah admin approve, bot meminta nomor ShopeePay dan menunggu input.
- Admin: pre-approval bisa diaktifkan per sub-produk (contoh `PROD:30`).

### Normalisasi ShopeePay

- Nomor ShopeePay dinormalisasi sebelum disimpan: spasi/dash dihapus, hanya 10–15 digit dan harus diawali `08`.
- Contoh: input `" 08-123 456 789 0 "` → disimpan dan ditampilkan kembali sebagai `081234567890`.
- Jika format salah, bot membalas: `Format ShopeePay tidak valid. Kirim nomor 10–15 digit diawali 08 (contoh 081234567890).`
 - Contoh balasan sukses: `Nomor ShopeePay diterima: 081234567890. Refund diproses maksimal 2×24 jam.`

### Idempotensi Ekstra

- Endpoint pre-approval (`approve`/`reject`) dan klaim (`approve`/`reject`/`ewallet`/`refunded`) aman dari double-tap.
- Jika status sudah final, panggilan ulang mengembalikan `200` dengan `{ idempotent: true }` tanpa efek samping.

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

Event lain yang mungkin diterima:

```json
{ "product_code": "CHATGPT", "status": "OUT_OF_STOCK" }
```

Contoh skema `stockalerts` terbaru:

```prisma
model stockalerts {
  id             String   @id @default(cuid())
  product_code   String
  last_status    String
  last_notified_at DateTime?

  @@unique([product_code])
}
```

## n8n flows

Selain event real-time, backend menyediakan beberapa alur khusus untuk integrasi spreadsheet via n8n:

- `POST /tx-append` akan menambahkan baris baru ke tab **TRANSACTIONS**.
- Pekerja berkala memanggil flow untuk menyinkronkan ringkasan:
  - **AKTIF** → order dengan `expires_at >= now`
  - **BERAKHIR** → order dengan `expires_at < now`

Contoh payload yang dikirim ke `/tx-append`:

```json
{
  "ts": "2024-01-01T00:00:00.000Z",
  "invoice": "INV-123",
  "buyer": "628123456789",
  "code": "PROD30",
  "variant_id": "uuid-v1",
  "order_status": "DELIVERED",
  "fulfilled_at": "2024-01-01T00:00:00.000Z",
  "expires_at": "2024-01-31T00:00:00.000Z",
  "account_id": 1,
  "channel": "WA"
}
```

## Kontrol Kode push

Master varian dapat dipush langsung dari spreadsheet tanpa seed manual.

Endpoint:

- `POST /api/variants-sync` dengan HMAC `x-signature` menggunakan `SHEET_SYNC_SECRET`.

Contoh payload:

```json
{
  "product": "CGPT-SHARE",
  "type": "sharing",
  "duration_days": 30,
  "code": "CGPT-SHARE-30",
  "active": true
}
```

Respons:

```json
{ "ok": true, "variant_id": "uuid" }
```

## Telegram Webhook
Pastikan domain sudah HTTPS, kemudian set webhook:
```bash
curl -F "url=https://YOUR_DOMAIN/webhook/telegram/$WEBHOOK_SECRET_PATH" \
  https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
```

Webhook WhatsApp memerlukan path `/webhook/wa`.

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

## Diagram Alur Pre-Approval

```mermaid
sequenceDiagram
  participant WA as Pembeli WA
  participant API as Backend
  participant ADM as Admin TG

  WA->>API: Order
  API-->>WA: Menunggu approval
  API-->>ADM: Notifikasi pre-approval
  ADM->>API: Approve/Reject
  API-->>WA: Kirim invoice atau penolakan
```
