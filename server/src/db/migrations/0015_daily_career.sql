-- GÜNÜN KARİYERİ (2026-08-29) — Wordle döngüsü, ikinci günlük içerik.
-- Herkese aynı futbolcu: kulüp geçmişi yıl sırasıyla TEK TEK açılır, oyuncu
-- futbolcuyu bilmeye çalışır. Yanlış/pas → bir kulüp daha açılır.
--
-- Veri zaten elimizde: player_clubs.start_year/end_year (Transfermarkt).
-- Yeni içerik üretmek GEREKMEZ — bu yüzden en ucuz yeni mod.
--
-- Günün Crossover'ı (0009) ile AYNI kalıp: gün deterministik seçilir ve ilk
-- yazan kazanır (ON CONFLICT DO NOTHING) → restart/çoklu-instance aynı günü
-- farklı futbolcuyla gösteremez.

CREATE TABLE IF NOT EXISTS daily_career_days (
  day_idx    INT PRIMARY KEY,                -- Europe/Istanbul gün indeksi
  player_id  BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_career_results (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_idx    INT  NOT NULL,
  guesses    INT  NOT NULL DEFAULT 0,        -- kullanılan tahmin hakkı
  revealed   INT  NOT NULL DEFAULT 1,        -- açılmış kulüp sayısı (ipucu derinliği)
  correct    BOOLEAN NOT NULL DEFAULT FALSE,
  finished   BOOLEAN NOT NULL DEFAULT FALSE, -- bildi ya da hakkı bitti
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day_idx)
);
CREATE INDEX IF NOT EXISTS idx_daily_career_results_user ON daily_career_results (user_id, day_idx DESC);
