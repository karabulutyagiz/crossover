-- Replace the live clubs/players/player_clubs tables with the clean Transfermarkt
-- rebuild from the tm_* staging tables. Wrapped in a transaction so the game
-- never sees a half-empty DB. Run AFTER tm-rebuild has finished and been verified.
--
-- Only keep: clubs with a name; players who have >=1 senior club spell; spells
-- whose club and player both survive (FK-safe).
BEGIN;

TRUNCATE player_clubs, players, clubs;

INSERT INTO clubs (id, name, name_norm, country, is_national, logo_url, league)
SELECT id, name, name_norm, country, COALESCE(is_national, false), logo_url, league
FROM tm_clubs
WHERE name IS NOT NULL AND name_norm IS NOT NULL AND name_norm <> '';

INSERT INTO players (id, name, name_norm, birth_year, nationality, image_url)
SELECT p.id, p.name, p.name_norm, p.birth_year, p.nationality, p.image_url
FROM tm_players p
WHERE p.name IS NOT NULL AND p.name_norm IS NOT NULL AND p.name_norm <> ''
  AND EXISTS (
    SELECT 1 FROM tm_player_clubs pc
    JOIN clubs c ON c.id = pc.club_id
    WHERE pc.player_id = p.id
  );

INSERT INTO player_clubs (player_id, club_id, start_year, end_year)
SELECT pc.player_id, pc.club_id, pc.start_year, pc.end_year
FROM tm_player_clubs pc
JOIN players pl ON pl.id = pc.player_id
JOIN clubs cl ON cl.id = pc.club_id
ON CONFLICT (player_id, club_id, (COALESCE(start_year, -1))) DO NOTHING;

-- Restore Turkish characters (Transfermarkt's English site ASCII-izes them).
UPDATE clubs SET name =
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
   name,
   'Besiktas','Beşiktaş'),'Fenerbahce','Fenerbahçe'),'Caykur','Çaykur'),
   'Genclerbirligi','Gençlerbirliği'),'Basaksehir','Başakşehir'),'Kasimpasa','Kasımpaşa'),
   'Eskisehir','Eskişehir'),'Eyupspor','Eyüpspor'),'Elazig','Elazığ'),
   'Karsiyaka','Karşıyaka'),'Sariyer','Sarıyer'),'Diyarbakir','Diyarbakır'),
   'Canakkale','Çanakkale'),'Bakirköy','Bakırköy'),'Bartin','Bartın'),
   'Gaziosmanpasa','Gaziosmanpaşa'),'Kusadasi','Kuşadası'),'Mugla','Muğla'),
   'Corum','Çorum'),'Umraniye','Ümraniye'),'Bandirma','Bandırma'),
   'Sanliurfa','Şanlıurfa'),'Igdir','Iğdır'),'Keciorengucu','Keçiörengücü'),
   'Kahramanmaras','Kahramanmaraş'),'Usakspor','Uşakspor'),'Aydinspor','Aydınspor'),
   'Balikesir','Balıkesir'),'Kirklareli','Kırklareli'),'Inegöl','İnegöl')
WHERE country = 'Türkiye';

-- Youth/reserve spells count toward the PARENT club (user rule: any official
-- appearance in the shirt counts — TM logs e.g. Özyakup's Arsenal years under
-- "Arsenal FC U21", which broke Beşiktaş–Arsenal rounds). Conservative: strip
-- one trailing youth token, require an EXACT parent name match, leave the rest.
-- Mirrors deploy/repoint-youth-clubs.sql (the one-off prod migration).
WITH youth AS (
  SELECT c.id AS child_id,
         trim(regexp_replace(c.name_norm,
           '\s*(u-?[0-9]{1,2}|b|ii|iii|reserves?|castilla|primavera|jong|amateure)\s*$', '')) AS parent_norm
    FROM clubs c
   WHERE c.name_norm ~ '(\mu-?[0-9]{1,2}$|\mii$|\miii$|\mb$|reserves?$|castilla$|primavera$|amateure$)'
), map AS (
  SELECT y.child_id, p.id AS parent_id
    FROM youth y
    JOIN clubs p ON p.name_norm = y.parent_norm AND p.id <> y.child_id
)
UPDATE player_clubs pc
   SET club_id = m.parent_id
  FROM map m
 WHERE pc.club_id = m.child_id;

-- Popularity = number of players per club (bot difficulty + search ranking).
UPDATE clubs SET popularity = sub.n
FROM (SELECT club_id, count(*) AS n FROM player_clubs GROUP BY club_id) sub
WHERE clubs.id = sub.club_id;

-- Summary
SELECT
  (SELECT count(*) FROM clubs)        AS clubs,
  (SELECT count(*) FROM players)      AS players,
  (SELECT count(*) FROM player_clubs) AS spells,
  (SELECT count(*) FROM clubs WHERE logo_url IS NOT NULL) AS clubs_with_logo,
  (SELECT count(*) FROM players WHERE image_url IS NOT NULL) AS players_with_photo;

COMMIT;
