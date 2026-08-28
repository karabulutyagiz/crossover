-- Turnuva sistemi (2026-08-28): admin oluşturur, oyuncular kayıt olur, dolunca
-- tek-elemeli ağaç (bracket) kurulur; kazanan üst tura, şampiyona elmas ödülü.
CREATE TABLE IF NOT EXISTS tournaments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  size           int  NOT NULL DEFAULT 8,      -- 4 / 8 / 16 (2^n)
  prize_first    int  NOT NULL DEFAULT 500,    -- elmas
  prize_second   int  NOT NULL DEFAULT 200,
  entry_fee      int  NOT NULL DEFAULT 0,      -- elmas giriş ücreti (kayıtta kesilir, ayrılınca iade)
  status         text NOT NULL DEFAULT 'registration', -- registration|live|finished
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  winner_user_id uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed          int  NOT NULL DEFAULT 0,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);
CREATE TABLE IF NOT EXISTS tournament_matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round         int  NOT NULL,   -- 1 = ilk tur
  slot          int  NOT NULL,   -- turdaki sıra (0-tabanlı)
  player_a      uuid REFERENCES users(id) ON DELETE SET NULL,
  player_b      uuid REFERENCES users(id) ON DELETE SET NULL,
  winner        uuid REFERENCES users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending', -- pending|playing|done
  UNIQUE (tournament_id, round, slot)
);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_pending
  ON tournament_matches (tournament_id) WHERE winner IS NULL;
