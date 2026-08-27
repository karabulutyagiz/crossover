-- 0009_daily_crossover.sql
-- Günün Crossover'ı: herkese aynı günlük soru (Wordle döngüsü).
-- daily_crossover_days: günün kulüp çifti — deterministik seçilir, ilk yazan
-- kazanır (ON CONFLICT DO NOTHING); restart/çoklu-instance aynı günü farklı
-- soruyla gösteremez.
CREATE TABLE IF NOT EXISTS daily_crossover_days (
  day_idx    INT PRIMARY KEY,          -- Europe/Istanbul gün indeksi (epoch gün, +3s kayma)
  team_a_id  BIGINT NOT NULL REFERENCES clubs(id),
  team_b_id  BIGINT NOT NULL REFERENCES clubs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- daily_crossover_results: oyuncu başına günde TEK satır (PK). Deneme sayacı ve
-- süre BURADA tutulur — uygulamayı yeniden başlatmak hak tazeleyemez.
-- correct NULL = devam ediyor; finished_at dolunca gün kapanmıştır.
CREATE TABLE IF NOT EXISTS daily_crossover_results (
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_idx             INT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  correct             BOOLEAN,
  guesses             INT NOT NULL DEFAULT 0,
  duration_ms         INT,
  answer_player_name  TEXT,
  answer_player_image TEXT,
  PRIMARY KEY (user_id, day_idx)
);

CREATE INDEX IF NOT EXISTS idx_daily_cx_results_user ON daily_crossover_results (user_id, day_idx DESC);
