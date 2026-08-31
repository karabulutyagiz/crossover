-- Oyuncu ÜN skoru — Çöz Kazan oyuncu havuzu + reveal sıralaması için oyuncu-seviyesi
-- fame. = oynadığı DISTINCT kulüplerin prestij TOPLAMI + market_value bonusu.
-- src/cli/populate-fame.ts ile doldurulur (market_value doldukça yeniden çalıştır).
ALTER TABLE players ADD COLUMN IF NOT EXISTS fame real NOT NULL DEFAULT 0;
