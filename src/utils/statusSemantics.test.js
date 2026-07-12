import assert from "node:assert/strict";
import test from "node:test";
import { resolveSmartList } from "./automaticLists.js";
import { createStatusSemantics, defaultStatusSemantics } from "./statusSemantics.js";

test("canonical and tolerated done spellings share one semantic group", () => {
  for (const status of [
    "finished",
    "played alot but didnt finish",
    "played a lot but didn't finish",
  ]) {
    assert.equal(defaultStatusSemantics.statusGroupOf(status), "done");
  }
});

test("smart lists honor status metadata instead of hardcoded labels", () => {
  const semantics = createStatusSemantics({
    planned: ["queued"],
    playing: ["active"],
    done: ["archived complete"],
  });
  const games = [
    { id: 1, status: "archived complete" },
    { id: 2, status: "active" },
  ];
  const finished = resolveSmartList(
    { query: { status: "finished" } },
    games,
    { statusGroupOf: semantics.statusGroupOf },
  );
  assert.deepEqual(finished.games.map((game) => game.id), [1]);
});
