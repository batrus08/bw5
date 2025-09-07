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
X-Hub-Signature-256: sha256=0329a06b62cd16b33eb6792be8c60b158d89a2ee3a876fce9a881ebb488c0914
```

To sign:

1. Ambil body JSON mentah sebagai string.
2. Hitung `HMAC_SHA256(body, secret)`.
3. Ubah hasilnya ke heksadesimal.
4. Tambahkan prefix `sha256=` dan kirim sebagai header `X-Hub-Signature-256`.

```javascript
// Apps Script example
const payload = JSON.stringify({ hello: 'world' });
const raw = Utilities.computeHmacSha256Signature(payload, SECRET);
const hex = raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
const header = 'sha256=' + hex;

UrlFetchApp.fetch(url, {
  method: 'post',
  contentType: 'application/json',
  payload,
  headers: { 'X-Hub-Signature-256': header },
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

## UAT Checklist

| Produk | Mode | Alur Ringkas |
|--------|------|--------------|
| Netflix | USERPASS | pilih varian → setuju T&C (cek `tnc_ack_at`) → QRIS (gambar) → TG Sudah Bayar → kredensial terkirim → Sheet‑2 Orders update |
| Disney | OTP manual | akses OTP → TG admin input 6 digit → OTP ke user → one‑time |
| ChatGPT | TOTP | akses OTP → kode dihasilkan 1x → second attempt ditolak |
| Canva | INVITE | minta email → task INVITE_CANVA → notifikasi sukses/gagal |
| STK_* | SYNC | sinkron Sheet‑1 → Sheet‑2 Stock update |

## Run & Test

```bash
npm test
npm start
```
