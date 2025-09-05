
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
        account_group_id: r.account_group_id || null,
        profile_index: r.profile_index ? Number(r.profile_index) : null,
        profile_name: r.profile_name || null,
        username: r.username || null,
        password: r.password || null,
        invite_channel: r.invite_channel || null,
        status: (r.status==='DISABLED'?'DISABLED':(r.status==='RESERVED'?'RESERVED':'AVAILABLE')),
        notes: r.notes || null,
      };
      await prisma.accounts.create({ data });
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
async function appendWarrantyLog(row) {
  await emitToN8N('/warranty-log', row);
}

module.exports = { syncAccountsFromCSV, parseApprovalRequired, appendWarrantyLog };
