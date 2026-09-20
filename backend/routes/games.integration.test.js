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

async function withServer(queryImpl, fn, connectImpl, appLocals = {}) {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = queryImpl;
  pool.connect =
    connectImpl ||
    (async () => ({
      query: async (text, values) => {
        const sql = String(text).trim();
        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
        return queryImpl(text, values);
      },
      release: () => {},
    }));

  const app = express();
  app.locals.rawgCache = {};
  Object.assign(app.locals, appLocals);
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

test("genre suggestion routes return only owner-scoped, missing personal genres", async () => {
  const writes = [];
  const suggestionGame = {
    id: 12,
    user_id: 7,
    name: "Hades",
    status: "playing",
    catalog_name: "Hades",
    catalog_cover_url: "https://img.example/hades.jpg",
    catalog_metadata_quality: "full",
    catalog_genres_json: ["Action"],
    catalog_tags_json: ["Roguelite", "Indie"],
    personal_genres: [{ id: 8, name: "Indie" }],
  };
  await withServer(
    async (text, values) => {
      const sql = String(text);
      if (sql.includes("FROM user_personal_genres genre")) {
        return {
          rows: [
            { id: 2, name: "Roguelike", usage_count: 2 },
            { id: 8, name: "Indie", usage_count: 4 },
          ],
        };
      }
      if (
        sql.includes(
          "SELECT id FROM games WHERE id = $1 AND user_id = $2 FOR UPDATE",
        )
      ) {
        return { rows: [{ id: 12 }] };
      }
      if (
        sql.includes("SELECT id, name FROM user_personal_genres WHERE id = $1")
      ) {
        return {
          rows: [
            { id: values[0], name: values[0] === 2 ? "Roguelike" : "Indie" },
          ],
        };
      }
      if (sql.includes("SELECT 1 FROM games WHERE id = $1 AND user_id = $2")) {
        return { rows: [{ "?column?": 1 }] };
      }
      if (
        sql.startsWith("DELETE FROM game_personal_genres") ||
        sql.includes("INSERT INTO game_personal_genres") ||
        sql.startsWith("UPDATE games SET my_genre")
      ) {
        writes.push(sql);
        return { rows: [] };
      }
      if (sql.includes("cg.metadata_quality = 'full'"))
        return { rows: [suggestionGame] };
      if (
        sql.includes("FROM games g") &&
        sql.includes("catalog_metadata_quality")
      )
        return { rows: [suggestionGame] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    async (baseUrl) => {
      const queue = await request(baseUrl, "/api/games/genre-suggestions", {
        authPayload: { is_guest: false },
      });
      assert.equal(queue.status, 200);
      assert.deepEqual(
        queue.body.reviews[0].suggestions.map((genre) => genre.name),
        ["Roguelike"],
      );

      const zeroGenreQueue = await request(
        baseUrl,
        "/api/games/genre-suggestions?only_without_personal_genres=true",
        {
          authPayload: { is_guest: false },
        },
      );
      assert.equal(zeroGenreQueue.status, 200);

      const oneGame = await request(
        baseUrl,
        "/api/games/12/genre-suggestions",
        {
          authPayload: { is_guest: false },
        },
      );
      assert.equal(oneGame.status, 200);
      assert.deepEqual(
        oneGame.body.suggestions.map((genre) => genre.name),
        ["Roguelike"],
      );

      const invalidApply = await request(
        baseUrl,
        "/api/games/12/genre-suggestions",
        {
          method: "POST",
          body: { personalGenreIds: [999] },
          authPayload: { is_guest: false },
        },
      );
      assert.equal(invalidApply.status, 400);
      assert.equal(invalidApply.body.error.code, "bad_request");

      const validApply = await request(
        baseUrl,
        "/api/games/12/genre-suggestions",
        {
          method: "POST",
          body: { personalGenreIds: [2], expectedPersonalGenreIds: [8] },
          authPayload: { is_guest: false },
        },
      );
      assert.equal(validApply.status, 200);
      assert.ok(
        writes.some((sql) => sql.includes("INSERT INTO game_personal_genres")),
      );
    },
  );
});

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
        assert.equal(res.body[0].displayName, "Hades");
        assert.equal(res.body[0].releaseDate, null);
        assert.equal(
          res.body[1].cover,
          "https://cdn.cloudflare.steamstatic.com/steam/apps/12345/header.jpg",
        );
        assert.equal(rawgRequests, 0);
      },
      null,
      {
        rawgCache: {
          "rawg:1145360": {
            name: "Ephemeral Wrong Name",
            released: "2099-01-01",
            background_image: "https://img.example/wrong.jpg",
          },
        },
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

test("POST /api/games keeps title-only additions unresolved and provider-free", async () => {
  let ingestionCalls = 0;
  let insertParams;
  const client = {
    query: async (text, values) => {
      const sql = String(text);
      if (sql.includes("SELECT rank FROM statuses")) {
        return { rows: [{ rank: 1 }] };
      }
      if (sql.includes("SELECT COALESCE(MAX(g.position)")) {
        return { rows: [{ max: 0 }] };
      }
      if (sql.includes("SELECT id, name FROM games")) return { rows: [] };
      if (sql.includes("INSERT INTO games")) {
        insertParams = values;
        return { rows: [{ id: 91, user_id: 7, name: "Unmatched Title" }] };
      }
      if (sql.includes("SELECT 1 FROM games")) return { rows: [{}] };
      return { rows: [] };
    },
    release: () => {},
  };

  await withServer(
    async (text) => {
      const sql = String(text);
      if (sql.includes("SELECT 1 FROM statuses")) return { rows: [{}] };
      if (sql.includes("SELECT id, name FROM games")) return { rows: [] };
      if (sql.includes("LEFT JOIN catalog_games")) {
        return {
          rows: [
            {
              id: 91,
              user_id: 7,
              name: "Unmatched Title",
              status: "playing",
              catalog_game_id: null,
              rawg_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games", {
        method: "POST",
        body: { name: "Unmatched Title", status: "playing" },
        authPayload: { is_guest: false },
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.catalog_game_id, null);
      assert.equal(res.body.rawg_id, null);
      assert.equal(insertParams[1], null);
      assert.equal(insertParams[15], null);
      assert.equal(ingestionCalls, 0);
    },
    async () => client,
    {
      ingestRawgGameMetadata: async () => {
        ingestionCalls += 1;
        throw new Error("title-only add must not ingest RAWG metadata");
      },
    },
  );
});

test("POST /api/games durably ingests an explicitly selected RAWG identity", async () => {
  const ingestionCalls = [];
  let insertParams;
  const client = {
    query: async (text, values) => {
      const sql = String(text);
      if (sql.includes("SELECT rank FROM statuses")) {
        return { rows: [{ rank: 1 }] };
      }
      if (sql.includes("SELECT COALESCE(MAX(g.position)")) {
        return { rows: [{ max: 0 }] };
      }
      if (sql.includes("SELECT id, name FROM games")) return { rows: [] };
      if (sql.includes("INSERT INTO games")) {
        insertParams = values;
        return {
          rows: [{ id: 92, user_id: 7, name: "Grand Theft Auto V" }],
        };
      }
      if (sql.includes("SELECT 1 FROM games")) return { rows: [{}] };
      return { rows: [] };
    },
    release: () => {},
  };

  await withServer(
    async (text) => {
      const sql = String(text);
      if (sql.includes("SELECT 1 FROM statuses")) return { rows: [{}] };
      if (sql.includes("SELECT id, name FROM games")) return { rows: [] };
      if (sql.includes("LEFT JOIN catalog_games")) {
        return {
          rows: [
            {
              id: 92,
              user_id: 7,
              name: "Grand Theft Auto V",
              status: "playing",
              catalog_game_id: 501,
              rawg_id: 3498,
              rawg_slug: "grand-theft-auto-v",
              catalog_name: "Grand Theft Auto V",
              catalog_cover_url: "https://img.example/gta-v.jpg",
              catalog_description_html: "Durable detail",
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games", {
        method: "POST",
        body: {
          name: "Grand Theft Auto V",
          status: "playing",
          rawg_id: 3498,
          rawg_slug: "grand-theft-auto-v",
          rawg_selection_confirmed: true,
        },
        authPayload: { is_guest: false },
      });

      assert.equal(res.status, 201);
      assert.deepEqual(ingestionCalls, [3498]);
      assert.equal(insertParams[1], 501);
      assert.equal(insertParams[15], 3498);
      assert.equal(insertParams[19], null);
      assert.equal(res.body.catalog_game_id, 501);
      assert.equal(res.body.cover, "https://img.example/gta-v.jpg");
      assert.equal(res.body.description, "Durable detail");
    },
    async () => client,
    {
      ingestRawgGameMetadata: async (rawgId) => {
        ingestionCalls.push(rawgId);
        return {
          catalogGame: {
            id: 501,
            name: "Grand Theft Auto V",
            slug: "grand-theft-auto-v",
          },
        };
      },
    },
  );
});

test("PUT /api/games/:id does not refresh an unchanged RAWG identity", async () => {
  let ingestionCalls = 0;
  let updateParams;
  let poolCalls = 0;

  await withServer(
    async (text, values) => {
      poolCalls += 1;
      const sql = String(text);
      if (sql.includes("SELECT 1 FROM statuses")) return { rows: [{}] };
      if (sql.includes("SELECT * FROM games")) {
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "playing",
              position: 1000,
              rawg_id: 1145360,
              rawg_slug: "hades",
              catalog_game_id: 44,
            },
          ],
        };
      }
      if (sql.includes("SELECT id, name FROM games")) {
        return { rows: [{ id: 12, name: "Hades" }] };
      }
      if (sql.includes("UPDATE games g")) {
        updateParams = values;
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "playing",
              position: 1000,
              rawg_id: 1145360,
              rawg_slug: "hades",
              catalog_game_id: 44,
            },
          ],
        };
      }
      if (sql.includes("LEFT JOIN catalog_games")) {
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "playing",
              position: 1000,
              rawg_id: 1145360,
              rawg_slug: "hades",
              catalog_game_id: 44,
              catalog_name: "Hades",
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/12", {
        method: "PUT",
        body: {
          name: "Hades",
          status: "playing",
          rawg_id: 1145360,
          rawg_slug: "hades",
          rawg_selection_confirmed: false,
        },
        authPayload: { is_guest: false },
      });

      assert.equal(res.status, 200);
      assert.equal(ingestionCalls, 0);
      assert.equal(updateParams[14], 1145360);
      assert.equal(updateParams[16], 44);
      assert.equal(poolCalls, 5);
    },
    undefined,
    {
      ingestRawgGameMetadata: async () => {
        ingestionCalls += 1;
        throw new Error("ordinary edit must not refresh global metadata");
      },
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

test("GET /api/games/search marks Wishlist RAWG duplicates and excludes the current item", async () => {
  let catalogRowsSql = "";
  let catalogRowsValues = null;
  await withServer(
    async (text, values) => {
      const sql = String(text);
      if (sql.includes("FROM catalog_search_cache")) {
        return {
          rows: [
            {
              result_catalog_game_ids_json: [12],
              expires_at: new Date(Date.now() + 60_000),
            },
          ],
        };
      }
      if (sql.includes("SELECT cg.*")) {
        catalogRowsSql = sql;
        catalogRowsValues = values;
        return {
          rows: [
            {
              id: 12,
              name: "Portal",
              rawg_external_id: "101",
              rawg_external_slug: "portal",
              cover_url: "https://img.example/portal.jpg",
              already_in_backlog: false,
              already_in_wishlist: true,
              genres_json: [],
              stores_json: [],
              tags_json: [],
              metadata_quality: "search_result",
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(
        baseUrl,
        "/api/games/search?q=portal&wishlist_item_id=20",
        {
          authPayload: { is_guest: false },
        },
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.results[0].alreadyInWishlist, true);
      assert.match(catalogRowsSql, /user_wishlist_items/);
      assert.match(catalogRowsSql, /\$3::int IS NULL OR wishlist\.id <> \$3/);
      assert.equal(catalogRowsValues[2], 20);
    },
  );
});

test("POST /api/games/:id/metadata/refresh refreshes the owned RAWG identity", async () => {
  const ingestionCalls = [];

  await withServer(
    async (text) => {
      const sql = String(text);
      if (sql.includes("external_game_ids")) {
        return {
          rows: [
            { id: 12, rawg_id: 42, rawg_slug: "hades", catalog_game_id: 10 },
          ],
        };
      }
      if (sql.includes("UPDATE games")) return { rows: [] };
      if (sql.includes("FROM games g")) {
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "playing",
              rawg_id: 42,
              rawg_slug: "hades",
              catalog_game_id: 10,
              catalog_name: "Hades",
              personal_genres: [],
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/12/metadata/refresh", {
        method: "POST",
        authPayload: { is_guest: false },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.id, 12);
      assert.deepEqual(ingestionCalls, [[42, { force: true }]]);
    },
    undefined,
    {
      ingestRawgGameMetadata: async (rawgId, options) => {
        ingestionCalls.push([rawgId, options]);
        return { catalogGame: { id: 10, slug: "hades" } };
      },
    },
  );
});

test("rename with omitted hours preserves saved estimate even when local HLTB matches", async () => {
  let savedHours;
  await withServer(
    async (text, values) => {
      const sql = String(text);
      if (sql.includes("SELECT 1 FROM statuses")) return { rows: [{}] };
      if (sql.includes("SELECT * FROM games"))
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Old title",
              status: "playing",
              position: 1000,
              how_long_to_beat: 27,
            },
          ],
        };
      if (sql.includes("SELECT id, name FROM games"))
        return { rows: [{ id: 12, name: "Old title" }] };
      if (sql.includes("UPDATE games g")) {
        savedHours = values[5];
        return {
          rows: [{ id: 12, name: "New title", how_long_to_beat: savedHours }],
        };
      }
      if (sql.includes("LEFT JOIN catalog_games"))
        return {
          rows: [{ id: 12, name: "New title", how_long_to_beat: savedHours }],
        };
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/12", {
        method: "PUT",
        body: { name: "New title", status: "playing" },
      });
      assert.equal(res.status, 200);
      assert.equal(savedHours, 27);
    },
    undefined,
    { hltbLookup: { "new title": { main: 99 } } },
  );
});

test("PUT /api/games/:id normalizes blank resume notes and removes stale eligible-state membership atomically", async () => {
  let updateSql = "";
  let updateParams;
  await withServer(
    async (text, values) => {
      const sql = String(text);
      if (sql.includes("SELECT 1 FROM statuses")) return { rows: [{}] };
      if (sql.includes("SELECT * FROM games")) {
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "plan to play",
              position: 1000,
              resume_note: "Old note",
            },
          ],
        };
      }
      if (sql.includes("SELECT id, name FROM games")) {
        return { rows: [{ id: 12, name: "Hades" }] };
      }
      if (sql.includes("WITH updated AS")) {
        updateSql = sql;
        updateParams = values;
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "playing",
              position: 1000,
              resume_note: null,
            },
          ],
        };
      }
      if (sql.includes("LEFT JOIN catalog_games")) {
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "playing",
              resume_note: null,
            },
          ],
        };
      }
      return { rows: [] };
    },
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/12", {
        method: "PUT",
        body: {
          name: "Hades",
          status: "playing",
          resume_note: "   ",
        },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.resume_note, null);
      assert.equal(updateParams[21], null);
      assert.equal(updateParams[22], true);
      assert.match(updateSql, /DELETE FROM user_next_up_games/);
      assert.match(updateSql, /SELECT \* FROM updated/);
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

test("POST /api/games/:id/finish updates completion fields and clears planning relationships atomically", async () => {
  const calls = [];
  const client = {
    query: async (text, values) => {
      const sql = String(text);
      calls.push({ text: sql, values });
      if (sql.includes("SELECT * FROM games") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "playing",
              started_at: "2026-07-01",
              position: 1000,
              thoughts: "Old note",
              my_score: 7,
            },
          ],
        };
      }
      if (sql.includes("UPDATE games") && sql.includes("status = 'finished'")) {
        return { rows: [{ id: 12, user_id: 7, status: "finished" }] };
      }
      if (sql.includes("DELETE FROM user_play_focus_games")) {
        return { rows: [{ focus_role: "main" }] };
      }
      if (sql.includes("LEFT JOIN LATERAL")) {
        return {
          rows: [
            {
              id: 12,
              user_id: 7,
              name: "Hades",
              status: "finished",
              started_at: "2026-07-01",
              finished_at: "2026-07-18",
              my_score: 9,
              thoughts: "Great ending.",
              position: 1000,
            },
          ],
        };
      }
      return { rows: [] };
    },
    release() {},
  };

  await withServer(
    async () => ({ rows: [] }),
    async (baseUrl) => {
      const res = await request(baseUrl, "/api/games/12/finish", {
        method: "POST",
        body: {
          finished_at: "2026-07-18",
          my_score: 9,
          thoughts: "Great ending.",
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.outcome, "finished");
      assert.equal(res.body.game.status, "finished");
      assert.equal(res.body.game.finished_at, "2026-07-18");
      assert.equal(res.body.clearedFocusRole, "main");
      const update = calls.find((call) =>
        call.text.includes("status = 'finished'"),
      );
      assert.deepEqual(update.values, [
        12,
        7,
        "2026-07-18",
        9,
        "Great ending.",
      ]);
      assert.equal(
        calls.some((call) =>
          call.text.includes("DELETE FROM user_next_up_games"),
        ),
        true,
      );
      assert.equal(
        calls.some((call) =>
          call.text.includes("DELETE FROM user_play_focus_games"),
        ),
        true,
      );
      assert.match(calls.at(-1).text, /COMMIT/);
    },
    async () => client,
  );
});
