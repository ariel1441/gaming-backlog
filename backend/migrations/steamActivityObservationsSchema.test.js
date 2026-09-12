import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migration = fs.readFileSync(path.join(root, "migrations", "036_add_steam_activity_observations.sql"), "utf8");
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
