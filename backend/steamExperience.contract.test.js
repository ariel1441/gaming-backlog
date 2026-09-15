import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
dotenv.config();

test(
  "C.5 saved health and private inbox contracts",
  { timeout: 120000 },
  async (t) => {
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    const database = `steam_experience_${crypto.randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: url.href });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${database}`);
    url.pathname = `/${database}`;
    let pool, server;
    try {
      await promisify(execFile)(process.execPath, ["scripts/db-migrate.js"], {
        env: { ...process.env, DATABASE_URL: url.href, PGSSL: "false" },
      });
      process.env.DATABASE_URL = url.href;
      process.env.PGSSL = "false";
      ({ pool } = await import("./db.js"));
      const steam = await import("./services/steamService.js");
      const inbox = await import("./services/activityInboxService.js");
      const activity = await import("./services/activityEventService.js");
      const wishlist = await import("./services/steamWishlistService.js");
      const health = await import("./services/steamExperienceService.js");
      const app = express();
      app.use(express.json());
      app.use("/activity", (await import("./routes/activity.js")).default);
      app.use("/steam", (await import("./routes/steam.js")).default);
      app.use("/wishlist", (await import("./routes/wishlist.js")).default);
      app.use((await import("./middleware/errorHandler.js")).default);
      server = await new Promise((resolve) => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      });
      const base = `http://127.0.0.1:${server.address().port}`;
      const owner = async (name) => {
        const userId = (
          await pool.query(
            "INSERT INTO users(username,password_hash) VALUES($1,'x') RETURNING id",
            [name],
          )
        ).rows[0].id;
        const account = await steam.upsertSteamAccount(
          userId,
          `7656119${String(userId).padStart(10, "0")}`,
        );
        return {
          userId,
          account,
          token: jwt.sign({ id: userId }, process.env.JWT_SECRET),
        };
      };
      const first = await owner("experience_one"),
        second = await owner("experience_two");
      const request = (who, path, method = "GET", body) =>
        fetch(`${base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${who.token}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      const run = async (
        who,
        kind = "wishlist_prices",
        status = "completed",
      ) => {
        const saved = (
          await pool.query(
            "INSERT INTO integration_sync_runs(user_id,provider,sync_kind,trigger_type,status) VALUES($1,'steam',$2,'scheduled','succeeded') RETURNING *",
            [who.userId, kind],
          )
        ).rows[0];
        const job = (
          await pool.query(
            `INSERT INTO steam_sync_jobs(id,user_id,account_id,provider_user_id,sync_run_id,sync_kind,status,trigger_type,total,cursor)
        VALUES($1,$2,$3,$4,$5,$6,$7,'scheduled',10,3) RETURNING *`,
            [
              crypto.randomUUID(),
              who.userId,
              who.account.id,
              who.account.provider_user_id,
              saved.id,
              kind,
              status,
            ],
          )
        ).rows[0];
        return { saved, job };
      };
      const priceRun = await run(first);
      await t.test(
        "notification purchases, snapshot hiding and explicit Wishlist retirement",
        async () => {
          const who = await owner("notification_owner");
          const libraryRun = await run(who, "library");
          const wishlistRun = await run(who, "wishlist");
          const pricesRun = await run(who);
          const w = (
            await pool.query(
              "INSERT INTO user_wishlist_items(user_id,display_name,local_intent_active) VALUES($1,'Portal',TRUE) RETURNING id",
              [who.userId],
            )
          ).rows[0];
          await pool.query(
            "INSERT INTO steam_wishlist_items(user_id,account_id,wishlist_item_id,steam_app_id,is_active,removed_at) VALUES($1,$2,$3,'620',FALSE,NOW())",
            [who.userId, who.account.id, w.id],
          );
          const removal = await activity.createFactualActivityEvent({
            userId: who.userId,
            source: "steam_wishlist",
            eventType: "wishlist_removed",
            externalId: "620",
            wishlistItemId: w.id,
            syncRunId: wishlistRun.saved.id,
            occurrenceKey: "removed",
            payload: {},
            observedAt: new Date(),
          });
          assert.equal(
            (await inbox.listActivityInbox(who.userId)).groups.length,
            1,
          );
          await pool.query(
            "INSERT INTO user_game_sources(user_id,provider,provider_app_id,source_status,last_synced_at) VALUES($1,'steam','620','owned',NOW())",
            [who.userId],
          );
          const decisions = [];
          for (const eventType of ["steam_new_game", "steam_started_playing"])
            decisions.push(
              await activity.createOpenActivityEvent({
                userId: who.userId,
                source: "steam_library",
                eventType,
                externalId: "620",
                syncRunId: libraryRun.saved.id,
                dedupeKey: eventType,
              }),
            );
          assert.equal(
            (await inbox.listActivityInbox(who.userId)).groups.length,
            0,
          );
          const attention = await inbox.listActivityInbox(who.userId, {
            section: "attention",
          });
          assert.equal(attention.groups.length, 1);
          assert.equal(attention.counts.pendingDecisions, 1);
          assert.equal(attention.groups[0].events.length, 2);
          assert.deepEqual(attention.groups[0].events[0].wishlistContext, {
            id: Number(w.id),
            localActive: true,
            steamActive: false,
            removedFromSteam: true,
          });
          const factFor = (i, eventType = "steam_price_increase") =>
            activity.createFactualActivityEvent({
              userId: who.userId,
              source: "steam_prices",
              eventType,
              externalId: "999",
              syncRunId: pricesRun.saved.id,
              occurrenceKey: `update-${i}`,
              payload: { groupKey: `update-${i}` },
              observedAt: new Date(),
            });
          for (let i = 0; i < 55; i++) await factFor(i);
          const deal = await factFor("deal", "steam_price_drop");
          const page = await inbox.listActivityInbox(who.userId, { limit: 50 });
          assert.ok(page.nextCursor);
          const future = await factFor("future");
          assert.equal(
            (
              await request(who, "/activity/inbox/hide-other", "POST", {
                snapshot: "bad",
              })
            ).status,
            422,
          );
          const hidden = await request(
            who,
            "/activity/inbox/hide-other",
            "POST",
            { snapshot: page.snapshot },
          );
          assert.equal(hidden.status, 200);
          assert.equal((await hidden.json()).updated, 55);
          assert.deepEqual(
            (await inbox.listActivityInbox(who.userId)).groups.map(
              (g) => g.events[0].id,
            ),
            [Number(future.id), Number(deal.id)],
          );
           assert.equal(
             (
               await inbox.listActivityInbox(who.userId, {
                 section: "attention",
               })
             ).groups.length,
             1,
           );
           const clearPage = await inbox.listActivityInbox(who.userId);
           const cleared = await request(
             who,
             "/activity/inbox/clear-updates",
             "POST",
             { snapshot: clearPage.snapshot },
           );
           assert.equal(cleared.status, 200);
           assert.equal((await cleared.json()).updated, 2);
           assert.equal(
             (await inbox.listActivityInbox(who.userId)).groups.length,
             0,
           );
           assert.equal(
             (
               await inbox.listActivityInbox(who.userId, {
                 section: "attention",
               })
             ).groups.length,
             1,
           );
           assert.equal(
             (
               await pool.query(
                "SELECT COUNT(*)::int AS n FROM user_activity_events WHERE user_id=$1",
                [who.userId],
              )
            ).rows[0].n,
            60,
          );
          const game = (
            await pool.query(
              "INSERT INTO games(user_id,name,status) VALUES($1,'Portal','finished') RETURNING id",
              [who.userId],
            )
          ).rows[0];
          await pool.query(
            "UPDATE user_game_sources SET game_id=$2 WHERE user_id=$1 AND provider_app_id='620'",
            [who.userId, game.id],
          );
          assert.equal(
            (
              await request(
                second,
                `/wishlist/${w.id}/retire-intention`,
                "POST",
                { gameId: game.id },
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT local_intent_active FROM user_wishlist_items WHERE id=$1",
                [w.id],
              )
            ).rows[0].local_intent_active,
            true,
          );
          assert.equal(
            (
              await request(who, `/wishlist/${w.id}/retire-intention`, "POST", {
                gameId: game.id,
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT local_intent_active FROM user_wishlist_items WHERE id=$1",
                [w.id],
              )
            ).rows[0].local_intent_active,
            false,
          );
          assert.equal(
            (
              await pool.query("SELECT status FROM games WHERE id=$1", [
                game.id,
              ])
            ).rows[0].status,
            "finished",
          );
          for (const decision of decisions)
            await pool.query(
              "UPDATE user_activity_events SET state='dismissed' WHERE id=$1",
              [decision.id],
            );
          assert.ok(
            !(await inbox.listActivityInbox(who.userId)).groups.some((g) =>
              g.events.some((e) => e.id === Number(removal.id)),
            ),
          );
          await steam.disconnectSteamAccount(who.userId);
          assert.equal(
            (
              await request(who, `/wishlist/${w.id}/retire-intention`, "POST", {
                gameId: game.id,
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "badge counts all grouped decisions, independent of reading and pagination; order updates form one summary",
        async () => {
          const who = await owner("badge_owner");
          const library = await run(who, "library");
          for (let i = 0; i < 56; i++)
            await activity.createOpenActivityEvent({
              userId: who.userId,
              source: "steam_library",
              eventType: "steam_new_game",
              externalId: String(5000 + i),
              syncRunId: library.saved.id,
              dedupeKey: `badge-${i}`,
            });
          const page = await inbox.listActivityInbox(who.userId, {
            section: "attention",
            limit: 1,
          });
          assert.equal(page.groups.length, 1);
          assert.equal(page.counts.pendingDecisions, 56);
          await inbox.updateActivityInbox(
            who.userId,
            [page.groups[0].events[0].id],
            "mark_read",
          );
          assert.equal(
            (await inbox.listActivityInbox(who.userId)).counts.pendingDecisions,
            56,
          );
          await activity.updateActivityEvent(
            who.userId,
            page.groups[0].events[0].id,
            "dismiss",
          );
          assert.equal(
            (await inbox.listActivityInbox(who.userId)).counts.pendingDecisions,
            55,
          );
          const orderRun = await run(who, "wishlist");
          for (let i = 0; i < 2; i++)
            await activity.createFactualActivityEvent({
              userId: who.userId,
              source: "steam_wishlist",
              eventType: "wishlist_priority_changed",
              externalId: String(i + 100),
              syncRunId: orderRun.saved.id,
              occurrenceKey: `order-${i}`,
              payload: {},
              observedAt: new Date(),
            });
          const updates = await inbox.listActivityInbox(who.userId);
          assert.equal(updates.groups.length, 1);
          assert.equal(updates.groups[0].events.length, 2);
          assert.equal(
            updates.groups[0].events[0].title,
            "Steam Wishlist order updated",
          );
          assert.equal(updates.counts.pendingDecisions, 55);
        },
      );
      const fact = (key, type = "steam_price_drop") =>
        activity.createFactualActivityEvent({
          userId: first.userId,
          source: "steam_prices",
          eventType: type,
          externalId: "10",
          syncRunId: priceRun.saved.id,
          occurrenceKey: `${key}:${type}`,
          payload: {
            groupKey: key,
            currency: "ILS",
            previousMinor: 1000,
            currentMinor: 500,
          },
          observedAt: new Date(),
        });
      const old = await fact("old");
      await inbox.activateActivityInbox(first.userId);
      const drop = await fact("new"),
        sale = await fact("new", "steam_sale_started");
      const otherRun = await run(second, "library");
      const foreign = await activity.createOpenActivityEvent({
        userId: second.userId,
        source: "steam_library",
        eventType: "steam_new_game",
        externalId: "20",
        syncRunId: otherRun.saved.id,
        dedupeKey: "foreign",
      });

      await t.test(
        "historical facts start read; transition grouping, stable pagination and replay survive hiding",
        async () => {
          const page = await inbox.listActivityInbox(first.userId, {
            limit: 1,
          });
          assert.equal(page.groups.length, 1);
          assert.equal(page.groups[0].events.length, 2);
          assert.equal(page.groups[0].unseen, true);
          const newer = await fact("later");
          const next = await inbox.listActivityInbox(first.userId, {
            limit: 1,
            snapshot: page.snapshot,
            before: page.nextCursor,
          });
          assert.equal(next.groups[0].events[0].id, Number(old.id));
          assert.equal(next.groups[0].unseen, false);
          await inbox.updateActivityInbox(
            first.userId,
            [drop.id, sale.id],
            "mark_read",
          );
          assert.equal(
            (
              await pool.query(
                "SELECT state FROM user_activity_events WHERE id=$1",
                [drop.id],
              )
            ).rows[0].state,
            "resolved",
          );
          await inbox.updateActivityInbox(
            first.userId,
            [drop.id, sale.id],
            "dismiss",
          );
          assert.equal(await fact("new"), null);
          assert.deepEqual(
            (await inbox.listActivityInbox(first.userId)).groups.map(
              (group) => group.events[0].id,
            ),
            [Number(newer.id), Number(old.id)],
          );
          await inbox.activateActivityInbox(first.userId); // Does not move the baseline on each visit.
          assert.equal(
            (await inbox.listActivityInbox(first.userId)).groups[0].unseen,
            true,
          );
        },
      );
      await t.test(
        "bulk receipt owner guards, auth, validators and guest isolation",
        async () => {
          assert.equal((await fetch(`${base}/activity/inbox`)).status, 401);
          assert.equal(
            (await request(first, "/activity/inbox?snapshot=oops")).status,
            422,
          );
          assert.equal(
            (
              await request(first, "/activity/inbox", "PATCH", {
                action: "mark_read",
                eventIds: [old.id, foreign.id].map(Number),
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT COUNT(*)::int AS n FROM user_activity_receipts WHERE event_id=$1",
                [old.id],
              )
            ).rows[0].n,
            0,
          );
          await assert.rejects(
            pool.query(
              "INSERT INTO user_activity_receipts(user_id,event_id) VALUES($1,$2)",
              [first.userId, foreign.id],
            ),
            /foreign key/,
          );
          const guest = (
            await pool.query(
              "INSERT INTO users(username,password_hash,is_guest) VALUES('experience_guest','x',TRUE) RETURNING id",
            )
          ).rows[0];
          const guestAuth = {
            token: jwt.sign({ id: guest.id }, process.env.JWT_SECRET),
          };
          assert.equal(
            (await request(guestAuth, "/activity/inbox")).status,
            403,
          );
          assert.equal(
            (await request(guestAuth, "/steam/sync-health")).status,
            403,
          );
        },
      );
      await t.test(
        "reading a decision leaves review state open; updates and attention are separate",
        async () => {
          await inbox.activateActivityInbox(second.userId);
          await inbox.updateActivityInbox(
            second.userId,
            [foreign.id],
            "mark_read",
          );
          assert.equal(
            (
              await inbox.listActivityInbox(second.userId, {
                section: "attention",
              })
            ).groups.length,
            1,
          );
          assert.equal(
            (await inbox.listActivityInbox(second.userId)).groups.length,
            0,
          );
          assert.equal(
            (await activity.listActivityEvents(second.userId)).events[0].state,
            "open",
          );
          await activity.updateActivityEvent(
            second.userId,
            foreign.id,
            "dismiss",
          );
          assert.equal(
            (await inbox.listActivityInbox(second.userId)).groups.length,
            0,
          );
          assert.equal(
            (
              await inbox.listActivityInbox(second.userId, {
                section: "attention",
              })
            ).groups.length,
            0,
          );
        },
      );
      await t.test(
        "saved health discovers background jobs without enqueueing; coverage classifies verification",
        async () => {
          const work = await run(first, "wishlist", "running");
          const before = (
            await pool.query("SELECT COUNT(*)::int AS n FROM steam_sync_jobs")
          ).rows[0].n;
          const saved = await health.getSteamExperienceHealth(first.userId);
          assert.equal(saved.activeJob.id, work.job.id);
          assert.equal(saved.activeJob.processed, 3);
          assert.ok(saved.lastScheduledAt);
          assert.equal(saved.runs.length, 2);
          assert.equal(
            (await health.getSteamExperienceHealth(second.userId)).activeJob,
            null,
          );
          assert.equal(
            (await pool.query("SELECT COUNT(*)::int AS n FROM steam_sync_jobs"))
              .rows[0].n,
            before,
          );
          const w = (
            await pool.query(
              "INSERT INTO user_wishlist_items(user_id,display_name) VALUES($1,'Verification game') RETURNING id",
              [first.userId],
            )
          ).rows[0];
          await pool.query(
            "INSERT INTO steam_wishlist_items(user_id,account_id,wishlist_item_id,steam_app_id) VALUES($1,$2,$3,'100')",
            [first.userId, first.account.id, w.id],
          );
          await pool.query(
            "INSERT INTO steam_price_monitors(user_id,account_id,wishlist_item_id,steam_app_id,epoch,last_error) VALUES($1,$2,$3,'100',$4,'steam_price_offer_uncertain')",
            [first.userId, first.account.id, w.id, crypto.randomUUID()],
          );
          const coverage = (await wishlist.listWishlistItems(first.userId))
            .priceHealth;
          assert.equal(coverage.verification, 1);
          assert.equal(coverage.retrying, 0);
          assert.equal(coverage.observed, 0);
        },
      );
      await t.test(
        "current ownership suppresses deal delivery, not facts; replacement fences old account",
        async () => {
          await pool.query(
            "INSERT INTO user_game_sources(user_id,provider,provider_app_id,source_status,last_synced_at) VALUES($1,'steam','10','ignored',NOW())",
            [first.userId],
          );
          assert.equal(
            (await inbox.listActivityInbox(first.userId)).groups.length,
            0,
          );
          assert.ok(
            (
              await pool.query(
                "SELECT id FROM user_activity_events WHERE id=$1",
                [old.id],
              )
            ).rows.length,
          );
          await steam.disconnectSteamAccount(first.userId);
          await steam.upsertSteamAccount(first.userId, "76561199999999999");
          assert.equal(
            (await inbox.listActivityInbox(first.userId)).groups.length,
            0,
          );
          assert.equal(
            (await health.getSteamExperienceHealth(first.userId)).activeJob,
            null,
          );
          const migration = await readFile(
            "backend/migrations/034_add_activity_inbox.sql",
            "utf8",
          );
          await pool.query(migration);
          assert.ok(
            (await readFile("backend/schema.sql", "utf8"))
              .replace(/\r\n/g, "\n")
              .includes(migration.replace(/\r\n/g, "\n")),
          );
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await pool?.end();
      await admin.query(`DROP DATABASE ${database}`);
      await admin.end();
    }
  },
);
