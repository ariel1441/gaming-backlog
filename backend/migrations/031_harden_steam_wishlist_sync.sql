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
