import test from "node:test";
import assert from "node:assert/strict";
import { buildRankReorderRequest } from "./reorder.js";

const games = [
  { id: 1, name: "Done A", status: "finished", status_rank: 12 },
  {
    id: 2,
    name: "Done B",
    status: "played alot but didnt finish",
    status_rank: 12,
  },
  { id: 3, name: "Playing", status: "playing", status_rank: 1 },
];

test("buildRankReorderRequest reorders same-rank games without status payload", () => {
  const request = buildRankReorderRequest(games, 1, 2);

  assert.deepEqual(
    request.newOrder.map((game) => game.id),
    [2, 1, 3]
  );
  assert.equal(request.gameId, 1);
  assert.equal(request.targetIndex, 1);
  assert.equal(Object.hasOwn(request, "status"), false);
});

test("buildRankReorderRequest rejects cross-rank drops", () => {
  assert.equal(buildRankReorderRequest(games, 1, 3), null);
});
