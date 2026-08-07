-- ============================================================
-- COLVY V216 — COMPANY ADMIN NOTES
-- Internal, admin-only notes attached to a business, shown on the
-- business detail page in the Super Admin console. Supports a category
-- and pinning so important context stays at the top. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS company_admin_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL,
  author_id    UUID,
  author_email TEXT,
  body         TEXT NOT NULL,
  category     TEXT DEFAULT 'general',   -- general | billing | support | technical | risk
  pinned       BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_admin_notes_company ON company_admin_notes(company_id, pinned DESC, created_at DESC);
ALTER TABLE company_admin_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage company_admin_notes" ON company_admin_notes;
CREATE POLICY "Anyone can manage company_admin_notes" ON company_admin_notes FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
