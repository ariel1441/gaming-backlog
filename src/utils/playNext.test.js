import assert from "node:assert/strict";
import test from "node:test";
import {
  moveQueueItem,
  playNextStatusGroup,
  recommendationCandidates,
  surprisePool,
} from "./playNext.js";

const groups = (status) =>
  status === "playing"
    ? "playing"
    : status === "returning"
      ? "returning"
    : status === "finished"
      ? "done"
      : "planned";

test("recommendations are deterministic, queue-first, and keep unknown hours unknown", () => {
  const games = [
    { id: 9, name: "Unknown", status: "plan", how_long_to_beat: null },
    { id: 4, name: "Queue short", status: "plan", how_long_to_beat: 8 },
    { id: 2, name: "Backlog shorter", status: "plan", how_long_to_beat: 2 },
    { id: 7, name: "Active note", status: "playing", resume_note: "Boss" },
  ];
  const result = recommendationCandidates({
    games,
    queueIds: [9, 4],
    statusGroupOf: groups,
  });
  assert.deepEqual(
    result.map((pick) => [pick.lane, pick.game.id]),
    [
      ["priority", 9],
      ["quick", 4],
      ["continue", 7],
    ],
  );
  assert.match(result[1].reason, /8h/);
});

test("continue playing uses oldest Steam activity, then oldest start date", () => {
  const steam = recommendationCandidates({
    games: [
      { id: 3, status: "playing", steamLastPlayedAt: "2025-02-01" },
      { id: 2, status: "playing", steamLastPlayedAt: "2024-02-01" },
    ],
    statusGroupOf: groups,
  });
  assert.equal(steam[0].game.id, 2);

  const started = recommendationCandidates({
    games: [
      { id: 3, status: "playing", started_at: "2025-02-01" },
      { id: 2, status: "playing", started_at: "2024-02-01" },
    ],
    statusGroupOf: groups,
  });
  assert.equal(started[0].game.id, 2);
});

test("mood selection uses personal genres with OR matching and never falls back", () => {
  const games = [
    { id: 1, status: "plan", my_genre: "cozy, puzzle", how_long_to_beat: 5 },
    { id: 2, status: "plan", my_genre: "action", how_long_to_beat: 2 },
    { id: 3, status: "playing", my_genre: "story focus", resume_note: "Dock" },
  ];
  const picks = recommendationCandidates({
    games,
    queueIds: [2, 1],
    statusGroupOf: groups,
    selectedGenres: ["cozy", "story focus"],
  });
  assert.deepEqual(
    picks.map((pick) => [pick.lane, pick.game.id]),
    [
      ["priority", 1],
      ["quick", 1],
      ["continue", 3],
    ],
  );
  assert.match(picks[0].reason, /cozy or story focus mood/);
  assert.deepEqual(
    surprisePool({
      pool: "next-up",
      games,
      queueIds: [1, 2],
      statusGroupOf: groups,
      selectedGenres: ["horror"],
    }),
    [],
  );
});

test("Play Next corrects stale metadata for raw Playing and Come back statuses", () => {
  const staleGroups = (status) =>
    ["playing", "played and should come back"].includes(status)
      ? "playing"
      : "planned";
  assert.equal(playNextStatusGroup("playing", staleGroups), "playing");
  assert.equal(
    playNextStatusGroup("played and should come back", staleGroups),
    "returning",
  );
  const picks = recommendationCandidates({
    games: [
      { id: 1, status: "playing", resume_note: "Continue" },
      {
        id: 2,
        status: "played and should come back",
        resume_note: "Not active",
      },
    ],
    statusGroupOf: staleGroups,
  });
  assert.deepEqual(
    picks.map((pick) => [pick.lane, pick.game.id]),
    [["continue", 1]],
  );
});

test("dismissal advances only the current lane and surprise never falls back", () => {
  const games = [
    { id: 1, status: "plan", how_long_to_beat: 3 },
    { id: 2, status: "plan", how_long_to_beat: 4 },
  ];
  const result = recommendationCandidates({
    games,
    queueIds: [1, 2],
    statusGroupOf: groups,
    dismissed: { priority: new Set([1]) },
  });
  assert.equal(result.find((pick) => pick.lane === "priority").game.id, 2);
  assert.deepEqual(
    surprisePool({
      pool: "next-up",
      games,
      queueIds: [],
      statusGroupOf: groups,
    }),
    [],
  );
});

test("queue movement supports accessible relative and absolute moves", () => {
  assert.deepEqual(moveQueueItem([1, 2, 3], 3, "top"), [3, 1, 2]);
  assert.deepEqual(moveQueueItem([1, 2, 3], 2, "down"), [1, 3, 2]);
  assert.deepEqual(moveQueueItem([1, 2, 3], 1, 2), [2, 3, 1]);
});
