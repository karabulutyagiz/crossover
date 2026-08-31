-- 0015_player_honours.sql (2026-08-29)
-- XOX "kupa" ekseni için oyuncu-kupa (KAZANAN) verisi. Kaynak: Transfermarkt
-- oyuncu Erfolge/Honours sayfası (yalnız "... winner" başlıkları). Kapsam: havuz
-- kulüplerinin en ünlü ~2000 oyuncusu (kullanıcı kararı 2026-08-29). Hedef kupalar:
--   CL = UEFA Şampiyonlar Ligi (+ tarihsel: European Cup)
--   WC = FIFA Dünya Kupası (yalnız "World Cup"; "Club World Cup"/"U20" HARİÇ)
--   EL = UEFA Avrupa Ligi (+ tarihsel: UEFA Cup)
-- Hücre kuralı: oyuncu bu kupayı KAZANMIŞ VE kesişen kulüpte oynamış.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS player_honours (
  player_id   BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  competition TEXT   NOT NULL,           -- 'CL' | 'WC' | 'EL'
  PRIMARY KEY (player_id, competition)
);
CREATE INDEX IF NOT EXISTS idx_player_honours_comp ON player_honours (competition);

-- Scrape ilerleme işareti (resume için): taranan oyuncular (kazansın kazanmasın).
CREATE TABLE IF NOT EXISTS honours_scanned (
  player_id BIGINT PRIMARY KEY
);
