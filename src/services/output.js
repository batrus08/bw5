const crypto = require('crypto');
const { SHEET2_WEBAPP_URL, SHEET2_HMAC_SECRET } = require('../config/env');

function signBody(body){
  return 'sha256=' + crypto.createHmac('sha256', SHEET2_HMAC_SECRET).update(body).digest('hex');
}

async function post(topic, payload){
  if(!SHEET2_WEBAPP_URL){
    return { ok:false, skipped:true, reason:'missing SHEET2_WEBAPP_URL' };
  }
  const body = JSON.stringify(Object.assign({ topic }, payload));
  const headers = {
    'Content-Type': 'application/json',
    'X-Hub-Signature-256': signBody(body),
    'X-Idempotency-Key': crypto.randomUUID(),
  };
  const res = await fetch(SHEET2_WEBAPP_URL, { method:'POST', headers, body });
  return { ok: res.ok, status: res.status };
}

async function publishStock(rows){
  return post('STOCK', { rows });
}
async function publishOrders(rows){
  return post('ORDERS', { rows });
}
async function publishKpi(rows){
  return post('KPI', { rows });
}
async function publishSnapshot(snapshot){
  return post('FULL_SNAPSHOT', { snapshot });
}

module.exports = { publishStock, publishOrders, publishKpi, publishSnapshot };
