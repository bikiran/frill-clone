-- COLVY V267 — FIX conversation_pins RLS (pins never synced)
--
-- conversation_pins was created in V258 WITHOUT row-level security, but RLS got
-- enabled on it since (dashboard toggle / stray change). With RLS ON and NO
-- policy, Postgres denies every non-service client — so the web inbox AND the
-- mobile app were both blocked from writing pins (error 42501, "new row
-- violates row-level security policy"). The table stayed empty and pins never
-- persisted or synced, on either platform.
--
-- Add a permissive policy, matching every other conversation_* table in this
-- schema (conversations, messages, conversation_notes, conversation_tasks,
-- conversation_events all use "FOR ALL USING (true)"). Per-user isolation is
-- enforced in the app (queries filter by user_id); the anon/authenticated keys
-- are used with permissive policies, consistent with the rest of Colvy.

ALTER TABLE conversation_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can manage conversation_pins" ON conversation_pins;
CREATE POLICY "Anyone can manage conversation_pins" ON conversation_pins
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
