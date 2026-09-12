import assert from "node:assert/strict";
import test from "node:test";
import { groupSteamActivityHistory } from "./steamActivityService.js";

test("Steam activity history groups deltas and preserves a missed-sync interval", () => {
  const result = groupSteamActivityHistory([
    { id: 1, local_day: "2026-09-14", steam_app_id: "10", game_name: "Hades", playtime_delta_minutes: 95, achievements_delta: 2, achievements_unlocked: 12, achievements_total: 49, observed_at: "2026-09-14T03:00:00.000Z", interval_started_at: "2026-09-12T03:00:00.000Z", game_id: null },
    { id: 2, local_day: "2026-09-14", steam_app_id: "20", game_name: "Celeste", playtime_delta_minutes: 20, achievements_delta: 0, observed_at: "2026-09-14T03:00:00.000Z", interval_started_at: "2026-09-13T03:00:00.000Z", game_id: 5 },
  ]);
  assert.deepEqual(result.summary, { playtimeMinutes: 115, achievementsUnlocked: 2, activeDays: 1 });
  assert.equal(result.days[0].hasGap, true);
  assert.equal(result.days[0].games[0].isBacklogGame, false);
  assert.equal(result.days[0].games[1].isBacklogGame, true);
});
