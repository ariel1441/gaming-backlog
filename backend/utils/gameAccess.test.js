import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteOwnedGameQuery,
  listOwnedGamesPageQuery,
  listOwnedGamesQuery,
  listOwnedGameTitlesQuery,
  lookupOwnedGamesQuery,
  ownedGamesFacetsQuery,
  selectOwnedGameDetailsQuery,
  selectOwnedGameQuery,
  updateOwnedGameStatusQuery,
} from "./gameAccess.js";

function compact(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

test("owned game list query scopes rows to user_id", () => {
  const query = listOwnedGamesQuery(7);
  assert.match(compact(query.text), /WHERE g\.user_id = \$1/);
  assert.deepEqual(query.values, [7]);
});

test("owned game list query picks one steam source per game", () => {
  const query = compact(listOwnedGamesQuery(7).text);
  assert.match(query, /LEFT JOIN LATERAL/);
  assert.match(query, /LIMIT 1/);
  assert.match(query, /playtime_minutes_forever IS NOT NULL/);
  assert.match(query, /steam_last_played_at/);
});

test("owned game list keeps Steam fields private-route only", () => {
  const query = compact(listOwnedGamesQuery(7).text);
  assert.match(query, /steam_achievements_status/);
  assert.match(query, /user_game_sources/);
  assert.match(query, /source\.user_id = g\.user_id/);
});

test("owned game page query keeps filters parameterized and user scoped", () => {
  const query = listOwnedGamesPageQuery(7, {
    query: "alpha",
    status: ["playing"],
    genre: ["RPG"],
    personalGenre: ["Cozy"],
    minHours: 3,
    sort: "name",
    direction: "desc",
    limit: 25,
    offset: 50,
  });
  const sql = compact(query.text);
  assert.match(sql, /WHERE g\.user_id = \$1/);
  assert.match(sql, /ILIKE \$2/);
  assert.match(sql, /AS total_count/);
  assert.match(sql, /hashtextextended/);
  assert.match(sql, /hours_preferred_source = 'steam_actual'/);
  assert.match(sql, /FROM filtered backlog/);
  assert.match(sql, /LIMIT \$7 OFFSET \$8/);
  assert.deepEqual(query.values, [7, "%alpha%", ["playing"], ["rpg"], ["cozy"], 3, 25, 50]);
});

test("owned game facets use the same user-scoped collection", () => {
  const query = ownedGamesFacetsQuery(7);
  const sql = compact(query.text);
  assert.match(sql, /WHERE g\.user_id = \$1/);
  assert.match(sql, /COUNT\(\*\)::int AS collection_total/);
  assert.match(sql, /jsonb_array_elements_text/);
  assert.deepEqual(query.values, [7]);
});

test("minimal game lookup is owner scoped, excludes legacy wishlist rows, and parameterizes filters", () => {
  const query = lookupOwnedGamesQuery(7, {
    query: "alpha",
    gameId: 12,
    limit: 75,
  });
  const sql = compact(query.text);
  assert.match(sql, /g\.user_id = \$1/);
  assert.match(sql, /LOWER\(TRIM\(g\.status\)\) <> 'wishlist'/);
  assert.match(sql, /g\.id = \$2/);
  assert.match(sql, /g\.name ILIKE \$3/);
  assert.match(sql, /LIMIT \$4/);
  assert.deepEqual(query.values, [7, 12, "%alpha%", 50]);
});

test("owned game reads expose user-scoped Play Next focus roles", () => {
  for (const query of [
    listOwnedGamesQuery(7),
    selectOwnedGameDetailsQuery(12, 7),
  ]) {
    const sql = compact(query.text);
    assert.match(sql, /LEFT JOIN user_play_focus_games focus/);
    assert.match(sql, /focus\.user_id = g\.user_id/);
    assert.match(sql, /focus\.game_id = g\.id/);
    assert.match(sql, /focus\.focus_role/);
  }
});

test("owned game detail query preserves Steam metadata for mutation responses", () => {
  const query = selectOwnedGameDetailsQuery(12, 7);
  const sql = compact(query.text);
  assert.match(sql, /WHERE g\.id = \$1 AND g\.user_id = \$2/);
  assert.match(sql, /LEFT JOIN LATERAL/);
  assert.match(sql, /steam_owned/);
  assert.match(sql, /steam_achievements_status/);
  assert.deepEqual(query.values, [12, 7]);
});

test("duplicate title query scopes candidate rows to user_id", () => {
  const query = listOwnedGameTitlesQuery(7);
  assert.match(compact(query.text), /WHERE user_id = \$1/);
  assert.deepEqual(query.values, [7]);
});

test("owned game selection requires id and user_id", () => {
  const query = selectOwnedGameQuery(12, 7, "id, status");
  assert.match(compact(query.text), /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(query.values, [12, 7]);
});

test("owned delete requires id and user_id", () => {
  const query = deleteOwnedGameQuery(12, 7);
  assert.match(compact(query.text), /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(query.values, [12, 7]);
});

test("owned status update requires id and user_id and can clear private planning relationships", () => {
  const query = updateOwnedGameStatusQuery(12, 7, "finished", true, true);
  assert.match(compact(query.text), /WHERE id = \$1 AND user_id = \$2/);
  assert.match(compact(query.text), /DELETE FROM user_next_up_games/);
  assert.match(compact(query.text), /DELETE FROM user_play_focus_games/);
  assert.deepEqual(query.values, [12, 7, "finished", true, true]);
});
