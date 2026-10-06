-- ============================================================
-- COLVY V334 — INDEXES FOR INBOX SEARCH
--
-- The inbox search (web and mobile) matches '%term%' with ILIKE on
-- messages.content, contacts.name/email/phone and conversations.subject /
-- sms_number. A leading wildcard can't use a normal b-tree index, so each
-- search scanned every message in the database, row by row, and since
-- V299 each of those rows also runs is_company_member(). On a growing inbox
-- that is what made search take many seconds.
--
-- Trigram (pg_trgm) GIN indexes serve ILIKE '%term%' directly. pg_trgm is
-- already enabled (COLVY_PRODUCT_SEARCH_INDEX).
--
-- HOW TO RUN
-- CREATE INDEX CONCURRENTLY builds without blocking writes (inbound SMS and
-- chat keep landing), but it cannot run inside a transaction block. In the
-- Supabase SQL editor, run each statement ON ITS OWN (highlight one, Run).
-- The messages index is the one that matters most and may take a minute.
-- Safe to re-run.
-- ============================================================

create extension if not exists pg_trgm;

create index concurrently if not exists messages_content_trgm_idx
  on public.messages using gin (content gin_trgm_ops);

create index concurrently if not exists contacts_name_trgm_idx
  on public.contacts using gin (name gin_trgm_ops);

create index concurrently if not exists contacts_email_trgm_idx
  on public.contacts using gin (email gin_trgm_ops);

create index concurrently if not exists contacts_phone_trgm_idx
  on public.contacts using gin (phone gin_trgm_ops);

create index concurrently if not exists conversations_subject_trgm_idx
  on public.conversations using gin (subject gin_trgm_ops);

-- Confirm (all five should be listed, indisvalid = true):
--   select c.relname, i.indisvalid
--     from pg_index i join pg_class c on c.oid = i.indexrelid
--    where c.relname like '%_trgm_idx';
-- If one shows indisvalid = false (a concurrent build was interrupted),
-- drop it with DROP INDEX CONCURRENTLY <name>; and run its CREATE again.
