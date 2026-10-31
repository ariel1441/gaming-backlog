import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createMicroCache, cacheGet, cacheSet, cacheClear, cacheClearAll } from "./microCache.js";

function fixture(options = {}) {
  let time = 1000;
  const cache = createMicroCache({
    ttlMs: 100, maxKeysPerUser: 3, maxUsers: 3, maxTotalKeys: 6,
    ...options, now: () => time,
  });
  return { cache, advance: (ms) => { time += ms; } };
}

test("an unrelated user's miss reclaims inactive payloads and empty buckets", () => {
  const { cache, advance } = fixture();
  cache.cacheSet("inactive", "all", { private: "payload" });
  cache.cacheSet("inactive", "year", "other payload");
  advance(50);
  cache.cacheSet("active", "all", "fresh");
  advance(51);
  assert.equal(cache.cacheGet("new-user", "missing"), null);
  // Inspect retained counts before accessing the inactive user: a TTL miss alone
  // would not prove the inactive user's payloads were actually reclaimed.
  assert.equal(cache.size, 1);
  assert.equal(cache.userCount, 1);
  assert.equal(cache.cacheGet("active", "all"), "fresh");
});

test("writes reclaim expired users before evicting fresh users at capacity", () => {
  const { cache, advance } = fixture({ maxUsers: 2 });
  cache.cacheSet("expired", "all", "old");
  advance(50);
  cache.cacheSet("fresh", "all", "keep");
  cache.cacheGet("expired", "all"); // Most recently used, but expires first.
  advance(51);
  cache.cacheSet("new", "all", "new");
  assert.equal(cache.size, 2);
  assert.equal(cache.userCount, 2);
  assert.equal(cache.cacheGet("fresh", "all"), "keep");
  assert.equal(cache.cacheGet("expired", "all"), null);
});

test("reads do not extend TTL; exact deadline retains existing boundary semantics", () => {
  const { cache, advance } = fixture();
  cache.cacheSet("owner", "all", "value");
  advance(100);
  assert.equal(cache.cacheGet("owner", "all"), "value");
  advance(1);
  assert.equal(cache.cacheGet("owner", "all"), null);
  assert.equal(cache.size, 0);
  assert.equal(cache.userCount, 0);
});

test("overwrite replaces the payload and starts a new fixed TTL", () => {
  const { cache, advance } = fixture();
  cache.cacheSet("owner", "all", "old");
  advance(50);
  cache.cacheSet("owner", "all", "new");
  advance(51);
  assert.equal(cache.cacheGet("owner", "all"), "new");
  assert.equal(cache.size, 1);
  assert.equal(cache.userCount, 1);
  advance(50);
  assert.equal(cache.cacheGet("owner", "all"), null);
});

test("per-user keys evict least recently used even at the same timestamp", () => {
  const { cache } = fixture({ maxKeysPerUser: 2 });
  cache.cacheSet("owner", "a", "a");
  cache.cacheSet("owner", "b", "b");
  cache.cacheGet("owner", "a");
  cache.cacheSet("owner", "c", "c");
  assert.equal(cache.size, 2);
  assert.equal(cache.cacheGet("owner", "b"), null);
  assert.equal(cache.cacheGet("owner", "a"), "a");
  assert.equal(cache.cacheGet("owner", "c"), "c");
});

test("global user limit evicts the least recently used user's entire bucket", () => {
  const { cache } = fixture({ maxUsers: 2 });
  cache.cacheSet("a", "all", "a");
  cache.cacheSet("b", "all", "b");
  cache.cacheSet("b", "year", "b-year");
  cache.cacheGet("a", "all");
  cache.cacheSet("c", "all", "c");
  assert.equal(cache.userCount, 2);
  assert.equal(cache.size, 2);
  assert.equal(cache.cacheGet("b", "all"), null);
  assert.equal(cache.cacheGet("b", "year"), null);
  assert.equal(cache.cacheGet("a", "all"), "a");
});

test("global entry limit spans users and removes buckets emptied by eviction", () => {
  const { cache } = fixture({ maxTotalKeys: 2 });
  cache.cacheSet("a", "all", "a");
  cache.cacheSet("b", "all", "b");
  cache.cacheGet("a", "all");
  cache.cacheSet("c", "all", "c");
  assert.equal(cache.size, 2);
  assert.equal(cache.userCount, 2);
  assert.equal(cache.cacheGet("b", "all"), null);
  cache.cacheSet("a", "year", "a-year");
  assert.equal(cache.size, 2);
  assert.equal(cache.cacheGet("a", "all"), null);
  assert.equal(cache.cacheGet("c", "all"), "c");
});

test("sustained distinct-user writes and overwrites cannot exceed any limit", () => {
  const { cache } = fixture();
  for (let user = 0; user < 100; user++) {
    for (let key = 0; key < 10; key++) {
      cache.cacheSet(user, key, key);
      cache.cacheSet(user, key, "replacement");
      assert.ok(cache.size <= 6);
      assert.ok(cache.userCount <= 3);
    }
  }
  assert.equal(cache.size, 6);
  assert.equal(cache.userCount, 2);
  assert.equal(cache.cacheGet(99, 6), null);
  assert.equal(cache.cacheGet(99, 9), "replacement");
});

test("identical keys remain isolated and clearing one user removes all its entries", () => {
  const { cache } = fixture();
  cache.cacheSet(7, "all", "owner-private");
  cache.cacheSet(7, "year", "owner-year");
  cache.cacheSet(8, "all", "other-private");
  assert.equal(cache.cacheGet("7", "all"), "owner-private");
  assert.equal(cache.cacheGet(8, "all"), "other-private");
  assert.equal(cache.cacheGet(9, "all"), null);
  cache.cacheClear(null);
  cache.cacheClear(undefined);
  cache.cacheClear("unknown");
  assert.equal(cache.size, 3);
  cache.cacheClear("7");
  cache.cacheClear(7);
  assert.equal(cache.size, 1);
  assert.equal(cache.userCount, 1);
  assert.equal(cache.cacheGet(7, "all"), null);
  assert.equal(cache.cacheGet(7, "year"), null);
  assert.equal(cache.cacheGet(8, "all"), "other-private");
  cache.cacheSet(7, "all", "fresh after invalidation");
  assert.equal(cache.cacheGet(7, "all"), "fresh after invalidation");
});

test("clear all releases indexes and permits reuse across old expiry deadlines", () => {
  const { cache, advance } = fixture();
  cache.cacheSet("a", "all", "old");
  cache.cacheSet("b", "all", "old");
  advance(50);
  cache.cacheClearAll();
  assert.equal(cache.size, 0);
  assert.equal(cache.userCount, 0);
  cache.cacheSet("a", "all", "new");
  advance(51);
  assert.equal(cache.cacheGet("a", "all"), "new");
  assert.equal(cache.cacheGet("b", "all"), null);
  advance(50);
  cache.cacheGet("missing", "all");
  assert.equal(cache.size, 0);
});

test("invalid bound configuration falls back to finite defaults", () => {
  const { cache } = fixture({
    maxUsers: Infinity, maxTotalKeys: NaN, maxKeysPerUser: -1,
  });
  for (let user = 0; user < 300; user++) cache.cacheSet(user, "all", user);
  assert.equal(cache.userCount, 256);
  for (let key = 0; key < 40; key++) cache.cacheSet(299, key, key);
  assert.equal(cache.cacheGet(299, 0), null);
  const { cache: totalCache } = fixture({
    maxUsers: 2000, maxKeysPerUser: 1, maxTotalKeys: "not-a-number",
  });
  for (let user = 0; user < 1100; user++) totalCache.cacheSet(user, "all", user);
  assert.equal(totalCache.size, 1024);
});

test("shared exports retain isolation and invalidation API", () => {
  cacheClearAll();
  try {
    cacheSet(1, "all", "one");
    cacheSet(2, "all", "two");
    cacheClear(1);
    assert.equal(cacheGet(1, "all"), null);
    assert.equal(cacheGet(2, "all"), "two");
    cacheClearAll();
    assert.equal(cacheGet(2, "all"), null);
  } finally {
    cacheClearAll();
  }
});

test("cache usage installs no timers and allows a standalone process to exit", () => {
  const moduleUrl = new URL("./microCache.js", import.meta.url).href;
  execFileSync(process.execPath, ["--input-type=module", "-e", `
    globalThis.setInterval = globalThis.setTimeout = () => { throw Error('unexpected timer'); };
    const { cacheSet, cacheGet } = await import(${JSON.stringify(moduleUrl)});
    cacheSet('owner', 'all', 'value');
    cacheGet('owner', 'all');
  `], { timeout: 5000 });
});
