#!/usr/bin/env python3
"""Google Play ürünlerini API ile toplu oluşturur (2026-08-29).

Android'de satın alma için Play Console'da ürün tanımı ŞART. Bu script 7 tek
seferlik ürünü ve 2 aboneliği tek seferde kurar — Console'da elle girmeye gerek
kalmaz. Idempotent: var olan ürünü günceller (allowMissing=true ile upsert).

Fiyatlar iOS ile AYNI tutulur (app/src/screens.tsx DIAMOND_PACKS + SOCIAL_PACK
ve server/src/game/iap.ts ANDROID_PRICE_MILLIUNITS_TRY ile birebir).

ÖN KOŞUL:
  * app/play-service-account.json (Google service account anahtarı)
  NOT: Tek seferlik ürünlerin ucu monetization/onetimeproducts'tır (eski
  inappproducts kullanımdan kalktı, oneTimeProducts diye bir yol YOK — 404).
  * Service account'a Play Console'da yönetici/finans izni verilmiş olmalı
  * Projede Google Play Android Developer API etkin olmalı

Çalıştır:  python3 playstore/create-products.py
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import jwt  # PyJWT
except ImportError:
    print("PyJWT gerekli:  pip3 install pyjwt cryptography")
    raise SystemExit(1)

PKG = "com.crossover.football"
KEY_PATH = Path(__file__).resolve().parent.parent / "app" / "play-service-account.json"
BASE = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PKG}"
REGIONS_VERSION = "2022/02"

# (productId, başlık, açıklama, lira, kuruş)
ONE_TIME = [
    ("com.crossover.diamonds.100", "100 Elmas", "Oyun içi 100 elmas.", 29, 990),
    ("com.crossover.diamonds.500", "500 Elmas", "Oyun içi 500 elmas.", 79, 990),
    ("com.crossover.diamonds.1200", "1.200 Elmas", "Oyun içi 1.200 elmas.", 149, 990),
    ("com.crossover.diamonds.5000", "5.000 Elmas", "Oyun içi 5.000 elmas.", 449, 990),
    ("com.crossover.diamonds.15000", "15.000 Elmas", "Oyun içi 15.000 elmas.", 999, 990),
    ("com.crossover.diamonds.50000", "50.000 Elmas", "Oyun içi 50.000 elmas.", 2499, 990),
    ("com.crossover.copass", "CO Pass", "Premium Seviye Yolu'nu bu sezon için açar.", 349, 990),
]

# (productId, ad, açıklama, lira, kuruş, ISO 8601 dönem)
SUBSCRIPTIONS = [
    ("com.crossover.socialpack.weekly", "Sosyal Paket (Haftalık)",
     "Arkadaşlarınla Ülke-Takım, Harf-Takım ve Futbol XOX oyna — reklamsız.", 39, 990, "P1W"),
    ("com.crossover.socialpack.monthly", "Sosyal Paket (Aylık)",
     "Arkadaşlarınla Ülke-Takım, Harf-Takım ve Futbol XOX oyna — reklamsız.", 79, 990, "P1M"),
]


def access_token() -> str:
    sa = json.loads(KEY_PATH.read_text())
    now = int(time.time())
    assertion = jwt.encode(
        {"iss": sa["client_email"], "scope": "https://www.googleapis.com/auth/androidpublisher",
         "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600},
        sa["private_key"], algorithm="RS256")
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}).encode()
    with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=body), timeout=30) as r:
        return json.load(r)["access_token"]


def call(method: str, url: str, token: str, payload: dict | None = None) -> tuple[int, str]:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, r.read().decode()[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]


def money(lira: int, kurus: int) -> dict:
    return {"currencyCode": "TRY", "units": str(lira), "nanos": kurus * 1_000_000}


def create_one_time(token: str) -> int:
    """Tek seferlik ürünleri TEK batch isteğiyle kurar.

    UÇ NOTU (deneyerek doğrulandı 2026-08-29): tekil PATCH yolu YOK
    (/oneTimeProducts/{id} yalnız GET'i destekler, PATCH'te HTML 404 döner) ve
    dokümandaki /monetization/onetimeproducts bu sürümde hiç yok. Çalışan tek
    yazma yolu:  POST /oneTimeProducts:batchUpdate
    İstek gövdesi sarmalayıcıdır: her öğe {oneTimeProduct, updateMask,
    allowMissing, regionsVersion} taşır; packageName/productId sarmalın DIŞINDA
    değil, oneTimeProduct'ın İÇİNDE olur.
    """
    requests_payload = []
    for pid, title, desc, lira, kurus in ONE_TIME:
        requests_payload.append({
            "oneTimeProduct": {
                "packageName": PKG,
                "productId": pid,
                "listings": [{"languageCode": "tr-TR", "title": title, "description": desc}],
                "purchaseOptions": [{
                    "purchaseOptionId": "base",
                    "buyOption": {"legacyCompatible": True, "multiQuantityEnabled": False},
                    "regionalPricingAndAvailabilityConfigs": [{
                        "regionCode": "TR",
                        "price": money(lira, kurus),
                        "availability": "AVAILABLE",
                    }],
                }],
            },
            "updateMask": "listings,purchaseOptions",
            "allowMissing": True,
            "regionsVersion": {"version": REGIONS_VERSION},
        })
    status, body = call("POST", f"{BASE}/oneTimeProducts:batchUpdate", token,
                        {"requests": requests_payload})
    if status in (200, 201):
        for pid, _t, _d, lira, kurus in ONE_TIME:
            print(f"OK   {pid:38} ₺{lira},{kurus // 10:02d}")
        return 0
    print(f"HATA (batch) {status} → {body[:400]}")
    return 1


def create_subscriptions(token: str) -> int:
    failed = 0
    for pid, name, desc, lira, kurus, period in SUBSCRIPTIONS:
        params = urllib.parse.urlencode({
            "productId": pid,
            "regionsVersion.version": REGIONS_VERSION,
        })
        payload = {
            "packageName": PKG,
            "productId": pid,
            "listings": [{"languageCode": "tr-TR", "title": name, "description": desc}],
            "basePlans": [{
                "basePlanId": "base",
                "autoRenewingBasePlanType": {
                    "billingPeriodDuration": period,
                    "gracePeriodDuration": "P3D",
                    "resubscribeState": "RESUBSCRIBE_STATE_ACTIVE",
                },
                "regionalConfigs": [{
                    "regionCode": "TR",
                    "newSubscriberAvailability": True,
                    "price": money(lira, kurus),
                }],
            }],
        }
        status, body = call("POST", f"{BASE}/subscriptions?{params}", token, payload)
        if status in (200, 201):
            print(f"OK   {pid:38} ₺{lira},{kurus // 10:02d} / {period}")
        elif status == 409:
            print(f"VAR  {pid:38} (zaten tanımlı)")
        else:
            failed += 1
            print(f"HATA {pid:38} {status} → {body[:220]}")
            continue
        # Yeni oluşan taban plan DRAFT gelir — AKTİVE edilmeden satılamaz.
        # activate gövdesi regionsVersion KABUL ETMEZ (400 "Unknown name").
        act, abody = call(
            "POST", f"{BASE}/subscriptions/{pid}/basePlans/base:activate", token,
            {"packageName": PKG, "productId": pid, "basePlanId": "base"})
        if act in (200, 201):
            print(f"     └─ taban plan AKTİF ✅")
        else:
            failed += 1
            print(f"     └─ aktivasyon HATASI {act} → {abody[:200]}")
    return failed


def main() -> int:
    if not KEY_PATH.exists():
        print(f"Anahtar yok: {KEY_PATH}")
        return 1
    token = access_token()
    print("=== TEK SEFERLİK ÜRÜNLER ===")
    failed = create_one_time(token)
    print("\n=== ABONELİKLER ===")
    failed += create_subscriptions(token)
    print("\nNOT: Ürünler oluştuktan sonra Play Console'da her birinin ETKİN "
          "(active) duruma alınması gerekebilir.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
