-- ============================================================
-- COLVY V355 — OUTSIDE TOOLS FOR AGENTS (MCP connections)
--
-- A business can connect its agents to outside tool servers that speak MCP
-- (Zapier MCP, a CRM, a booking or stock system…). Each connection stores the
-- server address, how to sign in (an API key / token, kept server-side only),
-- which agents may use it, and the tools it offers with what each may do:
--   off  — not offered to agents
--   auto — used on its own (look-ups; for changes, within a daily limit)
--   ask  — a person approves each use first
--
-- Server-only: row level security is on with no policies, so only Colvy's
-- server (service role) can read it — the key never reaches a browser.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none',      -- none | bearer | header
  auth_header TEXT,                             -- header name when auth_type = 'header'
  secret TEXT,                                  -- API key / token (server only)
  roles TEXT[] NOT NULL DEFAULT '{}',           -- which agents may use it
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ key, name, title, description, input_schema, read_only, mode }]
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'new',           -- new | ok | error
  last_error TEXT,
  server_name TEXT,
  synced_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_connections_company ON agent_connections(company_id);

ALTER TABLE agent_connections ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: server access only.
