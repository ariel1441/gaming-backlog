import assert from "node:assert/strict";
import test from "node:test";
import {
  groupSteamActivityInsights,
  groupSteamActivityHistory,
  recordSteamActivityObservations,
} from "./steamActivityService.js";
import { activitySummary } from "../../src/utils/activityInbox.js";

test("same-game same-day Activity and notification totals sum all idempotent observations", () => {
  const observations = [
    { id: 1, activity_day: "2026-09-23", activity_precision: "daily", steam_app_id: "10", game_name: "Hades", playtime_delta_minutes: 30 },
    { id: 2, activity_day: "2026-09-23", activity_precision: "daily", steam_app_id: "10", game_name: "Hades", playtime_delta_minutes: 45 },
  ];
  const activity = groupSteamActivityHistory({ observations }, { range: "all", today: "2026-09-24" });
  const notification = activitySummary(observations.map((row) => ({
    eventType: "steam_played", payload: { playtimeMinutes: row.playtime_delta_minutes },
  })));
  assert.equal(activity.summary.playtimeMinutes, 75);
  assert.equal(activity.items[0].games[0].playtimeMinutes, 75);
  assert.equal(notification, "Played for 1h 15m");
});

test("Activity Insights applies one eligibility contract to totals, games, days and exact events", () => {
  const result = groupSteamActivityInsights({
    observations: [
      {
        activity_day: "2026-09-21", activity_precision: "daily", steam_app_id: "daily",
        game_name: "Daily game", playtime_delta_minutes: 90,
      },
      {
        activity_precision: "uncertain", steam_app_id: "contained", game_name: "Contained game",
        playtime_delta_minutes: 185, interval_started_at: "2026-09-22T02:00:00Z",
        observed_at: "2026-09-24T02:00:00Z",
      },
      {
        activity_precision: "uncertain", steam_app_id: "crossing", game_name: "Crossing game",
        playtime_delta_minutes: 45, interval_started_at: "2026-09-19T02:00:00Z",
        observed_at: "2026-09-21T02:00:00Z",
      },
    ],
    achievements: [
      { id: 1, activity_day: "2026-09-20", steam_app_id: "daily" },
      { id: 2, activity_day: "2026-09-21", steam_app_id: "daily" },
    ],
    highlights: [
      {
        event_type: "steam_first_played", steam_app_id: "daily", game_name: "Daily game",
        payload_json: { activityDay: "2026-09-21", activityPrecision: "daily" },
      },
      {
        event_type: "steam_returned", steam_app_id: "daily", game_name: "Daily game",
        payload_json: { activityDay: "2026-09-21", activityPrecision: "daily", daysSincePrevious: 10 },
      },
      {
        event_type: "steam_first_played", steam_app_id: "crossing", game_name: "Crossing game",
        payload_json: { activityPrecision: "uncertain", intervalStartedAt: "2026-09-19T02:00:00Z" },
      },
    ],
    coverageRows: [
      { activity_day: "2026-09-21", activity_precision: "daily", observed_at: "2026-09-22T02:00:00Z" },
      { activity_precision: "uncertain", interval_started_at: "2026-09-22T02:00:00Z", observed_at: "2026-09-24T02:00:00Z" },
    ],
  }, { range: "week", today: "2026-09-24" });

  assert.deepEqual(result.period, {
    range: "week", label: "This week", startDay: "2026-09-21", endDay: "2026-09-27",
    throughDay: "2026-09-24", isIncomplete: true,
  });
  assert.deepEqual(result.summary, {
    playtimeMinutes: 275,
    reliablePlaytimeMinutes: 90,
    uncertainPlaytimeMinutes: 185,
    unallocatedPlaytimeMinutes: 45,
    gamesPlayed: 2,
    achievementsUnlocked: 1,
    preciseActiveDays: 1,
    preciseDailyAverageMinutes: 90,
  });
  assert.deepEqual(result.dailyBars, [{ day: "2026-09-21", playtimeMinutes: 90, achievementsUnlocked: 1 }]);
  assert.deepEqual(result.mostPlayed.map((game) => [game.name, game.playtimeMinutes]), [
    ["Contained game", 185], ["Daily game", 90],
  ]);
  assert.equal(result.mostPlayed[0].uncertainPlaytimeMinutes, 185);
  assert.equal(result.firstObservedPlays.length, 1);
  assert.equal(result.reliableReturns[0].daysSincePrevious, 10);
  assert.equal(result.unallocatedOverlap.playtimeMinutes, 45);
  assert.equal(result.coverage.patternClaimsAvailable, false);
});

test("Activity Insights supports month, year and all-time boundaries without inventing daily precision", () => {
  const observations = [
    { activity_day: "2026-09-24", activity_precision: "daily", steam_app_id: "today", game_name: "Today", playtime_delta_minutes: 30 },
    { activity_day: "2026-08-15", activity_precision: "daily", steam_app_id: "year", game_name: "Year", playtime_delta_minutes: 60 },
    { activity_day: "2025-12-31", activity_precision: "daily", steam_app_id: "old", game_name: "Old", playtime_delta_minutes: 120 },
    { activity_precision: "uncertain", steam_app_id: "uncertain", game_name: "Uncertain", playtime_delta_minutes: 45, interval_started_at: "2026-08-01T02:00:00Z", observed_at: "2026-08-04T02:00:00Z" },
  ];
  const month = groupSteamActivityInsights({ observations }, { range: "month", today: "2026-09-24" });
  const year = groupSteamActivityInsights({ observations }, { range: "year", today: "2026-09-24" });
  const all = groupSteamActivityInsights({ observations }, { range: "all", today: "2026-09-24" });

  assert.equal(month.period.startDay, "2026-09-01");
  assert.equal(month.period.isIncomplete, true);
  assert.equal(month.summary.playtimeMinutes, 30);
  assert.equal(year.period.startDay, "2026-01-01");
  assert.equal(year.summary.playtimeMinutes, 135);
  assert.equal(year.summary.preciseActiveDays, 2);
  assert.equal(year.dailyBars.length, 2);
  assert.equal(all.summary.playtimeMinutes, 255);
  assert.equal(all.summary.preciseActiveDays, 3);
  assert.equal(all.uncertainIntervals[0].playtimeMinutes, 45);
});

test("Activity and Insights agree on all-time ledger totals and canonical event days", () => {
  const ledger = {
    observations: [
      { activity_day: "2026-09-18", activity_precision: "daily", steam_app_id: "10", game_name: "Night game", playtime_delta_minutes: 90 },
      { activity_precision: "uncertain", steam_app_id: "20", game_name: "Gap game", playtime_delta_minutes: 185, interval_started_at: "2026-09-19T02:00:00Z", observed_at: "2026-09-22T02:00:00Z" },
    ],
    achievements: [
      { id: 1, activity_day: "2026-09-18", steam_app_id: "10", game_name: "Night game", display_name: "After midnight" },
    ],
  };
  const activity = groupSteamActivityHistory(ledger, { range: "all", today: "2026-09-24" });
  const insights = groupSteamActivityInsights(ledger, { range: "all", today: "2026-09-24" });

  assert.equal(insights.summary.playtimeMinutes, activity.summary.playtimeMinutes);
  assert.equal(insights.summary.gamesPlayed, activity.summary.gamesPlayed);
  assert.equal(insights.summary.achievementsUnlocked, activity.summary.achievementsUnlocked);
  assert.equal(insights.dailyBars[0].day, activity.items.find((item) => item.type === "day").date);
  assert.equal(insights.dailyBars[0].achievementsUnlocked, 1);
  assert.equal(insights.summary.preciseActiveDays, 1);
});

test("a trailing missed closeout remains incomplete across Activity and every Insights range", () => {
  const coverageRows = [
    { activity_precision: "baseline", observed_at: "2026-09-18T02:00:00Z" },
    { activity_precision: "daily", activity_day: "2026-09-18", observed_at: "2026-09-19T02:00:00Z" },
    { activity_precision: "daily", activity_day: "2026-09-19", observed_at: "2026-09-20T02:00:00Z" },
  ];
  for (const range of ["7d", "30d", "all"]) {
    const result = groupSteamActivityHistory({ coverageRows }, { range, today: "2026-09-24" });
    assert.equal(result.coverage.status, "partial", range);
    assert.equal(result.coverage.trailingMissingCloseouts, 4, range);
    assert.equal(result.coverage.missingCloseouts, 4, range);
    assert.equal(result.coverage.closedThroughDay, "2026-09-19", range);
  }
  for (const range of ["week", "month", "year", "all"]) {
    const result = groupSteamActivityInsights({ coverageRows }, { range, today: "2026-09-24" });
    assert.equal(result.coverage.status, "partial", range);
    assert.equal(result.coverage.trailingMissingCloseouts, 4, range);
    assert.ok(result.coverage.missingCloseouts > 0, range);
  }
});

test("midnight new-game observations, achievements and first play stay on the 25 September activity day", () => {
  const ledger = {
    observations: [{
      activity_day: "2026-09-25", activity_precision: "daily", steam_app_id: "new",
      game_name: "Midnight game", playtime_delta_minutes: 240,
      interval_started_at: "2026-09-25T02:00:00Z", observed_at: "2026-09-26T02:00:00Z",
    }],
    achievements: [{
      id: 1, activity_day: "2026-09-25", unlock_at: "2026-09-25T23:00:00Z",
      steam_app_id: "new", game_name: "Midnight game", display_name: "Two AM unlock",
    }],
    highlights: [
      { event_type: "steam_first_played", steam_app_id: "new", game_name: "Midnight game", payload_json: { activityDay: "2026-09-25", activityPrecision: "daily" } },
      { event_type: "steam_added_to_library", steam_app_id: "new", game_name: "Midnight game", payload_json: { activityDay: "2026-09-25", activityPrecision: "daily" } },
    ],
    coverageRows: [
      { activity_precision: "baseline", observed_at: "2026-09-25T02:00:00Z" },
      { activity_precision: "daily", activity_day: "2026-09-25", observed_at: "2026-09-26T02:00:00Z" },
    ],
  };
  const activity = groupSteamActivityHistory(ledger, { range: "7d", today: "2026-09-26" });
  const insights = groupSteamActivityInsights(ledger, { range: "week", today: "2026-09-26" });

  assert.deepEqual(activity.items.filter((item) => item.type === "day").map((item) => item.date), ["2026-09-25"]);
  assert.equal(activity.summary.playtimeMinutes, 240);
  assert.equal(activity.summary.achievementsUnlocked, 1);
  assert.deepEqual(activity.items[0].games[0].highlights.map((item) => item.type), ["first_played", "added_to_library"]);
  assert.deepEqual(insights.dailyBars, [{ day: "2026-09-25", playtimeMinutes: 240, achievementsUnlocked: 1 }]);
  assert.equal(new Date(`${insights.dailyBars[0].day}T00:00:00Z`).getUTCDay(), 5);
  assert.equal(insights.firstObservedPlays[0].activityDay, "2026-09-25");
  assert.equal(insights.summary.playtimeMinutes, activity.summary.playtimeMinutes);
  assert.equal(activity.items.some((item) => item.date === "2026-09-26"), false);
});

test("Steam activity feed keeps normal days, exact events and uncertain intervals distinct", () => {
  const normal = {
    id: 2, activity_day: "2026-09-23", activity_precision: "daily",
    steam_app_id: "20", game_name: "A very long Celeste title", cover_url: null,
    playtime_delta_minutes: 90, observed_at: "2026-09-24T02:00:00.000Z",
    interval_started_at: "2026-09-23T02:00:00.000Z", game_id: 5,
  };
  const uncertain = {
    id: 1, activity_day: null, activity_precision: "uncertain", steam_app_id: "10",
    game_name: "Hades", playtime_delta_minutes: 185,
    observed_at: "2026-09-22T02:00:00.000Z", interval_started_at: "2026-09-19T02:00:00.000Z",
    game_id: null,
  };
  const result = groupSteamActivityHistory({
    observations: [normal, uncertain],
    achievements: [
      { id: 7, activity_day: "2026-09-23", steam_app_id: "20", game_name: normal.game_name, display_name: "Cliffhanger", game_id: 5 },
      { id: 8, activity_day: "2026-09-21", steam_app_id: "10", game_name: "Hades", display_name: "After midnight" },
    ],
    highlights: [
      { event_type: "steam_first_played", steam_app_id: "20", game_name: normal.game_name, game_id: 5, payload_json: { activityDay: "2026-09-23", activityPrecision: "daily" } },
      { event_type: "steam_added_to_library", steam_app_id: "20", game_name: normal.game_name, game_id: 5, payload_json: { activityDay: "2026-09-23", activityPrecision: "daily" } },
      { event_type: "steam_returned", steam_app_id: "10", game_name: "Hades", payload_json: { activityDay: "2026-09-21", activityPrecision: "daily", daysSincePrevious: 46 } },
    ],
    coverageRows: [
      normal,
      uncertain,
      { ...normal, sync_run_id: 3, activity_day: "2026-09-22", observed_at: "2026-09-23T02:00:00.000Z" },
    ],
  }, { range: "all", today: "2026-09-24" });

  assert.deepEqual(result.summary, {
    playtimeMinutes: 275, overlappingPlaytimeMinutes: 0, gamesPlayed: 2, achievementsUnlocked: 2,
  });
  assert.equal(result.coverage.status, "partial");
  assert.equal(result.coverage.reliableDays, 2);
  assert.equal(result.coverage.uncertainIntervals, 1);
  assert.equal(result.items[0].date, "2026-09-23");
  assert.deepEqual(result.items[0].games[0].highlights.map((item) => item.type), ["first_played", "added_to_library"]);
  assert.equal(result.items.find((item) => item.type === "uncertain").playtimeMinutes, 185);
  assert.equal(result.items.find((item) => item.date === "2026-09-21").games[0].achievements[0].name, "After midnight");
  assert.equal(result.items.find((item) => item.date === "2026-09-21").games[0].highlights[0].daysSincePrevious, 46);
});

test("Steam activity feed applies 7-day, 30-day and All boundaries without allocating crossing intervals", () => {
  const observations = [
    { activity_day: "2026-09-24", activity_precision: "daily", steam_app_id: "new", game_name: "New", playtime_delta_minutes: 30 },
    { activity_day: "2026-09-10", activity_precision: "daily", steam_app_id: "month", game_name: "Month", playtime_delta_minutes: 60 },
    { activity_day: "2026-08-01", activity_precision: "daily", steam_app_id: "old", game_name: "Old", playtime_delta_minutes: 120 },
    { activity_precision: "uncertain", steam_app_id: "crossing", game_name: "Crossing", playtime_delta_minutes: 45, interval_started_at: "2026-09-15T02:00:00Z", observed_at: "2026-09-20T02:00:00Z" },
  ];
  const seven = groupSteamActivityHistory({ observations }, { range: "7d", today: "2026-09-24" });
  const thirty = groupSteamActivityHistory({ observations }, { range: "30d", today: "2026-09-24" });
  const all = groupSteamActivityHistory({ observations }, { range: "all", today: "2026-09-24" });
  assert.equal(seven.rangeStart, "2026-09-18");
  assert.equal(seven.summary.playtimeMinutes, 30);
  assert.equal(seven.summary.overlappingPlaytimeMinutes, 45);
  assert.equal(thirty.summary.playtimeMinutes, 135);
  assert.equal(all.summary.playtimeMinutes, 255);
  assert.deepEqual(all.items.filter((item) => item.type === "day").map((item) => item.date), ["2026-09-24", "2026-09-10", "2026-08-01"]);
});

test("Steam observations persist the provider snapshot boundary and update saved activity-day evidence", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (calls.length === 1) {
        return {
          rows: [{
            id: 9,
            is_baseline: false,
            activity_precision: "daily",
            activity_day: "2026-09-18",
            account_id: 3,
            steam_app_id: "10",
            game_id: 5,
            catalog_game_id: 6,
            observed_at: "2026-09-19T02:03:00.000Z",
            interval_started_at: "2026-09-18T02:03:00.000Z",
            counter_rebaseline: false,
            playtime_delta_minutes: 90,
            achievements_delta: 0,
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const result = await recordSteamActivityObservations(
    {
      userId: 7,
      syncRunId: 42,
      snapshotObservedAt: "2026-09-19T02:03:00.000Z",
    },
    client,
  );

  assert.deepEqual(result, {
    recorded: 1,
    baselines: 0,
    daily: 1,
    uncertain: 0,
    counterRebaselines: 0,
    activityChanged: 1,
  });
  assert.equal(calls[0].values[2], "2026-09-19T02:03:00.000Z");
  assert.match(calls[0].text, /\$3::timestamptz, 'snapshot'/);
  assert.match(calls[0].text, /previous_job\.account_id = s\.account_id/);
  assert.match(calls[0].text, /ON CONFLICT \(sync_run_id, steam_app_id\) DO NOTHING/);
  assert.match(calls[1].text, /first_play_activity_day = observation\.activity_day/);
  assert.match(calls[2].text, /'\{activityDay\}'/);
});

test("Steam observations reject a missing factual snapshot boundary", async () => {
  await assert.rejects(
    recordSteamActivityObservations({ userId: 7, syncRunId: 42 }, { query() {} }),
    /valid Steam snapshot observation time/,
  );
});
