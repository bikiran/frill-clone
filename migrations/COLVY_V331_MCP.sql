-- ============================================================
-- COLVY V331 — COLVY MCP SERVER
--
-- Lets AI assistants (Claude, ChatGPT, Cursor, Claude Code…) connect to
-- a business's Colvy over the Model Context Protocol at /api/mcp.
--
--   mcp_oauth_clients — apps that registered themselves (OAuth dynamic
--                       client registration)
--   mcp_auth_codes    — one-time authorisation codes (PKCE), 10 minutes
--   mcp_tokens        — API keys made in Colvy, and OAuth access/refresh
--                       tokens. Only SHA-256 hashes are stored.
--
-- Server only (RLS on, no policies). Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT,
  client_uri TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_auth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'read',
  resource TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,                 -- api_key | oauth
  name TEXT,                          -- "Claude Code on my Mac" / the app's name
  client_id TEXT,                     -- oauth only
  token_hash TEXT NOT NULL UNIQUE,
  token_last4 TEXT,
  refresh_hash TEXT UNIQUE,           -- oauth only
  scope TEXT NOT NULL DEFAULT 'read', -- read | write
  expires_at TIMESTAMPTZ,             -- null = no expiry (API keys)
  refresh_expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_company ON mcp_tokens (company_id, created_at DESC);

ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
