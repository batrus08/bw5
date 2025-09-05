const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

// set env before requiring router
process.env.WA_APP_SECRET = 'testsecret';
const waWebhook = require('../src/whatsapp/webhook');

function startApp() {
  const app = express();
  app.use(express.json({ verify: (req,_res,buf)=>{ req.rawBody = buf; } }));
  app.use('/', waWebhook);
  return app;
}

test('WA webhook rejects invalid HMAC signature', async () => {
  const app = startApp();
  const server = app.listen(0);
  const port = server.address().port;
  const body = JSON.stringify({ foo: 'bar' });
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=deadbeef' },
    body,
  });
  assert.strictEqual(res.status, 403);
  await new Promise((resolve) => server.close(resolve));
});
