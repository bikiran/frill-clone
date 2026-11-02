-- ============================================================
-- COLVY V423 — REFUND PIN, AND THE STORE KEYS OUT OF MEMBERS' REACH
--
-- A workspace can require a PIN for every refund (WooCommerce / Shopify order
-- refunds, DOA claim refunds and store credit, payment-link refunds). The
-- owner sets it under Business settings → Payments → Refund security.
--
-- The PIN is kept here as a salted scrypt hash, in a table nobody but the
-- server can read or write: no policies, no privileges for anon or
-- authenticated (the companies row would have been readable by every member,
-- and a short PIN's hash can be guessed offline, so it can't live there).
-- Wrong tries are counted per workspace; five in a row lock refunds for 15
-- minutes (lib/refund-guard.ts).
--
-- Until this runs, refunds still need the "Issue refunds" permission (owners
-- and admins always have it), and the PIN card says the database update is
-- needed.
--
-- STORE KEYS. V300 gave woocommerce_integrations and shopify_integrations a
-- FOR ALL policy for any member of the business. So any agent could read the
-- store's API keys (consumer_key / consumer_secret, the Shopify access token)
-- straight from the browser and refund through WooCommerce or Shopify
-- directly, around Colvy's permission and PIN; or change store_url so
-- Colvy's next call sent the keys to their own server. Only the server (the
-- service role) ever writes these tables, and the browser only reads id and
-- is_active. After this, members can read every column except the secret ones,
-- and can't insert, update or delete.
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.refund_pins (
  company_id   uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  pin_hash     text NOT NULL,
  set_by       uuid,
  set_at       timestamptz NOT NULL DEFAULT now(),
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);

ALTER TABLE public.refund_pins ENABLE ROW LEVEL SECURITY;

-- Drop any policy someone may have added by hand: only the server touches it.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'refund_pins' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.refund_pins', r.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.refund_pins FROM anon, authenticated;
GRANT ALL ON public.refund_pins TO service_role;

-- ── Store keys: read-only for members, secret columns server-only ─────────
DO $$
DECLARE t TEXT; cols TEXT; r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['woocommerce_integrations', 'shopify_integrations'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      RAISE NOTICE '% does not exist — skipped', t; CONTINUE;
    END IF;
    -- Read-only policy in place of V300's FOR ALL.
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_company_member(company_id))', 'company_members_read_' || t, t);
    -- No writes from the API roles at all.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    -- Every column except keys, secrets, tokens and passwords.
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t
       AND column_name !~* '(secret|token|password|consumer_key|api_key|access_key|private|signing)';
    IF cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, t);
    END IF;
    RAISE NOTICE '%: members may read %', t, cols;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- No policies, and the API roles can't read it:
--   SELECT policyname FROM pg_policies WHERE tablename = 'refund_pins';            -- 0 rows
--   SELECT has_table_privilege('authenticated', 'public.refund_pins', 'SELECT');   -- false
--
-- While you're here, confirm V364 is live (members can't edit their own role
-- or permissions):
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'team_members';
--     → team_members_read (SELECT) and team_members_self_profile (UPDATE) only
--   SELECT has_column_privilege('authenticated', 'public.team_members', 'role', 'UPDATE');         -- false
--   SELECT has_column_privilege('authenticated', 'public.team_members', 'permissions', 'UPDATE');  -- false
--
-- The store keys are out of members' reach:
--   SELECT has_column_privilege('authenticated', 'public.woocommerce_integrations', 'consumer_secret', 'SELECT'); -- false
--   SELECT has_column_privilege('authenticated', 'public.woocommerce_integrations', 'is_active', 'SELECT');       -- true
--   SELECT has_table_privilege('authenticated', 'public.woocommerce_integrations', 'UPDATE');                      -- false
--   SELECT has_column_privilege('authenticated', 'public.shopify_integrations', 'access_token', 'SELECT');        -- false

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.refund_pins;
-- (The store-key lock is safe to keep; to undo it, re-run V300's block for
-- those two tables and GRANT SELECT, INSERT, UPDATE, DELETE ON them TO authenticated.)
