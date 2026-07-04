import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTimelineEvents,
  filterTimelineEvents,
  formatTimelineGroupSummary,
  groupTimelineEvents,
  summarizeTimeline,
} from "./gameTimeline.js";

test("buildTimelineEvents creates started and finished events from valid dates", () => {
  const events = buildTimelineEvents([
    {
      id: 1,
      name: "Hades",
      started_at: "2026-04-01",
      finished_at: "2026-04-05",
    },
  ]);

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.type),
    ["finished", "started"]
  );
});

test("buildTimelineEvents ignores missing and invalid dates", () => {
  const events = buildTimelineEvents([
    { id: 1, name: "Invalid", started_at: "soon", finished_at: "" },
    { id: 2, name: "Valid", started_at: null, finished_at: "2026-03-01" },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Valid");
  assert.equal(events[0].type, "finished");
});

test("buildTimelineEvents sorts newest first", () => {
  const events = buildTimelineEvents([
    { id: 1, name: "Older", started_at: "2025-12-31" },
    { id: 2, name: "Newer", finished_at: "2026-01-01" },
  ]);

  assert.deepEqual(
    events.map((event) => event.title),
    ["Newer", "Older"]
  );
});

test("groupTimelineEvents groups events by month and year", () => {
  const events = buildTimelineEvents([
    { id: 1, name: "April", started_at: "2026-04-10" },
    { id: 2, name: "Also April", finished_at: "2026-04-01" },
    { id: 3, name: "March", started_at: "2026-03-10" },
  ]);
  const groups = groupTimelineEvents(events);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "April 2026");
  assert.equal(groups[0].events.length, 2);
  assert.equal(groups[0].started, 1);
  assert.equal(groups[0].finished, 1);
  assert.equal(groups[1].label, "March 2026");
});

test("formatTimelineGroupSummary describes started and finished counts", () => {
  const groups = groupTimelineEvents(
    buildTimelineEvents([
      { id: 1, name: "Started", started_at: "2026-04-10" },
      { id: 2, name: "Finished", finished_at: "2026-04-01" },
    ])
  );

  assert.equal(formatTimelineGroupSummary(groups[0]), "1 started, 1 finished");
});

test("filterTimelineEvents filters by title search, type, year, and date preset", () => {
  const events = buildTimelineEvents([
    { id: 1, name: "Hades", started_at: "2026-04-10" },
    { id: 2, name: "Balatro", finished_at: "2025-12-31" },
    { id: 3, name: "Celeste", finished_at: "2026-01-15" },
  ]);

  assert.deepEqual(
    filterTimelineEvents(events, { search: "had" }).map((event) => event.title),
    ["Hades"]
  );
  assert.deepEqual(
    filterTimelineEvents(events, { eventType: "finished", year: "2026" }).map(
      (event) => event.title
    ),
    ["Celeste"]
  );
  assert.deepEqual(
    filterTimelineEvents(events, {
      datePreset: "last90",
      now: new Date(Date.UTC(2026, 3, 14)),
    }).map((event) => event.title),
    ["Hades", "Celeste"]
  );
});

test("buildTimelineEvents handles same-day started and finished deterministically", () => {
  const events = buildTimelineEvents([
    { id: 1, name: "Same Day", started_at: "2026-04-10", finished_at: "2026-04-10" },
  ]);

  assert.deepEqual(
    events.map((event) => event.type),
    ["finished", "started"]
  );
});

test("summarizeTimeline counts active unfinished games", () => {
  const games = [
    { id: 1, name: "Active", started_at: "2026-04-10", finished_at: null },
    { id: 2, name: "Done", started_at: "2026-04-01", finished_at: "2026-04-02" },
  ];
  const events = buildTimelineEvents(games);

  assert.deepEqual(summarizeTimeline(games, events), {
    total: 3,
    started: 2,
    finished: 1,
    active: 1,
  });
});
