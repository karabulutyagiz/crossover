# Apple Ads — Anahtar Kelime Planı (Türkiye)

> Kurulum: ads.apple.com → Advanced. 4 ayrı kampanya (Apple'ın standart yapısı) —
> her birinin bütçesi ve teklifi ayrı yönetilir. Tüm hedefleme: **yalnız Türkiye, iPhone+iPad**.
> Teklifler başlangıç değerleri — 3-4 gün veri sonra kelime bazında ayarlanır.
> Kur notu: hesap USD faturalanır; ₺ karşılıkları ~₺40/$ üzerinden yaklaşıktır.

## Kampanya 1 — MARKA (exact match) · günlük ~₺30
Amaç: adımızı arayanı rakip kapmasın. Ucuzdur, dönüşümü en yüksek trafiktir.

| Kelime | Eşleşme | Teklif |
|---|---|---|
| crossover football | Exact | $0.10 (~₺4) |
| crossover futbol | Exact | $0.10 |
| cof futbol | Exact | $0.10 |

## Kampanya 2 — MEKANİK (exact match) · günlük ~₺100 — ANA KAMPANYA
Amaç: tam bizim oyunu arayan kişi. Hacim düşük ama niyet mükemmel.

| Kelime | Eşleşme | Teklif |
|---|---|---|
| ortak oyuncu | Exact | $0.20 (~₺8) |
| ortak futbolcu | Exact | $0.20 |
| iki takımda oynayan | Exact | $0.20 |
| iki takımda da oynadı | Exact | $0.20 |
| 321 oyunu | Exact | $0.20 |
| 321 futbol oyunu | Exact | $0.20 |
| 3 2 1 oyunu | Exact | $0.20 |
| 321 ortak futbolcu | Exact | $0.25 — rakip marka adı DEĞİL, jenerik format+tür; adında 321 geçen 3 rakip bu sorguda organikte önde, reklam tek geçiş yolu |
| futbolcu tahmin oyunu | Exact | $0.25 |
| futbolcu tahmin | Exact | $0.25 |
| futbolcu bilme oyunu | Exact | $0.20 |
| futbolcu kim | Exact | $0.20 |
| kariyerinden futbolcu bul | Exact | $0.15 |
| futbol bulmaca | Exact | $0.25 |
| futbol quiz | Exact | $0.30 (~₺12) |
| futbol bilgi yarışması | Exact | $0.30 |
| futbol bilgi oyunu | Exact | $0.25 |
| futbol trivia | Exact | $0.20 |
| guess the footballer | Exact | $0.20 |
| football quiz türkçe | Exact | $0.15 |

## Kampanya 3 — JENERİK (exact match) · günlük ~₺70
Amaç: geniş "futbol oyunu" trafiği. Hacim yüksek, alaka orta — teklif düşük tutulur,
CPA bozarsa kelime kapatılır.

| Kelime | Eşleşme | Teklif |
|---|---|---|
| futbol oyunu | Exact | $0.30 |
| futbol oyunları | Exact | $0.30 |
| online futbol oyunu | Exact | $0.25 |
| arkadaşla futbol oyunu | Exact | $0.20 |
| 2 kişilik oyun | Exact | $0.20 |
| 2 kişilik online oyun | Exact | $0.20 |
| arkadaşla oynanan oyun | Exact | $0.20 |
| bilgi yarışması | Exact | $0.25 |
| bilgi yarışması oyunu | Exact | $0.25 |
| quiz oyunu | Exact | $0.20 |
| canlı bilgi yarışması | Exact | $0.20 |

## Kampanya 4 — KEŞİF (broad + Search Match AÇIK) · günlük ~₺50
Amaç: kelime madenciliği — Apple'ın bulduğu aramalardan iyi dönüşenler
zamanla Kampanya 2/3'e exact olarak taşınır.

- Broad: `futbol tahmin`, `futbolcu oyunu`, `futbol yarışma`
- Search Match: AÇIK (yalnız bu kampanyada)
- **Negatif (exact):** yukarıdaki tüm exact kelimeler (çift harcamayı önler)

## TÜM kampanyalar için negatif kelimeler
Alakasız/dönüşmez trafiği baştan kes:

```
fifa · efootball · pes · dream league · fantezi futbol · fanteziler
iddaa · bahis · canlı bahis · canlı maç · maç izle · canlı skor
taraftar · transfer haberleri · futbol haber · fm · football manager
```

## Toplam: günlük ~₺250 (≈$6) · 2 hafta test ≈ ₺3.500

### Başarı ölçütleri (panel + Apple Ads raporu birlikte)
- Kelime bazında CPA (indirme başı maliyet) hedefi: **< ₺25**
- 2 hafta sonunda: CPA > ₺40 olan kelimeyi kapat, < ₺15 olanın teklifini %20 artır
- Panelden izlenecek: reklam dönemi DAU artışı, yeni kullanıcı → satış/reklam izlenme dönüşümü

### Kurulum sırası hatırlatması
1. 1.0.1 App Store onayı BEKLENİYOR — kampanya ondan önce BAŞLATILMAZ (paralı
   kullanıcıyı donma hatalı build 122'ye düşürmemek için).
2. ads.apple.com hesabı + ödeme kartı: hesap sahibi girer (Claude giremez).
3. Kampanyalar bu dosyadan kopyalanır; CPP (özel ürün sayfası) v2'de düşünülür.
