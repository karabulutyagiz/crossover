-- Store Apple-signed transaction pricing metadata for admin revenue accounting.
-- Additive only: existing transaction grants remain unchanged.

ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS price_milliunits BIGINT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS storefront TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS transaction_reason TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS revocation_date TIMESTAMPTZ;
