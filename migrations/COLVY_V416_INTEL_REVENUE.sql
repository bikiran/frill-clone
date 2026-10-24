-- COLVY V416 — Super Admin → Intelligence: revenue, costs, system health
--
-- Phase 3 of the Intelligence Centre. All server-only (row-level security on,
-- no policies; Colvy's server uses the service role). Money is AUD cents;
-- anything charged in another currency is converted at the rate in
-- sms_pricing (the one Colvy already uses for carrier costs) and the original
-- amount and currency are kept beside it.
--
--   billing_subscriptions  every Colvy subscription, copied from Stripe (and
--                          Shopify App Pricing) by the hourly intel job: plan,
--                          add-on or phone number, status, monthly value, when
--                          it started, trial end, cancellation. Stripe stays
--                          the source of truth; this is a mirror for reports.
--   billing_events         what changed and when, from Stripe's webhooks:
--                          subscriptions started, plans changed, payments
--                          failing / recovered, cancellations scheduled,
--                          cancelled. One row per Stripe event (never twice).
--   company_mrr_daily      each paying business's monthly recurring revenue,
--                          once a day, so MRR movements (new, expansion,
--                          contraction, churn, reactivation) are exact.
--   revenue_daily          the day's totals and movements. Days before the
--                          first snapshot are rebuilt once from Stripe's
--                          subscription history (source = 'reconstructed':
--                          a subscription's current price is used for its
--                          whole life, so a plan change before then is shown
--                          at the new price).
--   tenant_cost_monthly    what each business cost Colvy to run this month,
--                          from usage Colvy records: AI tokens at the model's
--                          price (super admin → AI, else the list price), SMS parts at the carrier cost in
--                          sms_pricing; calls and numbers when a rate is set
--                          (INTEL_VOICE_COST_PER_MIN, INTEL_NUMBER_COST_MONTHLY,
--                          AUD), otherwise minutes and counts only.
--   intel_alerts           System health alerts: raised by the hourly job when
--                          a rule trips, resolved when it stops. One row per
--                          problem (fingerprint), with when it was first and
--                          last seen and whether the team was told.
--
--   intel_tenant_usage(from, to)  per-business AI tokens (by model), calls and
--     call seconds, and live phone numbers, for tenant_cost_monthly. Counts
--     only.
--
-- Billing rows are kept when a business is deleted (company_id is cleared):
-- they're financial records. Safe to run more than once.

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                    TEXT PRIMARY KEY,           -- Stripe subscription id, or shopify:<integration id>
  provider              TEXT NOT NULL,              -- stripe | shopify
  company_id            UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id               UUID,
  customer_id           TEXT,
  kind                  TEXT NOT NULL,              -- plan | addon | number | other
  plan                  TEXT,
  status                TEXT NOT NULL,              -- active | trialing | past_due | unpaid | canceled | incomplete…
  mrr_cents             BIGINT NOT NULL DEFAULT 0,  -- monthly value in AUD cents, after discounts
  amount_cents          BIGINT NOT NULL DEFAULT 0,  -- per billing period, original currency
  currency              TEXT NOT NULL DEFAULT 'aud',
  billing_interval      TEXT,
  interval_count        INT NOT NULL DEFAULT 1,
  started_at            TIMESTAMPTZ,
  trial_end             TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT false,
  canceled_at           TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_subscriptions_company_idx ON billing_subscriptions (company_id);
CREATE INDEX IF NOT EXISTS billing_subscriptions_status_idx ON billing_subscriptions (status);

CREATE TABLE IF NOT EXISTS billing_events (
  id               BIGSERIAL PRIMARY KEY,
  event_id         TEXT NOT NULL UNIQUE,            -- Stripe event id
  source           TEXT NOT NULL DEFAULT 'stripe',
  occurred_at      TIMESTAMPTZ NOT NULL,
  company_id       UUID REFERENCES companies(id) ON DELETE SET NULL,
  subscription_id  TEXT,
  kind             TEXT NOT NULL,                   -- started | plan_changed | payment_failed | payment_failing | payment_recovered | trial_converted | cancel_scheduled | cancel_withdrawn | canceled
  product          TEXT,                            -- plan | addon | number | other
  plan             TEXT,
  status           TEXT,
  mrr_before_cents BIGINT,
  mrr_after_cents  BIGINT,
  amount_cents     BIGINT,
  currency         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_events_time_idx ON billing_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS billing_events_company_idx ON billing_events (company_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS company_mrr_daily (
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  day           DATE NOT NULL,
  mrr_cents     BIGINT NOT NULL DEFAULT 0,
  plan_cents    BIGINT NOT NULL DEFAULT 0,
  addon_cents   BIGINT NOT NULL DEFAULT 0,
  number_cents  BIGINT NOT NULL DEFAULT 0,
  plan          TEXT,
  status        TEXT,
  PRIMARY KEY (company_id, day)
);
CREATE INDEX IF NOT EXISTS company_mrr_daily_day_idx ON company_mrr_daily (day);

CREATE TABLE IF NOT EXISTS revenue_daily (
  day                  DATE PRIMARY KEY,
  source               TEXT NOT NULL DEFAULT 'snapshot',  -- snapshot | reconstructed
  mrr_cents            BIGINT NOT NULL DEFAULT 0,
  plan_cents           BIGINT NOT NULL DEFAULT 0,
  addon_cents          BIGINT NOT NULL DEFAULT 0,
  number_cents         BIGINT NOT NULL DEFAULT 0,
  shopify_cents        BIGINT NOT NULL DEFAULT 0,
  paying               INT NOT NULL DEFAULT 0,
  trialing             INT NOT NULL DEFAULT 0,
  past_due             INT NOT NULL DEFAULT 0,
  past_due_cents       BIGINT NOT NULL DEFAULT 0,
  cancelling           INT NOT NULL DEFAULT 0,
  cancelling_cents     BIGINT NOT NULL DEFAULT 0,
  new_cents            BIGINT NOT NULL DEFAULT 0,
  new_count            INT NOT NULL DEFAULT 0,
  expansion_cents      BIGINT NOT NULL DEFAULT 0,
  contraction_cents    BIGINT NOT NULL DEFAULT 0,
  churned_cents        BIGINT NOT NULL DEFAULT 0,
  churned_count        INT NOT NULL DEFAULT 0,
  reactivation_cents   BIGINT NOT NULL DEFAULT 0,
  reactivation_count   INT NOT NULL DEFAULT 0,
  collected_cents      BIGINT NOT NULL DEFAULT 0,          -- paid to Colvy that day (tax invoices)
  refunded_cents       BIGINT NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_cost_monthly (
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  month              DATE NOT NULL,                  -- first day of the month (UTC)
  ai_tokens          BIGINT NOT NULL DEFAULT 0,
  ai_cost_cents      BIGINT NOT NULL DEFAULT 0,
  ai_unpriced_tokens BIGINT NOT NULL DEFAULT 0,       -- tokens on models with no price (set one in super admin → AI)
  sms_parts          BIGINT NOT NULL DEFAULT 0,
  sms_cost_cents     BIGINT NOT NULL DEFAULT 0,
  calls              BIGINT NOT NULL DEFAULT 0,
  call_minutes       BIGINT NOT NULL DEFAULT 0,
  call_cost_cents    BIGINT,                         -- NULL: no voice rate set
  numbers            INT NOT NULL DEFAULT 0,
  number_cost_cents  BIGINT,                         -- NULL: no number rate set
  total_cost_cents   BIGINT NOT NULL DEFAULT 0,      -- what's known
  collected_cents    BIGINT NOT NULL DEFAULT 0,      -- paid to Colvy in the month (tax invoices)
  mrr_cents          BIGINT NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, month)
);

CREATE TABLE IF NOT EXISTS intel_alerts (
  fingerprint    TEXT PRIMARY KEY,                   -- e.g. job_stale:email-sync
  severity       TEXT NOT NULL,                      -- critical | warning | info
  category       TEXT NOT NULL,                      -- jobs | webhooks | api | status | agents | billing | signups
  title          TEXT NOT NULL,
  detail         TEXT,
  link           TEXT,                               -- the Super Admin page to look at
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  notified_at    TIMESTAMPTZ,
  occurrences    INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS intel_alerts_open_idx ON intel_alerts (resolved_at, severity);

ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_mrr_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_daily         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_cost_monthly   ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel_alerts          ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_subscriptions, billing_events, company_mrr_daily, revenue_daily, tenant_cost_monthly, intel_alerts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE billing_events_id_seq FROM anon, authenticated;

-- ── Usage for tenant costs ───────────────────────────────────────────────────
-- kind 'ai': key = model, a = tokens in, b = tokens out
-- kind 'calls': a = calls, b = seconds (each call rounded up to the minute)
-- kind 'numbers': a = live numbers Colvy provides (released / pending left out)
CREATE OR REPLACE FUNCTION intel_tenant_usage(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (company_id UUID, kind TEXT, key TEXT, a BIGINT, b BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.company_id, 'ai', coalesce(u.model, 'unknown'), sum(coalesce(u.tokens_in, 0))::bigint, sum(coalesce(u.tokens_out, 0))::bigint
    FROM ai_usage_log u
   WHERE u.created_at >= p_from AND u.created_at < p_to AND u.company_id IS NOT NULL
   GROUP BY u.company_id, u.model
  UNION ALL
  SELECT k.company_id, 'calls', '', count(*)::bigint, sum(ceil(greatest(coalesce(k.duration_seconds, 0), 0) / 60.0) * 60)::bigint
    FROM calls k
   WHERE k.created_at >= p_from AND k.created_at < p_to AND k.company_id IS NOT NULL
   GROUP BY k.company_id
  UNION ALL
  SELECT p.company_id, 'numbers', '', count(*)::bigint, 0::bigint
    FROM phone_numbers p
   WHERE p.company_id IS NOT NULL AND coalesce(p.status, 'active') NOT IN ('released', 'pending')
   GROUP BY p.company_id
$$;

REVOKE ALL ON FUNCTION intel_tenant_usage(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
