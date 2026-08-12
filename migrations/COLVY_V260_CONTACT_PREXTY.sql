-- COLVY V260 — CONTACT ↔ PREXTY LINK
--
-- Cache the matched Prexty POS customer id on the contact so the inbox
-- conversation list can show a "Prexty" indicator WITHOUT a live per-row lookup
-- (Prexty's customers API only filters one term per request). The value is
-- populated lazily the first time a conversation is opened and its Prexty
-- profile is fetched (GET /api/prexty/customer). Nullable: null = no match yet /
-- not a Prexty customer.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS prexty_customer_id BIGINT;
