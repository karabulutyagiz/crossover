-- SEZON ÖZETİ (2026-08-29) — aylık döngünün görünür yüzü.
--
-- Aylık sezon zaten vardı (users.season_id; ay değişince level/xp/yol sıfırlanır,
-- kozmetikler ve elmas KALIR) ama oyuncuya hiç gösterilmiyordu: hangi sezondayız,
-- ne kadar kaldı, geçen sezon ne yaptım — hiçbiri yoktu. Bu tablo sezon
-- KAPANIRKEN oyuncunun o ayki zirvesini dondurur, böylece yeni sezonda
-- "geçen sezon şuraya ulaşmıştın" kartı gösterilebilir.
--
-- ÖDÜL YOK: elmas basmaz, güç dağıtmaz (seri ödülleri kapatılırken alınan karar
-- korunur). Değer PRESTİJDİR — Haftalık Lig'in küme rozetiyle aynı ilke.

CREATE TABLE IF NOT EXISTS season_summaries (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id     TEXT NOT NULL,          -- 'YYYY-MM' (Europe/Istanbul)
  peak_trophies INT  NOT NULL DEFAULT 0,
  peak_arena    INT  NOT NULL DEFAULT 0,
  wins          INT  NOT NULL DEFAULT 0,
  losses        INT  NOT NULL DEFAULT 0,
  best_level    INT  NOT NULL DEFAULT 1,
  closed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_id)
);
CREATE INDEX IF NOT EXISTS idx_season_summaries_user ON season_summaries (user_id, season_id DESC);

-- Sezon içi zirve takibi: kupa düşse bile o ayın en yükseği korunur.
ALTER TABLE users ADD COLUMN IF NOT EXISTS season_peak_trophies INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS season_wins INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS season_losses INT NOT NULL DEFAULT 0;
