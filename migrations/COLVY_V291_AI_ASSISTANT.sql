-- ============================================================
-- COLVY V291 — COLVY AI ASSISTANT audit log
-- Every action the Colvy AI assistant performs on a user's behalf is recorded
-- here so it can be audited (performed_via = 'colvy_ai'). Reads are not logged;
-- only actions that create/modify/send. Denormalised input/result for a full
-- record without joins. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_assistant_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID,
  user_id       UUID,
  action        TEXT,                       -- human label, e.g. 'Created task'
  tool          TEXT,                       -- tool name, e.g. 'create_task'
  entity_type   TEXT,                       -- 'task' | 'reminder' | 'calendar_event' | 'message' | ...
  entity_id     TEXT,                       -- id of the thing created/affected
  input         JSONB DEFAULT '{}'::jsonb,  -- the (resolved) tool arguments
  result        JSONB DEFAULT '{}'::jsonb,  -- outcome summary
  performed_via TEXT DEFAULT 'colvy_ai',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_assistant_events_company_idx ON ai_assistant_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_assistant_events_user_idx ON ai_assistant_events (user_id, created_at DESC);

ALTER TABLE ai_assistant_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY ai_assistant_events_all ON ai_assistant_events FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
