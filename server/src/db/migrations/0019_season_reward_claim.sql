-- SEZON ÖDÜLÜ: OTOMATİK VERME → TOPLAMA (2026-09-01)
--
-- Kullanıcı kararı: "sezon ödülleri verirken popup yazdık mı, ÖDÜLLERİNİ TOPLA
-- butonu koyup topla deyince alması lazım."
--
-- Neden doğru: ödül sessizce hesaba düşünce oyuncu ne kazandığını fark etmiyor;
-- sezonun kapanışı bir olay olarak yaşanmıyor. Toplama adımı hem ödülü görünür
-- kılar hem de "yeni sezon başladı" anını işaretler.
--
-- Bekleyen ödül season_summaries üzerinden izlenir: sezon kapanışında zaten bir
-- satır yazılıyor (o ayın zirvesi dondurulur). Ödülün toplanıp toplanmadığı da
-- aynı satırda tutulur — ayrı tablo açmaya gerek yok, "hangi sezonun ödülü"
-- sorusu doğal olarak cevaplanır.
ALTER TABLE season_summaries ADD COLUMN IF NOT EXISTS reward_claimed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE season_summaries ADD COLUMN IF NOT EXISTS reward_claimed_at TIMESTAMPTZ;

-- Ödülleri OTOMATİK almış olanlar (bayrağın açık olduğu kısa dönem) yeniden
-- toplayamamalı: rozeti olan herkes "toplanmış" sayılır.
UPDATE season_summaries ss
SET reward_claimed = TRUE, reward_claimed_at = now()
FROM users u
WHERE ss.user_id = u.id
  AND ss.reward_claimed = FALSE
  AND 'pp35' = ANY(u.owned_avatars);

CREATE INDEX IF NOT EXISTS idx_season_summaries_unclaimed
  ON season_summaries (user_id) WHERE reward_claimed = FALSE;
