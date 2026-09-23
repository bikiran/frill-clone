-- ============================================================
-- READ-ONLY: is the cross-workspace read receipt a display bug or an
-- access one?
--
-- A Roxy Aquarium conversation showed "Read by Roxy Aquarium, Aqua Circle"
-- under the customer's messages. Aqua Circle is a different workspace. The
-- rendering is fixed either way — receipts that cannot be attributed to the
-- thread's own company are no longer shown — but that only hides it. These
-- three queries say whether an account from one workspace was actually able to
-- write to another's rows, which would be a real breach rather than a
-- confusing label.
--
-- Nothing here writes. Run it in the Supabase SQL editor.
-- ============================================================

-- ── 1. Is RLS actually on, with the V210 policy? ────────────────────────────
-- Expect one row per table, cmd ALL, qual is_company_member(company_id).
-- If `messages` is missing, V210 was never applied and any signed-in user can
-- read and write EVERY company's messages. That is the finding that matters.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       p.policyname, p.cmd, p.qual
  FROM pg_class c
  LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
 WHERE c.relname IN ('messages', 'conversations', 'contacts')
 ORDER BY c.relname, p.policyname;

-- ── 2. Is the other account simply a member of this workspace? ──────────────
-- The innocent explanation. If the Aqua Circle login was invited to Roxy
-- Aquarium — or is the same person's second login, added to both — then it
-- read those messages legitimately and the only fault was showing a workspace
-- name where a person's name belongs.
SELECT tm.email, tm.role, tm.status, c.name AS workspace, tm.user_id
  FROM team_members tm
  JOIN companies c ON c.id = tm.company_id
 WHERE lower(tm.email) IN (
         -- put the addresses behind both names here
         'info@aquacircle.com.au'
       )
 ORDER BY c.name;

-- ── 3. Receipts that do not belong to the message's own company ─────────────
-- Every stamp written from here on carries company_id. Rows where the two
-- disagree are the ones a foreign workspace actually wrote. An empty result
-- means nothing crossed the boundary since stamps started carrying a company.
SELECT m.id AS message_id,
       m.company_id AS message_company,
       own.name AS message_workspace,
       r ->> 'name' AS reader,
       (r ->> 'company_id')::uuid AS reader_company,
       other.name AS reader_workspace,
       m.created_at
  FROM messages m
  CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(m.read_by::jsonb) = 'array'
              THEN m.read_by::jsonb ELSE '[]'::jsonb END) AS r
  LEFT JOIN companies own   ON own.id = m.company_id
  LEFT JOIN companies other ON other.id = (r ->> 'company_id')::uuid
 WHERE r ->> 'company_id' IS NOT NULL
   AND (r ->> 'company_id')::uuid IS DISTINCT FROM m.company_id
 ORDER BY m.created_at DESC
 LIMIT 100;
