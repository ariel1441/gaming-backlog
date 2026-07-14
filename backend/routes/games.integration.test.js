import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { pool } = await import("../db.js");
const { default: gamesRouter } = await import("./games.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

function makeToken(payload = {}) {
  return jwt.sign(
    { id: 7, username: "tester", ...payload },
    process.env.JWT_SECRET,
  );
}

async function withServer(queryImpl, fn, connectImpl) {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = queryImpl;
  if (connectImpl) pool.connect = connectImpl;

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
    pool.connect = originalConnect;
  }
}

async function request(
  baseUrl,
  path,
  { method = "GET", body, authPayload = { is_guest: true } } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeToken(authPayload)}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("GET /api/games never blocks on RAWG provider requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalRawgKey = process.env.RAWG_API_KEY;
  let rawgRequests = 0;
  process.env.RAWG_API_KEY = "test-key";
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.rawg.io/")) {
      rawgRequests += 1;
      throw new Error("RAWG must not run on the games list hot path");
    }
    return originalFetch(input, init);
  };

  try {
    await withServer(
      async () => ({
        rows: [
          {
            id: 1,
            user_id: 7,
            name: "Hades",
            rawg_id: 1145360,
            status: "playing",
            cover: "https://img.example/hades.jpg",
          },
          {
            id: 2,
            user_id: 7,
            name: "Steam Legacy",
            rawg_id: 55,
            status: "playing",
            cover: null,
            steam_app_id: "12345",
          },
        ],
      }),
      async (baseUrl) => {
        const res = await request(baseUrl, "/api/games", {
          authPayload: { is_guest: false },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body[0].name, "Hades");
        assert.equal(res.body[0].cover, "https://img.example/hades.jpg");
        assert.equal(res.body[0].coverNeedsHydration, false);
        assert.equal(
          res.body[1].cover,
          "https://cdn.cloudflare.steamstatic.com/steam/apps/12345/header.jpg",
        );
        assert.equal(res.body[1].coverNeedsHydration, true);
        assert.equal(rawgRequests, 0);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRawgKey == null) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalRawgKey;
  }
});

test("POST /api/games/hydrate-covers repairs and persists a cold-cache legacy cover", async () => {
  const originalFetch = globalThis.fetch;
  const originalRawgKey = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = "test-key";
  const cover = "https://img.example/legacy-cover.jpg";
  let persisted;

  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.rawg.io/api/games/42")) {
      return new Response(
        JSON.stringify({
          id: 42,
          slug: "legacy-game",
          name: "Legacy Game",
          background_image: cover,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return originalFetch(input, init);
  };

  try {
    await withServer(
      async (text, values) => {
        if (String(text).includes("UPDATE games")) {
          persisted = values;
          return { rows: [] };
        }
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Legacy Game",
              rawg_id: 42,
              rawg_slug: "legacy-game",
              status: "playing",
              cover: null,
              catalog_cover_url: null,
            },
          ],
        };
      },
      async (baseUrl) => {
        const res = await request(baseUrl, "/api/games/hydrate-covers", {
          method: "POST",
          body: {},
          authPayload: { is_guest: false },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.games[0].cover, cover);
        assert.equal(res.body.games[0].coverNeedsHydration, false);
        assert.deepEqual(persisted, [cover, 12, 7]);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRawgKey == null) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalRawgKey;
  }
});

test("POST /api/games/hydrate-covers never title-matches a game without an exact RAWG id", async () => {
  const originalFetch = globalThis.fetch;
  const originalRawgKey = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = "test-key";
  let rawgRequests = 0;
  let updateRequests = 0;

  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.rawg.io/")) {
      rawgRequests += 1;
      throw new Error("title-only cover hydration must not call RAWG");
    }
    return originalFetch(input, init);
  };

  try {
    await withServer(
      async (text) => {
        if (String(text).includes("UPDATE games")) {
          updateRequests += 1;
          return { rows: [] };
        }
        return {
          rows: [
            {
              id: 13,
              user_id: 7,
              name: "Ambiguous Legacy Game",
              rawg_id: null,
              rawg_slug: null,
              status: "playing",
              cover: null,
              catalog_cover_url: null,
            },
          ],
        };
      },
      async (baseUrl) => {
        const list = await request(baseUrl, "/api/games", {
          authPayload: { is_guest: false },
        });
        assert.equal(list.status, 200);
        assert.equal(list.body[0].coverNeedsHydration, false);

        const res = await request(baseUrl, "/api/games/hydrate-covers", {
          method: "POST",
          body: {},
          authPayload: { is_guest: false },
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.games, []);
        assert.equal(rawgRequests, 0);
        assert.equal(updateRequests, 0);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRawgKey == null) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalRawgKey;
  }
});

test("POST /api/games rejects duplicate title through route middleware", async () => {
  await withServer(
    async () => ({ rows: [{ id: 1, name: "Elden Ring" }] }),
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games", {
        method: "POST",
        body: { name: "elden-ring", status: "playing" },
      });

      assert.equal(res.status, 409);
      assert.equal(
        res.body.error.message,
        '"Elden Ring" is already in your backlog.',
      );
    },
  );
});

test("PUT /api/games/:id rejects duplicate title excluding current row", async () => {
  let calls = 0;
  await withServer(
    async () => {
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
      return {
        rows: [
          { id: 1, name: "Elden Ring" },
          { id: 2, name: "Hades" },
        ],
      };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/2", {
        method: "PUT",
        body: { name: "elden-ring", status: "playing" },
      });

      assert.equal(res.status, 409);
      assert.equal(
        res.body.error.message,
        '"Elden Ring" is already in your backlog.',
      );
    },
  );
});

test("DELETE /api/games/:id scopes deletion by authenticated user", async () => {
  let seenQuery;
  await withServer(
    async (text, values) => {
      seenQuery = { text, values };
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/99", { method: "DELETE" });

      assert.equal(res.status, 404);
      assert.match(String(seenQuery.text), /WHERE id = \$1 AND user_id = \$2/);
      assert.deepEqual(seenQuery.values, [99, 7]);
    },
  );
});

test("POST /api/games rejects invalid date order before DB writes", async () => {
  let calls = 0;
  await withServer(
    async () => {
      calls += 1;
      return { rows: [] };
    },
    async (baseUrl) => {
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
        /finished_at cannot be before started_at/,
      );
    },
  );
});

test("PUT /api/games/favorites replaces favorite ranks for owned games", async () => {
  const calls = [];
  const client = {
    query: async (text, values) => {
      calls.push({ text, values });
      const sql = String(text);
      if (sql.includes("SELECT id") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: 3 }, { id: 8 }] };
      }
      if (
        sql.includes("FROM games g") &&
        sql.includes("LEFT JOIN catalog_games")
      ) {
        return {
          rows: [
            { id: 3, user_id: 7, name: "Hades", favorite_rank: 1 },
            { id: 8, user_id: 7, name: "Celeste", favorite_rank: 2 },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  await withServer(
    async () => ({ rows: [] }),
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/favorites", {
        method: "PUT",
        body: { favoriteIds: [3, 8] },
      });

      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((game) => [game.id, game.favorite_rank]),
        [
          [3, 1],
          [8, 2],
        ],
      );
      assert.match(String(calls[0].text), /BEGIN/);
      assert.match(
        String(
          calls.find((call) =>
            String(call.text).includes("favorite_rank = NULL"),
          ).text,
        ),
        /WHERE user_id = \$1/,
      );
      assert.deepEqual(
        calls.find((call) => String(call.text).includes("unnest")).values,
        [[3, 8], [1, 2], 7],
      );
      assert.match(String(calls.at(-1).text), /COMMIT/);
    },
    async () => client,
  );
});

test("PUT /api/games/favorites rejects games outside the user backlog", async () => {
  const client = {
    query: async (text) => {
      const sql = String(text);
      if (sql.includes("SELECT id") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: 3 }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  await withServer(
    async () => ({ rows: [] }),
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/favorites", {
        method: "PUT",
        body: { favoriteIds: [3, 99] },
      });

      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /must belong to your backlog/);
    },
    async () => client,
  );
});

test("PATCH /api/games/:id/position returns enriched Steam metadata", async () => {
  const client = {
    query: async (text) => {
      const sql = String(text);
      if (sql.includes("SELECT id, status, name FROM games")) {
        return { rows: [{ id: 1, status: "playing", name: "Hades" }] };
      }
      if (sql.includes("SELECT rank FROM statuses")) {
        return { rows: [{ rank: 1 }] };
      }
      if (sql.includes("FOR UPDATE OF g")) {
        return {
          rows: [
            { id: 1, position: 0 },
            { id: 2, position: 1000 },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  let poolCalls = 0;
  await withServer(
    async (text) => {
      poolCalls += 1;
      const sql = String(text);
      if (sql.includes("LEFT JOIN LATERAL")) {
        return {
          rows: [
            {
              id: 1,
              user_id: 7,
              name: "Hades",
              status: "playing",
              position: 1000,
              steam_owned: true,
              steam_app_id: "1145360",
              steam_playtime_minutes: 720,
              steam_achievements_status: "synced",
              steam_achievements_unlocked: 20,
              steam_achievements_total: 49,
              steam_achievements_percent: 40.82,
            },
          ],
        };
      }
      if (sql.includes("ORDER BY g.position NULLS LAST")) {
        return {
          rows: [
            { id: 2, status: "playing", position: 0 },
            { id: 1, status: "playing", position: 1000 },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/1/position", {
        method: "PATCH",
        body: { targetIndex: 1 },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.game.steamOwned, true);
      assert.equal(res.body.game.steamAppId, "1145360");
      assert.equal(res.body.game.steamPlaytimeHours, 12);
      assert.equal(res.body.game.steamAchievements.status, "synced");
      assert.deepEqual(
        res.body.rank_order.map((row) => row.id),
        [2, 1],
      );
      assert.equal(poolCalls, 2);
    },
    async () => client,
  );
});
