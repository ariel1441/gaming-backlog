-- Stable status keys preserve existing games, positions and saved references.
-- The retired recommendation value stays valid for existing assignments.
INSERT INTO statuses (status, rank) VALUES
  ('playing', 1),
  ('plan to play soon', 2),
  ('plan to play', 3),
  ('play when in the mood', 4),
  ('played and should come back', 5),
  ('occasional', 6),
  ('maybe in the future', 7),
  ('finished', 8),
  ('played alot but didnt finish', 9),
  ('played a bit', 10),
  ('not anytime soon', 11),
  ('played and wont come back', 12),
  ('recommended by someone', 13)
ON CONFLICT (status) DO UPDATE SET rank = EXCLUDED.rank;

UPDATE games g SET status = 'occasional'
  FROM user_play_focus_games focus
 WHERE focus.user_id = g.user_id AND focus.game_id = g.id
   AND focus.focus_role = 'occasional' AND LOWER(TRIM(g.status)) = 'playing';
