BEGIN;

INSERT INTO clubs (id, name, name_norm, country, is_national, aliases, logo_url, league)
VALUES (
  1291,
  'Siirt JetPA Spor',
  'siirt jetpa spor siirtjetpa siirt jet pa siirtspor siirtspor 1969 2014',
  'Türkiye',
  false,
  ARRAY['siirt jetpa', 'siirtjetpa', 'siirt jet pa', 'siirt jetpa spor', 'siirt jet-pa spor']::text[],
  'https://tmssl.akamaized.net//images/wappen/big/1291.png',
  'TR1'
)
ON CONFLICT (id) DO UPDATE
   SET name = EXCLUDED.name,
       name_norm = EXCLUDED.name_norm,
       aliases = (
         SELECT array_agg(DISTINCT a)
           FROM unnest(clubs.aliases || EXCLUDED.aliases) AS t(a)
       ),
       logo_url = COALESCE(clubs.logo_url, EXCLUDED.logo_url),
       country = COALESCE(clubs.country, EXCLUDED.country),
       league = COALESCE(clubs.league, EXCLUDED.league);

INSERT INTO players (id, name, name_norm, birth_year, nationality, image_url)
VALUES (
  6904,
  'Sergen Yalçın',
  'sergen yalcin',
  1972,
  'Türkiye',
  'https://img.a.transfermarkt.technology/portrait/header/6904-1750689958.jpeg?lm=1'
)
ON CONFLICT (id) DO UPDATE
   SET name = EXCLUDED.name,
       name_norm = EXCLUDED.name_norm,
       birth_year = COALESCE(players.birth_year, EXCLUDED.birth_year),
       nationality = COALESCE(players.nationality, EXCLUDED.nationality),
       image_url = COALESCE(players.image_url, EXCLUDED.image_url);

INSERT INTO player_clubs (player_id, club_id, start_year, end_year)
SELECT 6904, 1291, 1999, 2002
 WHERE NOT EXISTS (
   SELECT 1 FROM player_clubs
    WHERE player_id = 6904
      AND club_id = 1291
      AND start_year IS NOT DISTINCT FROM 1999
 );

UPDATE clubs
   SET popularity = sub.n
  FROM (SELECT club_id, count(*) AS n FROM player_clubs WHERE club_id = 1291 GROUP BY club_id) sub
 WHERE clubs.id = sub.club_id;

COMMIT;

SELECT p.name, c.name AS club, pc.start_year, pc.end_year
  FROM players p
  JOIN player_clubs pc ON pc.player_id = p.id
  JOIN clubs c ON c.id = pc.club_id
 WHERE p.id = 6904 AND c.id = 1291;
