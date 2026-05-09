import test from "node:test";
import assert from "node:assert/strict";
import {
  computeGameDateInsights,
  parseGameDate,
} from "./gameDateInsights.js";

test("parseGameDate accepts valid SQL date strings only", () => {
  assert.equal(parseGameDate("2024-02-29")?.year, 2024);
  assert.equal(parseGameDate("2024-02-30"), null);
  assert.equal(parseGameDate("not-a-date"), null);
  assert.equal(parseGameDate(null), null);
});

test("computeGameDateInsights summarizes started and finished dates", () => {
  const result = computeGameDateInsights(
    [
      {
        name: "Finished Fast",
        started_at: "2026-01-01",
        finished_at: "2026-01-11",
      },
      {
        name: "Old Active",
        started_at: "2024-05-01",
        finished_at: null,
      },
      {
        name: "New Active",
        started_at: "2026-02-01",
        finished_at: "",
      },
      {
        name: "Finished Earlier",
        started_at: "2023-10-01",
        finished_at: "2024-01-01",
      },
      {
        name: "Invalid Dates",
        started_at: "2026-13-01",
        finished_at: "soon",
      },
    ],
    new Date("2026-05-09T00:00:00Z")
  );

  assert.deepEqual(result.yearly, [
    { year: 2023, started: 1, finished: 0 },
    { year: 2024, started: 1, finished: 1 },
    { year: 2026, started: 2, finished: 1 },
  ]);
  assert.equal(result.startedThisYear, 2);
  assert.equal(result.finishedThisYear, 1);
  assert.equal(result.activeCount, 2);
  assert.equal(result.averageCompletionDays, 51);
  assert.equal(result.completionSampleSize, 2);
  assert.deepEqual(result.oldestActive, {
    name: "Old Active",
    started_at: "2024-05-01",
    year: 2024,
  });
});
