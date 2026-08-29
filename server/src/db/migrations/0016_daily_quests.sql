-- GÜNLÜK GÖREVLER (2026-08-29) — günlük döngünün tutkalı.
-- Her gün 3 görev; oyuncu normal maçlarını oynarken ilerler, tamamlayınca XP
-- alır. ELMAS VERİLMEZ (kullanıcı kararı: seri ödülleri kapatıldı, yeni musluk
-- açılmaz) — XP zaten Seviye Yolu üzerinden dengelenmiş ödüle dönüşür.
--
-- Görevler DETERMİNİSTİK seçilir (gün + kullanıcı) ve satır ilk ilerlemede
-- yazılır; ayrı bir "gün oluştur" işi yoktur.

CREATE TABLE IF NOT EXISTS daily_quests (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_idx    INT  NOT NULL,               -- Europe/Istanbul gün indeksi
  quest_id   TEXT NOT NULL,               -- QUEST_POOL anahtarı
  target     INT  NOT NULL,               -- hedef adet (seçim anında sabitlenir)
  progress   INT  NOT NULL DEFAULT 0,
  claimed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day_idx, quest_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_quests_user_day ON daily_quests (user_id, day_idx);
