-- COLVY_V421: where each workspace's chat widget has loaded.
--
-- public/widget.js tells Colvy which site it's on (POST /api/widget/seen, at
-- most once a day from each browser). The chat widget's Install page and the
-- inbox's "Install your chat widget" card read it back to show whether the
-- widget is live, and on which sites.
--
-- One row per workspace and site (hostname, without "www."). Written and read
-- by the server only (service role): RLS is on with no policies.

create table if not exists widget_sites (
  company_id uuid not null references companies(id) on delete cascade,
  host text not null check (char_length(host) between 1 and 253),
  page_url text check (page_url is null or char_length(page_url) <= 500),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (company_id, host)
);

create index if not exists widget_sites_company_seen on widget_sites (company_id, last_seen_at desc);

alter table widget_sites enable row level security;
