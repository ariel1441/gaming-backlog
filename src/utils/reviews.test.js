import test from "node:test";
import assert from "node:assert/strict";
import {
  filterReviewGames,
  formatReviewDate,
  hasReview,
  matchesReviewSearch,
} from "./reviews.js";

test("formatReviewDate keeps SQL dates on the intended UTC calendar day", () => {
  assert.equal(formatReviewDate("2026-01-01"), "Jan 1, 2026");
});

test("hasReview trims empty thoughts", () => {
  assert.equal(hasReview({ thoughts: "  " }), false);
  assert.equal(hasReview({ thoughts: "Worth finishing." }), true);
});

test("matchesReviewSearch includes thoughts and genre text", () => {
  const game = {
    name: "Pentiment",
    thoughts: "A patient mystery with sharp writing.",
    my_genre: "Historical",
  };

  assert.equal(matchesReviewSearch(game, "sharp mystery"), true);
  assert.equal(matchesReviewSearch(game, "historical"), true);
  assert.equal(matchesReviewSearch(game, "space"), false);
});

test("filterReviewGames applies done filtering through the supplied status helper", () => {
  const games = [
    { id: 1, name: "Done", status: "finished", thoughts: "Great" },
    { id: 2, name: "Active", status: "playing", thoughts: "Early notes" },
    { id: 3, name: "Blank", status: "finished", thoughts: "" },
  ];
  const isDone = (game) => game.status === "finished";

  assert.deepEqual(
    filterReviewGames({ games, reviewFilter: "completed", isDone }).map(
      (game) => game.name
    ),
    ["Done"]
  );
  assert.deepEqual(
    filterReviewGames({ games, reviewFilter: "notCompleted", isDone }).map(
      (game) => game.name
    ),
    ["Active"]
  );
});
