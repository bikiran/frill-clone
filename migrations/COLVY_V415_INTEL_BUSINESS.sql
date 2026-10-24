-- COLVY V415 — Super Admin → Intelligence: business analytics
--
-- Phase 2 of the Intelligence Centre. Three tables, all server-only (row-level
-- security on, no policies: browsers can't read or write them; Colvy's server
-- uses the service role), and two functions the hourly intel job calls:
--
--   company_acquisition   where each business first found Colvy: channel,
--                         campaign tags, the referring site, the page they
--                         landed on. Copied from the sign-up record when the
--                         workspace is made. Kept off `companies` on purpose:
--                         that table is publicly readable (V352/V412).
--   company_milestones    the first time each business did something that
--                         matters (connected a channel, got a customer message,
--                         replied, turned on an AI agent, took a payment…),
--                         one row per business per milestone, never rewritten.
--   company_health_daily  one health score per business per day, with the
--                         reasons, so a change ("healthy → at risk this week")
--                         can be seen. Kept 400 days.
--
--   intel_refresh_milestones()  fills in milestones from the tables that
--     already record them (it only looks at businesses that haven't reached a
--     milestone yet, using the (company_id, created_at) indexes), and returns
--     what it added. Running it again adds nothing new.
--   intel_company_activity(now)  per-business activity counts for the health
--     score (messages, replies, orders, bookings, payments, failed agent runs,
--     last sign-in). Counts only: no message text, names or contact details.
--
-- Also: signup_attempts.first_touch_at / click_id_type — when the visit that
-- first found Colvy happened, and the ad network it came from (the sign-up
-- form sends them; the code saves without them before this runs).
--
-- Deleting a business deletes its rows here (ON DELETE CASCADE).
-- Safe to run more than once.

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_acquisition (
  company_id     UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  channel        TEXT,          -- Paid | Email | Social | AI assistants | Organic search | Referral | Campaign | Direct
  source         TEXT,          -- utm_source
  medium         TEXT,          -- utm_medium
  campaign       TEXT,          -- utm_campaign
  term           TEXT,
  content        TEXT,
  referrer_host  TEXT,          -- the referring site's host only
  landing_path   TEXT,          -- the first page, ids masked
  click_id_type  TEXT,          -- google | meta | microsoft (an ad click id was present)
  first_seen_at  TIMESTAMPTZ,   -- the first visit, when known
  country        TEXT,          -- from the sign-up's IP address (2-letter code)
  device         TEXT,
  captured_from  TEXT NOT NULL, -- signup_first_visit | signup_page | posthog
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS company_acquisition_channel_idx ON company_acquisition (channel);

CREATE TABLE IF NOT EXISTS company_milestones (
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  milestone   TEXT NOT NULL,
  reached_at  TIMESTAMPTZ NOT NULL,
  source      TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, milestone)
);
CREATE INDEX IF NOT EXISTS company_milestones_milestone_idx ON company_milestones (milestone, reached_at);

CREATE TABLE IF NOT EXISTS company_health_daily (
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  score       SMALLINT NOT NULL,
  band        TEXT NOT NULL,    -- healthy | attention | at_risk | new
  reasons     JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, day)
);
CREATE INDEX IF NOT EXISTS company_health_daily_day_idx ON company_health_daily (day, band);

ALTER TABLE company_acquisition  ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_milestones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_health_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON company_acquisition, company_milestones, company_health_daily FROM anon, authenticated;

ALTER TABLE signup_attempts ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ;
ALTER TABLE signup_attempts ADD COLUMN IF NOT EXISTS click_id_type TEXT;

-- ── Milestones ───────────────────────────────────────────────────────────────
-- Each definition is a subquery giving the first time for one business `c`.
-- A table or column that isn't there skips that milestone (reported in
-- `errors`), it never stops the rest.

CREATE OR REPLACE FUNCTION intel_refresh_milestones()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
  r JSONB;
  added JSONB := '[]'::jsonb;
  errs JSONB := '[]'::jsonb;
BEGIN
  FOR d IN SELECT * FROM (VALUES
    ('workspace_created', 'companies',
      $q$SELECT c.created_at::timestamptz AS at$q$),
    ('email_connected', 'email_channels',
      $q$SELECT min(e.created_at) AS at FROM email_channels e WHERE e.company_id = c.id AND coalesce(e.provider, '') <> 'webform'$q$),
    ('social_connected', 'meta_channels',
      $q$SELECT min(m.created_at) AS at FROM meta_channels m WHERE m.company_id = c.id$q$),
    ('phone_connected', 'phone_numbers',
      $q$SELECT least(
          (SELECT min(p.created_at) FROM phone_numbers p WHERE p.company_id = c.id AND coalesce(p.status, 'active') NOT IN ('released', 'pending')),
          (SELECT min(coalesce(t.provisioned_at, t.created_at)) FROM twilio_integrations t WHERE t.company_id = c.id AND coalesce(t.phone_number, '') <> ''),
          (SELECT min(t.created_at) FROM telnyx_integrations t WHERE t.company_id = c.id AND coalesce(t.phone_number, '') <> '')) AS at$q$),
    ('whatsapp_connected', 'whatsapp_senders',
      $q$SELECT w.approved_at AS at FROM whatsapp_senders w WHERE w.company_id = c.id AND w.approved_at IS NOT NULL$q$),
    ('widget_live', 'conversations',
      $q$SELECT v.created_at AS at FROM conversations v WHERE v.company_id = c.id AND v.channel = 'widget' ORDER BY v.created_at LIMIT 1$q$),
    ('store_connected', 'shopify/woocommerce/prexty',
      $q$SELECT least(
          (SELECT min(s.created_at) FROM shopify_integrations s WHERE s.company_id = c.id),
          (SELECT min(w.created_at) FROM woocommerce_integrations w WHERE w.company_id = c.id),
          (SELECT min(p.created_at) FROM prexty_integrations p WHERE p.company_id = c.id)) AS at$q$),
    ('google_connected', 'google_business_accounts',
      $q$SELECT min(g.created_at) AS at FROM google_business_accounts g WHERE g.company_id = c.id$q$),
    ('teammate_joined', 'team_members',
      $q$SELECT min(coalesce(m.joined_at, m.created_at)) AS at FROM team_members m
          WHERE m.company_id = c.id AND m.user_id IS NOT NULL AND m.user_id IS DISTINCT FROM c.owner_id
            AND coalesce(m.status, 'active') NOT IN ('removed', 'invited')
            AND (coalesce(m.role, '') <> 'viewer' OR m.invited_by IS NOT NULL)$q$),
    ('first_contact', 'contacts',
      $q$SELECT min(k.created_at) AS at FROM contacts k WHERE k.company_id = c.id$q$),
    ('first_customer_message', 'messages',
      $q$SELECT m.created_at AS at FROM messages m WHERE m.company_id = c.id AND m.sender_type = 'visitor' ORDER BY m.created_at LIMIT 1$q$),
    ('first_team_reply', 'messages',
      $q$SELECT m.created_at AS at FROM messages m WHERE m.company_id = c.id AND m.sender_type = 'agent' AND coalesce(m.is_internal, false) = false ORDER BY m.created_at LIMIT 1$q$),
    ('first_ai_reply', 'messages',
      $q$SELECT m.created_at AS at FROM messages m WHERE m.company_id = c.id AND m.sender_type = 'ai' ORDER BY m.created_at LIMIT 1$q$),
    ('agent_enabled', 'agent_roles',
      $q$SELECT min(a.created_at) AS at FROM agent_roles a WHERE a.company_id = c.id AND a.enabled = true$q$),
    ('agent_live', 'agent_runs',
      $q$SELECT a.created_at AS at FROM agent_runs a WHERE a.company_id = c.id AND a.mode = 'live' ORDER BY a.created_at LIMIT 1$q$),
    ('first_order', 'orders',
      $q$SELECT min(o.created_at) AS at FROM orders o WHERE o.company_id = c.id$q$),
    ('first_booking', 'bookings',
      $q$SELECT min(b.created_at) AS at FROM bookings b WHERE b.company_id = c.id$q$),
    ('first_payment', 'chat_payments',
      $q$SELECT min(p.paid_at) AS at FROM chat_payments p WHERE p.company_id = c.id AND p.status = 'paid'$q$),
    ('first_review_request', 'review_requests',
      $q$SELECT min(r.sent_at) AS at FROM review_requests r WHERE r.company_id = c.id AND r.sent_at IS NOT NULL$q$),
    ('first_campaign', 'campaigns',
      $q$SELECT min(coalesce(k.sent_at, k.completed_at)) AS at FROM campaigns k WHERE k.company_id = c.id AND k.status = 'sent'$q$),
    ('first_ticket', 'support_tickets',
      $q$SELECT min(t.created_at) AS at FROM support_tickets t WHERE t.company_id = c.id$q$),
    ('first_call', 'calls',
      $q$SELECT k.created_at AS at FROM calls k WHERE k.company_id = c.id ORDER BY k.created_at LIMIT 1$q$),
    ('subscribed', 'subscriptions',
      $q$SELECT min(s.created_at) AS at FROM subscriptions s
          WHERE s.user_id = c.owner_id AND coalesce(s.amount_cents, 0) > 0
            AND s.status IN ('active', 'past_due', 'unpaid', 'canceled')$q$)
  ) AS t(milestone, source, q) LOOP
    BEGIN
      EXECUTE format($f$
        WITH ins AS (
          INSERT INTO company_milestones (company_id, milestone, reached_at, source)
          SELECT c.id, %1$L, f.at, %2$L
            FROM companies c
            CROSS JOIN LATERAL (%3$s) f
           WHERE f.at IS NOT NULL
             AND coalesce(c.is_demo, false) = false
             AND NOT EXISTS (SELECT 1 FROM company_milestones x WHERE x.company_id = c.id AND x.milestone = %1$L)
          ON CONFLICT (company_id, milestone) DO NOTHING
          RETURNING company_id, milestone, reached_at)
        SELECT coalesce(jsonb_agg(jsonb_build_object('company_id', company_id, 'milestone', milestone, 'reached_at', reached_at)), '[]'::jsonb) FROM ins
      $f$, d.milestone, d.source, d.q) INTO r;
      added := added || r;
    EXCEPTION WHEN OTHERS THEN
      errs := errs || jsonb_build_object('milestone', d.milestone, 'error', SQLERRM);
    END;
  END LOOP;

  -- Derived: the first channel customers can reach them on, and "activated"
  -- (a channel connected, a customer message in, and a reply out).
  WITH ins AS (
    INSERT INTO company_milestones (company_id, milestone, reached_at, source)
    SELECT company_id, 'channel_connected', min(reached_at), 'derived'
      FROM company_milestones
     WHERE milestone IN ('email_connected', 'social_connected', 'phone_connected', 'whatsapp_connected', 'widget_live')
     GROUP BY company_id
    ON CONFLICT (company_id, milestone) DO NOTHING
    RETURNING company_id, milestone, reached_at)
  SELECT coalesce(jsonb_agg(jsonb_build_object('company_id', company_id, 'milestone', milestone, 'reached_at', reached_at)), '[]'::jsonb) INTO r FROM ins;
  added := added || r;

  WITH ins AS (
    INSERT INTO company_milestones (company_id, milestone, reached_at, source)
    SELECT ch.company_id, 'activated', greatest(ch.reached_at, msg.reached_at, rep.at), 'derived'
      FROM company_milestones ch
      JOIN company_milestones msg ON msg.company_id = ch.company_id AND msg.milestone = 'first_customer_message'
      JOIN LATERAL (SELECT min(x.reached_at) AS at FROM company_milestones x
                     WHERE x.company_id = ch.company_id AND x.milestone IN ('first_team_reply', 'first_ai_reply')) rep ON rep.at IS NOT NULL
     WHERE ch.milestone = 'channel_connected'
    ON CONFLICT (company_id, milestone) DO NOTHING
    RETURNING company_id, milestone, reached_at)
  SELECT coalesce(jsonb_agg(jsonb_build_object('company_id', company_id, 'milestone', milestone, 'reached_at', reached_at)), '[]'::jsonb) INTO r FROM ins;
  added := added || r;

  RETURN jsonb_build_object('added', added, 'errors', errs);
END $$;

REVOKE ALL ON FUNCTION intel_refresh_milestones() FROM PUBLIC, anon, authenticated;

-- ── Activity for the health score ────────────────────────────────────────────
-- One row per live business (not a demo, not closed). Recent = last 14 days,
-- previous = the 14 before; orders, bookings and payments over 30 days.

CREATE OR REPLACE FUNCTION intel_company_activity(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (
  company_id        UUID,
  inbound_recent    BIGINT,
  inbound_previous  BIGINT,
  replies_recent    BIGINT,
  ai_replies_recent BIGINT,
  last_inbound_at   TIMESTAMPTZ,
  last_reply_at     TIMESTAMPTZ,
  orders_30d        BIGINT,
  bookings_30d      BIGINT,
  payments_30d      BIGINT,
  agent_failed_7d   BIGINT,
  staff             BIGINT,
  last_sign_in_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    (SELECT count(*) FROM messages m WHERE m.company_id = c.id AND m.created_at >= p_now - interval '14 days' AND m.sender_type = 'visitor'),
    (SELECT count(*) FROM messages m WHERE m.company_id = c.id AND m.created_at >= p_now - interval '28 days' AND m.created_at < p_now - interval '14 days' AND m.sender_type = 'visitor'),
    (SELECT count(*) FROM messages m WHERE m.company_id = c.id AND m.created_at >= p_now - interval '14 days' AND m.sender_type = 'agent' AND coalesce(m.is_internal, false) = false),
    (SELECT count(*) FROM messages m WHERE m.company_id = c.id AND m.created_at >= p_now - interval '14 days' AND m.sender_type = 'ai'),
    (SELECT m.created_at FROM messages m WHERE m.company_id = c.id AND m.sender_type = 'visitor' ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.created_at FROM messages m WHERE m.company_id = c.id AND m.sender_type IN ('agent', 'ai') AND coalesce(m.is_internal, false) = false ORDER BY m.created_at DESC LIMIT 1),
    (SELECT count(*) FROM orders o WHERE o.company_id = c.id AND o.order_date >= p_now - interval '30 days'),
    (SELECT count(*) FROM bookings b WHERE b.company_id = c.id AND b.created_at >= p_now - interval '30 days'),
    (SELECT count(*) FROM chat_payments p WHERE p.company_id = c.id AND p.created_at >= p_now - interval '30 days' AND p.status = 'paid'),
    (SELECT count(*) FROM agent_runs a WHERE a.company_id = c.id AND a.created_at >= p_now - interval '7 days' AND a.status = 'failed'),
    (SELECT count(*) FROM team_members t WHERE t.company_id = c.id AND coalesce(t.status, 'active') <> 'removed'
        AND (coalesce(t.role, '') <> 'viewer' OR t.invited_by IS NOT NULL)),
    (SELECT max(u.last_sign_in_at) FROM team_members t JOIN auth.users u ON u.id = t.user_id
      WHERE t.company_id = c.id AND coalesce(t.status, 'active') <> 'removed'
        AND (coalesce(t.role, '') <> 'viewer' OR t.invited_by IS NOT NULL))
  FROM companies c
  WHERE coalesce(c.is_demo, false) = false AND c.closed_at IS NULL
$$;

REVOKE ALL ON FUNCTION intel_company_activity(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
