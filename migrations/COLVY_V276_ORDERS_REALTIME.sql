-- Live Orders board — add `orders` to the realtime publication so a new or
-- updated order (from the WooCommerce webhook) appears in the Orders page
-- instantly, the same way new chats do. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE orders';
  END IF;
END $$;
