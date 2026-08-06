-- ============================================================
-- COLVY V246 — GALLERY TRASH (soft delete)
-- Deleting a gallery item moves it to Trash (trashed_at set) instead of a hard
-- delete. From Trash it can be restored, or it's auto-purged 30 days later
-- (the /api/media GET sweeps expired trash on load). Additive, safe to re-run.
-- ============================================================

ALTER TABLE media_items ADD COLUMN IF NOT EXISTS trashed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_media_items_trashed ON media_items (company_id, trashed_at);

NOTIFY pgrst, 'reload schema';
