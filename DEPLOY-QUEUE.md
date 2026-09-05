# CANLIYA ALINACAKLAR — Deploy Sırası (güncel: 2026-09-05 21:40 TR)

## ⏳ 2026-09-05 — 150 ELMAS BAKIM ÖZRÜ: HAZIR, YAYIN + SUNUCU DEPLOY BEKLİYOR

**Kullanıcı kararı (16:56 UTC):** "bakım ve kesintiler için özür" popup'ı, 150 elmas,
çarpısız, TOPLA zorunlu; yalnız o ana kadar yüklemiş olanlara (sunucu cutoff
`2026-09-05T17:42:43Z`, 1.699 hesap), yeni indirenlere HİÇ (tek seferlik).

**Bugün olan:** 16:50 UTC eski projeye OTA grubu `756047e1` (Ben Kimim + maç dışı
reklam kapısı, a301700 tabanı; a301700'ün dirty ağacından). Hediye popup'ı BU
PAKETTE YOK (istek sonra geldi). Yeni proje hâlâ 4 Eylül 22:48 UTC (`b357019d`).

**+ SOSYAL JETON KALDIRILDI (kullanıcı 2026-09-05 21:45 TR):** "kilitli moda basınca
jeton kullan popup'ı çıkıyor… bu sistemi kaldırmıştık, olanlardan da gidecekti".
İki ağaçta da: `socialtoken` güç kimliği, mağaza kartı, kilitli mod popup'ındaki
"Jeton Kullan" dalı (tek buton: Sosyal Paketi Aç), envanter sayacı, asset silindi;
ödül tabloları peer tasarımıyla aynı (seviye 45 → xp2x; premium 20 → xp2x, 35 →
kalkan; CO-PASS ücretsiz 39 → seri, 45 → kalkan; premium 20 → antrenman, 35 →
kalkan). Sunucu: `power_socialtoken` sütunu migration `0021_remove_social_pack_token`
ile HERKESTEN düşer (schema.sql'deki ADD COLUMN da silindi). Eski istemcinin
`use_power socialtoken` isteği artık validasyondan döner.

**🔴 KAZA (2026-09-05 23:05 TR) + DÜZELTME — eski istemcide "1 GÜNLÜK SOSYAL PAKET" popup'ı:**
OTA 20:05/20:11 UTC iki projeye çıktı, sunucu 20:16 UTC yenilendi. Sunucu hediyeyi ESKİ
`outageGiftAvailable` alanıyla açtı; OTA'yı henüz almamış istemciler o alanı Ağustos'taki
"KESİNTİ İÇİN ÖZÜR — herkese 1 GÜNLÜK SOSYAL PAKET / AL" penceresine bağlıydı → yanlış
metinli popup göründü (kullanıcı: "ciromu sikeceksin"). Sunucu gerçekte yalnız `diamonds + 150`
yazıyor, `social_pack_until`'a dokunmuyor — kimseye paket tanımlanMADI; ama oyuncunun gördüğü
metin "bedava paket"ti ve AL'a basan 150 elmas alıp "paket tanımlandı" metnini okudu.
DÜZELTME: wire alanları yeniden adlandırıldı → `apologyGiftAt` / `apologyGiftAvailable`
(server protocol.ts + profileView.ts, client protocol.ts + App.tsx). Eski istemci bu adları
tanımaz → hiçbir şey göstermez; yalnız yeni popup'lı istemci okur. `claim_outage_gift` /
`outage_gift_claimed` adları aynı kaldı (popup'sız eski istemci hiç göndermez; gönderse de
ödül aynı 150 elmas). SIRA BU KEZ: önce SUNUCU (eski cihazlarda popup anında kesilir),
sonra OTA iki projeye (20:05 OTA'sını almış istemci de yeni alanı okumak için OTA'yı bekler;
kısa bir "popup görünmez" boşluğu olur, kabul). Ders: [[wire-field-rename-not-deploy-order]].

**+ GEÇİŞ REKLAMI "3 GİR-ÇIK'TA ÇIKMIYOR" DÜZELTMESİ (kullanıcı 2026-09-05 22:05 TR):**
Kök sebep (App.tsx): reklam bekleyişi yalnız maçtan çıkış anında kuruluyor, 20 sn
yaşıyor ve o sürede gelen 2./3. çıkış `adPendingRef` yüzünden yutuluyordu; 3. çıkış
ilk pencerenin son saniyelerine düşünce 8 sn'lik maç-niyeti kilidi kalan süreyi yiyor,
pencere reklamsız kapanıyor ve menüde oturulsa da bir daha denenmiyordu. Düzeltme:
tek döngü ama her tetikte son tarih 30 sn ileri alınır; ana menüye her giriş ve her
pencere kapanışı borç varsa (`isInterstitialDue`) bekleyişi yeniden kurar. Gösterim
kapısı DEĞİŞMEDİ: yalnız ana menü, maç niyeti taze değilken, pencere yokken — maç/round
içinde asla. Reklam kapanınca "REKLAMSIZ OYNA → SOSYAL PAKET AL" penceresi artık HER
reklamdan sonra (2026-09-02 "iki reklamda bir" ritmi kaldırıldı).
Not: reklam yine de çıkmıyorsa Ayarlar > Monetization Diagnostics `adsLastReason`
bakılır — `paket` (hesapta Sosyal Paket aktif: jeton/abonelik), `muaf n/5` (yeni kurulum,
ilk 5 maç), `oturum 1/2` (oturumun ilk maçı), `yuklenmedi` (AdMob dolum yok).

**Dallar** (hızlı disk klonu `/var/folders/…/T/opencode/crossover-gift-release`):
- `ota-gift-20260905` — istemci + sunucu, a301700 tabanı (yeni ana sayfa/nav
  DIŞARIDA). **OTA buradan basılır.** app tsc + ad-slot-test temiz.
- `server-gift-20260905` (`52aa288`) = canlı `f00c279` + YALNIZ hediye hunk'ları
  (worktree `…/crossover-server-gift`). **Sunucu buradan basılır.** a301700
  tabanından sunucu basmak Kupa Kalkanı / CO-PASS 19.040 / set_frame tek kapı /
  vitrin kaydırmayı geri alırdı. server tsc temiz.

**SIRA (OTA önce, sunucu sonra):**
1. Eski proje (hesap `ygzkrblt1`): `cd app && NODE_OPTIONS=--dns-result-order=ipv4first
   ./eski-projeye-yayin.sh "bakim ozru: 150 elmas hediye popup'i + Ben Kimim + mac disi reklam kapisi"`
2. `npx eas login` → `ygzkrblt`; yeni proje: `EAS_SKIP_AUTO_FINGERPRINT=1
   NODE_OPTIONS=--dns-result-order=ipv4first npx eas update --branch production
   --environment production -m "…" --non-interactive`; manifest `createdAt` ile doğrula.
3. Sunucu, `server-gift-20260905` ağacından: `rsync -az --delete --exclude node_modules
   --exclude 'node_modules*' --exclude .env --exclude .git --exclude .cache server/
   root@168.222.180.190:/opt/crossover/server/` → `docker compose up -d --build app`
   (kullanıcı 15:36 UTC: "oynarken atarız, düşerler geri girerler" — yine de rooms=0
   dene). Kanıt: `docker exec crossover-app-1 grep -c apology_gift_20260905
   src/game/rank.ts` ≥ 1; log'da `Migration applied: 0022_apology_gift_20260905.sql`.

**DİKKAT:**
- Prod diskinde repo dışı `server/src/db/migrations/0021_remove_social_pack_token.sql`
  duruyordu (başka oturumun socialtoken kaldırması; kodu prod'a basılmadı, konteyner
  19 saattir aynı, son boot "Versioned migrations applied: 0"). Artık AYNI adla ve
  aynı içerikle `server-gift-20260905` dalında; kod da sütunu kullanmıyor → rsync
  sonrası konteyner açılışında 0021_remove + 0022 birlikte uygulanır. Ana repodaki
  (build-113 çalışma ağacı) peer kopyası birleştirmede çakışmaz (aynı ad, aynı içerik).
- Prod `docker-compose.yml` repo sürümünden farklı (md5 `a8a88d82` ≠ f00c279
  `80dfeb3b`); dokunulmadı, `APOLOGY_GIFT_*` env satırları eklenmedi — kod
  varsayılanları (açık / cutoff / 150) yeterli. Kapatmak için compose environment'a
  `APOLOGY_GIFT_20260905_ENABLED: "0"` ekle + yeniden başlat.
- Sunucu OTA'dan önce açılırsa güncellenmemiş istemciler eski "1 GÜNLÜK SOSYAL
  PAKET / AL" metinli popup'ı görür (ödül yine 150 elmas). OTA iki açılışta iner.
- İki dal henüz push'lanmadı, `build-113` ile birleştirilmedi (merge-base `a8f51cf`).

## 🔴 2026-09-05 — KÖK SEBEP: OTA'LAR MAĞAZA KULLANICILARINA HİÇ ULAŞMIYOR

**Bulgu (doğrulandı, Expo manifest ucundan):** mağazadaki ve TestFlight'taki
derlemeler (148–151, hepsi 27 Ağustos Xcode arşivi) `u.expo.dev/a4d757a9-…`
(ESKİ proje, hesap `ygzkrblt1`) adresine bakıyor. OTA'lar ise `fff58543-…`
(YENİ proje, hesap `ygzkrblt`) adresine basılıyor. İki adres birbirini görmez.

| Proje | Kim bakıyor | Sunulan son güncelleme |
|---|---|---|
| ESKİ `a4d757a9` | mağaza + TestFlight cihazları | **2 Eylül 15:52 UTC** (18:52 TR) |
| YENİ `fff58543` | hiçbir dağıtılmış derleme | 4 Eylül 20:12 UTC (grup `1063e057`) |

Yani telefonlar 2 Eylül akşamındaki paketle donmuş: reklam donması düzeltmesi
(`5aac7c2`), faz kapısı, alınlık düzeltmesi (`a301700`), Ben Kimim, 4 Eylül
OTA'sının tamamı cihazlara HİÇ inmedi. "Kapa-aç yaptım gelmiyor" raporunun
sebebi bu; cihaz ya da expo-updates sorunu değil.

**`ygzkrblt` hesabının eski projeye erişimi YOK** (`Entity not authorized:
AppEntity[a4d757a9]`). Eski projeye yayın için `ygzkrblt1` şart.

### KURAL (yeni mağaza derlemesi çıkana kadar)
Her OTA **İKİ projeye** basılır; önce yeni, sonra eski:
```bash
# 1) yeni proje (ygzkrblt oturumu) — hızlı diskteki klondan, iCloud'dan DEĞİL
cd app && NODE_OPTIONS=--dns-result-order=ipv4first npx eas-cli update \
  --channel production --environment production -m "mesaj" --non-interactive > /tmp/ota-yeni.log 2>&1
# 2) eski proje — ygzkrblt1 ile: ya `npx eas login`, ya da EXPO_TOKEN=<ygzkrblt1 token>
EXPO_TOKEN=... ./eski-projeye-yayin.sh "mesaj"        # app.json'ı geçici çevirir, trap ile geri alır
# 3) doğrula (giriş gerekmez):
#    curl -s -H 'expo-protocol-version: 1' -H 'expo-platform: ios' -H 'expo-runtime-version: 1.0.3' \
#      -H 'expo-channel-name: production' -H 'accept: multipart/mixed' https://u.expo.dev/a4d757a9-39bc-4806-a64a-0d671b946bbe | grep -o '"createdAt":"[^"]*"'
```
**Kalıcı çözüm:** bir sonraki mağaza derlemesi `app.json`'daki `fff58543` ile
çıkar; o derleme yayıldığında (MIN_IOS_BUILD ile eskiler zorlanınca) eski proje
ve `eski-projeye-yayin.sh` emekliye ayrılır.

### Bu paketle giden düzeltmeler (dal `ota-fix`, taban `04844fa`)
- **Reklam maç içinde ASLA** (kullanıcı kuralı): karar `interstitial.ts` içine
  taşındı — faz `home` değilse ya da son 8 sn içinde maça giden bir mesaj
  (find_match / create_room / create_solo / join_room / rövanş / davet / turnuva)
  gönderildiyse `show()` çağrılmaz. App.tsx döngüsü React fazını bir render
  gecikmesiyle görüyordu; damga senkron olduğu için bu delik kapandı.
- **Popup alınlığı**: sarmalayıcı yüksekliği yuva çapına (52) eşitlendi, `top:
  -CREST_H`, `marginTop: CREST_H` — topun altı kartın üst çizgisine tam değer,
  kartın içine girmez, yazı örtülmez; kanatlar pencere şerit renginde.


## ✅ 2026-09-04 — SUNUCU ×2 + OTA + BİRLEŞTİRME (hepsi doğrulandı)

**OTA grubu `1063e057-3de5-4298-a407-5266c62f484e`** (runtime 1.0.3, ios+android),
commit `7b52243`. İçerik: reklam donması (`5aac7c2`), kalan dört açık (`94a0342`),
maç içi faz kapısı düzeltmesi, anticheat, profil çerçevesi, CO-PASS aynası,
Kupa Kalkanı popup'ı, Ben Kimim istemcisi, COF UI 01-04.

**Sunucu (iki kez basıldı):** `set_frame` tek kapı, CO-PASS 19.040 XP eğrisi,
Kupa Kalkanı iadesi ucu; ardından **Ben Kimim + migration `0021`** (20:07 UTC'de
uygulandı, guess-who tablosu oluştu).

**Birleştirme:** iki dal 2 Eylül'de `a8f51cf`'te ayrılmıştı. Baturalp'ın Ben Kimim'i
origin'deydi ama prod'a hiç çıkmamıştı; bizim 18 commit'imiz hiç push'lanmamıştı.
`7b52243` ile birleşti ve `build-113`'e push'landı. 9 çakışan dosyanın hepsi temiz
birleşti; onun `guess-who` satırlarının tamamı doğrulandı.

**Vitrin `4f637be` ETKİSİZ BIRAKILDI** (`days: 7 → 0`): penceresi 3 Eylül'de kaçtı,
basmak uzatma değil bir hafta GERİ SARMA olurdu. Yeni uzatma istenirse
`fromEpochDay`'i gelecek bir Perşembe'ye alıp `days: 7` yap.

### İZLENECEK
- `ADX|...|acik` oranı: 4 Eylül'de 24 saatte 1181 ölçümün 335'i (%28) 20 sn sonra
  hâlâ açıktı. Düzeltme işe yaradıysa bu oran düşmeli — düzeltmenin tek gerçek kanıtı.
  Komut: `docker logs --since 24h crossover-app-1 | grep -c "ADX|ACILDI+ODENMEDI|acik"`
- Ben Kimim'in canlıda gerçekten çalıştığı (ilk kez yayında).

### ⚠️ OTA KOMUTU — BUGÜN ÖĞRENİLENLER (saatler kaybettirdi)
1. **iCloud'daki dizinden BASILAMAZ.** Metro 5 dk paketleyip
   `SyntaxError: [BABEL] ETIMEDOUT: connection timed out, read` ile ölüyor.
   Aynı iCloud okuma hatası git'i, yedeklemeyi ve `expo config`'i de vuruyor.
   Çözüm: repoyu iCloud dışına taşı, ya da hızlı diskte klondan bas.
2. **Çıktıyı boruya (`| tee`) verme.** eas-cli TTY görmeyince kendini
   non-interactive sayar ve `--environment` ister; hata mesajı yanıltıcı olur.
   Log istiyorsan `> dosya 2>&1` kullan.
3. Çalışan biçim (TTY yokken): `--channel production --environment production --non-interactive`.

```bash
cd app && NODE_OPTIONS=--dns-result-order=ipv4first npx eas-cli update \
  --channel production --environment production -m "mesaj" --non-interactive > /tmp/ota.log 2>&1
npx eas-cli update:list --branch production --limit 1   # doğrula
```

### ⚠️ REPO KONUMU
Repo iCloud Desktop'ta olduğu sürece bu duvara tekrar çarpılacak. 4 Eylül'de:
`git fetch` 92 dk asılı, `git status` 4 kez kilitlendi, `.git`'te 5 bozuk index
yedeği, yedekleme `mmap: Operation timed out` ile öldü, OTA 4 kez düştü.
Aynı makinede hızlı diskte: klon saniyeler, `npm install` 16 saniye.
Öneri: `mv ~/Desktop/projects/crossover ~/crossover`.


## ✅ 2026-09-02 21:43 — OTA (runtime 1.0.3, iOS+Android)
Grup `b21a1578-db17-481c-aa0c-0d6e99e232ae`, commit `a301700`. 30 Ağustos'tan bu yana
biriken 44 istemci commit'i: popup COFA alınlığı (madalyon → alınlık → üst çizgi),
Çöz Kazan modu, CO-PASS 50 seviye, "ÖDÜLLERİ TOPLA", hesap seviyesi ayrımı,
reklam düzeltmeleri (3'te 1 kuralı, donma), XOX klavye + tek hücre, mağaza profil
fotoğrafları, monetizasyon (kayıp sonrası 5💎 teklifi kalktı). Sunucu zaten canlıdaydı
(bugün basılmış, migration 0020). Website de senkron (kulüp genişlemesi 2, 786 sayfa).
OTA hesabı: `ygzkrblt` (yagizkarabulutmedya@gmail.com) — ygzkrblt1 oturumu yetkisiz.

## ✅ TAMAMLANDI (2026-09-04, grup 1063e057) — OTA: REKLAM DONMASI DÜZELTMESİ
`5aac7c2` — oyuncu raporu (Rufo, iOS 1.0.3 b151): "reklam gelince reklamdan çıkamıyorum,
oyun donuyor". Prod tanısı: 40 saatte 1609 gösterimin 177'si (%11) 20 sn sonra hâlâ açık.
Kök sebep: reklam, ekranda bir pencere AÇIKKEN sunuluyordu (holdModalSlotForNativeAd
doluluğa bakmıyor; App.tsx modalBlocked yalnız 17 pencereyi biliyor, ekranlardaki 53'ü
bilmiyor) → iOS sunum zinciri kilitleniyor, kapatma düğmesi dokunuş almıyor, CLOSED
gelmediği için slot 180 sn tutulu kalıp uygulamayı da donduruyor.
Düzeltme: slot gerçekten boşsa sunum + kapanış animasyonu payı + show() try/catch +
50 dk'dan eski reklamın atılması; ödüllü reklam yollarında da aynı kapı.
İstemci-yalnız, native değişiklik yok → OTA. Sunucu gerekmez, migration gerekmez.
BU DÜZELTME SIRANIN BAŞINDA — bekleyen diğer OTA kalemleriyle birlikte tek grup basılabilir.

## ✅ TAMAMLANDI (2026-09-04) — bu bölümdeki SUNUCU ve OTA kalemlerinin hepsi canlıya alındı
> Tek istisna: vitrin `4f637be` bilerek ETKİSİZ bırakıldı (penceresi kaçmıştı, bkz. en üst).
> Tarihsel kayıt için bırakıldı, iş listesi DEĞİL.
SUNUCU (`build-113` HEAD, tsc temiz; special-powers-test'teki ExtraTime hatası HEAD'de de var, ilgisiz):
- Vitrin +7 gün (`4f637be`): hafta 3 Eylül yerine 10 Eylül'de döner — 03:00 TR'den ÖNCE basılmalı
- `set_frame` tek kapı (`66858b1`): sezon/mağaza çerçeveleri de aynı uçtan
- CO-PASS eğrisi (`b0609cd`): 19.040 XP, seasonXpForNext; hesap seviyesi değişmez
- Kupa Kalkanı iadesi (`f6955bf`): `shield_refund` ucu; env: SHIELD_REFUND_AD_DAILY_CAP=2,
  SHIELD_REFUND_PACK_DAILY_CAP=1, SHIELD_REFUND_WINDOW_MIN=15 (varsayılanlar, .env'e yazmak şart değil)
- Migration gerekmiyor (trophy_ledger reason='shield_refund' mevcut şemaya yazar)
OTA (runtime 1.0.3, native değişiklik yok):
- REKLAM DONMASI (`5aac7c2`) — yukarıdaki acil kalem, aynı OTA grubuna girer
- Anticheat yanlış uyarısı (`9a22db6`), profil çerçeve şeridi tek liste (`45242b2`),
  CO-PASS eğrisi aynası + Kupa Kalkanı popup akışı (`b0609cd`, `f6955bf`)
- COF UI Foundation (`222fce0`) — yalnız yeni dosyalar + tema köprüsü; hiçbir ekran
  bunları henüz kullanmıyor, görsel etkisi YOK (OTA'ya girmesi zararsız)
- SIRA: sunucu basılmadan OTA çıkarsa kalkan popup'ı "Kalkan kullanılamadı" der (sunucu ucu yok) —
  önce sunucu.

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
