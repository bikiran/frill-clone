-- ============================================================
-- COLVY V199 — MEDIA GALLERY LINKS
--
-- A short link previously pointed at exactly one file (target_url). Sending
-- three delivery photos therefore meant three separate links pasted into the
-- message, which read as a wall of URLs and gave the customer three things to
-- tap instead of one.
--
-- media_urls holds the whole set so a single branded link can present them as
-- a gallery. target_url stays populated with the first item, so every existing
-- reader of that column keeps working unchanged.
--
--   [{ "url": "...", "name": "front-door.jpg", "type": "image/jpeg" }, ...]
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE short_links ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb;

-- An optional message shown above the gallery (the agent's note).
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS note TEXT;

NOTIFY pgrst, 'reload schema';
