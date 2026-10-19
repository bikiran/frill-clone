-- ============================================================
-- COLVY V401 — STOCK BY STORE: STORE LOCATIONS → COLVY OUTLETS
--
-- Colvy's AI agents, the phone AI receptionist and the inbox product search
-- can now give stock for each store ("We have 3 at Richmond and none at
-- Fitzroy"), read live from the store (lib/outlet-stock.ts,
-- lib/outlet-stock-server.ts):
--   • Shopify: each Shopify location's available quantity.
--   • WooCommerce: each stock location of the "Stock Locations for
--     WooCommerce" plugin (WooCommerce itself has one stock number per
--     product; without the plugin, stock stays overall).
-- The owner matches each store location to a Colvy outlet on the Shopify or
-- WooCommerce integration page (Stock by store). Saving that mapping is what
-- turns per-store answers on for the store; with nothing saved, every answer
-- is the overall stock, exactly as before.
--
-- Creates:
--   outlet_stock_locations   one row per store location the owner has mapped.
--     company_id              the business
--     provider                'shopify' or 'woocommerce'
--     integration_id          shopify_integrations.id / woocommerce_integrations.id
--                             (no foreign key: two possible tables; the API checks
--                             the store belongs to the business)
--     external_location_id    the Shopify location gid, or the WooCommerce
--                             stock-location term id
--     location_name           its name in the store (shown when it isn't mapped)
--     outlet_id               the Colvy outlet (company_locations.id) it counts as;
--                             NULL = shown under its own name. Deleting the outlet
--                             sets it back to NULL.
--     hidden                  true = not a store customers visit (a warehouse):
--                             left out of per-store answers
--     updated_by, created_at, updated_at
--   Unique per (company_id, provider, integration_id, external_location_id).
--
-- Access (V375 / V398 / V399 style):
--   • SELECT — staff of the company (is_company_member, which leaves out board
--     visitors and removed members) and the platform admin.
--   • INSERT / UPDATE / DELETE — the server only (service role). Owners and
--     admins save the mapping through /api/outlet-stock, which checks
--     requireCompanyAdmin, that the store and every outlet belong to the
--     business. No write policy and no write privilege for anon or
--     authenticated.
--   If is_company_member() is missing, or is still V209's first version, the
--   table is created SERVER ONLY (no read policy) and a notice says so; the
--   app reads it with the service role either way. Run V337 and then this
--   file again to add the read policy.
--
-- ── WHEN TO RUN ─────────────────────────────────────────────────────────────
-- Any time, before or after the code from branch claude/outlet-stock is
-- deployed. Until it runs, stock is answered for each product overall (the
-- code reads the missing table as "nothing mapped"), the Stock by store panel
-- says it needs this update, and saving is refused.
--
-- ── VERIFY AFTERWARDS ───────────────────────────────────────────────────────
--   1. The last query lists one policy (outlet_stock_locations_member_read).
--   2. Integrations → Shopify → your store → Stock by store → Set up: each
--      Shopify location is listed with a suggested outlet. Turn it on. Ask
--      Colvy AI "have we got <product> at <suburb>?": the answer lists stock
--      for each store.
--   3. Signed in as staff (anon key + their token):
--        select * from outlet_stock_locations;                    → their business's rows only
--        insert into outlet_stock_locations (company_id, ...) ...; → permission denied
--
-- Run in the Supabase SQL editor. Safe to re-run. Rollback at the bottom.
-- ============================================================

-- ── STEP 0: what this builds on ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies does not exist';
  END IF;
END $$;

-- The platform admin check (same body as V351 / V364 / V375 / V395 / V398 / V399).
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

-- ── STEP 1: the mapping table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outlet_stock_locations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL,
  integration_id        UUID NOT NULL,
  external_location_id  TEXT NOT NULL,
  location_name         TEXT,
  outlet_id             UUID,
  hidden                BOOLEAN NOT NULL DEFAULT false,
  updated_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Columns any hand-made table lacks.
ALTER TABLE public.outlet_stock_locations
  ADD COLUMN IF NOT EXISTS location_name  TEXT,
  ADD COLUMN IF NOT EXISTS outlet_id      UUID,
  ADD COLUMN IF NOT EXISTS hidden         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by     UUID,
  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS outlet_stock_locations_uniq
  ON public.outlet_stock_locations (company_id, provider, integration_id, external_location_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outlet_stock_locations_provider') THEN
    ALTER TABLE public.outlet_stock_locations ADD CONSTRAINT outlet_stock_locations_provider
      CHECK (provider IN ('shopify', 'woocommerce'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outlet_stock_locations_ext_id') THEN
    ALTER TABLE public.outlet_stock_locations ADD CONSTRAINT outlet_stock_locations_ext_id
      CHECK (length(external_location_id) BETWEEN 1 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outlet_stock_locations_name_len') THEN
    ALTER TABLE public.outlet_stock_locations ADD CONSTRAINT outlet_stock_locations_name_len
      CHECK (location_name IS NULL OR length(location_name) <= 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outlet_stock_locations_hidden_unmapped') THEN
    ALTER TABLE public.outlet_stock_locations ADD CONSTRAINT outlet_stock_locations_hidden_unmapped
      CHECK (NOT hidden OR outlet_id IS NULL);
  END IF;
  -- The outlet, when company_locations is there (V113): deleting an outlet unmaps it.
  IF to_regclass('public.company_locations') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outlet_stock_locations_outlet_fk') THEN
    UPDATE public.outlet_stock_locations s SET outlet_id = NULL
      WHERE outlet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.company_locations l WHERE l.id = s.outlet_id);
    ALTER TABLE public.outlet_stock_locations ADD CONSTRAINT outlet_stock_locations_outlet_fk
      FOREIGN KEY (outlet_id) REFERENCES public.company_locations(id) ON DELETE SET NULL;
  ELSIF to_regclass('public.company_locations') IS NULL THEN
    RAISE NOTICE 'public.company_locations does not exist: outlet_id has no foreign key yet. Run this file again once it does.';
  END IF;
END $$;

-- ── STEP 2: access ──────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  member_ok BOOLEAN := to_regprocedure('public.is_company_member(uuid)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.is_company_member(uuid)')) ILIKE '%''viewer''%';
BEGIN
  ALTER TABLE public.outlet_stock_locations ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outlet_stock_locations' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.outlet_stock_locations', r.policyname);
  END LOOP;
  REVOKE ALL ON public.outlet_stock_locations FROM anon, authenticated;
  GRANT ALL ON public.outlet_stock_locations TO service_role;
  IF member_ok THEN
    CREATE POLICY outlet_stock_locations_member_read ON public.outlet_stock_locations
      FOR SELECT TO authenticated USING (is_company_member(company_id) OR is_platform_admin());
    GRANT SELECT ON public.outlet_stock_locations TO authenticated;
  ELSE
    RAISE NOTICE 'is_company_member() is missing or still counts board visitors: outlet_stock_locations is server only. Run COLVY_V337_MEMBERSHIP_EXCLUDES_VIEWERS.sql, then this file again.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── STEP 3: check ───────────────────────────────────────────────────────────
SELECT policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'outlet_stock_locations';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Stock goes back to being answered for each product overall (the code keeps
-- working without the table). The saved mappings are lost:
--
--   DROP TABLE IF EXISTS public.outlet_stock_locations;
--   NOTIFY pgrst, 'reload schema';
