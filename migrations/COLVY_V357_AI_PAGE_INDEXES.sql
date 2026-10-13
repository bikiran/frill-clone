-- ============================================================
-- COLVY V357 — INDEXES FOR THE AI PAGES (AGENTS, NEEDS YOU, RESULTS)
--
-- The goals and results behind AI Agents, Needs You and Results & Goals read
-- "this business's messages / agent steps / approvals / pay links since last
-- week". None of those tables had an index on (company_id, created_at), so
-- every load scanned the whole table, page by page. These indexes let the
-- database jump straight to one business's recent rows.
--
-- Only adds indexes: no data changes. Building the messages index takes a
-- moment on a big table and briefly holds up new messages while it builds,
-- so run it at a quiet time. Safe to re-run.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_company_created ON messages (company_id, created_at);
CREATE INDEX IF NOT EXISTS agent_steps_company_created_idx ON agent_steps (company_id, created_at);
CREATE INDEX IF NOT EXISTS agent_approvals_company_created_idx ON agent_approvals (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_payments_company_created ON chat_payments (company_id, created_at);

ANALYZE messages;
ANALYZE agent_steps;
ANALYZE agent_approvals;
ANALYZE chat_payments;

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect four rows, one per index.
SELECT tablename, indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN ('idx_messages_company_created', 'agent_steps_company_created_idx',
                     'agent_approvals_company_created_idx', 'idx_chat_payments_company_created')
 ORDER BY tablename;
