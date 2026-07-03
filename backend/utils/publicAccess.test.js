import test from "node:test";
import assert from "node:assert/strict";
import { listPublicGamesQuery } from "./publicAccess.js";

function compact(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

test("public game list query scopes by user and omits private Steam tables", () => {
  const query = listPublicGamesQuery(7);
  const sql = compact(query.text).toLowerCase();

  assert.match(sql, /where g\.user_id = \$1/);
  assert.deepEqual(query.values, [7]);
  assert.equal(sql.includes("user_game_sources"), false);
  assert.equal(sql.includes("steam_import_candidates"), false);
  assert.equal(sql.includes("steam_achievements"), false);
  assert.equal(sql.includes("achievements_"), false);
});
