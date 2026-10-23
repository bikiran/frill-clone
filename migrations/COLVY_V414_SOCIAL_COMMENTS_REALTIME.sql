-- COLVY V414 — live Social Engagement page
--
-- New Facebook / Instagram comments arrive by webhook and are saved to
-- social_comments, but the page only read them when it loaded, so you had to
-- reload to see them. Adding the table to the realtime publication lets the
-- page receive new comments (and the AI's classification and replies) as they
-- happen, the same way new chats and orders do. Row-level security still
-- applies: staff only receive their own company's comments (V412).
--
-- Safe to run more than once.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'social_comments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE social_comments';
  END IF;
END $$;
