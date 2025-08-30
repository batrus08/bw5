
# Patch notes (bw3 → bw3-fixed)

**Fix**: Telegram router path

- Server mounts router at `/webhook/telegram/<SECRET>`:
  ```js
  const tgPath = process.env.WEBHOOK_SECRET_PATH ? `/webhook/telegram/${process.env.WEBHOOK_SECRET_PATH}` : '/webhook/telegram';
  app.use(tgPath, telegramWebhook);
  ```
- But the router used `router.post('/:secret', ...)`, making the effective path `/webhook/telegram/<SECRET>/:secret` and causing 404/NOT_FOUND.

**Changes made:**
- `src/telegram/webhook.js`: use `router.post('/')` and remove redundant secret check.
- Added basic `router.get('/')` and console logging of incoming update.

Now Telegram can POST to `/webhook/telegram/<SECRET>` and you should see logs like `TG webhook update: {...}`.
