-- V254 — RealEstate: move to Colvy-owned Partner Platform credentials
--
-- Agencies no longer enter their own REA Client ID / Secret. Colvy authenticates
-- to realestate.com.au with its OWN partner credentials (OAuth 2.0 Client
-- Credentials, server env REA_*). Each agency simply authorizes Colvy; we then
-- create their EnquiryCreated webhook subscription and pull leads on their
-- behalf. So this row now stores only the agency's identifiers + authorization
-- state, never secrets.

alter table realestate_integrations
  add column if not exists office_id       text,          -- REA office id (optional)
  add column if not exists subscription_id text,          -- REA EnquiryCreated subscription id
  add column if not exists authorized      boolean not null default false,
  add column if not exists scopes          text,          -- space-separated granted scopes
  add column if not exists authorized_at   timestamptz;

-- Per-company REA credentials are obsolete — Colvy uses its own. Wipe any that
-- were entered before this change so no agency secret lingers in the table.
update realestate_integrations set api_secret = null, client_id = null;

-- Keep is_active in step with the new authorization flag for existing rows.
update realestate_integrations set is_active = coalesce(authorized, false);

notify pgrst, 'reload schema';
