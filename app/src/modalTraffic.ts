// Modal trafik kontrolü — "iki native modal aynı anda" donmasına karşı emniyet ağı.
//
// NEDEN: iOS'ta bir modal sunulmuşken ikincisini sunmaya çalışmak UIKit'in
// sunum zincirini kilitliyor. Ekranda GÖRÜNMEZ bir modal kalıyor ve tüm
// dokunuşlar ölüyor; uygulama "donmuş" görünüyor, JS çalışmaya devam ettiği
// için çökme kaydı da oluşmuyor. Tek çıkış uygulamayı kapatıp açmak.
//
// Çağrı yerlerinde açık devir-teslim (A kapansın, çıkışı bitince B açılsın)
// tercih edilir — kullanıcı beklemez. Bu modül ONUN YERİNE GEÇMEZ, atlanan ya
// da sunucudan gelen (seviye atlama, arena ödülü, davet, hata) beklenmedik
// yollar için son savunmadır: slot doluysa ikinci modal SIRAYA girer ve
// birincisi kapanır kapanmaz sunulur.
let presented = 0;
const waiters = new Set<() => void>();
// Nefes payı ADAPTİF (2026-08-10): pay, KAPANAN modalın animasyon türüne göre
// seçilir. animationType="none" (pencerelerin büyük çoğunluğu — çıkışı JS
// animasyonu yapar, native kapanış anlıktır) için uzun pay gereksizdi ve her
// pencere→pencere geçişini ~yarım saniye "takılıyormuş" gibi gösteriyordu.
const DISMISS_ANIM_MS = 340; // sistem animasyonlu kapanış (slide/fade ~300ms)
const DISMISS_NONE_MS = 100; // animationType="none": anlık kapanış + küçük pay
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastDismissAt = 0;
let lastDismissGuardMs = 0;

/**
 * Bir modal sunuldu. Dönen fonksiyon çağrılınca slot serbest kalır.
 * `animatedDismiss`: kapanışı iOS'un sistem animasyonu yapıyorsa true
 * (animationType slide/fade) — sıradaki pencere o animasyon bitene dek bekler.
 */
export function acquireModalSlot(animatedDismiss = true): () => void {
  presented += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    presented = Math.max(0, presented - 1);
    // KAPANIŞ PENCERESİ (2026-09-03): sırada kimse yoksa flushTimer kurulmuyor,
    // dolayısıyla slot native kapanış animasyonu SÜRERKEN "boş" görünüyordu.
    // Pencere→pencere devri bundan etkilenmemeli (o akış hızlı kalsın), ama
    // REKLAM sunumu bu pencerede yapılmamalı: yarı kapanmış bir modal'ın
    // üstüne AdMob tam ekranı sunulunca iOS sunum zinciri kilitleniyor.
    lastDismissAt = Date.now();
    lastDismissGuardMs = animatedDismiss ? DISMISS_ANIM_MS : DISMISS_NONE_MS;
    if (presented === 0 && waiters.size > 0) {
      // KAPANIŞ ANİMASYONU: React bileşeni kaldırınca native modal HEMEN yok
      // olmayabilir; kapanış tamamlanmadan sıradakini sunmak donma bugunu
      // aynen geri getiriyordu (ör. Seviye Yolu kapanırken mağaza popup'ı).
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (presented !== 0 || waiters.size === 0) return;
        // Sırada bekleyenlerin İLKİ açılır; kalanlar o kapanınca tekrar denenir
        // (aynı anda ikisini birden salmak bugu geri getirirdi).
        const [first] = waiters;
        waiters.delete(first!);
        first!();
      }, animatedDismiss ? DISMISS_ANIM_MS : DISMISS_NONE_MS);
    }
  };
}

// REKLAM DA BİR NATIVE SUNUMDUR (2026-09-01): AdMob kendi ekranını UIKit
// sunum zincirine ekler, ama modalTraffic bunu bilmiyordu. Reklam ekrandayken
// açılan her pencere (paket önerisi, sezon ödülü, seviye atlama…) tam da bu
// dosyanın başında anlatılan donmayı yaratıyordu: görünmez modal, ölü dokunuşlar,
// çökme kaydı yok. Oyuncu raporu: "Reklam çıkıyor ekran donuyor" (16 Pro Max).
// Reklam artık slotu TUTAR; kapanana kadar sıradaki pencere sunulmaz.
let adRelease: (() => void) | null = null;
let adWatchdog: ReturnType<typeof setTimeout> | null = null;
let adStillOpen: (() => boolean) | null = null;
const AD_SLOT_WATCHDOG_MS = 180_000;

/**
 * Şu anda sunulmuş (ya da sunulmak üzere sıraya girmiş) bir native pencere var mı?
 * SafeModal'ın TAMAMI bu sayaçtan geçtiği için bu, uygulamadaki her GameModal'ı
 * kapsar — App.tsx'teki `modalBlocked` yalnız kendi 17 penceresini biliyordu,
 * ekranların içindeki 53 pencereyi (Diğer Modlar, Günlük Görevler, Günün
 * Kariyeri, profil onayları, mağaza diyalogları…) bilmiyordu.
 */
export function isModalSlotFree(): boolean {
  if (presented !== 0 || waiters.size !== 0 || flushTimer !== null) return false;
  // Son pencere kapandıktan sonra native kapanış animasyonu bitene dek slot
  // REKLAM için boş sayılmaz (whenModalSlotFree bu payı BEKLEMEZ — pencereler
  // arası devir hızlı kalır; yalnız reklam yolu bu kadar temkinlidir).
  return Date.now() - lastDismissAt >= lastDismissGuardMs;
}

/**
 * REKLAM İÇİN GÜVENLİ TUTMA (2026-09-03, oyuncu raporu "reklamdan çıkamıyorum,
 * oyun donuyor"): slot BOŞSA tutar ve true döner; bir pencere sunulmuşsa hiç
 * dokunmaz ve false döner. Eskiden reklam yolu doğrudan holdModalSlotForNativeAd()
 * çağırıyordu — o yalnız sayacı ARTIRIR, doluluğa BAKMAZ. Ekranda bir RN modal
 * varken AdMob tam ekran reklamı aynı view controller'dan sunuluyor, iOS sunum
 * zinciri kilitleniyor ve reklamın kapatma düğmesi dokunuş almıyordu.
 */
export function tryHoldModalSlotForNativeAd(isStillOpen?: () => boolean): boolean {
  // Reklam ZATEN tutuyorsa ikinci reklam sunulmaz: reklam da sunulmuş bir
  // yüzeydir ve üst üste binerse birincinin CLOSED'ı ikincinin slotunu bırakır.
  if (adRelease) return false;
  if (!isModalSlotFree()) return false;
  holdModalSlotForNativeAd(isStillOpen);
  return true;
}

export function holdModalSlotForNativeAd(isStillOpen?: () => boolean): void {
  if (adRelease) return;              // zaten tutuluyor (çift show koruması)
  adRelease = acquireModalSlot(true);
  adStillOpen = isStillOpen ?? null;
  armAdWatchdog();
}

// BEKÇİ: CLOSED hiç gelmezse (SDK hatası, uygulama arka plana atılıp
// öldürülürse) slot sonsuza dek tutulur ve TÜM pencereler ölür — donmayı
// düzeltirken daha kötüsünü yaratmamak için üst sınır şart. AMA reklam HÂLÂ
// ekrandaysa slotu bırakmak, bekleyen pencereyi reklamın üstüne sunar; yani
// düzelttiğimiz donmayı geri getirir. Bu yüzden bekçi, çağıranın "hâlâ açık"
// yanıtı olduğu sürece kendini yeniler.
function armAdWatchdog(): void {
  if (adWatchdog) clearTimeout(adWatchdog);
  adWatchdog = setTimeout(() => {
    adWatchdog = null;
    if (adRelease && adStillOpen?.()) { armAdWatchdog(); return; }
    releaseModalSlotForNativeAd();
  }, AD_SLOT_WATCHDOG_MS);
}

export function releaseModalSlotForNativeAd(): void {
  if (adWatchdog) { clearTimeout(adWatchdog); adWatchdog = null; }
  adStillOpen = null;
  const r = adRelease;
  adRelease = null;
  if (r) { try { r(); } catch { /* slot zaten serbest */ } }
}

/**
 * Slot boşsa slotu AYIRIP geri çağırmayı hemen çalıştırır, doluysa sıraya alır.
 * Dönen fonksiyon beklemeyi iptal eder ya da ayrılmış slotu serbest bırakır.
 */
export function whenModalSlotFree(run: () => void, animatedDismiss = true): () => void {
  let release: (() => void) | null = null;
  let cancelled = false;
  const start = () => {
    if (cancelled) return;
    release = acquireModalSlot(animatedDismiss);
    run();
  };
  if (presented === 0 && waiters.size === 0 && !flushTimer) {
    start();
    return () => { cancelled = true; release?.(); };
  }
  waiters.add(start);
  return () => {
    cancelled = true;
    waiters.delete(start);
    release?.();
  };
}
