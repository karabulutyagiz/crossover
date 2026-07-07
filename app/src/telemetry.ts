type TelemetryProps = Record<string, string | number | boolean | null | undefined>;

const enabled = !__DEV__ || process.env.EXPO_PUBLIC_TELEMETRY === '1';

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return '{}'; }
}

export function track(event: string, props: TelemetryProps = {}): void {
  if (!enabled) return;
  // Replace with a real sink (Sentry/Firebase/Amplitude) without changing call sites.
  console.log(`[telemetry] ${event} ${safeJson(props)}`);
}

export function captureError(error: unknown, context: TelemetryProps = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
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
