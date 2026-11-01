import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import { dropDisposableDatabase } from "./testDatabase.js";
import { cacheGet, cacheSet } from "./utils/microCache.js";
import { SELECTABLE_STATUSES } from "../shared/statusModel.js";

dotenv.config();

test(
  "status v1 upgrades preserve data and owner-scoped completion and Occasional flows",
  { timeout: 120_000 },
  async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      "Disposable localhost only",
    );
    const database = `status_v1_${crypto.randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: url.href });
    await admin.connect();
    let fixture;
    let pool;
    let server;
    try {
      await admin.query(`CREATE DATABASE ${database}`);
      url.pathname = `/${database}`;
      fixture = new pg.Client({ connectionString: url.href });
      await fixture.connect();
      await fixture.query(
        await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
      );
      await fixture.query(
        "INSERT INTO statuses(status, rank) VALUES ('playing',1),('finished',12),('played alot but didnt finish',11),('recommended by someone',7)",
      );
      await fixture.query(
        "CREATE TABLE schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
      );
      for (const filename of (
        await readdir(new URL("./migrations/", import.meta.url))
      ).filter((name) => /^\d+_.+\.sql$/.test(name) && name < "052_"))
        await fixture.query(
          "INSERT INTO schema_migrations(filename) VALUES ($1)",
          [filename],
        );
      const owner = (
        await fixture.query(
          "INSERT INTO users(username,password_hash) VALUES ('status-owner','fixture') RETURNING id",
        )
      ).rows[0].id;
      const outsider = (
        await fixture.query(
          "INSERT INTO users(username,password_hash) VALUES ('status-outsider','fixture') RETURNING id",
        )
      ).rows[0].id;
      const insertGame = async (userId, name, status, position) =>
        (
          await fixture.query(
            "INSERT INTO games(user_id,name,status,position,started_at,my_score,thoughts) VALUES ($1,$2,$3,$4,'2026-01-01',7,'Preserved review') RETURNING *",
            [userId, name, status, position],
          )
        ).rows[0];
      const played = await insertGame(
        owner,
        "Enough experience",
        "playing",
        7000,
      );
      const coop = await insertGame(owner, "Co-op", "playing", 9000);
      const legacy = await insertGame(
        owner,
        "Legacy occasional",
        "playing",
        11000,
      );
      const retired = await insertGame(
        owner,
        "Recommendation",
        "recommended by someone",
        13000,
      );
      const foreign = await insertGame(
        outsider,
        "Private game",
        "playing",
        15000,
      );
      await fixture.query(
        "INSERT INTO user_play_focus_games(user_id,game_id,focus_role) VALUES ($1,$2,'occasional')",
        [owner, legacy.id],
      );
      const before = (
        await fixture.query(
          "SELECT id,user_id,name,position,started_at,finished_at,my_score,thoughts FROM games ORDER BY id",
        )
      ).rows;
      const runnerEnv = {
        ...process.env,
        DATABASE_URL: url.href,
        PGSSL: "false",
        NODE_ENV: "test",
      };
      await promisify(execFile)(process.execPath, ["scripts/db-migrate.js"], {
        env: runnerEnv,
      });
      assert.deepEqual(
        (
          await fixture.query(
            "SELECT id,user_id,name,position,started_at,finished_at,my_score,thoughts FROM games ORDER BY id",
          )
        ).rows,
        before,
      );
      assert.equal(
        (
          await fixture.query("SELECT status FROM games WHERE id=$1", [
            legacy.id,
          ])
        ).rows[0].status,
        "occasional",
      );
      assert.equal(
        (
          await fixture.query("SELECT status FROM games WHERE id=$1", [
            retired.id,
          ])
        ).rows[0].status,
        "recommended by someone",
      );
      assert.deepEqual(
        (
          await fixture.query(
            "SELECT status FROM statuses WHERE status <> 'recommended by someone' ORDER BY rank",
          )
        ).rows.map((r) => r.status),
        SELECTABLE_STATUSES,
      );
      await fixture.query(
        await readFile(
          new URL("./migrations/052_game_status_model_v1.sql", import.meta.url),
          "utf8",
        ),
      );
      assert.deepEqual(
        (
          await fixture.query(
            "SELECT id,user_id,name,position,started_at,finished_at,my_score,thoughts FROM games ORDER BY id",
          )
        ).rows,
        before,
      );
      Object.assign(process.env, runnerEnv, {
        JWT_SECRET: "status-contract-secret",
      });
      ({ pool } = await import("./db.js"));
      const { default: gamesRouter } = await import("./routes/games.js");
      const { default: nextUpRouter } = await import("./routes/nextUp.js");
      const { default: errorHandler } = await import(
        "./middleware/errorHandler.js"
      );
      const app = express();
      app.locals.rawgCache = {};
      app.locals.hltb = {};
      app.use(express.json());
      app.use("/api/games", gamesRouter);
      app.use("/api/next-up", nextUpRouter);
      app.use(errorHandler);
      server = await new Promise((resolve) => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      });
      const base = `http://127.0.0.1:${server.address().port}`;
      const request = async (path, method = "GET", body) => {
        const response = await fetch(base + path, {
          method,
          headers: {
            Authorization: `Bearer ${jwt.sign({ id: owner, username: "status-owner" }, process.env.JWT_SECRET)}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
      };
      const choices = await request("/api/games/statuses-list");
      assert.deepEqual(choices.body, SELECTABLE_STATUSES);
      const saved = await request(`/api/games/${played.id}/finish`, "POST", {
        completion_status: "played alot but didnt finish",
        my_score: 8,
        thoughts: "Enough to judge",
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.equal(saved.body.game.finished_at, null);
      assert.equal(saved.body.game.status, "played alot but didnt finish");
      cacheSet(owner, "insights-status", "stale");
      cacheSet(outsider, "insights-status", "private");
      const assignment = await request("/api/next-up/focus/occasional", "PUT", {
        gameId: coop.id,
      });
      assert.equal(assignment.status, 200, JSON.stringify(assignment.body));
      assert.equal(assignment.body.game.status, "occasional");
      assert.equal(cacheGet(owner, "insights-status"), null);
      assert.equal(cacheGet(outsider, "insights-status"), "private");
      assert.equal(assignment.body.game.status_rank, 6);
      assert.ok(assignment.body.focus.occasional.includes(coop.id));
      assert.ok(assignment.body.focus.occasional.includes(legacy.id));
      assert.equal(
        (await request(`/api/next-up/${coop.id}`, "POST", { role: "main" }))
          .status,
        400,
      );
      assert.equal(
        (
          await request("/api/next-up/focus/occasional", "PUT", {
            gameId: foreign.id,
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request(`/api/games/${foreign.id}/finish`, "POST", {
            completion_status: "played alot but didnt finish",
            my_score: null,
            thoughts: null,
          })
        ).status,
        404,
      );
      cacheSet(owner, "insights-status", "stale");
      const promoted = await request("/api/next-up/focus/main", "PUT", {
        gameId: coop.id,
      });
      assert.equal(promoted.status, 200, JSON.stringify(promoted.body));
      assert.equal(promoted.body.game.status, "playing");
      assert.equal(cacheGet(owner, "insights-status"), null);
      assert.equal(promoted.body.focus.main, coop.id);
      assert.equal(promoted.body.focus.occasional.includes(coop.id), false);
      assert.equal(
        (
          await request("/api/next-up/focus/occasional", "PUT", {
            gameId: coop.id,
          })
        ).status,
        200,
      );
      cacheSet(owner, "insights-status", "stale");
      const removal = await request(`/api/next-up/focus/${coop.id}`, "DELETE");
      assert.equal(removal.status, 200, JSON.stringify(removal.body));
      assert.equal(removal.body.game.status, "playing");
      assert.equal(cacheGet(owner, "insights-status"), null);
      assert.equal(
        (
          await request("/api/next-up/focus/occasional", "PUT", {
            gameId: coop.id,
          })
        ).status,
        200,
      );
      const edited = await request(`/api/games/${coop.id}`, "PUT", {
        name: "Co-op",
        status: "playing",
      });
      assert.equal(edited.status, 200, JSON.stringify(edited.body));
      assert.equal(
        (await request("/api/next-up")).body.focus.occasional.includes(coop.id),
        false,
      );
      assert.equal(
        (
          await fixture.query("SELECT status FROM games WHERE id=$1", [
            foreign.id,
          ])
        ).rows[0].status,
        "playing",
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (pool) await pool.end();
      if (fixture) await fixture.end();
      await dropDisposableDatabase(admin, database);
      await admin.end();
    }
  },
);
