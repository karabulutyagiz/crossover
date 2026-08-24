ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_cosmetics TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_frame_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_name_effect_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_match_background_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_ball_id TEXT NOT NULL DEFAULT 'classic_ball';
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_intro_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_victory_effect_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_answer_effect_id TEXT;

CREATE TABLE IF NOT EXISTS diamond_ledger (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  balance_before INT NOT NULL,
  balance_after INT NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT diamond_ledger_balance_check CHECK (balance_after = balance_before + amount),
  CONSTRAINT diamond_ledger_nonnegative_check CHECK (balance_before >= 0 AND balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS idx_diamond_ledger_user_created ON diamond_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_owned_cosmetics ON users USING gin (owned_cosmetics);
