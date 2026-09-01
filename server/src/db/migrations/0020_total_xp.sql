-- HESAP XP'Sİ (2026-09-02): sezonluk xp/level her devirde sıfırlanır (CO-PASS).
-- total_xp ASLA sıfırlanmaz — LoL usulü ömürlük hesap seviyesinin kaynağıdır.
-- Geri doldurma migration'da DEĞİL (eğri TypeScript'te): backfill-account-xp.ts
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_xp BIGINT NOT NULL DEFAULT 0;
