ALTER TABLE games
  ADD COLUMN IF NOT EXISTS hours_preferred_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (hours_preferred_source IN ('auto', 'estimate', 'steam_actual')),
  ADD COLUMN IF NOT EXISTS hours_locked BOOLEAN NOT NULL DEFAULT FALSE;
