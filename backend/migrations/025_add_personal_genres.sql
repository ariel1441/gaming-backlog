CREATE UNIQUE INDEX IF NOT EXISTS games_user_id_id_unique
  ON games (user_id, id);

CREATE TABLE IF NOT EXISTS user_personal_genres (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1),
  normalized_name TEXT NOT NULL CHECK (char_length(normalized_name) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_name),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS game_personal_genres (
  user_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  personal_genre_id INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
  PRIMARY KEY (game_id, personal_genre_id),
  UNIQUE (game_id, position),
  FOREIGN KEY (user_id, game_id)
    REFERENCES games(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, personal_genre_id)
    REFERENCES user_personal_genres(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS game_personal_genres_user_genre
  ON game_personal_genres (user_id, personal_genre_id, game_id);

WITH split_genres AS (
  SELECT g.user_id,
         g.id AS game_id,
         part.ordinality,
         trim(regexp_replace(part.value, '\s+', ' ', 'g')) AS name
    FROM games g
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(g.my_genre, ''), ',')
      WITH ORDINALITY AS part(value, ordinality)
), valid_genres AS (
  SELECT *, lower(name) AS normalized_name
    FROM split_genres
   WHERE name <> ''
), first_owner_names AS (
  SELECT DISTINCT ON (user_id, normalized_name)
         user_id, name, normalized_name
    FROM valid_genres
   ORDER BY user_id, normalized_name, game_id, ordinality
)
INSERT INTO user_personal_genres (user_id, name, normalized_name)
SELECT user_id, name, normalized_name
  FROM first_owner_names
ON CONFLICT (user_id, normalized_name) DO NOTHING;

WITH split_genres AS (
  SELECT g.user_id,
         g.id AS game_id,
         part.ordinality,
         lower(trim(regexp_replace(part.value, '\s+', ' ', 'g'))) AS normalized_name
    FROM games g
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(g.my_genre, ''), ',')
      WITH ORDINALITY AS part(value, ordinality)
), first_game_genres AS (
  SELECT DISTINCT ON (user_id, game_id, normalized_name)
         user_id, game_id, normalized_name, ordinality
    FROM split_genres
   WHERE normalized_name <> ''
   ORDER BY user_id, game_id, normalized_name, ordinality
), ordered_memberships AS (
  SELECT f.user_id,
         f.game_id,
         p.id AS personal_genre_id,
         row_number() OVER (
           PARTITION BY f.game_id ORDER BY f.ordinality, p.id
         ) - 1 AS position
    FROM first_game_genres f
    JOIN user_personal_genres p
      ON p.user_id = f.user_id
     AND p.normalized_name = f.normalized_name
)
INSERT INTO game_personal_genres (user_id, game_id, personal_genre_id, position)
SELECT user_id, game_id, personal_genre_id, position
  FROM ordered_memberships
 WHERE position < 10
ON CONFLICT DO NOTHING;

UPDATE games g
   SET my_genre = derived.names
  FROM (
    SELECT membership.game_id,
           string_agg(genre.name, ', ' ORDER BY membership.position) AS names
      FROM game_personal_genres membership
      JOIN user_personal_genres genre
        ON genre.id = membership.personal_genre_id
       AND genre.user_id = membership.user_id
     GROUP BY membership.game_id
  ) derived
 WHERE g.id = derived.game_id
   AND g.my_genre IS DISTINCT FROM derived.names;

CREATE OR REPLACE FUNCTION prevent_game_owner_change_with_relationships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_game_sources WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM steam_import_candidates WHERE duplicate_game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_metadata_candidates WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_next_up_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_personal_genres WHERE game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while owned relationships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
