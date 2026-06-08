# Crossover — Tanıtım Sitesi

Modern, 3D animasyonlu, tek dosyalık (vanilla HTML/CSS/JS — build adımı yok) landing page.
Görseller, oyunun **iOS simülatöründen** alınmış gerçek ekran görüntüleridir.

## Açmak için
```bash
# Çok-sayfalı yapı kök yollar (/styles.css, /nasil-oynanir/ …) kullanır,
# bu yüzden bir sunucuyla servis edilmelidir (file:// ile değil):
cd website && python3 -m http.server 8090
# → http://localhost:8090
```

## Sayfalar (her biri ayrı path)
| Path | İçerik |
|---|---|
| `/` | Hero (fareyle eğilen 3D telefon), logo marquee, "Keşfet" kart grid'i |
| `/nasil-oynanir/` | 4 adımlık tur + 3·2·1 geri sayım üçlüsü |
| `/dogrulama/` | Doğru (Sneijder: Gala+Inter ✓) vs Yanlış (Drogba: sadece Gala ✕) |
| `/ozellikler/` | Özellik grid'i + kulüp logosu marquee |
| `/indir/` | Lobby ekranı + App Store / Google Play afişi |

## Yapı
- `index.html` + her alt sayfa kendi klasöründe `index.html` (temiz yollar).
- `styles.css` — tüm ortak stiller (tema app ile birebir: #0B1020 / #3DDC84 / #F5C518).
- `app.js` — scroll-reveal, hero parallax, logo marquee, mobil menü, aktif nav (hepsi null-güvenli, her sayfada paylaşılır).
- Emoji yok: tüm ikonlar inline SVG. Build adımı yok.

## `screens/` — ekran görüntüleri
iPhone 17 Pro simülatöründen alındı: `home`, `lobby`, `countdown3/2/1`, `pick`, `guess`,
`correct`, `wrong`. Otantik olmaları için Galatasaray + Inter, Wesley Sneijder (doğru) ve
Didier Drogba (yanlış) gerçek veri/kariyerleriyle hazırlandı.
