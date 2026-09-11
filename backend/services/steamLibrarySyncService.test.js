import test from "node:test";
import assert from "node:assert/strict";
import {
  diffSteamLibrarySnapshot,
  hasSuccessfulSteamBaseline,
} from "./steamLibrarySyncService.js";

test("Steam library diff isolates new and activity-changed apps", () => {
  const sources = [
    {
      id: 1,
      provider_app_id: "10",
      source_status: "owned",
      playtime_minutes_forever: 60,
      last_played_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: 2,
      provider_app_id: "20",
      source_status: "ignored",
      playtime_minutes_forever: 0,
      last_played_at: null,
    },
    {
      id: 3,
      provider_app_id: "30",
      source_status: "disconnected",
      playtime_minutes_forever: 20,
      last_played_at: null,
    },
  ];
  const diff = diffSteamLibrarySnapshot(
    [
      { appid: "10", name: "Same", playtimeMinutes: 60, lastPlayedAt: "2026-08-01T00:00:00.000Z" },
      { appid: "20", name: "Ignored changed", playtimeMinutes: 15, lastPlayedAt: "2026-09-01T00:00:00.000Z" },
      { appid: "30", name: "Relinked", playtimeMinutes: 20, lastPlayedAt: null },
      { appid: "40", name: "New", playtimeMinutes: 0, lastPlayedAt: null },
    ],
    sources,
  );

  assert.equal(diff.itemsSeen, 4);
  assert.deepEqual(diff.unchangedAppIds, ["10"]);
  assert.equal(diff.newGames, 2);
  assert.equal(diff.activityChanged, 1);
  assert.deepEqual(
    diff.workItems.map((item) => [item.app.appid, item.kind]),
    [
      ["20", "playtime_changed"],
      ["30", "new"],
      ["40", "new"],
    ],
  );
});

test("Steam baseline requires a successful timestamp and an active source", () => {
  const account = { last_library_sync_at: "2026-09-01T00:00:00.000Z" };
  assert.equal(hasSuccessfulSteamBaseline(account, []), false);
  assert.equal(
    hasSuccessfulSteamBaseline(account, [
      { provider_app_id: "1", source_status: "disconnected" },
    ]),
    false,
  );
  assert.equal(
    hasSuccessfulSteamBaseline(account, [
      { provider_app_id: "1", source_status: "ignored" },
    ]),
    true,
  );
  assert.equal(
    hasSuccessfulSteamBaseline(
      { last_library_sync_at: null },
      [{ provider_app_id: "1", source_status: "owned" }],
    ),
    false,
  );
});

test("Steam playtime corrections persist without becoming new activity", () => {
  const diff = diffSteamLibrarySnapshot(
    [
      {
        appid: "10",
        name: "Corrected",
        playtimeMinutes: 45,
        lastPlayedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    [
      {
        provider_app_id: "10",
        source_status: "owned",
        playtime_minutes_forever: 60,
        last_played_at: "2026-08-01T00:00:00.000Z",
      },
    ],
  );

  assert.equal(diff.workItems.length, 1);
  assert.equal(diff.workItems[0].kind, "playtime_changed");
  assert.equal(diff.workItems[0].activityChanged, false);
  assert.equal(diff.activityChanged, 0);
});
