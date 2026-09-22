-- ============================================================
-- COLVY V313 — social_comments.contact_id
--
-- Links a Facebook/Instagram comment (on a post or ad) to a CRM contact, so a
-- customer's public engagement surfaces in the inbox (header pill, timeline,
-- thread event) the same way their DMs and reviews do. A comment carries the
-- commenter's platform user id (author_id / PSID / IGSID); we match it to a
-- contact's meta_user_id (the same id DMs are keyed on). Unmatched comments keep
-- contact_id NULL and live only in the Social Engagement manager as before.
--
--   contact_id : uuid — the linked CRM contact (nullable).
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS contact_id UUID;
CREATE INDEX IF NOT EXISTS idx_social_comments_contact ON social_comments (company_id, contact_id);

-- Backfill: link existing comments to a contact whose meta_user_id matches the
-- commenter's author_id (same company). Best-effort; leaves the rest NULL.
UPDATE social_comments sc
SET contact_id = c.id
FROM contacts c
WHERE sc.contact_id IS NULL
  AND sc.author_id IS NOT NULL
  AND c.company_id = sc.company_id
  AND c.meta_user_id = sc.author_id;

NOTIFY pgrst, 'reload schema';
