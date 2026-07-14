import dotenv from "dotenv";

const args = new Set(process.argv.slice(2));
const production = args.has("--production");

dotenv.config({
  path: production && !process.env.DATABASE_URL ? ".env.production.local" : ".env",
  override: production && !process.env.DATABASE_URL,
});

function assertReadOnlyTarget(value) {
  if (!value) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (!production && !local) {
    throw new Error(`Refusing to audit non-local database "${parsed.host}" without --production.`);
  }
  if (production && local) {
    throw new Error("Production audit target must not be localhost.");
  }
  if (production && !args.has("--confirm-production")) {
    throw new Error("Production read-only audit requires --confirm-production.");
  }
}

assertReadOnlyTarget(process.env.DATABASE_URL);

const { pool } = await import("../backend/db.js");
const { auditExactMetadataLinks } = await import(
  "../backend/services/exactMetadataRepairService.js"
);

const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  const schema = await client.query(`
    SELECT
      to_regclass('public.catalog_games') IS NOT NULL AS has_catalog_games,
      to_regclass('public.catalog_provider_snapshots') IS NOT NULL AS has_provider_snapshots,
      to_regclass('public.metadata_jobs') IS NOT NULL AS has_metadata_jobs,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'cover'
      ) AS has_games_cover
  `);
  const backlog = await client.query(`
    SELECT
      COUNT(*)::int AS games_total,
      COUNT(*) FILTER (WHERE game.catalog_game_id IS NOT NULL)::int AS games_linked,
      COUNT(*) FILTER (WHERE game.catalog_game_id IS NULL)::int AS games_unlinked,
      COUNT(*) FILTER (WHERE game.catalog_game_id IS NULL AND game.rawg_id IS NOT NULL)::int
        AS games_unlinked_with_rawg_id,
      COUNT(*) FILTER (WHERE game.catalog_game_id IS NULL AND game.rawg_id IS NULL)::int
        AS games_unlinked_title_only,
      COUNT(*) FILTER (WHERE catalog.metadata_quality = 'full')::int AS games_linked_full,
      COUNT(*) FILTER (WHERE catalog.metadata_quality = 'search_result')::int
        AS games_linked_search_result,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(btrim(catalog.cover_url), ''), NULLIF(btrim(game.cover), '')) IS NULL
      )::int AS games_without_durable_cover,
      COUNT(*) FILTER (
        WHERE game.catalog_game_id IS NOT NULL AND catalog.id IS NULL
      )::int AS broken_catalog_links
    FROM games game
    LEFT JOIN catalog_games catalog ON catalog.id = game.catalog_game_id
  `);
  const catalog = await client.query(`
    SELECT
      COUNT(*)::int AS catalog_total,
      COUNT(*) FILTER (WHERE metadata_quality = 'full')::int AS catalog_full,
      COUNT(*) FILTER (WHERE metadata_quality = 'search_result')::int AS catalog_search_result,
      COUNT(*) FILTER (WHERE metadata_quality = 'full' AND description_html IS NULL)::int
        AS full_missing_description,
      COUNT(*) FILTER (WHERE metadata_quality = 'full' AND rawg_rating IS NULL)::int
        AS full_missing_rating,
      COUNT(*) FILTER (WHERE metadata_quality = 'full' AND cover_url IS NULL)::int
        AS full_missing_cover,
      COUNT(*) FILTER (WHERE metadata_retired_at IS NOT NULL)::int AS catalog_retired,
      COUNT(*) FILTER (WHERE metadata_failed_at IS NOT NULL)::int AS catalog_failed
    FROM catalog_games
  `);
  const operations = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM catalog_provider_snapshots) AS provider_snapshots,
      (SELECT COUNT(*)::int FROM metadata_jobs WHERE status IN ('queued', 'running', 'paused'))
        AS active_metadata_jobs,
      (SELECT COUNT(*)::int FROM game_metadata_candidates WHERE decision = 'pending')
        AS pending_match_candidates,
      (SELECT COUNT(*)::int FROM (
        SELECT source, external_id FROM external_game_ids
        GROUP BY source, external_id HAVING COUNT(*) > 1
      ) duplicate) AS duplicate_external_identity_groups
  `);
  const exactRepair = await auditExactMetadataLinks(client);
  await client.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        mode: production ? "production-read-only" : "local-read-only",
        schema: schema.rows[0],
        backlog: backlog.rows[0],
        catalog: catalog.rows[0],
        operations: operations.rows[0],
        exactRepair,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
