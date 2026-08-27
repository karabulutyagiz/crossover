-- samsunspor-logo-fix.sql (2026-08-28)
--
-- HATA: Samsunspor (clubs.id = 152) yanlışlıkla GİRESUNSPOR'un logosunu
-- gösteriyordu. Aktif logo_url, Giresunspor'un api-sports id'sine işaret ediyordu:
--   logo_url = https://media.api-sports.io/football/teams/3574.png   (3574 = Giresunspor)
--
-- Doğru Samsunspor crest'i zaten kendi medya sunucumuzda mirror'lı (TM
-- wappen/152.png'den çekilmiş) ve yedek kolon logo_url_tm de doğru TM URL'ini
-- (https://tmssl.akamaized.net/images/wappen/big/152.png) tutuyor. md5 ile
-- doğrulandı: media/clubs/152.png, hem Giresunspor mirror'ından hem de api-sports
-- 3574'ten FARKLI. Public URL HTTP 200 döner (20914 byte).
--
-- Uygulama (sunucuda, deployer):
--   cd /opt/crossover
--   docker exec -i crossover-db-1 psql -U crossover -d crossover < deploy/samsunspor-logo-fix.sql
--
-- Not: id=152 + isim kontrolü ile YALNIZ Samsunspor'a dokunur; tekrar çalıştırmak
-- güvenlidir (aynı doğru URL'i yazar). Sunucu kodu/deploy'u DEĞİŞMEZ; sadece veri.

UPDATE clubs
   SET logo_url = 'https://crossoverfootball.com/media/clubs/152.png'
 WHERE id = 152
   AND name ILIKE 'samsunspor';

-- Doğrulama (fix sonrası logo_url yeni URL olmalı):
SELECT id, name, logo_url FROM clubs WHERE id = 152;
