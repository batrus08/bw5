# Upgrade Guide

This release introduces product variants, QRIS assets, HMAC-signed sheet webhooks and OTP handling.

## Migration

1. Apply Prisma migration:
   ```bash
   npx prisma migrate deploy
   ```
2. Seed default variants from existing products if upgrading from older versions:
   ```bash
   node src/db/migrate/seed.js
   ```
3. Configure new environment variables in `.env` based on `.env.example`.

## Apps Script HMAC

Both Sheet-1 (input) and Sheet-2 (output) use the header `X-Hub-Signature-256` with value `sha256=<hex>`.

Example:

```
X-Hub-Signature-256: sha256=4bf5122f34ee... (hex digest)
```

To sign:

1. Ambil body JSON mentah sebagai string.
2. Hitung `HMAC_SHA256(body, secret)`.
3. Ubah hasilnya ke heksadesimal.
4. Tambahkan prefix `sha256=` dan kirim sebagai header `X-Hub-Signature-256`.

```javascript
// Apps Script example
function sign(body, secret) {
  const h = Utilities.computeHmacSha256Signature(body, secret);
  return 'sha256=' + h.map(b=>('0'+(b&0xff).toString(16)).slice(-2)).join('');
}
const res = UrlFetchApp.fetch(url, {
  method:'post',
  contentType:'application/json',
  payload: body,
  headers: { 'X-Hub-Signature-256': sign(body, SECRET) }
});
```

Untuk verifikasi di server:

```javascript
import crypto from 'crypto';
function verify(rawBody, header, secret) {
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```

Endpoints:

- `POST /api/sheet1-webhook`
- `POST /api/variants-sync`
- `POST /api/sheet-sync`

Verifikasi berhasil jika hasil perhitungan sama persis dengan nilai di header.

## UAT Scenarios

| Produk | Mode | Alur Ringkas |
|--------|------|--------------|
| Netflix | USERPASS | pilih varian → T&C → QRIS → confirm → kredensial terkirim → Sheet‑2 Orders update |
| Disney | OTP manual | tombol Akses OTP → TG admin input → OTP dikirim user → one‑time |
| ChatGPT | TOTP | Akses OTP → kode dihasilkan 1x → tidak bisa diulang |
| Canva | CANVA_INVITE | minta email → task INVITE_CANVA → notifikasi sukses/gagal |

## Run & Test

```bash
npm test
npm start
```
