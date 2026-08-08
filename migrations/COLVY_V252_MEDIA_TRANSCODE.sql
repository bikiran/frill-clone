-- V252 — Server-side video transcode pipeline (R2 + FFmpeg worker)
--
-- The phone uploads the ORIGINAL video straight to R2, records the item as
-- `pending`, and enqueues a transcode. A worker (/api/cron/transcode-worker and
-- the after() hook on /api/storage/transcode) produces an H.264/AAC MP4 with
-- +faststart at ≤1080p plus a poster, stores them back in R2, and flips the row
-- to `ready` with a `playback_url`. Web + mobile always prefer `playback_url`.

alter table media_items
  add column if not exists playback_url         text,
  add column if not exists processing_status    text,
  add column if not exists variants             jsonb  not null default '[]'::jsonb,
  add column if not exists source_url           text,
  add column if not exists transcode_attempts   integer not null default 0,
  add column if not exists transcode_error      text,
  add column if not exists transcode_started_at timestamptz;

-- Existing rows have always-playable originals — treat them as ready so nothing
-- shows a "Processing…" state retroactively.
update media_items set processing_status = 'ready' where processing_status is null;

-- The worker scans for pending videos oldest-first; a partial index keeps that cheap.
create index if not exists media_items_transcode_pending_idx
  on media_items (created_at)
  where kind = 'video' and processing_status = 'pending';

-- Mobile + web subscribe to media_items so a video flips from Processing → ready
-- live. Make sure the table is in the realtime publication (ignore if present).
do $$
begin
  alter publication supabase_realtime add table media_items;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
