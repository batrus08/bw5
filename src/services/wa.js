const prisma = require('../db/client');
const { WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_API_BASE } = require('../config/env');
const { retry } = require('../utils/retry');
function endpoint(path){ return `${WA_API_BASE}/${WA_PHONE_NUMBER_ID}/${path}`; }

async function waCall(path, body){
  if(!WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) throw new Error('WA credentials missing');
  return retry(async()=>{
    const res = await fetch(endpoint(path), { method:'POST', headers:{ 'Authorization':`Bearer ${WA_ACCESS_TOKEN}`,'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(`WA ${res.status}: ${data.error?.message||'unknown'}`);
    return data;
  }, { attempts:4, baseMs:400, onError: async (e,i)=>{
    if(i===4){ await prisma.deadletters.create({ data:{ channel:'WHATSAPP', endpoint: path, payload: body, error: e.message, retry_count:i } }); await prisma.events.create({ data:{ kind:'DEAD_LETTER_STORED', actor:'SYSTEM', source:'wa', meta:{ path, body, error:e.message } } }); }
  }});
}

function sendText(to, text){ return waCall('messages', { messaging_product:'whatsapp', to, type:'text', text:{ body:text } }); }
function sendInteractiveButtons(to, bodyText, buttons){
  return waCall('messages', { messaging_product:'whatsapp', to, type:'interactive', interactive:{ type:'button', body:{ text: bodyText }, action:{ buttons: buttons.map((t,i)=>({ type:'reply', reply:{ id:`b${i+1}`, title:t } })) } } });
}
function sendListMenu(to, header, bodyText, sections){
  return waCall('messages', { messaging_product:'whatsapp', to, type:'interactive', interactive:{ type:'list', header:{ type:'text', text: header }, body:{ text: bodyText }, action:{ button:'Pilih', sections: sections.map(s=>({ title:s.title, rows: s.rows.map(r=>({ id:r.id, title:r.title, description:r.desc||'' })) })) } } });
}
function sendImageById(to, mediaId, caption){
  return waCall('messages', { messaging_product:'whatsapp', to, type:'image', image:{ id: mediaId, caption } });
}
function sendImageByUrl(to, url, caption){
  return waCall('messages', { messaging_product:'whatsapp', to, type:'image', image:{ link: url, caption } });
}
module.exports = { sendText, sendInteractiveButtons, sendListMenu, sendImageById, sendImageByUrl };
