import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { pool } = await import("../db.js");
const { default: nextUpRouter } = await import("./nextUp.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

function token(id = 7) {
  return jwt.sign({ id, username: "tester" }, process.env.JWT_SECRET);
}

async function withServer({ query, connect }, fn) {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = query || (async () => ({ rows: [] }));
  if (connect) pool.connect = connect;
  const app = express();
  app.use(express.json());
  app.use("/api/next-up", nextUpRouter);
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }
}

async function request(base, path, { method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("GET /api/next-up scopes queue membership to the authenticated user", async () => {
  const seen = [];
  await withServer(
    {
      query: async (text, values) => {
        seen.push({ text, values });
        if (String(text).includes("user_play_focus_games")) {
          return { rows: [{ game_id: 11, focus_role: "main" }] };
        }
        return {
          rows: [
            { game_id: 3, position: 0, candidate_role: "main" },
            { game_id: 8, position: 1000, candidate_role: "side" },
          ],
        };
      },
    },
    async (base) => {
      const response = await request(base, "/api/next-up");
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.gameIds, [3, 8]);
      assert.deepEqual(response.body.focus, {
        main: 11,
        side: null,
        occasional: [],
      });
      const queueQuery = seen.find((call) =>
        String(call.text).includes("user_next_up_games n"),
      );
      assert.match(String(queueQuery.text), /n\.user_id = \$1/);
      assert.match(String(queueQuery.text), /g\.user_id = n\.user_id/);
      assert.deepEqual(queueQuery.values, [7]);
    },
  );
});

test("PUT /api/next-up/focus/:role replaces one slot without changing game status", async () => {
  const calls = [];
  const client = {
    query: async (text, values) => {
      calls.push({ text, values });
      const sql = String(text);
      if (sql.includes("SELECT id, status FROM games")) {
        return { rows: [{ id: 4, status: "playing" }] };
      }
      if (sql.includes("SELECT n.game_id")) {
        return { rows: [{ game_id: 8, candidate_role: "main", position: 0 }] };
      }
      if (sql.includes("FROM user_play_focus_games focus")) {
        return { rows: [{ game_id: 4, focus_role: "side" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  await withServer({ connect: async () => client }, async (base) => {
    const response = await request(base, "/api/next-up/focus/side", {
      method: "PUT",
      body: { gameId: 4 },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.focus, {
      main: null,
      side: 4,
      occasional: [],
    });
    assert.deepEqual(response.body.gameIds, [8]);
    assert.equal(
      calls.some((call) => String(call.text).includes("UPDATE games")),
      false,
    );
    assert.equal(
      calls.some((call) =>
        String(call.text).includes("DELETE FROM user_next_up_games"),
      ),
      true,
    );
    assert.match(String(calls.at(-1).text), /COMMIT/);
  });
});

test("PUT /api/next-up/focus/:role rejects cross-user and finished games", async () => {
  for (const rows of [[], [{ id: 4, status: "finished" }]]) {
    const client = {
      query: async (text) => {
        if (String(text).includes("SELECT id, status FROM games"))
          return { rows };
        return { rows: [] };
      },
      release() {},
    };
    await withServer({ connect: async () => client }, async (base) => {
      const response = await request(base, "/api/next-up/focus/main", {
        method: "PUT",
        body: { gameId: 4 },
      });
      assert.equal(response.status, rows.length ? 400 : 404);
    });
  }
});

test("POST /api/next-up/:gameId rejects cross-user and active games", async () => {
  for (const rows of [[], [{ id: 4, status: "playing" }]]) {
    const client = {
      query: async (text) => {
        const sql = String(text);
        if (sql.includes("SELECT id, status FROM games")) return { rows };
        return { rows: [] };
      },
      release() {},
    };
    await withServer({ connect: async () => client }, async (base) => {
      const response = await request(base, "/api/next-up/4", {
        method: "POST",
      });
      assert.equal(response.status, rows.length ? 400 : 404);
    });
  }
});

test("PUT /api/next-up/reorder requires the complete queue and saves canonical positions", async () => {
  const calls = [];
  const client = {
    query: async (text, values) => {
      calls.push({ text, values });
      if (String(text).includes("SELECT n.game_id")) {
        return {
          rows: [
            { game_id: 2, candidate_role: "main" },
            { game_id: 5, candidate_role: "main" },
            { game_id: 9, candidate_role: "main" },
          ],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  await withServer({ connect: async () => client }, async (base) => {
    const response = await request(base, "/api/next-up/reorder", {
      method: "PUT",
      body: { gameIds: [9, 2, 5] },
    });
    assert.equal(response.status, 200);
    const update = calls.find((call) =>
      String(call.text).includes("UPDATE user_next_up_games AS n"),
    );
    assert.deepEqual(update.values, [[9, 2, 5], [0, 1000, 2000], 7, "main"]);
    assert.match(String(calls.at(-1).text), /COMMIT/);
  });
});

test("reorder validation rejects duplicate IDs before database access", async () => {
  let calls = 0;
  await withServer(
    {
      query: async () => {
        calls += 1;
        return { rows: [] };
      },
    },
    async (base) => {
      const response = await request(base, "/api/next-up/reorder", {
        method: "PUT",
        body: { gameIds: [2, 2] },
      });
      assert.equal(response.status, 422);
      assert.equal(calls, 0);
    },
  );
});

test("Start playing preserves an existing date, removes membership, and compacts atomically", async () => {
  const calls = [];
  const client = {
    query: async (text, values) => {
      calls.push({ text, values });
      const sql = String(text);
      if (sql.includes("SELECT g.*") && sql.includes("FOR UPDATE OF g")) {
        return {
          rows: [
            {
              id: 4,
              user_id: 7,
              name: "Hades",
              status: "plan to play",
              started_at: "2024-05-01",
            },
          ],
        };
      }
      if (sql.includes("UPDATE games") && sql.includes("COALESCE")) {
        return {
          rows: [
            {
              id: 4,
              user_id: 7,
              name: "Hades",
              status: "playing",
              started_at: "2024-05-01",
            },
          ],
        };
      }
      if (sql.includes("SELECT n.game_id")) {
        return {
          rows: [
            { game_id: 8, candidate_role: "main", position: 0 },
            { game_id: 9, candidate_role: "main", position: 1000 },
          ],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  await withServer(
    {
      connect: async () => client,
      query: async () => ({
        rows: [
          {
            id: 4,
            user_id: 7,
            name: "Hades",
            status: "playing",
            started_at: "2024-05-01",
          },
        ],
      }),
    },
    async (base) => {
      const response = await request(base, "/api/next-up/4/start", {
        method: "POST",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.game.started_at, "2024-05-01");
      assert.deepEqual(response.body.gameIds, [8, 9]);
      const update = calls.find((call) =>
        String(call.text).includes("UPDATE games"),
      );
      assert.match(String(update.text), /COALESCE\(started_at/);
      assert.equal(
        calls.some((call) =>
          String(call.text).includes("DELETE FROM user_next_up_games"),
        ),
        true,
      );
      assert.match(String(calls.at(-1).text), /COMMIT/);
    },
  );
});

test("Start playing rolls back when a transactional write fails", async () => {
  const calls = [];
  const client = {
    query: async (text) => {
      calls.push(String(text));
      if (String(text).includes("SELECT g.*")) {
        return { rows: [{ id: 4, user_id: 7, status: "plan to play" }] };
      }
      if (String(text).includes("UPDATE games"))
        throw new Error("write failed");
      return { rows: [] };
    },
    release() {},
  };
  await withServer({ connect: async () => client }, async (base) => {
    const response = await request(base, "/api/next-up/4/start", {
      method: "POST",
    });
    assert.equal(response.status, 500);
    assert.equal(
      calls.some((sql) => /ROLLBACK/.test(sql)),
      true,
    );
    assert.equal(
      calls.some((sql) => /DELETE FROM user_next_up_games/.test(sql)),
      false,
    );
  });
});

test("Start playing accepts an eligible owned game without adding it to the shortlist first", async () => {
  const calls = [];
  const client = {
    query: async (text) => {
      calls.push(String(text));
      const sql = String(text);
      if (sql.includes("SELECT g.*") && sql.includes("FOR UPDATE OF g")) {
        return {
          rows: [{ id: 4, user_id: 7, name: "Hades", status: "plan to play" }],
        };
      }
      if (sql.includes("UPDATE games")) {
        return {
          rows: [{ id: 4, user_id: 7, name: "Hades", status: "playing" }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  await withServer(
    {
      connect: async () => client,
      query: async () => ({
        rows: [{ id: 4, user_id: 7, name: "Hades", status: "playing" }],
      }),
    },
    async (base) => {
      const response = await request(base, "/api/next-up/4/start", {
        method: "POST",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.game.status, "playing");
      assert.equal(
        calls.some((sql) => /INSERT INTO user_next_up_games/.test(sql)),
        false,
      );
    },
  );
});

test("Start playing rejects finished and wishlist games", async () => {
  for (const status of ["finished", "wishlist"]) {
    const client = {
      query: async (text) => {
        if (String(text).includes("SELECT g.*")) {
          return { rows: [{ id: 4, user_id: 7, status }] };
        }
        return { rows: [] };
      },
      release() {},
    };
    await withServer({ connect: async () => client }, async (base) => {
      const response = await request(base, "/api/next-up/4/start", {
        method: "POST",
      });
      assert.equal(response.status, 400);
    });
  }
});
