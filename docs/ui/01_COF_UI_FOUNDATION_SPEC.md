# CrossOver Football — UI Foundation 01

Sürüm: **1.0.1**

## Amaç

Bu belge, CrossOver Football arayüzünün bütün ekranlarında kullanılacak tek görsel sistemi tanımlar. Bu aşamanın görevi ekranları yeniden tasarlamak değil; daha sonra yapılacak her ekran düzenlemesinin aynı renk, ölçü, kart, buton, tipografi, animasyon ve asset dilini kullanmasını garanti etmektir.

Kaynak gerçekliği `01_COF_UI_TOKENS.json` dosyasıdır. Kod içindeki rastgele hex, radius, spacing, shadow ve duration değerleri zamanla bu tokenlara bağlanmalıdır.

## Değişmeyecek kimlik

- Koyu lacivert futbol dünyası
- Zümrüt yeşili ana etkileşim rengi
- Kupa, başarı ve ilerlemede altın
- Elmas ve premium öğelerde mor
- Güçlü, yuvarlak ve kolay okunan oyun tipografisi
- Rekabetçi ancak samimi futbol bilgisi atmosferi
- İki top/CROSSOVER fikrinin marka çekirdeği
- iOS ve Android'de birebir aynı görsel sonuç

## Kesinlikle yapılmayacaklar

- Clash Royale ekranlarını veya assetlerini kopyalamak
- Her öğeye parlama, neon veya metal efekti eklemek
- Normal arayüz kartlarını ödül itemleri kadar detaylı yapmak
- Aynı ekranda zümrüt 3D, mavi-pembe cyber ve düz kurumsal butonları karıştırmak
- Metni PNG butonun içine gömmek
- Sabit ölçülü ekran görüntülerini buton veya kart olarak kullanmak
- İş mantığını, API'leri, navigasyon akışını veya ekonomiyi bu temel aşamada değiştirmek
- Yeni paket eklemek veya mevcut bağımlılıkları sebepsiz yükseltmek
- iOS ve Android için farklı asset veya ölçü üretmek

## Ana görsel kural

COF üç katmandan oluşur:

1. **Dünya:** Koyu lacivert arka plan, düşük opaklıklı saha/çapraz çizgi deseni ve kontrollü derinlik.
2. **Arayüz:** Okunabilir kartlar, sekmeler, navigasyon ve formlar. Bunlar sakin kalır.
3. **Ödül:** Kupa, çerçeve, arena, güç ve özel itemler. Parlaklık ve detay burada kullanılır.

Arayüz sakin kaldığında ödül gerçekten değerli görünür. Her şey parlarsa hiçbir şey özel görünmez.

## Renk rolleri

- **Zümrüt:** Ana aksiyon, aktif sekme, seçili item, başarı
- **Altın:** Kupa, ilerleme, ödül, önemli sayı
- **Mor:** Elmas, premium içerik ve rarity
- **Mavi:** İkincil aksiyon ve bilgi
- **Kırmızı:** Hata, mağlubiyet veya gerçekten acil sayaç
- **Turuncu:** Seri ve ateş teması

Renkler yalnızca dekor değildir. Bir renk farklı ekranlarda farklı anlamlarda kullanılmamalıdır.

## Tipografi

- En fazla iki yazı tipi ailesi kullanılabilir: `COFDisplay` ve `COFUI`.
- İlk aşamada bunlar projede zaten kullanılan font dosyalarına bağlanır; yeni font indirilmez.
- Ana CTA, başlık ve sayılarda belirgin ağırlık; açıklamalarda daha sakin ağırlık kullanılır.
- Uzun açıklamalar kalıcı ekran metni yerine ilk kullanım ipucu veya bilgi paneline taşınır.
- Ana butonlarda italik yazı kullanılmaz.
- Paket içindeki Poppins fontlarında gerçek tabular rakam desteği bulunmadığı için statik sayılar orantılı kalır; yalnız değişirken genişlik sıçraması yapan sayaçlar sabit genişlikli bir kapsayıcı kullanır.
- Birincil metin, fiyat ve kritik aksiyonlar üç noktayla kesilemez.
- Sayılar `tr-TR` biçiminde gösterilir: `135.480`.

## Boşluk ve hizalama

- 8 pt tabanlı sistem kullanılmalıdır.
- Ana yatay ekran boşluğu 20 dp'dir.
- Kart aralığı 12 dp, bölüm aralığı 28 dp'dir.
- Rastgele 13, 17, 19, 27 gibi değerler eklenmez; gerekli optik düzeltme belgelenir.
- İlk yatay kart ekranın soluna tam hizalıdır.
- Sonraki kartın yaklaşık %11'i görünerek kaydırma ipucu verir.
- Kaydırma bırakıldığında kart bir sonraki tam konuma oturur.

## Buton sistemi

Beş varyant vardır:

1. **Primary:** Zümrüt, koyu lacivert yazı, lacivert/zümrüt koyu alt derinlik
2. **Secondary:** Koyu mavi, açık sınır, beyaz yazı
3. **Reward:** Altın, koyu lacivert yazı; yalnız ödül ve ilerleme aksiyonları
4. **Ghost:** Düşük önem taşıyan geri/iptal/yardım aksiyonları
5. **Danger:** Yalnız yıkıcı veya hata durumları

Kurallar:

- Metin, fiyat veya ikon buton görselinin içine gömülmez.
- Butona basınca üst yüzey 0.97 ölçeğe iner ve alt derinlik kapanır.
- Devre dışı buton okunabilir kalır; seçili olmayan sekmeyle aynı görünmez.
- Ana CTA en az 58 dp, diğer normal butonlar en az 50 dp yüksekliğindedir.
- Bütün dokunma alanları en az 44×44 dp'dir.
- Ana CTA etiketi küçültülmez ve tek satırda kalır; gerekirse daha kısa metin veya tam genişlik kullanılır.
- Uzun ikincil aksiyonlar kompakt yazı stilini veya belgelenmiş iki satırlı düzeni kullanabilir. Genel otomatik küçültme 0.90 altına inemez.
- Açık ikincil kontrol sınırı `stroke.control` rengini kullanır; dekoratif kart sınırları için bu kontrast şartı uygulanmaz.

## Kontrast kararı — 1.0.1

İlk token sürümündeki beyaz metin/zümrüt yüzey eşleşmesi 2.15:1 olduğu için kaldırılmıştır. Parlak zümrüt ana yüzey korunur ve üzerinde `#091630` koyu lacivert metin kullanılır; kontrast 8.37:1'dir. Böylece COF'un enerjik yeşili karartılmadan okunabilirlik sağlanır.

İkincil buton sınırı için `stroke.control = #7089C5` eklenmiştir. `#1A2D5F` yükseltilmiş yüzey üzerindeki kontrastı 3.83:1'dir. Eski `stroke.default` dekoratif ve düşük önemdeki kart sınırlarında kalır.

Başarı, uyarı, hata, bilgi ve seri gibi parlak semantik yüzeylerde de koyu lacivert ön plan tokenları kullanılır. Koyu tehlike varyantı oluşturulmuşsa açık metin kullanılabilir; yüzey/metin çifti en az 4.5:1 doğrulanmadan eşleştirme yapılmaz.

## Kart sistemi

- Bilgi kartlarında ağır siyah çerçeve kullanılmaz.
- Etkileşimli kart, bilgi kartından sınır ve basma tepkisiyle ayrılır.
- Seçili item yalnızca yeşil çerçeveyle anlatılmaz; onay ikonu veya `SEÇİLİ` durumu eklenir.
- Kilitli, seçili olmayan ve devre dışı durumların her biri farklı görünür.
- Normal kartlar parlamaz. Parlama yalnız ödül, rarity veya kısa başarı anında kullanılır.

## Ana ekran ve alt sayfa kuralı

Ana sekmeler:

- Mağaza
- Koleksiyon
- Oyun
- Arkadaşlar
- Turnuvalar

Bu beş ekran aynı `RootScreenShell` yapısını kullanır: safe area, ortak arka plan, kaynak alanı ve alt navigasyon.

Alt sayfalar:

- Profil
- Ayarlar
- Maç Geçmişi
- Item ayrıntısı
- Satın alma ayrıntısı

Alt sayfalarda geri butonu vardır ve alt navigasyon gizlenir. Aynı ekranda hem geri butonu hem aktif ana sekme gösterilmez.

## Alt navigasyon

- Aynı anda yalnızca bir sekme aktiftir.
- Oyun sekmesindeki orta top, başka sekmedeyken nötr lacivert görünür.
- Aktiflik renk, arka plan ve konumla anlatılır; yalnız renk kullanılmaz.
- Her `ScrollView`, `FlatList` ve `SectionList` için alt içerik boşluğu şu formülle hesaplanır:

  `bottom navigation height + safe area bottom + 24 dp`

- Son içerik kullanıcının kaydırmasıyla alt menünün tamamen üstüne çıkabilmelidir.

## Asset üretim sözleşmesi

### Raster oyun görselleri

- Format: şeffaf arka planlı PNG
- Renk alanı: sRGB
- Ana üretim boyutu: aksi belirtilmedikçe 1024×1024
- Teslim: `@1x`, `@2x`, `@3x`
- Bütün itemler çalışma alanının merkezindeki %84 güvenli bölgede kalır.
- Tek ışık dili kullanılır: sol üst ana ışık, sağ alt hafif kenar ışığı.
- Asset içine metin, fiyat, sayaç, `x3`, `AKTİF` veya kilit durumu gömülmez.

### Sistem ikonları

- Projede mevcut SVG hattı varsa SVG kullanılır.
- Yoksa şeffaf PNG olarak 1x/2x/3x verilir.
- Tek çizgi kalınlığı, yuvarlatılmış birleşimler ve eşit optik kutu kullanılır.
- Sistem emojisi doğrudan UI asseti olarak kullanılmaz.

### Kodla çizilecek öğeler

Buton, kart, sekme, badge, input ve responsive yüzeyler PNG olarak üretilmez. Bunlar tokenlarla çalışan kod bileşenleridir. Böylece Türkçe metinler, farklı cihaz ölçüleri ve iOS/Android aynı kalır.

## Hareket ve dokunsal geri bildirim

- Basma tepkisi: 90 ms
- Normal geçiş: 180 ms
- Panel/ekran geçişi: 220–240 ms
- Ödül kutlaması: en fazla 420 ms ana hareket; parçacık kuyruğu kontrollü olabilir
- Navigasyon sakin, kazanma ve ödül anları güçlü olmalıdır.
- Transform ve opacity animasyonları tercih edilir.
- Reduced Motion ayarı desteklenir.
- Desteklenen cihazlarda hedef 60 FPS'dir.

## Erişilebilirlik ve okunabilirlik

- Normal metinde en az 4.5:1 kontrast
- Büyük metinde en az 3:1 kontrast
- Kritik bilgi yalnız renkle anlatılmaz.
- İkon butonlarının ekran okuyucu etiketi vardır.
- Pasif sekme tıklanabilir görünür; devre dışı kontrol açıkça farklıdır.
- Fiyat, ana CTA ve kritik sayaçlar hiçbir desteklenen genişlikte kesilmez.

## Aşama 01 uygulama sınırı

Bu aşamada yapılacaklar:

- Token dosyasını projeye eklemek
- Projedeki mevcut font dosyalarını `COFDisplay` ve `COFUI` aliaslarına bağlamak
- Merkezi tema erişimini oluşturmak
- Ortak primitive bileşenlerini hazırlamak veya mevcut olanları tokenlara bağlamak
- Rastgele yeni renk/ölçü eklenmesini engelleyen geliştirme kuralı koymak
- iOS ve Android'de aynı token kaynağını kullanmak

Bu aşamada yapılmayacaklar:

- Ekranların yerleşimini topluca değiştirmek
- Oyun mantığına dokunmak
- API, state, ödeme, kupa veya ekonomi davranışını değiştirmek
- Mevcut assetleri topluca silmek
- Yeni tasarım kütüphanesi eklemek
- Her ekranı tek seferde otomatik refactor etmek

## Aşama 01 kabul kriterleri

- Tek bir merkezi tema kaynağı bulunuyor.
- Ana renkler, spacing, radius, typography, elevation ve motion değerleri bu kaynaktan okunuyor.
- `primary`, `secondary`, `reward`, `ghost`, `danger` buton varyantları tanımlı.
- Kartların `base`, `interactive`, `selected`, `reward`, `premium`, `disabled` durumları tanımlı.
- Light theme veya sistem temasına göre COF renkleri kendiliğinden değişmiyor.
- iOS ve Android aynı semantik tokenları kullanıyor.
- Yeni bağımlılık eklenmedi.
- Navigasyon, API, state ve oyun davranışlarında regresyon yok.
- TypeScript/lint/test veya projede bulunan eşdeğer kontroller başarılı.
- Değiştirilen dosyalar ve kalan hard-coded stil alanları raporlanmış.

## Sonraki sıra

01 tamamlandıktan ve ekran görüntüsüyle doğrulandıktan sonra:

2. Root Screen Shell, safe area ve alt navigasyon
3. Ortak buton seti
4. Kart, sekme, badge ve input seti
5. Ana ekran
6. Koleksiyon
7. Mağaza
8. Arkadaşlar
9. Profil
10. Turnuvalar ve empty state
11. Asset standardizasyonu
12. Motion, haptic, ses ve son cihaz QA
