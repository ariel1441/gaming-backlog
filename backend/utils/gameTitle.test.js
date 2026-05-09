import test from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicateGameTitle,
  isSameGameTitle,
  normalizeGameTitle,
} from "./gameTitle.js";

test("normalizeGameTitle creates stable backend duplicate keys", () => {
  assert.equal(normalizeGameTitle("  Baldur's   Gate 3!! "), "baldurs gate 3");
  assert.equal(normalizeGameTitle("ELDEN-ring"), "elden ring");
});

test("isSameGameTitle matches only exact normalized titles", () => {
  assert.equal(isSameGameTitle("Marvel's Spider-Man", "marvels spider man"), true);
  assert.equal(isSameGameTitle("Hades", "Hades II"), false);
});

test("findDuplicateGameTitle supports excluding the current row", () => {
  const games = [
    { id: 1, name: "Elden Ring" },
    { id: 2, name: "Hades" },
  ];

  assert.equal(findDuplicateGameTitle("elden-ring", games)?.id, 1);
  assert.equal(findDuplicateGameTitle("elden-ring", games, { excludeId: 1 }), null);
});
