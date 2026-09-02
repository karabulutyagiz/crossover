-- 0021_guess_who_pool.sql (2026-09-02)
-- "Ben Kimim?" modu havuzu: bulanık fotoğraflı futbolcuyu niteliklerinden bilme oyunu.
-- Yalnız GÜNCEL/aktif oyuncular (5 büyük lig + Süper Lig kadroları) — jersey no + güncel
-- kulüp gerektirir. Nitelikler Transfermarkt'tan toplanır (bkz. ingest/guesswho-pool.ts).
--   foto      → players.image_url
--   uyruk     → players.nationality
--   yaş       → birth_date (aşağıda)
--   forma no  → jersey_number
--   mevki     → position (player_positions ile aynı 8 kod: GK|CB|RB|LB|MF|LW|RW|ST)
--   takım/lig → current_club_id → clubs (logo) + clubs.league
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS guess_who_pool (
  player_id       BIGINT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  current_club_id BIGINT REFERENCES clubs(id) ON DELETE SET NULL,
  jersey_number   INTEGER,      -- güncel sezon forma no (yoksa NULL → o hücre nötr)
  birth_date      DATE,         -- yaş bundan hesaplanır
  position        TEXT,         -- GK|CB|RB|LB|MF|LW|RW|ST
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gwp_club ON guess_who_pool (current_club_id);
CREATE INDEX IF NOT EXISTS idx_gwp_pos  ON guess_who_pool (position);
