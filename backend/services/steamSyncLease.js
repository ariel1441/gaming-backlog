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
    `SELECT account.id FROM user_external_accounts account JOIN users ON users.id = account.user_id
      WHERE account.id = $1 AND account.user_id = $2 AND account.disconnected_at IS NULL
        AND users.is_guest = FALSE AND ($3::text IS NULL OR account.provider_user_id = $3)
      FOR UPDATE OF account`,
    [current.account_id, current.user_id, current.provider_user_id],
  );
  if (account.rows[0]) return current;
  await client.query(
    "UPDATE steam_sync_jobs SET status = 'cancelled', locked_at = NULL, lease_token = NULL, completed_at = NOW() WHERE id = $1",
    [current.id],
  );
  if (current.sync_run_id)
    await client.query(
      "UPDATE integration_sync_runs SET status = 'skipped', finished_at = NOW(), summary_json = '{\"reason\":\"account_changed\"}'::jsonb WHERE id = $1",
      [current.sync_run_id],
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
