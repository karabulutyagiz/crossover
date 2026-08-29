import { createSign } from 'node:crypto';
import { config } from './config.ts';

export type StorePlatform = 'ios' | 'android';

export type LiveStoreVersions = {
  iosVersion: string | null;
  iosBuildNumber: number | null;
  androidVersion: string | null;
  androidVersionCode: number | null;
  checkedAt: string | null;
  source: 'disabled' | 'live' | 'cache' | 'stale' | 'unavailable';
  errors: string[];
};

type AndroidStoreVersion = {
  version: string | null;
  versionCode: number | null;
};

type IosStoreVersion = {
  version: string | null;
  buildNumber: number | null;
};

type CacheEntry = {
  value: LiveStoreVersions;
  fetchedAt: number;
  expiresAt: number;
};

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
};

type GooglePlayCredentials = {
  clientEmail: string;
  privateKey: string;
};

let cache: CacheEntry | null = null;
let inFlight: Promise<LiveStoreVersions> | null = null;
let appStoreConnectToken: { token: string; expiresAt: number } | null = null;
let googlePlayToken: { token: string; expiresAt: number } | null = null;

export function compareVersionStrings(a: string, b: string): number {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

export function storeVersionIsNewer(currentVersion: string | null | undefined, storeVersion: string | null | undefined): boolean {
  if (!currentVersion || !storeVersion) return false;
  return compareVersionStrings(storeVersion, currentVersion) > 0;
}

export async function getLiveStoreVersions(): Promise<LiveStoreVersions> {
  if (!config.storeVersionCheck.enabled) {
    return { iosVersion: null, iosBuildNumber: null, androidVersion: null, androidVersionCode: null, checkedAt: null, source: 'disabled', errors: [] };
  }

  const now = Date.now();
  if (cache && now < cache.expiresAt) return { ...cache.value, source: 'cache' };
  if (inFlight) return inFlight;

  inFlight = refreshStoreVersions(now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function versionParts(version: string): number[] {
  const parts = version.trim().match(/\d+/g)?.map((part) => Number(part)).filter(Number.isFinite) ?? [];
  return parts.length > 0 ? parts : [0];
}

function normalizeStoreVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /varies with device/i.test(trimmed)) return null;
  return trimmed.match(/\d+(?:\.\d+){0,4}/)?.[0] ?? null;
}

async function refreshStoreVersions(startedAt: number): Promise<LiveStoreVersions> {
  const previous = cache;
  const [iosResult, androidResult] = await Promise.allSettled([
    fetchIosStoreVersion(),
    fetchAndroidStoreVersion(),
  ]);
  const errors: string[] = [];
  let source: LiveStoreVersions['source'] = 'live';
  let iosVersion: string | null = null;
  let iosBuildNumber: number | null = null;
  let androidVersion: string | null = null;
  let androidVersionCode: number | null = null;

  if (iosResult.status === 'fulfilled') {
    iosVersion = iosResult.value.version;
    iosBuildNumber = iosResult.value.buildNumber;
  } else {
    errors.push(`ios: ${errorMessage(iosResult.reason)}`);
  }

  if (androidResult.status === 'fulfilled') {
    androidVersion = androidResult.value.version;
    androidVersionCode = androidResult.value.versionCode;
  } else {
    errors.push(`android: ${errorMessage(androidResult.reason)}`);
  }

  const canUseStale = !!previous && startedAt - previous.fetchedAt <= config.storeVersionCheck.staleIfErrorMs;
  if (!iosVersion && canUseStale) {
    iosVersion = previous.value.iosVersion;
    if (iosVersion) source = 'stale';
  }
  if (iosBuildNumber === null && canUseStale) {
    iosBuildNumber = previous.value.iosBuildNumber;
    if (iosBuildNumber !== null) source = 'stale';
  }
  if (!androidVersion && canUseStale) {
    androidVersion = previous.value.androidVersion;
    if (androidVersion) source = 'stale';
  }
  if (androidVersionCode === null && canUseStale) {
    androidVersionCode = previous.value.androidVersionCode;
    if (androidVersionCode !== null) source = 'stale';
  }
  if (!iosVersion && iosBuildNumber === null && !androidVersion && androidVersionCode === null && errors.length > 0) source = 'unavailable';

  const now = Date.now();
  const value: LiveStoreVersions = {
    iosVersion,
    iosBuildNumber,
    androidVersion,
    androidVersionCode,
    checkedAt: new Date(now).toISOString(),
    source,
    errors,
  };
  cache = { value, fetchedAt: now, expiresAt: now + config.storeVersionCheck.cacheMs };
  return value;
}

async function fetchIosStoreVersion(): Promise<IosStoreVersion> {
  const errors: string[] = [];
  const publicVersion = await fetchPublicAppStoreVersion().catch((err) => {
    errors.push(`publicLookup: ${errorMessage(err)}`);
    return null;
  });
  const connectVersion = await fetchAppStoreConnectLiveVersion().catch((err) => {
    errors.push(`connectApi: ${errorMessage(err)}`);
    return null;
  });
  const buildNumber = publicVersion && connectVersion?.version === publicVersion ? connectVersion.buildNumber : null;
  if (!publicVersion) throw new Error(errors.join('; ') || 'App Store version not found');
  return { version: publicVersion, buildNumber };
}

async function fetchPublicAppStoreVersion(): Promise<string | null> {
  const url = new URL('https://itunes.apple.com/lookup');
  if (config.storeVersionCheck.iosAppId) url.searchParams.set('id', config.storeVersionCheck.iosAppId);
  else url.searchParams.set('bundleId', config.storeVersionCheck.iosBundleId);
  url.searchParams.set('country', config.storeVersionCheck.appStoreCountry);

  const json = await fetchJson(url.toString()) as { results?: Array<{ version?: unknown }> };
  const version = normalizeStoreVersion(json.results?.[0]?.version);
  if (!version) throw new Error('App Store version not found');
  return version;
}

async function fetchAppStoreConnectLiveVersion(): Promise<IosStoreVersion | null> {
  const token = appStoreConnectAccessToken();
  if (!token) return null;
  const url = new URL(`https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(config.storeVersionCheck.iosAppId)}/appStoreVersions`);
  url.searchParams.set('filter[platform]', 'IOS');
  url.searchParams.set('filter[appStoreState]', 'READY_FOR_SALE');
  url.searchParams.set('include', 'build');
  url.searchParams.set('fields[appStoreVersions]', 'versionString,build');
  url.searchParams.set('fields[builds]', 'version');
  url.searchParams.set('limit', '1');

  const json = await fetchJson(url.toString(), { headers: { authorization: `Bearer ${token}` } }) as {
    data?: Array<{ relationships?: { build?: { data?: { id?: string } | null } }; attributes?: { versionString?: unknown } }>;
    included?: Array<{ id?: string; type?: string; attributes?: { version?: unknown; buildNumber?: unknown } }>;
  };
  const liveVersion = json.data?.[0];
  const buildId = liveVersion?.relationships?.build?.data?.id;
  const build = json.included?.find((item) => item.type === 'builds' && item.id === buildId) ?? json.included?.find((item) => item.type === 'builds');
  const version = normalizeStoreVersion(liveVersion?.attributes?.versionString) ?? normalizeStoreVersion(build?.attributes?.version);
  const buildNumber = numberFromBuild(build?.attributes?.buildNumber) ?? numberFromBuild(build?.attributes?.version);
  if (!version && buildNumber === null) throw new Error('READY_FOR_SALE App Store Connect build not found');
  return { version, buildNumber };
}

function appStoreConnectAccessToken(): string | null {
  const keyId = config.storeVersionCheck.appStoreConnectKeyId.trim();
  const issuerId = config.storeVersionCheck.appStoreConnectIssuerId.trim();
  const privateKey = normalizePrivateKey(config.storeVersionCheck.appStoreConnectPrivateKey);
  if (!keyId || !issuerId || !privateKey) return null;

  const now = Date.now();
  if (appStoreConnectToken && now < appStoreConnectToken.expiresAt) return appStoreConnectToken.token;
  const iat = Math.floor(now / 1000);
  appStoreConnectToken = {
    token: signJwt(
      { alg: 'ES256', kid: keyId, typ: 'JWT' },
      { iss: issuerId, iat, exp: iat + 20 * 60, aud: 'appstoreconnect-v1' },
      privateKey,
    ),
    expiresAt: now + 19 * 60 * 1000,
  };
  return appStoreConnectToken.token;
}

async function fetchAndroidStoreVersion(): Promise<AndroidStoreVersion> {
  const errors: string[] = [];
  const versionCode = await fetchGooglePlayProductionVersionCode().catch((err) => {
    errors.push(`developerApi: ${errorMessage(err)}`);
    return null;
  });
  const version = await fetchAndroidStoreVersionName().catch((err) => {
    errors.push(`publicPage: ${errorMessage(err)}`);
    return null;
  });
  if (versionCode === null && !version) throw new Error(errors.join('; ') || 'Play Store version not found');
  return { version, versionCode };
}

async function fetchGooglePlayProductionVersionCode(): Promise<number | null> {
  const token = await googlePlayAccessToken();
  if (!token) return null;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.storeVersionCheck.androidPackageName)}/tracks/production`;
  const track = await fetchJson(url, { headers: { authorization: `Bearer ${token}` } }) as {
    releases?: Array<{ status?: string; versionCodes?: Array<string | number> }>;
  };
  const codes = (track.releases ?? [])
    .filter((release) => release.status === 'completed' || (config.storeVersionCheck.playStoreIncludeStagedReleases && release.status === 'inProgress'))
    .flatMap((release) => release.versionCodes ?? [])
    .map((code) => Number(code))
    .filter(Number.isFinite);
  if (codes.length === 0) throw new Error('No production Play Store versionCode found');
  return Math.max(...codes);
}

/** Google Play Developer API erişim jetonu (service account JWT → OAuth).
 *  IAP doğrulaması da (game/iap.ts) aynı kimlikle bu ucu kullanır. */
export async function googlePlayAccessToken(): Promise<string | null> {
  const credentials = googlePlayCredentials();
  if (!credentials) return null;
  const now = Date.now();
  if (googlePlayToken && now < googlePlayToken.expiresAt) return googlePlayToken.token;

  const iat = Math.floor(now / 1000);
  const assertion = signGoogleJwt(credentials, {
    iss: credentials.clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  });
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const token = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }) as { access_token?: unknown; expires_in?: unknown };
  if (typeof token.access_token !== 'string') throw new Error('Google Play token missing');

  const expiresIn = typeof token.expires_in === 'number' ? token.expires_in : 3600;
  googlePlayToken = { token: token.access_token, expiresAt: now + Math.max(60, expiresIn - 60) * 1000 };
  return googlePlayToken.token;
}

function googlePlayCredentials(): GooglePlayCredentials | null {
  const fromJson = serviceAccountFromJson(config.storeVersionCheck.googlePlayServiceAccountJson);
  if (fromJson) return fromJson;
  const clientEmail = config.storeVersionCheck.googlePlayClientEmail.trim();
  const privateKey = normalizePrivateKey(config.storeVersionCheck.googlePlayPrivateKey);
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey };
}

function serviceAccountFromJson(raw: string): GooglePlayCredentials | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parseServiceAccountJson(trimmed) as { client_email?: unknown; private_key?: unknown } | null;
  if (typeof parsed?.client_email !== 'string' || typeof parsed.private_key !== 'string') return null;
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key.replace(/\\n/g, '\n') };
}

function parseServiceAccountJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

function signGoogleJwt(credentials: GooglePlayCredentials, claims: Record<string, string | number>): string {
  return signJwt({ alg: 'RS256', typ: 'JWT' }, claims, credentials.privateKey);
}

function signJwt(header: Record<string, string>, claims: Record<string, string | number>, privateKey: string): string {
  const encodedHeader = base64UrlJson(header);
  const encodedClaims = base64UrlJson(claims);
  const unsigned = `${encodedHeader}.${encodedClaims}`;
  const signer = createSign(header.alg === 'ES256' ? 'SHA256' : 'RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = header.alg === 'ES256'
    ? signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
    : signer.sign(privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const unescaped = trimmed.replace(/\\n/g, '\n');
  if (unescaped.includes('BEGIN')) return unescaped;
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim().replace(/\\n/g, '\n');
    if (decoded.includes('BEGIN')) return decoded;
  } catch {
    // Fall through to the unescaped value.
  }
  return unescaped;
}

function numberFromBuild(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function fetchAndroidStoreVersionName(): Promise<string | null> {
  const url = new URL('https://play.google.com/store/apps/details');
  url.searchParams.set('id', config.storeVersionCheck.androidPackageName);
  url.searchParams.set('hl', config.storeVersionCheck.playStoreLanguage);
  url.searchParams.set('gl', config.storeVersionCheck.playStoreCountry);

  const html = await fetchText(url.toString());
  const version = extractPlayStoreVersion(html);
  if (!version) throw new Error('Play Store versionName not found');
  return version;
}

function extractPlayStoreVersion(html: string): string | null {
  const jsonLdMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch?.[1]) {
    try {
      const jsonLd = JSON.parse(decodeHtmlEntities(jsonLdMatch[1])) as { softwareVersion?: unknown };
      const version = normalizeStoreVersion(jsonLd.softwareVersion);
      if (version) return version;
    } catch {
      // Google can change this blob without notice; fall through to regex probes.
    }
  }

  const patterns = [
    /"softwareVersion"\s*:\s*"([^"]+)"/i,
    /\\"softwareVersion\\"\s*:\s*\\"([^\\"]+)\\"/i,
    /itemprop="softwareVersion"[^>]*>\s*([^<]+)</i,
  ];
  for (const pattern of patterns) {
    const version = normalizeStoreVersion(html.match(pattern)?.[1]);
    if (version) return version;
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchJson(url: string, init?: FetchInit): Promise<unknown> {
  return JSON.parse(await fetchText(url, init));
}

async function fetchText(url: string, init: FetchInit = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.storeVersionCheck.timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'user-agent': 'CrossoverFootball/1.0 forced-update-check', ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
