// Geçiş reklamı (interstitial) — kullanıcı onayı 2026-08-29.
//
// KURAL SETİ (değişmez):
//   • Sosyal Paketi AKTİF olana ASLA gösterilmez ("reklamsız oyna" paket değeri).
//   • Yeni oyuncunun ilk `graceMatches` maçı muaf (ilk izlenim korunur).
//   • Sonrasında her `everyMatches` maçta BİR — yalnız maç sonucundan ANA
//     EKRANA dönerken (rövanşa/yeni maça girerken asla: senkron PvP'de rakibi
//     bekletmek yasak).
//   • Sunucu /monetization-config `ads` bloğu kapalıysa ya da unit ID yoksa
//     tamamen sessiz (interstitialEnabled=false varsayılan — OTA'sız açılır).
//
// Sayaçlar AsyncStorage'da cihaz-yerelidir; sunucuya güven gerektirmez çünkü
// reklam gösterme kararı tamamen istemci deneyimi meselesidir.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AdsRemoteConfig = {
  interstitialEnabled: boolean;
  interstitialEveryMatches: number;
  interstitialGraceMatches: number;
  interstitialUnitIos: string | null;
  interstitialUnitAndroid: string | null;
};

// Native modül Expo Go'da yok — sessiz devre dışı (ödüllü reklamla aynı kalıp).
let InterstitialAd: any = null;
let AdEventType: any = null;
try {
  const ads = require('react-native-google-mobile-ads');
  InterstitialAd = ads.InterstitialAd;
  AdEventType = ads.AdEventType;
} catch { /* Expo Go */ }

// __DEV__'de Google'ın resmî test geçiş birimleri (gerçek gelir üretmez, anında dolar).
const TEST_INTERSTITIAL = Platform.OS === 'ios'
  ? 'ca-app-pub-3940256099942544/4411468910'
  : 'ca-app-pub-3940256099942544/1033173712';

const STATE_KEY = '@crossover_interstitial_v1';

let cfg: AdsRemoteConfig | null = null;
let totalMatches = 0;
let sinceAd = 0;
let hydrated = false;
let preloaded: { ad: any; loaded: boolean } | null = null;

function unitId(): string | null {
  if (__DEV__) return TEST_INTERSTITIAL;
  if (!cfg) return null;
  return Platform.OS === 'ios' ? cfg.interstitialUnitIos : cfg.interstitialUnitAndroid;
}

function active(): boolean {
  return !!(InterstitialAd && cfg?.interstitialEnabled && unitId());
}

async function persist(): Promise<void> {
  try { await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ totalMatches, sinceAd })); } catch { /* yerel sayaç — kayıp tolere edilir */ }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 30_000;

function preloadNext(): void {
  if (!active() || preloaded) return;
  const ad = InterstitialAd.createForAdRequest(unitId());
  const entry = { ad, loaded: false };
  preloaded = entry;
  ad.addAdEventListener(AdEventType.LOADED, () => {
    entry.loaded = true;
    retryDelayMs = 30_000; // başarı: geri çekilme sıfırlanır
  });
  ad.addAdEventListener(AdEventType.ERROR, () => {
    // Yükleme hatası KALICI OLMAMALI (2026-08-29): eskiden yalnız preloaded
    // null'lanıyordu ve yeniden denenmediği için ilk hata (ör. doluluk yokken
    // açılış) reklamı o oturum boyunca öldürüyordu. Artık artan gecikmeyle
    // yeniden denenir.
    if (preloaded === entry) preloaded = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; preloadNext(); }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, 10 * 60_000);
  });
  ad.load();
}

/** App açılışında ve /monetization-config geldiğinde çağrılır. */
export function configureInterstitial(remote: AdsRemoteConfig | null | undefined): void {
  cfg = remote ?? null;
  if (!hydrated) {
    hydrated = true;
    AsyncStorage.getItem(STATE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw) as { totalMatches?: number; sinceAd?: number };
        totalMatches = Math.max(totalMatches, Number(s.totalMatches ?? 0) || 0);
        sinceAd = Math.max(sinceAd, Number(s.sinceAd ?? 0) || 0);
      } catch { /* bozuk kayıt — sıfırdan say */ }
    }).catch(() => {});
  }
  // Config açıldıysa ilk reklamı arkada hazırla — gösterim anında beklenmez.
  preloadNext();
}

/** Her maç sonucu ekranına girişte BİR kez çağrılır (kazan/kaybet fark etmez). */
export function recordMatchEnd(): void {
  totalMatches += 1;
  sinceAd += 1;
  void persist();
}

/**
 * Maç sonucundan ANA EKRANA dönüşte çağrılır. Koşullar tutuyorsa hazır geçiş
 * reklamını gösterir ve true döner; her durumda sayaç mantığını kendi yönetir.
 * hasSocialPack=true olan oyuncuya hiçbir koşulda gösterilmez.
 */
export function maybeShowInterstitial(hasSocialPack: boolean): boolean {
  if (!active() || hasSocialPack) return false;
  if (!cfg) return false;
  if (totalMatches < Math.max(0, cfg.interstitialGraceMatches)) return false;
  if (sinceAd < Math.max(1, cfg.interstitialEveryMatches)) return false;
  const pre = preloaded;
  if (!pre?.loaded) { preloadNext(); return false; } // hazır değilse bu turu sessiz geç — bekletme yok
  preloaded = null;
  sinceAd = 0;
  void persist();
  pre.ad.addAdEventListener(AdEventType.CLOSED, () => { preloadNext(); });
  pre.ad.addAdEventListener(AdEventType.ERROR, () => { preloadNext(); });
  pre.ad.show();
  return true;
}
