-- ============================================================
-- COLVY V362 — MISSED-CALL TEXT BACK
--
-- Settings → Calls & SMS → "Text back missed calls" sends a caller one text
-- when nobody picked up ("Sorry we missed your call! …"), so a customer who
-- rang while the shop was busy isn't lost. The setting itself lives in
-- companies.inbox_settings (no column needed).
--
-- This table remembers when each caller was last texted, so a caller gets at
-- most one text every 12 hours however often they ring, and two call webhooks
-- arriving together can't both send one. Claiming a caller is a single insert
-- (or, after 12 hours, a single conditional update) on this row.
--
-- Until this runs, Colvy falls back to checking the caller's conversation for
-- a missed-call text in the last 12 hours.
--
-- Server only (service role): RLS on, no policies, so nobody reads it with
-- the public key. Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS missed_call_texts (
  company_id UUID NOT NULL,
  phone TEXT NOT NULL,                       -- the caller, E.164 (+614…)
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  call_id UUID,                              -- the missed call that claimed it
  PRIMARY KEY (company_id, phone)
);
ALTER TABLE missed_call_texts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
