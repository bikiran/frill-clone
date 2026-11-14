-- ============================================================
-- COLVY V437 — PREXTY RECEIPTS, AND IN-STORE SALES ON THE ORDERS BOARD
--
-- Prexty copies each in-store sale into WooCommerce, tagged as in store
-- (_prexty_source = pos) with its receipt number. Sometimes a copy arrives
-- without the tag, or the same sale arrives several times. Colvy then showed
-- each copy as a separate online order with no shop.
--
-- Creates:
--   prexty_receipts        each sale Prexty's webhook sends Colvy (receipt
--                          number, total, items, shop), so an untagged
--                          WooCommerce copy can be matched back to its sale
--                          (lib/pos-copies.ts)
--   orders.pos_source      'prexty' for an in-store sale, so the Orders board
--   orders.pos_sale_id     (web and app) can show "In store · R50806"
--   orders.pos_copy_of     the order number this one is a copy of, when the
--                          same sale reached WooCommerce more than once
--
-- Safe to run more than once. Until it runs, the code skips these columns
-- and the receipt matching (nothing breaks).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prexty_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prexty_order_id TEXT NOT NULL,               -- Prexty's own id for the sale
  sale_no         TEXT,                        -- the receipt number people see (R50806)
  status          TEXT,
  total           NUMERIC(12,2),
  currency        TEXT,
  units           INTEGER,                     -- items on the receipt, counting quantities
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  outlet_id       TEXT,
  outlet_name     TEXT,
  location_id     UUID,                        -- the Colvy shop it maps to (lib/prexty-outlets)
  walk_in         BOOLEAN NOT NULL DEFAULT false,  -- no email or phone on the sale
  sold_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, prexty_order_id)
);
CREATE INDEX IF NOT EXISTS prexty_receipts_company_time_idx ON public.prexty_receipts (company_id, sold_at DESC);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pos_source TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pos_sale_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pos_copy_of TEXT;

-- ── Access: server only ──────────────────────────────────────────────────────
DO $$ DECLARE r RECORD;
BEGIN
  ALTER TABLE public.prexty_receipts ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prexty_receipts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.prexty_receipts', r.policyname);
  END LOOP;
  REVOKE ALL ON public.prexty_receipts FROM anon, authenticated;
  GRANT ALL ON public.prexty_receipts TO service_role;
END $$;

NOTIFY pgrst, 'reload schema';
