-- ============================================================
-- COLVY V220 — PLATFORM SETTINGS
-- A tiny key/value store for platform-wide configuration set by the super
-- admin (not by individual companies). First use: the global SMS pricing that
-- applies to every organisation. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage platform_settings" ON platform_settings;
CREATE POLICY "Anyone can manage platform_settings" ON platform_settings FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
