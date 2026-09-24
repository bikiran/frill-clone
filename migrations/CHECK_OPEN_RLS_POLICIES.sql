-- ============================================================
-- READ-ONLY: every table a stranger can still reach.
--
-- V210 assumed a `company_members_*` policy replaced the permissive one. It
-- does not — PostgreSQL ORs permissive policies together, so one `USING (true)`
-- next to a company check means the company check never decides anything. That
-- was true of contacts, conversations and messages; V299 fixes those four
-- tables. This query asks how far the same pattern goes.
--
-- Read the output as three groups:
--
--   A. wide_open_to_public — a policy with no restriction, granted to PUBLIC
--      (which includes anon, and the anon key ships in the web bundle and
--      inside the Android app). Anything here holding customer or business
--      data is a live leak.
--
--   B. overridden_company_check — the dangerous shape specifically: an
--      unrestricted policy sitting on a table that ALSO has a company-scoped
--      one. Someone meant to lock this table and it is not locked.
--
--   C. Some of group A is deliberate. Public board content is supposed to be
--      readable by anyone: ideas, comments, votes, announcements, changelog,
--      roadmap, public forms. Judge each on whether a stranger seeing — or
--      writing — that row is acceptable.
--
-- Nothing here writes.
-- ============================================================

WITH perms AS (
  SELECT p.tablename,
         p.policyname,
         p.cmd,
         p.roles::text AS roles,
         p.qual,
         p.with_check,
         -- No USING clause, or one that is literally true.
         (p.qual IS NULL OR btrim(p.qual) = 'true') AS unrestricted,
         (p.roles::text ILIKE '%public%' OR p.roles::text ILIKE '%anon%') AS reaches_anon
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.permissive = 'PERMISSIVE'
)
SELECT t.tablename,
       t.policyname,
       t.cmd,
       t.roles,
       COALESCE(t.qual, '(no USING clause)') AS qual,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM perms o
            WHERE o.tablename = t.tablename
              AND o.qual ILIKE '%is_company_member%'
         ) THEN 'B — overrides a company check on this table'
         ELSE 'A — unrestricted'
       END AS verdict
  FROM perms t
 WHERE t.unrestricted
   AND t.reaches_anon
 ORDER BY
   CASE WHEN EXISTS (
     SELECT 1 FROM perms o
      WHERE o.tablename = t.tablename AND o.qual ILIKE '%is_company_member%'
   ) THEN 0 ELSE 1 END,
   t.tablename, t.policyname;

-- Tables with RLS switched on but NO policy at all: nobody but the service
-- role can touch them. Not a leak — the opposite — but worth knowing about,
-- because it shows up as features silently returning nothing.
SELECT c.relname AS table_with_rls_but_no_policy
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND c.relrowsecurity
   AND NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
   )
 ORDER BY c.relname;

-- Tables with RLS switched OFF entirely. RLS off means every policy on the
-- table is ignored and the anon key can do whatever its GRANTs allow.
SELECT c.relname AS table_with_rls_disabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND NOT c.relrowsecurity
 ORDER BY c.relname;
