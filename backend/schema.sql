-- DEV RESET (optional)
DROP TABLE IF EXISTS user_activity_events;
DROP TABLE IF EXISTS steam_achievement_unlocks;
DROP TABLE IF EXISTS steam_activity_allocation_items;
DROP TABLE IF EXISTS steam_activity_allocation_revisions;
DROP TABLE IF EXISTS steam_activity_observations;
DROP TABLE IF EXISTS steam_wishlist_items;
DROP TABLE IF EXISTS user_wishlist_items;
DROP TABLE IF EXISTS steam_import_candidates;
DROP TABLE IF EXISTS user_game_sources;
DROP TABLE IF EXISTS steam_sync_jobs;
DROP TABLE IF EXISTS integration_sync_runs;
DROP TABLE IF EXISTS user_external_accounts;
DROP TABLE IF EXISTS steam_link_transactions;
DROP TABLE IF EXISTS user_next_up_games;
DROP TABLE IF EXISTS user_play_focus_games;
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
    CHECK (default_backlog_view IN ('grid', 'compact', 'list', 'table')),
  default_backlog_sort_key TEXT NOT NULL DEFAULT ''
    CHECK (
      default_backlog_sort_key IN (
        '',
        'name',
        'status',
        'personalGenres',
        'estimatedHours',
        'score',
        'hoursPlayed',
        'rawgRating',
        'metacritic',
        'releaseDate',
        'addedDate',
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
        '/next-up',
        '/me',
        '/timeline',
        '/discover',
        '/insights'
      )
    ),
  show_wishlist_in_backlog BOOLEAN NOT NULL DEFAULT FALSE,
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
      'discover_ingest',
      'wishlist_metadata'
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
  resume_note TEXT
    CONSTRAINT games_resume_note_length
    CHECK (resume_note IS NULL OR char_length(resume_note) <= 1000),
  cover TEXT,
  rawg_id INTEGER,
  rawg_slug TEXT,
  favorite_rank INTEGER CHECK (favorite_rank IS NULL OR favorite_rank BETWEEN 1 AND 5),
  backlog_added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  backlog_added_at_source TEXT NOT NULL DEFAULT 'app'
    CHECK (backlog_added_at_source IN (
      'app',
      'guest_clone',
      'steam_observed',
      'steam_license_history'
    )),
  started_at DATE,
  finished_at DATE,
  CHECK (started_at IS NULL OR finished_at IS NULL OR finished_at >= started_at)
);

CREATE UNIQUE INDEX games_user_favorite_rank_unique
  ON games (user_id, favorite_rank)
  WHERE favorite_rank IS NOT NULL;

CREATE INDEX idx_games_catalog_game_id ON games (catalog_game_id);
CREATE INDEX idx_games_rawg_id ON games (rawg_id);

CREATE INDEX games_user_backlog_added_at
  ON games (user_id, backlog_added_at DESC, id DESC);

CREATE UNIQUE INDEX games_user_catalog_unique
  ON games (user_id, catalog_game_id) WHERE catalog_game_id IS NOT NULL;

CREATE UNIQUE INDEX games_user_rawg_unique
  ON games (user_id, rawg_id) WHERE rawg_id IS NOT NULL;

CREATE UNIQUE INDEX games_user_id_id_unique ON games (user_id, id);

CREATE UNIQUE INDEX games_user_unlinked_title_unique
  ON games (
    user_id,
    normalize_game_title_sql(name)
  )
  WHERE catalog_game_id IS NULL AND rawg_id IS NULL;

CREATE TABLE user_personal_genres (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1),
  normalized_name TEXT NOT NULL CHECK (char_length(normalized_name) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_name),
  UNIQUE (user_id, id)
);

CREATE TABLE game_personal_genres (
  user_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  personal_genre_id INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
  PRIMARY KEY (game_id, personal_genre_id),
  UNIQUE (game_id, position),
  FOREIGN KEY (user_id, game_id)
    REFERENCES games(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, personal_genre_id)
    REFERENCES user_personal_genres(user_id, id) ON DELETE CASCADE
);

CREATE INDEX game_personal_genres_user_genre
  ON game_personal_genres (user_id, personal_genre_id, game_id);

CREATE TABLE game_genre_suggestion_dismissals (
  user_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  personal_genre_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, personal_genre_id),
  FOREIGN KEY (user_id, game_id)
    REFERENCES games(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, personal_genre_id)
    REFERENCES user_personal_genres(user_id, id) ON DELETE CASCADE
);

CREATE INDEX game_genre_suggestion_dismissals_user_genre
  ON game_genre_suggestion_dismissals (user_id, personal_genre_id, game_id);

CREATE OR REPLACE FUNCTION sync_legacy_personal_genres()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM game_personal_genres WHERE game_id = NEW.id;

  WITH parsed AS (
    SELECT part.ordinality,
           trim(regexp_replace(part.value, '\s+', ' ', 'g')) AS name
      FROM regexp_split_to_table(COALESCE(NEW.my_genre, ''), ',')
        WITH ORDINALITY AS part(value, ordinality)
  ), deduplicated AS (
    SELECT DISTINCT ON (lower(name)) name, lower(name) AS normalized_name, ordinality
      FROM parsed
     WHERE name <> ''
     ORDER BY lower(name), ordinality
  )
  INSERT INTO user_personal_genres (user_id, name, normalized_name)
  SELECT NEW.user_id, name, normalized_name FROM deduplicated
  ON CONFLICT (user_id, normalized_name) DO NOTHING;

  WITH parsed AS (
    SELECT part.ordinality,
           lower(trim(regexp_replace(part.value, '\s+', ' ', 'g'))) AS normalized_name
      FROM regexp_split_to_table(COALESCE(NEW.my_genre, ''), ',')
        WITH ORDINALITY AS part(value, ordinality)
  ), deduplicated AS (
    SELECT DISTINCT ON (normalized_name) normalized_name, ordinality
      FROM parsed
     WHERE normalized_name <> ''
     ORDER BY normalized_name, ordinality
  ), ordered AS (
    SELECT normalized_name,
           row_number() OVER (ORDER BY ordinality) - 1 AS position
      FROM deduplicated
  )
  INSERT INTO game_personal_genres
    (user_id, game_id, personal_genre_id, position)
  SELECT NEW.user_id, NEW.id, genre.id, ordered.position
    FROM ordered
    JOIN user_personal_genres genre
      ON genre.user_id = NEW.user_id
     AND genre.normalized_name = ordered.normalized_name
   WHERE ordered.position < 10;

  RETURN NEW;
END $$;

CREATE TRIGGER games_legacy_personal_genres_sync
  AFTER INSERT OR UPDATE OF my_genre ON games
  FOR EACH ROW EXECUTE FUNCTION sync_legacy_personal_genres();

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

CREATE TABLE user_next_up_games (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  candidate_role TEXT NOT NULL DEFAULT 'main'
    CHECK (candidate_role IN ('main', 'side')),
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX idx_user_next_up_games_user_role_position
  ON user_next_up_games (user_id, candidate_role, position, game_id);

CREATE INDEX idx_user_next_up_games_game_id
  ON user_next_up_games (game_id);

CREATE TABLE user_play_focus_games (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  focus_role TEXT NOT NULL
    CHECK (focus_role IN ('main', 'side', 'occasional')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

CREATE UNIQUE INDEX idx_user_play_focus_single_slot
  ON user_play_focus_games (user_id, focus_role)
  WHERE focus_role IN ('main', 'side');

CREATE INDEX idx_user_play_focus_user_role
  ON user_play_focus_games (user_id, focus_role, assigned_at, game_id);

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
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  wishlist_sync_status TEXT NOT NULL DEFAULT 'never'
    CHECK (wishlist_sync_status IN ('never', 'syncing', 'synced', 'partial', 'empty', 'empty_unconfirmed', 'private', 'failed')),
  last_wishlist_sync_attempt_at TIMESTAMPTZ,
  last_wishlist_sync_at TIMESTAMPTZ,
  wishlist_last_error_code TEXT,
  wishlist_last_error_message TEXT,
  wishlist_empty_observations INTEGER NOT NULL DEFAULT 0 CHECK (wishlist_empty_observations >= 0),
  wishlist_empty_observed_at TIMESTAMPTZ,
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

CREATE TABLE integration_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  sync_kind TEXT NOT NULL,
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('manual', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  items_seen INTEGER NOT NULL DEFAULT 0 CHECK (items_seen >= 0),
  items_changed INTEGER NOT NULL DEFAULT 0 CHECK (items_changed >= 0),
  errors_count INTEGER NOT NULL DEFAULT 0 CHECK (errors_count >= 0),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX integration_sync_runs_user_domain_started
  ON integration_sync_runs (user_id, provider, sync_kind, started_at DESC);

CREATE INDEX integration_sync_runs_recent_problems
  ON integration_sync_runs (started_at DESC)
  WHERE status IN ('partial', 'failed');

CREATE TABLE daily_automation_runs (
  id UUID PRIMARY KEY,
  automation_key TEXT NOT NULL CHECK (automation_key IN ('steam_daily')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'abandoned', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  deployment_revision TEXT,
  idempotency_key TEXT,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX daily_automation_runs_one_active
  ON daily_automation_runs (automation_key)
  WHERE status = 'running';

CREATE INDEX daily_automation_runs_recent
  ON daily_automation_runs (automation_key, started_at DESC);

CREATE UNIQUE INDEX daily_automation_runs_idempotency
  ON daily_automation_runs (automation_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE daily_automation_run_accounts (
  automation_run_id UUID NOT NULL REFERENCES daily_automation_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES user_external_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'abandoned', 'skipped')),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (automation_run_id, account_id)
);

CREATE INDEX daily_automation_run_accounts_history
  ON daily_automation_run_accounts (user_id, account_id, automation_run_id);

ALTER TABLE integration_sync_runs
  ADD COLUMN daily_automation_run_id UUID
    REFERENCES daily_automation_runs(id) ON DELETE SET NULL;

CREATE INDEX integration_sync_runs_daily_automation_run
  ON integration_sync_runs (daily_automation_run_id)
  WHERE daily_automation_run_id IS NOT NULL;

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
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'scheduled')),
  sync_kind TEXT NOT NULL DEFAULT 'library'
    CHECK (sync_kind IN ('library', 'wishlist')),
  sync_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL,
  daily_automation_run_id UUID REFERENCES daily_automation_runs(id) ON DELETE SET NULL,
  lease_token UUID,
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

CREATE UNIQUE INDEX steam_sync_jobs_sync_run_unique
  ON steam_sync_jobs (sync_run_id)
  WHERE sync_run_id IS NOT NULL;

CREATE INDEX steam_sync_jobs_daily_automation_run
  ON steam_sync_jobs (daily_automation_run_id)
  WHERE daily_automation_run_id IS NOT NULL;

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
  first_play_activity_day DATE,
  first_play_observed_playtime_minutes INTEGER CHECK (first_play_observed_playtime_minutes IS NULL OR first_play_observed_playtime_minutes >= 0),
  achievements_unlocked INTEGER CHECK (achievements_unlocked IS NULL OR achievements_unlocked >= 0),
  achievements_total INTEGER CHECK (achievements_total IS NULL OR achievements_total >= 0),
  achievements_percent NUMERIC(5,2) CHECK (achievements_percent IS NULL OR achievements_percent BETWEEN 0 AND 100),
  achievements_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (achievements_status IN ('unknown', 'synced', 'none', 'private', 'unavailable', 'failed')),
  achievements_last_synced_at TIMESTAMPTZ,
  achievements_last_error_code TEXT,
  achievements_last_error_message TEXT,
  achievement_events_initialized_at TIMESTAMPTZ,
  achievement_events_baseline_at TIMESTAMPTZ,
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

CREATE OR REPLACE FUNCTION gaming_activity_day(value TIMESTAMPTZ)
RETURNS DATE
LANGUAGE SQL
STABLE
STRICT
AS $$
  SELECT ((value AT TIME ZONE 'Asia/Jerusalem') - INTERVAL '5 hours')::date
$$;

CREATE TABLE steam_activity_observations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_run_id BIGINT NOT NULL REFERENCES integration_sync_runs(id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES user_game_sources(id) ON DELETE SET NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  steam_app_id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  cover_url TEXT,
  playtime_minutes_forever INTEGER NOT NULL CHECK (playtime_minutes_forever >= 0),
  playtime_delta_minutes INTEGER NOT NULL DEFAULT 0 CHECK (playtime_delta_minutes >= 0),
  achievements_unlocked INTEGER,
  achievements_total INTEGER,
  achievements_delta INTEGER NOT NULL DEFAULT 0 CHECK (achievements_delta >= 0),
  interval_started_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation_time_source TEXT NOT NULL DEFAULT 'snapshot'
    CHECK (observation_time_source IN ('snapshot', 'legacy_finalization')),
  activity_precision TEXT NOT NULL DEFAULT 'baseline'
    CHECK (activity_precision IN ('baseline', 'daily', 'uncertain')),
  activity_day DATE,
  counter_rebaseline BOOLEAN NOT NULL DEFAULT FALSE,
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sync_run_id, steam_app_id),
  CHECK (achievements_unlocked IS NULL OR achievements_unlocked >= 0),
  CHECK (achievements_total IS NULL OR achievements_total >= 0),
  CHECK (achievements_unlocked IS NULL OR achievements_total IS NULL OR achievements_unlocked <= achievements_total),
  CHECK ((activity_precision = 'daily') = (activity_day IS NOT NULL))
);

CREATE INDEX steam_activity_observations_user_observed
  ON steam_activity_observations (user_id, observed_at DESC);

CREATE INDEX steam_activity_observations_user_app_observed
  ON steam_activity_observations (user_id, steam_app_id, observed_at DESC);

CREATE INDEX steam_activity_observations_user_activity_day
  ON steam_activity_observations (user_id, activity_day DESC, observed_at DESC)
  WHERE activity_precision = 'daily';

CREATE TABLE steam_activity_allocation_revisions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  observation_id BIGINT NOT NULL REFERENCES steam_activity_observations(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  action TEXT NOT NULL CHECK (action IN ('allocate', 'reset')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (observation_id, revision),
  UNIQUE (id, user_id)
);

CREATE TABLE steam_activity_allocation_items (
  revision_id BIGINT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_day DATE NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  PRIMARY KEY (revision_id, activity_day),
  FOREIGN KEY (revision_id, user_id)
    REFERENCES steam_activity_allocation_revisions(id, user_id) ON DELETE CASCADE
);

CREATE INDEX steam_activity_allocation_revisions_observation_latest
  ON steam_activity_allocation_revisions (observation_id, revision DESC);

CREATE TABLE steam_achievement_unlocks (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES user_external_accounts(id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES user_game_sources(id) ON DELETE SET NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  first_seen_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL,
  steam_app_id TEXT NOT NULL,
  achievement_api_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  unlock_at TIMESTAMPTZ,
  activity_day DATE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, steam_app_id, achievement_api_name),
  CHECK ((unlock_at IS NULL) = (activity_day IS NULL))
);

CREATE INDEX steam_achievement_unlocks_user_day
  ON steam_achievement_unlocks (user_id, activity_day DESC, unlock_at DESC, id DESC);

CREATE INDEX steam_achievement_unlocks_user_app_time
  ON steam_achievement_unlocks (user_id, steam_app_id, unlock_at DESC, id DESC);

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
  personal_genre_suggestions_json JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(personal_genre_suggestions_json) = 'array'),
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

CREATE TABLE user_wishlist_items (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  cover_url TEXT,
  release_date DATE,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  local_intent_active BOOLEAN NOT NULL DEFAULT FALSE,
  local_intent_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX user_wishlist_items_user_game_unique
  ON user_wishlist_items (user_id, game_id) WHERE game_id IS NOT NULL;
CREATE UNIQUE INDEX user_wishlist_items_user_catalog_unique
  ON user_wishlist_items (user_id, catalog_game_id) WHERE catalog_game_id IS NOT NULL;
CREATE INDEX user_wishlist_items_user_active
  ON user_wishlist_items (user_id, local_intent_active, updated_at DESC);

CREATE TABLE steam_wishlist_items (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES user_external_accounts(id) ON DELETE CASCADE,
  wishlist_item_id BIGINT NOT NULL REFERENCES user_wishlist_items(id) ON DELETE CASCADE,
  steam_app_id TEXT NOT NULL,
  priority INTEGER CHECK (priority IS NULL OR priority >= 0),
  date_added TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  removal_reason TEXT,
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, steam_app_id)
);

CREATE INDEX steam_wishlist_items_user_active_priority
  ON steam_wishlist_items (user_id, is_active, priority, date_added DESC);
CREATE INDEX steam_wishlist_items_account_id ON steam_wishlist_items (account_id);

CREATE TABLE user_activity_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  wishlist_item_id BIGINT REFERENCES user_wishlist_items(id) ON DELETE SET NULL,
  external_id TEXT,
  sync_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL,
  dedupe_key TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'resolved', 'dismissed')),
  seen_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_activity_events_user_state_created
  ON user_activity_events (user_id, state, created_at DESC);

CREATE INDEX user_activity_events_user_source_created
  ON user_activity_events (user_id, source, created_at DESC);

CREATE UNIQUE INDEX user_activity_events_open_dedupe
  ON user_activity_events (user_id, source, dedupe_key)
  WHERE state = 'open';

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

CREATE OR REPLACE FUNCTION enforce_steam_achievement_unlock_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE account_owner INTEGER; source_owner INTEGER; game_owner INTEGER;
BEGIN
  SELECT user_id INTO account_owner FROM user_external_accounts WHERE id = NEW.account_id;
  IF account_owner IS NULL OR account_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'steam achievement account owner mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_id IS NOT NULL THEN
    SELECT user_id INTO source_owner FROM user_game_sources WHERE id = NEW.source_id;
    IF source_owner IS NULL OR source_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'steam achievement source owner mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.game_id IS NOT NULL THEN
    SELECT user_id INTO game_owner FROM games WHERE id = NEW.game_id;
    IF game_owner IS NULL OR game_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'steam achievement game owner mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_steam_activity_allocation_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE observation_owner INTEGER;
BEGIN
  SELECT user_id INTO observation_owner
  FROM steam_activity_observations
  WHERE id = NEW.observation_id;
  IF observation_owner IS NULL OR observation_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'steam activity allocation owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_wishlist_item_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE game_owner INTEGER; item_owner INTEGER; account_owner INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'user_wishlist_items' THEN
    IF NEW.game_id IS NOT NULL THEN
      SELECT user_id INTO game_owner FROM games WHERE id = NEW.game_id;
      IF game_owner IS NULL OR game_owner <> NEW.user_id THEN
        RAISE EXCEPTION 'wishlist game owner mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  SELECT user_id INTO item_owner FROM user_wishlist_items WHERE id = NEW.wishlist_item_id;
  SELECT user_id INTO account_owner FROM user_external_accounts WHERE id = NEW.account_id;
  IF item_owner IS NULL OR account_owner IS NULL OR item_owner <> NEW.user_id OR account_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'steam wishlist owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_activity_event_relationships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE game_owner INTEGER; wishlist_owner INTEGER;
BEGIN
  IF NEW.game_id IS NOT NULL THEN
    SELECT user_id INTO game_owner FROM games WHERE id = NEW.game_id;
    IF game_owner IS NULL OR game_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'game relationship owner mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.wishlist_item_id IS NOT NULL THEN
    SELECT user_id INTO wishlist_owner FROM user_wishlist_items WHERE id = NEW.wishlist_item_id;
    IF wishlist_owner IS NULL OR wishlist_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'wishlist activity owner mismatch' USING ERRCODE = '23514';
    END IF;
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

CREATE TRIGGER steam_activity_observations_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON steam_activity_observations
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE TRIGGER steam_achievement_unlocks_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, account_id, source_id, game_id
  ON steam_achievement_unlocks
  FOR EACH ROW EXECUTE FUNCTION enforce_steam_achievement_unlock_owner();

CREATE TRIGGER steam_activity_allocation_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, observation_id
  ON steam_activity_allocation_revisions
  FOR EACH ROW EXECUTE FUNCTION enforce_steam_activity_allocation_owner();

-- Public Steam Store delta-feed state. This is global provider state; it never
-- contains user Wishlist or price observations.
CREATE TABLE IF NOT EXISTS steam_price_feed_cursor (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  cursor_modified_since BIGINT NOT NULL DEFAULT 0 CHECK (cursor_modified_since >= 0),
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ
);
INSERT INTO steam_price_feed_cursor (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS steam_price_feed_changes (
  app_id TEXT PRIMARY KEY CHECK (app_id ~ '^[1-9][0-9]*$'),
  last_modified BIGINT NOT NULL CHECK (last_modified >= 0),
  price_change_number TEXT CHECK (price_change_number IS NULL OR price_change_number ~ '^[0-9]+$'),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price_candidate_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS steam_price_feed_changes_seen
  ON steam_price_feed_changes (price_candidate_at DESC, app_id)
  WHERE price_candidate_at IS NOT NULL;

CREATE TRIGGER steam_import_candidates_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, duplicate_game_id ON steam_import_candidates
  FOR EACH ROW EXECUTE FUNCTION enforce_candidate_duplicate_owner();

CREATE TRIGGER user_activity_events_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id, wishlist_item_id ON user_activity_events
  FOR EACH ROW EXECUTE FUNCTION enforce_activity_event_relationships();

CREATE TRIGGER user_wishlist_items_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_wishlist_items
  FOR EACH ROW EXECUTE FUNCTION enforce_wishlist_item_owner();

CREATE TRIGGER steam_wishlist_items_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, account_id, wishlist_item_id ON steam_wishlist_items
  FOR EACH ROW EXECUTE FUNCTION enforce_wishlist_item_owner();

CREATE OR REPLACE FUNCTION prevent_wishlist_game_owner_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id AND EXISTS (SELECT 1 FROM user_wishlist_items WHERE game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while wishlist relationships exist' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER games_wishlist_owner_change_guard
  BEFORE UPDATE OF user_id ON games
  FOR EACH ROW EXECUTE FUNCTION prevent_wishlist_game_owner_change();

CREATE OR REPLACE FUNCTION prevent_wishlist_item_owner_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id AND (
    EXISTS (SELECT 1 FROM steam_wishlist_items WHERE wishlist_item_id = OLD.id) OR
    EXISTS (SELECT 1 FROM user_activity_events WHERE wishlist_item_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'cannot change wishlist owner while relationships exist' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER user_wishlist_items_owner_change_guard
  BEFORE UPDATE OF user_id ON user_wishlist_items
  FOR EACH ROW EXECUTE FUNCTION prevent_wishlist_item_owner_change();

CREATE OR REPLACE FUNCTION prevent_wishlist_account_owner_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id AND EXISTS (SELECT 1 FROM steam_wishlist_items WHERE account_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change Steam account owner while wishlist relationships exist' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER steam_account_wishlist_owner_change_guard
  BEFORE UPDATE OF user_id ON user_external_accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_wishlist_account_owner_change();

CREATE TRIGGER user_list_games_owner_guard
  BEFORE INSERT OR UPDATE OF list_id, game_id ON user_list_games
  FOR EACH ROW EXECUTE FUNCTION enforce_list_game_owner();

CREATE TRIGGER game_metadata_candidates_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON game_metadata_candidates
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE TRIGGER user_next_up_games_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_next_up_games
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE TRIGGER user_play_focus_games_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_play_focus_games
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE OR REPLACE FUNCTION prevent_game_owner_change_with_relationships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_game_sources WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM steam_import_candidates WHERE duplicate_game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_activity_events WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_metadata_candidates WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_next_up_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_play_focus_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_personal_genres WHERE game_id = OLD.id) THEN
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

-- Preserve the already-applied 030 migration and all historical/local intentions.
ALTER TABLE steam_wishlist_items
  ADD COLUMN IF NOT EXISTS provider_order INTEGER CHECK (provider_order >= 0),
  ADD COLUMN IF NOT EXISTS order_sync_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS steam_wishlist_items_provider_order
  ON steam_wishlist_items (user_id, is_active, provider_order, steam_app_id);

ALTER TABLE user_wishlist_items
  ADD COLUMN IF NOT EXISTS metadata_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

-- An observation in a successful incremental library run is stronger evidence
-- than first_imported_at (which also includes historical baseline imports).
ALTER TABLE user_game_sources
  ADD COLUMN IF NOT EXISTS ownership_observed_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL;

-- Retain the provider identity captured at enqueue, even if the link changes.
ALTER TABLE steam_sync_jobs ADD COLUMN IF NOT EXISTS provider_user_id TEXT;

ALTER TABLE user_game_sources
  ADD COLUMN IF NOT EXISTS achievements_pending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS achievements_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS achievements_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS achievements_attempts INTEGER NOT NULL DEFAULT 0 CHECK (achievements_attempts >= 0),
  ADD COLUMN IF NOT EXISTS achievements_revision BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS user_game_sources_achievement_follow_up
  ON user_game_sources (user_id, achievements_next_attempt_at, id)
  WHERE provider = 'steam' AND source_status = 'owned' AND game_id IS NOT NULL;

ALTER TABLE steam_sync_jobs DROP CONSTRAINT IF EXISTS steam_sync_jobs_sync_kind_check;
ALTER TABLE steam_sync_jobs ADD CONSTRAINT steam_sync_jobs_sync_kind_check
  CHECK (sync_kind IN ('library', 'wishlist', 'wishlist_prices'));

ALTER TABLE user_external_accounts
  ADD COLUMN IF NOT EXISTS price_sync_status TEXT NOT NULL DEFAULT 'never' CHECK (price_sync_status IN ('never','syncing','succeeded','partial','failed','skipped','cancelled')),
  ADD COLUMN IF NOT EXISTS last_price_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_price_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_last_error TEXT,
  ADD COLUMN IF NOT EXISTS price_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE user_activity_events
  ADD COLUMN IF NOT EXISTS occurrence_key TEXT,
  ADD COLUMN IF NOT EXISTS event_kind TEXT NOT NULL DEFAULT 'decision';
CREATE UNIQUE INDEX IF NOT EXISTS user_activity_events_occurrence_unique
  ON user_activity_events(user_id, source, occurrence_key) WHERE occurrence_key IS NOT NULL;

-- Exact saved identities only. A local intention may retain an old Steam AppID,
-- but ownership must have been observed during the current connection.
CREATE OR REPLACE VIEW steam_price_targets AS
SELECT w.user_id, a.id AS account_id, w.id AS wishlist_item_id,
       CASE WHEN cardinality(ids.app_ids) = 1 THEN ids.app_ids[1] END AS steam_app_id,
       CASE WHEN NOT (w.local_intent_active OR COALESCE(s.is_active AND s.account_id = a.id, FALSE)) THEN 'removed'
            WHEN cardinality(ids.app_ids) IS DISTINCT FROM 1 THEN 'identity_unresolved'
            WHEN EXISTS (SELECT 1 FROM user_game_sources source
              WHERE source.user_id = w.user_id AND source.provider = 'steam'
                AND source.provider_app_id = ids.app_ids[1]
                AND source.source_status IN ('owned', 'ignored')
                AND source.last_synced_at >= a.linked_at) THEN 'owned'
            ELSE 'eligible' END AS reason
FROM user_wishlist_items w
JOIN user_external_accounts a ON a.user_id = w.user_id AND a.provider = 'steam' AND a.disconnected_at IS NULL
JOIN users u ON u.id = w.user_id AND u.is_guest = FALSE
LEFT JOIN steam_wishlist_items s ON s.wishlist_item_id = w.id AND s.user_id = w.user_id
LEFT JOIN games g ON g.id = w.game_id AND g.user_id = w.user_id
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT app_id) AS app_ids FROM (
    SELECT s.steam_app_id AS app_id
    UNION ALL
    SELECT e.external_id FROM external_game_ids e
      WHERE e.source = 'steam' AND e.catalog_game_id IN (w.catalog_game_id, g.catalog_game_id)
  ) exact_ids WHERE app_id ~ '^[1-9][0-9]*$'
) ids ON TRUE;

CREATE TABLE IF NOT EXISTS steam_price_monitors (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES user_external_accounts(id) ON DELETE CASCADE,
  wishlist_item_id BIGINT NOT NULL REFERENCES user_wishlist_items(id) ON DELETE CASCADE,
  steam_app_id TEXT NOT NULL CHECK (steam_app_id ~ '^[1-9][0-9]*$'),
  epoch UUID NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  latest_observation_id BIGINT,
  comparison_observation_id BIGINT,
  UNIQUE (account_id, wishlist_item_id, steam_app_id)
);
CREATE INDEX IF NOT EXISTS steam_price_monitors_due ON steam_price_monitors(account_id, next_attempt_at, id) WHERE active;

CREATE TABLE IF NOT EXISTS steam_price_observations (
  id BIGSERIAL PRIMARY KEY,
  monitor_id BIGINT NOT NULL REFERENCES steam_price_monitors(id) ON DELETE CASCADE,
  sync_run_id BIGINT NOT NULL REFERENCES integration_sync_runs(id),
  epoch UUID NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  country TEXT NOT NULL CHECK (country = 'IL'),
  currency TEXT CHECK (currency = 'ILS'),
  offer_id TEXT,
  offer_name TEXT,
  availability TEXT NOT NULL CHECK (availability IN ('available', 'free', 'unavailable', 'unreleased')),
  current_minor BIGINT CHECK (current_minor >= 0),
  regular_minor BIGINT CHECK (regular_minor >= 0),
  discount_percent INTEGER CHECK (discount_percent BETWEEN 0 AND 100),
  sale BOOLEAN,
  normalizer_version INTEGER NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (monitor_id, sync_run_id),
  CHECK (regular_minor IS NULL OR current_minor IS NULL OR regular_minor >= current_minor),
  CHECK (availability NOT IN ('available', 'free') OR (currency IS NOT NULL AND current_minor IS NOT NULL AND offer_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS steam_price_observations_history ON steam_price_observations(monitor_id, observed_at DESC, id DESC);
ALTER TABLE steam_price_monitors
  DROP CONSTRAINT IF EXISTS steam_price_monitors_latest_fk,
  DROP CONSTRAINT IF EXISTS steam_price_monitors_comparison_fk;
ALTER TABLE steam_price_monitors
  ADD CONSTRAINT steam_price_monitors_latest_fk FOREIGN KEY (latest_observation_id) REFERENCES steam_price_observations(id),
  ADD CONSTRAINT steam_price_monitors_comparison_fk FOREIGN KEY (comparison_observation_id) REFERENCES steam_price_observations(id);

CREATE OR REPLACE FUNCTION enforce_steam_price_relationships() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'steam_price_monitors' THEN
    IF NOT EXISTS (SELECT 1 FROM user_wishlist_items w JOIN user_external_accounts a ON a.user_id = w.user_id
      WHERE w.id = NEW.wishlist_item_id AND w.user_id = NEW.user_id AND a.id = NEW.account_id AND a.provider = 'steam') THEN
      RAISE EXCEPTION 'price monitor owner mismatch' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.user_id, NEW.account_id, NEW.wishlist_item_id, NEW.steam_app_id)
      IS DISTINCT FROM (OLD.user_id, OLD.account_id, OLD.wishlist_item_id, OLD.steam_app_id) THEN
      RAISE EXCEPTION 'price monitor identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM steam_price_observations o WHERE o.id IN (NEW.latest_observation_id, NEW.comparison_observation_id)
      AND o.monitor_id <> NEW.id) THEN
      RAISE EXCEPTION 'price observation monitor mismatch' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM steam_price_monitors m JOIN integration_sync_runs r ON r.user_id = m.user_id
      WHERE m.id = NEW.monitor_id AND m.epoch = NEW.epoch AND r.id = NEW.sync_run_id AND r.sync_kind = 'wishlist_prices') THEN
      RAISE EXCEPTION 'price observation run mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS steam_price_monitor_guard ON steam_price_monitors;
CREATE TRIGGER steam_price_monitor_guard BEFORE INSERT OR UPDATE ON steam_price_monitors
  FOR EACH ROW EXECUTE FUNCTION enforce_steam_price_relationships();
DROP TRIGGER IF EXISTS steam_price_observation_guard ON steam_price_observations;
CREATE TRIGGER steam_price_observation_guard BEFORE INSERT ON steam_price_observations
  FOR EACH ROW EXECUTE FUNCTION enforce_steam_price_relationships();

-- Preserve provenance even when the parent relationship has no membership/events.
CREATE OR REPLACE FUNCTION prevent_price_parent_owner_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id AND EXISTS (SELECT 1 FROM steam_price_monitors
    WHERE (TG_TABLE_NAME = 'user_wishlist_items' AND wishlist_item_id = OLD.id)
       OR (TG_TABLE_NAME = 'user_external_accounts' AND account_id = OLD.id)) THEN
    RAISE EXCEPTION 'cannot change price history owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wishlist_price_owner_guard ON user_wishlist_items;
CREATE TRIGGER wishlist_price_owner_guard BEFORE UPDATE OF user_id ON user_wishlist_items
  FOR EACH ROW EXECUTE FUNCTION prevent_price_parent_owner_change();
DROP TRIGGER IF EXISTS account_price_owner_guard ON user_external_accounts;
CREATE TRIGGER account_price_owner_guard BEFORE UPDATE OF user_id ON user_external_accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_price_parent_owner_change();

-- Steam C.5: private inbox delivery state (migration 034).
-- Delivery state is independent of facts and existing review decisions.
CREATE UNIQUE INDEX IF NOT EXISTS user_activity_events_id_owner ON user_activity_events(id, user_id);
CREATE TABLE IF NOT EXISTS user_activity_inbox (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  baseline_event_id BIGINT NOT NULL DEFAULT 0 CHECK (baseline_event_id >= 0),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_activity_receipts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (event_id, user_id) REFERENCES user_activity_events(id, user_id) ON DELETE CASCADE
);

-- One target per local Wishlist item. Multiple exact identities remain unresolved;
-- do not pick a price merely because one Steam membership sorts first.
CREATE OR REPLACE VIEW steam_price_targets AS
SELECT w.user_id, a.id AS account_id, w.id AS wishlist_item_id,
       CASE WHEN cardinality(ids.app_ids) = 1 THEN ids.app_ids[1] END AS steam_app_id,
       CASE WHEN NOT (w.local_intent_active OR COALESCE(s.is_active, FALSE)) THEN 'removed'
            WHEN cardinality(ids.app_ids) IS DISTINCT FROM 1 THEN 'identity_unresolved'
            WHEN EXISTS (SELECT 1 FROM user_game_sources source
              WHERE source.user_id = w.user_id AND source.provider = 'steam'
                AND source.provider_app_id = ids.app_ids[1]
                AND source.source_status IN ('owned', 'ignored')
                AND source.last_synced_at >= a.linked_at) THEN 'owned'
            ELSE 'eligible' END AS reason
FROM user_wishlist_items w
JOIN user_external_accounts a ON a.user_id = w.user_id AND a.provider = 'steam' AND a.disconnected_at IS NULL
JOIN users u ON u.id = w.user_id AND u.is_guest = FALSE
LEFT JOIN LATERAL (
  SELECT bool_or(m.is_active AND m.account_id = a.id) AS is_active
  FROM steam_wishlist_items m WHERE m.wishlist_item_id = w.id AND m.user_id = w.user_id
) s ON TRUE
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT app_id) AS app_ids FROM (
    -- Steam Wishlist membership is the price identity. A RAWG catalog match is
    -- metadata/user selection and must not introduce or replace a Steam app id.
    SELECT m.steam_app_id AS app_id FROM steam_wishlist_items m
      WHERE m.wishlist_item_id = w.id AND m.user_id = w.user_id
        AND ((COALESCE(s.is_active, FALSE) AND m.account_id = a.id AND m.is_active)
          OR NOT COALESCE(s.is_active, FALSE))
  ) exact_ids WHERE app_id ~ '^[1-9][0-9]*$'
) ids ON TRUE;

-- Durable, item-scoped Wishlist metadata work (migration 038).
CREATE TABLE IF NOT EXISTS wishlist_metadata_work (
  wishlist_item_id BIGINT PRIMARY KEY REFERENCES user_wishlist_items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  steam_app_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'review', 'unmatched', 'failed')),
  identity_state TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (identity_state IN ('exact', 'ambiguous', 'unresolved')),
  identity_reason TEXT,
  candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(candidates_json) = 'array'),
  metadata_due_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wishlist_metadata_work_runnable
  ON wishlist_metadata_work (status, next_attempt_at, lease_expires_at, updated_at, wishlist_item_id)
  WHERE status IN ('queued', 'completed', 'failed', 'unmatched');

CREATE INDEX IF NOT EXISTS wishlist_metadata_work_user_status
  ON wishlist_metadata_work (user_id, status, next_attempt_at, updated_at);

CREATE TABLE IF NOT EXISTS wishlist_metadata_attempts (
  id BIGSERIAL PRIMARY KEY,
  metadata_job_id BIGINT REFERENCES metadata_jobs(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wishlist_item_id BIGINT NOT NULL REFERENCES user_wishlist_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('completed', 'review', 'unmatched', 'failed')),
  identity_state TEXT CHECK (identity_state IS NULL OR identity_state IN ('exact', 'ambiguous', 'unresolved')),
  issue TEXT,
  error_code TEXT,
  candidate_count INTEGER CHECK (candidate_count IS NULL OR candidate_count >= 0),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wishlist_metadata_attempts_user_time
  ON wishlist_metadata_attempts (user_id, attempted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS wishlist_metadata_attempts_item_time
  ON wishlist_metadata_attempts (wishlist_item_id, attempted_at DESC, id DESC);

CREATE OR REPLACE FUNCTION enforce_wishlist_metadata_attempt_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE item_owner INTEGER;
BEGIN
  SELECT user_id INTO item_owner FROM user_wishlist_items WHERE id = NEW.wishlist_item_id;
  IF item_owner IS NULL OR item_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'wishlist metadata attempt owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wishlist_metadata_attempt_owner_guard ON wishlist_metadata_attempts;
CREATE TRIGGER wishlist_metadata_attempt_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, wishlist_item_id ON wishlist_metadata_attempts
  FOR EACH ROW EXECUTE FUNCTION enforce_wishlist_metadata_attempt_owner();

CREATE OR REPLACE FUNCTION enforce_wishlist_metadata_work_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE item_owner INTEGER;
BEGIN
  SELECT user_id INTO item_owner FROM user_wishlist_items WHERE id = NEW.wishlist_item_id;
  IF item_owner IS NULL OR item_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'wishlist metadata work owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wishlist_metadata_work_owner_guard ON wishlist_metadata_work;
CREATE TRIGGER wishlist_metadata_work_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, wishlist_item_id ON wishlist_metadata_work
  FOR EACH ROW EXECUTE FUNCTION enforce_wishlist_metadata_work_owner();

INSERT INTO wishlist_metadata_work (wishlist_item_id, user_id, steam_app_id, next_attempt_at)
SELECT wishlist.id, wishlist.user_id, steam.steam_app_id, NOW()
  FROM user_wishlist_items wishlist
  LEFT JOIN LATERAL (
    SELECT steam_app_id FROM steam_wishlist_items
     WHERE wishlist_item_id = wishlist.id AND user_id = wishlist.user_id
     ORDER BY is_active DESC, last_seen_at DESC, steam_app_id
     LIMIT 1
  ) steam ON TRUE
ON CONFLICT (wishlist_item_id) DO NOTHING;
