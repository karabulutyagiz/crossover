-- Youth/reserve spells count toward the PARENT club.
--
-- WHY (user rule): "1 dakika bile o takımın formasıyla resmî maça çıktıysa
-- sayılsın." Transfermarkt logs some first-team careers under the youth/B
-- entity — e.g. Oğuzhan Özyakup's Arsenal years are the club "Arsenal FC U21"
-- (id 9899-class rows), so a Beşiktaş–Arsenal round rejected him. Re-pointing
-- the spell rows to the parent club fixes membership for EVERY such player at
-- once; the A_TEAM_ONLY search filter already hides the youth entities from
-- pickers, so nothing else references them.
--
-- Safety: full copy of player_clubs is kept in player_clubs_bak_20260806.
-- ROLLBACK: TRUNCATE player_clubs; INSERT INTO player_clubs SELECT * FROM player_clubs_bak_20260806;
--
-- Parent resolution is conservative: strip ONE trailing youth/reserve token
-- from name_norm and require an EXACT existing club with that name — no fuzzy
-- matching, unmapped youth clubs are left untouched.

BEGIN;

CREATE TABLE IF NOT EXISTS player_clubs_bak_20260806 AS SELECT * FROM player_clubs;

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

COMMIT;

-- Smoke check: Özyakup must now list Arsenal FC (the parent), not the U21 row.
SELECT c.name, pc.start_year, pc.end_year
  FROM player_clubs pc JOIN clubs c ON c.id = pc.club_id
 WHERE pc.player_id = 77966
 ORDER BY pc.start_year;
