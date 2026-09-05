import test from "node:test";
import assert from "node:assert/strict";
import { wishlistItemToGame, composeBacklogWishlist } from "./wishlistPresentation.js";
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
