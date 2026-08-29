// ============================================================================
// DONMA DEDEKTÖRÜ (2026-08-29)
//
// Oyuncular "maç içinde, genelde 3-2-1'de ve takım seçerken donuyor" diye
// bildirdi; donma iPhone 17 Pro'da bile görüldü, yani zayıf cihaz açıklaması
// yetmiyor. Apple'ın hang metrikleri de henüz boş (yeterli örneklem yok).
// Tahmin yürütmek yerine ÖLÇÜYORUZ.
//
// İKİ SİNYAL:
//  1) TAKILMA (jank): JS thread'i saniyede bir atan bir kalp atışı çalıştırır.
//     Atış gecikirse aradaki fark JS'in ne kadar bloklandığını verir — çünkü
//     bloklanan thread kendi zamanlayıcısını da geciktirir. Eşiği aşan gecikme
//     o anki EKRAN bilgisiyle sunucuya yazılır.
//  2) KİRLİ ÇIKIŞ: mevcut ekran ve "temiz kapanış" bayrağı diske yazılır.
//     Oyuncu donan uygulamayı KILL ederse bayrak kirli kalır; sonraki açılışta
//     "en son şu ekranda öldü" raporu gider. Donmanın yerini bu söyler.
//
// Maliyet bilinçli olarak çok düşük: saniyede bir Date.now() karşılaştırması ve
// yalnız EŞİK AŞILDIĞINDA yazma. Telemetrinin kendisi donmaya sebep olmamalı.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from './telemetry';

const STATE_KEY = '@crossover_freeze_watch_v1';
const HEARTBEAT_MS = 1000;
/** Bu kadar geciken bir atış "takılma" sayılır (normal jitter ~50 ms). */
const JANK_THRESHOLD_MS = 3000;

type Report = { kind: 'jank' | 'dirty_exit'; screen: string; stalledMs: number; at: number };

let timer: ReturnType<typeof setInterval> | null = null;
let lastBeat = 0;
let currentScreen = 'unknown';
let reporter: ((r: Report) => void) | null = null;

/** O anki ekran/faz — raporun "nerede" kısmı. */
export function setFreezeScreen(screen: string): void {
  if (screen === currentScreen) return;
  currentScreen = screen;
  // Kirli çıkış tespiti için diske yaz (kill sonrası tek kalan iz budur).
  AsyncStorage.setItem(STATE_KEY, JSON.stringify({ screen, at: Date.now(), clean: false })).catch(() => {});
}

/** Uygulama düzgün arka plana alındığında çağrılır — bu bir donma DEĞİLDİR. */
export function markCleanExit(): void {
  AsyncStorage.setItem(STATE_KEY, JSON.stringify({ screen: currentScreen, at: Date.now(), clean: true })).catch(() => {});
}

/**
 * İzlemeyi başlatır ve ÖNCEKİ oturumun kirli çıkışını (varsa) rapor eder.
 * `onReport` sunucuya göndermek için verilir; verilmezse yalnız telemetriye yazılır.
 */
export function startFreezeWatch(onReport?: (r: Report) => void): () => void {
  reporter = onReport ?? null;

  // Önceki oturum: kirli kapandıysa donma şüphesi.
  AsyncStorage.getItem(STATE_KEY).then((raw) => {
    if (!raw) return;
    try {
      const prev = JSON.parse(raw) as { screen?: string; at?: number; clean?: boolean };
      if (prev.clean === false && prev.screen) {
        const report: Report = { kind: 'dirty_exit', screen: prev.screen, stalledMs: 0, at: prev.at ?? 0 };
        track('freeze_dirty_exit', { screen: report.screen });
        reporter?.(report);
      }
    } catch { /* bozuk kayıt — yoksay */ }
  }).catch(() => {});

  lastBeat = Date.now();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    const now = Date.now();
    const drift = now - lastBeat - HEARTBEAT_MS;
    lastBeat = now;
    if (drift >= JANK_THRESHOLD_MS) {
      // JS thread bu kadar süre bloklandı — donmanın ölçülmüş hâli.
      const report: Report = { kind: 'jank', screen: currentScreen, stalledMs: drift, at: now };
      track('freeze_jank', { screen: report.screen, stalledMs: drift });
      reporter?.(report);
    }
  }, HEARTBEAT_MS);

  return () => { if (timer) clearInterval(timer); timer = null; };
}
