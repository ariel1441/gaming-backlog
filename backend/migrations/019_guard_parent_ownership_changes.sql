CREATE OR REPLACE FUNCTION prevent_game_owner_change_with_relationships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_game_sources WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM steam_import_candidates WHERE duplicate_game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while owned relationships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION prevent_list_owner_change_with_memberships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE list_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change list owner while memberships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER games_owner_change_guard
  BEFORE UPDATE OF user_id ON games
  FOR EACH ROW EXECUTE FUNCTION prevent_game_owner_change_with_relationships();

CREATE TRIGGER user_lists_owner_change_guard
  BEFORE UPDATE OF user_id ON user_lists
  FOR EACH ROW EXECUTE FUNCTION prevent_list_owner_change_with_memberships();
