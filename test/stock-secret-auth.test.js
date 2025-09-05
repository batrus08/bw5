const assert = require('node:assert');
const { test } = require('node:test');
const express = require('express');

process.env.ADMIN_API_TOKEN = 'token';

const stockRouter = require('../src/routes/stock');

test('secret endpoint requires token', async () => {
  const app = express();
  app.use('/stock', stockRouter);
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/stock/NET-1P1U-30/account/1/secret`);
  assert.strictEqual(res.status,403);
  server.close();
});
