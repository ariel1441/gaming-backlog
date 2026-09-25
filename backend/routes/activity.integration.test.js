import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import router from "./activity.js";
import errorHandler from "../middleware/errorHandler.js";

process.env.JWT_SECRET ||= "activity-route-test-secret";

test("play-history is private, demo-restricted, validated and owner-scoped", async () => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    assert.match(sql, /user_id = \$1/);
    return { rows: [] };
  };
  const app = express();
  app.use("/api/activity", router);
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/activity/play-history`;
  const token = (payload) => jwt.sign(payload, process.env.JWT_SECRET);
  try {
    assert.equal((await fetch(base)).status, 401);
    const guest = await fetch(base, {
      headers: { Authorization: `Bearer ${token({ id: 8, is_guest: true })}` },
    });
    assert.equal(guest.status, 403);
    assert.equal(calls.length, 0);

    const guestInsights = await fetch(base.replace("play-history", "insights"), {
      headers: { Authorization: `Bearer ${token({ id: 8, is_guest: true })}` },
    });
    assert.equal(guestInsights.status, 403);
    assert.equal(calls.length, 0);

    const invalid = await fetch(`${base}?range=year`, {
      headers: { Authorization: `Bearer ${token({ id: 7, is_guest: false })}` },
    });
    assert.equal(invalid.status, 422);
    assert.equal(calls.length, 0);

    const invalidInsights = await fetch(`${base.replace("play-history", "insights")}?range=30d`, {
      headers: { Authorization: `Bearer ${token({ id: 7, is_guest: false })}` },
    });
    assert.equal(invalidInsights.status, 422);
    assert.equal(calls.length, 0);

    const response = await fetch(`${base}?range=30d`, {
      headers: { Authorization: `Bearer ${token({ id: 7, is_guest: false })}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.range, "30d");
    assert.deepEqual(body.items, []);
    assert.equal(body.coverage.status, "not_started");
    assert.equal(calls.length, 4);

    const legacyResponse = await fetch(`${base}?days=35`, {
      headers: { Authorization: `Bearer ${token({ id: 7, is_guest: false })}` },
    });
    assert.equal(legacyResponse.status, 200);
    const legacy = await legacyResponse.json();
    assert.equal(legacy.range, "35d");
    assert.deepEqual(legacy.days, []);
    assert.equal(legacy.deprecated.use, "range=7d|30d|all");
    assert.equal(calls.length, 8);

    const insightsResponse = await fetch(`${base.replace("play-history", "insights")}?range=year`, {
      headers: { Authorization: `Bearer ${token({ id: 7, is_guest: false })}` },
    });
    assert.equal(insightsResponse.status, 200);
    assert.equal(insightsResponse.headers.get("cache-control"), "no-store");
    const insights = await insightsResponse.json();
    assert.equal(insights.range, "year");
    assert.equal(insights.coverage.status, "not_started");
    assert.equal(insights.summary.preciseActiveDays, 0);
    assert.equal(calls.length, 12);
    assert.ok(calls.every((call) => call.values[0] === 7));
    assert.ok(calls.every((call) => !call.sql.includes("is_public")));
  } finally {
    pool.query = original;
    await new Promise((resolve) => server.close(resolve));
  }
});
