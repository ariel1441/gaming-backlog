import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migration = fs.readFileSync(path.join(root, "migrations", "036_add_steam_activity_observations.sql"), "utf8");
const foundationMigration = fs.readFileSync(path.join(root, "migrations", "049_add_activity_foundation.sql"), "utf8");
const detailedEventsMigration = fs.readFileSync(path.join(root, "migrations", "050_add_detailed_activity_events.sql"), "utf8");
const allocationMigration = fs.readFileSync(path.join(root, "migrations", "051_add_steam_activity_allocations.sql"), "utf8");
const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");

for (const [label, sql] of [["migration", migration], ["schema", schema]]) {
  test(`${label} defines private Steam activity observations`, () => {
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? steam_activity_observations/i);
    assert.match(sql, /UNIQUE \(sync_run_id, steam_app_id\)/i);
    assert.match(sql, /playtime_delta_minutes INTEGER NOT NULL DEFAULT 0/i);
    assert.match(sql, /achievements_delta INTEGER NOT NULL DEFAULT 0/i);
    assert.match(sql, /steam_activity_observations_owner_guard/i);
  });
}

for (const [label, sql] of [["allocation migration", allocationMigration], ["schema", schema]]) {
  test(`${label} defines auditable owner-scoped Steam activity allocations`, () => {
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? steam_activity_allocation_revisions/i);
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? steam_activity_allocation_items/i);
    assert.match(sql, /action IN \('allocate', 'reset'\)/i);
    assert.match(sql, /UNIQUE \(observation_id, revision\)/i);
    assert.match(sql, /enforce_steam_activity_allocation_owner/i);
  });
}

for (const [label, sql] of [["detailed events migration", detailedEventsMigration], ["schema", schema]]) {
  test(`${label} defines account-fenced named Steam achievement unlocks`, () => {
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? steam_achievement_unlocks/i);
    assert.match(sql, /UNIQUE \(account_id, steam_app_id, achievement_api_name\)/i);
    assert.match(sql, /unlock_at TIMESTAMPTZ/i);
    assert.match(sql, /CHECK \(\(unlock_at IS NULL\) = \(activity_day IS NULL\)\)/i);
    assert.match(sql, /achievement_events_initialized_at/i);
    assert.match(sql, /achievement_events_baseline_at/i);
    assert.match(sql, /enforce_steam_achievement_unlock_owner/i);
    assert.match(sql, /daily_automation_runs_idempotency/i);
  });
}

for (const [label, sql] of [["foundation migration", foundationMigration], ["schema", schema]]) {
  test(`${label} defines explicit Steam activity precision and provenance`, () => {
    assert.match(sql, /gaming_activity_day/i);
    assert.match(sql, /observation_time_source/i);
    assert.match(sql, /activity_precision/i);
    assert.match(sql, /activity_day DATE/i);
    assert.match(sql, /counter_rebaseline/i);
    assert.match(sql, /first_play_activity_day/i);
  });
}
