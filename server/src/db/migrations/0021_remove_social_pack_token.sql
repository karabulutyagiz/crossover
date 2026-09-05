UPDATE users SET power_socialtoken = 0 WHERE power_socialtoken <> 0;
ALTER TABLE users DROP COLUMN IF EXISTS power_socialtoken;
