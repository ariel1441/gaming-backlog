import { pool } from '../db.js';
import { createSteamPriceFeedLeaseToken, fetchSteamPriceChangeFeed, STEAM_PRICE_FEED_OVERLAP_SECONDS } from './steamPriceFeedProvider.js';

export const STEAM_PRICE_FEED_REFRESH_MS = 20 * 60 * 60 * 1000;
export const STEAM_PRICE_FEED_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const STEAM_PRICE_FEED_LEASE_MS = 15 * 60 * 1000;

async function transaction(work) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function changesSince(client, since) {
  const { rows } = await client.query(
    `SELECT app_id FROM steam_price_feed_changes
      WHERE price_candidate_at >= $1
      ORDER BY app_id`,
    [since],
  );
  return rows.map((row) => row.app_id);
}

async function readCursor(client) {
  const { rows } = await client.query('SELECT * FROM steam_price_feed_cursor WHERE id = 1');
  return rows[0] || null;
}

async function recentFeed(client, cursor) {
  const since = cursor.last_success_at
    ? new Date(new Date(cursor.last_success_at).getTime() - STEAM_PRICE_FEED_OVERLAP_SECONDS * 1000)
    : new Date(0);
  return {
    mode: 'delta',
    changedAppIds: await changesSince(client, since),
    lastSuccessAt: cursor.last_success_at,
    cursorModifiedSince: Number(cursor.cursor_modified_since) || 0,
    feedErrorCode: null,
  };
}

async function claimFeedScan() {
  const leaseToken = createSteamPriceFeedLeaseToken();
  return transaction(async (client) => {
    await client.query(
      `INSERT INTO steam_price_feed_cursor (id) VALUES (1)
       ON CONFLICT (id) DO NOTHING`,
    );
    const { rows } = await client.query(
      `UPDATE steam_price_feed_cursor
          SET lease_token = $1, lease_expires_at = NOW() + ($2::double precision * INTERVAL '1 millisecond'),
              last_attempt_at = NOW(), last_error_code = NULL
        WHERE id = 1
          AND (last_success_at IS NULL OR last_success_at <= NOW() - ($3::double precision * INTERVAL '1 millisecond'))
          AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
        RETURNING *`,
      [leaseToken, STEAM_PRICE_FEED_LEASE_MS, STEAM_PRICE_FEED_REFRESH_MS],
    );
    if (rows[0]) return { acquired: true, cursor: rows[0], leaseToken };
    const cursor = await readCursor(client);
    return { acquired: false, cursor, leaseToken: null };
  });
}

async function releaseFailedScan(leaseToken, error) {
  await pool.query(
    `UPDATE steam_price_feed_cursor
        SET lease_token = NULL, lease_expires_at = NULL,
            last_error_code = $2, last_error_at = NOW()
      WHERE id = 1 AND lease_token = $1`,
    [leaseToken, error?.code || 'steam_price_feed_failed'],
  );
}

export async function ensureSteamPriceFeed() {
  const claim = await claimFeedScan();
  if (!claim.cursor) return { mode: 'fallback', changedAppIds: [], feedErrorCode: 'steam_price_feed_unavailable' };
  if (!claim.acquired) {
    if (claim.cursor.last_success_at && new Date(claim.cursor.last_success_at).getTime() > Date.now() - STEAM_PRICE_FEED_REFRESH_MS) {
      return recentFeed({ query: (...args) => pool.query(...args) }, claim.cursor);
    }
    return { mode: 'fallback', changedAppIds: [], feedErrorCode: claim.cursor.last_error_code || 'steam_price_feed_busy' };
  }

  const scanStartedAt = Math.floor(Date.now() / 1000);
  try {
    const scan = await fetchSteamPriceChangeFeed({ ifModifiedSince: Number(claim.cursor.cursor_modified_since) || 0 });
    const result = await transaction(async (client) => {
      const locked = await readCursor(client);
      if (!locked || locked.lease_token !== claim.leaseToken) return null;
      const prior = new Map();
      if (scan.apps.length) {
        const existing = await client.query(
          'SELECT app_id, price_change_number FROM steam_price_feed_changes WHERE app_id = ANY($1::text[])',
          [scan.apps.map((item) => item.appId)],
        );
        for (const row of existing.rows) prior.set(row.app_id, row.price_change_number);
      }
      const candidates = scan.apps.filter((item) => !prior.has(item.appId) ||
        item.priceChangeNumber == null || prior.get(item.appId) !== item.priceChangeNumber);
      const candidateIds = new Set(candidates.map((item) => item.appId));
      for (const change of scan.apps) {
        const candidate = candidateIds.has(change.appId);
        await client.query(
          `INSERT INTO steam_price_feed_changes (app_id, last_modified, price_change_number, last_seen_at, price_candidate_at)
           VALUES ($1, $2, $3, NOW(), CASE WHEN $4::boolean THEN NOW() END)
           ON CONFLICT (app_id) DO UPDATE SET
             last_modified = GREATEST(steam_price_feed_changes.last_modified, EXCLUDED.last_modified),
             price_change_number = CASE WHEN EXCLUDED.last_modified >= steam_price_feed_changes.last_modified
               THEN EXCLUDED.price_change_number ELSE steam_price_feed_changes.price_change_number END,
             last_seen_at = NOW(),
             price_candidate_at = CASE WHEN $4::boolean THEN NOW() ELSE steam_price_feed_changes.price_candidate_at END`,
          [change.appId, change.lastModified, change.priceChangeNumber, candidate],
        );
      }
      await client.query(
        `DELETE FROM steam_price_feed_changes WHERE last_seen_at < NOW() - ($1::double precision * INTERVAL '1 millisecond')`,
        [STEAM_PRICE_FEED_RETENTION_MS],
      );
      const cursorModifiedSince = Math.max(0, scanStartedAt - STEAM_PRICE_FEED_OVERLAP_SECONDS);
      const { rows } = await client.query(
        `UPDATE steam_price_feed_cursor
            SET cursor_modified_since = $2, last_success_at = NOW(), last_error_code = NULL,
                last_error_at = NULL, lease_token = NULL, lease_expires_at = NULL
          WHERE id = 1 AND lease_token = $1
          RETURNING *`,
        [claim.leaseToken, cursorModifiedSince],
      );
      if (!rows[0]) return null;
      return { cursor: rows[0], changedAppIds: candidates.map((item) => item.appId), pages: scan.pages };
    });
    if (!result) return { mode: 'fallback', changedAppIds: [], feedErrorCode: 'steam_price_feed_lease_lost' };
    return { mode: 'delta', changedAppIds: [...new Set(result.changedAppIds)], pages: result.pages,
      lastSuccessAt: result.cursor.last_success_at, cursorModifiedSince: result.cursor.cursor_modified_since, feedErrorCode: null };
  } catch (error) {
    await releaseFailedScan(claim.leaseToken, error);
    return { mode: 'fallback', changedAppIds: [], feedErrorCode: error?.code || 'steam_price_feed_failed' };
  }
}
