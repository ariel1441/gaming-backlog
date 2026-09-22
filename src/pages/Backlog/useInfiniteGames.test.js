import test from "node:test";
import assert from "node:assert/strict";
import { appendGamesPage } from "./useInfiniteGames.js";

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
