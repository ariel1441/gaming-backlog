import test from "node:test";
import assert from "node:assert/strict";
import { diffWishlistSnapshot } from "./steamWishlistService.js";
import {
  normalizeWishlistEnrichmentPayload,
  normalizeWishlistPayload,
  wishlistEnrichmentRequest,
} from "./steamService.js";

test("normalizes Steam wishlist priority and date semantics", () => {
  assert.deepEqual(
    normalizeWishlistPayload(
      { response: { items: [{ appid: 10, priority: 0, date_added: 1_700_000_000 }] } },
      { response: { count: 1 } },
    ),
    { items: [{ appid: "10", priority: 0, dateAdded: "2023-11-14T22:13:20.000Z" }], emptyIsAmbiguous: false },
  );
});

test("rejects duplicate, malformed, and count-mismatched wishlist snapshots", () => {
  assert.throws(() => normalizeWishlistPayload({ response: { items: [{ appid: 10, priority: 0 }, { appid: 10, priority: 1 }] } }), /duplicate/i);
  assert.throws(() => normalizeWishlistPayload({ response: { items: [{ appid: "bad", priority: 0 }] } }), /malformed/i);
  assert.throws(() => normalizeWishlistPayload({ response: { items: [{ appid: 10, priority: 0, date_added: "bad" }] } }), /date/i);
  assert.throws(() => normalizeWishlistPayload({ response: { items: [{ appid: 10, priority: 0 }] } }, { response: { count: 2 } }), /count/i);
});

test("marks an omitted zero count as ambiguous", () => {
  assert.deepEqual(normalizeWishlistPayload({ response: {} }), { items: [], emptyIsAmbiguous: true });
});

test("builds the paginated Steam enrichment request as one complete service payload", () => {
  const query = wishlistEnrichmentRequest("76561198000000000", 100);
  const input = JSON.parse(query.input_json);
  assert.equal(input.steamid, "76561198000000000");
  assert.equal(input.start_index, 100);
  assert.equal(input.page_size, 100);
  assert.deepEqual(input.filters, {});
  assert.equal(input.data_request.include_assets, true);
  assert.equal(input.data_request.include_basic_info, true);
  assert.equal(input.data_request.include_tag_count, 5);
});

test("normalizes title, artwork, and release date from Steam store_item metadata", () => {
  const metadata = normalizeWishlistEnrichmentPayload({
    response: {
      items: [{
        appid: 10,
        store_item: {
          appid: 10,
          name: "Counter-Strike",
          tagids: [19, 1663],
          assets: { library_capsule: "https://cdn.example/10.jpg" },
          release: { steam_release_date: 1_700_000_000 },
        },
      }],
    },
  });
  assert.deepEqual(metadata.get("10"), {
    name: "Counter-Strike",
    coverUrl: "https://cdn.example/10.jpg",
    releaseDate: "2023-11-14",
    tagIds: ["19", "1663"],
  });
});

test("diff detects added, removed, re-added, and priority changes", () => {
  const result = diffWishlistSnapshot(
    [{ appid: "1", priority: 2 }, { appid: "3", priority: 0 }],
    [{ steam_app_id: "1", priority: 1, is_active: true }, { steam_app_id: "2", priority: 0, is_active: true }, { steam_app_id: "3", priority: 0, is_active: false }],
  );
  assert.deepEqual(result.added.map((item) => item.appid), ["3"]);
  assert.deepEqual(result.removed.map((item) => item.steam_app_id), ["2"]);
  assert.deepEqual(result.priorityChanged, [{ item: { appid: "1", priority: 2 }, previousPriority: 1 }]);
});
