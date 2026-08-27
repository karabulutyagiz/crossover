-- 0008_account_deletions.sql (prod'da 0007 adıyla uygulandı; numara çakışması nedeniyle 0008'e alındı — idempotent, yeniden çalışması zararsız)
-- Silinen hesapları admin panelde görebilmek için minimal, KİŞİSEL VERİ İÇERMEYEN
-- bir silme günlüğü. deleteAccount() hesabı kalıcı silmeden HEMEN ÖNCE (aynı
-- transaction içinde) buraya tek satır anonim özet yazar.
--
-- Gizlilik / App Store 5.1.1(v): admin tarafın "kim sildi" görebilmesi için
-- yalnız seçilmiş KULLANICI ADI (display_name) tutulur. E-posta, auth subject ID
-- (apple/google/facebook_sub), mesaj, arkadaş vb. hiçbir hassas/PII alan TUTULMAZ
-- ve kullanıcının asıl verisi yine tamamen silinir. user_id, users satırı gittikten
-- sonra hiçbir canlı kullanıcıya bağlanamayan opak bir UUID'dir. Bu tablo geriye
-- dönük DEĞİLDİR: yalnızca bu migration sonrası yapılan silmeler burada görünür.
CREATE TABLE IF NOT EXISTS account_deletions (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            UUID NOT NULL,                 -- silinen hesabın opak id'si (FK YOK; users satırı artık yok)
  display_name       TEXT,                          -- silme anındaki kullanıcı adı (admin "kim sildi" için)
  was_guest          BOOLEAN NOT NULL,              -- silinen hesap misafir miydi (isGuestSql ile aynı kural)
  auth_provider      TEXT,                          -- 'apple' | 'google' | 'facebook' | 'gamecenter' | NULL(misafir)
  trophies           INT NOT NULL DEFAULT 0,        -- silme anındaki kupa (anonim analitik)
  level              INT NOT NULL DEFAULT 1,        -- silme anındaki seviye
  account_created_at TIMESTAMPTZ,                   -- hesabın açılış tarihi (ne kadar kaldığını görmek için)
  deleted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletions_deleted_at ON account_deletions (deleted_at DESC);
