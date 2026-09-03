# CrossOver Football — Root Shell, Safe Area ve Alt Navigasyon

Sürüm: **2.0.0**  
Bağımlılık: **COF UI Tokens 1.0.2**

## Amaç

Bu aşama, COF'un beş ana sekmesinin aynı güvenli ekran kabuğunu kullanmasını sağlar:

- Mağaza
- Koleksiyon
- Oyun
- Arkadaşlar
- Turnuvalar

Hedef; içeriklerin alt navigasyon altında kalmasını, iOS/Android safe-area farklarını, aynı anda iki sekmenin aktif görünmesini, profil gibi alt sayfalarda çift navigasyonu ve alt menünün üstündeki siyah çizgi problemini kalıcı olarak çözmektir.

Bu aşamada ekran kartlarının iç tasarımı, ana ekran hiyerarşisi, mağaza ürünleri veya koleksiyon yerleşimi yeniden tasarlanmaz.

## Mimari sözleşme

### RootScreenShell

Beş ana sekmenin tamamı tek bir `RootScreenShell` veya mevcut mimariye uygun eşdeğer bileşeni kullanır.

Sorumlulukları:

- Üst ve alt safe-area insets
- Ortak lacivert arka plan
- Durum çubuğu görünümü
- İsteğe bağlı kaynak/header alanı
- Sabit alt navigasyon
- Kaydırılabilir ve kaydırılmayan içerikler için doğru alt boşluk
- Klavye açıldığında navigasyon davranışı
- Reduced Motion uyumu

`RootScreenShell` iş mantığı, veri çekme, ekran içeriği veya route kararları üretmez.

### DetailScreenShell

Profil, Ayarlar, Maç Geçmişi ve item ayrıntısı gibi geri butonlu sayfalar `DetailScreenShell` veya eşdeğer yapıyı kullanır.

- Geri butonu vardır.
- Alt navigasyon görünmez.
- Route ve geri davranışı korunur.
- İçerik kendi safe-area ve klavye kurallarına uyar.

Aynı anda hem geri butonu hem ana alt navigasyon gösterilmez.

## Safe area

- Safe-area değeri tek bir üst sağlayıcıdan okunur; her alt bileşen ayrı abonelik açmaz.
- iOS Dynamic Island/notch ve Android durum/navigasyon alanları desteklenir.
- Sabit `paddingTop`, cihaz adına göre koşul veya ekran yüksekliğinden türetilen notch tahmini kullanılmaz.
- Android'de kenardan kenara çizim varsa durum çubuğu arka planı COF zeminine bağlanır.
- Durum çubuğu `light-content` görünür ve ekran geçişinde yanıp sönmez.

## Alt navigasyon geometrisi

Token kaynağı:

- Gövde yüksekliği: `size.bottomNavigation.barHeightExcludingSafeArea = 76 dp`
- Orta Oyun kontrolü: `64 dp`
- Orta kontrol yükselişi: `22 dp`
- Aktif çizgi: `3 dp`
- İkon: `26 dp`
- Etiket: `12 dp`

Gerçek toplam yükseklik:

`76 dp + insets.bottom`

Navigasyon gövdesi ekranın altına sabitlenir. Orta kontrol gövde içinde ölçülür ve yalnız görsel olarak 22 dp yukarı taşar. Bu taşma layout yüksekliğini veya içerik ölçümünü değiştirmez.

## İçerik alt boşluğu

Her dikey `ScrollView`, `FlatList` ve `SectionList` için:

`contentBottomInset = 76 + insets.bottom + 24`

Aynı değer kaydırma göstergesi alt insetine uygulanır. İçerik ayrıca kendi son bölüm boşluğunu eklememelidir; çift boşluk oluşması engellenir.

Kabul davranışı:

- En son kart tamamen alt navigasyonun üstüne kaydırılabilir.
- Son kart ile navigasyon arasında dinlenme halinde en az 24 dp bulunur.
- Navigasyon içerik üstüne yarı saydam biçimde binip metin okunmasını bozmaz.
- Orta Oyun kontrolü son öğeyi kapatmaz.

Kaydırılmayan ekranlarda ana içerik, header ile navigasyon arasındaki kullanılabilir yüksekliği `flex: 1` ile alır. Sabit cihaz yüksekliği kullanılmaz.

## Alt navigasyon görünümü

- Zemin: `surface.base`
- Üst ayrım: `stroke.subtle`, 1 dp
- Yukarı yönlü kontrollü gölge: `elevation.card` değerlerinden uyarlanır
- Ek siyah çizgi, platforma özel border veya iki kez çizilen separator bulunmaz.
- Etkin alanlar `brand.primaryTint` yüzeyini ve 3 dp aktif çizgiyi kullanır.
- İnaktif ikon/metin `text.tertiary` kullanır.
- Aktif ikon/metin `brand.primary` kullanır.
- Yalnızca bir hedef aktif olabilir.

## Orta Oyun kontrolü

Orta kontrol bir FAB gibi ikinci bir eylem değildir; beş sekmeden biridir.

Oyun sekmesi aktifken:

- Zemin `brand.primary`
- İkon `text.onPrimary`
- Kontrollü dış vurgu
- `Oyun` etiketi aktif renkte

Başka sekme aktifken:

- Zemin `surface.strong`
- İkon `text.secondary`
- Glow veya yeşil halo yok
- `Oyun` etiketi diğer inaktif sekmelerle aynı seviyede

Orta kontrolün parlak yeşil kalıp başka bir sekmeyle aynı anda aktif görünmesi yasaktır.

## Etkileşim

- Bütün sekme hedefleri en az 44×44 dp'dir.
- Sekme basma tepkisi `motion.press` tokenlarını kullanır.
- Aktif sekmeye yeniden dokunma mevcut projede bir davranışa sahipse korunur. Yoksa bu aşamada scroll-to-top gibi yeni davranış eklenmez.
- Haptic altyapısı zaten varsa hafif seçim geri bildirimi kullanılır; yeni bağımlılık eklenmez.
- Hızlı art arda dokunmada birden fazla route push oluşmaz.
- Navigasyon değişiminde içerik veya bar yüksekliği zıplamaz.

## Klavye

Arkadaş kodu, isim arama ve mesaj alanlarında klavye açıldığında alt navigasyon içeriği sıkıştırmamalıdır.

- Mevcut navigasyon sistemi güvenilir `hide on keyboard` davranışı sunuyorsa kullanılır.
- Özel navigasyonda klavye görünürken bar transform ile aşağı alınır ve dokunma alanı kapatılır.
- Klavye kapanınca bar aynı ölçüye geri döner.
- Form ekranı doğru `KeyboardAvoidingView`/inset davranışını kullanır.
- iOS ve Android için farklı görsel düzen oluşturulmaz.

## Üst alan

- Mağaza, Koleksiyon, Arkadaşlar ve Turnuvalar aynı üst safe-area başlangıcını kullanır.
- Turnuvalar ekranındaki eksik kaynak satırı, diğer kök ekranlarla aynı yapıya alınır.
- Ana Oyun ekranındaki profil/kaynak alanı şimdilik korunur; ana ekran yeniden tasarımı sonraki aşamadadır.
- Kupa ve elmas biçimlendirmesi `tr-TR` yardımcılarını kullanır: `135.480`.
- Bu aşamada büyük ekran başlık kartları yeniden tasarlanmaz.

## Yatay kaydırma alanları

Bu aşama yatay kartların tasarımını değiştirmez ancak shell ile çakışmalarını önler:

- Dikey ve yatay gesture birbirini kilitlemez.
- Android nested scroll davranışı doğrulanır.
- Yatay listenin ilk kartı dinlenme halinde soldan kesilmez.
- Sağdaki yarım kart yalnız bilinçli keşif ipucuysa korunur.
- Alt navigasyon yatay listenin dokunma alanını kapatmaz.

## Erişilebilirlik

- Navigasyon `tablist/tab` veya platformun eşdeğer semantiğini kullanır.
- Her hedefin Türkçe ve İngilizce erişilebilirlik etiketi vardır.
- Aktif hedef `selected=true` durumunu bildirir.
- Rozet sayıları hedef etiketiyle birlikte okunur.
- Yalnız ikon rengine güvenilmez; aktif çizgi/zemin/semantik durum birlikte kullanılır.
- Reduced Motion açıkken geçiş opacity/renk değişimiyle tamamlanır.

## Performans

- Safe-area ve klavye dinleyicileri ekran başına çoğaltılmaz.
- Navigasyon değişimi bütün uygulamayı gereksiz yeniden render etmez.
- Arka plan görseli her sekmede yeniden decode edilmez.
- Animasyonlar transform ve opacity ile yapılır.
- Desteklenen cihazlarda hedef 60 FPS'dir.

## Aşama sınırı

Yapılacaklar:

- Token 1.0.2'deki danger ön plan düzeltmesini uygulamak
- Root ve detail shell oluşturmak/adapte etmek
- Beş ana sekmeyi ortak root shell'e bağlamak
- Profil gibi geri butonlu detay sayfalarında alt navigasyonu kaldırmak
- Alt içerik boşluğu ve kaydırma göstergesi insetlerini düzeltmek
- Orta Oyun aktiflik durumunu düzeltmek
- Turnuvalar üst alanını diğer kök ekranlarla hizalamak
- `135480` gibi kaynak sayılarını ortak format yardımcısına geçirmek

Yapılmayacaklar:

- Ana ekran kartlarını yeniden yerleştirmek
- Yeni buton veya görsel asset üretmek
- Mağaza, koleksiyon, arkadaşlar veya profil içeriğini yeniden tasarlamak
- Oyun modları veya navigasyon hedeflerini değiştirmek
- API, state, ekonomi, ödeme, reklam veya oyun mantığını değiştirmek
- Yeni bağımlılık veya paket sürümü eklemek

## Görsel doğrulama matrisi

En az şu görseller üretilmelidir:

1. 390×844 — Oyun aktif
2. 390×844 — Koleksiyon aktif
3. 390×844 — Arkadaşlar aktif, klavye kapalı
4. 390×844 — Profil detay sayfası, alt navigasyon yok
5. 360×800 — Mağaza, listenin son öğesi navigasyonun tamamen üstünde
6. 360×800 — Arkadaş kodu alanı, klavye açık
7. 430×932 — Turnuvalar, ortak üst kaynak alanı görünür

Gerçek iOS/Android simülatörü yoksa Expo Web ekran görüntüsü alınabilir ancak bu durum açıkça belirtilir. Derleme başarısı görsel doğrulamanın yerine geçmez.

## Kabul kriterleri

- Aynı anda yalnız bir alt sekme aktif görünüyor.
- Oyun sekmesi aktif değilken orta top nötr.
- Son içerik hiçbir desteklenen genişlikte navigasyon altında kalmıyor.
- Alt menünün üstünde çift/siyah çizgi yok.
- Profil ve geri butonlu detay sayfalarında alt navigasyon yok.
- Turnuvalar ana sekmelerle aynı safe-area ve kaynak başlangıcına sahip.
- Klavye açıkken navigasyon formu sıkıştırmıyor veya inputu kapatmıyor.
- Kupa/elmas sayıları her kök ekranda aynı yerel formatta.
- 360, 390 ve 430 dp genişliklerinde etiket kesilmesi yok.
- TypeScript, mevcut testler ve iOS/Android/Web export başarılı.
- Görsel doğrulama çıktıları rapora eklenmiş.

