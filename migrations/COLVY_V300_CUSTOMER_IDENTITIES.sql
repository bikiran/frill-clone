-- ============================================================
-- COLVY V300 — CUSTOMER IDENTITY LINKING + MATCH AUDIT
--
-- Cross-channel customer matching: one customer (contacts row) can carry many
-- identities — an Instagram/Facebook/WhatsApp platform user id, email
-- addresses, phone numbers, a WooCommerce/POS/Stripe customer id. Colvy already
-- groups duplicate contacts loosely via contacts.identity_group_id, but that
-- can't express "this identity is CONFIRMED vs merely suggested", per-identity
-- confidence, the evidence behind a link, or a clean unlink. This adds a proper
-- identity ledger plus an audit trail for confirm / link / unlink / merge.
--
-- customer_identities
--   kind      instagram | facebook | whatsapp | email | phone | woo | pos | stripe
--   value     the NORMALIZED key (IGSID/PSID, lower(email), last-9 phone, id)
--   display   the human label (@handle, raw email/phone) — never used to match
--   status    confirmed | suggested | rejected
--   A value can be CONFIRMED to only ONE contact per company (partial unique
--   index below) so an identity is never actively linked to two customers.
--
-- customer_identity_audit — who confirmed/unlinked/merged, when, on what
--   evidence, and the before/after of any changed values. Never overwrite
--   silently: field changes are recorded here.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  display TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',   -- confirmed | suggested | rejected
  confidence INT,                              -- 0–100 at time of link
  evidence JSONB DEFAULT '[]'::jsonb,          -- [{signal, detail, points}]
  source TEXT,                                 -- e.g. 'WooCommerce order #10482', 'Instagram conversation'
  confirmed_by UUID,                           -- auth.users id
  confirmed_by_name TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_identities_lookup ON customer_identities(company_id, kind, value);
CREATE INDEX IF NOT EXISTS idx_customer_identities_contact ON customer_identities(contact_id);

-- One customer per confirmed identity value: an identity can't be actively
-- linked to two customers at once. Suggested/rejected rows are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_identity_confirmed
  ON customer_identities(company_id, kind, value)
  WHERE status = 'confirmed';

CREATE TABLE IF NOT EXISTS customer_identity_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID,                             -- target/primary contact (nullable if later deleted)
  action TEXT NOT NULL,                        -- match_confirmed | identity_linked | identity_unlinked | match_rejected | customers_merged | field_changed | details_requested
  actor_id UUID,
  actor_name TEXT,
  detail TEXT,
  evidence JSONB DEFAULT '{}'::jsonb,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_identity_audit_contact ON customer_identity_audit(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_identity_audit_company ON customer_identity_audit(company_id, created_at DESC);

-- RLS — customer data, locked to company members (mirrors COLVY_V210). Falls
-- back to a permissive policy if is_company_member() isn't present yet.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_identities', 'customer_identity_audit'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Anyone can manage %s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "company_members_%s" ON %I', t, t);
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_company_member') THEN
      EXECUTE format(
        'CREATE POLICY "company_members_%s" ON %I FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id))',
        t, t);
    ELSE
      EXECUTE format('CREATE POLICY "Anyone can manage %s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
