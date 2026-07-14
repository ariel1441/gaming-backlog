-- Restore the compatibility column used by the deployed add-game and
-- emergency exact-identity cover-repair paths. Historical databases can have
-- a games table that predates this column because 000_core_baseline.sql uses
-- CREATE TABLE IF NOT EXISTS and therefore cannot repair an existing table.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS cover TEXT;
