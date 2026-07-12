DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM user_list_games ulg
    JOIN user_lists ul ON ul.id = ulg.list_id
    JOIN games g ON g.id = ulg.game_id
    WHERE ul.user_id <> g.user_id
  ) OR EXISTS (
    SELECT 1 FROM user_game_sources ugs
    JOIN games g ON g.id = ugs.game_id
    WHERE ugs.game_id IS NOT NULL AND ugs.user_id <> g.user_id
  ) OR EXISTS (
    SELECT 1 FROM steam_import_candidates c
    JOIN games g ON g.id = c.duplicate_game_id
    WHERE c.duplicate_game_id IS NOT NULL AND c.user_id <> g.user_id
  ) THEN
    RAISE EXCEPTION 'relationship integrity preflight failed: cross-owner rows exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_list_games WHERE position < 0
  ) OR EXISTS (
    SELECT 1 FROM user_game_sources
    WHERE playtime_minutes_forever < 0
       OR first_play_observed_playtime_minutes < 0
       OR achievements_unlocked < 0
       OR achievements_total < 0
       OR achievements_percent < 0 OR achievements_percent > 100
       OR achievements_unlocked > achievements_total
  ) OR EXISTS (
    SELECT 1 FROM steam_import_candidates WHERE playtime_minutes_forever < 0
  ) THEN
    RAISE EXCEPTION 'relationship integrity preflight failed: invalid numeric rows exist';
  END IF;
END $$;

ALTER TABLE user_list_games
  ADD CONSTRAINT user_list_games_position_nonnegative CHECK (position >= 0);

ALTER TABLE user_game_sources
  ADD CONSTRAINT user_game_sources_numeric_ranges CHECK (
    (playtime_minutes_forever IS NULL OR playtime_minutes_forever >= 0) AND
    (first_play_observed_playtime_minutes IS NULL OR first_play_observed_playtime_minutes >= 0) AND
    (achievements_unlocked IS NULL OR achievements_unlocked >= 0) AND
    (achievements_total IS NULL OR achievements_total >= 0) AND
    (achievements_percent IS NULL OR achievements_percent BETWEEN 0 AND 100) AND
    (achievements_unlocked IS NULL OR achievements_total IS NULL OR achievements_unlocked <= achievements_total)
  );

ALTER TABLE steam_import_candidates
  ADD CONSTRAINT steam_import_candidates_playtime_nonnegative CHECK (
    playtime_minutes_forever IS NULL OR playtime_minutes_forever >= 0
  );

CREATE OR REPLACE FUNCTION enforce_owned_game_relationship()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE game_owner INTEGER;
BEGIN
  IF NEW.game_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO game_owner FROM games WHERE id = NEW.game_id;
  IF game_owner IS NULL OR game_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'game relationship owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_candidate_duplicate_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE game_owner INTEGER;
BEGIN
  IF NEW.duplicate_game_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO game_owner FROM games WHERE id = NEW.duplicate_game_id;
  IF game_owner IS NULL OR game_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'candidate duplicate owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_list_game_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE list_owner INTEGER; game_owner INTEGER;
BEGIN
  SELECT user_id INTO list_owner FROM user_lists WHERE id = NEW.list_id;
  SELECT user_id INTO game_owner FROM games WHERE id = NEW.game_id;
  IF list_owner IS NULL OR game_owner IS NULL OR list_owner <> game_owner THEN
    RAISE EXCEPTION 'list game owner mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER user_game_sources_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_game_sources
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE TRIGGER steam_import_candidates_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, duplicate_game_id ON steam_import_candidates
  FOR EACH ROW EXECUTE FUNCTION enforce_candidate_duplicate_owner();

CREATE TRIGGER user_list_games_owner_guard
  BEFORE INSERT OR UPDATE OF list_id, game_id ON user_list_games
  FOR EACH ROW EXECUTE FUNCTION enforce_list_game_owner();
