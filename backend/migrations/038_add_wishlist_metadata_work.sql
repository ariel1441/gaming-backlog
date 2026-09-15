-- Durable, item-scoped metadata work for Steam Wishlist records.
-- Provider work is deliberately separate from Steam membership and price jobs.
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
