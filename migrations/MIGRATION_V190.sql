-- V190: per-user WebRTC credentials, so every teammate's device can be
-- registered at once.
--
-- Previously every client logged in with the same telephony credential, and
-- Telnyx routes a call to the MOST RECENT registration — so whoever signed in
-- last took the call and everyone else stayed silent.

create table if not exists telnyx_user_credentials (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  user_id       uuid not null,
  connection_id text not null,
  credential_id text not null,
  sip_username  text,
  created_at    timestamptz not null default now(),
  unique (company_id, user_id, connection_id)
);

create index if not exists telnyx_user_credentials_company_idx
  on telnyx_user_credentials (company_id);

-- The extra legs ringing alongside the first agent, so whichever answers can
-- cancel the rest.
alter table calls add column if not exists ringing_leg_ids jsonb;

-- Used by the call detail screen.
alter table calls add column if not exists ai_todos jsonb;
alter table calls add column if not exists sentiment text;
