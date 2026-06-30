-- DEV RESET (optional)
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS catalog_collection_games;
DROP TABLE IF EXISTS catalog_collections;
DROP TABLE IF EXISTS catalog_search_cache;
DROP TABLE IF EXISTS external_game_ids;
DROP TABLE IF EXISTS catalog_games;
DROP TABLE IF EXISTS statuses;
DROP TABLE IF EXISTS users;

-- Users who own their games
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  guest_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Statuses (global lookup)
CREATE TABLE statuses (
  id SERIAL PRIMARY KEY,
  status TEXT UNIQUE NOT NULL,
  rank INTEGER NOT NULL
);

CREATE TABLE catalog_games (
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
  metadata_quality TEXT NOT NULL DEFAULT 'search_result'
    CHECK (metadata_quality IN ('search_result', 'full')),
  metadata_source TEXT NOT NULL DEFAULT 'rawg',
  metadata_fetched_at TIMESTAMPTZ,
  metadata_failed_at TIMESTAMPTZ,
  metadata_failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE external_game_ids (
  id SERIAL PRIMARY KEY,
  catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('rawg', 'steam', 'igdb', 'manual')),
  external_id TEXT NOT NULL,
  slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX external_game_ids_source_external_id_unique
  ON external_game_ids (source, external_id);

CREATE INDEX idx_external_game_ids_catalog_game_id
  ON external_game_ids (catalog_game_id);

CREATE TABLE catalog_search_cache (
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

CREATE UNIQUE INDEX catalog_search_cache_provider_query_unique
  ON catalog_search_cache (provider, query_key);

CREATE TABLE catalog_collections (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  provider TEXT NOT NULL DEFAULT 'rawg',
  source_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE catalog_collection_games (
  collection_id INTEGER NOT NULL REFERENCES catalog_collections(id) ON DELETE CASCADE,
  catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, catalog_game_id)
);

CREATE INDEX idx_catalog_collection_games_collection_rank
  ON catalog_collection_games (collection_id, rank);

CREATE INDEX idx_catalog_collection_games_catalog_game_id
  ON catalog_collection_games (catalog_game_id);

-- Games, owned by a user
CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_game_id INTEGER REFERENCES catalog_games(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL REFERENCES statuses(status),
  position INTEGER NOT NULL DEFAULT 1000,
  my_genre TEXT,
  how_long_to_beat INTEGER,
  my_score NUMERIC(3,1),           
  thoughts TEXT,
  cover TEXT,
  rawg_id INTEGER,
  rawg_slug TEXT,
  favorite_rank INTEGER CHECK (favorite_rank IS NULL OR favorite_rank BETWEEN 1 AND 5),
  started_at DATE,
  finished_at DATE
);

CREATE UNIQUE INDEX games_user_favorite_rank_unique
  ON games (user_id, favorite_rank)
  WHERE favorite_rank IS NOT NULL;

CREATE INDEX idx_games_catalog_game_id ON games (catalog_game_id);
