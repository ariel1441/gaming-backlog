import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteOwnedGameQuery,
  listOwnedGamesQuery,
  listOwnedGameTitlesQuery,
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

test("owned status update requires id and user_id", () => {
  const query = updateOwnedGameStatusQuery(12, 7, "finished", true);
  assert.match(compact(query.text), /WHERE id = \$1 AND user_id = \$2/);
  assert.match(compact(query.text), /DELETE FROM user_next_up_games/);
  assert.deepEqual(query.values, [12, 7, "finished", true]);
});
