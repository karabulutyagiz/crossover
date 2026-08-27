-- club-logo-mismatch-fixes.sql (2026-08-28)
--
-- Samsunspor logo hatasının ardından yapılan tam taramada bulunan DİĞER logo
-- karışıklıkları. Her kulüp yanlışlıkla BAŞKA bir kulübün api-sports logosunu
-- gösteriyordu (offline curated veriyle çapraz kontrol — Samsunspor'u da bulan
-- yöntem). Hepsinin kendi doğru TM crest'i medyada mirror'lı ve md5 ile şu anki
-- yanlış görselden FARKLI olduğu doğrulandı; public URL'ler HTTP 200 döner.
--
-- Fix: logo_url'i kulübün KENDİ mirror'ına çek (media/clubs/{id}.png = o TM
-- id'sinin doğru crest'i). id + isim kontrolü ile YALNIZ hedef kulübe dokunur;
-- tekrar çalıştırmak güvenlidir. Sunucu kodu/deploy DEĞİŞMEZ; sadece veri.
--
-- NOT (yanlış alarm, dokunulmadı): "Lokomotiva" (id 22365, Rusya) taramada çıktı
-- ama aslında Lokomotiv Moscow'un kendisi (kısa ad); api-sports 597 logosu DOĞRU.
--
-- Uygulama (sunucuda, deployer):
--   cd /opt/crossover
--   docker exec -i crossover-db-1 psql -U crossover -d crossover < deploy/club-logo-mismatch-fixes.sql

UPDATE clubs SET logo_url = 'https://crossoverfootball.com/media/clubs/1005.png'  WHERE id = 1005  AND name ILIKE 'Lecce';         -- şu an: Lecco (Calcio Lecco 1912)
UPDATE clubs SET logo_url = 'https://crossoverfootball.com/media/clubs/62.png'    WHERE id = 62    AND name ILIKE 'Slavia Praha';  -- şu an: Sparta Prague (ezeli rakip)
UPDATE clubs SET logo_url = 'https://crossoverfootball.com/media/clubs/1386.png'  WHERE id = 1386  AND name ILIKE 'Reggina';       -- şu an: Reggiana (A.C. Reggiana 1919)
UPDATE clubs SET logo_url = 'https://crossoverfootball.com/media/clubs/41231.png' WHERE id = 41231 AND name ILIKE 'FC Sochi';      -- şu an: Sochaux (FC Sochaux-Montbéliard)
UPDATE clubs SET logo_url = 'https://crossoverfootball.com/media/clubs/4654.png'  WHERE id = 4654  AND name ILIKE 'FK Zvezdara';   -- şu an: Crvena zvezda (Red Star)

-- Doğrulama (fix sonrası hepsi kendi mirror'ına işaret etmeli):
SELECT id, name, logo_url FROM clubs WHERE id IN (1005, 62, 1386, 41231, 4654) ORDER BY name;
