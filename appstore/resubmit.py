#!/usr/bin/env python3
"""Reddedilmiş bir App Store gönderimini API üzerinden yeniden gönder.

NEDEN AYRI BİR SCRIPT: reddedilen bir reviewSubmission'ı doğrudan
`{submitted: true}` ile PATCH etmek 409 "Version is not ready to be submitted
yet" döndürür ve dakikalarca öyle kalır. Doğru sıra, ÖNCE her REJECTED
reviewSubmissionItem'ı `{resolved: true}` ile işaretlemek, SONRA gönderimi
submit etmektir. Bu tuzağa iki kez düşüldü — sıra burada kayıtlı kalsın.

Kullanım:
  python3 resubmit.py            # durumu göster, hiçbir şey değiştirme
  python3 resubmit.py --submit   # resolved:true -> submitted:true uygula
"""
import json
import sys
import time
import urllib.error
import urllib.request

import jwt

KEY_ID = "K3YS3S4G5T"
ISS = "a9daba92-43c7-4471-b81c-689e1f17357e"
APP_ID = "6778542426"
P8_PATH = "/Users/yagizkarabulut/Desktop/AuthKey_K3YS3S4G5T.p8"
BASE = "https://api.appstoreconnect.apple.com"


def token() -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": ISS, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        open(P8_PATH).read(),
        algorithm="ES256",
        headers={"kid": KEY_ID, "typ": "JWT"},
    )


def req(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, (json.loads(raw) if raw else {})


def errors(d) -> str:
    return "; ".join(e.get("detail", e.get("title", "?")) for e in d.get("errors", []))


def latest_submission():
    st, d = req("GET", f"/v1/apps/{APP_ID}/reviewSubmissions?limit=5")
    for s in d.get("data", []):
        if s["attributes"].get("state") in ("UNRESOLVED_ISSUES", "READY_FOR_REVIEW"):
            return s
    return None


def main() -> int:
    do_submit = "--submit" in sys.argv

    st, d = req("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=10&include=build")
    builds = {i["id"]: i["attributes"] for i in d.get("included", []) if i["type"] == "builds"}
    for v in d.get("data", []):
        a = v["attributes"]
        if a.get("platform") != "IOS":
            continue
        bid = (v.get("relationships", {}).get("build", {}).get("data") or {}).get("id")
        print(f"iOS {a.get('versionString')}  state={a.get('appStoreState')}  "
              f"build={builds.get(bid, {}).get('version')}")

    sub = latest_submission()
    if not sub:
        print("Bekleyen/çözülmemiş bir gönderim yok — yeni gönderim ASC sitesinden yapılmalı")
        return 1
    sub_id = sub["id"]
    print(f"\ngönderim {sub_id}  state={sub['attributes'].get('state')}")

    st, d = req("GET", f"/v1/reviewSubmissions/{sub_id}/items?limit=50")
    items = d.get("data", [])
    rejected = [i for i in items if i["attributes"].get("state") == "REJECTED"]
    print(f"kalem: {len(items)} toplam, {len(rejected)} REJECTED")

    if not do_submit:
        print("\n(kuru çalışma — uygulamak için: python3 resubmit.py --submit)")
        return 0

    # 1. ADIM: her reddedilen kalemi çözüldü olarak işaretle. Bu atlanırsa
    #          2. adım 409 döner.
    for it in rejected:
        st, d = req("PATCH", f"/v1/reviewSubmissionItems/{it['id']}",
                    {"data": {"type": "reviewSubmissionItems", "id": it["id"],
                              "attributes": {"resolved": True}}})
        print(f"  resolved {it['id'][:12]}: {st} {errors(d) if st >= 400 else 'OK'}")

    # 2. ADIM: gönderimi submit et.
    st, d = req("PATCH", f"/v1/reviewSubmissions/{sub_id}",
                {"data": {"type": "reviewSubmissions", "id": sub_id,
                          "attributes": {"submitted": True}}})
    if st in (200, 201):
        print(f"\n✅ GÖNDERİLDİ — state={d.get('data', {}).get('attributes', {}).get('state')}")
        return 0
    print(f"\n❌ {st}: {errors(d)}")
    print("409 ise: metadata düzenlemesinden sonra geçici olabilir, birkaç dakika sonra "
          "tekrar dene; ısrar ederse ASC sitesinden 'Resubmit to App Review'.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
