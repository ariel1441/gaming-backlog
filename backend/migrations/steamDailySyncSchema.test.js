import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migration = fs.readFileSync(
  path.join(root, "migrations", "028_add_steam_daily_sync_foundation.sql"),
  "utf8",
);
const leaseMigration = fs.readFileSync(
  path.join(root, "migrations", "029_add_steam_sync_job_lease_token.sql"),
  "utf8",
);
const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");

for (const [label, sql] of [["migration", migration], ["schema", schema]]) {
  test(`${label} defines Steam daily sync runs, activity, and opt-in`, () => {
    assert.match(sql, /auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE/i);
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? integration_sync_runs/i);
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? user_activity_events/i);
    assert.match(sql, /steam_sync_jobs[\s\S]*sync_run_id/i);
    assert.match(sql, /user_activity_events_open_dedupe[\s\S]*WHERE state = 'open'/i);
    assert.match(sql, /user_activity_events_owner_guard/i);
  });
}

for (const [label, sql] of [
  ["lease migration", leaseMigration],
  ["schema", schema],
]) {
  test(`${label} defines Steam sync claim fencing`, () => {
    assert.match(sql, /steam_sync_jobs[\s\S]*lease_token UUID/i);
  });
}
