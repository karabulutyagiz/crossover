# Adım 04 — Ana Oyun Ekranı Görsel Yeniden Tasarımı

Kaynak spec: `docs/ui/04_COF_HOME_SCREEN_SPEC.md` (sürüm 1.0.0)
Önkoşul adımlar: 01, 01.1, 02, 03 — tamamlandı.

## Ne değişti

Ana ekran, tek viewport'a sıkıştırılan bir dashboard olmaktan çıkıp doğal
kaydırılan, beş bölgeli bir lobiye dönüştü.

| # | Bölge | İçerik |
|---|---|---|
| 1 | Oyuncu başlığı | Profil hapı (ad + seviye/XP), elmas kapsülü, bildirim, ayar |
| 2 | Oyun odağı | CROSSOVER logosu, kupa/sıra chip'leri, **Hemen Oyna** |
| 3 | Maç seçenekleri | Diğer Modlar · Özel Oda · Bot Maçı |
| 4 | İlerleme | Arena ilerleme modülü (açık metin + çubuk) |
| 5 | Günlük alan | Sosyal paket · Seviye Yolu · Günün Sorusu |

### Kaldırılan sıkıştırma

Eski ekran `homeScale` katsayısıyla her kartı cihaz yüksekliğine göre
küçültüyordu (`heroBoxH`, `playH`, `primaryCardH`, `secondaryCardH`,
`carouselCardH`, `gapSm`, `gapMd`). Bu, küçük telefonlarda okunabilirliği ve
premium hissi düşürüyordu (spec §3.6). Tamamı kaldırıldı; ekran artık
`Screen scroll` ile doğal kayıyor ve alt içerik rezervini kök kabuk
politikasından alıyor — ekran kendi tab-bar boşluğunu EKLEMİYOR.

### Bölge bölge

**1. Oyuncu başlığı.** Yardımcı ikon sayısı spec §5.2 gereği ikiye indi
(bildirim + ayar). Maç geçmişi saati kaldırıldı; işlev kaybolmadı — aynı popup
Profil ekranından `onOpenMatchHistory` ile açılıyor. Takılı çerçevenin taç
taşması ve ödül habercisi için ayrılan `paddingTop` rezervi aynen korundu.

**2. Oyun odağı.** Logo yüksekliği 112–132 dp bandına kelepçelendi. Kupa ve
sıra artık logonun üstünde yüzen iki daire değil, altında duran iki bilgi
chip'i; her biri 44 dp hedef ve yön göstergesi taşıyor. Kupa uçuşunun ölçüm
hedefi (`innerRef`), sayaç animasyonu (`countAnim`) ve altın dolum süpürmesi
(`fillAnim`) chip'e birebir taşındı — ödül akışı davranışı değişmedi.
**Hemen Oyna** artık `CofButton` primary; `findMatch` çağrısı, bakım kapısı ve
`UI_PLAY` geri bildirimi aynı. Yükleniyor durumu mevcut `searching` fazının
yansıması, yeni mantık eklenmedi.

**3. Maç seçenekleri.** Diğer Modlar tam genişlikte tek dokunma hedefi; içinde
ikinci sahte buton yok, ok yalnız yön göstergesi. YENİ rozeti başlığın yanına
alındı çünkü sağ üst köşede iki top sanatının üstüne biniyordu. Özel Oda ve Bot
Maçı 390/430 dp'de yan yana, 360 dp'de veya büyük OS yazı ölçeğinde alt alta
iniyor (sıkıştırma yok). Oda kodu alanı `CofInput`'un **ilk üretim
tüketicisi**: klavye tipi, submit, büyük harf dönüşümü ve tüm callback'ler
aynı; katılma oku artık input'un kendi 44 dp'lik trailing kontrolü.

**4. İlerleme.** Arena küçük bir kutu olmaktan çıkıp tam genişlikli modüle
dönüştü: solda arena görseli, sağda ad, açık metin kupa ilerlemesi (`74 / 200`)
ve altın progress bar. Bar CTA zümrüdünü taklit etmiyor. Sonraki arena verisi
yoksa satır çizilmiyor — uydurma yok.

**5. Günlük alan.** Üç kart artık tek bir `HomeDailyCard` bileşeninden çıkıyor:
aynı radius, iç boşluk, başlık stili ve yön göstergesi. Durum badge'i üstte,
açıklama altta. Eski düzen üç kartı tek satıra zorluyordu (kart ≈ 114 dp) ve
başlığı `GÜNÜN SO...` diye kırpıyordu; iki sütunlu grid kartı ≈ 169 dp'ye
çıkarıyor ve başlık tam sığıyor.

Spec §9 karusel ile grid arasında serbest bırakıyor. **Grid seçildi**: ana
sekmeler yatay bir pager içinde yaşıyor (Adım 02) ve ana ekranın içine ikinci
bir yatay kaydırıcı koymak Android'de pager ile jest çakışması üretiyor.

## Yeni dosyalar

| Dosya | İçerik |
|---|---|
| `app/src/cof/homePolicy.ts` | Saf (RN'siz) yerleşim politikası: sütun sayısı, kart genişliği, logo bandı, arena ilerlemesi |
| `app/scripts/cof-home-test.ts` | 54 sözleşme testi |

## Adım 03 bileşenlerine eklenenler

`CofSurface` ve `CofButton`'a `onPressIn` geçişi eklendi. Gerekçe: eski ana
ekran kartları basma anında `triggerFeedback(...)` çağırıyordu. Kartlar token
sistemine taşınırken bu çağrılar kaybolsaydı ses/haptik alanında diff oluşurdu
— spec'in kesin sınırı bunu yasaklıyor. Bileşenler hâlâ ses/haptik BİLMİYOR;
çağrıyı ekran yapıyor.

## Testler

| Suite | Sonuç |
|---|---|
| `cof-foundation-test` | 72 ok |
| `cof-shell-test` | 68 ok |
| `cof-component-test` | 203 ok |
| `cof-home-test` | 54 ok |
| `ad-slot-test` | 12 ok |

TypeScript `--noEmit`: hatasız.

## Görsel kanıt

Görüntüler `docs/ui/step04-home/` altında. Hepsi **native iOS Release
derlemesinden** alınmıştır (Expo web export değil): web export yazı tiplerini
ve metin ölçümlerini farklı çiziyor ve gerçek kırpılmaları gizliyor.

Veri kaynağı: `HomeShotScreen` fixture'ı (`app/src/screens.tsx`). Gerçek
`HomeScreen` bileşeni, gerçek store sözleşmesiyle çizilir; `actions` her
çağrıyı yutan bir Proxy'dir ve ağ açılmaz — production hesabına hiçbir şey
yazılmaz.

## Kapsam dışı bırakılanlar

- Ses, müzik, audio yöneticisi, haptic, vibration: sıfır diff.
- Matchmaking, bot, oda, kupa, rank, ödül, reklam ve ekonomi mantığı: dokunulmadı.
- Navigasyon, pager, alt bar, detay rotaları: dokunulmadı.
- Yeni görsel asset üretilmedi; mevcut asset dosyaları değiştirilmedi.
