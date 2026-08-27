-- 0011_referrals.sql
-- Davet ödülü: yeni oyuncu, davet eden arkadaşının kodunu girer — İKİSİ DE
-- elmas kazanır ve otomatik arkadaş olurlar. PK referred_id: bir hesap davet
-- kodunu ömründe BİR kez kullanabilir (çifte ödül yapısal olarak imkânsız).
CREATE TABLE IF NOT EXISTS referrals (
  referred_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referrer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_reward INT NOT NULL DEFAULT 0,   -- kod girene fiilen yatan 💎
  referrer_reward INT NOT NULL DEFAULT 0,   -- davet edene fiilen yatan 💎 (günlük tavana takılırsa 0)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id, created_at DESC);
