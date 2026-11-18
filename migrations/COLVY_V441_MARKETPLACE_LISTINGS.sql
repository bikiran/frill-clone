-- ============================================================
-- COLVY V441 — MARKETPLACE LISTINGS
--
-- Run after COLVY_V440_AUTOMATIONS.sql. Adds:
--   listings                   things a business sells on Facebook Marketplace,
--                              Gumtree and the like. Each gets its own Colvy
--                              page (<slug>.colvy.com/item/<code>) and a short code
--                              buyers can text, so enquiries reach the inbox
--                              with the listing attached, and views, enquiries
--                              and sales can be counted per listing.
--   conversations.listing_id   the listing a conversation is about (set when a
--                              buyer chats from the listing page or texts its
--                              code)
--
-- Views are clicks on the listing's tracked link (short_links / link_clicks,
-- channel 'marketplace'), so they show in Link Reports too.
--
-- Server only: RLS on with no policies, nothing granted to anon/authenticated.
-- Safe to re-run. Rollback at the bottom.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- What buyers type or text: letters and numbers, stored in capitals ("TANK4").
  code              TEXT NOT NULL CHECK (code ~ '^[A-Z0-9]{3,12}$'),
  title             TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  price_cents       INT CHECK (price_cents IS NULL OR price_cents >= 0),
  currency          TEXT NOT NULL DEFAULT 'aud',
  description       TEXT CHECK (description IS NULL OR char_length(description) <= 5000),
  condition         TEXT CHECK (condition IS NULL OR condition IN ('new', 'like_new', 'good', 'fair')),
  photos            JSONB NOT NULL DEFAULT '[]'::jsonb,
  pickup            TEXT CHECK (pickup IS NULL OR char_length(pickup) <= 120),
  -- Where it's listed, and the listing's own address there (optional).
  source            TEXT NOT NULL DEFAULT 'facebook_marketplace'
                    CHECK (source IN ('facebook_marketplace', 'gumtree', 'ebay', 'other')),
  external_url      TEXT,
  -- A product in the business's online store this listing is for (optional):
  -- { platform: 'woocommerce' | 'shopify', id, name, url }
  product           JSONB,
  short_link_id     UUID REFERENCES public.short_links(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'hidden')),
  sold_at           TIMESTAMPTZ,
  sold_price_cents  INT CHECK (sold_price_cents IS NULL OR sold_price_cents >= 0),
  sold_contact_id   UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  sold_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS listings_company_code_idx ON public.listings (company_id, code);
CREATE INDEX IF NOT EXISTS listings_company_idx ON public.listings (company_id, created_at DESC);

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conversations_listing_idx ON public.conversations (listing_id) WHERE listing_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.listings FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.listings FROM authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Rollback ───────────────────────────────────────────────
-- ALTER TABLE public.conversations DROP COLUMN IF EXISTS listing_id;
-- DROP TABLE IF EXISTS public.listings;
