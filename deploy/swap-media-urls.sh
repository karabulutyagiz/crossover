#!/usr/bin/env bash
# Point clubs.logo_url / players.image_url at our own mirror instead of
# Transfermarkt's CDN.
#
# RUN THIS ONLY AFTER mirror-media.sh has finished and the media route is
# verified — it is what users actually see. A row is rewritten ONLY when the
# mirrored file really exists on disk, so a partial mirror can never turn a
# working Transfermarkt URL into a 404.
#
# The app needs no rebuild: it renders whatever URL the server sends.
#
# Usage:  bash /opt/crossover/deploy/swap-media-urls.sh          (dry run)
#         bash /opt/crossover/deploy/swap-media-urls.sh --apply
#         bash /opt/crossover/deploy/swap-media-urls.sh --rollback
set -uo pipefail

ROOT=/opt/crossover/media
BASE=https://crossoverfootball.com/media
MODE=${1:-dry}

psql_q() { docker exec crossover-db-1 psql -U crossover -d crossover -tAc "$1"; }
psql_x() { docker exec crossover-db-1 psql -U crossover -d crossover -c "$1"; }

if [ "$MODE" = "--rollback" ]; then
  echo "→ geri alınıyor (yedek sütunlardan)…"
  psql_x "UPDATE clubs   SET logo_url  = logo_url_tm  WHERE logo_url_tm  IS NOT NULL;"
  psql_x "UPDATE players SET image_url = image_url_tm WHERE image_url_tm IS NOT NULL;"
  echo "  tamam — URL'ler Transfermarkt'a döndü"
  exit 0
fi

# Keep the original CDN URLs in their own columns. Without this a rollback would
# mean re-ingesting everything just to undo a URL rewrite.
psql_x "ALTER TABLE clubs   ADD COLUMN IF NOT EXISTS logo_url_tm  TEXT;" >/dev/null
psql_x "ALTER TABLE players ADD COLUMN IF NOT EXISTS image_url_tm TEXT;" >/dev/null
psql_x "UPDATE clubs   SET logo_url_tm  = logo_url  WHERE logo_url_tm  IS NULL AND logo_url  IS NOT NULL;" >/dev/null
psql_x "UPDATE players SET image_url_tm = image_url WHERE image_url_tm IS NULL AND image_url IS NOT NULL;" >/dev/null

# Build the list of ids we actually hold a file for.
: > /tmp/have_clubs.txt; : > /tmp/have_players.txt
for f in "$ROOT"/clubs/*; do [ -e "$f" ] || continue; b=$(basename "$f"); echo "${b%.*}|${b##*.}" >> /tmp/have_clubs.txt; done
for f in "$ROOT"/players/*; do [ -e "$f" ] || continue; b=$(basename "$f"); echo "${b%.*}|${b##*.}" >> /tmp/have_players.txt; done
echo "diskte: $(wc -l < /tmp/have_clubs.txt) kulüp, $(wc -l < /tmp/have_players.txt) oyuncu görseli"

if [ "$MODE" != "--apply" ]; then
  echo
  echo "KURU ÇALIŞMA — hiçbir şey değişmedi."
  echo "  şu an TM'ye bakan kulüp : $(psql_q "SELECT count(*) FROM clubs   WHERE logo_url  LIKE 'http%' AND logo_url  NOT LIKE '%crossoverfootball%'")"
  echo "  şu an TM'ye bakan oyuncu: $(psql_q "SELECT count(*) FROM players WHERE image_url LIKE 'http%' AND image_url NOT LIKE '%crossoverfootball%'")"
  echo "  uygulamak için: --apply"
  exit 0
fi

echo "→ URL'ler çevriliyor…"
docker cp /tmp/have_clubs.txt   crossover-db-1:/tmp/have_clubs.txt
docker cp /tmp/have_players.txt crossover-db-1:/tmp/have_players.txt
psql_x "
CREATE TEMP TABLE have_c (id BIGINT, ext TEXT);
COPY have_c FROM '/tmp/have_clubs.txt' WITH (FORMAT csv, DELIMITER '|');
UPDATE clubs c SET logo_url = '$BASE/clubs/' || h.id || '.' || h.ext
  FROM have_c h WHERE c.id = h.id;
"
psql_x "
CREATE TEMP TABLE have_p (id BIGINT, ext TEXT);
COPY have_p FROM '/tmp/have_players.txt' WITH (FORMAT csv, DELIMITER '|');
UPDATE players p SET image_url = '$BASE/players/' || h.id || '.' || h.ext
  FROM have_p h WHERE p.id = h.id;
"
echo "  kendi sunucumuza bakan kulüp : $(psql_q "SELECT count(*) FROM clubs   WHERE logo_url  LIKE '%crossoverfootball%'")"
echo "  kendi sunucumuza bakan oyuncu: $(psql_q "SELECT count(*) FROM players WHERE image_url LIKE '%crossoverfootball%'")"
echo "geri almak için: bash $0 --rollback"
