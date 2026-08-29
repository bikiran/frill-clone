-- ============================================================
-- COLVY V292 — Notes: notebook grouping
-- Lets a note be filed under a named notebook (like the mobile app's
-- "Add to a notebook"). A plain name on the note — no separate table — so it
-- stays in sync with mobile and needs no joins. Per-checklist-item photo / due
-- date / flag ride along inside the existing `checklist` JSONB, so they need no
-- schema change. Safe to re-run.
-- ============================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS notebook TEXT;

CREATE INDEX IF NOT EXISTS notes_company_notebook_idx ON notes (company_id, notebook);

NOTIFY pgrst, 'reload schema';
