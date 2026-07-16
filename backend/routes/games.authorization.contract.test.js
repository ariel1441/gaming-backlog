import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import express from "express";
import jwt from "jsonwebtoken";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const adminUrl =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/game_backlog";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function assertLocalDatabase(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (!localHosts.has(hostname)) {
    throw new Error(
      "Games authorization contracts require a localhost PostgreSQL database.",
    );
  }
}

async function createTemporaryDatabase() {
  assertLocalDatabase(adminUrl);
  const database = `games_auth_${crypto.randomUUID().replaceAll("-", "")}`;
  const target = new URL(adminUrl);
  target.pathname = `/${database}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);

  return {
    url: target.toString(),
    async cleanup() {
      await admin
        .query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
          [database],
        )
        .catch(() => {});
      await admin.query(`DROP DATABASE IF EXISTS ${database}`).catch(() => {});
      await admin.end();
    },
  };
}

async function migrate(url) {
  await execFileAsync(
    process.execPath,
    [path.join(root, "scripts", "db-migrate.js")],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url, PGSSL: "false" },
    },
  );
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, username: user.username, is_guest: false },
    process.env.JWT_SECRET,
  );
}

async function apiRequest(baseUrl, token, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    requestId: response.headers.get("x-request-id"),
    body: await response.json(),
  };
}

function assertApiError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.body?.error?.code, code);
  assert.equal(response.body?.error?.requestId, response.requestId);
  assert.match(response.requestId || "", /^[A-Za-z0-9._:-]{1,128}$/);
}

test(
  "games API enforces ownership with real PostgreSQL queries",
  { timeout: 120_000 },
  async () => {
    const temporary = await createTemporaryDatabase();
    let server;
    let pool;
    const previousEnvironment = {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      NODE_ENV: process.env.NODE_ENV,
      PGSSL: process.env.PGSSL,
    };

    try {
      await migrate(temporary.url);
      process.env.DATABASE_URL = temporary.url;
      process.env.JWT_SECRET = "games-authorization-contract-secret";
      process.env.NODE_ENV = "test";
      process.env.PGSSL = "false";

      const { default: gamesRouter } = await import("./games.js");
      const { default: requestId } = await import(
        "../middleware/requestId.js"
      );
      const { default: errorHandler } = await import(
        "../middleware/errorHandler.js"
      );
      ({ pool } = await import("../db.js"));

      await pool.query(
        "INSERT INTO statuses (status, rank) VALUES ('playing', 1) ON CONFLICT (status) DO NOTHING",
      );
      const users = await pool.query(
        `
        INSERT INTO users (username, password_hash)
        VALUES ('games_auth_owner', 'x'), ('games_auth_other', 'x')
        RETURNING id, username
        `,
      );
      const [owner, other] = users.rows;
      const games = await pool.query(
        `
        INSERT INTO games (user_id, name, status, position)
        VALUES
          ($1, 'Owner Alpha', 'playing', 0),
          ($1, 'Owner Beta', 'playing', 1000),
          ($2, 'Other Gamma', 'playing', 0)
        RETURNING id, user_id, name, position
        `,
        [owner.id, other.id],
      );
      const [ownerAlpha, ownerBeta, otherGamma] = games.rows;

      const app = express();
      app.use(requestId);
      app.use(express.json());
      app.use("/api/games", gamesRouter);
      app.use(errorHandler);
      server = await listen(app);

      const ownerToken = tokenFor(owner);
      const otherToken = tokenFor(other);

      const ownerList = await apiRequest(
        server.baseUrl,
        ownerToken,
        "/api/games",
      );
      assert.equal(ownerList.status, 200);
      assert.deepEqual(
        ownerList.body.map((game) => game.id).sort((a, b) => a - b),
        [ownerAlpha.id, ownerBeta.id].sort((a, b) => a - b),
      );

      const otherList = await apiRequest(
        server.baseUrl,
        otherToken,
        "/api/games",
      );
      assert.equal(otherList.status, 200);
      assert.deepEqual(otherList.body.map((game) => game.id), [otherGamma.id]);

      const crossUpdate = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/games/${ownerAlpha.id}`,
        {
          method: "PUT",
          body: {
            name: "Cross-user overwrite",
            status: "playing",
            thoughts: "must not persist",
          },
        },
      );
      assertApiError(crossUpdate, 404, "not_found");

      const crossDelete = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/games/${ownerAlpha.id}`,
        { method: "DELETE" },
      );
      assertApiError(crossDelete, 404, "not_found");

      const crossReorder = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/games/${ownerAlpha.id}/position`,
        { method: "PATCH", body: { targetIndex: 0 } },
      );
      assertApiError(crossReorder, 404, "not_found");

      const crossFavorite = await apiRequest(
        server.baseUrl,
        otherToken,
        "/api/games/favorites",
        { method: "PUT", body: { favoriteIds: [ownerAlpha.id] } },
      );
      assertApiError(crossFavorite, 400, "bad_request");

      const unchanged = await pool.query(
        `
        SELECT name, thoughts, position, favorite_rank
        FROM games
        WHERE id = $1 AND user_id = $2
        `,
        [ownerAlpha.id, owner.id],
      );
      assert.deepEqual(unchanged.rows[0], {
        name: "Owner Alpha",
        thoughts: null,
        position: 0,
        favorite_rank: null,
      });

      const ownerUpdate = await apiRequest(
        server.baseUrl,
        ownerToken,
        `/api/games/${ownerAlpha.id}`,
        {
          method: "PUT",
          body: {
            name: "Owner Alpha",
            status: "playing",
            thoughts: "owner update",
          },
        },
      );
      assert.equal(ownerUpdate.status, 200);
      assert.equal(ownerUpdate.body.thoughts, "owner update");

      const ownerReorder = await apiRequest(
        server.baseUrl,
        ownerToken,
        `/api/games/${ownerAlpha.id}/position`,
        { method: "PATCH", body: { targetIndex: 1 } },
      );
      assert.equal(ownerReorder.status, 200);
      assert.deepEqual(
        ownerReorder.body.rank_order.map((game) => game.id),
        [ownerBeta.id, ownerAlpha.id],
      );

      const ownerFavorite = await apiRequest(
        server.baseUrl,
        ownerToken,
        "/api/games/favorites",
        { method: "PUT", body: { favoriteIds: [ownerAlpha.id] } },
      );
      assert.equal(ownerFavorite.status, 200);
      assert.equal(
        ownerFavorite.body.find((game) => game.id === ownerAlpha.id)
          ?.favorite_rank,
        1,
      );

      const ownerDelete = await apiRequest(
        server.baseUrl,
        ownerToken,
        `/api/games/${ownerBeta.id}`,
        { method: "DELETE" },
      );
      assert.equal(ownerDelete.status, 200);
      assert.equal(ownerDelete.body.id, ownerBeta.id);

      const finalState = await pool.query(
        `
        SELECT id, user_id, name, thoughts, position, favorite_rank
        FROM games
        ORDER BY id
        `,
      );
      assert.deepEqual(
        finalState.rows.map((game) => game.id),
        [ownerAlpha.id, otherGamma.id],
      );
      assert.equal(finalState.rows[0].user_id, owner.id);
      assert.equal(finalState.rows[0].thoughts, "owner update");
      assert.equal(finalState.rows[0].favorite_rank, 1);
      assert.equal(finalState.rows[1].user_id, other.id);
      assert.equal(finalState.rows[1].favorite_rank, null);
    } finally {
      if (server) await server.close().catch(() => {});
      if (pool) await pool.end().catch(() => {});
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
      await temporary.cleanup();
    }
  },
);
