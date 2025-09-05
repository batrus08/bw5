function buildUrl(path){
  const base = process.env.N8N_WEBHOOK_BASE;
  if(!base) return null;
  const trimmed = base.endsWith('/') ? base : base + '/';
  return trimmed + (path || '').replace(/^\//,'');
}

async function sendToN8n(path, payload){
  const url = buildUrl(path);
  if(!url) return;
  try{
    const res = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const text = await res.text();
      console.error('n8n error', res.status, text);
    }
  }catch(e){
    console.error('n8n request failed', e);
  }
}

module.exports = { sendToN8n };
