import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSmartQueryFromTemplate,
  describeSmartQuery,
  normalizeSmartQuery,
  normalizeSmartSortKey,
  resolveSmartList,
  smartListExposedControls,
  smartListGenres,
  smartListYears,
} from "./automaticLists.js";

const now = new Date("2026-07-04T12:00:00Z");

function game(overrides) {
  return {
    id: 1,
    name: "Game",
    status: "plan to play",
    status_rank: 20,
    position: 1000,
    my_score: null,
    my_genre: "",
    genres: "",
    how_long_to_beat: null,
    releaseDate: null,
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

test("smart list filters finished year and ranks scored games first", () => {
  const games = [
    game({
      id: 1,
      name: "Unscored newer",
      status: "finished",
      finished_at: "2026-06-01",
      position: 3000,
    }),
    game({
      id: 2,
      name: "Nine",
      status: "finished",
      my_score: 9,
      finished_at: "2026-01-01",
      position: 2000,
    }),
    game({
      id: 3,
      name: "Eight",
      status: "finished",
      my_score: 8,
      finished_at: "2026-05-01",
      position: 1000,
    }),
    game({
      id: 4,
      name: "Wrong year",
      status: "finished",
      my_score: 10,
      finished_at: "2025-12-31",
    }),
  ];

  const list = resolveSmartList(
    { query: { status: "finished", finishedYear: 2026 }, sortKey: "score" },
    games
  );

  assert.deepEqual(
    list.games.map((item) => item.name),
    ["Nine", "Eight", "Unscored newer"]
  );
});

test("smart list can filter by release year and genre", () => {
  const games = [
    game({
      id: 1,
      name: "Match",
      status: "finished",
      releaseDate: "2026-02-01",
      my_genre: "Action",
    }),
    game({
      id: 2,
      name: "Wrong genre",
      status: "finished",
      releaseDate: "2026-03-01",
      my_genre: "RPG",
    }),
    game({
      id: 3,
      name: "Wrong year",
      status: "finished",
      releaseDate: "2025-03-01",
      my_genre: "Action",
    }),
  ];

  const list = resolveSmartList(
    { query: { releasedYear: 2026, genre: "Action" }, sortKey: "releaseDate" },
    games
  );

  assert.deepEqual(list.games.map((item) => item.name), ["Match"]);
});

test("short backlog template filters unfinished games under ten hours", () => {
  const games = [
    game({ id: 1, name: "Long", how_long_to_beat: 30 }),
    game({ id: 2, name: "Shorter", how_long_to_beat: 4 }),
    game({ id: 3, name: "Short", how_long_to_beat: 8 }),
    game({ id: 4, name: "Finished short", status: "finished", how_long_to_beat: 2 }),
  ];

  const preset = buildSmartQueryFromTemplate("short-backlog", games, { now });
  const list = resolveSmartList(preset, games);

  assert.deepEqual(
    list.games.map((item) => item.name),
    ["Shorter", "Short"]
  );
  assert.deepEqual(smartListExposedControls(preset.query), ["maxHours"]);
});

test("smart years and genres are derived from backlog data", () => {
  const games = [
    game({
      id: 1,
      finished_at: "2026-01-01",
      releaseDate: "2024-01-01",
      my_genre: "RPG",
    }),
    game({
      id: 2,
      finished_at: "2025-01-01",
      releaseDate: "2026-01-01",
      my_genre: "RPG, Cozy",
    }),
    game({ id: 3, my_genre: "Cozy" }),
  ];

  assert.deepEqual(smartListYears(games), [2026, 2025]);
  assert.deepEqual(smartListYears(games, "release"), [2026, 2024]);
  assert.deepEqual(smartListGenres(games), [
    { value: "Cozy", count: 2 },
    { value: "RPG", count: 2 },
  ]);
});

test("rule description names filters and ranking", () => {
  assert.equal(
    describeSmartQuery(
      { status: "finished", finishedYear: 2026, genre: "Action", minScore: 4 },
      "score"
    ),
    "Finished / done - Finished in 2026 - Genre: Action - Score 4+ - Ranked by your score, highest first"
  );
});

test("best finished template is a concept with an exposed year parameter", () => {
  const preset = buildSmartQueryFromTemplate("best-finished-year", [], { now });

  assert.equal(preset.name, "Best finished games");
  assert.deepEqual(preset.query, {
    status: "finished",
    finishedYear: 2026,
    exposedControls: ["finishedYear"],
  });
});

test("smart exposed controls allow broad status but not minimum score", () => {
  assert.deepEqual(
    smartListExposedControls({
      exposedControls: ["status", "minScore", "genre"],
    }),
    ["status", "genre"]
  );
});

test("smart query normalization keeps only supported saved values", () => {
  assert.deepEqual(
    normalizeSmartQuery({
      status: "finished",
      finishedYear: "2026",
      releasedYear: "bad",
      genre: "  Action  ",
      maxHours: "10",
      minScore: "4.5",
      missingHours: false,
      exposedControls: ["status", "minScore", "status", "maxHours", "unknown"],
    }),
    {
      status: "finished",
      finishedYear: 2026,
      genre: "Action",
      maxHours: 10,
      minScore: 4.5,
      exposedControls: ["status", "maxHours"],
    }
  );

  assert.equal(normalizeSmartSortKey("unknown"), "score");
});

test("smart list empty states explain the active rule", () => {
  const finished = resolveSmartList(
    { query: { status: "finished", finishedYear: 2026 }, sortKey: "score" },
    []
  );
  assert.equal(finished.emptyTitle, "No finished games in 2026.");

  const missingHours = resolveSmartList(
    { query: { missingHours: true }, sortKey: "default" },
    [game({ how_long_to_beat: 4 })]
  );
  assert.equal(missingHours.emptyTitle, "No games are missing hours.");
});
