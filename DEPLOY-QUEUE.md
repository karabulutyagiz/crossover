# CANLIYA ALINACAKLAR — Deploy Sırası (güncel: 2026-09-02 gece)

## ✅ 2026-09-02 21:43 — OTA (runtime 1.0.3, iOS+Android)
Grup `b21a1578-db17-481c-aa0c-0d6e99e232ae`, commit `a301700`. 30 Ağustos'tan bu yana
biriken 44 istemci commit'i: popup COFA alınlığı (madalyon → alınlık → üst çizgi),
Çöz Kazan modu, CO-PASS 50 seviye, "ÖDÜLLERİ TOPLA", hesap seviyesi ayrımı,
reklam düzeltmeleri (3'te 1 kuralı, donma), XOX klavye + tek hücre, mağaza profil
fotoğrafları, monetizasyon (kayıp sonrası 5💎 teklifi kalktı). Sunucu zaten canlıdaydı
(bugün basılmış, migration 0020). Website de senkron (kulüp genişlemesi 2, 786 sayfa).
OTA hesabı: `ygzkrblt` (yagizkarabulutmedya@gmail.com) — ygzkrblt1 oturumu yetkisiz.

## ✅ 2026-08-29 — TAM YAYIN (sunucu + OTA, iOS & Android)
OTA grubu `c25cb779-05e4-4be9-a781-f9460186f00b` (runtime 1.0.3, android+ios).
Sunucu basıldı (rooms=0 anına denk geldi, kimse düşmedi); migration 0015/0016/0017 uygulandı.

BAĞLANTI ZİNCİRİ (dört düzeltme birlikte):
- Ölü bağlantı toleransı 8sn → ~24sn (tek kaçan PONG maç bitiriyordu)
- Görünür heartbeat 12sn (protokol PING'i RN'de JS'e görünmüyor)
- MAÇTA zombi bağlantı tespiti (eskiden yalnız menüde vardı) → 30sn
- Kopan bağlantı register değil resume_room ile ODAYA DÖNER
- Yeniden bağlanma penceresi 12sn → 40sn

DİĞER DÜZELTMELER:
- Donma: emote ısıtması geri sayımdan alındı, SIRALI yapıldı
- Donma dedektörü (takılma ölçümü + kirli çıkış raporu) — veri toplamaya başladı
- Reklam: kalıcı yükleme hatası + config zaman aşımı delikleri; modal çakışma koruması
- Android: mağaza kaydırma (nestedScrollEnabled), Google giriş kapısı
- Kullanıcı adı: boşluk→_, min 4, sesli harf şartı, küfür filtresi + rakam maskeleri
- Davet: sosyal paket kapısı + doğrudan ödeme + davet edene sebep bildirimi
- Kopya cezası: kısa kesintiler affediliyor

YENİ ÖZELLİKLER: Haftalık Lig, Günün Kariyeri, Günlük Görevler, Sezonlar.

### İZLENECEK
- Donma dedektörü verisi (client_freeze logları) — 1 gün sonra oku
- Reklam gösterimi AdMob'da artıyor mu
- Bağlantı kopma sıklığı düştü mü (player_disconnect_grace / resume oranı)

### KALAN
- Android Google giriş: GOOGLE_ANDROID_CLIENT_ID oluşturulacak (config.ts boş)
- Mevcut uygunsuz kullanıcı adlarının temizliği
- Play ekran görüntüleri, Klan sistemi

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
# DİKKAT (2026-09-02): host'ta localhost:8080 crossover DEĞİL (404 döner) → eski kapı hiç açılmıyordu.
# Sağlık ucu domain üzerinden okunur; boş cevap da "0 değil" sayılır (kapı güvenli tarafta kalır).
ssh root@168.222.180.190 'cd /opt/crossover && while [ "$(curl -s -m 8 https://api.crossoverfootball.com/health | grep -o "\"rooms\":[0-9]*" | cut -d: -f2)" != "0" ]; do sleep 20; done && docker compose up -d --build app'

# 4) KANIT — sembol + config + sağlık (bunlarsız "deploy oldu" DEME)
ssh root@168.222.180.190 'curl -s https://api.crossoverfootball.com/health; docker exec crossover-app-1 grep -c sameArenaPair src/matchmaking/policy.ts; docker exec crossover-app-1 grep -c etaSeconds src/ws/server.ts; docker exec crossover-app-1 grep -c "finishXoxDraw" src/rooms/room.ts'
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
