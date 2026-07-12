import assert from "node:assert/strict";
import test from "node:test";
import { searchRAWGGames } from "./fetchRAWG.js";

test("RAWG preserves a successful empty search", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    assert.deepEqual(await searchRAWGGames("no matches"), []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalKey;
  }
});

test("RAWG exposes provider outages instead of returning empty results", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = "test-key";
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(
      searchRAWGGames("provider outage"),
      (error) => error.code === "rawg_http_error" && error.status === 503,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalKey;
  }
});

test("RAWG reports missing configuration distinctly", async () => {
  const originalKey = process.env.RAWG_API_KEY;
  delete process.env.RAWG_API_KEY;
  try {
    await assert.rejects(
      searchRAWGGames("configured query"),
      (error) => error.code === "rawg_not_configured" && !error.retryable,
    );
  } finally {
    if (originalKey !== undefined) process.env.RAWG_API_KEY = originalKey;
  }
});
