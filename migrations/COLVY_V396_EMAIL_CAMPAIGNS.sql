-- ============================================================
-- COLVY V396 — EMAIL CAMPAIGNS: SENDING DOMAINS, DESIGNS, RECIPIENTS,
-- EVENTS, SUPPRESSIONS AND EMAIL-ONLY OPT-OUTS
--
-- New tables (all server-written; staff of the workspace may read their own):
--   email_sending_domains       a business's own sending domain on Resend
--                               (DNS records to add, verification status,
--                               from name / local part / reply-to).
--   email_designs               the email designer's saved designs: block JSON,
--                               the rendered email-safe HTML and plain text,
--                               and the frozen copy a campaign sends from.
--   email_campaign_recipients   one row per person per email campaign, with
--                               its send status, so a send that runs out of
--                               time picks up where it stopped. Kept apart
--                               from campaign_recipients (SMS) on purpose: the
--                               SMS worker reads every pending row of a
--                               'sending' campaign and texts it, so email rows
--                               must never be in its table.
--   email_events                per-message events (delivered, opened,
--                               clicked, bounced, complained, unsubscribed…)
--                               from Resend's webhook and Colvy's own open
--                               pixel and tracked links, for reports.
--   email_suppressions          addresses never to email: a business's own
--                               (hard bounce, 3 soft bounces in 30 days,
--                               complaint) plus a global list (company_id NULL)
--                               for spam complaints, which protect the Resend
--                               account every business sends through.
-- New contact columns:
--   email_marketing_opt_out_at  the customer turned off marketing EMAIL only
--   email_unsubscribe_source    how (one-click header, the link, preferences…)
--   sms_marketing_opt_out_at    the customer turned off texts from the email
--                               preference page (also recorded as a STOP in
--                               sms_keywords, which every text already obeys)
--
-- RLS in the V375 / V382 style: every policy on each new table is dropped,
-- table rights for anon / authenticated are revoked, then only SELECT for the
-- workspace's staff (is_company_member, which leaves board visitors out since
-- V337) and the platform admin is granted back. Writes are the server's only
-- (service role, through requireCompanyAccess plus an owner/admin check for
-- domains). Global suppressions (company_id NULL) are readable by the
-- platform admin only.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/email-campaigns is
-- deployed. Without it the code keeps working: the sending-domain page and
-- the designer say they're waiting on this update, the webhook skips storing
-- events, suppressions read as empty, and an email-only unsubscribe falls back
-- to the existing all-marketing unsubscribe (contacts.unsubscribed_at), so an
-- opt-out is always honoured.
-- Needs is_company_member() from V209 as changed by V337 (stops with an error,
-- changing nothing, if it's missing or still the original).
-- The mobile app (colvy-mobile) reads none of these tables.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. Step 9 lists one SELECT policy per new table.
--   2. Signed out (anon key): select * from email_suppressions; → permission denied
--   3. Settings → Channels → Email sending domain: add a domain, see its DNS
--      records, "Check again".
--
-- Safe to re-run (IF NOT EXISTS everywhere; policies dropped and recreated).
-- Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_company_member(uuid) is missing — run COLVY_V209_RLS_PHASE1_CREDENTIALS.sql and COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
  IF pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) NOT ILIKE '%''viewer''%' THEN
    RAISE EXCEPTION 'is_company_member(uuid) still counts board visitors (role viewer) as members — run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'bishalstha76@gmail.com'
$$;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- ── STEP 1: sending domains ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sending_domains (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL,
  domain           TEXT NOT NULL,
  resend_domain_id TEXT,
  region           TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',   -- pending / verified / failed
  provider_status  TEXT,                              -- Resend's own word (not_started, temporary_failure…)
  records          JSONB NOT NULL DEFAULT '[]'::jsonb,
  from_name        TEXT,
  from_local_part  TEXT NOT NULL DEFAULT 'hello',
  reply_to         TEXT,
  verified_at      TIMESTAMPTZ,
  last_checked_at  TIMESTAMPTZ,
  last_error       TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE email_sending_domains ADD COLUMN IF NOT EXISTS provider_status TEXT;
ALTER TABLE email_sending_domains ADD COLUMN IF NOT EXISTS last_error TEXT;
-- One business per domain: nobody can claim a domain another business added.
CREATE UNIQUE INDEX IF NOT EXISTS email_sending_domains_domain_key ON email_sending_domains (lower(domain));
CREATE INDEX IF NOT EXISTS email_sending_domains_company_idx ON email_sending_domains (company_id, created_at DESC);

-- ── STEP 2: designs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_designs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  campaign_id   UUID,                 -- the email campaign it belongs to (NULL: a saved design)
  name          TEXT NOT NULL DEFAULT 'Untitled email',
  subject       TEXT,
  preview_text  TEXT,
  design        JSONB NOT NULL DEFAULT '{}'::jsonb,
  html          TEXT,                 -- rendered, merge tags still in place
  text          TEXT,                 -- plain-text version
  frozen        JSONB,                -- what the campaign sends (set when it starts)
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_designs_campaign_key ON email_designs (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_designs_company_idx ON email_designs (company_id, updated_at DESC);

-- ── STEP 3: recipients ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID NOT NULL,
  company_id       UUID NOT NULL,
  contact_id       UUID,
  email            TEXT NOT NULL,           -- always stored lower-case
  name             TEXT,
  merge            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'pending',   -- pending / sending / sent / failed / skipped
  skip_reason      TEXT,                              -- suppressed / unsubscribed / no_consent / blocked / invalid_email / duplicate
  attempts         INTEGER NOT NULL DEFAULT 0,
  batch_key        TEXT,                              -- Resend idempotency key of the batch it went in
  claimed_at       TIMESTAMPTZ,
  resend_email_id  TEXT,
  error            TEXT,
  sent_at          TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  opened_at        TIMESTAMPTZ,
  clicked_at       TIMESTAMPTZ,
  bounced_at       TIMESTAMPTZ,
  complained_at    TIMESTAMPTZ,
  unsubscribed_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_recipients_email_key ON email_campaign_recipients (campaign_id, email);
CREATE INDEX IF NOT EXISTS email_campaign_recipients_status_idx ON email_campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS email_campaign_recipients_resend_idx ON email_campaign_recipients (resend_email_id) WHERE resend_email_id IS NOT NULL;

-- ── STEP 4: events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID,
  campaign_id        UUID,
  recipient_id       UUID,
  contact_id         UUID,
  email              TEXT,
  resend_email_id    TEXT,
  type               TEXT NOT NULL,     -- sent / delivered / opened / clicked / bounced / soft_bounced / complained / delivery_delayed / failed / unsubscribed
  link               TEXT,
  bounce_type        TEXT,
  detail             JSONB,
  provider_event_id  TEXT,              -- svix-id: Resend retries reuse it
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_events_provider_key ON email_events (provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_events_campaign_idx ON email_events (campaign_id, type);
CREATE INDEX IF NOT EXISTS email_events_address_idx ON email_events (company_id, lower(email), type, occurred_at DESC);

-- ── STEP 5: suppressions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_suppressions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID,                    -- NULL: the global list
  email        TEXT NOT NULL,           -- always stored lower-case
  reason       TEXT NOT NULL,           -- hard_bounce / soft_bounce / complaint / manual
  detail       TEXT,
  campaign_id  UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_key
  ON email_suppressions (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email));
CREATE INDEX IF NOT EXISTS email_suppressions_email_idx ON email_suppressions (lower(email));

-- ── STEP 6: contact columns ─────────────────────────────────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_marketing_opt_out_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_unsubscribe_source   TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sms_marketing_opt_out_at   TIMESTAMPTZ;

-- ── STEP 7: RLS — staff read their own, the server writes ───────────────────
CREATE OR REPLACE FUNCTION pg_temp.colvy_v396_lock(t TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE r RECORD;
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin())', t || '_member_read', t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
END $$;

SELECT pg_temp.colvy_v396_lock('email_sending_domains');
SELECT pg_temp.colvy_v396_lock('email_designs');
SELECT pg_temp.colvy_v396_lock('email_campaign_recipients');
SELECT pg_temp.colvy_v396_lock('email_events');
SELECT pg_temp.colvy_v396_lock('email_suppressions');

NOTIFY pgrst, 'reload schema';

-- ── STEP 8: nothing for the public roles to write ───────────────────────────
-- Should return no rows.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon', 'authenticated')
   AND table_name IN ('email_sending_domains', 'email_designs', 'email_campaign_recipients', 'email_events', 'email_suppressions')
   AND (grantee = 'anon' OR privilege_type <> 'SELECT');

-- ── STEP 9: confirm ─────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('email_sending_domains', 'email_designs', 'email_campaign_recipients', 'email_events', 'email_suppressions')
 ORDER BY tablename, policyname;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The code works without these, so this only loses data (domains added,
-- designs, the send record, events and suppressions). Unsubscribes recorded
-- only in email_marketing_opt_out_at would be lost too: before dropping that
-- column, carry them over so they stay honoured:
--
--   UPDATE contacts SET subscribed_to_marketing = false, unsubscribed_at = COALESCE(unsubscribed_at, email_marketing_opt_out_at),
--          unsubscribe_method = COALESCE(unsubscribe_method, 'email_link')
--    WHERE email_marketing_opt_out_at IS NOT NULL;
--   DROP TABLE IF EXISTS email_suppressions, email_events, email_campaign_recipients, email_designs, email_sending_domains;
--   ALTER TABLE contacts DROP COLUMN IF EXISTS email_marketing_opt_out_at,
--     DROP COLUMN IF EXISTS email_unsubscribe_source, DROP COLUMN IF EXISTS sms_marketing_opt_out_at;
--   NOTIFY pgrst, 'reload schema';
