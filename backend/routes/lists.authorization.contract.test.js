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
      "Lists authorization contracts require a localhost PostgreSQL database.",
    );
  }
}

async function createTemporaryDatabase() {
  assertLocalDatabase(adminUrl);
  const database = `lists_auth_${crypto.randomUUID().replaceAll("-", "")}`;
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
  "Lists API enforces ownership with real PostgreSQL queries",
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
      process.env.JWT_SECRET = "lists-authorization-contract-secret";
      process.env.NODE_ENV = "test";
      process.env.PGSSL = "false";

      const { default: listsRouter } = await import("./lists.js");
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
        VALUES ('lists_auth_owner', 'x'), ('lists_auth_other', 'x')
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
        RETURNING id, user_id, name
        `,
        [owner.id, other.id],
      );
      const [ownerAlpha, ownerBeta, otherGamma] = games.rows;

      const app = express();
      app.use(requestId);
      app.use(express.json());
      app.use("/api/lists", listsRouter);
      app.use(errorHandler);
      server = await listen(app);

      const ownerToken = tokenFor(owner);
      const otherToken = tokenFor(other);

      const ownerCreate = await apiRequest(
        server.baseUrl,
        ownerToken,
        "/api/lists",
        {
          method: "POST",
          body: { name: "Owner List", description: "Private owner list" },
        },
      );
      assert.equal(ownerCreate.status, 201);
      const ownerListId = ownerCreate.body.list.id;

      const otherCreate = await apiRequest(
        server.baseUrl,
        otherToken,
        "/api/lists",
        { method: "POST", body: { name: "Other List" } },
      );
      assert.equal(otherCreate.status, 201);
      const otherListId = otherCreate.body.list.id;

      const ownerIndex = await apiRequest(
        server.baseUrl,
        ownerToken,
        "/api/lists",
      );
      assert.equal(ownerIndex.status, 200);
      assert.deepEqual(
        ownerIndex.body.lists.map((list) => list.id),
        [ownerListId],
      );

      const otherIndex = await apiRequest(
        server.baseUrl,
        otherToken,
        "/api/lists",
      );
      assert.equal(otherIndex.status, 200);
      assert.deepEqual(
        otherIndex.body.lists.map((list) => list.id),
        [otherListId],
      );

      const crossRead = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/lists/${ownerListId}`,
      );
      assertApiError(crossRead, 404, "not_found");

      const crossUpdate = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/lists/${ownerListId}`,
        {
          method: "PUT",
          body: { name: "Cross-user overwrite" },
        },
      );
      assertApiError(crossUpdate, 404, "not_found");

      const crossAdd = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/lists/${ownerListId}/games`,
        { method: "POST", body: { gameId: otherGamma.id } },
      );
      assertApiError(crossAdd, 404, "not_found");

      const crossRemove = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/lists/${ownerListId}/games/${ownerAlpha.id}`,
        { method: "DELETE" },
      );
      assertApiError(crossRemove, 404, "not_found");

      const crossReorder = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/lists/${ownerListId}/games/reorder`,
        {
          method: "PATCH",
          body: { gameIds: [ownerAlpha.id, ownerBeta.id] },
        },
      );
      assertApiError(crossReorder, 404, "not_found");

      const crossDelete = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/lists/${ownerListId}`,
        { method: "DELETE" },
      );
      assertApiError(crossDelete, 404, "not_found");

      const crossOwnerGame = await apiRequest(
        server.baseUrl,
        otherToken,
        `/api/lists/${otherListId}/games`,
        { method: "POST", body: { gameId: ownerAlpha.id } },
      );
      assertApiError(crossOwnerGame, 400, "bad_request");

      const unchanged = await pool.query(
        `
        SELECT l.name, l.description, COUNT(ulg.game_id)::int AS game_count
        FROM user_lists l
        LEFT JOIN user_list_games ulg ON ulg.list_id = l.id
        WHERE l.id = $1 AND l.user_id = $2
        GROUP BY l.id
        `,
        [ownerListId, owner.id],
      );
      assert.deepEqual(unchanged.rows[0], {
        name: "Owner List",
        description: "Private owner list",
        game_count: 0,
      });

      const ownerUpdate = await apiRequest(
        server.baseUrl,
        ownerToken,
        `/api/lists/${ownerListId}`,
        {
          method: "PUT",
          body: { name: "Owner List Updated", description: "Owner edit" },
        },
      );
      assert.equal(ownerUpdate.status, 200);
      assert.equal(ownerUpdate.body.list.name, "Owner List Updated");

      for (const gameId of [ownerAlpha.id, ownerBeta.id]) {
        const add = await apiRequest(
          server.baseUrl,
          ownerToken,
          `/api/lists/${ownerListId}/games`,
          { method: "POST", body: { gameId } },
        );
        assert.equal(add.status, 201);
      }

      const ownerReorder = await apiRequest(
        server.baseUrl,
        ownerToken,
        `/api/lists/${ownerListId}/games/reorder`,
        {
          method: "PATCH",
          body: { gameIds: [ownerBeta.id, ownerAlpha.id] },
        },
      );
      assert.equal(ownerReorder.status, 200);
      assert.deepEqual(
        ownerReorder.body.games.map((game) => game.id),
        [ownerBeta.id, ownerAlpha.id],
      );

      const ownerRemove = await apiRequest(
        server.baseUrl,
        ownerToken,
        `/api/lists/${ownerListId}/games/${ownerBeta.id}`,
        { method: "DELETE" },
      );
      assert.equal(ownerRemove.status, 200);
      assert.deepEqual(
        ownerRemove.body.games.map((game) => game.id),
        [ownerAlpha.id],
      );

      const ownerRead = await apiRequest(
        server.baseUrl,
        ownerToken,
        `/api/lists/${ownerListId}`,
      );
      assert.equal(ownerRead.status, 200);
      assert.equal(ownerRead.body.list.name, "Owner List Updated");
      assert.deepEqual(
        ownerRead.body.games.map((game) => game.id),
        [ownerAlpha.id],
      );

      const ownerDelete = await apiRequest(
        server.baseUrl,
        ownerToken,
        `/api/lists/${ownerListId}`,
        { method: "DELETE" },
      );
      assert.equal(ownerDelete.status, 200);
      assert.equal(ownerDelete.body.list.id, ownerListId);

      const finalLists = await pool.query(
        "SELECT id, user_id, name FROM user_lists ORDER BY id",
      );
      assert.deepEqual(finalLists.rows, [
        { id: otherListId, user_id: other.id, name: "Other List" },
      ]);
      const finalMemberships = await pool.query(
        "SELECT list_id, game_id FROM user_list_games ORDER BY list_id, game_id",
      );
      assert.deepEqual(finalMemberships.rows, []);
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
