import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import jwt from "jsonwebtoken";

dotenv.config();
const exec = promisify(execFile);

test(
  "Wishlist real PostgreSQL: complete ordered snapshots, legacy intent, API privacy and rollback",
  { timeout: 120000 },
  async (t) => {
    const adminUrl = new URL(
      process.env.DATABASE_URL ||
        "postgres://postgres:postgres@localhost:5432/game_backlog",
    );
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(adminUrl.hostname),
      "contracts only use localhost",
    );
    const database = `wishlist_regression_${crypto.randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: adminUrl.href });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${database}`);
    const target = new URL(adminUrl);
    target.pathname = `/${database}`;
    const nativeFetch = globalThis.fetch;
    let pool, server;
    try {
      await exec(process.execPath, ["scripts/db-migrate.js"], {
        env: { ...process.env, DATABASE_URL: target.href, PGSSL: "false" },
      });
      process.env.DATABASE_URL = target.href;
      process.env.PGSSL = "false";
      process.env.NODE_ENV = "test";
      process.env.STEAM_WEB_API_KEY = "fixture-key";
      process.env.JWT_SECRET = "wishlist-contract";
      delete process.env.STEAM_MOCK_WISHLIST_JSON;
      ({ pool } = await import("./db.js"));
      const sync = await import("./services/steamLibrarySyncService.js");
      const wishlist = await import("./services/steamWishlistService.js");
      const steam = await import("./services/steamService.js");
      const router = (await import("./routes/wishlist.js")).default;
      const publicRouter = (await import("./routes/public.js")).default;
      const users = await pool.query(
        "INSERT INTO users (username, password_hash, is_public, is_guest) VALUES ('owner', 'x', TRUE, FALSE), ('other', 'x', FALSE, FALSE), ('guest', 'x', FALSE, TRUE) RETURNING id",
      );
      const [userId, otherId, guestId] = users.rows.map((row) => row.id);
      await pool.query(
        "INSERT INTO user_external_accounts (user_id, provider, provider_user_id, sync_status, auto_sync_enabled) VALUES ($1, 'steam', '76561190000000000', 'linked', TRUE)",
        [userId],
      );
      await pool.query(
        "INSERT INTO statuses (status, rank) VALUES ('wishlist', 100) ON CONFLICT DO NOTHING",
      );
      for (let index = 0; index < 8; index++)
        await pool.query(
          "INSERT INTO games (user_id, name, status) VALUES ($1, $2, 'wishlist')",
          [userId, `Local intention ${index}`],
        );
      await pool.query(
        await readFile(
          new URL("./migrations/030_add_steam_wishlist.sql", import.meta.url),
          "utf8",
        ),
      );
      let membership = Array.from({ length: 436 }, (_, index) => ({
        appid: 100000 + index,
        priority: 0,
        date_added: 1700000000 + index,
      }));
      let mode = "complete";
      let releaseFetch, fetchStarted;
      let started = new Promise((resolve) => {
        fetchStarted = resolve;
      });
      globalThis.fetch = async (input) => {
        const url = new URL(input);
        if (mode === "held") {
          fetchStarted();
          await new Promise((resolve) => {
            releaseFetch = resolve;
          });
        }
        const transactions = await admin.query(
          "SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname = $1 AND state = 'idle in transaction'",
          [database],
        );
        assert.equal(
          transactions.rows[0].total,
          0,
          "provider calls run outside database transactions",
        );
        if (mode === "failed")
          return new Response("unavailable", { status: 503 });
        let response;
        if (mode === "ambiguous") response = {};
        else if (url.pathname.includes("GetWishlistSortedFiltered")) {
          const { start_index, page_size } = JSON.parse(
            url.searchParams.get("input_json"),
          );
          response = {
            items: [...membership].reverse().map((item, index) => ({
              ...item,
              ...(index >= start_index && index < start_index + page_size
                ? {
                    store_item: {
                      appid: item.appid,
                      name: `Wishlist title ${item.appid}`,
                      tagids: [19],
                      assets:
                        mode === "partial"
                          ? {}
                          : {
                              asset_url_format: `steam/apps/${item.appid}/\u0024{FILENAME}?t=1`,
                              library_capsule: "library_600x900.jpg",
                            },
                    },
                  }
                : {}),
            })),
          };
        } else if (url.pathname.includes("GetWishlistItemCount"))
          response = { count: membership.length };
        else if (url.pathname.includes("GetMostPopularTags"))
          response = { tags: [{ tagid: 19, name: "Action" }] };
        else response = { items: membership };
        return new Response(JSON.stringify({ response }), {
          headers: { "content-type": "application/json" },
        });
      };
      const finish = async (options = {}) => {
        const queued = await sync.enqueueSteamSync(userId, {
          syncKind: "wishlist",
          ...options,
        });
        return sync.waitForSteamSyncJob(userId, queued.id, { pollMs: 5 });
      };
      let firstId;
      await t.test(
        "436 ordered memberships plus eight local intentions; no new backlog rows",
        async () => {
          const job = await finish();
          assert.equal(job.run.status, "succeeded", job.errorMessage);
          const page = await wishlist.listWishlistItems(userId, { limit: 100 });
          assert.equal(page.total, 444);
          assert.equal(page.items[0].steamAppId, "100435");
          assert.equal(page.facets.collectionTotal, 444);
          assert.deepEqual(page.facets.genres, ["Action"]);
          const actionOnly = await wishlist.listWishlistItems(userId, {
            genre: ["action"], includeSummary: false,
          });
          assert.equal(actionOnly.total, 436);
          assert.equal(actionOnly.facets, undefined);
          assert.equal(actionOnly.priceHealth, undefined);
          assert.equal((await wishlist.listWishlistItems(userId, {
            no_genre: true, includeSummary: false,
          })).total, 8);
          assert.equal((await wishlist.listWishlistItems(userId, {
            onSale: true, includeSummary: false,
          })).total, 0);
          firstId = page.items[0].id;
          const ordinals = (
            await pool.query(
              "SELECT steam_app_id, provider_order FROM steam_wishlist_items WHERE user_id = $1 ORDER BY provider_order",
              [userId],
            )
          ).rows;
          assert.deepEqual(
            ordinals.map((row) => [row.steam_app_id, row.provider_order]),
            [...membership]
              .reverse()
              .map((item, index) => [String(item.appid), index]),
          );
          assert.equal(
            (await wishlist.listWishlistItems(userId, { direction: "desc" }))
              .items[0].steamAppId,
            "100000",
          );
          assert.equal(
            Number(
              (
                await pool.query(
                  "SELECT count(*) FROM games WHERE user_id = $1",
                  [userId],
                )
              ).rows[0].count,
            ),
            8,
          );
          const legacy = (
            await wishlist.listWishlistItems(userId, { offset: 436 })
          ).items;
          assert.equal(legacy.length, 8);
          assert.ok(
            legacy.every(
              (item) => item.localActive && !item.steamAppId && !item.inBacklog,
            ),
          );
        },
      );
      await t.test(
        "repair in place preserves IDs, ordinals and intentions; missing artwork is partial",
        async () => {
          await pool.query(
            "UPDATE user_wishlist_items SET display_name = 'Steam App 100435', cover_url = 'library_600x900.jpg' WHERE id = $1",
            [firstId],
          );
          const repaired = await finish();
          assert.equal(repaired.run.status, "succeeded");
          const first = (await wishlist.listWishlistItems(userId)).items[0];
          assert.equal(first.id, firstId);
          assert.equal(first.name, "Wishlist title 100435");
          assert.match(
            first.cover,
            /^https:\/\/shared\.fastly\.steamstatic\.com\/store_item_assets\//,
          );
          mode = "partial";
          assert.equal((await finish()).run.status, "partial");
          assert.equal(
            (await wishlist.listWishlistItems(userId)).items[0].cover,
            first.cover,
            "sparse refresh retains good cached artwork",
          );
          mode = "complete";
        },
      );
      await t.test(
        "manual and scheduled collision share one job; cancellation fences held provider work",
        async () => {
          // Only hold the first provider request so both concurrent membership calls can finish.
          let held = false;
          const provider = globalThis.fetch;
          globalThis.fetch = async (...args) => {
            if (!held) {
              held = true;
              fetchStarted();
              await new Promise((resolve) => {
                releaseFetch = resolve;
              });
            }
            return provider(...args);
          };
          const manual = await sync.enqueueSteamSync(userId, {
            syncKind: "wishlist",
          });
          await started;
          const scheduled = await sync.enqueueSteamSync(userId, {
            syncKind: "wishlist",
            trigger: "scheduled",
          });
          assert.equal(scheduled.id, manual.id);
          const before = (await wishlist.listWishlistItems(userId))
            .snapshotVersion;
          await sync.cancelSteamSyncJob(userId, manual.id);
          releaseFetch();
          await sync.runSteamSyncJobs();
          await new Promise((resolve) => setTimeout(resolve, 30));
          assert.equal(
            (await sync.getSteamSyncJob(userId, manual.id)).status,
            "cancelled",
          );
          assert.equal(
            String((await wishlist.listWishlistItems(userId)).snapshotVersion),
            String(before),
          );
          globalThis.fetch = provider;
        },
      );
      await t.test(
        "event failure rolls back removals and baseline; successful retry deduplicates",
        async () => {
          await pool.query(
            "CREATE FUNCTION fail_wishlist_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected event failure'; END $$; CREATE TRIGGER fail_wishlist_event BEFORE INSERT ON user_activity_events FOR EACH ROW EXECUTE FUNCTION fail_wishlist_event()",
          );
          membership = membership.slice(1);
          const before = (await wishlist.listWishlistItems(userId))
            .snapshotVersion;
          assert.equal((await finish()).status, "failed");
          assert.equal((await wishlist.listWishlistItems(userId)).total, 444);
          assert.equal(
            String((await wishlist.listWishlistItems(userId)).snapshotVersion),
            String(before),
          );
          await pool.query(
            "DROP TRIGGER fail_wishlist_event ON user_activity_events",
          );
          assert.equal((await finish()).run.status, "succeeded");
          await finish();
          assert.equal(
            Number(
              (
                await pool.query(
                  "SELECT count(*) FROM user_activity_events WHERE source = 'steam_wishlist' AND event_type = 'wishlist_removed'",
                )
              ).rows[0].count,
            ),
            1,
          );
          assert.equal(
            (await wishlist.listWishlistItems(userId, { active: "all" })).total,
            444,
          );
        },
      );
      await t.test(
        "ambiguous/failed confirmation never removes rows; validated empty retains local intent",
        async () => {
          mode = "ambiguous";
          await finish();
          await finish({ force: true });
          assert.equal((await wishlist.listWishlistItems(userId)).total, 443);
          mode = "failed";
          assert.equal((await finish({ force: true })).status, "failed");
          assert.equal((await wishlist.listWishlistItems(userId)).total, 443);
          mode = "complete";
          membership = [];
          await finish({ force: true });
          assert.equal((await wishlist.listWishlistItems(userId)).total, 8);
        },
      );
      await t.test(
        "real API rejects guests/other owners; legacy promotion is explicit and public-safe",
        async () => {
          const app = express();
          app.use(express.json());
          app.locals.hltbLookup = {};
          app.use("/api/wishlist", router);
          app.use("/api/public", publicRouter);
          app.use((error, req, res, next) => {
            void next;
            res
              .status(error.status || 500)
              .json({ error: { message: error.message } });
          });
          server = app.listen(0, "127.0.0.1");
          await new Promise((resolve) => server.once("listening", resolve));
          const origin = `http://127.0.0.1:${server.address().port}`;
          const request = (path, id, options = {}) =>
            nativeFetch(origin + path, {
              ...options,
              headers: {
                "content-type": "application/json",
                ...(id
                  ? {
                      Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
                    }
                  : {}),
              },
            });
          assert.equal((await request("/api/wishlist", null)).status, 401);
          assert.equal((await request("/api/wishlist", guestId)).status, 403);
          assert.equal(
            (await (await request("/api/wishlist", otherId)).json()).total,
            0,
          );
          const legacy = (await wishlist.listWishlistItems(userId)).items[0];
          assert.equal(
            (
              await request(
                `/api/wishlist/${legacy.id}/move-to-backlog`,
                otherId,
                {
                  method: "POST",
                  body: JSON.stringify({ status: "plan to play" }),
                },
              )
            ).status,
            404,
          );
          const publicBefore = await (
            await request("/api/public/owner", null)
          ).json();
          assert.ok(!JSON.stringify(publicBefore).includes("Local intention"));
          const publicGames = await (
            await request("/api/public/owner/games", null)
          ).json();
          assert.deepEqual(publicGames, []);
          const moved = await request(
            `/api/wishlist/${legacy.id}/move-to-backlog`,
            userId,
            {
              method: "POST",
              body: JSON.stringify({ status: "plan to play" }),
            },
          );
          assert.equal(moved.status, 201);
          assert.equal(
            (await wishlist.listWishlistItems(userId)).items.find(
              (item) => item.id === legacy.id,
            ).inBacklog,
            true,
          );
          assert.equal(
            Number(
              (
                await pool.query(
                  "SELECT count(*) FROM games WHERE user_id = $1",
                  [userId],
                )
              ).rows[0].count,
            ),
            8,
          );
          await assert.rejects(steam.beginSteamLink(guestId), { status: 403 });
          await assert.rejects(sync.enqueueSteamSync(guestId), { status: 403 });
        },
      );
    } finally {
      globalThis.fetch = nativeFetch;
      await new Promise((resolve) =>
        server ? server.close(resolve) : resolve(),
      );
      await pool?.end();
      await admin.query(`DROP DATABASE ${database}`);
      await admin.end();
    }
  },
);
