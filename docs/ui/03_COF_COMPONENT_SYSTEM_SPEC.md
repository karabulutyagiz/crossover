# COF Görsel Bileşen Sistemi — Adım 03

Sürüm: 1.0.0  
Kapsam: Yalnız görsel arayüz  
Önkoşul: Adım 01, 01.1 ve 02 tamamlanmış olmalı

## 1. Amaç

Bu adım COF'un tekrar eden arayüz parçalarını tek, tutarlı ve üretim kalitesinde bir görsel dile taşır. Ekranların bilgi mimarisi veya akışları yeniden tasarlanmaz. Ana ekran ve diğer ekranlara özgü büyük kompozisyon değişiklikleri sonraki adımlara bırakılır.

Hedeflenen ortak sistem:

- Butonlar
- Kartlar ve paneller
- Segmented tab ve filtreler
- Rozetler ve durum etiketleri
- Metin girişleri
- İkonlu dokunma kontrolleri
- Eski ortak bileşenler için uyumluluk adaptörleri

## 2. Kesin kapsam dışı alanlar

Bu adımda aşağıdakilere hiçbir şekilde dokunulmayacaktır:

- Ses efektleri, müzik, ses dosyaları, ses yöneticisi ve ses ayarları
- Haptic, titreşim, vibration ve bunların çağrıları
- Oyun kuralları, ekonomi, fiyatlar, ödüller ve reklam davranışı
- Navigasyon rotaları, pager state'i, geri davranışı ve derin bağlantılar
- Sunucu, kimlik doğrulama, analitik ve bildirim mantığı
- Metin içeriklerinin anlamı ve i18n anahtarları
- Görsel asset üretimi veya mevcut assetlerin değiştirilmesi
- Ekrana özgü büyük yerleşim yeniden tasarımları

Mevcut bir ortak bileşende ses veya haptic çağrısı varsa çağrının yeri, zamanı ve parametreleri korunur; eklenmez, silinmez, taşınmaz ve yeniden düzenlenmez.

## 3. Kaynaklar ve otorite sırası

1. `app/src/cof/01_COF_UI_TOKENS.json` v1.0.2
2. `docs/ui/01_COF_UI_FOUNDATION_SPEC.md`
3. `docs/ui/02_COF_ROOT_SHELL_SPEC.md`
4. Bu belge
5. Mevcut çalışan davranış

Renk, tipografi, boşluk, yarıçap, yükseklik ve derinlik için ekranda ham değer yazılmaz. Eksik bir ihtiyaç varsa önce mevcut semantik token veya adaptör kullanılır; yeni ham stil ekran dosyasına dağıtılmaz.

## 4. Adım 02 düzeltme kapısı

Adım 02 raporundaki kök ekranlarda kalan fazladan `22 dp` alt şerit bu adımın başında düzeltilir.

- Kök sekmelerde kaydırılan içeriğin dinlenme boşluğu, alt navigasyon rezervinden sonra tam `24 dp` olmalıdır.
- `Screen` sarmalayıcısındaki eski `22 dp` yalnız kök kabuk kullanımında etkisizleştirilir veya tek hesaba katılır.
- Maç, soru, sonuç ve diğer oyun içi ekranların mevcut boşluğu değişmez.
- Detay ekranlarında alt navigasyon olmadığı için mevcut `safeArea.bottom + 24 dp` politikası korunur.
- `0`, `20` ve `34 dp` alt güvenli alan değerleri otomatik test edilir.

## 5. Bileşen sözleşmeleri

### 5.1 Buton

Kanonik bileşen `CofButton` olmalıdır. Varyantlar:

| Varyant | Kullanım | Zemin | Metin |
|---|---|---|---|
| `primary` | Ana ilerleme eylemi | `brand.primary` | `text.onPrimary` |
| `secondary` | İkinci seviye eylem | `surface.strong` | `text.onSecondary` |
| `reward` | Ödül, satın alma, açma | `reward.gold` | `text.onGold` |
| `ghost` | Düşük ağırlıklı eylem | şeffaf/canvas | `text.primary` |
| `danger` | Yıkıcı veya hata eylemi | `semantic.error` | `text.onError` |

Boyutlar token dosyasındaki `58 / 50 / 42 dp` sistemini kullanır. Birincil ve ödül butonlarında tokena bağlı, tutarlı `5 dp` görsel ekstrüzyon bulunur; basma sırasında içerik yerleşimi zıplamaz.

Durumlar:

- Normal
- Pressed
- Loading
- Disabled

Kurallar:

- Minimum dokunma alanı `44 × 44 dp`.
- Loading durumunda butonun genişliği ve yüksekliği değişmez; erişilebilir etiketi korunur.
- Disabled yalnız soluklukla anlatılmaz; kontrast, ikon veya durum semantiği birlikte kullanılır.
- Ana CTA etiketi küçültülmez ve tek satırdır. Taşan kopya geliştirme uyarısı üretir.
- Secondary ve compact etiketler gerekirse en fazla `0.90` ölçeğe iner. `allowTwoLines` açıksa iki satır kullanır ve ölçekleme yapmaz.
- Canlı metin kullanılır; buton yazısı görsele gömülmez.
- Sıradan butonda neon glow, çok renkli gradient veya ekran bazlı rastgele gölge kullanılmaz.

### 5.2 Kart ve panel

Kanonik yüzey `CofCard`/`CofSurface` üzerinden üretilir.

| Varyant | Görsel işaret |
|---|---|
| `base` | Sakin standart yüzey |
| `interactive` | Dokunulabilirliği hafif derinlikle anlatır |
| `selected` | Semantik kenarlık + işaret/etiket; yalnız renge dayanmaz |
| `reward` | Altın vurgu, sınırlı kullanım |
| `premium` | Premium semantik vurgu, sınırlı kullanım |
| `disabled` | Etkileşimsiz durum, okunur içerik |

Kurallar:

- İç boşluk ve radius yalnız token ölçeğinden gelir.
- Aynı hiyerarşide kartların kenarlık kalınlığı ve gölgesi tutarlı olur.
- Eski ağır siyah çerçeve ortak bileşen üzerinden üretildiyse yeni derinlik sistemine taşınır.
- Kart seçimi yalnız yeşil çerçeveyle anlatılmaz; check, etiket veya belirgin konum işareti eklenir.
- Ödül ve premium etkileri sıradan bilgi kartlarına yayılmaz.
- Kartın tamamı dokunulabiliyorsa içindeki dekoratif alt kontrol ayrı bir sahte buton gibi görünmez.

### 5.3 Segmented tabs

Kanonik bileşen `CofSegmentedTabs` olur.

- Seçili: `brand.primaryTint` zemin, `brand.primary` kenarlık ve metin; ikon veya gösterge ile ikinci işaret.
- Pasif: sakin yüzey, `text.secondary` veya `text.tertiary`; okunabilir ve dokunulabilir.
- Disabled: pasiften açıkça farklı ve etkileşimsiz.
- Sekme değişiminde yükseklik, genişlik ve çevre yerleşimi değişmez.
- Uzun Türkçe etiketler `360 dp` genişlikte kırpılmaz; gerekirse uygun sıkı ölçü veya iki satırlı açık varyant kullanılır.
- Yatay kaydırma, pager veya route mantığı değiştirilmez.

### 5.4 Rozetler

Kanonik bileşen `CofBadge` olur. Desteklenecek semantik türler:

- `quantity`
- `notification`
- `new`
- `owned`
- `active`
- `rarity`
- `premium`
- `info`
- `error`
- `streak`

Her tür tokenlardaki karşılık gelen `on…` ön plan rengini kullanır. Sayısal rozetler yerel sayı biçimlendirmesinden geçer. Rozet yalnız renge bağlı kalmaz; metin, sayı, ikon veya şekil ayrımı taşır. Dekoratif rozetler ekran okuyucudan gizlenebilir; bilgi taşıyanlar erişilebilir etikete dahil edilir.

### 5.5 Metin girişleri

Kanonik bileşen `CofInput` olur. Durumlar:

- Default
- Focused
- Filled
- Error
- Disabled

Kurallar:

- Görsel yükseklik bağlama göre `48–52 dp`, dokunma alanı en az `44 dp`.
- Label, girilen metin, placeholder, yardımcı metin ve hata metni ayrı semantik renklere sahiptir.
- Focus yalnız renkle değil kenarlık veya belirgin yüzey değişimiyle görünür.
- Error mesajı yerleşimi beklenmedik biçimde zıplatmaz; ayrılmış veya öngörülebilir yardım alanı kullanılır.
- iOS/Android klavye türü, submit davranışı, otomatik düzeltme ve mevcut callbackler değişmez.
- Şifre, kod veya kullanıcı adı girişinin iş mantığına dokunulmaz.

### 5.6 İkon kontrolleri

- Tüm dokunulabilir ikonlar en az `44 × 44 dp` hedefe sahiptir.
- İkon çizimi küçük olabilir ancak hitSlop veya kapsayıcı hedefi tamamlar.
- Geri, kapat, kopyala, ekle ve düzenle ikonlarının mevcut davranışı korunur.
- Dekoratif ikonlar erişilebilirlik ağacını kirletmez.

## 6. Eski bileşenlerle uyumluluk

Mevcut `Btn`, `GamePanel` ve `SegmentedTabs` doğrudan silinmez.

1. Önce tüm prop ve kullanım biçimleri aranır.
2. Davranış eşdeğerliği kanıtlanabiliyorsa eski export ince bir adaptöre çevrilir.
3. Eşdeğerlik kanıtlanamıyorsa eski bileşen yerinde bırakılır; yalnız düşük riskli ortak çağrılar yeni bileşene geçirilir.
4. Toplu regex değişimiyle ekranlara yeni prop uydurulmaz.
5. State sahipliği, callback sırası, disabled/loading şartları ve test kimlikleri korunur.

Bu adımın hedefi ortak sistemin güvenli kurulmasıdır; her ekranı zorla aynı anda geçirmek değildir.

## 7. Görsel kalite kuralları

- Ekranda aynı önemdeki nesneler aynı component varyantını kullanır.
- Bir ekranda bir baskın CTA bulunur; eşit ağırlıklı çok sayıda parlak yeşil buton oluşturulmaz.
- Yeşil etkileşim/başarı, altın ödül/ilerleme, mor premium, kırmızı hata/tehlike için saklanır.
- Lacivert yüzeyler arasında ayrım yalnız siyah konturla değil token yüzey katmanlarıyla kurulur.
- Metin ve ikonlar dekoratif görsellerin içine gömülmez.
- Normal kontrollerde aşırı parlama, çoklu dış çizgi ve birbirinden farklı 3B buton stilleri kullanılmaz.
- Font aileleri mevcut `COFDisplay` ve `COFUI` eşlemesiyle sınırlıdır.

## 8. Zorunlu component gallery

Gerçek hesap gerektirmeyen, geliştirme ortamında erişilen bir component gallery oluşturulur. Production navigasyona veya kullanıcı menüsüne eklenmez.

Gallery şunları aynı kaynak bileşenlerle gösterir:

- Beş buton varyantının dört durumu
- Uzun Türkçe CTA ve secondary örnekleri
- Altı kart varyantı
- Seçili/pasif/disabled segmented tabs
- Tüm rozet türleri
- Beş input durumu
- 44 dp ikon hedefi örnekleri
- `CofNumber` ile değişen sayaç genişliği

Ekran görüntüleri:

- `360 × 800`
- `390 × 844`
- `430 × 932`
- En az bir görünümde yüzde 120 yazı ölçeği veya eşdeğer font-scale testi

Mümkünse üretim hesabı oluşturmadan erişilebilen en az bir gerçek ekran da yeni ortak bileşenlerle görüntülenir. Bu mümkün değilse bunun gallery kanıtı olduğu açıkça raporlanır; demo görüntü gerçek ekran diye sunulmaz.

## 9. Otomatik doğrulama

En az aşağıdakiler test edilmelidir:

- Her buton varyantının doğru zemin/ön plan token eşleşmesi
- Buton kontrast politikası
- Loading/disabled durumlarında sabit geometri
- Ana CTA'nın küçülmemesi; secondary sınırının `0.90` olması
- Tüm dokunma hedeflerinin en az `44 dp` olması
- Selected kart ve tab durumunun yalnız renkle anlatılmaması
- Rozet ön plan eşlemeleri ve yerel sayı biçimi
- Input durumlarının stil ve erişilebilirlik eşlemeleri
- Kök ekranlarda nihai alt dinlenme boşluğunun tam `24 dp` olması
- Maç ve oyun içi ekranların eski alt boşluğunun değişmemesi
- Eski adaptörlerin callback/disabled/loading davranış eşdeğerliği
- TypeScript kontrolü ve iOS/Android/web Expo export
- Daha önceki foundation, shell, format ve ad-slot testlerinin gerilememesi

## 10. Kabul ölçütü

Adım 03 yalnız şu şartlarda tamamlanır:

- Ortak component API'leri tipli ve merkezi olmalıdır.
- Yeni ortak bileşenlerde ham renk/font/radius/spacing dağılmamalıdır.
- Kök boşluk düzeltmesi maç ekranlarını etkilemeden yapılmalıdır.
- Gallery dört gerekli görsel koşulu kanıtlamalıdır.
- Mevcut davranışlar, route'lar, callbackler ve iş mantığı korunmalıdır.
- Ses, müzik, haptic ve titreşim dosyalarında diff olmamalıdır.
- Tüm test ve exportlar geçmelidir.
- Son rapor değiştirilmiş dosyaları, taşınan çağrıları, bırakılan eski çağrıları, doğrulama sonuçlarını ve doğrulanmamış varsayımları açıkça listelemelidir.

Adım tamamlanınca durulur. Ana ekran kompozisyonu, Mağaza, Koleksiyon, Arkadaşlar, Profil veya Turnuva ekranlarının özgün yeniden tasarımına geçilmez.
