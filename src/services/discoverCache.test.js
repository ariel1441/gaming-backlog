import test from "node:test";
import assert from "node:assert/strict";
import {
  DISCOVER_RESPONSE_TTL_MS,
  clearDiscoverResponseCache,
  markDiscoverGameInBacklog,
  readDiscoverResponse,
  replaceDiscoverCachedShelf,
  updateDiscoverCachedGame,
  writeDiscoverResponse,
} from "./discoverCache.js";

test("Discover responses are short-lived and isolated per user", () => {
  clearDiscoverResponseCache();
  const request = {
    scope: "browse",
    params: { sort: "recent", page: 1 },
  };
  writeDiscoverResponse({
    ...request,
    userKey: "7",
    payload: { results: [{ id: 1 }] },
    now: 1_000,
  });

  assert.deepEqual(
    readDiscoverResponse({ ...request, userKey: "7", now: 2_000 }),
    { results: [{ id: 1 }] },
  );
  assert.equal(
    readDiscoverResponse({ ...request, userKey: "8", now: 2_000 }),
    null,
  );
  assert.equal(
    readDiscoverResponse({
      ...request,
      userKey: "7",
      now: 1_000 + DISCOVER_RESPONSE_TTL_MS + 1,
    }),
    null,
  );
});

test("adding a backlog game patches general results and invalidates filtered membership", () => {
  clearDiscoverResponseCache();
  const basePayload = {
    results: [{ id: 1, alreadyInBacklog: false }],
    shelves: [{ key: "trending", results: [{ id: 1 }] }],
    total: 1,
  };
  for (const backlog of ["all", "not_in", "in"]) {
    writeDiscoverResponse({
      userKey: "7",
      scope: "browse",
      params: { backlog },
      payload: basePayload,
      now: 1_000,
    });
  }

  markDiscoverGameInBacklog("7", 1);

  const all = readDiscoverResponse({
    userKey: "7",
    scope: "browse",
    params: { backlog: "all" },
    now: 2_000,
  });
  assert.equal(all.results[0].alreadyInBacklog, true);
  assert.deepEqual(all.shelves, []);

  const notIn = readDiscoverResponse({
    userKey: "7",
    scope: "browse",
    params: { backlog: "not_in" },
    now: 2_000,
  });
  assert.deepEqual(notIn.results, []);
  assert.equal(notIn.total, 0);
  assert.equal(
    readDiscoverResponse({
      userKey: "7",
      scope: "browse",
      params: { backlog: "in" },
      now: 2_000,
    }),
    null,
  );
});

test("metadata refresh and shelf loading update cached Discover payloads", () => {
  clearDiscoverResponseCache();
  writeDiscoverResponse({
    userKey: "7",
    scope: "browse",
    params: { page: 1 },
    payload: {
      results: [{ id: 1, name: "Old" }],
      shelves: [{ key: "trending", results: [{ id: 1, name: "Old" }] }],
    },
    now: 1_000,
  });

  updateDiscoverCachedGame("7", { id: 1, name: "Updated" });
  replaceDiscoverCachedShelf("7", {
    key: "trending",
    results: [{ id: 2, name: "New shelf game" }],
  });

  const cached = readDiscoverResponse({
    userKey: "7",
    scope: "browse",
    params: { page: 1 },
    now: 2_000,
  });
  assert.equal(cached.results[0].name, "Updated");
  assert.deepEqual(cached.shelves[0].results, [
    { id: 2, name: "New shelf game" },
  ]);
});
