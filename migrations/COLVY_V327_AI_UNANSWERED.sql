-- ============================================================
-- COLVY V327 — QUESTIONS COLVY AI COULDN'T ANSWER
--
-- Every time Colvy AI hands a customer to a person because the knowledge
-- library didn't cover their question (or an inbox draft found nothing to
-- go on), the question lands here, grouped with similar ones. The owner
-- answers it once as a fact, and Colvy AI knows it from then on.
--
-- Needs V326 (ai_facts). Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_unanswered (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  question TEXT NOT NULL,               -- the clearest wording seen
  key TEXT NOT NULL,                    -- normalised words, for grouping
  count INT NOT NULL DEFAULT 1,
  examples JSONB NOT NULL DEFAULT '[]', -- [{ text, conversation_id, source, at }] (latest 5)
  suggested_answer TEXT,                -- how the team answered it, when known
  status TEXT NOT NULL DEFAULT 'open',  -- open | answered | dismissed
  fact_id UUID,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_unanswered_key ON ai_unanswered (company_id, key);
CREATE INDEX IF NOT EXISTS idx_ai_unanswered_open ON ai_unanswered (company_id, status, last_seen_at DESC);

-- Server only, like the rest of the AI library.
ALTER TABLE ai_unanswered ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
