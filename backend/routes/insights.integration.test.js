import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { pool } = await import("../db.js");
const { default: insightsRouter, buildInsightsPayload } = await import("./insights.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

test("Insights returns private coverage and ignores process-local RAWG cache", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [
      {
        id: 1,
        name: "Ephemeral Cache Game",
        status: "playing",
        rank: 1,
        how_long_to_beat: null,
        hours_preferred_source: "auto",
        catalog_rawg_playtime_hours: null,
        steam_playtime_minutes: null,
        my_score: 8,
        started_at: "2026-01-01",
        finished_at: null,
        personal_genres: [{ name: "Roguelike" }],
        rawg_genres: [{ name: "Action" }],
      },
    ],
  });

  const app = express();
  app.locals.rawgCache = {
    "ephemeral cache game": { playtime: 99 },
  };
  app.locals.hltb = {};
  app.use("/api/insights", insightsRouter);
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const token = jwt.sign(
      { id: 7001, username: "insights-owner" },
      process.env.JWT_SECRET,
    );
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/insights?year=2026`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.totals.games, 1);
    assert.equal(body.totals.missingEstimates, 1);
    assert.equal(body.coverage.sources.rawg, 0);
    assert.equal(body.games[0].hours, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test("Insights payload keeps total games separate from estimate coverage", () => {
  const payload = buildInsightsPayload([
    { id: 1, name: "Estimated", status: "playing", rank: 1, how_long_to_beat: 12, my_score: 8.5, personal_genres: [], rawg_genres: [] },
    { id: 2, name: "Missing", status: "plan to play", rank: 2, how_long_to_beat: null, personal_genres: [], rawg_genres: [] },
  ], { locals: { hltb: {} } });
  assert.equal(payload.totals.games, 2);
  assert.equal(payload.totals.estimatedGames, 1);
  assert.equal(payload.totals.missingEstimates, 1);
  assert.equal(payload.focused.scores.find((item) => item.score === 8.5)?.count, 1);
});

test("Insights coverage excludes an HLTB lookup that Backlog cannot display", () => {
  const payload = buildInsightsPayload([
    { id: 1, name: "HLTB-only", status: "playing", rank: 1, how_long_to_beat: null, my_score: null, personal_genres: [], rawg_genres: [] },
  ], { locals: { hltbLookup: { "hltb only": { main: 12 } } } });
  assert.equal(payload.games[0].hoursSource, "hltb");
  assert.equal(payload.totals.estimatedGames, 0);
  assert.equal(payload.totals.missingEstimates, 1);
});

test("Insights coverage keeps a RAWG fallback visible in Backlog even when HLTB powers the chart", () => {
  const payload = buildInsightsPayload([
    {
      id: 1,
      name: "Both sources",
      status: "playing",
      rank: 1,
      how_long_to_beat: null,
      catalog_rawg_playtime_hours: 8,
      my_score: null,
      personal_genres: [],
      rawg_genres: [],
    },
  ], { locals: { hltbLookup: { "both sources": { main: 12 } } } });

  assert.equal(payload.games[0].hoursSource, "hltb");
  assert.equal(payload.totals.estimatedGames, 1);
  assert.equal(payload.totals.missingEstimates, 0);
});

test("Insights selected-year summaries use games touched in that year", () => {
  const payload = buildInsightsPayload([
    { id: 1, name: "Started", status: "playing", rank: 1, backlog_added_at: "2025-01-01T22:00:00Z", started_at: "2025-01-03", my_score: 8, personal_genres: [], rawg_genres: [] },
    { id: 2, name: "Finished", status: "finished", rank: 2, backlog_added_at: "2024-05-04T00:00:00Z", finished_at: "2025-05-04", how_long_to_beat: 10, personal_genres: [], rawg_genres: [] },
    { id: 3, name: "Older", status: "playing", rank: 1, started_at: "2024-01-03", my_score: 9, personal_genres: [], rawg_genres: [] },
  ], { locals: { hltb: {} } }, 2025);

  assert.equal(payload.focused.games, 2);
  assert.equal(payload.focused.added, 1);
  assert.equal(payload.yearly.find((row) => row.year === 2025)?.added, payload.focused.added);
  assert.equal(payload.focused.started, 1);
  assert.equal(payload.focused.finished, 1);
  assert.equal(payload.focused.playing, 1);
  assert.equal(payload.focused.rated, 1);
  assert.equal(payload.focused.estimatedGames, 1);
  assert.equal(payload.focused.missingEstimates, 1);
});
