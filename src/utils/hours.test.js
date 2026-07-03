import test from "node:test";
import assert from "node:assert/strict";
import { resolveGameHours } from "./hours.js";

test("resolveGameHours keeps auto Steam policy for finished-style statuses", () => {
  assert.equal(
    resolveGameHours({
      status: "finished",
      how_long_to_beat: 12,
      steamPlaytimeHours: 20,
    }).source,
    "steam"
  );

  assert.equal(
    resolveGameHours({
      status: "plan to play",
      how_long_to_beat: 12,
      steamPlaytimeHours: 1,
    }).source,
    "estimate"
  );
});

test("resolveGameHours honors explicit source preference and lock labels", () => {
  const estimate = resolveGameHours({
    status: "finished",
    how_long_to_beat: 12,
    steamPlaytimeHours: 20,
    hours_preferred_source: "estimate",
    hours_locked: true,
  });
  assert.equal(estimate.source, "estimate");
  assert.equal(estimate.sourceLabel, "Locked estimate");
  assert.equal(estimate.secondarySteamHours, 20);

  const steam = resolveGameHours({
    status: "plan to play",
    how_long_to_beat: 12,
    steamPlaytimeHours: 20,
    hours_preferred_source: "steam_actual",
    hours_locked: true,
  });
  assert.equal(steam.source, "steam");
  assert.equal(steam.sourceLabel, "Locked Steam actual");
});
