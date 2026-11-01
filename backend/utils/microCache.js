// Per-user cache with fixed TTLs and bounded, access-driven reclamation.
function boundedOption(value, fallback, minimum = 1) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : fallback;
}

// A factory keeps clock/configuration tests independent of the shared API cache.
export function createMicroCache({
  ttlMs = process.env.MICROCACHE_TTL_MS,
  maxKeysPerUser = process.env.MICROCACHE_MAX_KEYS,
  maxUsers = process.env.MICROCACHE_MAX_USERS,
  maxTotalKeys = process.env.MICROCACHE_MAX_TOTAL_KEYS,
  now = Date.now,
} = {}) {
  const ttl = boundedOption(ttlMs, 5 * 60 * 1000, 0);
  const perUserLimit = boundedOption(maxKeysPerUser, 32);
  const userLimit = boundedOption(maxUsers, 256);
  const totalLimit = boundedOption(maxTotalKeys, 1024);
  // Map insertion order provides LRU ordering even for same-millisecond accesses.
  const buckets = new Map();
  const entries = new Map();
  let nextExpiry = Infinity;

  function remove(entry) {
    entries.delete(entry);
    entry.bucket.delete(entry.key);
    if (!entry.bucket.size) buckets.delete(entry.id);
  }

  function reclaimExpired(time) {
    if (time <= nextExpiry) return;
    nextExpiry = Infinity;
    for (const entry of entries.keys()) {
      if (time > entry.exp) remove(entry);
      else nextExpiry = Math.min(nextExpiry, entry.exp);
    }
  }

  function touch(entry) {
    entries.delete(entry);
    entries.set(entry, true);
    entry.bucket.delete(entry.key);
    entry.bucket.set(entry.key, entry);
    buckets.delete(entry.id);
    buckets.set(entry.id, entry.bucket);
  }

  function cacheGet(userId, key) {
    reclaimExpired(now()); // Includes inactive users, even on a cache miss.
    const entry = buckets.get(String(userId))?.get(key);
    if (!entry) return null;
    touch(entry); // Reads affect eviction order, never the freshness deadline.
    return entry.value;
  }

  function cacheSet(userId, key, value) {
    const time = now();
    reclaimExpired(time);
    const id = String(userId);
    const bucket = buckets.get(id) || new Map();
    const previous = bucket.get(key);
    if (previous) remove(previous);
    const entry = { id, bucket, key, value, exp: time + ttl };
    touch(entry);
    nextExpiry = Math.min(nextExpiry, entry.exp);

    while (bucket.size > perUserLimit) remove(bucket.values().next().value);
    while (buckets.size > userLimit) {
      for (const oldest of buckets.values().next().value.values()) remove(oldest);
    }
    while (entries.size > totalLimit) remove(entries.keys().next().value);
  }

  function cacheClear(userId) {
    if (userId == null) return;
    const bucket = buckets.get(String(userId));
    if (bucket) for (const entry of bucket.values()) remove(entry);
  }

  function cacheClearAll() {
    buckets.clear();
    entries.clear();
    nextExpiry = Infinity;
  }

  return {
    cacheGet, cacheSet, cacheClear, cacheClearAll,
    // Counts expose retention without exposing user IDs or cached payloads.
    get size() { return entries.size; },
    get userCount() { return buckets.size; },
  };
}

export const { cacheGet, cacheSet, cacheClear, cacheClearAll } = createMicroCache();
