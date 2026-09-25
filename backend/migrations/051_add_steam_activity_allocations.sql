-- Preserve raw Steam observations while recording auditable user-authored
-- allocations for uncertain playtime intervals.
CREATE TABLE IF NOT EXISTS steam_activity_allocation_revisions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  observation_id BIGINT NOT NULL REFERENCES steam_activity_observations(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  action TEXT NOT NULL CHECK (action IN ('allocate', 'reset')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (observation_id, revision),
  UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS steam_activity_allocation_items (
  revision_id BIGINT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_day DATE NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  PRIMARY KEY (revision_id, activity_day),
  FOREIGN KEY (revision_id, user_id)
    REFERENCES steam_activity_allocation_revisions(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS steam_activity_allocation_revisions_observation_latest
  ON steam_activity_allocation_revisions (observation_id, revision DESC);

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

DROP TRIGGER IF EXISTS steam_activity_allocation_owner_guard
  ON steam_activity_allocation_revisions;
CREATE TRIGGER steam_activity_allocation_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, observation_id
  ON steam_activity_allocation_revisions
  FOR EACH ROW EXECUTE FUNCTION enforce_steam_activity_allocation_owner();
