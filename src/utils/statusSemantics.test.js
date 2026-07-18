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

test("only Playing is active while should-come-back is returning", () => {
  assert.equal(defaultStatusSemantics.statusGroupOf("playing"), "playing");
  assert.equal(
    defaultStatusSemantics.statusGroupOf("played and should come back"),
    "returning",
  );
  assert.equal(
    defaultStatusSemantics.isReturning("played and should come back"),
    true,
  );
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

test("Playing smart lists do not infer activity from an old start date", () => {
  const games = [
    {
      id: 1,
      status: "played and should come back",
      started_at: "2024-01-01",
    },
    { id: 2, status: "playing", started_at: "2026-01-01" },
  ];
  const playing = resolveSmartList(
    { query: { status: "playing" } },
    games,
  );
  assert.deepEqual(playing.games.map((game) => game.id), [2]);
});
