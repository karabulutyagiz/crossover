#!/usr/bin/env python3
"""CO Pass (com.crossover.copass, 6797996048) IAP inceleme görselini değiştir.

Eski görsel jenerik "Elmas paketleri" mockup'ıydı — CO Pass'ı hiç göstermiyordu
(IAP reddi riski). Yenisi gerçek mağaza ekranının CO PASS bölümü olmalı.

Kullanım: python3 upload-copass-screenshot.py <png-yolu> [--apply]
--apply yoksa yalnız mevcut durumu gösterir.
"""
import hashlib, sys, pathlib
import asc

IAP_ID = "6797996048"


def errs(d):
    return "; ".join(f"{e.get('title','')}: {e.get('detail','')}" for e in d.get("errors", []))[:200]


st, cur = asc.req("GET", f"/v2/inAppPurchases/{IAP_ID}/appStoreReviewScreenshot")
cur_id = (cur.get("data") or {}).get("id")
print("mevcut gorsel:", cur_id or "YOK",
      "|", ((cur.get("data") or {}).get("attributes") or {}).get("fileName", ""))

if len(sys.argv) < 2 or "--apply" not in sys.argv:
    print("dry-run — degistirmek icin: python3 upload-copass-screenshot.py <png> --apply")
    sys.exit(0)

path = pathlib.Path(sys.argv[1])
data = path.read_bytes()
print(f"yeni gorsel: {path.name} ({len(data):,} bayt)")

if cur_id:
    st, d = asc.req("DELETE", f"/v1/inAppPurchaseAppStoreReviewScreenshots/{cur_id}")
    print("eski silindi:", st, errs(d) if st >= 300 else "")
    if st >= 300:
        sys.exit(1)

st, d = asc.req("POST", "/v1/inAppPurchaseAppStoreReviewScreenshots", {"data": {
    "type": "inAppPurchaseAppStoreReviewScreenshots",
    "attributes": {"fileName": path.name, "fileSize": len(data)},
    "relationships": {"inAppPurchaseV2": {"data": {"type": "inAppPurchases", "id": IAP_ID}}}}})
if st not in (200, 201):
    print("rezervasyon HATA", st, errs(d)); sys.exit(1)
sid = d["data"]["id"]

import urllib.request
for op in d["data"]["attributes"]["uploadOperations"]:
    chunk = data[op["offset"]:op["offset"] + op["length"]]
    rq = urllib.request.Request(op["url"], data=chunk, method=op["method"])
    for h in op["requestHeaders"]:
        rq.add_header(h["name"], h["value"])
    with urllib.request.urlopen(rq, timeout=180):
        pass

st, d = asc.req("PATCH", f"/v1/inAppPurchaseAppStoreReviewScreenshots/{sid}", {"data": {
    "type": "inAppPurchaseAppStoreReviewScreenshots", "id": sid,
    "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}})
print("commit:", st, errs(d) if st >= 300 else "OK", "| yeni id:", sid)
