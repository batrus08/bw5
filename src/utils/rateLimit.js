const buckets = new Map();
function allow(key, limit=12){
  const now = Date.now(), windowMs=60_000;
  const arr = (buckets.get(key)||[]).filter(ts => now-ts<windowMs);
  if(arr.length>=limit){ buckets.set(key,arr); return false; }
  arr.push(now); buckets.set(key,arr); return true;
}
module.exports = { allow };
