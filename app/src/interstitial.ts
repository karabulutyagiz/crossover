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
import { holdModalSlotForNativeAd, releaseModalSlotForNativeAd } from './modalTraffic';

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

// REKLAM SONRASI TAKILMA (2026-08-31): reklam kapanır kapanmaz yeni reklamın
// indirilmesi başlıyordu. Oyuncu tam o anda oyuna dönüyor; indirme + kod çözme
// ana iş parçacığını meşgul ettiği için dönüş "kasıyor" (oyuncu raporu).
// Yeni reklam artık oyuncu oyuna yerleştikten SONRA hazırlanır — gösterim
// zamanı gelene kadar (en erken 3 maç sonra) fazlasıyla vakit var.
const PRELOAD_IDLE_MS = 4_000;
function preloadAfterIdle(): void {
  setTimeout(() => preloadNext(), PRELOAD_IDLE_MS);
}

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
    lastReason = `hata:${String((err as { code?: string })?.code ?? 'bilinmiyor').replace('admob/error-code-', '').slice(0, 22)}`;
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
  // ÖNCE HAZIR REKLAMI KULLAN (2026-08-31): test butonu her basışta sıfırdan
  // indiriyordu ve reklam 1-3 sn sonra açılıyordu ("anlık gelmiyor" raporu).
  // Normal akışta reklam zaten önceden yüklenip bekletiliyor; test de aynı
  // hazır kopyayı kullanırsa gecikme SIFIR olur ve gerçek deneyimi ölçer.
  const hazir = preloaded;
  if (hazir?.loaded) {
    preloaded = null;
    hazir.ad.addAdEventListener(AdEventType.CLOSED, () => { preloadAfterIdle(); });
    onSonuc('HAZIR reklam gösteriliyor (gecikmesiz)');
    try { hazir.ad.show(); } catch (e) { onSonuc('gösterim hatası: ' + String(e)); }
    return;
  }
  onSonuc(`yükleniyor… (hazır kopya yoktu, birim …${id.slice(-8)})`);
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

// GÖSTERİM DOĞRULAMASI (2026-09-01): "AdMob'da veri yok" sorusunu şimdiye kadar
// yanıtlayamadık çünkü GOSTERILDI'yi show() ÇAĞRILDIĞI an yazıyorduk — SDK'nın
// pencereyi gerçekten sunup sunmadığını değil, bizim niyetimizi ölçüyordu.
// Artık SDK'nın kendi olayları ölçülüyor:
//   OPENED → reklam ekranda BELİRDİ
//   PAID   → AdMob bu gösterimi ÜCRETLENDİRDİ (raporda görünmesi gereken olay)
// PAID gelmiyorsa gösterim AdMob tarafında sayılmıyor demektir; bu ikisinin
// farkı sorunun hangi tarafta olduğunu tek başına söyler.
let showAt = 0;
let openedAt = 0;
let paidAt = 0;
/** show() sonrası kısa kod: sunum ve ücretlendirme gerçekten oldu mu. */
export function interstitialPresentation(): string {
  if (!showAt) return 'denenmedi';
  if (paidAt >= showAt) return 'ACILDI+ODENDI';
  if (openedAt >= showAt) return 'ACILDI+ODENMEDI';
  return 'ACILMADI';
}
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
    adsPresentation: interstitialPresentation(),
  };
}

/**
 * `onClosed`: reklam KAPANDIKTAN sonra çalışır. Reklam ekrandayken pencere
 * açmak iOS'ta sunum zincirini kilitler — çağıran taraf kör zamanlayıcı yerine
 * bunu kullanmalıdır.
 */
export function maybeShowInterstitial(hasSocialPack: boolean, onClosed?: () => void): boolean {
  if (hasSocialPack) { lastReason = 'paket'; return false; }
  if (!InterstitialAd) { lastReason = 'modulyok'; return false; }
  if (!cfg) { lastReason = 'cfgyok'; return false; }
  if (!cfg.interstitialEnabled) { lastReason = 'kapali'; return false; }
  if (!unitId()) { lastReason = 'birimyok'; return false; }
  if (totalMatches < Math.max(0, cfg.interstitialGraceMatches)) {
    lastReason = `muaf ${totalMatches}/${cfg.interstitialGraceMatches}`; return false;
  }
  if (sinceAd < Math.max(1, cfg.interstitialEveryMatches)) {
    lastReason = `sira ${sinceAd}/${cfg.interstitialEveryMatches}`; return false;
  }
  const pre = preloaded;
  if (!pre?.loaded) { lastReason = 'yuklenmedi'; preloadNext(); return false; }
  preloaded = null;
  sinceAd = 0;
  void persist();
  pre.ad.addAdEventListener(AdEventType.CLOSED, () => {
    releaseModalSlotForNativeAd();
    preloadAfterIdle();
    try { onClosed?.(); } catch { /* çağıranın hatası reklamı bozmasın */ }
  });
  pre.ad.addAdEventListener(AdEventType.ERROR, () => { releaseModalSlotForNativeAd(); preloadNext(); });
  pre.ad.addAdEventListener(AdEventType.OPENED, () => { openedAt = Date.now(); });
  pre.ad.addAdEventListener(AdEventType.PAID, () => { paidAt = Date.now(); });
  showAt = Date.now();
  openedAt = 0;
  paidAt = 0;
  // Slot reklam SUNULMADAN önce tutulur: aradaki karede açılacak bir pencere
  // bile kilitlenmeye yeter.
  holdModalSlotForNativeAd();
  pre.ad.show();
  // Hangi birimle gösterildiği de kaydedilir: "AdMob'da görünmüyor" sorusunun
  // iki cevabı var — ya raporlama gecikmesi ya TEST birimi (test reklamları
  // istatistiklere HİÇ yansımaz). Birim son 4 hanesi bunu tahmin etmeden ayırır.
  lastReason = `GOSTERILDI:${(unitId() ?? '').slice(-4)}${__DEV__ ? '-TEST' : ''}`;
  return true;
}
