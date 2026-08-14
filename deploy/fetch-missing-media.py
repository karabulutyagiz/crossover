#!/usr/bin/env python3
"""Hiç medyası OLMAYAN kayıtlar için TM'den görsel toplayıcı (YEREL çalışır).

Kapsam:
  1. logo_url'suz kulüpler  (canlı, ~6.9k; TM id'li → /clubs/{id}/profile)
  2. image_url'suz oyuncular (canlı, ~4.1k; TM id'li → /players/{id}/profile)
  3. Efsaneler (sentetik id 990M+/980M+): isimle TM araması → eşleşen profilin görseli
     (oyuncular legends_players STAGING'inden okunur; kulüpler canlı clubs'ta zaten var)

Çıktılar (repo içinde, sunucuya rsync edilecek):
  deploy/media-out/clubs/{liveId}.png · deploy/media-out/players/{liveId}.jpg
  deploy/media-url-fill.sql  — dosyası inen kayıtlar için URL doldurma UPDATE'leri
  deploy/media-fetch-done.tsv — resumability günlüğü
  deploy/media-fetch-failed.tsv — bulunamayan/hata alanlar

Kullanım: python3 deploy/fetch-missing-media.py [--limit N]
Yerel TM API: http://localhost:8001 (tm-api-local konteyneri).
"""
import json, pathlib, re, subprocess, sys, time, unicodedata, urllib.request, urllib.error

TM = "http://localhost:8001"
SSH = ["ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", "root@168.222.180.190"]
BASE = pathlib.Path(__file__).parent
OUT = BASE / "media-out"
SQL = BASE / "media-url-fill.sql"
DONE = BASE / "media-fetch-done.tsv"
FAILED = BASE / "media-fetch-failed.tsv"
DELAY = 1.2          # TM API çağrıları arası (TM sitesine gider)
DL_DELAY = 0.2       # CDN indirmeleri arası
LIMIT = None
if "--limit" in sys.argv:
    LIMIT = int(sys.argv[sys.argv.index("--limit") + 1])

(OUT / "clubs").mkdir(parents=True, exist_ok=True)
(OUT / "players").mkdir(parents=True, exist_ok=True)

done = set()
if DONE.exists():
    done = {line.split("\t")[0] for line in DONE.read_text().splitlines() if line}


def mark(key, status, extra=""):
    with open(DONE if status == "ok" else FAILED, "a") as f:
        f.write(f"{key}\t{status}\t{extra}\n")
    if status == "ok":
        done.add(key)


def sql(line):
    with open(SQL, "a") as f:
        f.write(line + "\n")


def psql(q):
    r = subprocess.run(SSH + [f'docker exec crossover-db-1 psql -U crossover -d crossover -tAc "{q}"'],
                       capture_output=True, text=True, timeout=60)
    return [row for row in r.stdout.splitlines() if row.strip()]


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]", "", s).strip()


def api(path, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(TM + path, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code < 500:
                raise  # 4xx: retry anlamsiz
            if k == tries - 1:
                raise
            time.sleep(8 * (k + 1))  # TM nefes alsin


BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.8,tr;q=0.6",
}


def og_image(tm_player_id, tries=2):
    """Profil endpoint'i 500 verirse (ör. vefat etmiş oyuncular) sayfadan og:image al.
    TM dogrudan sayfa cekimlerine 403/503 atabiliyor — yavas ve inatci ol."""
    for k in range(tries):
        try:
            time.sleep(4)  # dogrudan TM sayfasina giderken ekstra nezaket
            req = urllib.request.Request(
                f"https://www.transfermarkt.com/x/profil/spieler/{tm_player_id}",
                headers=BROWSER_HEADERS)
            with urllib.request.urlopen(req, timeout=45) as r:
                html = r.read(200_000).decode("utf-8", "ignore")
            m = re.search(r'property="og:image"\s+content="([^"]+)"', html)
            return m.group(1) if m else None
        except (urllib.error.URLError, TimeoutError, OSError):
            if k == tries - 1:
                raise
            time.sleep(20)


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    if not data:
        raise ValueError("bos yanit")
    dest.write_bytes(data)
    time.sleep(DL_DELAY)


def ext_of(url, default):
    u = url.lower()
    return "png" if ".png" in u else "jpg" if (".jpg" in u or ".jpeg" in u) else default


def handle_club(cid, name):
    key = f"club:{cid}"
    if key in done:
        return
    try:
        if int(cid) >= 900_000_000:  # efsane kulübü: isimle ara
            res = api(f"/clubs/search/{urllib.request.quote(name)}").get("results", [])
            match = next((r for r in res if norm(r["name"]) == norm(name)), res[0] if res else None)
            if not match:
                mark(key, "bulunamadi", name); return
            time.sleep(DELAY)
            img = api(f"/clubs/{match['id']}/profile").get("image")
        else:
            img = api(f"/clubs/{cid}/profile").get("image")
        if not img:
            mark(key, "gorselsiz", name); return
        ext = ext_of(img, "png")
        download(img, OUT / "clubs" / f"{cid}.{ext}")
        sql(f"UPDATE clubs SET logo_url='https://crossoverfootball.com/media/clubs/{cid}.{ext}' WHERE id={cid};")
        mark(key, "ok")
    except Exception as e:
        mark(key, "hata", f"{name} | {e.__class__.__name__}: {str(e)[:80]}")
    time.sleep(DELAY)


def handle_player(pid, name, birth_year, source="live"):
    key = f"player:{pid}"
    if key in done:
        return
    try:
        if int(pid) >= 900_000_000:  # efsane: isimle ara, dogum yiliyla dogrula
            res = api(f"/players/search/{urllib.request.quote(name)}").get("results", [])
            match = next((r for r in res if norm(r["name"]) == norm(name)), res[0] if res else None)
            if not match:
                mark(key, "bulunamadi", name); return
            tmid = match["id"]
            time.sleep(DELAY)
        else:
            tmid = pid
        try:
            img = api(f"/players/{tmid}/profile").get("imageUrl")
        except urllib.error.HTTPError:
            img = og_image(tmid)  # vefat etmis oyuncu sayfalari profile'da 500 veriyor
        if not img or "default" in img:
            mark(key, "gorselsiz", name); return
        ext = ext_of(img, "jpg")
        download(img, OUT / "players" / f"{pid}.{ext}")
        sql(f"UPDATE players SET image_url='https://crossoverfootball.com/media/players/{pid}.{ext}' WHERE id={pid};")
        mark(key, "ok")
    except Exception as e:
        mark(key, "hata", f"{name} | {e.__class__.__name__}: {str(e)[:80]}")
    time.sleep(DELAY)


print("→ listeler prod'dan çekiliyor (salt-okunur)…")
clubs = [r.split("|", 1) for r in psql("SELECT id || '|' || name FROM clubs WHERE logo_url IS NULL OR logo_url='' ORDER BY popularity DESC NULLS LAST")]
players = [r.split("|", 2) for r in psql("SELECT id || '|' || COALESCE(birth_year::text,'') || '|' || name FROM players WHERE image_url IS NULL OR image_url='' ORDER BY id")]
legends = [r.split("|", 2) for r in psql("SELECT id || '|' || COALESCE(birth_year::text,'') || '|' || name FROM legends_players ORDER BY id")]
print(f"  kulüp: {len(clubs)}  oyuncu: {len(players)}  efsane: {len(legends)}")

if not SQL.exists():
    sql("-- fetch-missing-media.py çıktısı — dosyalar rsync edildikten SONRA uygulanır")

n = 0
# Önce efsaneler (az ve öncelikli), sonra popüler kulüpler, sonra oyuncular
for pid, by, name in legends:
    handle_player(pid, name, by); n += 1
for cid, name in clubs:
    if LIMIT and n >= LIMIT: break
    handle_club(cid, name); n += 1
    if n % 50 == 0: print(f"  ilerleme: {n} işlendi")
for pid, by, name in players:
    if LIMIT and n >= LIMIT: break
    handle_player(pid, name, by); n += 1
    if n % 50 == 0: print(f"  ilerleme: {n} işlendi")

ok = sum(1 for _ in open(DONE)) if DONE.exists() else 0
bad = sum(1 for _ in open(FAILED)) if FAILED.exists() else 0
print(f"BITTI: ok={ok} sorunlu={bad}  → media-out/ + media-url-fill.sql hazır")
