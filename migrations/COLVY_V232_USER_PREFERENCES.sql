-- ============================================================
-- COLVY V232 — USER PREFERENCES
-- Per-user, per-company UI preferences that should follow the user everywhere
-- they sign in (web + mobile) rather than living in one browser's localStorage.
-- First use: the Tasks page "default view" + custom view names (right-click a
-- view tab → Make default / Rename). Generic key→value(jsonb) so future prefs
-- reuse the same table.
-- Additive and safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id     UUID        NOT NULL,
  company_id  UUID        NOT NULL,
  key         TEXT        NOT NULL,
  value       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id, key)
);

CREATE INDEX IF NOT EXISTS user_preferences_user_company_idx
  ON user_preferences (user_id, company_id);

NOTIFY pgrst, 'reload schema';
