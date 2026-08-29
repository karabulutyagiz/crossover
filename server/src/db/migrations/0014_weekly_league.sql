-- HAFTALIK LİG (2026-08-29): oyuncu hafta boyunca KAZANDIĞI kupaları lig puanı
-- olarak biriktirir; pazartesi 00:00 (TR) grup kapanır, ilk 10 üst kümeye çıkar,
-- son 5 düşer. Ödül YALNIZ PRESTİJ (küme + rozet) — elmas/güç dağıtılmaz.
--
-- TASARIM NOTU: lig AYRI EŞLEŞME İSTEMEZ. "Hemen Oyna" akışı hiç değişmez;
-- lig onun üstünde pasif bir skor tablosudur. Gruplar 30 kişiliktir ve
-- insanlarla dolmayan slotlar BOT ile gösterilir — botlar DB'de saklanmaz,
-- grup seed'inden deterministik üretilir (cron yok, tablo şişmez).

-- Oyuncunun güncel kümesi (0=Bronz .. 4=Şampiyon) ve gördüğü en yüksek küme.
ALTER TABLE users ADD COLUMN IF NOT EXISTS league_tier INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS league_best_tier INT NOT NULL DEFAULT 0;

-- Bir haftanın bir kümesindeki tek grup örneği.
CREATE TABLE IF NOT EXISTS league_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key     TEXT NOT NULL,              -- o haftanın pazartesisi (YYYY-MM-DD, TR saati)
  tier         INT  NOT NULL,              -- 0..4
  seed         BIGINT NOT NULL,            -- bot isim/puan üretimi için deterministik tohum
  member_count INT  NOT NULL DEFAULT 0,    -- gruptaki İNSAN sayısı (bot slotları = kapasite - bu)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_league_groups_open ON league_groups (week_key, tier, member_count);

-- Grup üyeliği + hafta içi puan.
CREATE TABLE IF NOT EXISTS league_members (
  group_id  UUID NOT NULL REFERENCES league_groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points    INT  NOT NULL DEFAULT 0,
  wins      INT  NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_league_members_user ON league_members (user_id);
CREATE INDEX IF NOT EXISTS idx_league_members_rank ON league_members (group_id, points DESC);

-- Hafta kapanışı — (user, week) tekil: aynı hafta iki kez kapatılamaz (idempotency).
CREATE TABLE IF NOT EXISTS league_settlements (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_key    TEXT NOT NULL,
  rank        INT  NOT NULL,
  points      INT  NOT NULL,
  tier_before INT  NOT NULL,
  tier_after  INT  NOT NULL,
  settled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_key)
);
CREATE INDEX IF NOT EXISTS idx_league_settlements_user ON league_settlements (user_id, settled_at DESC);
