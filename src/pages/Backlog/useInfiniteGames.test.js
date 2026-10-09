import test from "node:test";
import assert from "node:assert/strict";
import { appendGamesPage, assembleRefreshedGames } from "./useInfiniteGames.js";

const current = {
  games: [{ id: 1 }],
  total: 3,
  snapshotVersion: "2026-09-21T08:00:00.000Z",
};

test("infinite Backlog pages append a coherent saved snapshot", () => {
  assert.deepEqual(appendGamesPage(current, {
    games: [{ id: 2 }],
    total: 3,
    snapshotVersion: "2026-09-21T08:00:00.000Z",
  }), {
    games: [{ id: 1 }, { id: 2 }],
    hasMore: true,
  });
});

test("infinite Backlog pages reject revisions and duplicate games", () => {
  assert.throws(() => appendGamesPage(current, {
    games: [{ id: 2 }], total: 3, snapshotVersion: "2026-09-21T08:01:00.000Z",
  }), (error) => error.code === "backlog_revision_changed");
  assert.throws(() => appendGamesPage(current, {
    games: [{ id: 1 }], total: 3, snapshotVersion: "2026-09-21T08:00:00.000Z",
  }), /duplicate games/i);
});


test("refresh stages a changed snapshot without shrinking the visible collection", async () => {
  const previous = { ...current, saved: true, games: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  let finishPage;
  const result = assembleRefreshedGames(previous, {
    games: [{ id: 3 }], total: 3, snapshotVersion: "new",
  }, (offset) => {
    assert.equal(offset, 1);
    return new Promise((resolve) => { finishPage = resolve; });
  }, true);
  assert.deepEqual(previous.games.map((game) => game.id), [1, 2, 3]);
  finishPage({ games: [{ id: 1 }, { id: 2 }], total: 3, snapshotVersion: "new" });
  assert.deepEqual((await result).map((game) => game.id), [3, 1, 2]);
});

test("refresh rejects a changed revision or failed page and preserves the previous snapshot", async () => {
  const previous = { ...current, saved: true, games: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  const first = { games: [{ id: 3 }], total: 3, snapshotVersion: "new" };
  await assert.rejects(assembleRefreshedGames(previous, first, async () => ({
    games: [{ id: 2 }], total: 3, snapshotVersion: "newer",
  }), true), (error) => error.code === "backlog_revision_changed");
  await assert.rejects(assembleRefreshedGames(previous, first, async () => {
    throw new Error("offline");
  }, true), /offline/);
  assert.deepEqual(previous.games.map((game) => game.id), [1, 2, 3]);
});
