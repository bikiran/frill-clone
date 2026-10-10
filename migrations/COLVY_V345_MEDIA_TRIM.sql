-- ============================================================
-- COLVY V345 — TRIM GALLERY VIDEOS
--
-- "Trim" on a gallery video saves a trimmed COPY (the original is kept).
-- The copy is a normal video row that goes through the existing
-- transcode pipeline (lib/transcode.ts); trim_start / trim_end (seconds
-- into the source) tell ffmpeg which part to keep, and trimmed_from
-- points back at the original.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE media_items ADD COLUMN IF NOT EXISTS trim_start NUMERIC;
ALTER TABLE media_items ADD COLUMN IF NOT EXISTS trim_end NUMERIC;
ALTER TABLE media_items ADD COLUMN IF NOT EXISTS trimmed_from UUID;
