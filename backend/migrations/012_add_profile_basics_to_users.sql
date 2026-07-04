ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS avatar_icon TEXT NOT NULL DEFAULT 'gamepad',
  ADD COLUMN IF NOT EXISTS avatar_color TEXT NOT NULL DEFAULT 'orange';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_display_name_length_check'
       AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_display_name_length_check
      CHECK (display_name IS NULL OR char_length(display_name) <= 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_bio_length_check'
       AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_bio_length_check
      CHECK (bio IS NULL OR char_length(bio) <= 240);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_avatar_icon_check'
       AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_avatar_icon_check
      CHECK (
        avatar_icon IN (
          'gamepad',
          'joystick',
          'dice',
          'trophy',
          'crown',
          'flame',
          'star',
          'skull',
          'sword',
          'shield',
          'book',
          'rocket',
          'heart',
          'zap',
          'compass',
          'potion',
          'hourglass',
          'headphones',
          'rune',
          'mask',
          'cards',
          'axe',
          'crystal',
          'leaf',
          'flower',
          'coffee',
          'cpu',
          'eye'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_avatar_color_check'
       AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_avatar_color_check
      CHECK (
        avatar_color IN (
          'orange',
          'blue',
          'green',
          'pink',
          'violet',
          'gold',
          'slate',
          'red'
        )
      );
  END IF;
END $$;
