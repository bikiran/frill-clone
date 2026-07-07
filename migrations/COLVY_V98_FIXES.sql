-- ============================================================
-- COLVY V98 FIXES MIGRATION
-- Run this in the Supabase SQL editor (project: mtfhctgdayeqrguodksv)
-- Safe to run multiple times.
-- ============================================================

-- IDEAS.PRIORITY: the live column is INTEGER in some databases, but the app
-- saves preset keys like 'low' / 'medium' / 'high' / 'quick_wins'.
-- That mismatch causes: invalid input syntax for type integer: "low".
-- Convert to TEXT, mapping any old numeric values onto the preset keys.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ideas' AND column_name = 'priority'
      AND data_type IN ('integer', 'bigint', 'smallint', 'numeric')
  ) THEN
    ALTER TABLE ideas ALTER COLUMN priority DROP DEFAULT;
    ALTER TABLE ideas ALTER COLUMN priority TYPE TEXT USING (
      CASE priority::text
        WHEN '1' THEN 'low'
        WHEN '2' THEN 'medium'
        WHEN '3' THEN 'high'
        WHEN '4' THEN 'quick_wins'
        ELSE NULL
      END
    );
  END IF;
END $$;

-- Ensure the column exists as TEXT for fresh databases too
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS priority TEXT;

-- Done.

-- VOTES: store the voter's display name + avatar at vote time so the idea
-- detail view can show real profile icons instead of generic tick marks.
ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS user_avatar TEXT;
