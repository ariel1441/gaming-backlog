import test from "node:test";
import assert from "node:assert/strict";
import { sortGames, buildDisplayGames } from "./gameList.js";
import { relativeSavedTime, steamPriceDisplay } from "./steamPrice.js";
import {
  activityLabel,
  activityPriceChange,
  activitySummary,
  groupActivityDigests,
} from "./activityInbox.js";
import {
  clearWishlistCache,
  writeWishlistCache,
  readWishlistCache,
  wishlistCacheKey,
  wishlistCacheGeneration,
  reconcileWishlistConnection,
  EMPTY_WISHLIST,
} from "../services/wishlistCache.js";

const price = {
  currentMinor: 500,
  regularMinor: 1000,
  discountPercent: 50,
  currency: "ILS",
  monitoring: true,
  status: "available",
  observedAt: new Date().toISOString(),
};
test("price sorts visible saved prices while discount requires a fresh verified price", () => {
  const games = [
    { id: 1, name: "Sale", steamPrice: price },
    { id: 2, name: "Unknown", steamPrice: { ...price, currentMinor: null } },
    { id: 3, name: "Stale", steamPrice: { ...price, stale: true } },
    {
      id: 4,
      name: "Free",
      steamPrice: {
        ...price,
        currentMinor: 0,
        regularMinor: 0,
        discountPercent: 0,
        status: "free",
      },
    },
    {
      id: 5,
      name: "Unverified",
      steamPrice: {
        ...price,
        status: "failed",
        errorCode: "steam_price_offer_uncertain",
      },
    },
    {
      id: 6,
      name: "Expired",
      steamPrice: { ...price, observedAt: "2020-01-01" },
    },
  ];
  assert.deepEqual(
    sortGames(games, { sortKey: "price" })
      .slice(0, 2)
      .map((game) => game.id),
    [4, 1],
  );
  assert.deepEqual(
    sortGames(games, { sortKey: "price", isReversed: true })
      .slice(0, 2)
      .map((game) => game.id),
    [1, 3],
  );
  for (const isReversed of [false, true]) {
    assert.deepEqual(
      sortGames(games, { sortKey: "discount", isReversed })
        .slice(0, 2)
        .map((game) => game.id),
      isReversed ? [1, 4] : [4, 1],
    );
  }
  assert.deepEqual(
    buildDisplayGames({ games, onSaleOnly: true }).map((game) => game.id),
    [1],
  );
  assert.deepEqual(
    buildDisplayGames({ games, onSaleOnly: true, searchQuery: "Unknown" }),
    [],
  );
    assert.doesNotMatch(steamPriceDisplay(games[5].steamPrice).label, /Last known/);
});
test("saved cache fences late responses on logout and account replacement", () => {
  clearWishlistCache();
  const key = wishlistCacheKey(1),
    other = wishlistCacheKey(2);
  const generation = wishlistCacheGeneration();
  writeWishlistCache(
    key,
    { saved: true, account: { id: 10 }, items: [{ id: 1 }] },
    generation,
  );
  assert.equal(readWishlistCache(other), EMPTY_WISHLIST);
  reconcileWishlistConnection(1, 11);
  writeWishlistCache(key, { saved: true, items: [{ id: 99 }] }, generation);
  assert.equal(readWishlistCache(key), EMPTY_WISHLIST);
  clearWishlistCache();
});
test("inbox labels observations accurately and combines price transitions into a digest", () => {
  assert.equal(
    activityLabel({ eventType: "wishlist_likely_purchased", nowOwned: false }),
    "Removed from Steam Wishlist",
  );
  assert.equal(
    activityLabel({ eventType: "wishlist_removed", nowOwned: true }),
    "Now owned · removed from Steam Wishlist",
  );
  assert.equal(
    activitySummary([
      { source: "steam_prices", eventType: "steam_price_drop" },
      { source: "steam_prices", eventType: "steam_sale_started" },
    ]),
    "New sale",
  );
  assert.equal(
    activitySummary([
      { eventType: "steam_played", payload: { playtimeMinutes: 95 } },
      { eventType: "steam_achievement_unlocked", payload: { achievementName: "Escape" } },
      { eventType: "steam_first_played", payload: {} },
      { eventType: "steam_added_to_library", payload: {} },
    ]),
    "Played for 1h 35m · Unlocked Escape · First played · Added to Steam library",
  );
  assert.equal(
    activitySummary([
      { eventType: "steam_played", payload: { playtimeMinutes: 30 } },
      { eventType: "steam_played", payload: { playtimeMinutes: 45 } },
    ]),
    "Played for 1h 15m",
  );
  assert.match(
    activityPriceChange({
      source: "steam_prices",
      payload: {
        currency: "ILS",
        previousMinor: 12900,
        currentMinor: 7900,
        discountPercent: 39,
        sale: true,
      },
    }),
    /^39% off · /,
  );
  const event = { source: "steam_prices", syncRunId: 20 };
  assert.equal(
    groupActivityDigests([
      { id: "1", events: [event] },
      { id: "2", events: [event] },
    ]).length,
    1,
  );
  assert.equal(relativeSavedTime(null), "Not checked yet");
});
