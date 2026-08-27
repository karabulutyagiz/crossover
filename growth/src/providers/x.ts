import crypto from 'node:crypto';
import { config } from '../config.ts';
import { log } from '../logger.ts';
import type { PostMetrics, ProviderLimits, PublishInput, PublishResult, PublishingCapabilities } from '../core/types.ts';
import type { AuthStatus, SocialProvider, ValidationResult } from './types.ts';

// X (Twitter) provider — RESMİ API v2, OAuth 1.0a user context.
// Yalnızca yetkili COF hesabı adına POST /2/tweets çağrılır. Limit bypass,
// hesap rotasyonu vb. YOK; 429'da exponential backoff pipeline'da uygulanır.

const API = 'https://api.twitter.com/2';

function pctEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauth1Header(method: string, url: string, extraParams: Record<string, string> = {}): string {
  const { apiKey, apiSecret, accessToken, accessSecret } = config.x;
  const oauth: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };
  const allParams = { ...oauth, ...extraParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(allParams[k]!)}`)
    .join('&');
  const base = [method.toUpperCase(), pctEncode(url), pctEncode(paramString)].join('&');
  const signingKey = `${pctEncode(apiSecret)}&${pctEncode(accessSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  const header: Record<string, string> = { ...oauth, oauth_signature: signature };
  return 'OAuth ' + Object.keys(header)
    .sort()
    .map((k) => `${pctEncode(k)}="${pctEncode(header[k]!)}"`)
    .join(', ');
}

function isConfigured(): boolean {
  const { apiKey, apiSecret, accessToken, accessSecret } = config.x;
  return Boolean(apiKey && apiSecret && accessToken && accessSecret);
}

// ── Fırsat keşfi: son futbol tweet'leri (resmi recent search) ────────────
// NOT: X API Free tier'da arama YOK (403 döner) — bu durumda hata mesajıyla
// boş döneriz, akış manuel URL yapıştırmayla devam eder. Basic+ planlarda çalışır.
export interface FoundTweet {
  id: string;
  text: string;
  author: string;
  likes: number;
  retweets: number;
  url: string;
}

export async function searchRecentTweets(
  query: string,
  maxResults = 10,
): Promise<{ ok: true; tweets: FoundTweet[] } | { ok: false; detail: string }> {
  if (!isConfigured()) return { ok: false, detail: 'X API kimlik bilgileri yok' };
  const url = `${API}/tweets/search/recent`;
  const params: Record<string, string> = {
    query,
    max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    'tweet.fields': 'public_metrics,author_id,lang',
    expansions: 'author_id',
    'user.fields': 'username',
  };
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${url}?${qs}`, {
      headers: { authorization: oauth1Header('GET', url, params) },
    });
    if (res.status === 403) {
      return { ok: false, detail: 'X planında arama erişimi yok (Free tier) — URL\'yi elle yapıştır' };
    }
    if (res.status === 429) return { ok: false, detail: 'X arama rate limitinde — sonra dene' };
    const body = (await res.json().catch(() => ({}))) as {
      data?: { id: string; text: string; author_id?: string; public_metrics?: Record<string, number> }[];
      includes?: { users?: { id: string; username: string }[] };
      detail?: string;
    };
    if (!res.ok || !body.data) return { ok: false, detail: body.detail ?? `HTTP ${res.status}` };
    const users = new Map((body.includes?.users ?? []).map((u) => [u.id, u.username]));
    const tweets = body.data.map((t) => {
      const author = users.get(t.author_id ?? '') ?? '';
      return {
        id: t.id,
        text: t.text,
        author,
        likes: t.public_metrics?.like_count ?? 0,
        retweets: t.public_metrics?.retweet_count ?? 0,
        url: `https://x.com/${author || 'i'}/status/${t.id}`,
      };
    }).sort((a, b) => (b.likes + b.retweets * 2) - (a.likes + a.retweets * 2));
    return { ok: true, tweets };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export const xProvider: SocialProvider = {
  platform: 'x',

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!isConfigured()) {
      return { ok: false, failure: 'not_configured', detail: 'X API kimlik bilgileri env\'de yok' };
    }
    const check = this.validateContent(input);
    if (!check.valid) return { ok: false, failure: 'invalid', detail: check.problems.join('; ') };

    const url = `${API}/tweets`;
    const payload: Record<string, unknown> = { text: input.text };
    if (input.replyToExternalId) {
      payload.reply = { in_reply_to_tweet_id: input.replyToExternalId };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: oauth1Header('POST', url),
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        const reset = Number(res.headers.get('x-rate-limit-reset') ?? 0) * 1000;
        const retryAfterMs = reset > Date.now() ? reset - Date.now() : 15 * 60 * 1000;
        return { ok: false, failure: 'rate_limited', retryAfterMs };
      }
      const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; detail?: string; title?: string };
      if (!res.ok || !body.data?.id) {
        const detail = body.detail ?? body.title ?? `HTTP ${res.status}`;
        log.warn('x_publish_failed', { status: res.status, detail });
        // 401/403 kalıcıdır (token/izin sorunu) — retry loop'a girmesin.
        const failure = res.status === 401 || res.status === 403 ? 'invalid' : 'error';
        return { ok: false, failure, detail };
      }
      return { ok: true, externalId: body.data.id, externalUrl: `https://x.com/i/status/${body.data.id}` };
    } catch (err) {
      return { ok: false, failure: 'error', detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async schedule(): Promise<PublishResult | null> {
    return null; // X API'de native zamanlama yok — merkezi kuyruk kullanılır.
  },

  validateContent(input: PublishInput): ValidationResult {
    const problems: string[] = [];
    if (!input.text.trim()) problems.push('metin boş');
    if (input.text.length > 280) problems.push(`280 karakter sınırı aşıldı (${input.text.length})`);
    return { valid: problems.length === 0, problems };
  },

  async getMetrics(externalId: string): Promise<PostMetrics | null> {
    if (!isConfigured()) return null;
    const url = `${API}/tweets/${externalId}`;
    const params = { 'tweet.fields': 'public_metrics' };
    const qs = new URLSearchParams(params).toString();
    try {
      const res = await fetch(`${url}?${qs}`, {
        headers: { authorization: oauth1Header('GET', url, params) },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: { public_metrics?: Record<string, number> };
      };
      const m = body.data?.public_metrics;
      if (!m) return null;
      return {
        impressions: m.impression_count,
        likes: m.like_count,
        comments: m.reply_count,
        shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
        saves: m.bookmark_count,
        raw: m,
      };
    } catch {
      return null;
    }
  },

  getLimits(): ProviderLimits {
    // Resmi limitlerin çok altında güvenli tavanlar (bölüm 17).
    return { maxPostsPerDay: 8, maxPostsPerHour: 2, minIntervalMinutes: 45 };
  },

  async refreshAuthentication(): Promise<AuthStatus> {
    if (!isConfigured()) return { configured: false, detail: 'X_API_KEY/X_ACCESS_TOKEN eksik' };
    // OAuth 1.0a token'ları süresiz — canlılığı hafif bir GET ile doğrula.
    const url = `${API}/users/me`;
    try {
      const res = await fetch(url, { headers: { authorization: oauth1Header('GET', url) } });
      return res.ok
        ? { configured: true, detail: 'ok' }
        : { configured: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { configured: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  getPublishingCapabilities(): PublishingCapabilities {
    return {
      canPublish: isConfigured(),
      contentTypes: ['post', 'poll', 'thread'],
      requiresMediaUrl: false,
      maxTextLength: 280,
    };
  },
};
