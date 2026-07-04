-- DEV RESET (optional)
DROP TABLE IF EXISTS steam_import_candidates;
DROP TABLE IF EXISTS user_game_sources;
DROP TABLE IF EXISTS user_external_accounts;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS catalog_collection_games;
DROP TABLE IF EXISTS catalog_collections;
DROP TABLE IF EXISTS catalog_search_cache;
DROP TABLE IF EXISTS external_game_ids;
DROP TABLE IF EXISTS catalog_games;
DROP TABLE IF EXISTS statuses;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS users;

-- Users who own their games
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  guest_expires_at TIMESTAMPTZ,
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) <= 40),
  bio TEXT CHECK (bio IS NULL OR char_length(bio) <= 240),
  avatar_icon TEXT NOT NULL DEFAULT 'gamepad'
    CHECK (
      avatar_icon IN (
        'gamepad',
        'joystick',
        'dice',
        'trophy',
        'crown',
        'flame',
        'star',
        'skull',
        'sword',
        'shield',
        'book',
        'rocket',
        'heart',
        'zap',
        'compass',
        'potion',
        'hourglass',
        'headphones',
        'rune',
        'mask',
        'cards',
        'axe',
        'crystal',
        'leaf',
        'flower',
        'coffee',
        'cpu',
        'eye'
      )
    ),
  avatar_color TEXT NOT NULL DEFAULT 'orange'
    CHECK (
      avatar_color IN (
        'orange',
        'blue',
        'green',
        'pink',
        'violet',
        'gold',
        'slate',
        'red'
      )
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_backlog_view TEXT NOT NULL DEFAULT 'grid'
    CHECK (default_backlog_view IN ('grid', 'compact', 'list')),
  default_backlog_sort_key TEXT NOT NULL DEFAULT ''
    CHECK (
      default_backlog_sort_key IN (
        '',
        'name',
        'hoursPlayed',
        'rawgRating',
        'metacritic',
        'releaseDate',
        'startedDate',
        'finishedDate',
        'steamLastPlayed'
      )
    ),
  default_backlog_sort_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  default_landing_path TEXT NOT NULL DEFAULT '/'
    CHECK (
      default_landing_path IN (
        '/',
        '/me',
        '/timeline',
        '/discover',
        '/insights'
      )
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  hours_preferred_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (hours_preferred_source IN ('auto', 'estimate', 'steam_actual')),
  hours_locked BOOLEAN NOT NULL DEFAULT FALSE,
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

CREATE TABLE user_external_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('steam')),
  provider_user_id TEXT NOT NULL,
  display_name TEXT,
  profile_url TEXT,
  avatar_url TEXT,
  visibility_state INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'linked'
    CHECK (sync_status IN ('linked', 'syncing', 'synced', 'private', 'failed', 'disconnected')),
  last_profile_sync_at TIMESTAMPTZ,
  last_library_sync_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX user_external_accounts_user_provider_active_unique
  ON user_external_accounts (user_id, provider)
  WHERE disconnected_at IS NULL;

CREATE UNIQUE INDEX user_external_accounts_provider_user_active_unique
  ON user_external_accounts (provider, provider_user_id)
  WHERE disconnected_at IS NULL;

CREATE INDEX idx_user_external_accounts_user_id
  ON user_external_accounts (user_id);

CREATE TABLE user_game_sources (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('steam')),
  provider_app_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'owned'
    CHECK (relationship IN ('owned')),
  source_status TEXT NOT NULL DEFAULT 'owned'
    CHECK (source_status IN ('owned', 'ignored', 'disconnected')),
  playtime_minutes_forever INTEGER,
  last_played_at TIMESTAMPTZ,
  first_play_observed_at TIMESTAMPTZ,
  first_play_observed_playtime_minutes INTEGER,
  achievements_unlocked INTEGER,
  achievements_total INTEGER,
  achievements_percent NUMERIC(5,2),
  achievements_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (achievements_status IN ('unknown', 'synced', 'none', 'private', 'unavailable', 'failed')),
  achievements_last_synced_at TIMESTAMPTZ,
  achievements_last_error_code TEXT,
  achievements_last_error_message TEXT,
  first_imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  ignored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, provider_app_id)
);

CREATE INDEX idx_user_game_sources_user_catalog
  ON user_game_sources (user_id, catalog_game_id);

CREATE INDEX idx_user_game_sources_game_id
  ON user_game_sources (game_id);

CREATE INDEX idx_user_game_sources_steam_achievements
  ON user_game_sources (user_id, achievements_status, achievements_percent)
  WHERE provider = 'steam' AND source_status = 'owned';

CREATE INDEX idx_user_game_sources_steam_first_play_observed
  ON user_game_sources (user_id, first_play_observed_at DESC)
  WHERE provider = 'steam'
    AND source_status = 'owned'
    AND first_play_observed_at IS NOT NULL;

CREATE TABLE steam_import_candidates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  steam_app_id TEXT NOT NULL,
  steam_name TEXT NOT NULL,
  steam_icon_url TEXT,
  playtime_minutes_forever INTEGER,
  last_played_at TIMESTAMPTZ,
  proposed_catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  duplicate_game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  match_confidence TEXT NOT NULL DEFAULT 'none'
    CHECK (match_confidence IN ('exact', 'title', 'weak', 'none')),
  match_reason TEXT,
  import_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (import_status IN ('pending', 'accepted', 'attached', 'ignored', 'imported')),
  filtered_reason TEXT,
  suggested_status TEXT,
  suggested_status_reason TEXT,
  suggested_status_confidence TEXT
    CHECK (
      suggested_status_confidence IS NULL OR
      suggested_status_confidence IN ('high', 'medium', 'low')
    ),
  selected_status TEXT,
  user_selected_catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  decision_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, steam_app_id)
);

CREATE INDEX idx_steam_import_candidates_user_status
  ON steam_import_candidates (user_id, import_status);

CREATE INDEX idx_steam_import_candidates_user_match
  ON steam_import_candidates (user_id, match_confidence, import_status);
