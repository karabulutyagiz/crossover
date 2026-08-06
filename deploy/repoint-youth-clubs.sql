-- Youth/reserve spells count toward the PARENT club.
--
-- WHY (user rule): "1 dakika bile o takımın formasıyla resmî maça çıktıysa
-- sayılsın." Transfermarkt logs some first-team careers under the youth/B
-- entity — e.g. Oğuzhan Özyakup's Arsenal years are the club "Arsenal FC U21",
-- so a Beşiktaş–Arsenal round rejected him.
--
-- SELF-CORRECTING & IDEMPOTENT: the first run snapshots player_clubs into
-- player_clubs_bak_20260806; EVERY run restores from that snapshot before
-- mapping, so re-running (or running a fixed version) always converges.
-- ROLLBACK: TRUNCATE player_clubs; INSERT INTO player_clubs SELECT * FROM player_clubs_bak_20260806;
--
-- Parent resolution — names COLLIDE across countries ("Arsenal FC" is Arsenal
-- de Sarandí (AR), NOT London Arsenal (id 11, name "Arsenal")!), so:
--   * name variants: youth token stripped, plus an extra fc/cf/fk/sk strip
--     ("arsenal fc u21" -> "arsenal fc" -> "arsenal");
--   * child has a country  -> parent must share it; most popular wins;
--   * child country is NULL -> map only when there is EXACTLY ONE candidate.

BEGIN;

CREATE TABLE IF NOT EXISTS player_clubs_bak_20260806 AS SELECT * FROM player_clubs;
TRUNCATE player_clubs;
INSERT INTO player_clubs SELECT * FROM player_clubs_bak_20260806;

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
  -- country known: same-country candidates only, most popular wins
  (SELECT DISTINCT ON (child_id) child_id, parent_id
     FROM cands
    WHERE child_country IS NOT NULL AND parent_country = child_country
    ORDER BY child_id, popularity DESC)
  UNION ALL
  -- country unknown: unambiguous single candidate only
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

COMMIT;

-- Smoke: Özyakup must list the LONDON Arsenal (id 11), never Arsenal de Sarandí (4673).
SELECT c.id, c.name, c.country, pc.start_year, pc.end_year
  FROM player_clubs pc JOIN clubs c ON c.id = pc.club_id
 WHERE pc.player_id = 77966
 ORDER BY pc.start_year;
