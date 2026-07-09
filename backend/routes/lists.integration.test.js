import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { pool } = await import("../db.js");
const { default: listsRouter } = await import("./lists.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

function makeToken(payload = {}) {
  return jwt.sign({ id: 7, username: "tester", ...payload }, process.env.JWT_SECRET);
}

async function withServer(queryImpl, fn, connectImpl, appLocals = {}) {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = queryImpl;
  if (connectImpl) pool.connect = connectImpl;

  const app = express();
  Object.assign(app.locals, appLocals);
  app.use(express.json());
  app.use("/api/lists", listsRouter);
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
    pool.connect = originalConnect;
  }
}

async function request(baseUrl, path, { method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeToken()}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("GET /api/lists/:id hides lists outside the authenticated user", async () => {
  let seenQuery;
  await withServer(
    async (text, values) => {
      seenQuery = { text, values };
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/lists/42");

      assert.equal(res.status, 404);
      assert.equal(res.body.error.message, "List not found");
      assert.match(String(seenQuery.text), /l\.id = \$1 AND l\.user_id = \$2/);
      assert.deepEqual(seenQuery.values, [42, 7]);
    }
  );
});

test("GET /api/lists/:id decorates manual list games from RAWG cache", async () => {
  let calls = 0;
  await withServer(
    async (text) => {
      calls += 1;
      const sql = String(text);
      if (sql.includes("COUNT(ulg.game_id)::int")) {
        return {
          rows: [
            {
              id: 9,
              user_id: 7,
              name: "Favorites",
              list_type: "manual",
              game_count: 1,
            },
          ],
        };
      }
      if (sql.includes("FROM user_list_games ulg")) {
        return {
          rows: [
            {
              id: 3,
              user_id: 7,
              name: "Cache Cover Game",
              status: "finished",
              rawg_id: 123,
              rawg_slug: "cache-cover-game",
              cover: null,
              catalog_cover_url: null,
              catalog_released_at: null,
              catalog_genres_json: null,
              list_position: 1000,
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/lists/9");

      assert.equal(res.status, 200);
      assert.equal(res.body.games[0].cover, "https://img.example/cache.jpg");
      assert.equal(res.body.games[0].displayName, "Decorated Name");
      assert.equal(res.body.games[0].releaseDate, "2024-01-02");
      assert.equal(res.body.games[0].genres, "RPG");
      assert.equal(res.body.list.previewGames[0].cover, "https://img.example/cache.jpg");
      assert.equal(calls, 2);
    },
    null,
    {
      rawgCache: {
        "rawg:123": {
          name: "Decorated Name",
          background_image: "https://img.example/cache.jpg",
          released: "2024-01-02",
          genres: [{ name: "RPG" }],
        },
      },
    }
  );
});

test("POST /api/lists/:id/games rejects duplicate membership", async () => {
  const calls = [];
  const client = {
    query: async (text, values) => {
      calls.push({ text, values });
      const sql = String(text);
      if (sql.includes("FROM user_lists l")) {
        return { rows: [{ id: 9, user_id: 7, name: "Favorites" }] };
      }
      if (sql.includes("FROM games WHERE id")) {
        return { rows: [{ id: 3 }] };
      }
      if (sql.includes("FROM user_list_games WHERE list_id")) {
        return { rows: [{ "?column?": 1 }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  await withServer(
    async () => ({ rows: [] }),
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/lists/9/games", {
        method: "POST",
        body: { gameId: 3 },
      });

      assert.equal(res.status, 409);
      assert.equal(res.body.error.message, "Game is already in this list.");
      assert.match(String(calls[0].text), /BEGIN/);
      assert.match(String(calls.at(-1).text), /ROLLBACK/);
    },
    async () => client
  );
});

test("PATCH /api/lists/:id/games/reorder renumbers only list positions", async () => {
  const calls = [];
  const client = {
    query: async (text, values) => {
      calls.push({ text, values });
      const sql = String(text);
      if (sql.includes("FROM user_lists l")) {
        return { rows: [{ id: 9, user_id: 7, name: "Favorites" }] };
      }
      if (sql.includes("SELECT ulg.game_id")) {
        return { rows: [{ game_id: 3 }, { game_id: 4 }, { game_id: 5 }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  await withServer(
    async () => ({ rows: [] }),
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/lists/9/games/reorder", {
        method: "PATCH",
        body: { gameId: 5, targetIndex: 0 },
      });

      assert.equal(res.status, 200);
      const update = calls.find((call) =>
        String(call.text).includes("UPDATE user_list_games AS ulg")
      );
      assert.deepEqual(update.values, [[5, 3, 4], [0, 1000, 2000], 9]);
      assert.doesNotMatch(String(update.text), /UPDATE games/);
      assert.match(String(calls.at(-2).text), /UPDATE user_lists/);
      assert.match(String(calls.at(-1).text), /COMMIT/);
    },
    async () => client
  );
});

test("PATCH /api/lists/:id/games/reorder rejects duplicate ordered ids before DB writes", async () => {
  let calls = 0;
  await withServer(
    async () => {
      calls += 1;
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/lists/9/games/reorder", {
        method: "PATCH",
        body: { gameIds: [3, 3] },
      });

      assert.equal(res.status, 422);
      assert.equal(calls, 0);
      assert.match(
        res.body.error.details.map((detail) => detail.message).join(" "),
        /reorder must include gameIds or gameId and targetIndex/
      );
    }
  );
});

test("POST /api/lists rejects overlong names before DB writes", async () => {
  let calls = 0;
  await withServer(
    async () => {
      calls += 1;
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/lists", {
        method: "POST",
        body: { name: "x".repeat(121) },
      });

      assert.equal(res.status, 422);
      assert.equal(calls, 0);
      assert.match(
        res.body.error.details.map((detail) => detail.message).join(" "),
        /name must be <= 120 chars/
      );
    }
  );
});

test("POST /api/lists creates smart lists with private query metadata", async () => {
  let seen;
  await withServer(
    async (text, values) => {
      seen = { text, values };
      return {
        rows: [
          {
            id: 11,
            user_id: 7,
            name: "Best action",
            description: "Smart",
            visibility: "private",
            list_type: "smart",
            query_json: values[4],
            sort_key: values[5],
            game_count: 0,
          },
        ],
      };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/lists", {
        method: "POST",
        body: {
          name: "Best action",
          description: "Smart",
          listType: "smart",
          query: { status: "finished", genre: "Action" },
          sortKey: "score",
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.list.listType, "smart");
      assert.deepEqual(res.body.list.query, { status: "finished", genre: "Action" });
      assert.equal(res.body.list.sortKey, "score");
      assert.match(String(seen.text), /list_type, query_json, sort_key/);
      assert.deepEqual(seen.values.slice(3, 6), [
        "smart",
        { status: "finished", genre: "Action" },
        "score",
      ]);
    }
  );
});

test("POST /api/lists/:id/games rejects smart-list manual membership", async () => {
  const calls = [];
  const client = {
    query: async (text, values) => {
      calls.push({ text, values });
      const sql = String(text);
      if (sql.includes("FROM user_lists l")) {
        return { rows: [{ id: 9, user_id: 7, name: "Smart", list_type: "smart" }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  await withServer(
    async () => ({ rows: [] }),
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/lists/9/games", {
        method: "POST",
        body: { gameId: 3 },
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.message, "Smart lists do not support manual game membership.");
      assert.match(String(calls.at(-1).text), /ROLLBACK/);
      assert.equal(calls.some((call) => String(call.text).includes("FROM games WHERE id")), false);
    },
    async () => client
  );
});
