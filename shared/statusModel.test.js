import test from "node:test";
import assert from "node:assert/strict";
import {
  SELECTABLE_STATUSES,
  statusGroupOf,
  statusDisplayLabel,
  completionDate,
  hasCompletedGame,
  isNextUpEligible,
  showsShortSteamActivity,
} from "./statusModel.js";
import { resolveSmartList } from "../src/utils/automaticLists.js";
import {
  recommendationCandidates,
  focusRoleCandidates,
  surprisePool,
} from "../src/utils/playNext.js";
import { defaultStatusSemantics } from "../src/utils/statusSemantics.js";
import { buildTimelineEvents } from "../src/utils/gameTimeline.js";
import { resolveGameHours } from "../src/utils/hours.js";

test("v1 names and grouping preserve distinct completion and trial outcomes", () => {
  assert.equal(
    statusDisplayLabel("played alot but didnt finish"),
    "Played enough",
  );
  assert.equal(statusDisplayLabel("played and should come back"), "On hold");
  assert.equal(statusGroupOf("played a bit"), "tried");
  assert.equal(statusGroupOf("played and wont come back"), "tried");
  assert.equal(statusGroupOf("occasional"), "occasional");
  assert.equal(SELECTABLE_STATUSES.includes("recommended by someone"), false);
});

test("Done lists include Played enough while Finished lists and timelines do not", () => {
  const games = [
    { id: 1, status: "finished", finished_at: "2026-08-01" },
    {
      id: 2,
      status: "played alot but didnt finish",
      finished_at: "2026-08-02",
    },
    { id: 3, status: "playing", finished_at: "2025-08-01" },
  ];
  assert.deepEqual(
    resolveSmartList({ query: { status: "done" } }, games).games.map(
      (g) => g.id,
    ),
    [1, 2],
  );
  assert.deepEqual(
    resolveSmartList({ query: { status: "finished" } }, games).games.map(
      (g) => g.id,
    ),
    [1],
  );
  assert.equal(completionDate(games[1]), null);
  assert.equal(games[1].finished_at, "2026-08-02");
  assert.equal(hasCompletedGame(games[2]), false);
  assert.equal(completionDate(games[2]), "2025-08-01");
  assert.deepEqual(
    buildTimelineEvents(games)
      .filter((e) => e.type === "finished")
      .map((e) => e.game.id),
    [1, 3],
  );
});

test("Occasional and disengaged games never appear in automatic next-game choices", () => {
  const statusGroupOf = defaultStatusSemantics.statusGroupOf;
  const games = [
    "occasional",
    "not anytime soon",
    "played and wont come back",
    "played alot but didnt finish",
  ].map((status, id) => ({ id: id + 1, status, how_long_to_beat: 4 }));
  for (const game of games) assert.equal(isNextUpEligible(game.status), false);
  assert.equal(isNextUpEligible("played a bit"), true);
  assert.deepEqual(
    focusRoleCandidates({ games, role: "side", statusGroupOf }),
    [],
  );
  assert.deepEqual(
    surprisePool({ games, pool: "backlog", queueIds: [], statusGroupOf }),
    [],
  );
  const recommendations = recommendationCandidates({
    games,
    queueIds: [],
    selectedGenres: [],
    dismissed: {},
    statusGroupOf,
  });
  assert.equal(JSON.stringify(recommendations).includes('"game"'), false);
});

test("acknowledged play exposes short Steam context and keeps one-minute playtime", () => {
  for (const status of [
    "playing",
    "occasional",
    "played a bit",
    "played and wont come back",
    "played and should come back",
    "finished",
  ])
    assert.equal(showsShortSteamActivity(status), true);
  assert.equal(showsShortSteamActivity("plan to play"), false);
  const hours = resolveGameHours({
    status: "played a bit",
    steamPlaytimeHours: 0,
    steamPlaytimeMinutes: 1,
  });
  assert.equal(hours.label, "1m");
  assert.equal(hours.hours, 1 / 60);
});
