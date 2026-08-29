# CANLIYA ALINACAKLAR — Deploy Sırası (güncel: 2026-08-29)

## ✅ 2026-08-29 — HER ŞEY CANLIDA (build-113 @ fece4ba)

Bu turda canlıya alınanlar (kullanıcı onayıyla, 3-5 oda açıkken):

**SUNUCU** (rsync + `docker compose up -d --build app`, migration 0014 uygulandı):
- SIRA 1'in tamamı: aynı-arena eşleşme, ETA, kupa bandı, XOX gerçek kural,
  seçim toleransı, kesinti hediyesi kapalı, admin feedback ucu
- Bot insan-gibi-yazım + bilindik-öncelik (a549a14)
- Seri ödülü TAMAMEN kapalı (193dff4 + 39e23d4) — elmas sızıntısı durdu
- Sosyal paket açıkları (3d66658), WS ping
- HAFTALIK LİG (40eae6a): 0014 migration + league_groups/members/settlements
- Reklam config'i: docker-compose.yml'e ADS_* değişkenleri eklendi

**REKLAM** — geçiş reklamı AÇIK ve doğrulandı:
- iOS birim `ca-app-pub-5118403349234305/8928918587`
- Android birim `ca-app-pub-5118403349234305/1022508408`
- 3 maçta 1, ilk 5 maç muaf, Sosyal Paketliye ASLA
- Ödüllü: kayıp sonrası + elmas yetersiz; günlük tavan 24 izlenme

**FİYAT** (ASC, `appstore/set-subscription-prices.py`) — 2026-08-30'da yürürlükte:
- Haftalık ₺24,99 → ₺39,99, mevcut aboneler KORUNDU (`preserved: true`)
- Aylık ₺89,99 → ₺79,99 (indirim herkese)

**OTA** — update group `04c8d39c-538b-493e-bb2e-c95b6af40649` (runtime 1.0.3):
lig ekranı, reklam kurgusu, yıldız istemi (4 günde bir yeniden dener),
fiyat metinleri, XOX UI, mağaza tek-rozet, eşleşme sayacı, duyurular.

**ADMIN** — panel senkron (canlı maçta botun kupası görünüyor).

### KALAN TEK İŞ
- **Play Store**: `~/Downloads/crossover-1.0.3-vc131-dogru-imza.aab` (imza
  83:D7…BB:4B doğrulandı) Play Console kapalı test taslağına SÜRÜKLENECEK.
- **Android IAP YOK**: istemci yalnız Apple isteği kuruyor, sunucuda Google
  doğrulaması yazılmadı, Play'de ürün tanımı yok → Android'de satın alma
  imkânsız ("yakında" penceresi çıkar). Sıradaki büyük iş.

---
> Bu dosya deploy edilecek işlerin SIRASIDIR. Deploy'u yapan: diğer yazılımcı.
> Kural: prod'da `docker compose`u aynı anda TEK kişi çalıştırır; basmadan önce
> diğer oturuma haber ver. Bir kalem canlıya alınıp doğrulanınca listeden düş.

## SIRA 1 — SUNUCU (önce bu; istemci özellikleri buna yaslanıyor)

Bekleyen sunucu işleri (hepsi `build-113` HEAD'inde, tsc temiz, testler yeşil):

- **Aynı-arena eşleşme** (`01cfc8e`): arena içi kupa sınırsız, arena dışı yasak
  (eşikler 0/200/500/1000/2000/3500/5000 — policy.ts ARENA_STEPS).
- **Dürüst eşleşme tahmini** (`79b210e`): `searching.etaSeconds` (2-8 sn bandı).
- **Kupa bandı** (`a22e9c2` ~): HER maçta kazanç +28..35, kayıp −15..28 — bot/insan ayrımı YOK.
- **Bot eşleşme hızı**: fallback 1-2 sn, insansız sert tavan 2.6 sn, oda kurulumu 900 ms.
- **XOX gerçek kural** (`e3ebb6d` + `95dc970`): yalnız çizgi kazanır; çizgisiz
  bitiş BERABERE — iki taraf da DÜZ +5 kupa (Baturalp'ın revizyonu), kayıp yok.
  Altın hücre/çoğunluk kaldırıldı.
- **Seçim toleransı** (`2167016`): pick sayacı 0'dan sonra rastgele atama +900 ms bekler.
- **Kesinti hediyesi KAPALI** (`4efc565`): kod varsayılanı false; prod `.env`e
  `OUTAGE_GIFT_ENABLED=false` YAZILDI (restart'ta etkin — ayrıca bir şey yapma).
- **Admin geri bildirim ucu**: `GET /admin/api/feedback` (bearer token'lı).
- **Bot cevapları insan gibi** (`a549a14`): şapkalı/aksanlı harf katlanır
  (Kâzım→Kazım, Modrić→Modric; ç/ğ/ı/İ/ö/ş/ü korunur) + iki takımda da
  oynamışlardan EN BİLİNDİK öncelikli seçim (0.62 en ünlü, kalan ilk 3) —
  tüm modlar + XOX.
- **Seri ödülü TAMAMEN kapalı** (`39e23d4` + `193dff4`): galibiyet serisi ne
  elmas ne güç verir — STREAK_MILESTONES boş. ACİL: eski kod canlıda hâlâ
  3/5/10/20'de elmas dağıtıyor olabilir; bu paket basılana dek sızıntı sürer.

### Sunucu deploy komutu (kalıp)
```bash
# 1) Lokal doğrulama
cd server && npx tsc --noEmit && npx tsx src/cli/xox-test.ts && npx tsx src/cli/special-powers-test.ts

# 2) Senkronla — HEDEF /opt/crossover/server/ (KÖK DEĞİL; compose ./server build eder)
rsync -az --delete --exclude node_modules --exclude .env server/ root@168.222.180.190:/opt/crossover/server/

# 3) rooms=0 kapısı İÇERİDE olacak şekilde bas (canlı maç düşürme!)
ssh root@168.222.180.190 'cd /opt/crossover && while [ "$(curl -s localhost:8080/health | grep -o "\"rooms\":[0-9]*" | cut -d: -f2)" != "0" ]; do sleep 20; done && docker compose up -d --build app'

# 4) KANIT — sembol + config + sağlık (bunlarsız "deploy oldu" DEME)
ssh root@168.222.180.190 'curl -s localhost:8080/health; docker exec crossover-app-1 grep -c sameArenaPair src/matchmaking/policy.ts; docker exec crossover-app-1 grep -c etaSeconds src/ws/server.ts; docker exec crossover-app-1 grep -c "finishXoxDraw" src/rooms/room.ts'
```

## SIRA 2 — OTA (sunucu basıldı; ŞİMDİ basılabilir — token komutu kullanıcıda)

Bekleyen istemci işleri (runtime 1.0.3, native değişiklik yok → OTA uygun):

- Tahmini eşleşme sayacı (arama ekranı rozeti)
- XOX: gerçek kural UI + BERABERE ekranı + altın üstü-çizme animasyonu
- XOX: sabit ekran (kaydırmasız, adaptif tahta) + hücrede futbolcu fotoğrafı + sağ kırpılma düzeltmesi
- XOX duyuru üçlüsü: her açılışta popup + zil haberi (pip) + Diğer Modlar kırmızı "1" + listede YENİ kurdelesi
- Sosyal paket popup/metinlerinde Futbol XOX (7 dil)
- x3 rozeti ikonda; "×3 PAKET"/"TANESİ" metinleri kalktı; dondurucu+cevap gücü çizimleri
- Kopya çekme = anında hükmen mağlubiyet (background'a geçişte)
- GameModal klavye kaçınması (Günün sorusu GÖNDER görünür) + feedback göndermede çökme düzeltmesi

### OTA komutu
```bash
cd app && NODE_OPTIONS=--dns-result-order=ipv4first npx eas-cli update --channel production \
  --environment production -m "xox kurallari + esletirme sayaci + duyurular" --non-interactive
# Doğrula: npx eas-cli update:list --branch production --limit 1
```

## ZATEN CANLIDA (tekrar basma)
- Admin panel HTML'i (Görüş/Öneri bölümü) → /opt/crossover/admin/ (statik, yayınlandı;
  API ucu SIRA 1 ile aktifleşir, o ana dek "Henüz mesaj yok" gösterir)
- prod `.env`: `OUTAGE_GIFT_ENABLED=false` (restart bekliyor)
- OTA grubu `3eedaa33` (x3 rozet + ikonlar + kopya-forfeit zaten yayında — SIRA 2
  bunun ÜZERİNE biner, çakışma yok)
- MIN_IOS_BUILD=148 kapısı, vitrin (12 çizimli ürün), Perşembe çapası

## NOTLAR
- Build 151 ipa elde (Live Activity dahil) — TestFlight'a 1.0.4 olarak gidecek; OTA işi değil.
- Freeze+reveal GÜÇ ikonları çizildi ve entegre; başka bekleyen asset yok.
- EAS cloud kotası bitik → build gerekirse LOKAL build (bkz. memory: eas-apple-credentials).
