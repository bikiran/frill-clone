-- ============================================================
-- COLVY V243 — GALLERY LOAD SPEED (composite ordering indexes)
-- The gallery load is "WHERE company_id = ? [AND folder_id = ?] ORDER BY
-- created_at DESC LIMIT 500". The existing single-column indexes
-- (idx_media_items_company / idx_media_items_folder) satisfy the filter but
-- force a separate sort of every matching row before the LIMIT can apply.
-- These composite indexes carry the ordering, so Postgres walks rows already
-- sorted and stops at 500 — no sort step, big win on large libraries.
-- Additive and safe to re-run.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_media_items_company_created
  ON media_items (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_items_folder_created
  ON media_items (folder_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
