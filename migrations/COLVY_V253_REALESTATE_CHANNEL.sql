-- V253 — RealEstate (realestate.com.au) enquiry channel
--
-- Buyer enquiries submitted on a realestate.com.au listing are pushed to Colvy
-- and land in the inbox as conversations (channel = 'realestate'), the same way
-- SMS/email do. The agency connects its REA Portal credentials (Client ID +
-- API Secret Key) here; inbound enquiries are matched to the company by a
-- per-company webhook token in the URL REA posts to.

create table if not exists realestate_integrations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  client_id    text,                 -- REA Portal Client ID
  api_secret   text,                 -- REA Portal API Secret Key (server-side only)
  agency_id    text,                 -- optional REA agency / office id
  -- Unguessable token embedded in the inbound webhook URL, so REA's POST can be
  -- matched to this company without exposing anything.
  webhook_token text not null default replace(gen_random_uuid()::text, '-', ''),
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id)
);

create index if not exists realestate_integrations_token_idx on realestate_integrations (webhook_token);

-- Company staff may read their own row (drives the "Connected" badge); all
-- writes go through the service-role API so the secret is never client-writable.
alter table realestate_integrations enable row level security;
drop policy if exists realestate_member_read on realestate_integrations;
create policy realestate_member_read on realestate_integrations for select
  using (
    company_id in (select company_id from team_members where user_id = auth.uid())
    or company_id in (select id from companies where owner_id = auth.uid())
  );

notify pgrst, 'reload schema';
