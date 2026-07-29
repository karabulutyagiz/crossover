#!/usr/bin/env python3
# App Store Connect API helper — read/patch metadata for Crossover.
import jwt, time, json, sys, urllib.request, urllib.error

KEY_ID = "K3YS3S4G5T"
ISS = "a9daba92-43c7-4471-b81c-689e1f17357e"
APP_ID = "6778542426"
P8 = open("/Users/yagizkarabulut/Desktop/AuthKey_K3YS3S4G5T.p8").read()
BASE = "https://api.appstoreconnect.apple.com"


def token():
    now = int(time.time())
    return jwt.encode({"iss": ISS, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
                      P8, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})


def req(method, path, body=None):
    url = BASE + path if path.startswith("/") else path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
        headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, (json.loads(raw) if raw else {})


def read_state():
    print("=== app ===")
    st, d = req("GET", f"/v1/apps/{APP_ID}?fields[apps]=name,bundleId,sku,primaryLocale")
    a = d.get("data", {}).get("attributes", {})
    print(st, "name:", a.get("name"), "| bundle:", a.get("bundleId"), "| primaryLocale:", a.get("primaryLocale"))

    print("\n=== appStoreVersions ===")
    st, d = req("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=5")
    ver_id = None
    for v in d.get("data", []):
        at = v["attributes"]
        print(" ", v["id"], at.get("versionString"), at.get("appStoreState"), at.get("platform"))
        if at.get("appStoreState") in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"):
            ver_id = ver_id or v["id"]
    print("editable version id:", ver_id)

    if ver_id:
        print("\n=== appStoreVersionLocalizations ===")
        st, d = req("GET", f"/v1/appStoreVersions/{ver_id}/appStoreVersionLocalizations?limit=20")
        for l in d.get("data", []):
            at = l["attributes"]
            print(" ", l["id"], at.get("locale"), "| desc?", bool(at.get("description")),
                  "| keywords?", bool(at.get("keywords")), "| support:", at.get("supportUrl"))

    print("\n=== appInfos + localizations ===")
    st, d = req("GET", f"/v1/apps/{APP_ID}/appInfos?include=appInfoLocalizations&limit=5")
    for info in d.get("data", []):
        ia = info["attributes"]
        print(" appInfo", info["id"], "state:", ia.get("appStoreState") or ia.get("state"))
    for inc in d.get("included", []):
        if inc["type"] == "appInfoLocalizations":
            at = inc["attributes"]
            print("   loc", inc["id"], at.get("locale"), "| name:", at.get("name"),
                  "| subtitle:", at.get("subtitle"), "| privacy:", at.get("privacyPolicyUrl"))


DESCRIPTION = """Crossover — futbol bilgini gerçek rakiplere karşı kanıtla!

İki futbol kulübü karşına çıkıyor. İkisinde de forma giymiş "ortak" futbolcuyu rakibinden önce bulan turu kazanır. Gerçek zamanlı 1v1 düellolarda hızlı düşün, hızlı yaz — 3 turu ilk alan maçı ve kupaları kazanır!

NASIL OYNANIR
- Karşına iki futbol kulübü çıkar
- İkisinde de forma giymiş ortak futbolcuyu bul
- Rakibinden önce doğru cevabı ver, turu kap
- 3 tur kazanan maçı alır, kupaları toplar

OYUN MODLARI
- Hızlı Eşleşme — gerçek rakiplerle anlık 1v1
- Bot Maçı — pratik yap, taktiğini geliştir
- Özel Oda — arkadaşınla oda kodu ile kapış
- Sosyal Paket — Ülke-Takım ve Harf-Takım modları

ARENALAR VE KUPALAR
Mahalle Sahası'ndan başla, kupa topladıkça yüksel — hedefin GOAT arenası! Her arena atlayışında elmas ödülleri seni bekliyor.

EMOTELER
Maç içinde emote at, rakibini çıldırt. Koleksiyonunu büyüt, loadout'unu kur.

LİDER TABLOSU
Sıralamada yüksel, en iyi oyuncularla yarış.

Gerçek transfer verileriyle on binlerce futbolcu ve kulüp. Futbol hafızanı test etmeye hazır mısın?

Hemen indir, ilk düellona başla!

Kullanım Koşulları (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Gizlilik Politikası: https://crossoverfootball.com/gizlilik/"""

META = {
    "name": "Crossover: Futbol Düellosu",
    "subtitle": "Ortak futbolcuyu ilk sen bul",
    "privacyPolicyUrl": "https://crossoverfootball.com/gizlilik/",
    "description": DESCRIPTION,
    "keywords": "futbol,quiz,bilgi yarışması,transfer,ortak oyuncu,rakip,arena,1v1,taraftar,lig,gol,skor,kart",
    "promotionalText": "İki takımda da forma giymiş futbolcuyu rakibinden önce bul! Gerçek zamanlı 1v1 futbol düellosu — arkadaşınla kapış, arenalarda yüksel, kupaları topla.",
    "supportUrl": "https://crossoverfootball.com/destek/",
    "marketingUrl": "https://crossoverfootball.com/",
}


def patch_attr(kind, oid, attrs):
    st, d = req("PATCH", f"/v1/{kind}/{oid}",
                {"data": {"type": kind, "id": oid, "attributes": attrs}})
    if st in (200, 201):
        print(f"  OK  {kind}/{oid[:8]}  <- {', '.join(attrs.keys())}")
    else:
        errs = "; ".join(e.get("detail", e.get("title", "?")) for e in d.get("errors", []))
        print(f"  ERR {st} {kind}/{oid[:8]}: {errs}")
    return st, d


def do_patch():
    # 1) find the IOS PREPARE_FOR_SUBMISSION version + its tr localization
    st, d = req("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=10")
    ios_ver = next((v["id"] for v in d.get("data", [])
                    if v["attributes"].get("platform") == "IOS"
                    and v["attributes"].get("appStoreState") == "PREPARE_FOR_SUBMISSION"), None)
    print("iOS version:", ios_ver)
    st, d = req("GET", f"/v1/appStoreVersions/{ios_ver}/appStoreVersionLocalizations?limit=20")
    tr_loc = next((l["id"] for l in d.get("data", []) if l["attributes"].get("locale") == "tr"), None)
    print("iOS tr localization:", tr_loc)

    print("\n=== appStoreVersionLocalization (aciklama/anahtar/promo/URL) ===")
    patch_attr("appStoreVersionLocalizations", tr_loc, {
        "description": META["description"],
        "keywords": META["keywords"],
        "promotionalText": META["promotionalText"],
        "supportUrl": META["supportUrl"],
        "marketingUrl": META["marketingUrl"],
    })

    # 2) appInfoLocalization (name/subtitle/privacy)
    st, d = req("GET", f"/v1/apps/{APP_ID}/appInfos?include=appInfoLocalizations&limit=5")
    tr_info = None
    for inc in d.get("included", []):
        if inc["type"] == "appInfoLocalizations" and inc["attributes"].get("locale") == "tr":
            tr_info = inc["id"]
    print("\n=== appInfoLocalization (subtitle/privacy/name) ===")
    print("tr appInfoLocalization:", tr_info)
    # subtitle + privacy first (safe), name attempted separately (may conflict)
    patch_attr("appInfoLocalizations", tr_info, {
        "subtitle": META["subtitle"],
        "privacyPolicyUrl": META["privacyPolicyUrl"],
    })
    print("  -- ad degisimi (basarisiz olursa mevcut ad kalir) --")
    patch_attr("appInfoLocalizations", tr_info, {"name": META["name"]})


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "read"
    if cmd == "read":
        read_state()
    elif cmd == "patch":
        do_patch()
