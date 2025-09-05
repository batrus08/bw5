
const prisma = require('../db/client');
const { SHEET_MODE, SHEET_CSV_URL, SHEET_SECRET } = require('../config/env');
const { notifyCritical } = require('./telegram');
const { emitToN8N } = require('../utils/n8n');

/**
 * Parse "approval_required" column coming from spreadsheet.
 * Only exact string "On" (case sensitive) should be treated as true.
 * Anything else including empty string, "off", etc results in false.
 * This helper is exported for unit tests.
 * @param {string|undefined|null} v
 * @returns {boolean}
 */
function parseApprovalRequired(v) {
  return v === 'On';
}

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',').map(s=>s.trim());
  return lines.map(line=>{
    const cols = line.split(',').map(s=>s.trim());
    const obj = {};
    header.forEach((h,i)=> obj[h] = cols[i] ?? '');
    return obj;
  });
}

async function syncAccountsFromCSV(){
  if(SHEET_MODE!=='csv' || !SHEET_CSV_URL) return { ok:false, skipped:true, reason:'missing config' };
  try{
    const url = SHEET_SECRET ? `${SHEET_CSV_URL}?secret=${encodeURIComponent(SHEET_SECRET)}` : SHEET_CSV_URL;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = parseCSV(await res.text());
    let upserts = 0;
    for(const r of rows){
      const data = {
        product_code: r.product_code,
        username: r.username,
        password_enc: r.password || '',
        otp_secret_enc: r.otp_secret || null,
        max_uses: Number(r.max_uses||1),
        current_uses: Number(r.current_uses||0),
        status: (r.status==='DISABLED'?'DISABLED':(r.status==='RESERVED'?'RESERVED':'AVAILABLE')),
      };
      await prisma.accounts.upsert({
        where:{ product_code_username: { product_code: data.product_code, username: data.username } },
        update: data,
        create: data
      });
      upserts++;
    }
    await prisma.events.create({ data:{ kind:'SHEET_SYNC_OK', actor:'SYSTEM', source:'sheet', meta:{ upserts } } });
    return { ok:true, upserts };
  }catch(e){
    await prisma.events.create({ data:{ kind:'SHEET_SYNC_FAIL', actor:'SYSTEM', source:'sheet', meta:{ error:e.message } } });
    await notifyCritical(`Sheet sync FAIL: <code>${e.message}</code>`);
    return { ok:false, error:e.message };
  }
}

async function upsertSubproductConfigs(rows = []) {
  let upserts = 0;
  for (const r of rows) {
    const data = {
      product_code: r.product_code,
      sub_code: [r.variant || '', r.duration_days || ''].filter(Boolean).join('-') || 'default',
      approval_required: parseApprovalRequired(r.approval_required),
      approval_notes_default: r.approval_notes_default || null,
    };
    await prisma.subproductconfigs.upsert({
      where: { product_code_sub_code: { product_code: data.product_code, sub_code: data.sub_code } },
      update: data,
      create: data,
    });
    upserts++;
  }
  return upserts;
}

async function appendWarrantyLog(row) {
  await emitToN8N('/warranty-log', row);
}

module.exports = { syncAccountsFromCSV, parseApprovalRequired, upsertSubproductConfigs, appendWarrantyLog };
