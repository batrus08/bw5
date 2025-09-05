const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');
const crypto = require('crypto');

process.env.SHEET_SYNC_SECRET = 'secret';

const eventPath = require.resolve('../src/services/events');
require.cache[eventPath] = { exports:{ addEvent: async ()=>{} } };

const route = require('../src/routes/sheet-sync');

function startApp(){
  const app = express();
  app.use(express.json({ verify:(req,_res,buf)=>{ req.rawBody = buf; } }));
  app.use('/api', route);
  return app;
}

test('sheet-sync invalid payload returns details', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const body = JSON.stringify({});
  const sig = crypto.createHmac('sha256', process.env.SHEET_SYNC_SECRET).update(body).digest('hex');
  const res = await fetch(`http://127.0.0.1:${port}/api/sheet-sync`, { method:'POST', headers:{'Content-Type':'application/json','x-signature':sig}, body });
  assert.strictEqual(res.status,400);
  const data = await res.json();
  assert.strictEqual(data.error,'VALIDATION_ERROR');
  assert.ok(Array.isArray(data.details));
  assert.ok(data.details.find(d=>d.path.join('.')==='code'));
  await new Promise(r=>server.close(r));
});

test('sheet-sync requires natural_key when username empty', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const payload = { code:'C', username:'', password:'p' };
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', process.env.SHEET_SYNC_SECRET).update(body).digest('hex');
  const res = await fetch(`http://127.0.0.1:${port}/api/sheet-sync`, { method:'POST', headers:{'Content-Type':'application/json','x-signature':sig}, body });
  assert.strictEqual(res.status,400);
  const data = await res.json();
  assert.strictEqual(data.error,'VALIDATION_ERROR');
  assert.ok(data.details.find(d=>d.path.join('.')==='natural_key'));
  await new Promise(r=>server.close(r));
});

test('sheet-sync short signature returns 403', async () => {
  const app = startApp();
  const server = app.listen(0); const port = server.address().port;
  const body = JSON.stringify({ code:'C', username:'u', password:'p' });
  const res = await fetch(`http://127.0.0.1:${port}/api/sheet-sync`, {
    method:'POST',
    headers:{'Content-Type':'application/json','x-signature':'deadbeef'},
    body
  });
  assert.strictEqual(res.status,403);
  await new Promise(r=>server.close(r));
});
