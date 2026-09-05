import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migration = fs.readFileSync(path.join(root, "migrations", "030_add_steam_wishlist.sql"), "utf8");
const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");

for (const [label, sql] of [["migration", migration], ["schema", schema]]) {
  test(`${label} defines private Steam wishlist persistence`, () => {
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? user_wishlist_items/i);
    assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? steam_wishlist_items/i);
    assert.match(sql, /steam_app_id TEXT NOT NULL/i);
    assert.match(sql, /removed_at TIMESTAMPTZ/i);
    assert.match(sql, /release_date DATE/i);
    assert.match(sql, /tags_json JSONB NOT NULL DEFAULT '\[\]'::jsonb/i);
    assert.match(sql, /wishlist_sync_status[\s\S]*partial/i);
    assert.match(sql, /show_wishlist_in_backlog BOOLEAN NOT NULL DEFAULT FALSE/i);
    assert.match(sql, /sync_kind[\s\S]*wishlist/i);
    assert.match(sql, /steam_wishlist_items_owner_guard/i);
  });
}

test("migration conditionally backfills legacy wishlist intent without deleting games", () => {
  assert.match(migration, /LOWER\(TRIM\(g\.status\)\) = 'wishlist'/i);
  assert.match(migration, /local_intent_source[\s\S]*legacy_status/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+games/i);
});
