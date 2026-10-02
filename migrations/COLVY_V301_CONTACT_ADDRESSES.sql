-- ============================================================
-- COLVY V301 — MULTI-ADDRESS PER CUSTOMER (with provenance)
--
-- A customer can have several delivery addresses over time. Colvy stored only a
-- flat set of address columns on contacts, so a new order with a different
-- address silently overwrote the old one. This adds a proper address book:
-- each address keeps its SOURCE (which order/who added it) and when it was last
-- used, one is marked default, and previous addresses are preserved.
--
-- Populated lazily from WooCommerce order billing/shipping (see
-- lib/contact-addresses + /api/contacts/addresses) and by manual entry. Never
-- overwrites — a different address is saved as an ADDITIONAL row.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label TEXT,                       -- optional (Home, Work, …)
  line1 TEXT,
  line2 TEXT,
  suburb TEXT,
  city TEXT,
  state TEXT,
  postcode TEXT,
  country TEXT,
  formatted TEXT,                   -- convenience single-line rendering
  dedupe_key TEXT,                  -- lower(line1)|postcode, to avoid duplicates
  source TEXT,                      -- 'WooCommerce order #10482', 'Manually added by …'
  source_ref TEXT,                  -- external id (e.g. the order id)
  is_default BOOLEAN DEFAULT FALSE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact ON contact_addresses(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_addresses_company ON contact_addresses(company_id);
-- One row per distinct address per contact.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_address_dedupe
  ON contact_addresses(contact_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- RLS — customer data, locked to company members (mirrors COLVY_V210), with a
-- permissive fallback if is_company_member() isn't present.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE contact_addresses ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can manage contact_addresses" ON contact_addresses';
  EXECUTE 'DROP POLICY IF EXISTS "company_members_contact_addresses" ON contact_addresses';
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_company_member') THEN
    EXECUTE 'CREATE POLICY "company_members_contact_addresses" ON contact_addresses FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id))';
  ELSE
    EXECUTE 'CREATE POLICY "Anyone can manage contact_addresses" ON contact_addresses FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
