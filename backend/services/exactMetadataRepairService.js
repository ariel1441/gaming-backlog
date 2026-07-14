import { pool } from "../db.js";

const AUDIT_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE g.rawg_id IS NOT NULL)::int AS exact_identity_games,
    COUNT(*) FILTER (
      WHERE g.rawg_id IS NOT NULL AND g.catalog_game_id IS NULL
    )::int AS unlinked_exact_games,
    COUNT(*) FILTER (
      WHERE g.rawg_id IS NOT NULL
        AND g.catalog_game_id IS NULL
        AND exact.catalog_game_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM games duplicate
          WHERE duplicate.user_id = g.user_id
            AND duplicate.catalog_game_id = exact.catalog_game_id
            AND duplicate.id <> g.id
        )
    )::int AS safely_linkable_exact_games,
    COUNT(*) FILTER (
      WHERE g.rawg_id IS NOT NULL
        AND g.catalog_game_id IS NULL
        AND exact.catalog_game_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM games duplicate
          WHERE duplicate.user_id = g.user_id
            AND duplicate.catalog_game_id = exact.catalog_game_id
            AND duplicate.id <> g.id
        )
    )::int AS owner_catalog_collisions,
    COUNT(*) FILTER (
      WHERE g.rawg_id IS NOT NULL
        AND g.catalog_game_id IS NULL
        AND exact.catalog_game_id IS NULL
    )::int AS exact_games_missing_catalog_identity,
    COUNT(*) FILTER (
      WHERE g.rawg_id IS NOT NULL
        AND g.catalog_game_id IS NOT NULL
        AND exact.catalog_game_id IS NOT NULL
        AND g.catalog_game_id <> exact.catalog_game_id
    )::int AS conflicting_exact_links,
    COUNT(*) FILTER (
      WHERE g.catalog_game_id IS NOT NULL AND catalog.metadata_quality = 'full'
    )::int AS games_linked_to_full_catalog,
    COUNT(*) FILTER (
      WHERE g.catalog_game_id IS NOT NULL
        AND catalog.metadata_quality = 'search_result'
    )::int AS games_linked_to_search_catalog,
    COUNT(*) FILTER (
      WHERE g.catalog_game_id IS NULL AND g.rawg_id IS NULL
    )::int AS unlinked_title_only_games
  FROM games g
  LEFT JOIN external_game_ids exact
    ON exact.source = 'rawg' AND exact.external_id = g.rawg_id::text
  LEFT JOIN catalog_games catalog ON catalog.id = g.catalog_game_id
`;

export async function auditExactMetadataLinks(db = pool) {
  const { rows } = await db.query(AUDIT_SQL);
  return rows[0];
}

export async function repairExactMetadataLinks(dbPool = pool) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      ["metadata-repair", "rawg-exact-links"],
    );
    const before = await auditExactMetadataLinks(client);
    const repaired = await client.query(`
      UPDATE games game
         SET catalog_game_id = exact.catalog_game_id,
             rawg_slug = COALESCE(game.rawg_slug, exact.slug)
        FROM external_game_ids exact
       WHERE exact.source = 'rawg'
         AND exact.external_id = game.rawg_id::text
         AND game.rawg_id IS NOT NULL
         AND game.catalog_game_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM games duplicate
           WHERE duplicate.user_id = game.user_id
             AND duplicate.catalog_game_id = exact.catalog_game_id
             AND duplicate.id <> game.id
         )
      RETURNING game.id
    `);
    const after = await auditExactMetadataLinks(client);
    await client.query("COMMIT");
    return { before, repaired: repaired.rowCount, after };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
