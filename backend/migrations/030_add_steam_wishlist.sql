ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS show_wishlist_in_backlog BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_external_accounts
  ADD COLUMN IF NOT EXISTS wishlist_sync_status TEXT NOT NULL DEFAULT 'never',
  ADD COLUMN IF NOT EXISTS last_wishlist_sync_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_wishlist_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wishlist_last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS wishlist_last_error_message TEXT,
  ADD COLUMN IF NOT EXISTS wishlist_empty_observations INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wishlist_empty_observed_at TIMESTAMPTZ;

ALTER TABLE user_external_accounts
  DROP CONSTRAINT IF EXISTS user_external_accounts_wishlist_sync_status_check;

ALTER TABLE user_external_accounts
  ADD CONSTRAINT user_external_accounts_wishlist_sync_status_check
    CHECK (wishlist_sync_status IN ('never', 'syncing', 'synced', 'partial', 'empty', 'empty_unconfirmed', 'private', 'failed')),
  DROP CONSTRAINT IF EXISTS user_external_accounts_wishlist_empty_observations_check;

ALTER TABLE user_external_accounts
  ADD CONSTRAINT user_external_accounts_wishlist_empty_observations_check
    CHECK (wishlist_empty_observations >= 0);

ALTER TABLE steam_sync_jobs
  ADD COLUMN IF NOT EXISTS sync_kind TEXT NOT NULL DEFAULT 'library';

ALTER TABLE steam_sync_jobs
  DROP CONSTRAINT IF EXISTS steam_sync_jobs_sync_kind_check;

ALTER TABLE steam_sync_jobs
  ADD CONSTRAINT steam_sync_jobs_sync_kind_check
    CHECK (sync_kind IN ('library', 'wishlist'));

CREATE TABLE IF NOT EXISTS user_wishlist_items (
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

ALTER TABLE user_wishlist_items
  ADD COLUMN IF NOT EXISTS release_date DATE,
  ADD COLUMN IF NOT EXISTS tags_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS user_wishlist_items_user_game_unique
  ON user_wishlist_items (user_id, game_id)
  WHERE game_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_wishlist_items_user_catalog_unique
  ON user_wishlist_items (user_id, catalog_game_id)
  WHERE catalog_game_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_wishlist_items_user_active
  ON user_wishlist_items (user_id, local_intent_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS steam_wishlist_items (
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

CREATE INDEX IF NOT EXISTS steam_wishlist_items_user_active_priority
  ON steam_wishlist_items (user_id, is_active, priority, date_added DESC);

CREATE INDEX IF NOT EXISTS steam_wishlist_items_account_id
  ON steam_wishlist_items (account_id);

ALTER TABLE user_activity_events
  ADD COLUMN IF NOT EXISTS wishlist_item_id BIGINT REFERENCES user_wishlist_items(id) ON DELETE SET NULL;

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

DROP TRIGGER IF EXISTS user_wishlist_items_owner_guard ON user_wishlist_items;
CREATE TRIGGER user_wishlist_items_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_wishlist_items
  FOR EACH ROW EXECUTE FUNCTION enforce_wishlist_item_owner();

DROP TRIGGER IF EXISTS steam_wishlist_items_owner_guard ON steam_wishlist_items;
CREATE TRIGGER steam_wishlist_items_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, account_id, wishlist_item_id ON steam_wishlist_items
  FOR EACH ROW EXECUTE FUNCTION enforce_wishlist_item_owner();

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

DROP TRIGGER IF EXISTS user_activity_events_owner_guard ON user_activity_events;
CREATE TRIGGER user_activity_events_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id, wishlist_item_id ON user_activity_events
  FOR EACH ROW EXECUTE FUNCTION enforce_activity_event_relationships();

CREATE OR REPLACE FUNCTION prevent_wishlist_game_owner_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id AND EXISTS (SELECT 1 FROM user_wishlist_items WHERE game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while wishlist relationships exist' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS games_wishlist_owner_change_guard ON games;
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

DROP TRIGGER IF EXISTS user_wishlist_items_owner_change_guard ON user_wishlist_items;
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

DROP TRIGGER IF EXISTS steam_account_wishlist_owner_change_guard ON user_external_accounts;
CREATE TRIGGER steam_account_wishlist_owner_change_guard
  BEFORE UPDATE OF user_id ON user_external_accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_wishlist_account_owner_change();

INSERT INTO user_wishlist_items (
  user_id, game_id, catalog_game_id, display_name, cover_url,
  local_intent_active, local_intent_source
)
SELECT g.user_id, g.id, g.catalog_game_id, g.name, g.cover, TRUE, 'legacy_status'
FROM games g
WHERE LOWER(TRIM(g.status)) = 'wishlist'
ON CONFLICT (user_id, game_id) WHERE game_id IS NOT NULL
DO UPDATE SET
  local_intent_active = TRUE,
  local_intent_source = COALESCE(user_wishlist_items.local_intent_source, 'legacy_status'),
  updated_at = NOW();
