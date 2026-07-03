import test from "node:test";
import assert from "node:assert/strict";
import {
  achievementStatusSuggestion,
  formatAchievementSummary,
  formatAchievementSyncDate,
} from "./steamAchievements.js";

test("formatAchievementSummary includes completion and remaining labels", () => {
  assert.deepEqual(
    formatAchievementSummary({
      status: "synced",
      unlocked: 18,
      total: 20,
      percent: 90,
    }),
    {
      status: "synced",
      label: "18/20",
      detail: "90% complete - 2 left",
      compact: "90%",
      percent: 90,
      unlocked: 18,
      total: 20,
      remaining: 2,
      remainingLabel: "2 achievements left",
      tone: "primary",
      isMeaningful: true,
    }
  );

  assert.equal(
    formatAchievementSummary({
      status: "synced",
      unlocked: 20,
      total: 20,
      percent: 100,
    }).remainingLabel,
    "Completed"
  );
});

test("formatAchievementSyncDate returns friendly recent labels", () => {
  const now = Date.now;
  Date.now = () => new Date("2026-07-03T12:00:00Z").getTime();
  try {
    assert.equal(formatAchievementSyncDate("2026-07-03T08:00:00Z"), "today");
    assert.equal(formatAchievementSyncDate("2026-07-02T08:00:00Z"), "yesterday");
    assert.equal(formatAchievementSyncDate("2026-06-30T08:00:00Z"), "3 days ago");
  } finally {
    Date.now = now;
  }
});

test("achievementStatusSuggestion suggests conservative completion states", () => {
  assert.deepEqual(
    achievementStatusSuggestion({
      status: "playing",
      playtimeMinutes: 1200,
      achievements: { status: "synced", total: 10, percent: 100 },
    }),
    {
      label: "Looks complete",
      targetStatus: "finished",
      confidence: "medium",
      reason: "Steam achievements are 100% complete.",
    }
  );

  assert.equal(
    achievementStatusSuggestion({
      status: "finished",
      playtimeMinutes: 1200,
      achievements: { status: "synced", total: 10, percent: 100 },
    }),
    null
  );

  assert.equal(
    achievementStatusSuggestion({
      status: "plan to play",
      playtimeMinutes: 900,
      achievements: { status: "private" },
    })?.targetStatus,
    "played alot but didnt finish"
  );
});
