-- Media expiry for shared attachments.
--
-- When an agent attaches media in the inbox they can now give it an expiry
-- ("Expires in 7 days"). Two behaviours:
--   • expiry_mode = 'access'  → the shared /m/ viewer link stops serving after
--                               expires_at. The recipient loses access, but the
--                               original stays in the workspace gallery. (default)
--   • expiry_mode = 'delete'  → an "advanced" option: after expires_at a cron
--                               permanently deletes the media from Colvy too.
--
-- expired_purged marks a 'delete'-mode link the cron has already cleaned up, so
-- it is never processed twice.

ALTER TABLE short_links ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS expiry_mode text;         -- 'access' | 'delete'
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS expired_purged boolean DEFAULT false;

-- The cron scans for due 'delete'-mode links; index the fields it filters on.
CREATE INDEX IF NOT EXISTS idx_short_links_expiry
  ON short_links (expires_at)
  WHERE expires_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
