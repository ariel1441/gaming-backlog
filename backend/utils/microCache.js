// backend/utils/microCache.js

/**
 * Per-user, in-memory micro cache.
 * - TTL-based expiration
 * - Bounded keys per user (LRU-ish via last-access timestamp)
 * - No external deps
 */
const TTL_MS = Number(process.env.MICROCACHE_TTL_MS || 5 * 60 * 1000);
const MAX_KEYS_PER_USER = Number(process.env.MICROCACHE_MAX_KEYS || 32);

/** @type {Map<string, Map<string, {value:any, exp:number, ts:number}>>} */
const buckets = new Map();

function now() {
  return Date.now();
}

function sweep(userId) {
  const b = buckets.get(userId);
  if (!b) return;

  const t = now();
  // Drop expired
  for (const [k, v] of b) if (t > v.exp) b.delete(k);

  // Enforce bound: evict oldest by last-access time
  if (b.size > MAX_KEYS_PER_USER) {
    const entries = Array.from(b.entries()).sort((a, b2) => a[1].ts - b2[1].ts);
    const toRemove = entries.length - MAX_KEYS_PER_USER;
    for (let i = 0; i < toRemove; i++) b.delete(entries[i][0]);
  }
}

export function cacheGet(userId, key) {
  const b = buckets.get(String(userId));
  if (!b) return null;
  const hit = b.get(key);
  if (!hit) return null;
  if (now() > hit.exp) {
    b.delete(key);
    return null;
  }
  hit.ts = now(); // touch
  return hit.value;
}

export function cacheSet(userId, key, value) {
  const id = String(userId);
  let b = buckets.get(id);
  if (!b) {
    b = new Map();
    buckets.set(id, b);
  }
  b.set(key, { value, exp: now() + TTL_MS, ts: now() });
  sweep(id);
}

export function cacheClear(userId) {
  if (userId == null) return;
  buckets.delete(String(userId));
}

export function cacheClearAll() {
  buckets.clear();
}
