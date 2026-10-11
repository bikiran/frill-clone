-- ============================================================
-- COLVY V353 — AGENT ENGINE (Phase 1: the shared engine, shadow mode)
--
-- One engine, many AI roles (Support, Reception, Sales, …). These tables are
-- the engine's memory and its record of everything it does:
--
--   agent_roles      per-business overrides of a role (goal, instructions,
--                    which actions it may use). Templates live in code.
--   agent_policies   how much autonomy a role has for each action:
--                    off | suggest | prepare | act_within_limits | autonomous,
--                    with limits (amount, per day, verified customer …).
--   agent_runs       one row per piece of work: trigger, goal, intent,
--                    status, outcome, plain-English summary, tokens.
--   agent_steps      append-only trail of every step in a run: model calls,
--                    each action requested (with the model's stated reason),
--                    the permission decision and why, the result.
--   agent_approvals  actions waiting for a person ("prepare"), with the exact
--                    arguments frozen so what runs is what was approved.
--   business_memory  durable business knowledge the agents share: profile,
--                    policies, tone, rules, approval rules, learned
--                    preferences (learned ones start as 'proposed').
--   customer_memory  what's worth remembering about one customer.
--
-- All server-only (RLS on, no policies): the admin reads them through
-- /api/agent/*, which checks the caller belongs to the business.
--
-- Nothing here changes how Colvy behaves today. Run in the Supabase SQL
-- editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_key        TEXT NOT NULL,                 -- support | reception | sales | operations | reputation | custom
  enabled         BOOLEAN NOT NULL DEFAULT false,
  name            TEXT,
  goal            TEXT,
  instructions    TEXT,
  allowed_actions TEXT[],                        -- null = the template's list
  settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, role_key)
);

CREATE TABLE IF NOT EXISTS agent_policies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_key    TEXT,                              -- null = every role
  action_key  TEXT NOT NULL,
  autonomy    TEXT NOT NULL CHECK (autonomy IN ('off', 'suggest', 'prepare', 'act_within_limits', 'autonomous')),
  limits      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_policies_uniq ON agent_policies (company_id, COALESCE(role_key, '*'), action_key);

CREATE TABLE IF NOT EXISTS agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_key        TEXT NOT NULL,
  mode            TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'sandbox')),
  trigger_type    TEXT NOT NULL,                 -- inbound_message | event | schedule | staff_request | sandbox | mcp | approval_decision
  trigger_ref     TEXT,
  dedupe_key      TEXT,
  conversation_id UUID,
  contact_id      UUID,
  actor_user_id   UUID,                          -- who started it, for staff/sandbox runs
  goal            TEXT,
  input           JSONB NOT NULL DEFAULT '{}'::jsonb,
  intent          TEXT,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'awaiting_approval', 'completed', 'escalated', 'failed', 'cancelled')),
  outcome         TEXT,                          -- replied | escalated | no_action | needs_info | …
  summary         TEXT,                          -- plain-English "what happened and why"
  context_refs    JSONB NOT NULL DEFAULT '[]'::jsonb,
  model           TEXT,
  tokens_in       INT NOT NULL DEFAULT 0,
  tokens_out      INT NOT NULL DEFAULT 0,
  step_count      INT NOT NULL DEFAULT 0,
  parent_run_id   UUID,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_dedupe ON agent_runs (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_runs_company_idx ON agent_runs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_conversation_idx ON agent_runs (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_runs_active_idx ON agent_runs (status, updated_at) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS agent_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL,
  seq             INT NOT NULL,
  kind            TEXT NOT NULL,                 -- context | model | action | message | escalation | error | finish
  action_key      TEXT,
  input           JSONB,
  output          JSONB,
  reason          TEXT,                          -- the model's stated reason for an action
  decision        TEXT,                          -- allowed | suggested | needs_approval | denied
  decision_reason TEXT,
  autonomy        TEXT,                          -- the level the decision came from
  status          TEXT,                          -- ok | error | simulated | skipped
  entity_type     TEXT,
  entity_id       TEXT,
  duration_ms     INT,
  tokens_in       INT,
  tokens_out      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_steps_run_idx ON agent_steps (run_id, seq);
CREATE INDEX IF NOT EXISTS agent_steps_entity_idx ON agent_steps (company_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_steps_action_day_idx ON agent_steps (company_id, action_key, created_at) WHERE decision = 'allowed';

CREATE TABLE IF NOT EXISTS agent_approvals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_id      UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_id     UUID,
  action_key  TEXT NOT NULL,
  args        JSONB NOT NULL,
  args_hash   TEXT NOT NULL,
  preview     JSONB,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'edited', 'rejected', 'expired', 'executed', 'failed')),
  expires_at  TIMESTAMPTZ,
  decided_by  UUID,
  decided_at  TIMESTAMPTZ,
  result      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_approvals_pending_idx ON agent_approvals (company_id, created_at DESC) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS business_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                     -- profile | hours | policy | tone | faq | rule | instruction | approval_rule | preference
  key         TEXT NOT NULL,
  content     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'archived')),
  source      TEXT NOT NULL DEFAULT 'owner',     -- owner | learned | import
  confidence  REAL,
  version     INT NOT NULL DEFAULT 1,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, kind, key)
);

CREATE TABLE IF NOT EXISTS customer_memory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,               -- preference | fact | summary
  content           TEXT NOT NULL,
  source_run_id     UUID,
  source_message_id UUID,
  confidence        REAL,
  sensitive         BOOLEAN NOT NULL DEFAULT false,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_memory_contact_idx ON customer_memory (company_id, contact_id);

-- Server only.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_roles', 'agent_policies', 'agent_runs', 'agent_steps', 'agent_approvals', 'business_memory', 'customer_memory'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: seven tables, RLS on, no public access.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on, has_table_privilege('anon', c.oid, 'SELECT') AS public_can_read
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 WHERE c.relname IN ('agent_roles', 'agent_policies', 'agent_runs', 'agent_steps', 'agent_approvals', 'business_memory', 'customer_memory')
 ORDER BY c.relname;
