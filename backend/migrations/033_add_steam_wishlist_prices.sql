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
