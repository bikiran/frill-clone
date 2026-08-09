-- ============================================================
-- COLVY V254 — REALTIME FOR NOTES
-- The Notes clients (web + mobile) subscribe to postgres_changes on `notes`,
-- but the table was never added to the supabase_realtime publication, so
-- Postgres emitted nothing: subscriptions reached SUBSCRIBED and writes
-- succeeded, yet no events ever arrived. Add it so notes sync live both ways.
-- Guarded so it's safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE notes';
  END IF;
END $$;

-- So UPDATE/DELETE payloads carry the changed row's identity — needed for the
-- clients' `company_id=eq.…` filter to match on updates and deletes. Safe to
-- re-run.
ALTER TABLE notes REPLICA IDENTITY FULL;
