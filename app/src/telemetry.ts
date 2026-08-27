type TelemetryProps = Record<string, string | number | boolean | null | undefined>;

// PERFORMANS (2026-08-27): production'da console.log YASAK — Hermes'te her log
// serialize + native köprü demektir ve yoğun track() çağrıları (maç olayları,
// engagement, mağaza) ana JS thread'inde görünür takılma üretiyordu. Prod'da
// olaylar sessizce küçük bir halka tampona yazılır (ileride gerçek sink'e —
// Sentry/Amplitude — buradan boşaltılır); console yalnız dev'de ya da
// EXPO_PUBLIC_TELEMETRY=1 ile açık.
const consoleEnabled = __DEV__ || process.env.EXPO_PUBLIC_TELEMETRY === '1';

const RING_SIZE = 200;
const ring: { at: number; event: string; props: TelemetryProps }[] = [];

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return '{}'; }
}

export function track(event: string, props: TelemetryProps = {}): void {
  // Halka tampon her modda dolar — gerçek sink eklendiğinde geriye dönük son
  // 200 olay da gönderilebilir; çağrı maliyeti bir push + shift'ten ibaret.
  ring.push({ at: Date.now(), event, props });
  if (ring.length > RING_SIZE) ring.shift();
  if (consoleEnabled) console.log(`[telemetry] ${event} ${safeJson(props)}`);
}

/** Son olaylar (hata raporuna iliştirmek ya da gerçek sink'e boşaltmak için). */
export function recentEvents(): readonly { at: number; event: string; props: TelemetryProps }[] {
  return ring;
}

export function captureError(error: unknown, context: TelemetryProps = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  // Hatalar production'da da warn'lanır — nadirdir, kaybolmasın.
  console.warn(`[telemetry:error] ${message} ${safeJson({ ...context, stack })}`);
}

export function installGlobalErrorHandlers(): void {
  const g = globalThis as typeof globalThis & { ErrorUtils?: { getGlobalHandler?: () => ((e: unknown, fatal?: boolean) => void); setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void } };
  const previous = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((error, fatal) => {
    captureError(error, { fatal: Boolean(fatal) });
    previous?.(error, fatal);
  });
}
