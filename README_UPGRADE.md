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

Endpoints:

- `POST /api/sheet1-webhook`
- `POST /api/variants-sync`
- `POST /api/sheet-sync`

Verify signature by recomputing HMAC with the shared secret and comparing with the header.

## UAT Scenarios

| Produk | Mode | Catatan |
|-------|------|---------|
| Netflix | USERPASS | kredensial dikirim langsung setelah pembayaran dikonfirmasi |
| Disney | MANUAL OTP | admin klik "Kirim OTP" lalu memasukkan kode manual di Telegram |
| ChatGPT | TOTP_SINGLE_USE | bot menghasilkan TOTP sekali pakai per order |
| YouTube/M365 | INVITE_EMAIL | admin memasukkan email dan menandai "Sudah Invite" |
| Canva | CANVA_INVITE | worker otomatis mengundang melalui API Canva |

## Run & Test

```bash
npm test
npm start
```
