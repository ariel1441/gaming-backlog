-- Provider snapshots are evidence of a fetched provider response. Corrections
-- append a new snapshot instead of mutating history. Deletes remain available
-- for explicit retention cleanup and catalog ON DELETE CASCADE behavior.
CREATE OR REPLACE FUNCTION prevent_catalog_provider_snapshot_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'catalog provider snapshots are append-only'
    USING ERRCODE = '23514';
END $$;

DROP TRIGGER IF EXISTS catalog_provider_snapshots_append_only
  ON catalog_provider_snapshots;

CREATE TRIGGER catalog_provider_snapshots_append_only
  BEFORE UPDATE ON catalog_provider_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_catalog_provider_snapshot_update();
