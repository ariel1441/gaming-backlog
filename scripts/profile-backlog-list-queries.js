// Diagnostic only: synthetic data in a newly created localhost database.
// Never imports the application server, providers, or an ordinary application pool.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { listOwnedGamesPageQuery, ownedGamesFacetsQuery } from '../backend/utils/gameAccess.js';
import { dropDisposableDatabase } from '../backend/testDatabase.js';

dotenv.config();
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = 'test-results/railway-list-query-profile.json';
// Refuse to write an accidentally publishable profiling artifact.
await exec('git', ['check-ignore', '--quiet', output], { cwd: root });
const url = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Profiling requires localhost');
const database = `backlog_profile_${crypto.randomUUID().replaceAll('-', '')}`;
const admin = new pg.Client({ connectionString: url.href });
let db, created = false;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const result = {
  generatedAt: new Date().toISOString(),
  revision: (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(),
  queryBuilderSha256: digest(await readFile(path.join(root, 'backend/utils/gameAccess.js'))),
  method: 'Live builders; synthetic linked libraries; ANALYZE; parity reads then three sequential EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) samples. No cache flush. Times exclude HTTP/row transfer/decoration/compression.',
  cases: [], dependencies: [],
};

async function query(built) { return db.query(built.text, built.values); }

async function seed(count, descriptionBytes) {
  assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name, database);
  await db.query('TRUNCATE users, catalog_games, statuses RESTART IDENTITY CASCADE');
  await db.query(`INSERT INTO users (id, username, password_hash) VALUES (1, 'synthetic_owner', 'fixture'), (2, 'synthetic_other', 'fixture');
    INSERT INTO statuses (status, rank) VALUES ('playing', 1), ('plan to play', 3), ('finished', 8), ('wishlist', 99);
    INSERT INTO user_personal_genres (id, user_id, name, normalized_name)
      VALUES (1, 1, 'Personal A', 'personal a'), (2, 1, 'Personal B', 'personal b')`);
  await db.query(`INSERT INTO catalog_games
    (id, name, canonical_title, description_html, genres_json, tags_json, stores_json,
     metadata_quality, rawg_rating, metacritic, rawg_playtime_hours, released_at)
    SELECT i, 'Catalog ' || i, 'Catalog ' || i,
      '<p>' || (SELECT string_agg(md5(i::text || ':' || chunk::text), '' ORDER BY chunk)
        FROM generate_series(1, $2::int / 32) chunk) || '</p>',
      CASE WHEN i % 2 = 0 THEN '["Action"]' ELSE '["RPG"]' END::jsonb,
      '["Singleplayer","Controller","Adventure","Replayable"]'::jsonb,
      '[{"store":{"id":1,"name":"Steam"}}]'::jsonb,
      'full', 4.25, 85, 20, '2026-01-01'
    FROM generate_series(1, $1::int) i`, [count, descriptionBytes]);
  await db.query(`INSERT INTO games (id, user_id, catalog_game_id, name, status, position, how_long_to_beat, my_score, thoughts, rawg_id)
    SELECT i, 1, i, 'Game ' || lpad(i::text, 6, '0'),
      CASE i % 3 WHEN 0 THEN 'playing' WHEN 1 THEN 'plan to play' ELSE 'finished' END,
      i * 1000, 20, (i % 10)::numeric, 'Synthetic notes', 100000 + i
    FROM generate_series(1, $1::int) i`, [count]);
  await db.query(`INSERT INTO games (id, user_id, catalog_game_id, name, status, position)
    VALUES (999999, 2, $1, 'Foreign owner game', 'playing', 1000)`, [count]);
  await db.query(`INSERT INTO user_game_sources
    (user_id, game_id, catalog_game_id, provider, provider_app_id, playtime_minutes_forever,
     last_synced_at, last_played_at, achievements_total, achievements_unlocked, achievements_percent, achievements_status)
    SELECT 1, i, i, 'steam', (200000 + i)::text, i * 20,
      '2026-10-01', '2026-10-01', 10, i % 11, (i % 11) * 10, 'synced'
    FROM generate_series(1, $1::int) i`, [count]);
  await db.query(`INSERT INTO steam_import_candidates (user_id, steam_app_id, steam_name)
    SELECT 1, (200000 + i)::text, 'Steam name ' || i FROM generate_series(1, $1::int) i`, [count]);
  await db.query(`INSERT INTO game_personal_genres (user_id, game_id, personal_genre_id, position)
    SELECT 1, i, genre, genre - 1 FROM generate_series(1, $1::int) i CROSS JOIN generate_series(1, 2) genre`, [count]);
  await db.query("INSERT INTO user_play_focus_games (user_id, game_id, focus_role) VALUES (1, 1, 'main'), (1, 2, 'side')");
  await db.query('ANALYZE');
}

function nodes(plan, found = []) {
  found.push(plan);
  for (const child of plan.Plans || []) nodes(child, found);
  return found;
}

async function measure(built) {
  const samples = [];
  for (let index = 0; index < 3; index++) {
    const { rows } = await db.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) ${built.text}`, built.values);
    samples.push(rows[0]['QUERY PLAN'][0]);
  }
  const ordered = [...samples].sort((a, b) => a['Execution Time'] - b['Execution Time']);
  const median = ordered[1], tree = nodes(median.Plan);
  return {
    executionMs: samples.map(sample => sample['Execution Time']),
    medianMs: median['Execution Time'],
    sharedHitBlocks: median.Plan['Shared Hit Blocks'] || 0,
    sharedReadBlocks: median.Plan['Shared Read Blocks'] || 0,
    tempReadBlocks: median.Plan['Temp Read Blocks'] || 0,
    tempWrittenBlocks: median.Plan['Temp Written Blocks'] || 0,
    ctes: tree.filter(node => node['Subplan Name']?.startsWith('CTE ')).map(node => ({
      name: node['Subplan Name'], rows: node['Actual Rows'], loops: node['Actual Loops'],
    })),
    maxNodeLoops: Math.max(...tree.map(node => node['Actual Loops'] || 0)),
    plans: samples,
  };
}

async function dependencies(count) {
  const built = listOwnedGamesPageQuery(1, { limit: 12 });
  const baseline = (await query(built)).rows;
  assert.ok(!baseline.some(row => row.id === count), 'dependency target must be off the first page');
  const version = baseline[0].snapshot_version;
  const foreignVersion = (await query(listOwnedGamesPageQuery(2, { limit: 12 }))).rows[0].snapshot_version;
  const checks = [
    ['off-page game notes', 'UPDATE games SET thoughts = thoughts || $2 WHERE id = $1 AND user_id = 1'],
    ['off-page game status', "UPDATE games SET status = 'finished' WHERE id = $1 AND user_id = 1"],
    ['game ordering', 'UPDATE games SET position = position + 1 WHERE id = $1 AND user_id = 1'],
    ['catalog description shared across owners', 'UPDATE catalog_games SET description_html = description_html || $2 WHERE id = $1', true, true],
    ['catalog genres/facets', `UPDATE catalog_games SET genres_json = '["Strategy"]' WHERE id = $1`],
    ['catalog scores/sorting', 'UPDATE catalog_games SET rawg_rating = 4.50 WHERE id = $1'],
    ['Steam playtime', 'UPDATE user_game_sources SET playtime_minutes_forever = playtime_minutes_forever + 1 WHERE game_id = $1 AND user_id = 1'],
    ['Steam achievements', "UPDATE user_game_sources SET achievements_status = 'private' WHERE game_id = $1 AND user_id = 1"],
    ['Steam name', "UPDATE steam_import_candidates SET steam_name = steam_name || $2 WHERE steam_app_id = (200000 + $1)::text AND user_id = 1"],
    ['Steam source eligibility', "UPDATE user_game_sources SET source_status = 'ignored' WHERE game_id = $1 AND user_id = 1"],
    ['Steam selected-source replacement', `INSERT INTO user_game_sources (user_id, game_id, provider, provider_app_id, playtime_minutes_forever, last_synced_at)
      VALUES (1, $1, 'steam', '900000000', 100, '2099-01-01')`],
    ['focus membership', "INSERT INTO user_play_focus_games (user_id, game_id, focus_role) VALUES (1, $1, 'occasional')"],
    ['personal genre rename', "UPDATE user_personal_genres SET name = name || ' renamed' WHERE id = 1 AND user_id = 1"],
    ['personal genre membership', 'DELETE FROM game_personal_genres WHERE game_id = $1 AND user_id = 1 AND personal_genre_id = 2'],
    ['status rank dictionary', "UPDATE statuses SET rank = rank + 1 WHERE status = 'playing'"],
    ['Wishlist exclusion', "UPDATE games SET status = 'wishlist' WHERE id = $1 AND user_id = 1"],
    ['game deletion', 'DELETE FROM games WHERE id = $1 AND user_id = 1'],
    ['game insertion', "INSERT INTO games (id, user_id, name, status, position) VALUES ($1 + 1, 1, 'Synthetic addition', 'playing', 0)"],
    ['foreign owner game edit', "UPDATE games SET thoughts = 'Foreign edit' WHERE user_id = 2", false],
    ['unselected catalog timestamp', 'UPDATE catalog_games SET updated_at = NOW() WHERE id = $1', false],
  ];
  for (const [name, sql, expected = true, shared = false] of checks) {
    await db.query('BEGIN');
    try {
      // PostgreSQL rejects extra bind arguments, so bind only placeholders used.
      const values = sql.includes('$2') ? [count, ' changed'] : sql.includes('$1') ? [count] : [];
      await db.query(sql, values);
      const changed = (await query(built)).rows[0].snapshot_version !== version;
      assert.equal(changed, expected, name);
      if (shared) assert.notEqual((await query(listOwnedGamesPageQuery(2, { limit: 12 }))).rows[0].snapshot_version, foreignVersion);
      result.dependencies.push({ name, changed, expected, sharedCatalogFanout: shared });
    } finally { await db.query('ROLLBACK'); }
  }
  // Reorder two assigned genres without violating immediate position uniqueness.
  await db.query('BEGIN');
  try {
    await db.query('UPDATE game_personal_genres SET position = position + 2 WHERE game_id = $1', [count]);
    await db.query('UPDATE game_personal_genres SET position = 3 - position WHERE game_id = $1', [count]);
    assert.notEqual((await query(built)).rows[0].snapshot_version, version);
    result.dependencies.push({ name: 'personal genre order', changed: true, expected: true });
  } finally { await db.query('ROLLBACK'); }
}

try {
  await admin.connect(); await admin.query(`CREATE DATABASE ${database}`); created = true;
  url.pathname = `/${database}`;
  await exec(process.execPath, ['scripts/db-migrate.js'], {
    cwd: root, env: { ...process.env, DATABASE_URL: url.href, PGSSL: 'false', NODE_ENV: 'test' },
  });
  db = new pg.Client({ connectionString: url.href }); await db.connect();
  await db.query("SET statement_timeout = '30s'");
  result.postgres = (await db.query("SELECT version(), current_setting('work_mem') AS work_mem, current_setting('jit') AS jit")).rows[0];
  for (const descriptionBytes of [1024, 16384]) {
    for (const count of [100, 1000, 5000]) {
      await seed(count, descriptionBytes);
      const first = listOwnedGamesPageQuery(1, { limit: 12 });
      const next = listOwnedGamesPageQuery(1, { limit: 100, offset: 12 });
      const facets = ownedGamesFacetsQuery(1);
      const filtered = listOwnedGamesPageQuery(1, { limit: 12, status: 'playing', genre: 'Action', sort: 'score', direction: 'desc' });
      const firstRows = (await query(first)).rows, nextRows = (await query(next)).rows;
      const facetRow = (await query(facets)).rows[0], filteredRows = (await query(filtered)).rows;
      assert.equal(firstRows.length, 12); assert.equal(firstRows[0].total_count, count);
      assert.equal(nextRows.length, Math.min(100, count - 12));
      assert.equal(nextRows[0].snapshot_version, firstRows[0].snapshot_version);
      assert.equal(facetRow.snapshot_version, firstRows[0].snapshot_version);
      assert.equal(facetRow.collection_total, count);
      assert.equal(filteredRows[0].total_count, Math.floor(count / 6));
      assert.ok(firstRows.every(row => row.user_id === 1));
      assert.equal(new Set([...firstRows, ...nextRows].map(row => row.id)).size, firstRows.length + nextRows.length);
      // Invalid as a production revision. This control ONLY estimates the effect
      // of removing row serialization/hashing; planner choices may also change.
      const hash = "MD5(COUNT(*)::text || ':' || COALESCE(SUM(hashtextextended(filtered::text, 0)), 0)::text)";
      assert.ok(first.text.includes(hash));
      const control = { ...first, text: first.text.replace(hash, "'diagnostic-only-no-hash'::text") };
      const profile = { count, descriptionBytes, firstRawJsonBytes: Buffer.byteLength(JSON.stringify(firstRows)), queries: {} };
      for (const [name, built] of Object.entries({ first12: first, next100: next, facets, filtered12: filtered, noHashControl12: control })) {
        profile.queries[name] = await measure(built);
      }
      result.cases.push(profile);
      console.log(JSON.stringify({ count, descriptionBytes, medianMs: Object.fromEntries(Object.entries(profile.queries).map(([name, value]) => [name, value.medianMs])) }));
      if (descriptionBytes === 1024 && count === 100) await dependencies(count);
    }
  }
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + '\n');
  console.log(`Saved ignored synthetic plans to ${output}; ${result.dependencies.length} dependency assertions passed.`);
} finally {
  await db?.end();
  if (created) await dropDisposableDatabase(admin, database);
  await admin.end();
}
