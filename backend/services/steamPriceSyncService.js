import crypto from 'node:crypto';
import { pool } from '../db.js';
import { lockSteamSyncJob } from './steamSyncLease.js';
import { finishIntegrationSyncRun, serializeIntegrationSyncRun } from './integrationSyncService.js';
import { createFactualActivityEvent } from './activityEventService.js';
import { fetchSteamPrices, compareSteamPrices, PRICE_BATCH_SIZE } from './steamPriceProvider.js';
import { ensureSteamPriceFeed } from './steamPriceFeedService.js';

export const PRICE_MAX_ITEMS = 500;
export const PRICE_MAX_REQUESTS = 650;
const MAX_RUN_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PRICE_SAFETY_AUDIT_MS = 3 * DAY_MS;
// Keep local recovery practical without shortening Steam's explicit Retry-After.
// Test/production retain the production policy unless development is explicit.
export const priceRetryMs = attempts => Math.min(
  (process.env.NODE_ENV === 'development' ? 60 * 1000 : 6 * 60 * 60 * 1000)
    * 2 ** Math.min(Math.max(attempts - 1, 0), 5), 7 * DAY_MS);

async function transaction(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function initialize(job) {
  const feed = job.trigger_type === 'scheduled'
    ? await ensureSteamPriceFeed()
    : { mode: 'manual', changedAppIds: [], feedErrorCode: null };
  return transaction(async client => {
    const current = await lockSteamSyncJob(client, job);
    if (!current) return null;
    if (current.payload_json) return current;
    await client.query(`UPDATE steam_price_monitors m SET active = FALSE, comparison_observation_id = NULL
      WHERE user_id = $1 AND active AND NOT EXISTS (SELECT 1 FROM steam_price_targets t
        WHERE t.account_id = m.account_id AND t.wishlist_item_id = m.wishlist_item_id
          AND t.steam_app_id = m.steam_app_id AND t.reason = 'eligible')`, [job.user_id]);
    const { rows: targets } = await client.query(`SELECT * FROM steam_price_targets WHERE user_id = $1 AND account_id = $2 AND reason = 'eligible'`, [job.user_id, job.account_id]);
    for (const target of targets) {
      await client.query(`INSERT INTO steam_price_monitors (user_id, account_id, wishlist_item_id, steam_app_id, epoch)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (account_id, wishlist_item_id, steam_app_id) DO UPDATE
        SET active = TRUE, epoch = CASE WHEN steam_price_monitors.active THEN steam_price_monitors.epoch ELSE EXCLUDED.epoch END,
          comparison_observation_id = CASE WHEN steam_price_monitors.active THEN steam_price_monitors.comparison_observation_id END,
          next_attempt_at = CASE WHEN steam_price_monitors.active THEN steam_price_monitors.next_attempt_at ELSE NOW() END,
          attempts = CASE WHEN steam_price_monitors.active THEN steam_price_monitors.attempts ELSE 0 END`,
      [job.user_id, job.account_id, target.wishlist_item_id, target.steam_app_id, crypto.randomUUID()]);
    }
    const { rows: selected } = await client.query(`SELECT m.id, m.steam_app_id, m.epoch, a.price_next_attempt_at, COUNT(*) OVER()::int AS due_count
      FROM steam_price_monitors m JOIN user_external_accounts a ON a.id = m.account_id
      WHERE m.account_id = $1 AND m.user_id = $2 AND m.active
        AND (m.next_attempt_at <= NOW() OR ($3::boolean AND m.steam_app_id = ANY($4::text[])))
      ORDER BY m.next_attempt_at, m.id LIMIT $5`,
    [job.account_id, job.user_id, feed.mode === 'delta', feed.changedAppIds, PRICE_MAX_ITEMS]);
    const cooldownUntil = (await client.query('SELECT price_next_attempt_at FROM user_external_accounts WHERE id = $1', [job.account_id])).rows[0]?.price_next_attempt_at;
    const blocked = cooldownUntil && new Date(cooldownUntil).getTime() > Date.now();
    const due = blocked ? [] : selected;
    const payload = { monitors: due.map(({ id, steam_app_id, epoch }) => ({ id, steam_app_id, epoch })),
      cooldownUntil: blocked ? cooldownUntil : null,
      deferred: Math.max(0, (selected[0]?.due_count || 0) - due.length),
      priceMode: feed.mode, feedErrorCode: feed.feedErrorCode,
      feedChangedCandidates: feed.changedAppIds.length, feedPages: feed.pages || 0 };
    await client.query(`UPDATE user_external_accounts SET price_sync_status = 'syncing', last_price_attempt_at = NOW(), price_revision = price_revision + 1 WHERE id = $1`, [job.account_id]);
    return (await client.query(`UPDATE steam_sync_jobs SET payload_json = $2::jsonb, total = $3,
      progress_json = $4::jsonb WHERE id = $1 RETURNING *`,
    [job.id, JSON.stringify(payload), due.length, JSON.stringify({ requests: 0, succeeded: 0, failed: 0, changed: 0, skipped: 0,
      feedMode: feed.mode, feedErrorCode: feed.feedErrorCode,
      feedChangedCandidates: feed.changedAppIds.length, feedPages: feed.pages || 0 })])).rows[0];
  });
}

async function reserveRequest(job) {
  const result = await transaction(async client => {
    const current = await lockSteamSyncJob(client, job);
    if (!current) return 'steam_price_inactive';
    if (Number(current.progress_json.requests) >= PRICE_MAX_REQUESTS || Date.now() - new Date(current.started_at).getTime() >= MAX_RUN_MS) return 'steam_price_budget';
    await client.query(`UPDATE steam_sync_jobs SET progress_json = jsonb_set(progress_json, '{requests}', to_jsonb(COALESCE((progress_json->>'requests')::int, 0) + 1)) WHERE id = $1`, [job.id]);
    return null;
  });
  if (result) throw Object.assign(new Error(result === 'steam_price_budget' ? 'Price request budget reached.' : 'Price job is no longer active.'), { code: result });
}

async function saveResult(job, monitor, result, nextCursor) {
  return transaction(async client => {
    const current = await lockSteamSyncJob(client, job);
    if (!current) return null;
    const m = (await client.query(`SELECT m.*, t.reason FROM steam_price_monitors m
      LEFT JOIN steam_price_targets t ON t.account_id = m.account_id AND t.wishlist_item_id = m.wishlist_item_id AND t.steam_app_id = m.steam_app_id
      WHERE m.id = $1 AND m.account_id = $2 AND m.user_id = $3 FOR UPDATE OF m`, [monitor.id, job.account_id, job.user_id])).rows[0];
    const progress = { ...current.progress_json };
    if (!m || m.reason !== 'eligible' || !m.active || m.epoch !== monitor.epoch) {
      progress.skipped++;
      if (m) await client.query('UPDATE steam_price_monitors SET active = FALSE, comparison_observation_id = NULL WHERE id = $1', [m.id]);
    } else if (result.error) {
      progress.failed++;
      const errorCode = result.error.code || 'steam_price_failed';
      progress.errorCounts = { ...progress.errorCounts, [errorCode]: (progress.errorCounts?.[errorCode] || 0) + 1 };
      progress.errorExamples = [...(progress.errorExamples || []), { appId: m.steam_app_id, code: errorCode,
        message: String(result.error.message || '').slice(0, 300) }].slice(0, 12);
      const attempts = m.attempts + 1;
      const delay = Math.max(priceRetryMs(attempts), Number(result.error.retryAfterMs) || 0);
      await client.query(`UPDATE steam_price_monitors SET last_attempt_at = NOW(), attempts = $2,
        next_attempt_at = NOW() + ($3::double precision * INTERVAL '1 millisecond'), last_error = $4 WHERE id = $1`,
      [m.id, attempts, delay, result.error.code || 'steam_price_failed']);
      if (result.error.code === 'steam_rate_limited' || result.error.retryAfterMs > 2000) {
        await client.query(`UPDATE user_external_accounts SET price_next_attempt_at = NOW() + ($2::double precision * INTERVAL '1 millisecond') WHERE id = $1`, [job.account_id, delay]);
        progress.cooldown = true;
        progress.cooldownUntil = new Date(Date.now() + delay).toISOString();
      }
    } else {
      const o = result.observation;
      const previous = m.comparison_observation_id ? (await client.query('SELECT * FROM steam_price_observations WHERE id = $1', [m.comparison_observation_id])).rows[0] : null;
      const { rows } = await client.query(`INSERT INTO steam_price_observations (monitor_id, sync_run_id, epoch,
        observed_at, country, currency, offer_id, offer_name, availability, current_minor, regular_minor, discount_percent, sale, normalizer_version, evidence_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
        ON CONFLICT (monitor_id, sync_run_id) DO NOTHING RETURNING *`,
      [m.id, job.sync_run_id, m.epoch, o.observedAt, o.country, o.currency, o.offerId, o.offerName,
        o.availability, o.currentMinor, o.regularMinor, o.discountPercent, o.sale, o.normalizerVersion, JSON.stringify(o.evidence)]);
      if (rows[0]) {
        const observation = rows[0];
        const events = compareSteamPrices(previous, observation);
        const groupKey = `price:${m.epoch}:${previous?.id || 'baseline'}:${observation.id}`;
        for (const eventType of events) await createFactualActivityEvent({ userId: job.user_id, source: 'steam_prices', eventType,
          wishlistItemId: m.wishlist_item_id, externalId: m.steam_app_id, syncRunId: job.sync_run_id,
          occurrenceKey: `${groupKey}:${eventType}`, observedAt: o.observedAt,
          payload: { version: 1, accountId: job.account_id, groupKey, monitoringEpoch: m.epoch,
            previousObservationId: previous.id, observationId: observation.id, country: o.country, currency: o.currency,
            offerId: o.offerId, previousMinor: Number(previous.current_minor), currentMinor: o.currentMinor,
            intervalStart: previous.observed_at, intervalEnd: o.observedAt } }, client);
        // A successful unavailable observation closes comparability. Old monetary
        // observations remain in the ledger, but return-to-store is a new baseline.
        const auditDelay = ['delta', 'fallback'].includes(job.payload_json?.priceMode)
          ? PRICE_SAFETY_AUDIT_MS
          : DAY_MS;
        await client.query(`UPDATE steam_price_monitors SET latest_observation_id = $2,
          comparison_observation_id = $3, last_attempt_at = NOW(),
          next_attempt_at = NOW() + ($4::double precision * INTERVAL '1 millisecond'),
          attempts = 0, last_error = NULL WHERE id = $1`, [m.id, observation.id,
          ['available', 'free'].includes(o.availability) ? observation.id : null, auditDelay]);
        if (events.length) progress.changed++;
      }
      progress.succeeded++;
    }
    await client.query('UPDATE user_external_accounts SET price_revision = price_revision + 1 WHERE id = $1', [job.account_id]);
    await client.query('UPDATE steam_sync_jobs SET cursor = $2, progress_json = $3::jsonb, updated_at = NOW() WHERE id = $1', [job.id, nextCursor, JSON.stringify(progress)]);
    return progress;
  });
}

async function complete(job, stopReason = null) {
  return transaction(async client => {
    const current = await lockSteamSyncJob(client, job);
    if (!current) return null;
    const p = current.progress_json;
    const deferred = current.payload_json.deferred + Math.max(0, current.total - current.cursor);
    const pendingRetries = Number((await client.query(`SELECT COUNT(*) FROM steam_price_monitors
      WHERE account_id = $1 AND active AND last_error IS NOT NULL`, [job.account_id])).rows[0].count);
    const status = p.failed || deferred || pendingRetries ? (p.succeeded || deferred || !p.failed ? 'partial' : 'failed') : p.succeeded ? 'succeeded' : 'skipped';
    const summary = { ...p, priceMode: current.payload_json.priceMode || 'manual',
      feedErrorCode: current.payload_json.feedErrorCode || null,
      feedChangedCandidates: current.payload_json.feedChangedCandidates || 0,
      feedPages: current.payload_json.feedPages || 0,
      deferred, pendingRetries, cooldownUntil: p.cooldownUntil || current.payload_json.cooldownUntil || null,
      reason: stopReason || (current.payload_json.cooldownUntil ? 'provider_cooldown' : status === 'skipped' ? 'nothing_due' : null), country: 'IL' };
    const run = await finishIntegrationSyncRun(job.sync_run_id, { status, itemsSeen: current.cursor,
      itemsChanged: p.changed, errorsCount: p.failed, summary }, client);
    await client.query(`UPDATE user_external_accounts SET price_sync_status = $2,
      last_price_sync_at = CASE WHEN $2 = 'succeeded' THEN NOW() ELSE last_price_sync_at END,
      price_last_error = $3, price_revision = price_revision + 1 WHERE id = $1`,
    [job.account_id, status, pendingRetries ? 'Some Steam prices could not be refreshed; retries are scheduled.' : deferred ? 'Remaining prices are due on a later run.' : null]);
    const result = { summary, run: serializeIntegrationSyncRun(run) };
    await client.query(`UPDATE steam_sync_jobs SET status = 'completed', result_json = $2::jsonb,
      completed_at = NOW(), locked_at = NULL, lease_token = NULL, updated_at = NOW() WHERE id = $1`, [job.id, JSON.stringify(result)]);
    return result;
  });
}

export async function processSteamPriceJob(job) {
  const initialized = await initialize(job);
  if (!initialized) return null;
  if (initialized.progress_json.cooldown) return complete(job, 'provider_cooldown');
  const monitors = initialized.payload_json.monitors;
  for (let offset = initialized.cursor; offset < monitors.length; offset += PRICE_BATCH_SIZE) {
    const chunk = monitors.slice(offset, offset + PRICE_BATCH_SIZE);
    const results = await fetchSteamPrices([...new Set(chunk.map(m => m.steam_app_id))], { beforeRequest: () => reserveRequest(job) });
    for (let i = 0; i < chunk.length; i++) {
      const result = results.find(r => r.appId === chunk[i].steam_app_id);
      if (!result || result.error?.code === 'steam_price_budget') return complete(job, 'request_budget');
      if (result.error?.code === 'steam_price_inactive') return null;
      const progress = await saveResult(job, chunk[i], result, offset + i + 1);
      if (!progress) return null;
      if (progress.cooldown) return complete(job, 'provider_cooldown');
    }
  }
  return complete(job);
}

export async function failSteamPriceJob(job, error) {
  if (!job?.lease_token) return;
  await transaction(async client => {
    const current = await lockSteamSyncJob(client, job);
    if (!current) return;
    const code = error.code || 'steam_price_failed';
    await finishIntegrationSyncRun(job.sync_run_id, { status: 'failed', errorsCount: 1,
      summary: { ...current.progress_json, baselinePreserved: true }, errorCode: code, errorMessage: 'Steam price refresh failed.' }, client);
    await client.query(`UPDATE steam_sync_jobs SET status = 'failed', error_code = $2, error_message = 'Steam price refresh failed.',
      completed_at = NOW(), locked_at = NULL, lease_token = NULL WHERE id = $1`, [job.id, code]);
    await client.query(`UPDATE user_external_accounts SET price_sync_status = 'failed', price_last_error = $2,
      price_revision = price_revision + 1,
      price_next_attempt_at = NOW() + ($3::double precision * INTERVAL '1 millisecond') WHERE id = $1`,
    [job.account_id, code, Math.max(priceRetryMs(1), Number(error.retryAfterMs) || 0)]);
  });
}
