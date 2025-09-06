# Upgrade Guide

This release introduces product variants, QRIS assets and terms management.

## Migration

1. Apply Prisma migration:
   ```
   npx prisma migrate deploy
   ```
2. Seed default variants from existing products if upgrading from older versions:
   ```
   node src/db/migrate/seed.js
   ```
3. Configure new environment variables in `.env` based on `.env.example`.

## Apps Script

Set up Sheet-1 webhook and Sheet-2 publisher using the new HMAC secrets.

## Run & Test

```
npm test
npm start
```
