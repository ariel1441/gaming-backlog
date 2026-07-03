import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAchievementGameSyncMessage,
  formatAchievementBatchSyncMessage,
  formatSteamLibrarySyncMessage,
} from "./steamSync.js";

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
