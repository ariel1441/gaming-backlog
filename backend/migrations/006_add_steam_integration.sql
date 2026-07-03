CREATE TABLE IF NOT EXISTS user_external_accounts (
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

CREATE UNIQUE INDEX IF NOT EXISTS user_external_accounts_user_provider_active_unique
  ON user_external_accounts (user_id, provider)
  WHERE disconnected_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_external_accounts_provider_user_active_unique
  ON user_external_accounts (provider, provider_user_id)
  WHERE disconnected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_external_accounts_user_id
  ON user_external_accounts (user_id);

CREATE TABLE IF NOT EXISTS user_game_sources (
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
  first_imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  ignored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, provider_app_id)
);

CREATE INDEX IF NOT EXISTS idx_user_game_sources_user_catalog
  ON user_game_sources (user_id, catalog_game_id);

CREATE INDEX IF NOT EXISTS idx_user_game_sources_game_id
  ON user_game_sources (game_id);

CREATE TABLE IF NOT EXISTS steam_import_candidates (
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
  user_selected_catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  decision_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, steam_app_id)
);

CREATE INDEX IF NOT EXISTS idx_steam_import_candidates_user_status
  ON steam_import_candidates (user_id, import_status);

