import { pool } from "../db.js";
import { forbidden, notFound } from "../utils/httpError.js";

export async function assertSteamUser(userId, client = pool) {
  const { rows } = await client.query(
    "SELECT is_guest FROM users WHERE id = $1",
    [userId],
  );
  if (!rows[0]) throw notFound("Account not found.");
  if (rows[0].is_guest)
    throw forbidden("Steam sync is unavailable for demo accounts.");
}

// All sync writers lock job first, account second. Disconnect/relink follows
// the same order. No provider request may run inside this critical section.
export async function lockSteamSyncJob(client, job) {
  const { rows } = await client.query(
    "SELECT * FROM steam_sync_jobs WHERE id = $1 AND status = 'running' AND lease_token = $2 FOR UPDATE",
    [job.id, job.lease_token],
  );
  if (!rows[0]) return null;
  const current = rows[0];
  const account = await client.query(
    `SELECT account.id, account.auto_sync_enabled FROM user_external_accounts account JOIN users ON users.id = account.user_id
      WHERE account.id = $1 AND account.user_id = $2 AND account.disconnected_at IS NULL
        AND users.is_guest = FALSE AND ($3::text IS NULL OR account.provider_user_id = $3)
      FOR UPDATE OF account`,
    [current.account_id, current.user_id, current.provider_user_id],
  );
  const optedOut = account.rows[0] && current.trigger_type === 'scheduled' && !account.rows[0].auto_sync_enabled;
  if (account.rows[0] && !optedOut) return current;
  await client.query(
    "UPDATE steam_sync_jobs SET status = 'cancelled', locked_at = NULL, lease_token = NULL, completed_at = NOW() WHERE id = $1",
    [current.id],
  );
  if (current.sync_run_id)
    await client.query(
      "UPDATE integration_sync_runs SET status = 'skipped', finished_at = NOW(), summary_json = jsonb_build_object('reason', $2::text) WHERE id = $1",
      [current.sync_run_id, optedOut ? 'auto_sync_disabled' : 'account_changed'],
    );
  if (optedOut) await client.query(
    `UPDATE user_external_accounts SET
      sync_status = CASE WHEN $2 = 'library' THEN CASE WHEN last_library_sync_at IS NULL THEN 'linked' ELSE 'synced' END ELSE sync_status END,
      wishlist_sync_status = CASE WHEN $2 = 'wishlist' THEN CASE WHEN last_wishlist_sync_at IS NULL THEN 'never' ELSE 'synced' END ELSE wishlist_sync_status END,
      price_sync_status = CASE WHEN $2 = 'wishlist_prices' THEN 'cancelled' ELSE price_sync_status END,
      price_revision = price_revision + CASE WHEN $2 = 'wishlist_prices' THEN 1 ELSE 0 END,
      updated_at = NOW() WHERE id = $1`, [current.account_id, current.sync_kind || 'library'],
  );
  return null;
}

export async function invalidateSteamSyncJobs(client, userId) {
  await client.query(
    `WITH cancelled AS (
       UPDATE steam_sync_jobs SET status = 'cancelled', completed_at = NOW(),
         locked_at = NULL, lease_token = NULL, updated_at = NOW()
       WHERE user_id = $1 AND status IN ('queued', 'running') RETURNING sync_run_id
     ) UPDATE integration_sync_runs SET status = 'skipped', finished_at = NOW(),
         summary_json = '{"reason":"account_changed"}'::jsonb
       WHERE id IN (SELECT sync_run_id FROM cancelled)`,
    [userId],
  );
}
