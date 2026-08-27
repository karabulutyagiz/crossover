import crypto from 'node:crypto';

// Atıf (bölüm 20): her yayına UTM'li tracking link. Kısa kod /r/<code>
// endpoint'inden geçer: tıklama loglanır, kullanıcı UA'ya göre App Store /
// Play Store / web'e yönlenir. Böylece "Link Clicks" ve "Store Visits" gerçek
// ölçümdür — tahmin değil.

export interface UtmParams {
  source: string;   // x / instagram / telegram / reddit...
  medium: string;   // organic / community / paid
  campaign: string; // football_challenge / derby_gs_fb...
  content: string;  // real_juve_ronaldo_v2 gibi içerik kimliği
}

export function buildUtmUrl(baseUrl: string, utm: UtmParams): string {
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source', sanitize(utm.source));
  url.searchParams.set('utm_medium', sanitize(utm.medium));
  url.searchParams.set('utm_campaign', sanitize(utm.campaign));
  url.searchParams.set('utm_content', sanitize(utm.content));
  return url.toString();
}

// utm_content üretimi: takımlar+oyuncu+varyanttan okunabilir slug.
export function utmContentSlug(teams: string[], player: string, variant: string): string {
  const parts = [...teams, player, variant]
    .map((p) => sanitize(p))
    .filter(Boolean);
  return parts.join('_').slice(0, 80);
}

function sanitize(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // Álvaro → alvaro (harf düşmesin)
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Çakışma ihtimali pratikte sıfır olan 8 karakterlik base36 kısa kod. */
export function newTrackingCode(): string {
  const bytes = crypto.randomBytes(6);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString(36).padStart(8, '0').slice(0, 8);
}

export function trackingUrl(trackingBaseUrl: string, code: string): string {
  return `${trackingBaseUrl.replace(/\/$/, '')}/r/${code}`;
}
