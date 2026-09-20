import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const migration = fs.readFileSync(
  path.join(root, "backend/migrations/024_add_play_next_resume.sql"),
  "utf8",
);
const schema = fs.readFileSync(path.join(root, "backend/schema.sql"), "utf8");
const focusMigration = fs.readFileSync(
  path.join(root, "backend/migrations/044_add_play_focus_roles.sql"),
  "utf8",
);

test("Play Next migration and reset schema enforce private note and owner relationship integrity", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?user_next_up_games/);
    assert.match(sql, /PRIMARY KEY \(user_id, game_id\)/);
    assert.match(sql, /position INTEGER NOT NULL CHECK \(position >= 0\)/);
    assert.match(sql, /user_next_up_games_owner_guard/);
    assert.match(sql, /char_length\(resume_note\) <= 1000/);
    assert.match(sql, /'\/next-up'/);
  }
  assert.doesNotMatch(migration, /INSERT INTO user_next_up_games/);
});

test("Play focus migration and reset schema enforce owner-scoped roles and single slots", () => {
  for (const sql of [focusMigration, schema]) {
    assert.match(sql, /CREATE TABLE (?:IF NOT EXISTS )?user_play_focus_games/);
    assert.match(sql, /focus_role IN \('main', 'side', 'occasional'\)/);
    assert.match(sql, /idx_user_play_focus_single_slot/);
    assert.match(sql, /WHERE focus_role IN \('main', 'side'\)/);
    assert.match(sql, /user_play_focus_games_owner_guard/);
    assert.match(sql, /user_play_focus_games WHERE game_id = OLD\.id/);
  }
  assert.doesNotMatch(focusMigration, /INSERT INTO user_play_focus_games/);
});
