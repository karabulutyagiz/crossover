#!/usr/bin/env python3
"""Replace the 1.0.1 iPhone 6.7" screenshots (tr) and create the en-US set.

Files come from appstore/ss-1.0.1/ — live simulator captures with FICTIONAL
clubs (Zirve/Liman SK, "Onur Demir"): App Review cited real clubs/players in
metadata under 4.1, so store imagery must never show them again.
"""
import hashlib, json, sys, time, urllib.request, urllib.error, jwt, pathlib

KEY_ID = "K3YS3S4G5T"; ISS = "a9daba92-43c7-4471-b81c-689e1f17357e"; APP_ID = "6778542426"
P8 = open("/Users/yagizkarabulut/Desktop/AuthKey_K3YS3S4G5T.p8").read()
DIR = pathlib.Path(__file__).parent / "ss-1.0.1"
DISPLAY_TYPE = "APP_IPHONE_67"


def tok():
    n = int(time.time())
    return jwt.encode({"iss": ISS, "iat": n, "exp": n + 1200, "aud": "appstoreconnect-v1"},
                      P8, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, data=data, method=method,
                               headers={"Authorization": "Bearer " + tok(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as x:
            raw = x.read().decode()
            return x.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, (json.loads(raw) if raw else {})


def errs(d):
    return "; ".join(f"{e.get('title','')}: {e.get('detail','')}" for e in d.get("errors", []))[:180]


def upload_one(set_id, path):
    data = path.read_bytes()
    st, d = req("POST", "/v1/appScreenshots", {"data": {"type": "appScreenshots",
        "attributes": {"fileSize": len(data), "fileName": path.name},
        "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": set_id}}}}})
    if st not in (200, 201):
        print(f"    {path.name}: rezervasyon HATA {st} {errs(d)}"); return None
    sid = d["data"]["id"]
    for op in d["data"]["attributes"]["uploadOperations"]:
        chunk = data[op["offset"]:op["offset"] + op["length"]]
        rq = urllib.request.Request(op["url"], data=chunk, method=op["method"])
        for h in op["requestHeaders"]:
            rq.add_header(h["name"], h["value"])
        with urllib.request.urlopen(rq, timeout=180):
            pass
    st, d = req("PATCH", f"/v1/appScreenshots/{sid}", {"data": {"type": "appScreenshots", "id": sid,
        "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}})
    print(f"    {path.name}: {'OK' if st < 300 else f'commit HATA {st} {errs(d)}'}")
    return sid


def handle_locale(loc_id, locale, files):
    print(f"\n== {locale} ==")
    st, d = req("GET", f"/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets?limit=20")
    sets = {x["attributes"]["screenshotDisplayType"]: x["id"] for x in d.get("data", [])}
    set_id = sets.get(DISPLAY_TYPE)
    if not set_id:
        st, d = req("POST", "/v1/appScreenshotSets", {"data": {"type": "appScreenshotSets",
            "attributes": {"screenshotDisplayType": DISPLAY_TYPE},
            "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": loc_id}}}}})
        if st not in (200, 201):
            print(f"  set olusturulamadi {st}: {errs(d)}"); return
        set_id = d["data"]["id"]
        print(f"  set olusturuldu: {set_id}")
    else:
        print(f"  set mevcut: {set_id}")
    # eskileri sil (1.0'dan miras)
    st, d = req("GET", f"/v1/appScreenshotSets/{set_id}/appScreenshots?limit=20")
    for old in d.get("data", []):
        st2, _ = req("DELETE", f"/v1/appScreenshots/{old['id']}")
        print(f"  eski silindi {old['id'][:8]}: {st2}")
    ids = []
    for f in files:
        sid = upload_one(set_id, DIR / f)
        if sid: ids.append(sid)
    # sirayi sabitle
    st, d = req("PATCH", f"/v1/appScreenshotSets/{set_id}/relationships/appScreenshots",
                {"data": [{"type": "appScreenshots", "id": i} for i in ids]})
    print(f"  sira: {st} ({len(ids)} gorsel)")


# 1.0.1 yerellestirmelerini bul
st, d = req("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=10")
ver = next(v for v in d["data"] if v["attributes"]["platform"] == "IOS"
           and v["attributes"]["versionString"] == "1.0.1")
st, d = req("GET", f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations?limit=20")
locs = {l["attributes"]["locale"]: l["id"] for l in d.get("data", [])}
print("yerellestirmeler:", sorted(locs))

handle_locale(locs["tr"], "tr", ["tr-1-guess.png", "tr-2-result.png", "tr-3-pick.png", "tr-4-arenas.png", "tr-5-friends.png"])
handle_locale(locs["en-US"], "en-US", ["en-1-guess.png", "en-2-result.png", "en-3-pick.png", "en-4-arenas.png", "en-5-friends.png"])
print("\nBITTI")
