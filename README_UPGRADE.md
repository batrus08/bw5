# Upgrade Guide

This release introduces a new outbound publisher service for pushing stock and order updates to a secondary spreadsheet (Sheet-2).

## Environment

New env var:

```
SHEET2_WEBAPP_URL=<webapp endpoint>
```

Existing optional secrets are re-used:
`SHEET2_HMAC_SECRET` for HMAC signature.

## Migration

No database migration is required for this feature.

## Run & Test

```
npm test
npm run dev
```
