import test from "node:test";
import assert from "node:assert/strict";
import { steamAssetUrl, steamCoverUrl } from "./steamAssets.js";

test("wide wishlist artwork takes precedence over portrait capsules", () => {
  assert.equal(steamCoverUrl({
    asset_url_format: "steam/apps/10/${FILENAME}",
    library_capsule: "portrait/library_capsule.jpg",
    header: "landscape/header.jpg",
  }), "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/landscape/header.jpg");
});

test("real Steam formats preserve the asset path, store CDN base and cache version", () => {
  assert.equal(
    steamAssetUrl(
      { asset_url_format: "steam/apps/951770/${FILENAME}?t=1787230575" },
      "library_600x900.jpg",
    ),
    "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/951770/library_600x900.jpg?t=1787230575",
  );
  assert.equal(
    steamCoverUrl({
      asset_url_format: "steam/apps/3321460/${FILENAME}?t=1788450739",
      library_capsule:
        "85f762166594b84330761c11d3106182634c882c/library_capsule.jpg",
    }),
    "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3321460/85f762166594b84330761c11d3106182634c882c/library_capsule.jpg?t=1788450739",
  );
});

test("asset fallback never accepts an unqualified filename or unsafe URL", () => {
  assert.equal(steamCoverUrl({ library_capsule: "library_600x900.jpg" }), null);
  assert.equal(steamCoverUrl({ library_capsule: "javascript:alert(1)" }), null);
  assert.equal(
    steamCoverUrl({ library_capsule: "https://example.com/cover.jpg" }),
    "https://example.com/cover.jpg",
  );
  assert.equal(
    steamCoverUrl({
      asset_url_format: "steam/apps/10/${FILENAME}",
      header: "header.jpg",
    }),
    "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/10/header.jpg",
  );
});
