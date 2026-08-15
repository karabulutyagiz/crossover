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
