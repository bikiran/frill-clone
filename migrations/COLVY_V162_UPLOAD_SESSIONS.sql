-- ============================================================
-- COLVY V162 — PHONE UPLOAD SESSIONS (QR → gallery)
-- Scan a QR code on screen, upload from your phone's gallery, and the
-- files land straight in the company gallery — no cables, no emailing
-- yourself photos. Sessions expire so a stale QR can't be reused.
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,          -- unguessable; goes in the QR
  company_id UUID NOT NULL,
  created_by UUID,                     -- which team member opened it
  folder_id UUID,                      -- optional gallery folder to drop into
  uploaded_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  last_upload_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_token ON upload_sessions(token);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_company ON upload_sessions(company_id, created_at DESC);

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage upload_sessions" ON upload_sessions;
CREATE POLICY "Anyone can manage upload_sessions" ON upload_sessions FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
