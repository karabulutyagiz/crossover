-- 0016_player_positions.sql (2026-08-30)
-- XOX "mevki" ekseni için oyuncu ANA mevkisi (TM profil "Main position").
-- KATI: her oyuncunun TEK ana mevki kodu tutulur; hücre = ana mevkisi O olan VE
-- kesişen kulüpte oynamış oyuncu (asıl yeri orası olmayan ASLA kabul edilmez).
-- Kodlar: GK(kaleci) CB(stoper) RB(sağ bek) LB(sol bek) MF(orta saha)
--         LW(sol kanat) RW(sağ kanat) ST(santrafor).
-- Ayrıca "Ballon d'Or" ödülü mevcut player_honours'a competition='BDOR' olarak
-- eklenir (kupa ekseninin kardeşi). Kaynak: TM profil sayfası (mevki + BDOR rozeti).
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS player_positions (
  player_id BIGINT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  position  TEXT NOT NULL           -- GK|CB|RB|LB|MF|LW|RW|ST
);
CREATE INDEX IF NOT EXISTS idx_player_positions_pos ON player_positions (position);

-- Profil taraması ilerleme işareti (resume): mevki+BDOR için taranan oyuncular.
CREATE TABLE IF NOT EXISTS positions_scanned (
  player_id BIGINT PRIMARY KEY
);
