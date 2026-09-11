// Run inside the migration transaction, before any destructive backfill.
// Applied migration files stay immutable; fresh upgrades get this guard.
export async function preflightMigration(client, filename) {
  if (filename !== '025_add_personal_genres.sql') return;
  await client.query('LOCK TABLE games IN SHARE ROW EXCLUSIVE MODE');
  const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM (
    SELECT g.id FROM games g
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(g.my_genre, ''), ',') AS part(value)
    WHERE trim(regexp_replace(part.value, '\\s+', ' ', 'g')) <> ''
    GROUP BY g.id
    HAVING COUNT(DISTINCT lower(trim(regexp_replace(part.value, '\\s+', ' ', 'g')))) > 10
  ) over_limit`);
  if (rows[0].count > 0) throw new Error(
    `Personal genre migration stopped: ${rows[0].count} games have more than 10 distinct legacy genres. ` +
    'Existing assignments were preserved. Review and explicitly resolve these entries before retrying migration 025.',
  );
}
