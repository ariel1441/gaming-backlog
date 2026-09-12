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
