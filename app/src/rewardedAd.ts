// Ödüllü reklam — tek atışlık, popup'lardan çağrılabilir (2026-09-02).
// Mağazadaki useAdState (screens.tsx) kendi ön-yükleme/sayaç durumunu tutar;
// bu modül ise "bir reklam göster, sonucu söyle" sözü verir: Kupa Kalkanı
// iadesi gibi maç-sonrası akışlar için. Native modül Expo Go'da yoktur →
// 'unavailable' döner, çağıran kendi yedeğine düşer.
import { Platform } from 'react-native';
import { isModalSlotFree, releaseModalSlotForNativeAd, tryHoldModalSlotForNativeAd } from './modalTraffic';

// AdMob Rewarded Ad Unit IDs: geliştirmede Google test kimlikleri, sürümde gerçek.
export const REWARDED_AD_IOS = __DEV__
  ? 'ca-app-pub-3940256099942544/1712485313'
  : 'ca-app-pub-5118403349234305/6758433311';
export const REWARDED_AD_ANDROID = __DEV__
  ? 'ca-app-pub-3940256099942544/5224354917'
  : 'ca-app-pub-5118403349234305/3118571202';
export const REWARDED_AD_UNIT = Platform.OS === 'ios' ? REWARDED_AD_IOS : REWARDED_AD_ANDROID;

let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let AdEventType: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ads = require('react-native-google-mobile-ads');
  RewardedAd = ads.RewardedAd;
  RewardedAdEventType = ads.RewardedAdEventType;
  AdEventType = ads.AdEventType;
} catch {
  // native modül yok (Expo Go) — reklam kapalı
}

// Slot bekleme: 250 ms x 20 = 5 sn (pencere kapanış animasyonu ~340 ms).
const SLOT_WAIT_STEP_MS = 250;
const SLOT_WAIT_TRIES = 20;

export type RewardedAdOutcome = 'earned' | 'closed' | 'error' | 'unavailable';
export function rewardedAdsAvailable(): boolean { return Boolean(RewardedAd); }
export function rewardedAdSlotFree(): boolean { return isModalSlotFree(); }

/** Bir ödüllü reklam yükle + göster. 'earned' yalnız EARNED_REWARD gelince döner. */
export function showRewardedAd(timeoutMs = 12_000): Promise<RewardedAdOutcome> {
  if (!RewardedAd) return Promise.resolve('unavailable');
  return new Promise((resolve) => {
    let earned = false;
    let settled = false;
    const unsubs: (() => void)[] = [];
    const finish = (o: RewardedAdOutcome) => {
      if (settled) return;
      settled = true;
      unsubs.forEach((u) => { try { u(); } catch { /* yut */ } });
      resolve(o);
    };
    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT);
    unsubs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }));
    // PENCERE KAPANMADAN GÖSTERME (2026-09-03): bu yol popup'tan çağrılıyor
    // (Kupa Kalkanı teklifi kapanır kapanmaz reklam istiyor). RN modal'ı henüz
    // kapanma animasyonundayken AdMob tam ekranı sunulursa iOS sunum zinciri
    // kilitleniyor ve reklamın kapatma düğmesi dokunuş almıyor — "reklamdan
    // çıkamıyorum" raporunun kaynağı. Slot boşalana dek bekleriz.
    const showWhenFree = (attempt = 0) => {
      if (settled) return;
      if (!tryHoldModalSlotForNativeAd()) {
        if (attempt >= SLOT_WAIT_TRIES) { finish('error'); return; }
        setTimeout(() => showWhenFree(attempt + 1), SLOT_WAIT_STEP_MS);
        return;
      }
      // show() yüklü değilse FIRLATIR (SDK MobileAd.show) — slot sızdırmadan yakala.
      try { ad.show(); } catch { releaseModalSlotForNativeAd(); finish('error'); }
    };
    unsubs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => { clearTimeout(loadTimer); showWhenFree(); }));
    unsubs.push(ad.addAdEventListener(AdEventType.ERROR, () => { clearTimeout(loadTimer); releaseModalSlotForNativeAd(); finish('error'); }));
    unsubs.push(ad.addAdEventListener(AdEventType.CLOSED, () => { releaseModalSlotForNativeAd(); finish(earned ? 'earned' : 'closed'); }));
    // Yükleme askıda kalırsa oyuncuyu bekletme.
    const loadTimer = setTimeout(() => finish('error'), timeoutMs);
    ad.load();
  });
}
