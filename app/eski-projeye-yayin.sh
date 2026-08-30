#!/usr/bin/env bash
# =============================================================================
# ESKİ PROJEYE OTA YAYINI (2026-08-30)
# =============================================================================
# NEDEN: App Store'daki build 148 (27 Ağustos) ESKİ EAS projesiyle derlendi.
# 29 Ağustos'ta Play imza sorunu yüzünden proje ygzkrblt1 → ygzkrblt'ye geri
# alındı ve updates.url de değişti. Sonuç: mağazadaki uygulama
#   u.expo.dev/a4d757a9-...  (eski)
# adresine bakarken, yayınlar
#   u.expo.dev/fff58543-...  (yeni)
# adresine gidiyor. Mağaza kullanıcıları 28 Ağustos'ta donmuş durumda.
#
# BU BETİK: app.json'ı geçici olarak ESKİ projeye çevirir, yayını yapar ve
# dosyayı MUTLAKA eski haline döndürür (trap ile — hata/iptal olsa bile).
#
# ÖN KOŞUL: `npx eas login` ile ygzkrblt1 hesabına giriş yapılmış olmalı.
#           (Yeni projeye yayın için tekrar ygzkrblt'ye dönmek gerekir.)
#
# KALICI ÇÖZÜM DEĞİLDİR: yeni bir App Store derlemesi çıkana kadar geçerli
# köprüdür. Yeni derleme yayınlanınca bu betik SİLİNMELİDİR.
set -euo pipefail
cd "$(dirname "$0")"

ESKI_ID="a4d757a9-39bc-4806-a64a-0d671b946bbe"
ESKI_OWNER="ygzkrblt1"
MESAJ="${1:-mağaza kullanıcıları için köprü yayını}"

hesap="$(npx eas whoami 2>/dev/null | head -1 || echo bilinmiyor)"
if [ "$hesap" != "$ESKI_OWNER" ]; then
  echo "DURDU: EAS hesabı '$hesap' — '$ESKI_OWNER' olmalı."
  echo "Önce şunu çalıştır:  npx eas login"
  exit 1
fi

cp app.json app.json.yedek
geri_al() { mv -f app.json.yedek app.json 2>/dev/null || true; echo "app.json geri alındı."; }
trap geri_al EXIT

python3 - "$ESKI_ID" "$ESKI_OWNER" <<'PY'
import json, sys
eski_id, eski_owner = sys.argv[1], sys.argv[2]
d = json.load(open('app.json'))
e = d['expo']
e['owner'] = eski_owner
e.setdefault('extra', {}).setdefault('eas', {})['projectId'] = eski_id
e.setdefault('updates', {})['url'] = f'https://u.expo.dev/{eski_id}'
json.dump(d, open('app.json', 'w'), indent=2, ensure_ascii=False)
print('app.json geçici olarak ESKİ projeye çevrildi:', eski_id)
PY

EAS_SKIP_AUTO_FINGERPRINT=1 npx eas update \
  --branch production --environment production \
  --message "$MESAJ" --non-interactive
