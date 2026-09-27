import test from "node:test";
import assert from "node:assert/strict";
import { isSteamHeaderArtwork, resolveGameArtwork } from "./gameArtwork.js";

test("Steam portrait artwork resolves to a landscape header that Cards can recognize", () => {
  const portrait = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/hash/library_capsule.jpg?t=123";
  const artwork = resolveGameArtwork(portrait);

  assert.equal(artwork.cover, "https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg");
  assert.equal(isSteamHeaderArtwork(artwork.cover), true);
  assert.equal(isSteamHeaderArtwork("https://cdn.akamai.steamstatic.com/steam/apps/620/library_capsule.jpg"), false);
  assert.equal(isSteamHeaderArtwork("https://images.example.com/steam/apps/620/header.jpg"), false);
});
