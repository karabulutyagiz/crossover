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
-- appearance in the shirt counts). Names COLLIDE across countries ("Arsenal
-- FC" = Arsenal de Sarandí!), so: variant strip (youth token, then fc/cf/fk/sk),
-- country-gated when known (most popular same-country parent), single-candidate
-- only when country is NULL. Mirrors deploy/repoint-youth-clubs.sql.
WITH youth AS (
  SELECT c.id AS child_id, c.country,
         trim(regexp_replace(c.name_norm,
           '\s*(u-?[0-9]{1,2}|b|ii|iii|reserves?|castilla|primavera|jong|amateure)\s*$', '')) AS v1
    FROM clubs c
   WHERE c.name_norm ~ '(\mu-?[0-9]{1,2}$|\mii$|\miii$|\mb$|reserves?$|castilla$|primavera$|amateure$)'
), variants AS (
  SELECT child_id, country, v1 AS parent_norm FROM youth
  UNION
  SELECT child_id, country,
         trim(regexp_replace(v1, '(^(fc|cf|fk|sk)\s+|\s+(fc|cf|fk|sk)$)', ''))
    FROM youth
   WHERE trim(regexp_replace(v1, '(^(fc|cf|fk|sk)\s+|\s+(fc|cf|fk|sk)$)', '')) <> v1
), cands AS (
  SELECT v.child_id, v.country AS child_country, p.id AS parent_id,
         p.country AS parent_country, p.popularity
    FROM variants v
    JOIN clubs p ON p.name_norm = v.parent_norm AND p.id <> v.child_id
), map AS (
  (SELECT DISTINCT ON (child_id) child_id, parent_id
     FROM cands
    WHERE child_country IS NOT NULL AND parent_country = child_country
    ORDER BY child_id, popularity DESC)
  UNION ALL
  (SELECT child_id, min(parent_id)
     FROM cands
    WHERE child_country IS NULL
    GROUP BY child_id
   HAVING count(DISTINCT parent_id) = 1)
)
UPDATE player_clubs pc
   SET club_id = m.parent_id
  FROM map m
 WHERE pc.club_id = m.child_id;

-- Curated legends re-merge: deploy/legends.sql seeds persistent legends_*
-- source tables (players TM can no longer give us — bot wall). They live
-- OUTSIDE the tm_* staging, so every future swap re-merges them here.
-- No-op until legends.sql has been applied once.
DO $$
BEGIN
  IF to_regclass('legends_players') IS NOT NULL THEN
    EXECUTE $m$
      INSERT INTO clubs (id, name, name_norm, country)
      SELECT lc.id, lc.name, lc.name_norm, lc.country FROM legends_clubs lc
      WHERE NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id = lc.id OR c.name_norm = lc.name_norm);

      INSERT INTO players (id, name, name_norm, birth_year, nationality)
      SELECT lp.id, lp.name, lp.name_norm, lp.birth_year, lp.nationality FROM legends_players lp
      WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = lp.id); -- id-only: namesakes are legitimate

      INSERT INTO player_clubs (player_id, club_id, start_year, end_year)
      SELECT ls.player_id,
             COALESCE((SELECT c2.id FROM clubs c2 JOIN legends_clubs lc2 ON lc2.id = ls.club_id
                        WHERE c2.name_norm = lc2.name_norm LIMIT 1), ls.club_id),
             ls.start_year, ls.end_year
        FROM legends_spells ls
       WHERE EXISTS (SELECT 1 FROM players p WHERE p.id = ls.player_id)
         AND NOT EXISTS (SELECT 1 FROM player_clubs pc
                          WHERE pc.player_id = ls.player_id AND pc.club_id = ls.club_id
                            AND pc.start_year IS NOT DISTINCT FROM ls.start_year);
    $m$;
  END IF;
END $$;

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
