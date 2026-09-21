import test from "node:test";
import assert from "node:assert/strict";
import {
  wishlistItemToGame,
  composeBacklogWishlist,
  isWishlistRawgMatchUnavailable,
  summarizeWishlistMetadataResults,
  wishlistArtwork,
  wishlistMetadataBatchMessage,
  wishlistApiSort,
} from "./wishlistPresentation.js";

test("wishlist UI sorts map to stable API keys", () => {
  assert.equal(wishlistApiSort("providerOrder"), "provider_order");
  assert.equal(wishlistApiSort("estimatedHours"), "estimated_hours");
  assert.equal(wishlistApiSort("releaseDate"), "release_date");
  assert.equal(wishlistApiSort("unknown"), "provider_order");
});

test("saved Steam portraits use landscape art with an original-image fallback", () => {
  const cover = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3321460/hash/library_capsule.jpg?t=123";
  const game = wishlistItemToGame({ id: 1, cover });
  assert.equal(game.cover, "https://cdn.akamai.steamstatic.com/steam/apps/3321460/header.jpg");
  assert.equal(game.posterCover, cover);
  assert.deepEqual(game.coverFallbacks, ["https://cdn.akamai.steamstatic.com/steam/apps/3321460/library_hero.jpg", cover]);
  assert.deepEqual(wishlistArtwork("https://example.com/steam/apps/10/library_capsule.jpg"), {});
  assert.deepEqual(wishlistArtwork("https://shared.fastly.steamstatic.com/steam/apps/10/header.jpg"), {});
  assert.equal(composeBacklogWishlist([{ id: 2, cover: "manual.jpg" }], [{ id: 1, gameId: 2, active: true, cover }])[0].cover, "manual.jpg");
});

test("metadata refresh feedback keeps review, incomplete and failed outcomes distinct", () => {
  const results = [
    { status: "completed" },
    { status: "review" },
    { status: "unmatched", issue: "rawg_metadata_incomplete" },
    { status: "failed" },
  ];

  assert.deepEqual(summarizeWishlistMetadataResults(results), {
    completed: 1,
    review: 1,
    unmatched: 1,
    failed: 1,
  });
  assert.equal(
    wishlistMetadataBatchMessage({ processed: 4, pending: 2, results }),
    "Metadata checked for 4 Wishlist items: 1 linked, 1 need review, 1 need a match, 1 failed/retry scheduled. 2 remain pending or awaiting retry.",
  );
});

test("manual RAWG matching marks another Wishlist identity unavailable but keeps the current match selectable", () => {
  const duplicate = { rawg_id: 101, alreadyInWishlist: true };
  assert.equal(isWishlistRawgMatchUnavailable(duplicate, { rawg_id: 202 }), true);
  assert.equal(isWishlistRawgMatchUnavailable(duplicate, { rawg_id: 101 }), false);
  assert.equal(isWishlistRawgMatchUnavailable({ rawg_id: 101 }, { rawg_id: 202 }), false);
});
import { buildDisplayGames } from "../../utils/gameList.js";
import { canEditGame, canDeleteGame } from "../../utils/permissions.js";

test("maps a wishlist relationship into the shared backlog card shape", () => {
  assert.deepEqual(
    wishlistItemToGame({
      id: 12,
      steamAppId: "10",
      name: "Portal",
      cover: "https://cdn.example/portal.jpg",
      genres: ["Puzzle"],
      displayHLTB: 4,
      rating: 4.5,
      metacritic: 90,
      dateAdded: "2026-01-01T00:00:00.000Z",
      steamActive: true,
      gameId: null,
    }),
    {
      id: "wishlist-12",
      wishlistItemId: 12,
      steamAppId: "10",
      name: "Portal",
      cover: "https://cdn.example/portal.jpg",
      genres: ["Puzzle"],
      personal_genres: [],
      entryKind: "wishlist",
      readOnly: true,
      position: null,
      displayHLTB: 4,
      how_long_to_beat: 4,
      releaseDate: null,
      rating: 4.5,
      metacritic: 90,
      dateAdded: "2026-01-01T00:00:00.000Z",
      steamActive: true,
      gameId: null,
      status: "wishlist",
      isWishlistOnly: true,
    },
  );
});


test("all 444 active intentions enter the common search, filter and sort pipeline read-only", () => {
  const games = [{ id: 42, name: "Ordinary game", catalogGameId: 99, user_id: 7 }];
  const items = Array.from({ length: 444 }, (_, index) => ({
    id: index + 1, name: `Wishlist title ${index}`, active: true,
    steamActive: index < 436, providerOrder: index < 436 ? index : null,
    priority: 0, genres: ["Adventure"], displayHLTB: 24,
  }));
  const composed = composeBacklogWishlist(games, items);
  assert.equal(composed.length, 445);
  assert.equal(games.length, 1);
  const asc = buildDisplayGames({ games: composed, selectedStatuses: ["wishlist"], sortKey: "providerOrder" });
  const desc = buildDisplayGames({ games: composed, selectedStatuses: ["wishlist"], sortKey: "providerOrder", isReversed: true });
  assert.equal(asc.length, 444);
  assert.equal(asc[0].wishlistItemId, 1);
  assert.equal(desc[0].wishlistItemId, 436);
  assert.ok(desc.slice(-8).every((game) => !game.steamActive));
  assert.equal(buildDisplayGames({ games: composed, searchQuery: "Wishlist title 443", selectedGenres: ["Adventure"] }).some((game) => game.wishlistItemId === 444), true);
  assert.ok(composed.slice(1).every((game) => !canEditGame({ user: { id: 7 }, game, isAuthenticated: true }) && !canDeleteGame({ user: { id: 7 }, game, isAuthenticated: true })));
  const matched = composeBacklogWishlist(games, [{ ...items[0], gameId: 42 }, { ...items[1], catalogGameId: 99 }, { ...items[2], active: false }]);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, 42);
  assert.equal(canEditGame({ user: { id: 7 }, game: matched[0], isAuthenticated: true }), true);
});
