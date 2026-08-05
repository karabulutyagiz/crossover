#!/usr/bin/env python3
"""Add an en-US store localization (and create version 1.0.1 to carry it).

WHY: the app's ASC primary locale is Turkish and no English localization
exists, so every non-Turkish storefront falls back to the TURKISH description.
Fixing it needs a new version (localizations attach to versions; 1.0 is
READY_FOR_SALE and immutable) — 1.0.1 will ship as build 123 anyway.

The "EN" language badge on the product page comes from the BINARY's declared
localizations (CFBundleLocalizations), not from here — that part is fixed in
app.json and lands with build 123.
"""
import json, sys, time, urllib.request, urllib.error, jwt

KEY_ID = "K3YS3S4G5T"; ISS = "a9daba92-43c7-4471-b81c-689e1f17357e"; APP_ID = "6778542426"
P8 = open("/Users/yagizkarabulut/Desktop/AuthKey_K3YS3S4G5T.p8").read()


def tok():
    n = int(time.time())
    return jwt.encode({"iss": ISS, "iat": n, "exp": n + 1200, "aud": "appstoreconnect-v1"},
                      P8, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, data=data, method=method,
                               headers={"Authorization": "Bearer " + tok(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=40) as x:
            raw = x.read().decode()
            return x.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, (json.loads(raw) if raw else {})


def errs(d):
    return "; ".join(f"{e.get('title','')}: {e.get('detail','')}" for e in d.get("errors", []))[:200]


EN_DESCRIPTION = """Crossover — prove your football knowledge against real opponents!

Two football clubs appear on screen. The first player to name a footballer who has worn BOTH shirts wins the round. Think fast, type fast in real-time 1v1 duels — first to 3 rounds takes the match and the trophies!

HOW TO PLAY
- Two football clubs appear
- Find the player who has played for both
- Answer before your rival to take the round
- Win 3 rounds to take the match and collect trophies

GAME MODES
- Quick Match — instant 1v1 against real opponents
- Bot Match — practice and sharpen your tactics
- Private Room — challenge a friend with a room code
- Social Pack — Country-Team and Letter-Team modes

ARENAS AND TROPHIES
Start from the Neighborhood Pitch and climb arena by arena — the GOAT arena awaits! Diamond rewards at every promotion.

EMOTES
Send emotes mid-match. Grow your collection, build your loadout.

LEADERBOARD
Climb the rankings and compete with the best.

Tens of thousands of players and clubs from real transfer data. Ready to test your football memory?

Download now and start your first duel!

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://crossoverfootball.com/gizlilik/"""

EN = {
    "description": EN_DESCRIPTION,
    "keywords": "football,soccer,quiz,trivia,transfer,duel,1v1,club,league,goal,fan,arena,versus",
    "promotionalText": "Find the footballer who played for BOTH clubs before your rival does! Real-time 1v1 football duels — challenge friends, climb arenas, collect trophies.",
    "supportUrl": "https://crossoverfootball.com/destek/",
    "marketingUrl": "https://crossoverfootball.com/",
    "whatsNew": "Bug fixes and improvements: smoother purchase flow, iPad layout polish, and visual refinements throughout.",
}
TR_WHATS_NEW = "Hata düzeltmeleri ve iyileştirmeler: daha akıcı satın alma akışı, iPad düzeni ve genel görsel cilalar."
EN_INFO = {"name": "CrossOver Football", "subtitle": "Find the shared player first"}  # 28 char (limit 30)

# 1) 1.0.1 var mi / olustur
st, d = req("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=10")
ver = next((v for v in d.get("data", []) if v["attributes"].get("platform") == "IOS"
            and v["attributes"].get("versionString") == "1.0.1"), None)
if ver:
    vid = ver["id"]; print(f"1) 1.0.1 zaten var: {vid} ({ver['attributes'].get('appStoreState')})")
else:
    st, d = req("POST", "/v1/appStoreVersions", {"data": {"type": "appStoreVersions",
        "attributes": {"platform": "IOS", "versionString": "1.0.1"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})
    if st not in (200, 201): print(f"1) SURUM OLUSTURMA HATASI {st}: {errs(d)}"); sys.exit(1)
    vid = d["data"]["id"]; print(f"1) 1.0.1 olusturuldu: {vid}")

# 2) yerellestirmeler
st, d = req("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=20")
locs = {l["attributes"]["locale"]: l["id"] for l in d.get("data", [])}
print(f"2) mevcut: {sorted(locs)}")

if "en-US" in locs:
    st, d = req("PATCH", f"/v1/appStoreVersionLocalizations/{locs['en-US']}",
                {"data": {"type": "appStoreVersionLocalizations", "id": locs["en-US"], "attributes": EN}})
    print(f"   en-US guncellendi: {st} {'OK' if st < 300 else errs(d)}")
else:
    st, d = req("POST", "/v1/appStoreVersionLocalizations", {"data": {"type": "appStoreVersionLocalizations",
        "attributes": {"locale": "en-US", **EN},
        "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
    print(f"   en-US olusturuldu: {st} {'OK' if st < 300 else errs(d)}")

if "tr" in locs:
    st, d = req("PATCH", f"/v1/appStoreVersionLocalizations/{locs['tr']}",
                {"data": {"type": "appStoreVersionLocalizations", "id": locs["tr"],
                          "attributes": {"whatsNew": TR_WHATS_NEW}}})
    print(f"   tr whatsNew: {st} {'OK' if st < 300 else errs(d)}")

# 3) appInfo en-US (ad/altbaslik) — PREPARE durumundaki appInfo'ya
st, d = req("GET", f"/v1/apps/{APP_ID}/appInfos?include=appInfoLocalizations&limit=5")
target = None
for info in d.get("data", []):
    if (info["attributes"].get("appStoreState") or info["attributes"].get("state")) in (
            "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED"):
        target = info["id"]
existing_en = None
for inc in d.get("included", []):
    if inc["type"] == "appInfoLocalizations" and inc["attributes"].get("locale") == "en-US":
        existing_en = inc["id"]
if existing_en:
    st, d = req("PATCH", f"/v1/appInfoLocalizations/{existing_en}",
                {"data": {"type": "appInfoLocalizations", "id": existing_en, "attributes": EN_INFO}})
    print(f"3) appInfo en-US guncellendi: {st} {'OK' if st < 300 else errs(d)}")
elif target:
    st, d = req("POST", "/v1/appInfoLocalizations", {"data": {"type": "appInfoLocalizations",
        "attributes": {"locale": "en-US", **EN_INFO},
        "relationships": {"appInfo": {"data": {"type": "appInfos", "id": target}}}}})
    print(f"3) appInfo en-US olusturuldu: {st} {'OK' if st < 300 else errs(d)}")
else:
    print("3) duzenlenebilir appInfo yok (yayindaki kilitli) — 1.0.1 gonderiminde tekrar dene")

print("\nBITTI — 1.0.1 build 123 ile gonderilecek; App Store 'Languages' rozeti icin CFBundleLocalizations build'de.")
