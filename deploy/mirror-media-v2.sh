#!/usr/bin/env bash
# Medya felaket kurtarması: /opt/crossover/media boşaldı (muhtemel rsync --delete
# kazası) ve canlı tablolardaki URL'ler çoktan kendi alanımıza çevrildiği için
# mirror-media.sh'nin kaynak listesi de boş kalıyor.
#
# Bu sürüm orijinal TM CDN URL'lerini tm_* STAGING tablolarından okur
# (tm_clubs.logo_url: ~7.175, tm_players.image_url: ~26.007) ve dosyaları
# canlı tablodaki id ile eşleyerek indirir. Yalnız İNDİRİR — DB'ye dokunmaz.
# Yeniden çalıştırılabilir (var olan dosya atlanır).
#
# Kullanım (sunucuda):  bash /opt/crossover/deploy/mirror-media-v2.sh [workers]
set -uo pipefail

ROOT=/opt/crossover/media
WORKERS=${1:-4}
DELAY=${DELAY:-0.15}

mkdir -p "$ROOT/clubs" "$ROOT/players"

psql_q() {
  docker exec crossover-db-1 psql -U crossover -d crossover -tAc "$1"
}

echo "→ URL listeleri STAGING'den çekiliyor…"
# Canlı tabloda var olan id'lerle sınırla — swap sonrası dosya adı = canlı id.
psql_q "SELECT c.id || E'\t' || t.logo_url FROM tm_clubs t JOIN clubs c ON c.id = t.id
        WHERE t.logo_url IS NOT NULL AND t.logo_url <> ''" > /tmp/mirror_clubs.tsv
psql_q "SELECT p.id || E'\t' || t.image_url FROM tm_players t JOIN players p ON p.id = t.id
        WHERE t.image_url IS NOT NULL AND t.image_url <> ''" > /tmp/mirror_players.tsv
# Canlıda hâlâ TM CDN'e bakan az sayıda kayıt da (60 civarı) listeye eklensin:
psql_q "SELECT id || E'\t' || image_url FROM players
        WHERE image_url LIKE '%tmssl%' OR image_url LIKE '%transfermarkt%'" >> /tmp/mirror_players.tsv
echo "  kulüp: $(wc -l < /tmp/mirror_clubs.tsv)  oyuncu: $(wc -l < /tmp/mirror_players.tsv)"

fetch_one() {
  local kind="$1" id="$2" url="$3" ext out
  case "$url" in *.png*) ext=png ;; *.jpg*|*.jpeg*) ext=jpg ;; *) ext=png ;; esac
  out="$ROOT/$kind/$id.$ext"
  [ -s "$out" ] && return 0
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
  local kind="$1" file="$2" total
  total=$(wc -l < "$file")
  echo "→ $kind indiriliyor ($total)…"
  awk -F'\t' -v k="$kind" '{print k"\t"$1"\t"$2}' "$file" \
    | xargs -P "$WORKERS" -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r k i u <<< "{}"; fetch_one "$k" "$i" "$u"'
  echo "  $kind bitti: $(find "$ROOT/$kind" -type f ! -name '*.part' | wc -l) dosya"
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
echo "DB URL'leri DEĞİŞTİRİLMEDİ (zaten crossoverfootball.com'a bakıyorlar; dosyalar yerine kondu)."
