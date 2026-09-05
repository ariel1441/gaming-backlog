import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchSteamWishlist,
  mergeWishlistMetadata,
  normalizeWishlistPayload,
  fetchOwnedSteamGames,
} from "./steamService.js";

const membership = Array.from({ length: 436 }, (_, index) => ({
  appid: 100000 + index,
  priority: 0,
  date_added: 1700000000 + index,
}));
const ordered = [...membership].reverse();

test("real-shaped repeated full lists enrich 436 items and preserve exact Steam sequence", async (t) => {
  const original = globalThis.fetch;
  const previousKey = process.env.STEAM_WEB_API_KEY;
  process.env.STEAM_WEB_API_KEY = "fixture-key";
  const pages = [];
  let mode = "complete";
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    let response;
    if (url.pathname.includes("GetWishlistSortedFiltered")) {
      const request = JSON.parse(url.searchParams.get("input_json"));
      pages.push(request.start_index);
      response = {
        items: ordered.map((item, index) => ({
          ...item,
          ...(index >= request.start_index &&
          index < request.start_index + request.page_size
            ? {
                store_item: {
                  appid: item.appid,
                  name: `Game ${item.appid}`,
                  tagids: [19],
                  assets:
                    mode === "missing"
                      ? {}
                      : {
                          asset_url_format: `steam/apps/${item.appid}/\u0024{FILENAME}?t=1`,
                          library_capsule: "hash/library_capsule.jpg",
                        },
                },
              }
            : {}),
        })),
      };
      if (mode === "changed" && request.start_index === 100)
        response.items.reverse();
    } else if (url.pathname.includes("GetWishlistItemCount"))
      response = { count: membership.length };
    else if (url.pathname.includes("GetMostPopularTags"))
      response = { tags: [{ tagid: 19, name: "Action" }] };
    else response = { items: membership };
    return new Response(JSON.stringify({ response }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await fetchSteamWishlist("76561190000000000");
    assert.deepEqual(pages, [0, 100, 200, 300, 400]);
    assert.equal(result.metadata.complete, true);
    assert.equal(result.metadata.covered, 436);
    const byOrder = [...result.items].sort(
      (a, b) => a.providerOrder - b.providerOrder,
    );
    assert.deepEqual(
      byOrder.map((item) => item.appid),
      ordered.map((item) => String(item.appid)),
    );
    assert.equal(byOrder[0].appid, "100435");
    assert.equal(byOrder.at(-1).appid, "100000");
    assert.equal(
      byOrder[0].coverUrl,
      "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/100435/hash/library_capsule.jpg?t=1",
    );
    await t.test(
      "missing artwork is partial even when every name exists",
      async () => {
        mode = "missing";
        assert.equal(
          (await fetchSteamWishlist("76561190000000000")).metadata.complete,
          false,
        );
      },
    );
    await t.test("membership/order drift rejects the snapshot", async () => {
      mode = "changed";
      await assert.rejects(fetchSteamWishlist("76561190000000000"), {
        code: "steam_wishlist_snapshot_changed",
      });
    });
  } finally {
    globalThis.fetch = original;
    if (previousKey == null) delete process.env.STEAM_WEB_API_KEY;
    else process.env.STEAM_WEB_API_KEY = previousKey;
  }
});

test("sparse enrichment preserves richer prior data without inventing empty success", () => {
  const rich = {
    name: "Game",
    coverUrl: "https://example.com/image.jpg",
    genres: ["Action"],
    releaseDate: "2026-01-01",
  };
  assert.deepEqual(
    mergeWishlistMetadata(rich, { name: "Game", coverUrl: null, genres: [] }),
    rich,
  );
  assert.equal(
    normalizeWishlistPayload({ response: {} }, { response: {} })
      .emptyIsAmbiguous,
    true,
  );
  assert.equal(
    normalizeWishlistPayload(
      { response: { items: [] } },
      { response: { count: 0 } },
    ).emptyIsAmbiguous,
    false,
  );
});

test("owned snapshot rejects duplicates/count mismatch and preserves null playtime", async () => {
  const saved = process.env.STEAM_MOCK_OWNED_GAMES_JSON;
  try {
    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({
      response: { game_count: 2, games: [{ appid: 10, playtime_forever: 2 }] },
    });
    await assert.rejects(fetchOwnedSteamGames("test"), {
      code: "steam_invalid_response",
    });
    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({
      response: { games: [{ appid: 10 }, { appid: 10 }] },
    });
    await assert.rejects(fetchOwnedSteamGames("test"), {
      code: "steam_invalid_response",
    });
    process.env.STEAM_MOCK_OWNED_GAMES_JSON = JSON.stringify({
      response: { games: [{ appid: 10, playtime_forever: null }] },
    });
    assert.equal((await fetchOwnedSteamGames("test"))[0].playtimeMinutes, null);
  } finally {
    if (saved == null) delete process.env.STEAM_MOCK_OWNED_GAMES_JSON;
    else process.env.STEAM_MOCK_OWNED_GAMES_JSON = saved;
  }
});


test("Steam transport failures and omitted protobuf zero fields stay distinct", async () => {
  const original = globalThis.fetch;
  try {
    for (const [header, expected] of [[null, true], ["1", false]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ response: {} }), { headers: header ? { "x-eresult": header } : {} });
      assert.equal((await fetchSteamWishlist("76561190000000000")).emptyIsAmbiguous, expected);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ response: { items: [] } }), { headers: { "x-eresult": "15" } });
    await assert.rejects(fetchSteamWishlist("76561190000000000"), { code: "steam_invalid_response" });
    globalThis.fetch = async () => new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
    await assert.rejects(fetchSteamWishlist("76561190000000000"), { code: "steam_rate_limited" });
  } finally { globalThis.fetch = original; }
});
