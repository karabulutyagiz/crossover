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
  ad.addAdEventListener(AdEventType.ERROR, (err: unknown) => {
    lastReason = `yükleme hatası: ${(err as { code?: string; message?: string })?.code ?? (err as Error)?.message ?? 'bilinmiyor'}`;
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
/**
 * TEST KANCASI (2026-08-30): kuralları ATLAYARAK reklamı yükleyip gösterir.
 * Gerekçesi: canlı test için "Sosyal Paketi olmayan hesap" bulunamıyor — Apple
 * aboneliği geri yüklediği an paket geri geliyor, dolayısıyla normal akışla
 * geçiş reklamı hiçbir hesapta denenemiyor. Bu kanca paket/sayaç kontrolünü
 * atlar, YALNIZ AdMob'un reklam verip vermediğini ölçer. Ayarlar > Monetization
 * Diagnostics içinden elle çağrılır; normal oyun akışında ASLA çalışmaz.
 */
export function testInterstitialNow(onSonuc: (mesaj: string) => void): void {
  if (!InterstitialAd) { onSonuc('native reklam modülü yok (Expo Go?)'); return; }
  const id = unitId();
  if (!id) { onSonuc('birim kimliği yok — sunucu ayarı gelmemiş'); return; }
  onSonuc(`yükleniyor… (birim …${id.slice(-8)})`);
  const ad = InterstitialAd.createForAdRequest(id);
  let bitti = false;
  const zamanlayici = setTimeout(() => {
    if (!bitti) { bitti = true; onSonuc('ZAMAN AŞIMI: 15 sn içinde reklam gelmedi'); }
  }, 15_000);
  ad.addAdEventListener(AdEventType.LOADED, () => {
    if (bitti) return;
    bitti = true; clearTimeout(zamanlayici);
    onSonuc('YÜKLENDİ — gösteriliyor');
    try { ad.show(); } catch (e) { onSonuc('gösterim hatası: ' + String(e)); }
  });
  ad.addAdEventListener(AdEventType.ERROR, (err: unknown) => {
    if (bitti) return;
    bitti = true; clearTimeout(zamanlayici);
    const e = err as { code?: string; message?: string };
    onSonuc(`ADMOB HATASI: ${e?.code ?? ''} ${e?.message ?? String(err)}`.trim());
  });
  try { ad.load(); } catch (e) { bitti = true; clearTimeout(zamanlayici); onSonuc('load() hatası: ' + String(e)); }
}

/** Son denemenin sonucu — Ayarlar > Monetization Diagnostics'te görünür. */
let lastReason = 'henüz denenmedi';
export function interstitialDiagnostics(): Record<string, string | number | boolean> {
  return {
    adsNativeModule: !!InterstitialAd,
    adsConfigLoaded: !!cfg,
    adsEnabled: !!cfg?.interstitialEnabled,
    adsUnitId: unitId() ?? 'yok',
    adsPreloaded: !!preloaded?.loaded,
    adsTotalMatches: totalMatches,
    adsSinceAd: sinceAd,
    adsLastReason: lastReason,
  };
}

export function maybeShowInterstitial(hasSocialPack: boolean): boolean {
  if (hasSocialPack) { lastReason = 'sosyal paket var — gösterilmez'; return false; }
  if (!InterstitialAd) { lastReason = 'native reklam modülü yok'; return false; }
  if (!cfg) { lastReason = 'sunucu reklam ayarı gelmedi'; return false; }
  if (!cfg.interstitialEnabled) { lastReason = 'sunucuda kapalı'; return false; }
  if (!unitId()) { lastReason = 'birim kimliği yok'; return false; }
  if (totalMatches < Math.max(0, cfg.interstitialGraceMatches)) {
    lastReason = `yeni oyuncu muafiyeti (${totalMatches}/${cfg.interstitialGraceMatches} maç)`; return false;
  }
  if (sinceAd < Math.max(1, cfg.interstitialEveryMatches)) {
    lastReason = `sıra gelmedi (${sinceAd}/${cfg.interstitialEveryMatches} maç)`; return false;
  }
  const pre = preloaded;
  if (!pre?.loaded) { lastReason = 'reklam henüz yüklenmedi'; preloadNext(); return false; }
  preloaded = null;
  sinceAd = 0;
  void persist();
  pre.ad.addAdEventListener(AdEventType.CLOSED, () => { preloadNext(); });
  pre.ad.addAdEventListener(AdEventType.ERROR, () => { preloadNext(); });
  pre.ad.show();
  lastReason = 'gösterildi';
  return true;
}
