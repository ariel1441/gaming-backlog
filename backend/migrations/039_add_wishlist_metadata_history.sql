-- Durable, owner-scoped history for Wishlist metadata refresh diagnostics.
ALTER TABLE metadata_jobs
  DROP CONSTRAINT IF EXISTS metadata_jobs_job_type_check;

ALTER TABLE metadata_jobs
  ADD CONSTRAINT metadata_jobs_job_type_check
  CHECK (job_type IN (
    'backlog_repair', 'catalog_refresh', 'cache_import', 'exact_backfill',
    'discover_ingest', 'wishlist_metadata'
  ));

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
