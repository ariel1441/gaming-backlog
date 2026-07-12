CREATE OR REPLACE FUNCTION normalize_game_title_sql(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT trim(
    replace(replace(replace(replace(replace(replace(
      ' ' || trim(regexp_replace(translate(lower(COALESCE(value, '')), '''' || chr(8217) || chr(8216) || chr(700), ''), '[^a-z0-9]+', ' ', 'g')) || ' ',
      ' vii ', ' 7 '), ' vi ', ' 6 '), ' v ', ' 5 '),
      ' iv ', ' 4 '), ' iii ', ' 3 '), ' ii ', ' 2 ')
  );
$function$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM games
    WHERE position < 0 OR how_long_to_beat < 0 OR my_score < 0 OR my_score > 10
       OR (started_at IS NOT NULL AND finished_at IS NOT NULL AND finished_at < started_at)
  ) THEN
    RAISE EXCEPTION 'game integrity preflight failed: invalid numeric or date values exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM games WHERE catalog_game_id IS NOT NULL
    GROUP BY user_id, catalog_game_id HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM games WHERE rawg_id IS NOT NULL
    GROUP BY user_id, rawg_id HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM games
    WHERE catalog_game_id IS NULL AND rawg_id IS NULL
    GROUP BY user_id, normalize_game_title_sql(name)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'game identity preflight failed: duplicate backlog identities exist';
  END IF;

END $$;

DO $$
DECLARE
  tied_position_groups INTEGER;
BEGIN
  SELECT COUNT(*) INTO tied_position_groups
  FROM (
    SELECT 1
    FROM games g
    JOIN statuses s ON s.status = g.status
    GROUP BY g.user_id, s.rank, g.position
    HAVING COUNT(*) > 1
  ) ties;

  IF tied_position_groups > 0 THEN
    RAISE NOTICE 'game position preflight: % tied rank-group positions retained; future allocations are serialized', tied_position_groups;
  END IF;
END $$;

ALTER TABLE games
  ADD CONSTRAINT games_position_nonnegative CHECK (position >= 0),
  ADD CONSTRAINT games_hltb_nonnegative CHECK (how_long_to_beat IS NULL OR how_long_to_beat >= 0),
  ADD CONSTRAINT games_score_range CHECK (my_score IS NULL OR my_score BETWEEN 0 AND 10),
  ADD CONSTRAINT games_date_order CHECK (
    started_at IS NULL OR finished_at IS NULL OR finished_at >= started_at
  );

CREATE UNIQUE INDEX games_user_catalog_unique
  ON games (user_id, catalog_game_id) WHERE catalog_game_id IS NOT NULL;

CREATE UNIQUE INDEX games_user_rawg_unique
  ON games (user_id, rawg_id) WHERE rawg_id IS NOT NULL;

CREATE UNIQUE INDEX games_user_unlinked_title_unique
  ON games (
    user_id,
    normalize_game_title_sql(name)
  )
  WHERE catalog_game_id IS NULL AND rawg_id IS NULL;
