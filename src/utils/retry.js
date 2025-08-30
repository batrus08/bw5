function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function retry(fn, { attempts=4, baseMs=300, factor=2, onError }={}){
  let err;
  for(let i=0;i<attempts;i++){
    try{ return await fn(); } catch(e){ err=e; if(onError) onError(e,i+1); if(i<attempts-1) await sleep(baseMs*Math.pow(factor,i)); }
  }
  throw err;
}
module.exports = { retry, sleep };
