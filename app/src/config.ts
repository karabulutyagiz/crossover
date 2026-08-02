// Game server endpoints (server/), tried IN ORDER until one connects.
//
// WHY A LIST AND NOT ONE URL: App Review rejected v1.0 twice under Guideline
// 2.1(a) — "guest login → error message" — while the server was provably
// healthy from every network we could reach it from (Turkey, a US vantage
// point, TestFlight). The single endpoint was a free wildcard-DNS host
// (*.nip.io), exactly the class of domain enterprise DNS/proxy filters block
// outright. On such a network EVERY login fails, because every login needs this
// socket. So: the real registrar-backed domain is primary, the old host stays
// as an automatic fallback, and no single blocked-or-down host can lock users
// out of the app again.
//
// Local development overrides the whole list:
//   EXPO_PUBLIC_SERVER_URL=ws://localhost:8080 npx expo start   (iOS simulator)
//   EXPO_PUBLIC_SERVER_URL=ws://10.0.2.2:8080  npx expo start   (Android emulator)
export const SERVER_URLS: readonly string[] = process.env.EXPO_PUBLIC_SERVER_URL
  ? [process.env.EXPO_PUBLIC_SERVER_URL]
  : [
      'wss://api.crossoverfootball.com', // primary — real domain, registrar DNS
      'wss://168-222-180-190.nip.io',    // fallback — same server, wildcard DNS
    ];

// Index of the endpoint that last worked. Every connect attempt starts here, so
// once a device learns which host its network allows, it keeps using it.
let activeIndex = 0;

export function activeServerUrl(): string {
  return SERVER_URLS[activeIndex] ?? SERVER_URLS[0]!;
}

/** Remember the endpoint that just connected, so HTTP calls follow the socket. */
export function setActiveServerUrl(url: string): void {
  const i = SERVER_URLS.indexOf(url);
  if (i >= 0) activeIndex = i;
}

export function activeEndpointIndex(): number {
  return activeIndex;
}

/** ws(s):// → http(s):// for the REST endpoints (/config, /scopes, /leaderboard). */
export function httpFor(wsUrl: string): string {
  return wsUrl.replace(/^ws/, 'http');
}

/**
 * fetch() against the game server with the same failover as the socket: try the
 * active endpoint first, then the rest. A host that is blocked (DNS/proxy) hangs
 * rather than erroring, so each attempt is bounded by its own timeout.
 */
export async function fetchApi(path: string, timeoutMs = 8000): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < SERVER_URLS.length; i++) {
    const idx = (activeIndex + i) % SERVER_URLS.length;
    const base = httpFor(SERVER_URLS[idx]!);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(base + path, { signal: ctrl.signal });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} from ${base}`); continue; }
      activeIndex = idx; // this host answers — prefer it from now on
      return res;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all server endpoints failed');
}

// Legacy single-URL exports — the primary endpoint. Prefer activeServerUrl() /
// fetchApi() in app code; these exist for the webapp wrapper and any consumer
// that just needs a default.
export const SERVER_URL = SERVER_URLS[0]!;
export const HTTP_URL = httpFor(SERVER_URL);

export const APP_BUILD_NUMBER = 122;

// Google OAuth client IDs (from Google Cloud → Credentials).
export const GOOGLE_IOS_CLIENT_ID =
  '85689499254-iu4ap4sl6rqhpeonj00avg390pnhnlsn.apps.googleusercontent.com';
export const GOOGLE_WEB_CLIENT_ID =
  '85689499254-7eshn0faudar48icce3q5bdv69k5ithr.apps.googleusercontent.com';
