import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { pool } = await import("../db.js");
const { default: gamesRouter } = await import("./games.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

function makeToken(payload = {}) {
  return jwt.sign({ id: 7, username: "tester", ...payload }, process.env.JWT_SECRET);
}

async function withServer(queryImpl, fn) {
  const originalQuery = pool.query;
  pool.query = queryImpl;

  const app = express();
  app.locals.rawgCache = {};
  app.use(express.json());
  app.use("/api/games", gamesRouter);
  app.use(errorHandler);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
}

async function request(baseUrl, path, { method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeToken({ is_guest: true })}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("POST /api/games rejects duplicate title through route middleware", async () => {
  await withServer(async () => ({ rows: [{ id: 1, name: "Elden Ring" }] }), async (baseUrl) => {
    const res = await request(baseUrl, "/api/games", {
      method: "POST",
      body: { name: "elden-ring", status: "playing" },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.message, "\"Elden Ring\" is already in your backlog.");
  });
});

test("PUT /api/games/:id rejects duplicate title excluding current row", async () => {
  let calls = 0;
  await withServer(async () => {
    calls += 1;
    if (calls === 1) {
      return {
        rows: [
          {
            id: 2,
            user_id: 7,
            name: "Hades",
            status: "playing",
            position: 1000,
          },
        ],
      };
    }
    return { rows: [{ id: 1, name: "Elden Ring" }, { id: 2, name: "Hades" }] };
  }, async (baseUrl) => {
    const res = await request(baseUrl, "/api/games/2", {
      method: "PUT",
      body: { name: "elden-ring", status: "playing" },
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.message, "\"Elden Ring\" is already in your backlog.");
  });
});

test("DELETE /api/games/:id scopes deletion by authenticated user", async () => {
  let seenQuery;
  await withServer(async (text, values) => {
    seenQuery = { text, values };
    return { rows: [] };
  }, async (baseUrl) => {
    const res = await request(baseUrl, "/api/games/99", { method: "DELETE" });

    assert.equal(res.status, 404);
    assert.match(String(seenQuery.text), /WHERE id = \$1 AND user_id = \$2/);
    assert.deepEqual(seenQuery.values, [99, 7]);
  });
});

test("POST /api/games rejects invalid date order before DB writes", async () => {
  let calls = 0;
  await withServer(async () => {
    calls += 1;
    return { rows: [] };
  }, async (baseUrl) => {
    const res = await request(baseUrl, "/api/games", {
      method: "POST",
      body: {
        name: "Hades",
        status: "playing",
        started_at: "2026-05-08",
        finished_at: "2026-05-07",
      },
    });

    assert.equal(res.status, 422);
    assert.equal(calls, 0);
    assert.match(
      res.body.error.details.map((detail) => detail.message).join(" "),
      /finished_at cannot be before started_at/
    );
  });
});
