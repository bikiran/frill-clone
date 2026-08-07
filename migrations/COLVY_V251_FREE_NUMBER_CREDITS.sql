-- Free number credits — let a platform admin grant a business one or more
-- phone numbers at no charge.
--
-- When a company has free_number_credits > 0, the "Get a business number" flow
-- skips Stripe checkout entirely: the number is provisioned directly against
-- the platform carrier and one credit is consumed. This is transparent to the
-- customer (they just don't see a payment step) and is granted from
-- Super Admin → Companies → Edit → "Free number credits".

-- How many numbers this company may provision for free before checkout kicks in.
-- Consumed atomically at provision time; refunded if provisioning fails.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS free_number_credits integer NOT NULL DEFAULT 0;

-- Marks a number that was granted for free (monthly_cost 0, no Stripe
-- subscription) so billing/reporting can tell it apart from a paid number.
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
