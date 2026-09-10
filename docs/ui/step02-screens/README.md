# Aşama 02 — görsel doğrulama çıktıları

**Kanıt türü: WEB-ONLY.** Görüntüler iOS 26.3 simülatöründe (iPhone, 1206×2622 px)
Safari ile alındı; sayfa, Expo Web olarak dışa aktarılmış bir **kabuk vitrinidir**.
Vitrin gerçek `CofBottomNav`, `RootScreenShell`, `DetailScreenShell` ve
`useCofContentInset` bileşenlerini kullanır; içerik demo kartlardır. **Sunucu
durumu kullanılmadı, üretim verisi üretilmedi.** Derleme başarısı görsel
doğrulamanın yerine geçmez; bu görüntüler o yüzden alındı.

Safe-area değerleri vitrinde simüle edilir: 390×844 ve 430×932 için üst 47 / alt 34,
360×800 için üst 24 / alt 0.

| Dosya | Durum | Doğrulanan kabul kriteri |
|---|---|---|
| 01-390x844-oyun-aktif.png | Oyun aktif | Orta kontrol brand.primary + koyu ikon; yalnız bir sekme aktif; son kart navigasyonun üstünde |
| 02-390x844-koleksiyon-aktif.png | Koleksiyon aktif | Orta top NÖTR (surface.strong), yeşil halo yok; aktif sekmede tint yüzey + 3 dp çizgi |
| 03-390x844-arkadaslar-klavye-kapali.png | Arkadaşlar aktif | Rozet sayısı; tek aktif hedef; üst kaynak satırı hizası |
| 04-390x844-profil-detay-nav-yok.png | Profil detay | Geri butonu var, **alt navigasyon YOK**; aynı anda ikisi gösterilmiyor |
| 05-360x800-magaza-son-oge.png | Mağaza | Son öğe navigasyonun tamamen üstünde (76 + safeArea + 24) |
| 06-360x800-arkadas-kodu-klavye-acik.png | Klavye açık | Bar aşağı kayıp gizlendi; input ve GÖNDER görünür |
| 07-430x932-turnuvalar-kaynak-alani.png | Turnuvalar | Diğer kök ekranlarla aynı üst kaynak alanı ve safe-area başlangıcı |

## Yeniden üretme

```bash
cd app && npx expo export --platform web --output-dir <dizin>   # vitrin girişiyle
cd <dizin> && python3 -m http.server 8100
xcrun simctl openurl <UDID> "http://localhost:8100/sN.html"      # N = 1..7
xcrun simctl io <UDID> screenshot out.png
```

**Bilinen tuzak:** aynı kabuk oturumunda arka arkaya çekim yapılırsa simülatör
Safari bir önceki durumu gösterebiliyor. Her durum AYRI bir kabuk çağrısında,
Safari kapatılıp ~45 sn beklenerek alınmalı; her görüntünün üstündeki
"DURUM n" rozeti hangi durumun çekildiğini doğrular.
