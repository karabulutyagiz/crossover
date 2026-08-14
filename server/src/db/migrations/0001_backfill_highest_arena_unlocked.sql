-- Existing players should keep arenas they have already reached even if they
-- later drop below the trophy threshold. This backfills only the unlock marker;
-- it does not grant diamonds, so old arena rewards cannot be paid again.
UPDATE users
   SET highest_arena_rewarded = GREATEST(
     COALESCE(highest_arena_rewarded, 0),
     CASE
       WHEN trophies >= 5000 THEN 6
       WHEN trophies >= 3500 THEN 5
       WHEN trophies >= 2000 THEN 4
       WHEN trophies >= 1000 THEN 3
       WHEN trophies >= 500 THEN 2
       WHEN trophies >= 200 THEN 1
       ELSE 0
     END
   );
