-- 5 Eylul 2026 bakim telafisi icin kampanyaya ozel tek-kullanim damgasi.
-- Onceki outage_gift_at degerleri bu yeni hediyeyi etkilemez.
ALTER TABLE users ADD COLUMN IF NOT EXISTS apology_gift_20260905_at TIMESTAMPTZ;
