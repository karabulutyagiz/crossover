-- Maç içi Özel Güçler (Special Powers) — envanter sütunları + denetim kaydı.
-- Meta güçler (power_xp2x/power_shield/power_streak/power_training/power_socialtoken)
-- AYRI kategoridir ve bu migration onlara dokunmaz.

ALTER TABLE users ADD COLUMN IF NOT EXISTS sp_freeze INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sp_reveal INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sp_skip INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sp_extratime INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sp_secondchance INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_special_power TEXT;

-- Her güç işlemi (tüketim / satın alma / ödül) buraya yazılır — bakiye uyuşmazlığı
-- ve exploit soruşturması için tek bakılacak yer.
CREATE TABLE IF NOT EXISTS special_power_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  match_id TEXT,
  round_number INT,
  power_id TEXT NOT NULL,
  action TEXT NOT NULL,          -- consume | purchase | grant
  before_qty INT NOT NULL,
  after_qty INT NOT NULL,
  request_id TEXT,
  result TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sp_audit_user ON special_power_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sp_audit_match ON special_power_audit (match_id);
