import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGameFilters,
  buildDisplayGames,
  findDuplicateGameByTitle,
  isSameGameTitle,
  matchesDateFilter,
  matchesSourceFilter,
  normalizeGameTitle,
  personalGenreNames,
  sortGames,
  splitCsv,
} from "./gameList.js";

test("structured personal genres are authoritative over the legacy mirror", () => {
  const game = {
    personal_genres: [{ id: 1, name: "Cozy" }, { id: 2, name: "Strategy" }],
    my_genre: "Legacy",
  };
  assert.deepEqual(personalGenreNames(game), ["Cozy", "Strategy"]);
  assert.equal(
    applyGameFilters([game], { selectedMyGenres: ["Legacy"] }).length,
    0,
  );
  assert.equal(
    applyGameFilters([game], { selectedMyGenres: ["Cozy"] }).length,
    1,
  );
});
import {
  NO_PERSONAL_GENRE_FILTER,
  NO_RAWG_GENRE_FILTER,
} from "./filterOptions.js";

const games = [
  {
    id: 3,
    name: "Celeste",
    status: "finished",
    status_rank: 12,
    position: 1000,
    genres: "Platformer, Indie",
    my_genre: "Precision",
    how_long_to_beat: 8,
    rating: 4.6,
    metacritic: 92,
    releaseDate: "2018-01-25",
    started_at: "2024-03-10",
    finished_at: "2024-03-20",
  },
  {
    id: 1,
    name: "Elden Ring",
    status: "playing",
    status_rank: 1,
    position: 2000,
    genres: "RPG, Action",
    my_genre: "Soulslike",
    how_long_to_beat: 60,
    rating: 4.8,
    metacritic: 96,
    releaseDate: "2022-02-25",
    started_at: "2024-02-01",
    finished_at: null,
  },
  {
    id: 2,
    name: "Hades",
    status: "playing",
    status_rank: 1,
    position: 1000,
    genres: "Roguelike, Action",
    my_genre: "Roguelike",
    how_long_to_beat: 22,
    rating: 4.5,
    metacritic: 93,
    releaseDate: "2020-09-17",
    started_at: null,
    finished_at: "2023-11-05",
  },
];

test("splitCsv parses comma-separated values defensively", () => {
  assert.deepEqual(splitCsv("Action, RPG, "), ["Action", "RPG"]);
  assert.deepEqual(splitCsv(["One", " Two "]), ["One", "Two"]);
  assert.deepEqual(splitCsv(null), []);
});

test("normalizeGameTitle creates stable duplicate-detection keys", () => {
  assert.equal(normalizeGameTitle("  Baldur's   Gate 3!! "), "baldurs gate 3");
  assert.equal(normalizeGameTitle("ELDEN-ring"), "elden ring");
});

test("isSameGameTitle matches punctuation and casing variants", () => {
  assert.equal(
    isSameGameTitle("Marvel's Spider-Man", "marvels spider man"),
    true,
  );
  assert.equal(isSameGameTitle("Hades", "Hades II"), false);
});

test("findDuplicateGameByTitle returns an existing matching game", () => {
  assert.equal(findDuplicateGameByTitle("elden-ring", games)?.id, 1);
  assert.equal(findDuplicateGameByTitle("Not in list", games), null);
});

test("sortGames uses status rank, position, then id by default", () => {
  assert.deepEqual(
    sortGames(games).map((game) => game.name),
    ["Hades", "Elden Ring", "Celeste"],
  );
});

test("sortGames supports selected sort keys and reverse order", () => {
  assert.deepEqual(
    sortGames(games, { sortKey: "name" }).map((game) => game.name),
    ["Celeste", "Elden Ring", "Hades"],
  );
  assert.deepEqual(
    sortGames(games, { sortKey: "metacritic", isReversed: true }).map(
      (game) => game.name,
    ),
    ["Elden Ring", "Hades", "Celeste"],
  );
});

test("sortGames supports started date with missing dates last", () => {
  assert.deepEqual(
    sortGames(games, { sortKey: "startedDate" }).map((game) => game.name),
    ["Elden Ring", "Celeste", "Hades"],
  );
  assert.deepEqual(
    sortGames(games, { sortKey: "startedDate", isReversed: true }).map(
      (game) => game.name,
    ),
    ["Celeste", "Elden Ring", "Hades"],
  );
});

test("sortGames supports finished date with missing dates last", () => {
  assert.deepEqual(
    sortGames(games, { sortKey: "finishedDate" }).map((game) => game.name),
    ["Hades", "Celeste", "Elden Ring"],
  );
  assert.deepEqual(
    sortGames(
      [
        ...games,
        {
          id: 4,
          name: "Invalid Date Game",
          status_rank: 1,
          position: 1500,
          finished_at: "not-a-date",
        },
      ],
      { sortKey: "finishedDate", isReversed: true },
    ).map((game) => game.name),
    ["Celeste", "Hades", "Invalid Date Game", "Elden Ring"],
  );
});

test("sortGames supports Steam last played with missing dates last", () => {
  const steamGames = [
    { id: 1, name: "Old", steamLastPlayedAt: "2026-01-01T00:00:00.000Z" },
    { id: 2, name: "Recent", steamLastPlayedAt: "2026-06-01T00:00:00.000Z" },
    { id: 3, name: "Never", steamLastPlayedAt: null },
  ];
  assert.deepEqual(
    sortGames(steamGames, { sortKey: "steamLastPlayed" }).map(
      (game) => game.name,
    ),
    ["Old", "Recent", "Never"],
  );
  assert.deepEqual(
    sortGames(steamGames, { sortKey: "steamLastPlayed", isReversed: true }).map(
      (game) => game.name,
    ),
    ["Recent", "Old", "Never"],
  );
});

test("applyGameFilters filters by status, genres, my genres, and hours", () => {
  assert.deepEqual(
    applyGameFilters(games, {
      selectedStatuses: ["playing"],
      selectedGenres: ["Action"],
      selectedMyGenres: ["Soulslike"],
      hoursBounds: { min: 8, max: 60 },
      hoursRange: { min: 40, max: 60 },
    }).map((game) => game.name),
    ["Elden Ring"],
  );
});

test("matchesSourceFilter supports recently played Steam games", () => {
  assert.equal(
    matchesSourceFilter(
      {
        steamOwned: true,
        steamLastPlayedAt: "2026-06-15T00:00:00.000Z",
      },
      "steam_recent",
      new Date("2026-07-01T00:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    matchesSourceFilter(
      {
        steamOwned: true,
        steamLastPlayedAt: "2026-05-01T00:00:00.000Z",
      },
      "steam_recent",
      new Date("2026-07-01T00:00:00.000Z"),
    ),
    false,
  );
});

test("matchesSourceFilter supports Steam achievement summary filters", () => {
  const game = {
    steamOwned: true,
    steamAchievements: {
      status: "synced",
      unlocked: 18,
      total: 20,
      percent: 90,
      lastSyncedAt: "2026-07-01T00:00:00.000Z",
    },
  };

  assert.equal(matchesSourceFilter(game, "steam_achievements"), true);
  assert.equal(matchesSourceFilter(game, "steam_achievements_close"), true);
  assert.equal(matchesSourceFilter(game, "steam_achievements_complete"), false);
  assert.equal(
    matchesSourceFilter(
      {
        ...game,
        steamAchievements: { ...game.steamAchievements, percent: 100 },
      },
      "steam_achievements_complete",
    ),
    true,
  );
  assert.equal(
    matchesSourceFilter(
      {
        steamOwned: true,
        steamAchievements: { status: "unknown", lastSyncedAt: null },
      },
      "steam_achievements_not_synced",
    ),
    true,
  );
  assert.equal(
    matchesSourceFilter(
      { steamOwned: true, steamAchievements: { status: "private" } },
      "steam_achievements_unavailable",
    ),
    true,
  );
});

test("applyGameFilters supports date filters", () => {
  assert.deepEqual(
    applyGameFilters(games, {
      dateFilter: { type: "startedYear", year: 2024 },
    }).map((game) => game.name),
    ["Celeste", "Elden Ring"],
  );
  assert.deepEqual(
    applyGameFilters(games, {
      dateFilter: { type: "finishedYear", year: 2023 },
    }).map((game) => game.name),
    ["Hades"],
  );
});

test("matchesDateFilter supports active unfinished aging", () => {
  assert.equal(
    matchesDateFilter(
      { started_at: "2025-01-01", finished_at: null },
      { type: "activeOlderThanMonths", months: 6 },
      new Date("2026-05-09T00:00:00Z"),
    ),
    true,
  );
  assert.equal(
    matchesDateFilter(
      { started_at: "2026-04-01", finished_at: null },
      { type: "activeOlderThanMonths", months: 6 },
      new Date("2026-05-09T00:00:00Z"),
    ),
    false,
  );
  assert.equal(
    matchesDateFilter(
      { started_at: "2025-01-01", finished_at: "2025-02-01" },
      { type: "activeOlderThanMonths", months: 6 },
      new Date("2026-05-09T00:00:00Z"),
    ),
    false,
  );
});

test("buildDisplayGames combines filters, fuzzy search, and sorting", () => {
  assert.deepEqual(
    buildDisplayGames({
      games,
      searchQuery: "elden",
      selectedGenres: ["RPG"],
    }).map((game) => game.name),
    ["Elden Ring"],
  );
});

test("applyGameFilters can select games with missing personal or RAWG genres", () => {
  const games = [
    { id: 1, name: "No genres", genres: null, my_genre: "" },
    { id: 2, name: "Only RAWG", genres: "Action", my_genre: null },
    { id: 3, name: "Both", genres: "RPG", my_genre: "Soulslike" },
  ];

  assert.deepEqual(
    applyGameFilters(games, {
      selectedMyGenres: [NO_PERSONAL_GENRE_FILTER],
    }).map((game) => game.id),
    [1, 2],
  );
  assert.deepEqual(
    applyGameFilters(games, {
      selectedGenres: [NO_RAWG_GENRE_FILTER],
    }).map((game) => game.id),
    [1],
  );
  assert.deepEqual(
    applyGameFilters(games, {
      selectedGenres: [NO_RAWG_GENRE_FILTER, "RPG"],
    }).map((game) => game.id),
    [1, 3],
  );
});
