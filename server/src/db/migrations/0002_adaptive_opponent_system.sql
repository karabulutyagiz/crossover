-- Adaptive opponent system: hidden skill, question telemetry, match telemetry and bot identity history.
-- Additive and rollback-safe: no existing user/trophy/history data is modified.

CREATE TABLE IF NOT EXISTS player_skill_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  skill_mean DOUBLE PRECISION NOT NULL DEFAULT 1000,
  skill_uncertainty DOUBLE PRECISION NOT NULL DEFAULT 350,
  matches_played INT NOT NULL DEFAULT 0,
  recent_matches JSONB NOT NULL DEFAULT '[]',
  overall_accuracy DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  median_correct_response_time_ms INT,
  response_time_variance DOUBLE PRECISION NOT NULL DEFAULT 0,
  easy_question_accuracy DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  medium_question_accuracy DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  hard_question_accuracy DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  famous_player_accuracy DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  obscure_player_accuracy DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  club_knowledge DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  national_team_knowledge DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  league_knowledge DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  fast_answer_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  timeout_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  mistake_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_form DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_skill_profiles_skill ON player_skill_profiles (skill_mean, skill_uncertainty);

CREATE TABLE IF NOT EXISTS question_difficulty_stats (
  question_key TEXT PRIMARY KEY,
  game_mode TEXT NOT NULL,
  team_a_id BIGINT,
  team_b_id BIGINT,
  extra_key TEXT,
  heuristic_difficulty DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  difficulty_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  total_attempts INT NOT NULL DEFAULT 0,
  human_attempts INT NOT NULL DEFAULT 0,
  human_correct INT NOT NULL DEFAULT 0,
  human_timeouts INT NOT NULL DEFAULT 0,
  bot_attempts INT NOT NULL DEFAULT 0,
  bot_correct INT NOT NULL DEFAULT 0,
  response_time_samples INT NOT NULL DEFAULT 0,
  response_time_sum_ms BIGINT NOT NULL DEFAULT 0,
  response_time_sum_sq_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  valid_answer_count INT NOT NULL DEFAULT 0,
  answer_popularity DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_question_difficulty_mode ON question_difficulty_stats (game_mode, difficulty_score);
CREATE INDEX IF NOT EXISTS idx_question_difficulty_last_played ON question_difficulty_stats (last_played_at DESC);

CREATE TABLE IF NOT EXISTS match_telemetry (
  id BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  match_id UUID,
  room_code TEXT,
  player_id UUID REFERENCES users(id) ON DELETE SET NULL,
  opponent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  opponent_type TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_telemetry_event ON match_telemetry (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_telemetry_match ON match_telemetry (match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_match_telemetry_player ON match_telemetry (player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bot_opponent_history (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  bot_name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  skill_mean DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bot_id, created_at)
);
CREATE INDEX IF NOT EXISTS idx_bot_opponent_history_user_recent ON bot_opponent_history (user_id, created_at DESC);
