import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migration = fs.readFileSync(
  path.join(root, "migrations", "025_add_personal_genres.sql"),
  "utf8",
);
const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");
const compatibilityMigration = fs.readFileSync(
  path.join(root, "migrations", "026_sync_legacy_personal_genres.sql"),
  "utf8",
);

for (const [label, sql] of [["migration", migration], ["schema", schema]]) {
  test(`${label} defines owner-coupled ordered personal genres`, () => {
    assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?user_personal_genres/i);
    assert.match(sql, /UNIQUE \(user_id, normalized_name\)/i);
    assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?game_personal_genres/i);
    assert.match(sql, /FOREIGN KEY \(user_id, game_id\)[\s\S]*REFERENCES games\(user_id, id\)/i);
    assert.match(sql, /FOREIGN KEY \(user_id, personal_genre_id\)[\s\S]*REFERENCES user_personal_genres\(user_id, id\)/i);
    assert.match(sql, /position INTEGER NOT NULL CHECK \(position >= 0 AND position < 10\)/i);
  });
}

test("migration backfills legacy comma-separated genres deterministically", () => {
  assert.match(migration, /regexp_split_to_table\(COALESCE\(g\.my_genre, ''\), ','\)/i);
  assert.match(migration, /WITH ORDINALITY/i);
  assert.match(migration, /DISTINCT ON \(user_id, game_id, normalized_name\)/i);
  assert.match(migration, /ORDER BY membership\.position/i);
});

test("legacy game writes continue to synchronize normalized memberships", () => {
  assert.match(compatibilityMigration, /CREATE TRIGGER games_legacy_personal_genres_sync/i);
  assert.match(compatibilityMigration, /AFTER INSERT OR UPDATE OF my_genre ON games/i);
  assert.match(compatibilityMigration, /DELETE FROM game_personal_genres WHERE game_id = NEW\.id/i);
  assert.match(compatibilityMigration, /ON CONFLICT \(user_id, normalized_name\) DO NOTHING/i);
});
