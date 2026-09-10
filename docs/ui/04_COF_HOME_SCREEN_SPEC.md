# COF Ana Oyun Ekranı — Adım 04

Sürüm: 1.0.0  
Kapsam: Yalnız ana `Oyun` sekmesinin görsel kompozisyonu  
Önkoşul: Adım 01, 01.1, 02 ve 03 tamamlanmış olmalı

## 1. Amaç

Ana ekranı “her şeyi aynı anda bağıran bir dashboard” görünümünden çıkarıp, oyuncunun ilk iki saniyede ne yapacağını anladığı, katmanlı ve oyun hissi yüksek bir ana lobiye dönüştürmek.

Bu ekranın tek baskın eylemi **Hemen Oyna** olmalıdır. Diğer modlar, özel oda, bot maçı, arena ilerlemesi ve günlük içerikler kaybolmaz; görsel önem sırasına göre aşağıda gruplanır.

Hedef kalite:

- Clash Royale seviyesinde okunaklı görsel hiyerarşi
- COF'a ait lacivert, zümrüt, altın ve futbol kimliği
- Kalabalık görünmeden zengin içerik
- Küçük ekranda sıkıştırma yerine doğal dikey kaydırma
- iOS ve Android'de aynı temel geometri

Clash Royale'in ekranı veya assetleri kopyalanmaz. Yalnız ürün prensipleri alınır: tek ana CTA, güçlü odak, içerik katmanları, ödül renklerinin kontrollü kullanımı ve net dokunma alanları.

## 2. Kesin kapsam dışı alanlar

- Ses, müzik, audio, haptic, vibration ve titreşim
- Matchmaking, bot, oda, mod kilidi, kupa, rank, seviye ve ödül mantığı
- Navigasyon, pager, alt bar ve detay rotaları
- Reklam davranışı ve monetizasyon
- Sunucu, auth, analytics, bildirim ve zamanlayıcı mantığı
- i18n anahtarlarının anlamı
- Yeni görsel asset üretimi veya mevcut asset dosyalarının değiştirilmesi
- Diğer dört kök sekme ve detay ekranları

Bu adımda mevcut assetler yalnız yeniden ölçülüp yerleştirilebilir. Asset dosyasının kendisi değiştirilmez.

## 3. Mevcut ekranın başlıca sorunları

Mevcut ana ekran üzerinden çözülmesi gereken problemler:

1. Üst bölümde profil, hediye, elmas, ekle, saat, bildirim, ayar, kupa ve rank aynı anda dikkat istiyor.
2. Logo, büyük yeşil CTA, mod kartları, arena ve üç promosyon kartı eşit ağırlıkta görünüyor.
3. Birden fazla kartta farklı radius, kontur, gradient, gölge ve ikon dili bulunuyor.
4. Bazı içerikler dar kartta kırpılıyor; örnek: “GÜNÜN SO...”
5. Özel Mod kartının oda kodu, kilit illüstrasyonu ve oda kur eylemi aynı küçük alanda sıkışıyor.
6. Ana ekranı tek viewport'a sığdırma çabası kartları küçültüyor; okunabilirlik ve premium his azalıyor.
7. Kupa/rank bilgisi bağlamdan kopuk iki yüzen kontrol gibi duruyor.
8. Arka planın saha bölümü ve kartlar arasında katman ilişkisi zayıf.

## 4. Yeni bilgi hiyerarşisi

Ekran yukarıdan aşağıya beş bölgedir:

| Öncelik | Bölge | İçerik |
|---|---|---|
| 1 | Oyuncu başlığı | Profil, seviye/XP, para birimleri, ayar/bildirim |
| 2 | Oyun odağı | COF kimliği, kupa ve lig/rank özeti, Hemen Oyna |
| 3 | Maç seçenekleri | Diğer Modlar, Özel Oda, Bot Maçı |
| 4 | İlerleme | Aktif arena ve sonraki arena ilerlemesi |
| 5 | Günlük alan | Mod kilidi/etkinlik, Seviye Yolu, Günün Sorusu |

Alt navigasyon kök shell tarafından sabit tutulur. Ana içerik dikey `ScrollView` içinde doğal biçimde kayar. Hiçbir içerik alt bara girmez.

## 5. Üst oyuncu başlığı

### 5.1 Yerleşim

- Tek satırlı, sakin bir header yüzeyi.
- Solda mevcut profil çerçevesi/avatarı: görsel çap yaklaşık `52–56 dp`.
- Avatarın yanında oyuncu adı; altında küçük seviye/XP ilerleme çizgisi.
- Sağda para birimi grubu: elmas sayısı ve ekleme kontrolü ortak bir kapsülde.
- Bildirim ve ayar 44 dp ikon butonları olarak sağ kenarda.
- Hediye ve saat işlevleri gerçekten aktifse header altında küçük görev/ödül kısayolu olarak gruplanır; sırf yer dolduran bağımsız daireler olarak kalmaz.

### 5.2 Kurallar

- Oyuncu adına basma ve profil rotası korunur.
- Avatarın sahip olduğu özel çerçeve kırpılmaz.
- Seviye rozeti avatara yapışık kalabilir ancak ismi veya XP çizgisini kapatmaz.
- Para sayısı `CofNumber` ve `tr-TR` biçimi kullanır.
- Header, iPhone Dynamic Island alanıyla yarışmaz; root safe area'yı ikinci kez eklemez.
- En fazla iki yardımcı ikon aynı anda görünür. Daha fazla yardımcı eylem varsa mevcut işlev kaybedilmeden ayar/menü yüzeyinde gruplanır; yeni route veya davranış uydurulmaz.

## 6. Oyun odağı / hero

Hero, ekranın en güçlü görsel alanıdır fakat yüksekliği içeriği boğmamalıdır.

- Mevcut iki top görseli ve `CROSSOVER` wordmark korunur.
- Logo toplam yüksekliği yaklaşık `112–132 dp` bandında tutulur.
- Logo çevresinde yeni yapay glow, partikül veya asset eklenmez.
- Kupa ve global/lig sırası iki bağımsız yüzen buton yerine logonun altında veya yanında iki kompakt bilgi chip'i olur.
- Kupa chip'i: kupa ikonu + biçimlendirilmiş sayı.
- Rank chip'i: grafik/lig ikonu + `#594` benzeri değer.
- Bilgi chip'leri buton gibi parlak görünmez; tıklanabiliyorsa 44 dp hedef ve yön göstergesi taşır.

### Ana CTA

- `CofButton` primary, tam genişlik, büyük boy.
- Metin canlı `Hemen Oyna`; görsel assetin içine yazı gömülmez.
- Ekrandaki tek baskın zümrüt eylem budur.
- Mevcut matchmaking callback'i, loading/disabled durumu ve feedback çağrısı birebir korunur.
- Loading sırasında geometri değişmez.
- CTA ile logo arasında `space.16`, CTA ile sonraki bölüm arasında `space.20–24` kullanılır.

## 7. Maç seçenekleri

Başlık: `MAÇ SEÇENEKLERİ` veya mevcut uygun i18n anahtarı. Yeni metin gerekiyorsa yalnız mevcut yerelleştirme sistemine iki dilde eklenebilir; mevcut anahtar silinmez.

### 7.1 Diğer Modlar

- İlk ve en geniş ikincil kart.
- Mevcut karşılıklı iki top görseli kullanılabilir.
- Başlık tamamen görünür.
- `YENİ` rozeti içerikle çakışmadan sağ üst köşeye oturur.
- Tüm kart tek dokunma hedefidir; içte ikinci sahte ok butonu oluşturulmaz. Ok yalnız yön göstergesi olabilir.

### 7.2 Özel Oda ve Bot Maçı

- İki eşit kart, genişlik yeterliyse yan yana; `360 dp` ve büyük fontta gerekirse alt alta.
- Özel Oda kartında iki ayrı eylem net ayrılır: mevcut odaya katılma ve oda kurma.
- Oda kodu alanı gerçek `CofInput` için uygun ilk üretim tüketicisidir. Mevcut keyboard prop'ları, submit, büyük harf dönüşümü ve callback korunur.
- “Oda Kur” secondary butondur; ana CTA ile yarışmaz.
- Büyük yarı saydam kilit/kart illüstrasyonu metnin arkasına girmez. Mevcut asset dekoratif olarak sağ alt köşede düşük vurgu ile kullanılabilir.
- Bot Maçı kartı kilitliyse `locked`, açıksa interactive varyantını kullanır. Kilitli ile disabled aynı görünmez.

## 8. Arena ilerlemesi

Aktif arena kartı küçük bir görsel kutu olmaktan çıkar, tam genişlikli ilerleme modülüne dönüşür.

- Solda mevcut arena görseli veya geniş banner kırpımı.
- Sağda/üstte arena adı: örnek `Mahalle Sahası`.
- Kupa ilerlemesi açık metin ve progress bar ile: `74 / 200`.
- Sonraki eşik veya arena erişilebiliyorsa ikincil metinle gösterilir; veri yoksa uydurulmaz.
- Progress bar altın veya semantik ilerleme rengi kullanır; CTA zümrüdünü taklit etmez.
- Kart dokunuluyorsa arena detayına giden mevcut callback korunur.

## 9. Günlük alan

Üç küçük kart tek bir tutarlı yatay carousel veya iki sütunlu grid sistemi kullanır. Mevcut yatay kaydırma davranışı varsa korunur.

Kartlar:

- Özel modların kilidini aç / aktif paket
- Seviye Yolu
- Günün Sorusu

Kurallar:

- Kart minimum genişliği metni kırpmayacak kadar olmalıdır; başlık `GÜNÜN SO...` biçiminde kesilmez.
- Başlık en fazla iki satır, açıklama en fazla iki satır.
- Ödül miktarı ve süre aynı alanda yarışmaz; üstte durum badge'i, altta ödül satırı kullanılır.
- Her kart aynı radius, padding, başlık stili ve yön göstergesi kullanır.
- Aktif/premium/ödül ayrımı semantik badge ile yapılır; her karta farklı gradient verilmez.
- Carousel ise bir sonraki kartın küçük bir bölümü görünerek kaydırılabilirlik sezdirilir; ekran kenarında rastgele kırpılmış kart bırakılmaz.

## 10. Arka plan ve derinlik

- Mevcut lacivert desenli arka plan korunur.
- Mevcut yeşil saha arka planı kullanılacaksa hero arkasında sert yatay çizgi oluşturmaz; kontrollü bir maske/gradient ile laciverte karışır.
- Gradient kodla ve tokenlardan türetilir; yeni bitmap üretilmez.
- Kartlar zeminden `surface` katmanlarıyla ayrılır; kalın siyah kontur her karta uygulanmaz.
- Bir katmanda tek gölge sistemi kullanılır.
- Üst header, hero ve kartlar arasında en az üç belirgin derinlik seviyesi oluşur.

## 11. Ölçü ve responsive kuralları

- Yatay ekran padding'i: token tabanlı yaklaşık `16–20 dp`.
- Bölüm aralığı: `24–32 dp`.
- Kart iç boşluğu: `12–16 dp`.
- Grid aralığı: `12 dp`.
- Dokunma hedefi: en az `44 × 44 dp`.
- `360 dp`: sıkıştırmak yerine ikincil kartları alt alta al; metni anlamsız küçültme.
- `390 dp`: hedef referans düzen.
- `430 dp`: kartları aşırı genişletme; içeriği ve boşluğu dengeli büyüt.
- Alt içerik rezervi root shell politikasından gelir; fazladan sabit boşluk eklenmez.
- Uzun Türkçe ve İngilizce metinler test edilir.
- Yüzde 120 eşdeğer font ölçeğinde ana CTA, arena adı, oda kontrolleri ve günlük kart başlıkları kırpılmaz.

## 12. State matrisi

En az şu durumlar gerçek component ağacıyla görüntülenir:

1. Normal yüklenmiş ana ekran.
2. Hemen Oyna loading.
3. Özel oda kodu yazılmış ve klavye açık.
4. Bot maçı locked.
5. Bildirim veya hediye rozeti bulunan header.
6. Uzun oyuncu adı.
7. Günlük içerik eksik/boş durum.
8. Sunucudan görsel yüklenemediğinde mevcut fallback.

Test verisi production hesabına yazılmaz. Geliştirme fixture'ı kullanılıyorsa production build'de erişilemez olmalıdır.

## 13. Görsel kanıt

Bu adımda gallery tek başına yeterli değildir. Gerçek `HomeScreen` component'i gerçek store/state sözleşmesiyle render edilmelidir; ağ erişimi gerekmiyorsa fixture yalnız veri katmanını besleyebilir.

Zorunlu görüntüler:

- iOS `390 × 844`: üst ve ilk viewport
- iOS `390 × 844`: aşağı kaydırılmış arena/günlük alan
- Dar genişlik `360 × 800`
- Geniş genişlik `430 × 932`
- Klavye açık özel oda durumu
- Yüzde 120 eşdeğer font ölçeği
- Mümkünse Android aynı ana viewport

Her görüntü README'de platform, viewport, font ölçeği, veri kaynağı ve gerçek ekran/fixture ayrımıyla etiketlenir.

## 14. Otomatik doğrulama

- Ana ekranda yalnız bir primary CTA bulunması.
- Hemen Oyna callback, loading ve disabled davranışının korunması.
- Profil, bildirim, ayar, kupa/rank, modlar, oda, bot, arena ve günlük kart callbacklerinin değişmemesi.
- Para ve kupa sayılarının `tr-TR` formatı.
- Tüm ikon ve kart hedeflerinin en az 44 dp olması.
- 360/390/430 genişliklerinde belirlenen responsive layout politikası.
- `GÜNÜN SO...` benzeri istemsiz ellipsis bulunmaması.
- Root shell'in tam 24 dp dinlenme boşluğunun korunması.
- Alt navigasyon aktiflik ve klavye gizleme davranışının korunması.
- Audio/music/haptic/vibration alanlarında sıfır diff.
- TypeScript noEmit, önceki testler ve iOS/Android/web Expo export.

## 15. Kabul ölçütü

- Gerçek ana ekran yeni hiyerarşiyle uygulanmış olmalıdır.
- İlk bakışta ana eylem açıkça `Hemen Oyna` olmalıdır.
- Ekrandaki bütün mevcut işlevlere erişim korunmalıdır.
- Hiçbir önemli başlık istemsiz kırpılmamalıdır.
- Ekran tek viewport'a zorla sığdırılmamalı; doğal kaydırma çalışmalıdır.
- Yalnız Adım 03 ortak componentleri ve token sistemi kullanılmalıdır.
- Diğer ekranlarda görsel diff olmamalıdır; ortak adaptör etkisi varsa açıkça raporlanmalıdır.
- Ses, müzik, haptic ve titreşim alanları değişmemelidir.
- Gerçek HomeScreen kanıtları ve testler geçmelidir.

Adım tamamlanınca durulur. Mağaza, Koleksiyon, Arkadaşlar, Profil, Turnuvalar veya maç içi ekranlara geçilmez.
