-- Oyuncu piyasa değeri (euro) — reveal/bot "en bilindik oyuncu" sıralaması için
-- GERÇEK oyuncu-ünü sinyali. TM API profilinden (marketValue alanı) doldurulur
-- (src/ingest/tm-positions.ts, API modu). Emekli/değersiz oyuncularda NULL kalır.
ALTER TABLE players ADD COLUMN IF NOT EXISTS market_value bigint;
