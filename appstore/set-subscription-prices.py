#!/usr/bin/env python3
"""Sosyal Paket abonelik fiyatlarını güncelle (kullanıcı kararı 2026-08-29).

  HAFTALIK  ₺24,99 → ₺39,99   preserveCurrentPrice=True
            → MEVCUT ABONELER ₺24,99'DA KALIR (kimse kaybedilmez);
              yalnız yeni satın alanlar ₺39,99 öder.
  AYLIK     ₺89,99 → ₺79,99   preserveCurrentPrice=False
            → indirim herkese uygulanır, mevcut aboneler de ucuza geçer.

Yalnız TÜRKİYE (TUR) bölgesi değişir; diğer 174 bölge dokunulmaz.
Çalıştır:  python3 appstore/set-subscription-prices.py
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from asc import req  # noqa: E402

WEEKLY_ID = "6780634890"   # com.crossover.socialpack.weekly
MONTHLY_ID = "6780634817"  # com.crossover.socialpack.monthly

# ASC price point kimlikleri (TUR bölgesi, 2026-08-29'da API'dan okundu).
WEEKLY_39_99 = "eyJzIjoiNjc4MDYzNDg5MCIsInQiOiJUVVIiLCJwIjoiMTAwNTcifQ"   # gelir ₺22,16
MONTHLY_79_99 = "eyJzIjoiNjc4MDYzNDgxNyIsInQiOiJUVVIiLCJwIjoiMTAxMTcifQ"  # gelir ₺44,33

PLANS = [
    ("HAFTALIK ₺24,99 → ₺39,99 (mevcut aboneler korunur)", WEEKLY_ID, WEEKLY_39_99, True),
    ("AYLIK    ₺89,99 → ₺79,99 (indirim herkese)", MONTHLY_ID, MONTHLY_79_99, False),
]


def main() -> int:
    failed = 0
    for label, sub_id, point_id, preserve in PLANS:
        # ASC, startDate'siz isteği "ilk fiyat" sayıp onaylı abonelikte 409 döner.
        # Planlanmış değişiklik için tarih ŞART — yarın yürürlüğe girer.
        start = (date.today() + timedelta(days=1)).isoformat()
        body = {"data": {
            "type": "subscriptionPrices",
            "attributes": {"preserveCurrentPrice": preserve, "startDate": start},
            "relationships": {
                "subscription": {"data": {"type": "subscriptions", "id": sub_id}},
                "subscriptionPricePoint": {"data": {"type": "subscriptionPricePoints", "id": point_id}},
                "territory": {"data": {"type": "territories", "id": "TUR"}},
            },
        }}
        status, data = req("POST", "/v1/subscriptionPrices", body)
        if status in (200, 201):
            print(f"OK   {label}  → id={data['data']['id'][:32]}")
        else:
            failed += 1
            print(f"HATA {label}  → {status} {json.dumps(data)[:400]}")

    print("\n--- DOĞRULAMA (Türkiye güncel fiyatları) ---")
    for name, sub_id in (("HAFTALIK", WEEKLY_ID), ("AYLIK", MONTHLY_ID)):
        status, data = req(
            "GET",
            f"/v1/subscriptions/{sub_id}/prices?include=subscriptionPricePoint&filter[territory]=TUR&limit=10",
        )
        points = {i["id"]: i["attributes"] for i in data.get("included", []) if i["type"] == "subscriptionPricePoints"}
        for price in data.get("data", []):
            point_ref = (price.get("relationships", {}).get("subscriptionPricePoint", {}).get("data") or {}).get("id", "")
            attrs = price["attributes"]
            print(f"  {name}: ₺{points.get(point_ref, {}).get('customerPrice')} "
                  f"| başlangıç: {attrs.get('startDate') or 'hemen'} | koruma: {attrs.get('preserveCurrentPrice')}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
