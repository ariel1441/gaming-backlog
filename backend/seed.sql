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
