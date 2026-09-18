import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migration = fs.readFileSync(
  path.join(root, "migrations", "042_add_daily_automation_run_audit.sql"),
  "utf8",
);
const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");

for (const [label, sql] of [["migration", migration], ["schema", schema]]) {
  test(`${label} defines durable daily Steam runner audit records`, () => {
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? daily_automation_runs/i);
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? daily_automation_run_accounts/i);
    assert.match(sql, /daily_automation_runs_one_active[\s\S]*status = 'running'/i);
    assert.match(sql, /daily_automation_run_accounts[\s\S]*account_id INTEGER NOT NULL REFERENCES user_external_accounts/i);
    assert.match(sql, /daily_automation_run_id UUID[\s\S]*daily_automation_runs/i);
  });
}
