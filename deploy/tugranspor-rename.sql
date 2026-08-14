BEGIN;

INSERT INTO clubs (id, name, name_norm, country, is_national, aliases, logo_url, league)
VALUES (
  5743,
  'Tuğranspor',
  'tugranspor turan spor turanspor sekerspor seker spor etimesgut sekerspor',
  'Türkiye',
  false,
  ARRAY['turan spor', 'turanspor', 'sekerspor', 'seker spor', 'etimesgut sekerspor']::text[],
  'https://tmssl.akamaized.net//images/wappen/big/5743.png',
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

COMMIT;

SELECT id, name, name_norm, aliases, logo_url
  FROM clubs
 WHERE id = 5743;
