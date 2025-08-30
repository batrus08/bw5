// src/utils/rateLimit.js — in-memory sliding window
const buckets = new Map(); // key -> array of timestamps (ms)

function allow(key, limitPerMin = 12) {
  const now = Date.now();
  const windowMs = 60_000;
  const arr = buckets.get(key) || [];
  const trimmed = arr.filter(ts => now - ts < windowMs);
  if (trimmed.length >= limitPerMin) {
    buckets.set(key, trimmed);
    return false;
  }
  trimmed.push(now);
  buckets.set(key, trimmed);
  return true;
}

module.exports = { allow };
