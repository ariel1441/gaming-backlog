import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { pool } = await import("../db.js");
const { default: insightsRouter } = await import("./insights.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

test("Insights ignores process-local RAWG playtime metadata", async () => {
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
      `http://127.0.0.1:${server.address().port}/api/insights?weekly_hours=10&include_missing_names=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.meta.sources.rawg, 0);
    assert.equal(body.meta.missing_stats_count, 1);
    assert.deepEqual(body.meta.missing_names, ["Ephemeral Cache Game"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});
