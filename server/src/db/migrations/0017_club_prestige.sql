-- Kulüp PRESTİJ skoru (ün) — reveal/bot "en bilindik oyuncu" sıralaması için.
-- popularity=kadro büyüklüğü (ün DEĞİL); prestige, katman sisteminden (fame)
-- doldurulur (bkz. src/cli/populate-prestige.ts). Yüksek = daha ünlü kulüp.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS prestige real NOT NULL DEFAULT 0;
