import test from "node:test";
import assert from "node:assert/strict";
import { steamOwnedSelect, decorateGameWithCatalog, metadataStaleMs } from "./catalogService.js";
import { resolveWishlistEstimate } from "./steamWishlistService.js";

test("weekly catalog freshness and fallback estimates preserve saved and local HLTB hours", () => {
  assert.equal(metadataStaleMs({ released_at: '2010-01-01' }), 7 * 86400_000);
  const linked = { catalog_game_id: 1, catalog_rawg_playtime_hours: 12 };
  assert.equal(decorateGameWithCatalog(linked).estimateSource, 'rawg_playtime');
  const saved = decorateGameWithCatalog({ ...linked, how_long_to_beat: 27 });
  assert.equal(saved.how_long_to_beat, 27);
  assert.equal(saved.estimateSource, "saved");
  assert.deepEqual(resolveWishlistEstimate({ catalog_playtime_hours: 12 }, 'Game', {}), { hours: 12, source: 'rawg_playtime' });
  assert.deepEqual(resolveWishlistEstimate({ catalog_playtime_hours: 12 }, 'Game', { game: { main: 20 } }), { hours: 20, source: 'hltb_local' });
  assert.deepEqual(resolveWishlistEstimate({ game_hltb_hours: 27, catalog_playtime_hours: 12 }, 'Game', { game: { main: 20 } }), { hours: 27, source: 'saved' });
});

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
