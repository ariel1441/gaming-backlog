CREATE TABLE IF NOT EXISTS catalog_games (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  canonical_title TEXT,
  slug TEXT,
  cover_url TEXT,
  released_at DATE,
  description_html TEXT,
  rawg_rating NUMERIC(3,2),
  metacritic INTEGER,
  rawg_playtime_hours INTEGER,
  genres_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  stores_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_quality TEXT NOT NULL DEFAULT 'search_result',
  metadata_source TEXT NOT NULL DEFAULT 'rawg',
  metadata_fetched_at TIMESTAMPTZ,
  metadata_failed_at TIMESTAMPTZ,
  metadata_failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_games_metadata_quality_check
    CHECK (metadata_quality IN ('search_result', 'full'))
);

CREATE TABLE IF NOT EXISTS external_game_ids (
  id SERIAL PRIMARY KEY,
  catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT external_game_ids_source_check
    CHECK (source IN ('rawg', 'steam', 'igdb', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS external_game_ids_source_external_id_unique
  ON external_game_ids (source, external_id);

CREATE INDEX IF NOT EXISTS idx_external_game_ids_catalog_game_id
  ON external_game_ids (catalog_game_id);

CREATE TABLE IF NOT EXISTS catalog_search_cache (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  query_key TEXT NOT NULL,
  result_catalog_game_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_search_cache_provider_query_unique
  ON catalog_search_cache (provider, query_key);

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS catalog_game_id INTEGER REFERENCES catalog_games(id);

CREATE INDEX IF NOT EXISTS idx_games_catalog_game_id
  ON games (catalog_game_id);

WITH distinct_rawg_games AS (
  SELECT DISTINCT ON (rawg_id)
    rawg_id,
    NULLIF(rawg_slug, '') AS rawg_slug,
    name
  FROM games
  WHERE rawg_id IS NOT NULL
  ORDER BY rawg_id, id
),
inserted_catalog AS (
  INSERT INTO catalog_games (
    name,
    canonical_title,
    slug,
    metadata_quality,
    metadata_source
  )
  SELECT
    name,
    name,
    rawg_slug,
    'search_result',
    'rawg'
  FROM distinct_rawg_games
  WHERE NOT EXISTS (
    SELECT 1
    FROM external_game_ids existing
    WHERE existing.source = 'rawg'
      AND existing.external_id = distinct_rawg_games.rawg_id::text
  )
  RETURNING id, name, slug
),
available_catalog AS (
  SELECT id, name, slug FROM catalog_games
  UNION ALL
  SELECT id, name, slug FROM inserted_catalog
),
catalog_candidates AS (
  SELECT
    d.rawg_id,
    d.rawg_slug,
    cg.id AS catalog_game_id,
    ROW_NUMBER() OVER (
      PARTITION BY d.rawg_id
      ORDER BY
        CASE WHEN cg.slug IS NOT DISTINCT FROM d.rawg_slug THEN 0 ELSE 1 END,
        cg.id DESC
    ) AS candidate_rank
  FROM distinct_rawg_games d
  JOIN available_catalog cg
    ON cg.name = d.name
   AND (
     d.rawg_slug IS NULL
     OR cg.slug = d.rawg_slug
   )
  WHERE NOT EXISTS (
    SELECT 1
    FROM external_game_ids existing
    WHERE existing.source = 'rawg'
      AND existing.external_id = d.rawg_id::text
  )
)
INSERT INTO external_game_ids (catalog_game_id, source, external_id, slug)
SELECT
  c.catalog_game_id,
  'rawg',
  c.rawg_id::text,
  c.rawg_slug
FROM catalog_candidates c
WHERE c.candidate_rank = 1
ON CONFLICT (source, external_id) DO NOTHING;

UPDATE games g
SET catalog_game_id = e.catalog_game_id
FROM external_game_ids e
WHERE e.source = 'rawg'
  AND e.external_id = g.rawg_id::text
  AND g.catalog_game_id IS NULL;
