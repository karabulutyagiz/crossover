-- Özel Güç loadout'u (kullanıcı revizyonu 2026-08-27): maç başına 1 güç → 3 güç.
-- equipped_special_powers = maça götürülen (en fazla 3 farklı) güç listesi.
-- Eski tekil sütun geriye uyum için kalır ve ilk slotla senkron tutulur.
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_special_powers TEXT[] NOT NULL DEFAULT '{}';
UPDATE users SET equipped_special_powers = ARRAY[equipped_special_power]
 WHERE equipped_special_power IS NOT NULL AND equipped_special_powers = '{}';
