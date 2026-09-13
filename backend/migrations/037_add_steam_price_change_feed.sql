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
