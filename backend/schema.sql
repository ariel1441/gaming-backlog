-- DEV RESET (optional)
DROP TABLE IF EXISTS steam_import_candidates;
DROP TABLE IF EXISTS user_game_sources;
DROP TABLE IF EXISTS steam_sync_jobs;
DROP TABLE IF EXISTS user_external_accounts;
DROP TABLE IF EXISTS steam_link_transactions;
DROP TABLE IF EXISTS user_list_games;
DROP TABLE IF EXISTS user_lists;
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
  cover_source TEXT CHECK (cover_source IS NULL OR btrim(cover_source) <> ''),
  cover_external_id TEXT,
  cover_pinned BOOLEAN NOT NULL DEFAULT FALSE,
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
  metadata_normalization_version INTEGER NOT NULL DEFAULT 1
    CHECK (metadata_normalization_version > 0),
  metadata_next_refresh_at TIMESTAMPTZ,
  metadata_retired_at TIMESTAMPTZ,
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

CREATE TABLE catalog_provider_snapshots (
  id BIGSERIAL PRIMARY KEY,
  catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (btrim(provider) <> ''),
  provider_game_id TEXT NOT NULL CHECK (btrim(provider_game_id) <> ''),
  payload_json JSONB NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  payload_hash TEXT NOT NULL CHECK (btrim(payload_hash) <> ''),
  normalization_version INTEGER NOT NULL DEFAULT 1 CHECK (normalization_version > 0),
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (catalog_game_id, provider, payload_hash)
);

CREATE INDEX catalog_provider_snapshots_catalog_fetched
  ON catalog_provider_snapshots (catalog_game_id, provider, fetched_at DESC, id DESC);

CREATE INDEX catalog_provider_snapshots_identity_fetched
  ON catalog_provider_snapshots (provider, provider_game_id, fetched_at DESC, id DESC);

CREATE OR REPLACE FUNCTION prevent_catalog_provider_snapshot_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'catalog provider snapshots are append-only'
    USING ERRCODE = '23514';
END $$;

CREATE TRIGGER catalog_provider_snapshots_append_only
  BEFORE UPDATE ON catalog_provider_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_catalog_provider_snapshot_update();

CREATE TABLE metadata_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL
    CHECK (job_type IN (
      'backlog_repair',
      'catalog_refresh',
      'cache_import',
      'exact_backfill',
      'discover_ingest'
    )),
  scope_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  scope_catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE CASCADE,
  requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  parameters_json JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(parameters_json) = 'object'),
  cursor_json JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(cursor_json) = 'object'),
  total_count INTEGER CHECK (total_count IS NULL OR total_count >= 0),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  linked_count INTEGER NOT NULL DEFAULT 0 CHECK (linked_count >= 0),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  unmatched_count INTEGER NOT NULL DEFAULT 0 CHECK (unmatched_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX metadata_jobs_one_active_per_scope
  ON metadata_jobs (
    job_type,
    COALESCE(scope_user_id, 0),
    COALESCE(scope_catalog_game_id, 0)
  )
  WHERE status IN ('queued', 'running', 'paused');

CREATE INDEX metadata_jobs_runnable
  ON metadata_jobs (status, next_attempt_at, lease_expires_at, created_at, id)
  WHERE status IN ('queued', 'running');

CREATE INDEX metadata_jobs_scope_user_updated
  ON metadata_jobs (scope_user_id, updated_at DESC, id DESC)
  WHERE scope_user_id IS NOT NULL;

-- Games, owned by a user
CREATE OR REPLACE FUNCTION normalize_game_title_sql(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT trim(
    replace(replace(replace(replace(replace(replace(
      ' ' || trim(regexp_replace(translate(lower(COALESCE(value, '')), '''' || chr(8217) || chr(8216) || chr(700), ''), '[^a-z0-9]+', ' ', 'g')) || ' ',
      ' vii ', ' 7 '), ' vi ', ' 6 '), ' v ', ' 5 '),
      ' iv ', ' 4 '), ' iii ', ' 3 '), ' ii ', ' 2 ')
  );
$function$;

CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_game_id INTEGER REFERENCES catalog_games(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL REFERENCES statuses(status),
  position INTEGER NOT NULL DEFAULT 1000 CHECK (position >= 0),
  my_genre TEXT,
  how_long_to_beat INTEGER CHECK (how_long_to_beat IS NULL OR how_long_to_beat >= 0),
  hours_preferred_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (hours_preferred_source IN ('auto', 'estimate', 'steam_actual')),
  hours_locked BOOLEAN NOT NULL DEFAULT FALSE,
  my_score NUMERIC(3,1) CHECK (my_score IS NULL OR my_score BETWEEN 0 AND 10),
  thoughts TEXT,
  cover TEXT,
  rawg_id INTEGER,
  rawg_slug TEXT,
  favorite_rank INTEGER CHECK (favorite_rank IS NULL OR favorite_rank BETWEEN 1 AND 5),
  started_at DATE,
  finished_at DATE,
  CHECK (started_at IS NULL OR finished_at IS NULL OR finished_at >= started_at)
);

CREATE UNIQUE INDEX games_user_favorite_rank_unique
  ON games (user_id, favorite_rank)
  WHERE favorite_rank IS NOT NULL;

CREATE INDEX idx_games_catalog_game_id ON games (catalog_game_id);
CREATE INDEX idx_games_rawg_id ON games (rawg_id);

CREATE UNIQUE INDEX games_user_catalog_unique
  ON games (user_id, catalog_game_id) WHERE catalog_game_id IS NOT NULL;

CREATE UNIQUE INDEX games_user_rawg_unique
  ON games (user_id, rawg_id) WHERE rawg_id IS NOT NULL;

CREATE UNIQUE INDEX games_user_unlinked_title_unique
  ON games (
    user_id,
    normalize_game_title_sql(name)
  )
  WHERE catalog_game_id IS NULL AND rawg_id IS NULL;

CREATE TABLE game_metadata_candidates (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (btrim(provider) <> ''),
  provider_game_id TEXT NOT NULL CHECK (btrim(provider_game_id) <> ''),
  candidate_rank INTEGER NOT NULL CHECK (candidate_rank > 0),
  confidence_score NUMERIC(5,4)
    CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
  confidence_level TEXT NOT NULL DEFAULT 'none'
    CHECK (confidence_level IN ('exact', 'high', 'medium', 'low', 'none')),
  match_reason TEXT,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence_json) = 'object'),
  decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'accepted', 'rejected', 'skipped')),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, provider, provider_game_id),
  CHECK (decision <> 'accepted' OR catalog_game_id IS NOT NULL)
);

CREATE UNIQUE INDEX game_metadata_candidates_one_accepted
  ON game_metadata_candidates (game_id)
  WHERE decision = 'accepted';

CREATE INDEX game_metadata_candidates_user_decision
  ON game_metadata_candidates (user_id, decision, updated_at DESC, id DESC);

CREATE INDEX game_metadata_candidates_game_rank
  ON game_metadata_candidates (game_id, candidate_rank, id);

CREATE TABLE user_lists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private')),
  list_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (list_type IN ('manual', 'smart')),
  query_json JSONB,
  sort_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_lists_user_updated
  ON user_lists (user_id, updated_at DESC, id DESC);

CREATE INDEX idx_user_lists_user_type_updated
  ON user_lists (user_id, list_type, updated_at DESC, id DESC);

CREATE TABLE user_list_games (
  list_id INTEGER NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1000 CHECK (position >= 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, game_id)
);

CREATE INDEX idx_user_list_games_list_position
  ON user_list_games (list_id, position, game_id);

CREATE INDEX idx_user_list_games_game_id
  ON user_list_games (game_id);

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

CREATE TABLE steam_link_transactions (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_steam_link_transactions_expiry
  ON steam_link_transactions (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE steam_sync_jobs (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES user_external_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  force BOOLEAN NOT NULL DEFAULT FALSE,
  cursor INTEGER NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  total INTEGER,
  payload_json JSONB,
  progress_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  error_code TEXT,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX steam_sync_jobs_one_active_per_user
  ON steam_sync_jobs (user_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX steam_sync_jobs_runnable
  ON steam_sync_jobs (status, locked_at, created_at)
  WHERE status IN ('queued', 'running');

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
  playtime_minutes_forever INTEGER CHECK (playtime_minutes_forever IS NULL OR playtime_minutes_forever >= 0),
  last_played_at TIMESTAMPTZ,
  first_play_observed_at TIMESTAMPTZ,
  first_play_observed_playtime_minutes INTEGER CHECK (first_play_observed_playtime_minutes IS NULL OR first_play_observed_playtime_minutes >= 0),
  achievements_unlocked INTEGER CHECK (achievements_unlocked IS NULL OR achievements_unlocked >= 0),
  achievements_total INTEGER CHECK (achievements_total IS NULL OR achievements_total >= 0),
  achievements_percent NUMERIC(5,2) CHECK (achievements_percent IS NULL OR achievements_percent BETWEEN 0 AND 100),
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
  UNIQUE (user_id, provider, provider_app_id),
  CHECK (achievements_unlocked IS NULL OR achievements_total IS NULL OR achievements_unlocked <= achievements_total)
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
  playtime_minutes_forever INTEGER CHECK (playtime_minutes_forever IS NULL OR playtime_minutes_forever >= 0),
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

CREATE OR REPLACE FUNCTION enforce_owned_game_relationship()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE game_owner INTEGER;
BEGIN
  IF NEW.game_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO game_owner FROM games WHERE id = NEW.game_id;
  IF game_owner IS NULL OR game_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'game relationship owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_candidate_duplicate_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE game_owner INTEGER;
BEGIN
  IF NEW.duplicate_game_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO game_owner FROM games WHERE id = NEW.duplicate_game_id;
  IF game_owner IS NULL OR game_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'candidate duplicate owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_list_game_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE list_owner INTEGER; game_owner INTEGER;
BEGIN
  SELECT user_id INTO list_owner FROM user_lists WHERE id = NEW.list_id;
  SELECT user_id INTO game_owner FROM games WHERE id = NEW.game_id;
  IF list_owner IS NULL OR game_owner IS NULL OR list_owner <> game_owner THEN
    RAISE EXCEPTION 'list game owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER user_game_sources_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_game_sources
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE TRIGGER steam_import_candidates_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, duplicate_game_id ON steam_import_candidates
  FOR EACH ROW EXECUTE FUNCTION enforce_candidate_duplicate_owner();

CREATE TRIGGER user_list_games_owner_guard
  BEFORE INSERT OR UPDATE OF list_id, game_id ON user_list_games
  FOR EACH ROW EXECUTE FUNCTION enforce_list_game_owner();

CREATE TRIGGER game_metadata_candidates_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON game_metadata_candidates
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE OR REPLACE FUNCTION prevent_game_owner_change_with_relationships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_game_sources WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM steam_import_candidates WHERE duplicate_game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_metadata_candidates WHERE game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while owned relationships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION prevent_list_owner_change_with_memberships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE list_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change list owner while memberships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER games_owner_change_guard
  BEFORE UPDATE OF user_id ON games
  FOR EACH ROW EXECUTE FUNCTION prevent_game_owner_change_with_relationships();

CREATE TRIGGER user_lists_owner_change_guard
  BEFORE UPDATE OF user_id ON user_lists
  FOR EACH ROW EXECUTE FUNCTION prevent_list_owner_change_with_memberships();
