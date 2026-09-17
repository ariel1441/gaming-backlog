import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
dotenv.config();

test('Steam prices: durable history, independent baselines, eligibility and fencing', { timeout: 120000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const database = `steam_prices_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect(); await admin.query(`CREATE DATABASE ${database}`);
  url.pathname = `/${database}`;
  const nativeFetch = globalThis.fetch;
  let pool, releaseHeld;
  try {
    await promisify(execFile)(process.execPath, ['scripts/db-migrate.js'], { env: { ...process.env, DATABASE_URL: url.href, PGSSL: 'false' } });
    Object.assign(process.env, { DATABASE_URL: url.href, PGSSL: 'false', NODE_ENV: 'test' });
    ({ pool } = await import('./db.js'));
    const sync = await import('./services/steamLibrarySyncService.js');
    const steam = await import('./services/steamService.js');
    const prices = await import('./services/steamPriceSyncService.js');
    const wishlist = await import('./services/steamWishlistService.js');
    const activity = await import('./services/activityEventService.js');
    const runs = await import('./services/integrationSyncService.js');
    let sequence = 0, hold = null;
    const amounts = new Map(), failures = new Set(), calls = [];
    let allFree = false, rateLimited = false, retryAfter = '3600', feedApps = [], feedFailure = false;
    const respond = body => Response.json(body, { headers: { 'x-eresult': '1' } });
    globalThis.fetch = async input => {
      const uri = new URL(String(input)); calls.push(uri);
      if (rateLimited) return new Response('rate limited', { status: 429, headers: retryAfter ? { 'Retry-After': retryAfter } : {} });
      if (hold?.matches(uri)) {
        const current = hold; hold = null; current.started();
        await new Promise(resolve => { releaseHeld = resolve; });
      }
      if (uri.hostname === 'partner.steam-api.com' && uri.pathname.includes('GetAppList')) {
        if (feedFailure) return new Response('feed unavailable', { status: 503 });
        assert.equal(uri.searchParams.get('key'), 'fixture-key');
        return respond({ response: { apps: feedApps, last_appid: feedApps.at(-1)?.appid || null, have_more_results: false } });
      }
      if (uri.pathname.includes('GetItems')) {
        const request = JSON.parse(uri.searchParams.get('input_json'));
        assert.equal(request.context.country_code, 'IL');
        return respond({ response: { store_items: request.ids.map(({ appid }) => ({
          appid, success: 1, visible: true, name: `Game ${appid}`, is_free: allFree,
          ...(!allFree ? { best_purchase_option: { packageid: appid + 100000, purchase_option_name: `Game ${appid}`,
            included_game_count: 1, final_price_in_cents: String(amounts.get(String(appid)) ?? 1000) } } : {}),
        })) } });
      }
      if (uri.pathname.includes('packagedetails')) {
        assert.equal(uri.searchParams.get('cc'), 'il');
        const packageId = uri.searchParams.get('packageids'), appId = String(Number(packageId) - 100000);
        if (failures.has(appId)) return respond({ [packageId]: { success: false } });
        const final = amounts.get(appId) ?? 1000;
        return respond({ [packageId]: { success: true, data: { name: `Game ${appId}`, apps: [{ id: Number(appId) }],
          price: { currency: 'ILS', initial: 1000, final, discount_percent: (1000 - final) / 10 } } } });
      }
      throw new Error(`Unexpected provider request ${uri.pathname}`);
    };
    const owner = async (appIds = ['1', '2']) => {
      const userId = (await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id", [`prices_${++sequence}`])).rows[0].id;
      const account = await steam.upsertSteamAccount(userId, `7656119${String(userId).padStart(10, '0')}`);
      for (const appId of appIds) {
        const w = (await pool.query("INSERT INTO user_wishlist_items (user_id, display_name) VALUES ($1,$2) RETURNING id", [userId, `Game ${appId}`])).rows[0];
        await pool.query(`INSERT INTO steam_wishlist_items (user_id, account_id, wishlist_item_id, steam_app_id) VALUES ($1,$2,$3,$4)`, [userId, account.id, w.id, appId]);
      }
      return { userId, account };
    };
    const observations = async userId => (await pool.query(`SELECT o.* FROM steam_price_observations o JOIN steam_price_monitors m ON m.id = o.monitor_id WHERE m.user_id = $1 ORDER BY o.id`, [userId])).rows;
    const events = async userId => (await pool.query("SELECT * FROM user_activity_events WHERE user_id = $1 AND source = 'steam_prices' ORDER BY id", [userId])).rows;
    const monitors = async userId => (await pool.query('SELECT * FROM steam_price_monitors WHERE user_id = $1 ORDER BY id', [userId])).rows;
    const due = userId => pool.query("UPDATE steam_price_monitors SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE user_id = $1", [userId]);
    const finish = async userId => {
      const queued = await sync.enqueueSteamSync(userId, { syncKind: 'wishlist_prices' });
      return sync.waitForSteamSyncJob(userId, queued.id, { pollMs: 5 });
    };
    const claimed = async ({ userId, account }, { trigger = 'manual' } = {}) => {
      const run = await runs.createIntegrationSyncRun(userId, { provider: 'steam', syncKind: 'wishlist_prices', triggerType: trigger });
      return (await pool.query(`INSERT INTO steam_sync_jobs (id,user_id,account_id,provider_user_id,sync_kind,status,lease_token,sync_run_id,started_at,locked_at,trigger_type)
        VALUES ($1,$2,$3,$4,'wishlist_prices','running',$5,$6,NOW(),NOW(),$7) RETURNING *`,
      [crypto.randomUUID(), userId, account.id, account.provider_user_id, crypto.randomUUID(), run.id, trigger])).rows[0];
    };
    const holdNext = async (matches) => {
      let started;
      const ready = new Promise(resolve => { started = resolve; });
      hold = { matches, started };
      return { ready, release: () => { releaseHeld?.(); releaseHeld = null; } };
    };
    const first = await owner();

    await t.test('baseline and unchanged success append history with zero review floods', async () => {
      amounts.set('1', 500); // Already discounted when first monitored.
      await pool.query("UPDATE user_external_accounts SET last_library_sync_at = '2026-01-01T00:00:00Z', last_wishlist_sync_at = '2026-01-02T00:00:00Z' WHERE id = $1", [first.account.id]);
      const initial = await finish(first.userId);
      assert.equal(initial.run.status, 'succeeded'); assert.equal((await observations(first.userId)).length, 2);
      assert.equal((await events(first.userId)).length, 0);
      await due(first.userId); await finish(first.userId);
      assert.equal((await observations(first.userId)).length, 4); assert.equal((await events(first.userId)).length, 0);
      const before = calls.length; const skipped = await finish(first.userId);
      assert.equal(skipped.run.status, 'skipped'); assert.equal(calls.length, before);
      const account = await steam.getSteamAccount(first.userId);
      assert.equal(account.last_library_sync_at.toISOString(), '2026-01-01T00:00:00.000Z');
      assert.equal(account.last_wishlist_sync_at.toISOString(), '2026-01-02T00:00:00.000Z');
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM games WHERE user_id = $1', [first.userId])).rows[0].n, 0);
    });

    await t.test('sale transitions are atomic and permanently deduplicated after dismissal/replay', async () => {
      amounts.set('1', 1000); amounts.set('2', 500); await due(first.userId);
      const job = await finish(first.userId);
      const saved = await events(first.userId);
      assert.equal(saved.length, 4); assert.ok(saved.every(e => e.event_kind === 'fact' && e.state === 'resolved'));
      assert.equal((await activity.listActivityEvents(first.userId)).events.length, 0);
      await activity.updateActivityEvent(first.userId, saved[0].id, 'dismiss');
      const duplicate = await activity.createFactualActivityEvent({ userId: first.userId, source: 'steam_prices',
        eventType: saved[0].event_type, wishlistItemId: saved[0].wishlist_item_id, externalId: saved[0].external_id,
        syncRunId: saved[0].sync_run_id, occurrenceKey: saved[0].occurrence_key, payload: saved[0].payload_json, observedAt: saved[0].observed_at });
      assert.equal(duplicate, null);
      const lease = crypto.randomUUID();
      const replay = (await pool.query("UPDATE steam_sync_jobs SET status = 'running', cursor = 0, lease_token = $2, locked_at = NOW() WHERE id = $1 RETURNING *", [job.id, lease])).rows[0];
      const before = (await observations(first.userId)).length;
      await prices.processSteamPriceJob(replay);
      assert.equal((await observations(first.userId)).length, before); assert.equal((await events(first.userId)).length, 4);
    });

    await t.test('partial failures retain good pointers and retry when membership has not changed', async () => {
      const before = await monitors(first.userId); failures.add('1'); amounts.set('2', 200); await due(first.userId);
      const result = await finish(first.userId); assert.equal(result.run.status, 'partial');
      const after = await monitors(first.userId);
      assert.equal(after[0].latest_observation_id, before[0].latest_observation_id);
      assert.equal(after[0].comparison_observation_id, before[0].comparison_observation_id);
      assert.equal(after[0].attempts, 1); assert.ok(after[0].next_attempt_at > new Date());
      const read = await wishlist.listWishlistItems(first.userId);
      assert.equal(read.items.find(i => i.steamAppId === '1').steamPrice.status, 'failed');
      assert.equal(read.items.find(i => i.steamAppId === '1').steamPrice.currentMinor, 1000);
      const callCount = calls.length; await finish(first.userId); assert.equal(calls.length, callCount);
      failures.delete('1'); await due(first.userId); await finish(first.userId);
      assert.equal((await monitors(first.userId))[0].last_error, null);
    });

    await t.test('rate limiting preserves unfinished work and repeated refresh reports cooldown without provider calls', async () => {
      const user = await owner(['41', '42']); rateLimited = true;
      const limited = await finish(user.userId);
      assert.equal(limited.result.summary.failed, 1);
      assert.equal(limited.result.summary.deferred, 1);
      assert.equal(limited.result.summary.reason, 'provider_cooldown');
      assert.equal(limited.result.summary.errorCounts.steam_rate_limited, 1);
      assert.ok(limited.result.summary.errorExamples[0].message);
      const before = calls.length;
      const again = await finish(user.userId);
      assert.equal(calls.length, before);
      assert.equal(again.result.summary.deferred, 1);
      assert.equal(again.result.summary.reason, 'provider_cooldown');
      assert.ok(again.result.summary.cooldownUntil);
      const read = await wishlist.listWishlistItems(user.userId);
      assert.equal(read.priceHealth.unchecked, 1); assert.equal(read.priceHealth.failed, 1);
      rateLimited = false;
    });

    await t.test('development refresh uses short backoff but honors Steam Retry-After', async () => {
      try {
        process.env.NODE_ENV = 'production';
        assert.equal(prices.priceRetryMs(1), 6 * 60 * 60 * 1000);
        process.env.NODE_ENV = 'development';
        assert.equal(prices.priceRetryMs(1), 60000);
        assert.equal(prices.priceRetryMs(2), 120000);
        for (const header of ['', '3600']) {
          const user = await owner(['43', '44']);
          rateLimited = true; retryAfter = header;
          const limited = await finish(user.userId);
          const remaining = new Date(limited.result.summary.cooldownUntil).getTime() - Date.now();
          const expected = header ? 3600000 : 60000;
          assert.ok(remaining > expected - 10000 && remaining <= expected);
          const before = calls.length;
          await finish(user.userId);
          assert.equal(calls.length, before);
          rateLimited = false;
          await pool.query('UPDATE user_external_accounts SET price_next_attempt_at = NOW() WHERE id = $1', [user.account.id]);
          await due(user.userId);
          const recovered = await finish(user.userId);
          assert.equal(recovered.result.summary.succeeded, 2);
          assert.equal((await observations(user.userId)).length, 2);
          assert.equal((await events(user.userId)).length, 0);
        }
      } finally {
        process.env.NODE_ENV = 'test'; rateLimited = false; retryAfter = '3600';
      }
    });

    await t.test('observation/event/checkpoint rollback retries the same transition exactly once', async () => {
      const user = await owner(['3']); await finish(user.userId); amounts.set('3', 500); await due(user.userId);
      await pool.query(`CREATE FUNCTION reject_price_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected event failure'; END $$;
        CREATE TRIGGER reject_price_event BEFORE INSERT ON user_activity_events FOR EACH ROW EXECUTE FUNCTION reject_price_event()`);
      const job = await claimed(user);
      await assert.rejects(prices.processSteamPriceJob(job), /injected event failure/);
      assert.equal((await observations(user.userId)).length, 1);
      assert.equal((await sync.getSteamSyncJob(user.userId, job.id)).cursor, 0);
      await pool.query('DROP TRIGGER reject_price_event ON user_activity_events; DROP FUNCTION reject_price_event()');
      await prices.processSteamPriceJob(job);
      assert.equal((await observations(user.userId)).length, 2); assert.equal((await events(user.userId)).length, 2);
    });

    await t.test('eligibility retains local intentions and ignores ownership evidence from old connections', async () => {
      const user = await owner(['4','5','6']);
      await pool.query(`UPDATE user_wishlist_items SET local_intent_active = TRUE WHERE user_id = $1 AND display_name = 'Game 4'`, [user.userId]);
      await pool.query("UPDATE steam_wishlist_items SET is_active = FALSE WHERE user_id = $1 AND steam_app_id IN ('4','5')", [user.userId]);
      await pool.query("INSERT INTO user_wishlist_items (user_id, display_name, local_intent_active) VALUES ($1, 'No identity', TRUE)", [user.userId]);
      await pool.query(`INSERT INTO user_game_sources (user_id, provider, provider_app_id, source_status, last_synced_at)
        VALUES ($1,'steam','6','ignored',NOW() - INTERVAL '1 day')`, [user.userId]);
      await finish(user.userId);
      assert.deepEqual((await monitors(user.userId)).map(m => m.steam_app_id).sort(), ['4','6']);
      await pool.query("UPDATE user_game_sources SET last_synced_at = NOW() WHERE user_id = $1", [user.userId]);
      await due(user.userId); await finish(user.userId);
      assert.equal((await monitors(user.userId)).find(m => m.steam_app_id === '6').active, false);
      const list = await wishlist.listWishlistItems(user.userId);
      assert.equal(list.items.find(i => i.steamAppId === '6').steamPrice.monitoringReason, 'owned');
      assert.equal(list.items.find(i => i.steamAppId === '4').localActive, true);
      assert.equal(list.items.find(i => i.name === 'No identity').steamPrice.monitoringReason, 'identity_unresolved');
    });

    await t.test('late results cannot survive cancellation, opt-out or replacement', async () => {
      for (const action of ['cancel', 'optout', 'replace']) {
        const user = await owner(['7']); await steam.updateSteamAutoSync(user.userId, true);
        const job = await claimed(user, { trigger: 'scheduled' });
        const held = await holdNext(uri => uri.pathname.includes('packagedetails'));
        const work = prices.processSteamPriceJob(job); await held.ready;
        if (action === 'cancel') await sync.cancelSteamSyncJob(user.userId, job.id);
        if (action === 'optout') await steam.updateSteamAutoSync(user.userId, false);
        if (action === 'replace') await steam.upsertSteamAccount(user.userId, `7656129${String(user.userId).padStart(10,'0')}`);
        held.release(); await work;
        assert.equal((await observations(user.userId)).length, 0);
        assert.equal((await sync.getSteamSyncJob(user.userId, job.id)).status, 'cancelled');
        if (action === 'replace') {
          assert.equal((await monitors(user.userId))[0].active, false);
          assert.equal((await wishlist.listWishlistItems(user.userId, { active: 'all' })).items[0].steamPrice.observedAt, null);
        }
      }
    });

    await t.test('reclaimed lease alone can persist and old worker cannot finalize', async () => {
      const user = await owner(['8']); const job = await claimed(user);
      const held = await holdNext(uri => uri.pathname.includes('packagedetails'));
      const oldWork = prices.processSteamPriceJob(job); await held.ready;
      const recovered = (await pool.query('UPDATE steam_sync_jobs SET lease_token = $2 WHERE id = $1 RETURNING *', [job.id, crypto.randomUUID()])).rows[0];
      await prices.processSteamPriceJob(recovered); held.release(); await oldWork;
      assert.equal((await observations(user.userId)).length, 1);
      assert.equal((await sync.getSteamSyncJob(user.userId, job.id)).status, 'completed');
    });

    await t.test('cancellation after a committed chunk preserves its observations', async () => {
      const user = await owner(Array.from({ length: 21 }, (_, i) => String(100 + i))); allFree = true;
      const job = await claimed(user);
      const held = await holdNext(uri => uri.pathname.includes('GetItems') && JSON.parse(uri.searchParams.get('input_json')).ids[0].appid === 120);
      const work = prices.processSteamPriceJob(job); await held.ready;
      assert.equal((await observations(user.userId)).length, 20);
      await sync.cancelSteamSyncJob(user.userId, job.id); held.release(); await work;
      assert.equal((await observations(user.userId)).length, 20); allFree = false;
    });

    await t.test('large Wishlist bounds selection and resumes deferred items without membership changes', async () => {
      const user = await owner(Array.from({ length: 501 }, (_, i) => String(1000 + i))); allFree = true;
      const callCount = calls.length; const result = await finish(user.userId);
      assert.equal(result.result.summary.deferred, 1); assert.equal(result.run.status, 'partial');
      assert.equal((await observations(user.userId)).length, 500); assert.equal(calls.length - callCount, 25);
      await finish(user.userId); assert.equal((await observations(user.userId)).length, 501); allFree = false;

      await due(user.userId);
      const fresh = (await pool.query(
        "INSERT INTO user_wishlist_items (user_id, display_name) VALUES ($1, 'Fresh fallback target') RETURNING id",
        [user.userId],
      )).rows[0];
      await pool.query(
        "INSERT INTO steam_wishlist_items (user_id, account_id, wishlist_item_id, steam_app_id) VALUES ($1, $2, $3, '9999')",
        [user.userId, user.account.id, fresh.id],
      );
      const previousKey = process.env.STEAM_WEB_API_KEY;
      process.env.STEAM_WEB_API_KEY = 'fixture-key';
      feedFailure = true;
      allFree = true;
      try {
        const fallback = await prices.processSteamPriceJob(await claimed(user, { trigger: 'scheduled' }));
        assert.equal(fallback.summary.priceMode, 'fallback');
        assert.equal(fallback.summary.firstAttemptSelected, 1);
        assert.equal(fallback.summary.firstAttemptDeferred, 0);
        assert.equal(fallback.summary.deferred, 2);
        assert.equal(
          (await pool.query(`SELECT COUNT(*)::int AS count
             FROM steam_price_observations observation
             JOIN steam_price_monitors monitor ON monitor.id = observation.monitor_id
            WHERE monitor.user_id = $1 AND monitor.steam_app_id = '9999'`, [user.userId])).rows[0].count,
          1,
        );
      } finally {
        feedFailure = false;
        allFree = false;
        if (previousKey == null) delete process.env.STEAM_WEB_API_KEY;
        else process.env.STEAM_WEB_API_KEY = previousKey;
      }
    });

    await t.test('request budget is persisted across reclaim and leaves unattempted items due', async () => {
      const user = await owner(['9']); const job = await claimed(user);
      const held = await holdNext(uri => uri.pathname.includes('GetItems'));
      const oldWork = prices.processSteamPriceJob(job); await held.ready;
      const recovered = (await pool.query(`UPDATE steam_sync_jobs SET lease_token = $2,
        progress_json = jsonb_set(progress_json, '{requests}', '650'::jsonb) WHERE id = $1 RETURNING *`, [job.id, crypto.randomUUID()])).rows[0];
      const before = calls.length; await prices.processSteamPriceJob(recovered);
      assert.equal(calls.length, before); held.release(); await oldWork;
      assert.equal((await observations(user.userId)).length, 0);
      assert.equal((await monitors(user.userId))[0].attempts, 0);
      const result = await sync.getSteamSyncJob(user.userId, job.id);
      assert.equal(result.result.summary.deferred, 1); assert.equal(result.run.status, 'partial');
    });

    await t.test('ownership and relationship changes during requests suppress obsolete observations', async () => {
      const user = await owner(['10']); const job = await claimed(user);
      const held = await holdNext(uri => uri.pathname.includes('packagedetails'));
      const work = prices.processSteamPriceJob(job); await held.ready;
      await pool.query(`INSERT INTO user_game_sources (user_id, provider, provider_app_id, source_status, last_synced_at)
        VALUES ($1,'steam','10','owned',NOW())`, [user.userId]);
      held.release(); await work;
      assert.equal((await observations(user.userId)).length, 0);
      assert.equal((await monitors(user.userId))[0].active, false);
    });

    await t.test('scheduled bulk deltas intersect Wishlist targets, confirm IL, and preserve the cursor on feed failure', async () => {
      const previousKey = process.env.STEAM_WEB_API_KEY;
      process.env.STEAM_WEB_API_KEY = 'fixture-key';
      try {
        const user = await owner(['901', '902']);
        await steam.updateSteamAutoSync(user.userId, true);
        await finish(user.userId); // independent baselines
        await pool.query("UPDATE steam_price_monitors SET next_attempt_at = NOW() + INTERVAL '1 day' WHERE user_id = $1", [user.userId]);
        amounts.set('901', 500);
        feedApps = [
          { appid: 901, last_modified: 1_700_000_000, price_change_number: '1' },
          { appid: 999, last_modified: 1_700_000_001, price_change_number: '2' },
        ];
        const scheduled = await claimed(user, { trigger: 'scheduled' });
        const result = await prices.processSteamPriceJob(scheduled);
        assert.equal(result.summary.priceMode, 'delta');
        assert.equal(result.summary.feedChangedCandidates, 2);
        assert.equal(result.summary.succeeded, 1);
        assert.equal((await observations(user.userId)).length, 3);
        assert.equal((await events(user.userId)).length, 2);
        assert.equal((await monitors(user.userId)).find(m => m.steam_app_id === '902').latest_observation_id != null, true);
        const diagnosticRead = await wishlist.listWishlistItems(user.userId);
        assert.equal(diagnosticRead.items.find(i => i.steamAppId === '901').steamPrice.checkState, 'awaiting_scheduled_check');
        assert.equal(Number(diagnosticRead.priceHealth.awaiting_scheduled), 2);

        await pool.query("UPDATE steam_price_feed_cursor SET last_success_at = NOW() - INTERVAL '2 days', lease_token = NULL, lease_expires_at = NULL WHERE id = 1");
        const unchangedFeed = await claimed(user, { trigger: 'scheduled' });
        const unchanged = await prices.processSteamPriceJob(unchangedFeed);
        assert.equal(unchanged.summary.priceMode, 'delta');
        assert.equal(unchanged.summary.feedChangedCandidates, 0);
        assert.equal(unchanged.summary.reason, 'nothing_due');
        assert.equal((await observations(user.userId)).length, 3);
        const cursorBeforeFailure = (await pool.query('SELECT cursor_modified_since FROM steam_price_feed_cursor WHERE id = 1')).rows[0];

        const failedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        await pool.query("UPDATE steam_price_feed_cursor SET last_success_at = $1, lease_token = NULL, lease_expires_at = NULL WHERE id = 1", [failedAt]);
        feedFailure = true;
        await pool.query("UPDATE steam_price_monitors SET next_attempt_at = NOW() + INTERVAL '1 day' WHERE user_id = $1", [user.userId]);
        const failedFeed = await claimed(user, { trigger: 'scheduled' });
        const fallback = await prices.processSteamPriceJob(failedFeed);
        assert.equal(fallback.summary.priceMode, 'fallback');
        assert.equal(fallback.summary.feedErrorCode, 'steam_http_error');
        assert.equal((await observations(user.userId)).length, 3);
        const cursorAfter = (await pool.query('SELECT last_success_at, cursor_modified_since FROM steam_price_feed_cursor WHERE id = 1')).rows[0];
        assert.equal(cursorAfter.last_success_at.getTime(), failedAt.getTime());
        assert.equal(Number(cursorAfter.cursor_modified_since), Number(cursorBeforeFailure.cursor_modified_since));
      } finally {
        feedFailure = false;
        feedApps = [];
        if (previousKey == null) delete process.env.STEAM_WEB_API_KEY;
        else process.env.STEAM_WEB_API_KEY = previousKey;
      }
    });

    await t.test('owner guards, private reads, account history and idempotent additive migration', async () => {
      const other = await owner([]);
      assert.equal((await wishlist.listWishlistItems(other.userId)).total, 0);
      assert.equal((await activity.listActivityEvents(other.userId, { source: 'steam_prices', state: 'resolved' })).events.length, 0);
      assert.equal(await sync.getSteamSyncJob(other.userId, (await pool.query('SELECT id FROM steam_sync_jobs WHERE user_id = $1 LIMIT 1', [first.userId])).rows[0].id), null);
      const m = (await monitors(first.userId))[0];
      await assert.rejects(pool.query('UPDATE steam_price_monitors SET user_id = $2 WHERE id = $1', [m.id, other.userId]), /owner mismatch|immutable/);
      await assert.rejects(pool.query('UPDATE user_wishlist_items SET user_id = $2 WHERE id = $1', [m.wishlist_item_id, other.userId]), /owner|history/);
      const before = (await observations(first.userId)).length;
      await steam.disconnectSteamAccount(first.userId);
      assert.equal((await observations(first.userId)).length, before);
      assert.equal((await wishlist.listWishlistItems(first.userId, { active: 'all' })).items[0].steamPrice.monitoring, false);
      await pool.query(await readFile('backend/migrations/033_add_steam_wishlist_prices.sql', 'utf8'));
      assert.equal((await observations(first.userId)).length, before);
      assert.ok((await readFile('backend/schema.sql', 'utf8')).replace(/\r\n/g, '\n').includes((await readFile('backend/migrations/033_add_steam_wishlist_prices.sql', 'utf8')).replace(/\r\n/g, '\n')));
      const feedMigration = await readFile('backend/migrations/037_add_steam_price_change_feed.sql', 'utf8');
      await pool.query(feedMigration);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM steam_price_feed_cursor')).rows[0].n, 1);
      assert.ok((await readFile('backend/schema.sql', 'utf8')).replace(/\r\n/g, '\n').includes(feedMigration.replace(/\r\n/g, '\n')));
    });
  } finally {
    releaseHeld?.(); globalThis.fetch = nativeFetch;
    await pool?.end();
    await admin.query(`DROP DATABASE ${database}`); await admin.end();
  }
});
