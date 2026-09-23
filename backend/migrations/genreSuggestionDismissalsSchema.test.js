import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migration = fs.readFileSync(
  path.join(root, "backend/migrations/048_add_game_genre_suggestion_dismissals.sql"),
  "utf8",
);
const schema = fs.readFileSync(path.join(root, "backend/schema.sql"), "utf8");

test("genre suggestion dismissals are owner-scoped and cascade with games and genres", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?game_genre_suggestion_dismissals/);
    assert.match(sql, /PRIMARY KEY \(game_id, personal_genre_id\)/);
    assert.match(sql, /REFERENCES games\(user_id, id\) ON DELETE CASCADE/);
    assert.match(sql, /REFERENCES user_personal_genres\(user_id, id\) ON DELETE CASCADE/);
  }
  assert.doesNotMatch(migration, /INSERT INTO game_genre_suggestion_dismissals/);
});
