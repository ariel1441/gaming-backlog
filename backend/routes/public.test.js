import assert from "node:assert/strict";
import test from "node:test";

test("public RAWG hydration bounds work, concurrency, and cache size", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = "test-key";
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    const parsed = new URL(url);
    const isDetail = /\/games\/[^/]+$/.test(parsed.pathname);
    return new Response(
      JSON.stringify(
        isDetail
          ? { name: "Hydrated", slug: "hydrated", genres: [] }
          : { results: [{ id: 1, slug: "hydrated", name: "Hydrated" }] },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const rawgCache = Object.fromEntries(
    Array.from({ length: 1000 }, (_, index) => [`old-${index}`, { name: "old" }]),
  );
  const app = { locals: { rawgCache } };
  const games = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    name: `Game ${index + 1}`,
  }));
  try {
    const { hydrateGamesWithRAWG } = await import("./public.js");
    const hydrated = await hydrateGamesWithRAWG(app, games);
    assert.equal(hydrated.length, 30);
    assert.equal(calls, 48);
    assert.ok(maxActive <= 3);
    assert.ok(Object.keys(app.locals.rawgCache).length <= 1000);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalKey;
  }
});
