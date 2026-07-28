-- ============================================================
-- COLVY V122 — MOBILE PUSH NOTIFICATIONS
-- Stores Expo push tokens per user/device. Single step.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID,
  expo_token TEXT NOT NULL,
  platform TEXT DEFAULT 'android',   -- android | ios
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_uniq ON push_tokens(expo_token);
CREATE INDEX IF NOT EXISTS idx_push_tokens_company ON push_tokens(company_id);
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage push_tokens" ON push_tokens;
CREATE POLICY "Anyone can manage push_tokens" ON push_tokens FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';
