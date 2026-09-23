-- COLVY_V315_HELP_COVER
-- Optional cover/hero image for a company's help centre homepage. When set, it
-- is used as the hero background; when null the hero falls back to the branded
-- gradient. Uploaded from Admin → Help → Settings.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS help_cover_url TEXT;

NOTIFY pgrst, 'reload schema';
