#!/usr/bin/env bash
# Mirror club crests and player portraits off Transfermarkt's CDN onto our own
# server.
#
# WHY: clubs.logo_url / players.image_url currently hotlink
# tmssl.akamaized.net and img.a.transfermarkt.technology. That makes every badge
# and portrait in the app depend on a third party's CDN — if they add referer
# checks or rate-limit us, every image breaks at once, including during an App
# Store review (which reads as a broken app). It also uses their bandwidth
# without permission.
#
# This ONLY downloads. It does not touch the database — swapping the URLs is a
# separate, deliberate step, so a half-finished mirror can never break the live
# app. Re-running skips files that already exist, so it is resumable.
#
# Usage (on the server):  bash /opt/crossover/deploy/mirror-media.sh [workers]
set -uo pipefail

ROOT=/opt/crossover/media
WORKERS=${1:-4}
DELAY=${DELAY:-0.15}   # politeness pause per request, per worker

mkdir -p "$ROOT/clubs" "$ROOT/players"

psql_q() {
  docker exec crossover-db-1 psql -U crossover -d crossover -tAc "$1"
}

# id<TAB>url so the file name is the stable DB id, not a hash of the URL —
# re-ingesting with a new CDN path then reuses the same local file.
echo "→ URL listeleri çekiliyor…"
psql_q "SELECT id || E'\t' || logo_url FROM clubs WHERE logo_url IS NOT NULL AND logo_url NOT LIKE '%crossoverfootball.com%'" > /tmp/mirror_clubs.tsv
psql_q "SELECT id || E'\t' || image_url FROM players WHERE image_url IS NOT NULL AND image_url NOT LIKE '%crossoverfootball.com%'" > /tmp/mirror_players.tsv
echo "  kulüp: $(wc -l < /tmp/mirror_clubs.tsv)  oyuncu: $(wc -l < /tmp/mirror_players.tsv)"

fetch_one() {
  local kind="$1" id="$2" url="$3" ext out
  case "$url" in *.png*) ext=png ;; *.jpg*|*.jpeg*) ext=jpg ;; *) ext=png ;; esac
  out="$ROOT/$kind/$id.$ext"
  [ -s "$out" ] && return 0                      # already mirrored — resumable
  # -f: treat 4xx/5xx as failure so a stray error page never lands as an image.
  if curl -sSf -m 25 -o "$out.part" "$url" 2>/dev/null && [ -s "$out.part" ]; then
    mv "$out.part" "$out"
  else
    rm -f "$out.part"
    echo "$kind $id $url" >> "$ROOT/failed.log"
  fi
  sleep "$DELAY"
}
export -f fetch_one
export ROOT DELAY

run_kind() {
  local kind="$1" file="$2" total done_
  total=$(wc -l < "$file")
  echo "→ $kind indiriliyor ($total)…"
  # xargs -P gives bounded parallelism; each worker still pauses, so the CDN
  # sees at most WORKERS/DELAY requests per second.
  awk -F'\t' -v k="$kind" '{print k"\t"$1"\t"$2}' "$file" \
    | xargs -P "$WORKERS" -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r k i u <<< "{}"; fetch_one "$k" "$i" "$u"'
  done_=$(find "$ROOT/$kind" -type f ! -name '*.part' | wc -l)
  echo "  $kind bitti: $done_ dosya"
}

run_kind clubs /tmp/mirror_clubs.tsv
run_kind players /tmp/mirror_players.tsv

echo
echo "=== ÖZET ==="
echo "  kulüp  : $(find "$ROOT/clubs" -type f ! -name '*.part' | wc -l) dosya"
echo "  oyuncu : $(find "$ROOT/players" -type f ! -name '*.part' | wc -l) dosya"
echo "  boyut  : $(du -sh "$ROOT" | cut -f1)"
[ -f "$ROOT/failed.log" ] && echo "  başarısız: $(wc -l < "$ROOT/failed.log") (failed.log)" || echo "  başarısız: 0"
echo
echo "DB URL'leri DEĞİŞTİRİLMEDİ. Servisi doğruladıktan sonra swap adımını çalıştır."
