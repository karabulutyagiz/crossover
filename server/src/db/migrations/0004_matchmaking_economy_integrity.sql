-- Production matchmaking/economy integrity layer.
-- Additive only: existing trophies, users, match history and profiles are preserved.

CREATE TABLE IF NOT EXISTS trophy_ledger (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID,
  player_id UUID REFERENCES users(id) ON DELETE SET NULL,
  before_trophies INT NOT NULL,
  delta INT NOT NULL,
  after_trophies INT NOT NULL,
  opponent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  opponent_ref TEXT,
  opponent_type TEXT NOT NULL CHECK (opponent_type IN ('HUMAN', 'BOT', 'SYSTEM')),
  source TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'match_settlement',
  expected_win_probability DOUBLE PRECISION,
  anti_farm_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
  bot_economy_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
  final_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
  farm_risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  farm_risk_level TEXT NOT NULL DEFAULT 'LOW',
  economy_state TEXT NOT NULL DEFAULT 'HEALTHY',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id, reason)
);
CREATE INDEX IF NOT EXISTS idx_trophy_ledger_player_recent ON trophy_ledger (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trophy_ledger_match ON trophy_ledger (match_id);
CREATE INDEX IF NOT EXISTS idx_trophy_ledger_source_day ON trophy_ledger (source, created_at DESC);

CREATE TABLE IF NOT EXISTS opponent_history (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  opponent_type TEXT NOT NULL CHECK (opponent_type IN ('HUMAN', 'BOT')),
  pair_key TEXT,
  winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  won BOOLEAN NOT NULL,
  trophy_delta INT NOT NULL DEFAULT 0,
  duration_secs INT NOT NULL DEFAULT 0,
  answer_pattern JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_opponent_history_player_recent ON opponent_history (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opponent_history_pair_recent ON opponent_history (pair_key, created_at DESC) WHERE pair_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opponent_history_winner_recent ON opponent_history (winner_id, created_at DESC) WHERE winner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS player_bot_exposure (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  match_id UUID NOT NULL,
  segment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_player_bot_exposure_recent ON player_bot_exposure (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pair_integrity_stats (
  pair_key TEXT PRIMARY KEY,
  match_count_24h INT NOT NULL DEFAULT 0,
  match_count_7d INT NOT NULL DEFAULT 0,
  one_way_transfer_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  short_match_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  farm_risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  farm_risk_level TEXT NOT NULL DEFAULT 'LOW',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pair_integrity_risk ON pair_integrity_stats (farm_risk_score DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS match_decision_traces (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID,
  player_id UUID REFERENCES users(id) ON DELETE SET NULL,
  queue_start TIMESTAMPTZ NOT NULL,
  queue_duration_ms INT NOT NULL,
  human_candidates_found INT NOT NULL DEFAULT 0,
  selected_opponent_type TEXT NOT NULL,
  selected_opponent_id TEXT,
  selected_opponent_mmr DOUBLE PRECISION,
  player_mmr DOUBLE PRECISION,
  mmr_difference DOUBLE PRECISION,
  bot_skill DOUBLE PRECISION,
  queue_health JSONB NOT NULL DEFAULT '{}',
  form_score DOUBLE PRECISION,
  frustration_risk DOUBLE PRECISION,
  farm_risk DOUBLE PRECISION,
  trophy_economy_state TEXT,
  match_quality_score DOUBLE PRECISION,
  selection_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_decision_traces_player_recent ON match_decision_traces (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_decision_traces_match ON match_decision_traces (match_id);

CREATE TABLE IF NOT EXISTS trophy_economy_daily (
  day DATE PRIMARY KEY,
  trophies_created BIGINT NOT NULL DEFAULT 0,
  trophies_destroyed BIGINT NOT NULL DEFAULT 0,
  bot_trophy_injection BIGINT NOT NULL DEFAULT 0,
  human_trophy_transfers BIGINT NOT NULL DEFAULT 0,
  active_trophy_supply BIGINT NOT NULL DEFAULT 0,
  economy_state TEXT NOT NULL DEFAULT 'HEALTHY',
  p10 INT,
  p25 INT,
  p50 INT,
  p75 INT,
  p90 INT,
  p95 INT,
  p99 INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrity_flags (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  pair_key TEXT,
  match_id UUID,
  risk_level TEXT NOT NULL,
  risk_score DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integrity_flags_open ON integrity_flags (status, risk_level, created_at DESC);

CREATE TABLE IF NOT EXISTS player_matchmaking_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  frustration_risk DOUBLE PRECISION NOT NULL DEFAULT 0,
  dominance_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  smurf_likelihood DOUBLE PRECISION NOT NULL DEFAULT 0,
  intentional_loss_suspicion DOUBLE PRECISION NOT NULL DEFAULT 0,
  recovery_cooldown_until TIMESTAMPTZ,
  recent_human_win_rate DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  recent_bot_win_rate DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  recent_accuracy_ema DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  response_time_ema_ms INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
