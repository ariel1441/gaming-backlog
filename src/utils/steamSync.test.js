import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSteamStatusSuggestionPayload,
  formatAchievementGameSyncMessage,
  formatAchievementBatchSyncMessage,
  formatSteamLibrarySyncMessage,
  normalizeSyncReview,
} from "./steamSync.js";

test("stored Steam reviews build a stable playing-status payload", () => {
  assert.deepEqual(
    buildSteamStatusSuggestionPayload(
      { suggestedStatus: "finished", firstPlayObservedAt: "stale-invalid-date" },
      { setStartedAt: true },
    ),
    { status: "playing", setStartedAt: true },
  );
  assert.deepEqual(
    buildSteamStatusSuggestionPayload(
      { lastPlayedAt: "2026-07-12T10:30:00.000Z" },
      { setStartedAt: true },
    ),
    {
      status: "playing",
      setStartedAt: true,
      startedAt: "2026-07-12T10:30:00.000Z",
    },
  );
  assert.deepEqual(
    buildSteamStatusSuggestionPayload(
      { firstPlayObservedAt: "stale-invalid-date" },
      { setStartedAt: false },
    ),
    { status: "playing", setStartedAt: false },
  );
});

test("stored Steam reviews normalize array shape and recompute totals", () => {
  assert.deepEqual(
    normalizeSyncReview({
      startedPlaying: [{ gameId: 6290 }],
      statusSuggestions: "stale-invalid-value",
      newSteamGames: [{ candidateId: 4 }],
      total: 99,
      savedAt: "2026-07-12T10:00:00.000Z",
    }),
    {
      startedPlaying: [{ gameId: 6290 }],
      statusSuggestions: [],
      newSteamGames: [{ candidateId: 4 }],
      total: 2,
      savedAt: "2026-07-12T10:00:00.000Z",
    },
  );
});

test("formatSteamLibrarySyncMessage describes checks without implying every app changed", () => {
  assert.equal(
    formatSteamLibrarySyncMessage({
      total: 700,
      candidatesCreated: 12,
      candidatesUpdated: 4,
      candidatesUnchanged: 684,
      achievements: {
        synced: 12,
        skipped: 3,
        unavailable: 2,
        failed: 1,
      },
    }),
    "Checked 700 Steam apps for library changes. Import queue: 12 new, 4 updated, 684 unchanged. Achievements: 12 synced, 3 recently checked, 3 unavailable."
  );
});

test("formatAchievementBatchSyncMessage summarizes partial achievement sync results", () => {
  assert.equal(
    formatAchievementBatchSyncMessage({
      synced: 18,
      skipped: 4,
      none: 2,
      unavailable: 2,
      failed: 1,
    }),
    "Achievements: 18 synced, 2 with no achievements, 4 recently checked, 3 unavailable."
  );

  assert.equal(
    formatAchievementBatchSyncMessage({ synced: 0, skipped: 8 }),
    "Steam achievements were checked recently. Try again after the cooldown."
  );
});

test("formatAchievementGameSyncMessage distinguishes per-game achievement states", () => {
  assert.deepEqual(
    formatAchievementGameSyncMessage({ achievements: { status: "none" } }),
    {
      tone: "info",
      message: "Steam does not list achievements for this game.",
    }
  );
  assert.deepEqual(
    formatAchievementGameSyncMessage({ achievements: { status: "unavailable" } }),
    {
      tone: "warning",
      message: "Steam did not return achievement data for this game.",
    }
  );
});
