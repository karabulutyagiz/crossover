-- 0014_managers.sql (2026-08-29)
-- XOX "teknik direktör" ekseni için TD kimlik + kulüp dönem verisi.
-- Kaynak: Transfermarkt (id = TM trainer id). club_id = TM kulüp id = clubs.id
-- (bizim kulüp id'lerimiz TM id olduğundan doğrudan FK; isim eşleme yok).
-- Hücre kuralı: oyuncu, TD'nin yönettiği kulüpte O DÖNEM (yıl-örtüşme) oynamışsa
-- "o TD altında oynamış" sayılır. Yalnız BAŞ ANTRENÖR dönemleri tutulur
-- (yardımcı/scout/sportif direktör HARİÇ — ingest tarafında filtrelenir).
-- Additive + idempotent: mevcut futbol/uygulama verisine dokunmaz.

CREATE TABLE IF NOT EXISTS managers (
  id         BIGINT PRIMARY KEY,        -- Transfermarkt trainer id
  name       TEXT   NOT NULL,
  name_norm  TEXT   NOT NULL,
  image_url  TEXT
);

CREATE TABLE IF NOT EXISTS manager_tenures (
  manager_id BIGINT NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  club_id    BIGINT NOT NULL REFERENCES clubs(id)    ON DELETE CASCADE,
  start_year INT,
  end_year   INT
);

-- Aynı TD aynı kulüpte birden çok dönem yönetebilir (ör. Terim ×4 Galatasaray);
-- her dönem ayrı satır, start_year ile ayrışır.
CREATE UNIQUE INDEX IF NOT EXISTS uq_manager_tenures
  ON manager_tenures (manager_id, club_id, (COALESCE(start_year, -1)));
CREATE INDEX IF NOT EXISTS idx_manager_tenures_club ON manager_tenures (club_id);
CREATE INDEX IF NOT EXISTS idx_manager_tenures_mgr  ON manager_tenures (manager_id);
CREATE INDEX IF NOT EXISTS idx_managers_name_norm_trgm
  ON managers USING gin (name_norm gin_trgm_ops);
