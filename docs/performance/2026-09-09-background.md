# Beş dakika arka plan oturumu — 9 Eylül 2026

Kod `/Users/yagizkarabulut/crossover-performance` worktree'sinde uygulandı. Canlı sunucuya veya dağıtılmış mobil uygulamaya aktarılmadı.

## Davranış

- Uygulama `background` durumuna geçince beş dakikalık süre başlar. Aynı durumun tekrar bildirilmesi süreyi uzatmaz. Sadece `inactive` geçişi yeni arka plan süresi başlatmaz.
- Beş dakika dolduğunda bu cihazın socket/presence oturumu kapanır. Bağlantı işletim sistemi veya ağ tarafından daha erken kapatılırsa çevrimdışı görünüm daha erken oluşabilir. Başka cihazda açık oturum varsa hesap o cihaz nedeniyle çevrimiçi kalabilir.
- Beş dakika veya daha uzun süre sonra ön plana dönüşte eski oyun ağacı yeniden oluşturulur ve mevcut React splash/açılış ekranı çalışır. Telefon JavaScript zamanlayıcısını askıya alsa bile dönüşte geçen gerçek süre tekrar kontrol edilir.
- Bu, işletim sisteminin uygulama sürecini zorla öldürmesi veya native splash ekranını yeniden göstermesi değildir. Kayıtlı kullanıcı kimliği silinmez; normal açılış akışı hesabı yeniden yükler. Oturumun bekleyen socket mesajları ve kısa süreli arama önbelleği temizlenir.
- Kısa süreli dönüşte splash reset yapılmaz; mevcut bağlantı yenileme ve maç kuralları kullanılır. Mevcut maç süreleri, bağlantı kopma toleransı ve 30 saniyelik arka plan hükmen sonuç politikası değiştirilmedi. Beş dakika, maçı duraklatma hakkı değildir.
- Arka planda otomatik socket yeniden bağlantısı engellenir. Geç tamamlanan bağlantı açılışları ve kapanmış socket için geç tamamlanan online kayıtları da engellenir.

## Sunucu güvencesi ve uyumluluk

İstemci `app_state: active/background` mesajları gönderir. Yeni `bglease` yeteneğini bildiren istemci, sunucunun mevcut 20 saniyelik uygulama heartbeat'ine `active` yanıtı vererek varlığını yeniler. Böylece işletim sisteminin otomatik WebSocket pong yanıtları tek başına askıya alınmış uygulamayı süresiz çevrimiçi tutamaz. Arka plan bildirimi ulaşmazsa son JavaScript yenilemesinden beş dakika sonra oturum kapanır; bu, gerçek arka plana geçişten biraz erken olabilir. Sunucu event-loop'u bloke olursa zamanlayıcı çalışması da gecikebilir; mutlak gerçek zaman garantisi değildir.

Süre sonundaki bağlantı kapatma mevcut close temizliğini kullanır: presence, eşleştirme kuyruğu ve davetler temizlenir; oda kendi mevcut kopma politikasını uygular. Süresi dolan bağlantı, sonradan gelen `active` ile dirilemez. Eski `bglease` bildirmeyen istemcilerden heartbeat cevabı beklenmez. Yeni sunucu önce, yeni mobil build sonra dağıtılmalıdır; eski mobil sürümlere beş dakika/splash davranışı geriye dönük eklenmiş olmaz.

React Native performans rehberi bu değişiklikte oturuma ait durumu ref'lerde tutmayı ve yalnız oturum sıfırlanırken kökü yeniden oluşturmayı yönlendirdi; her saniye uygulama genelinde render eklenmedi. Yaşam döngüsü ayrımı [React Native 0.83 AppState](https://reactnative.dev/docs/0.83/appstate), native açılış sınırı [Expo SDK 55 SplashScreen](https://docs.expo.dev/versions/v55.0.0/sdk/splash-screen/) belgeleriyle kontrol edildi.

## Doğrulama

- Sunucu arka plan testleri: **8/8**. Tam 300.000 ms sınırı, tekrar background, kısa dönüş, yeni background süresi, foreground yenileme, kayıp background bildirimi, eski istemci, dispose ve mesaj doğrulaması.
- Gerçek loopback WebSocket testinde otomatik pong'lar sürerken JavaScript yenilemesi olmayan oturum kapandı. Test süresi enjekte edilerek 100 ms kullanıldı; üretim sabiti beş dakikadır. Bu test oyunun DB/oda sunucusunu başlatmaz.
- İstemci saf süre testleri: **2/2**. Askıya alınmış zamanlayıcıdan bağımsız süre sınırı ve istemci/sunucu süre eşitliği.
- Mevcut realtime testleri **6/6**: 250 socket / 5.000 sıralı mesaj dahil. Önbellek testleri **4/4**. Yerel arama testi ve 32 açılış durumu kontrolü geçti.
- App ve server TypeScript; protokol drift; `git diff --check` başarılı.
- Fiziksel cihazda splash, hesap geri yükleme, kilit ekranı, iOS/Android askıya alma ve uçuş modu testi henüz yapılmadı. Testler native yaşam döngüsünü simüle eden uçtan uca cihaz testi değildir.

Tekrarlama:

```sh
cd /Users/yagizkarabulut/crossover-performance/server
npm run test:background-session
npm run test:realtime-performance
npm run check:protocol
npm run typecheck
cd /Users/yagizkarabulut/crossover-performance/app
node --experimental-strip-types --test scripts/background-session-test.mjs
node scripts/opening-state-test.mjs
npm run typecheck
```

## Aktarım

`2026-09-09-background.patch`, önceki iki performans aşaması ve bu arka plan değişikliğini birlikte içerir; önceki yamaların üstüne tekrar uygulanmamalıdır. Taban commit `510c7d4e16e73d2be255c1f86025fdf4dfaa1f3f`. Taban üzerinde izole Git index ile yama kontrolü yapılır; bu, güncel başka bir checkout'a otomatik birleştirme garantisi değildir.

Aktif UI2 geliştirme kopyasında bu çalışma sürerken `screens.tsx` değişti. Kullanıcının bu değişiklikleri korunmuştur; birleşik yama o kopyaya zorla uygulanmadı. Güncel kaynakla birleştirme ve test, ardından sunucu yayını ve mobil build gerekir. Masaüstündeki eski/iCloud kopyası çalışma kaynağı olarak kullanılmadı.
