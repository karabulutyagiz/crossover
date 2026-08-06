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

/** Bir modal sunuldu. Dönen fonksiyon çağrılınca slot serbest kalır. */
export function acquireModalSlot(): () => void {
  presented += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    presented = Math.max(0, presented - 1);
    if (presented === 0 && waiters.size > 0) {
      // Sırada bekleyenlerin İLKİ açılır; kalanlar o kapanınca tekrar denenir
      // (aynı anda ikisini birden salmak bugu geri getirirdi).
      const [first] = waiters;
      waiters.delete(first!);
      first!();
    }
  };
}

/**
 * Slot boşsa geri çağırmayı HEMEN çalıştırır, doluysa sıraya alır.
 * Dönen fonksiyon beklemeyi iptal eder (modal açılmadan kapatılırsa).
 */
export function whenModalSlotFree(run: () => void): () => void {
  if (presented === 0) {
    run();
    return () => {};
  }
  waiters.add(run);
  return () => { waiters.delete(run); };
}
