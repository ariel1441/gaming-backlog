import test from "node:test";
import assert from "node:assert/strict";
import { steamOwnedSelect } from "./catalogService.js";

function compact(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

test("discover Steam ownership matches direct, linked-game, and import-candidate catalog identities", () => {
  const sql = compact(steamOwnedSelect(2));
  assert.match(sql, /steam_src\.catalog_game_id = cg\.id/);
  assert.match(sql, /steam_game\.id = steam_src\.game_id/);
  assert.match(sql, /steam_game\.rawg_id/);
  assert.match(sql, /steam_import_candidates steam_candidate/);
  assert.match(sql, /user_selected_catalog_game_id/);
  assert.match(sql, /proposed_catalog_game_id/);
  assert.match(sql, /steam_src\.user_id = \$2/);
});
