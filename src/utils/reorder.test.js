import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRankReorderRequest,
  applyRankOrder,
  optimisticRankOrder,
  canReorderVisibleGames,
  getManualReorderAvailability,
} from "./reorder.js";

const games = [
  { id: 1, name: "Done A", status: "finished", status_rank: 12 },
  {
    id: 2,
    name: "Done B",
    status: "played alot but didnt finish",
    status_rank: 12,
  },
  { id: 3, name: "Playing", status: "playing", status_rank: 1 },
];

test("buildRankReorderRequest reorders same-rank games without status payload", () => {
  const request = buildRankReorderRequest(games, 1, 2);

  assert.deepEqual(
    request.newOrder.map((game) => game.id),
    [2, 1, 3],
  );
  assert.equal(request.gameId, 1);
  assert.equal(request.targetIndex, 1);
  assert.equal(Object.hasOwn(request, "status"), false);
});

test("buildRankReorderRequest rejects cross-rank drops", () => {
  assert.equal(buildRankReorderRequest(games, 1, 3), null);
});

test("filtered reorder is allowed when every visible rank is complete", () => {
  assert.equal(canReorderVisibleGames(games, games.slice(0, 2)), true);
});

test("filtered reorder is blocked when another game in a visible rank is hidden", () => {
  assert.equal(canReorderVisibleGames(games, [games[0], games[2]]), false);
});

test("filtered reorder is blocked when visible games lack rank metadata", () => {
  assert.equal(
    canReorderVisibleGames(games, [
      games[0],
      { id: 4, name: "Unknown rank", status: "planned" },
    ]),
    false,
  );
});

test("manual backlog ordering requires permission, default sort, and complete ranks", () => {
  assert.deepEqual(
    getManualReorderAvailability({
      allGames: games,
      visibleGames: games,
      canReorder: true,
      busy: true,
    }),
    { enabled: false, reason: "busy" },
  );
  assert.deepEqual(
    getManualReorderAvailability({
      allGames: games,
      visibleGames: games.slice(0, 2),
      canReorder: false,
    }),
    { enabled: false, reason: "permission" },
  );
  assert.deepEqual(
    getManualReorderAvailability({
      allGames: games,
      visibleGames: games.slice(0, 2),
      canReorder: true,
      sortKey: "score",
    }),
    { enabled: false, reason: "sort" },
  );
  assert.deepEqual(
    getManualReorderAvailability({
      allGames: games,
      visibleGames: games,
      canReorder: true,
      hasPartialFilters: true,
    }),
    { enabled: false, reason: "filters" },
  );
  assert.deepEqual(
    getManualReorderAvailability({
      allGames: games,
      visibleGames: games,
      canReorder: true,
      hasNonBacklogEntries: true,
    }),
    { enabled: false, reason: "mixed-collection" },
  );
  assert.deepEqual(
    getManualReorderAvailability({
      allGames: games,
      visibleGames: [games[0], games[2]],
      canReorder: true,
    }),
    { enabled: false, reason: "incomplete-ranks" },
  );
  assert.deepEqual(
    getManualReorderAvailability({
      allGames: games,
      visibleGames: games.slice(0, 2),
      canReorder: true,
    }),
    { enabled: true, reason: null },
  );
});


test("optimistic and authoritative order preserve other ranks and handle string IDs", () => {
  const original = [
    { id: 1, status_rank: 1, position: 0, status: "playing" },
    { id: 2, status_rank: 1, position: 1000, status: "playing" },
    { id: 3, status_rank: 12, position: 0, status: "finished" },
  ];
  const optimistic = optimisticRankOrder(original, "2", 0);
  assert.deepEqual(optimistic.map((game) => game.id), [2, 1, 3]);
  const saved = applyRankOrder(optimistic, {
    game: { id: 2, name: "Saved title" },
    rank_order: [{ id: "2", position: 0, status: "playing" }, { id: "1", position: 1000, status: "playing" }],
  });
  assert.deepEqual(saved.map((game) => String(game.id)), ["2", "1", "3"]);
  assert.equal(saved[0].name, "Saved title");
  assert.deepEqual(original.map((game) => game.id), [1, 2, 3]);
  assert.equal(saved[2].status, "finished");
});
