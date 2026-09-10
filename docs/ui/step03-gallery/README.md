# Adım 03 — bileşen galerisi görsel kanıtı

**Kanıt türü: WEB-ONLY.** Görüntüler iOS 26.3 simülatöründe (iPhone, 1206×2622 px)
Safari ile alındı. Sayfa, `app/src/cof/gallery.tsx` içindeki **gerçek** `CofGallery`
bileşeninin Expo Web dışa aktarımıdır; ekranların kullandığı aynı `CofButton`,
`CofSurface`, `CofSegmentedTabs`, `CofBadge`, `CofInput`, `CofIconButton` ve
`CofNumber` kodunu çizer. Statik HTML benzetimi veya elle üretilmiş görüntü YOKTUR.

Galeri üretim navigasyonuna bağlı değildir: `App.tsx` içindeki `COF_GALLERY_MODE`
bayrağı (varsayılan **false**) ile açılır — projenin mevcut `DEV_SHOT_MODE`
kalıbının aynısı. Menüde, route'ta veya derin bağlantıda görünmez.

**Viewport tekniği:** simülatör cihazı 390 CSS px genişliğindedir. Diğer
genişlikler `html{zoom:Z}` ile üretildi; etkin CSS viewport = 390 / Z.

| Dosya | Etkin viewport | zoom | İçerik |
|---|---|---|---|
| 01-390x844-butonlar.png | 390 dp | 1.00 | 5 varyant × 4 durum (normal/loading/disabled/locked), uzun Türkçe CTA'lar |
| 02-360x800-kartlar-tablar.png | 360 dp | 1.0833 | 6 kart varyantı, segmented tab (seçili/pasif/disabled) |
| 03-430x932-rozetler-sayac.png | 430 dp | 0.9070 | 13 rozet türü, CofNumber orantılı vs sabit genişlik |
| 04-390x844-inputlar-ikon-hedefleri.png | 390 dp | 1.00 | 5 input durumu, 44 dp ikon hedefleri |
| 05-yazi-olcegi-120.png | 325 dp | 1.20 | %120 yazı ölçeği eşdeğeri (metin ekrana göre %20 büyük) |

**%120 ölçek notu.** Uygulama `app/src/nativeTextDefaults.ts` içinde
`allowFontScaling` değerini genel olarak **kapatır**; bu yüzden iOS Dynamic Type
uygulamayı etkilemez ve gerçek bir dinamik-yazı testi uygulanabilir değildir.
Eşdeğer koşul sayfa ölçeğiyle kuruldu: `zoom: 1.2` metni ekrana göre %20
büyütür (etkin viewport 325 dp'ye düşer), yani daha dar ekranda daha büyük yazı
— sığma açısından daha zor bir sınav. Görüntü bu şekilde etiketlenmiştir.

## Kapsanmayan

- **Gerçek uygulama ekranı görüntüsü yok.** Mağaza/Koleksiyon/Arkadaşlar gibi
  ekranlara ulaşmak sunucuya giriş, yani üretimde hesap açmayı gerektiriyordu;
  yapılmadı. Buradaki görüntüler GALERİ kanıtıdır, gerçek ekran diye sunulmaz.
- **Gerçek cihazda parmak davranışı doğrulanmadı**: yatay carousel jestleri,
  basılı-tutma ve gerçek klavye etkileşimi cihazda denenmedi.

## Yeniden üretme

```bash
# App.tsx içinde COF_GALLERY_MODE = true  (ya da geçici bir giriş dosyası)
cd app && npx expo export --platform web --output-dir <dizin>
cd <dizin> && python3 -m http.server 8101
xcrun simctl terminate <UDID> com.apple.mobilesafari
xcrun simctl openurl <UDID> "http://localhost:8101/<sayfa>.html"
sleep 45 && xcrun simctl io <UDID> screenshot out.png
```

Her durum AYRI bir kabuk çağrısında alınmalı ve Safari kapatılıp ~45 sn
beklenmeli; aksi halde simülatör Safari bir önceki sayfayı gösteriyor.
