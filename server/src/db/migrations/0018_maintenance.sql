-- BAKIM MODU (2026-09-01)
--
-- Bakım durumu SUNUCU BELLEĞİNDE tutulamaz: bakım sırasında sunucu yeniden
-- başlarsa (dağıtım, çökme, makine yeniden başlatma) bakım kendiliğinden
-- kapanır ve oyuncular yarım kalmış bir sisteme dalar. Kalıcı olması şart.
--
-- Tek satırlık tablo (id = TRUE kısıtı): ikinci satır yazılamaz, dolayısıyla
-- "hangi kayıt geçerli" sorusu hiç doğmaz.
CREATE TABLE IF NOT EXISTS maintenance_state (
  id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  active      BOOLEAN NOT NULL DEFAULT FALSE,
  message     TEXT    NOT NULL DEFAULT '',
  started_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO maintenance_state (id, active, message)
VALUES (TRUE, FALSE, '')
ON CONFLICT (id) DO NOTHING;
