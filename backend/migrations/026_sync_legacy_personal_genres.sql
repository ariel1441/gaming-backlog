ALTER TABLE user_personal_genres
  DROP CONSTRAINT IF EXISTS user_personal_genres_name_check,
  DROP CONSTRAINT IF EXISTS user_personal_genres_normalized_name_check;

ALTER TABLE user_personal_genres
  ADD CONSTRAINT user_personal_genres_name_check CHECK (char_length(name) >= 1),
  ADD CONSTRAINT user_personal_genres_normalized_name_check
    CHECK (char_length(normalized_name) >= 1);

CREATE OR REPLACE FUNCTION sync_legacy_personal_genres()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM game_personal_genres WHERE game_id = NEW.id;

  WITH parsed AS (
    SELECT part.ordinality,
           trim(regexp_replace(part.value, '\s+', ' ', 'g')) AS name
      FROM regexp_split_to_table(COALESCE(NEW.my_genre, ''), ',')
        WITH ORDINALITY AS part(value, ordinality)
  ), deduplicated AS (
    SELECT DISTINCT ON (lower(name)) name, lower(name) AS normalized_name, ordinality
      FROM parsed
     WHERE name <> ''
     ORDER BY lower(name), ordinality
  )
  INSERT INTO user_personal_genres (user_id, name, normalized_name)
  SELECT NEW.user_id, name, normalized_name
    FROM deduplicated
  ON CONFLICT (user_id, normalized_name) DO NOTHING;

  WITH parsed AS (
    SELECT part.ordinality,
           lower(trim(regexp_replace(part.value, '\s+', ' ', 'g'))) AS normalized_name
      FROM regexp_split_to_table(COALESCE(NEW.my_genre, ''), ',')
        WITH ORDINALITY AS part(value, ordinality)
  ), deduplicated AS (
    SELECT DISTINCT ON (normalized_name) normalized_name, ordinality
      FROM parsed
     WHERE normalized_name <> ''
     ORDER BY normalized_name, ordinality
  ), ordered AS (
    SELECT normalized_name,
           row_number() OVER (ORDER BY ordinality) - 1 AS position
      FROM deduplicated
  )
  INSERT INTO game_personal_genres
    (user_id, game_id, personal_genre_id, position)
  SELECT NEW.user_id, NEW.id, genre.id, ordered.position
    FROM ordered
    JOIN user_personal_genres genre
      ON genre.user_id = NEW.user_id
     AND genre.normalized_name = ordered.normalized_name
   WHERE ordered.position < 10;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS games_legacy_personal_genres_sync ON games;
CREATE TRIGGER games_legacy_personal_genres_sync
  AFTER INSERT OR UPDATE OF my_genre ON games
  FOR EACH ROW EXECUTE FUNCTION sync_legacy_personal_genres();
