import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { pool } = await import("../db.js");
const { default: catalogRouter } = await import("./catalog.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

function makeToken(payload = {}) {
  return jwt.sign(
    { id: 7, username: "tester", is_guest: false, ...payload },
    process.env.JWT_SECRET,
  );
}

async function withServer(queryImpl, connectImpl, appLocals, fn) {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = queryImpl;
  pool.connect = connectImpl;

  const app = express();
  Object.assign(app.locals, appLocals);
  app.use(express.json());
  app.use("/api/catalog", catalogRouter);
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

test("POST /api/catalog/:id/add-to-backlog ingests exact metadata before linking", async () => {
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
      if (sql.includes("SELECT id") && sql.includes("FROM games")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO games")) {
        insertParams = values;
        return { rows: [{ id: 301 }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  await withServer(
    async (text) => {
      const sql = String(text);
      if (sql.includes("FROM external_game_ids")) {
        return {
          rows: [{ rawg_id: 3498, rawg_slug: "grand-theft-auto-v" }],
        };
      }
      if (sql.includes("FROM catalog_games cg")) {
        return {
          rows: [
            {
              id: 501,
              name: "Grand Theft Auto V",
              canonical_title: "Grand Theft Auto V",
              slug: "grand-theft-auto-v",
              cover_url: "https://img.example/gta-v.jpg",
              description_html: "Durable detail",
              metadata_quality: "full",
              metadata_fetched_at: new Date(),
              rawg_external_id: "3498",
              rawg_external_slug: "grand-theft-auto-v",
              already_in_backlog: false,
            },
          ],
        };
      }
      if (sql.includes("FROM games g") && sql.includes("catalog_rawg_id")) {
        return {
          rows: [
            {
              id: 301,
              user_id: 7,
              catalog_game_id: 501,
              name: "Grand Theft Auto V",
              status: "playing",
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
    async () => client,
    {
      ingestRawgGameMetadata: async (rawgId) => {
        ingestionCalls.push(rawgId);
        return { catalogGame: { id: 501 } };
      },
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/catalog/501/add-to-backlog`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${makeToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "playing" }),
        },
      );
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.deepEqual(ingestionCalls, [3498]);
      assert.equal(insertParams[1], 501);
      assert.equal(insertParams[13], 3498);
      assert.equal(body.catalog_game_id, 501);
      assert.equal(body.cover, "https://img.example/gta-v.jpg");
    },
  );
});

test("GET /api/catalog/:id hydrates partial metadata through the ingestion service", async () => {
  const ingestionCalls = [];
  let hydrated = false;

  await withServer(
    async (text) => {
      const sql = String(text);
      if (sql.includes("FROM catalog_games cg")) {
        return {
          rows: [
            {
              id: 501,
              name: "Hades II",
              metadata_quality: hydrated ? "full" : "search_result",
              metadata_fetched_at: hydrated ? new Date() : null,
              rawg_external_id: "501",
              rawg_external_slug: "hades-ii",
              already_in_backlog: false,
            },
          ],
        };
      }
      if (sql.includes("SELECT *") && sql.includes("FROM external_game_ids")) {
        return { rows: [{ external_id: "501", slug: "hades-ii" }] };
      }
      return { rows: [] };
    },
    async () => {
      throw new Error("Unexpected pool connection");
    },
    {
      ingestRawgGameMetadata: async (rawgId, options) => {
        ingestionCalls.push([rawgId, options]);
        hydrated = true;
        return { catalogGame: { id: 501 } };
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/catalog/501`, {
        headers: { Authorization: `Bearer ${makeToken()}` },
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(ingestionCalls, [[501, { force: false }]]);
      assert.equal(body.metadataQuality, "full");
      assert.equal(body.cacheStatus, "fresh");
    },
  );
});

test("POST /api/catalog/:id/refresh forces snapshot-aware ingestion", async () => {
  const ingestionCalls = [];
  let refreshed = false;

  await withServer(
    async (text) => {
      const sql = String(text);
      if (sql.includes("FROM catalog_games cg")) {
        return {
          rows: [
            {
              id: 501,
              name: "Hades II",
              metadata_quality: "full",
              metadata_fetched_at: refreshed
                ? new Date()
                : new Date("2020-01-01T00:00:00Z"),
              rawg_external_id: "501",
              rawg_external_slug: "hades-ii",
              already_in_backlog: false,
            },
          ],
        };
      }
      if (sql.includes("SELECT *") && sql.includes("FROM external_game_ids")) {
        return { rows: [{ external_id: "501", slug: "hades-ii" }] };
      }
      return { rows: [] };
    },
    async () => {
      throw new Error("Unexpected pool connection");
    },
    {
      ingestRawgGameMetadata: async (rawgId, options) => {
        ingestionCalls.push([rawgId, options]);
        refreshed = true;
        return { catalogGame: { id: 501 } };
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/catalog/501/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${makeToken()}` },
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(ingestionCalls, [[501, { force: true }]]);
      assert.equal(body.cacheStatus, "fresh");
    },
  );
});

test("GET /api/catalog/:id never hydrates live metadata for guests", async () => {
  let ingestionCalls = 0;

  await withServer(
    async (text) => {
      const sql = String(text);
      if (sql.includes("FROM catalog_games cg")) {
        return {
          rows: [
            {
              id: 501,
              name: "Hades II",
              metadata_quality: "search_result",
              metadata_fetched_at: null,
              rawg_external_id: "501",
              rawg_external_slug: "hades-ii",
              already_in_backlog: false,
            },
          ],
        };
      }
      return { rows: [] };
    },
    async () => {
      throw new Error("Unexpected pool connection");
    },
    {
      ingestRawgGameMetadata: async () => {
        ingestionCalls += 1;
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/catalog/501`, {
        headers: {
          Authorization: `Bearer ${makeToken({ is_guest: true })}`,
        },
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(ingestionCalls, 0);
      assert.equal(body.cacheStatus, "stale");
    },
  );
});
