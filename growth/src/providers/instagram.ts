import { config } from '../config.ts';
import { log } from '../logger.ts';
import type { PostMetrics, ProviderLimits, PublishInput, PublishResult, PublishingCapabilities } from '../core/types.ts';
import type { AuthStatus, SocialProvider, ValidationResult } from './types.ts';

// Instagram provider — RESMİ Instagram Graph API (Business/Creator hesap şart).
// İki adımlı akış: /media (container) → /media_publish. Phase 1'de IMAGE
// yayını desteklenir (media public URL'den çekilir); REELS video pipeline'ı
// media brief üzerinden Phase 3'te bağlanır. Video briefi olan içerikler
// yayın anında medya yoksa manuel göreve düşer — asla yarım yayın yapılmaz.

const API = 'https://graph.facebook.com/v21.0';

function isConfigured(): boolean {
  return Boolean(config.instagram.igUserId && config.instagram.accessToken);
}

export const instagramProvider: SocialProvider = {
  platform: 'instagram',

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!isConfigured()) {
      return { ok: false, failure: 'not_configured', detail: 'IG_USER_ID / IG_ACCESS_TOKEN eksik' };
    }
    const check = this.validateContent(input);
    if (!check.valid) return { ok: false, failure: 'invalid', detail: check.problems.join('; ') };

    const { igUserId, accessToken } = config.instagram;
    try {
      const containerRes = await fetch(`${API}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_url: input.mediaUrl, caption: input.text, access_token: accessToken }),
      });
      const container = (await containerRes.json().catch(() => ({}))) as {
        id?: string; error?: { message?: string; code?: number };
      };
      if (containerRes.status === 429 || container.error?.code === 4 || container.error?.code === 17) {
        return { ok: false, failure: 'rate_limited', retryAfterMs: 60 * 60 * 1000 };
      }
      if (!containerRes.ok || !container.id) {
        log.warn('ig_container_failed', { status: containerRes.status, detail: container.error?.message });
        const failure = containerRes.status === 401 || containerRes.status === 403 ? 'invalid' : 'error';
        return { ok: false, failure, detail: container.error?.message ?? `HTTP ${containerRes.status}` };
      }

      const publishRes = await fetch(`${API}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
      });
      const published = (await publishRes.json().catch(() => ({}))) as {
        id?: string; error?: { message?: string };
      };
      if (!publishRes.ok || !published.id) {
        return { ok: false, failure: 'error', detail: published.error?.message ?? `HTTP ${publishRes.status}` };
      }
      return { ok: true, externalId: published.id };
    } catch (err) {
      return { ok: false, failure: 'error', detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async schedule(): Promise<PublishResult | null> {
    return null; // Content Publishing API'de zamanlama merkezi kuyruğumuzda.
  },

  validateContent(input: PublishInput): ValidationResult {
    const problems: string[] = [];
    if (!input.mediaUrl) problems.push('Instagram yayını public medya URL\'i ister (image_url)');
    if (input.text.length > 2200) problems.push('caption 2200 karakteri aşamaz');
    return { valid: problems.length === 0, problems };
  },

  async getMetrics(externalId: string): Promise<PostMetrics | null> {
    if (!isConfigured()) return null;
    try {
      const qs = new URLSearchParams({
        metric: 'impressions,reach,likes,comments,saved,shares',
        access_token: config.instagram.accessToken,
      });
      const res = await fetch(`${API}/${externalId}/insights?${qs}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { name: string; values?: { value?: number }[] }[] };
      if (!body.data) return null;
      const get = (name: string) => body.data!.find((d) => d.name === name)?.values?.[0]?.value;
      return {
        impressions: get('impressions'),
        views: get('reach'),
        likes: get('likes'),
        comments: get('comments'),
        saves: get('saved'),
        shares: get('shares'),
        raw: Object.fromEntries(body.data.map((d) => [d.name, d.values?.[0]?.value])),
      };
    } catch {
      return null;
    }
  },

  getLimits(): ProviderLimits {
    // Graph API resmi tavanı 100 post/24s — organik bir oyun hesabı için
    // güvenli doz bunun çok altındadır.
    return { maxPostsPerDay: 3, maxPostsPerHour: 1, minIntervalMinutes: 120 };
  },

  async refreshAuthentication(): Promise<AuthStatus> {
    if (!isConfigured()) return { configured: false, detail: 'IG_USER_ID / IG_ACCESS_TOKEN eksik' };
    try {
      const qs = new URLSearchParams({ fields: 'id,username', access_token: config.instagram.accessToken });
      const res = await fetch(`${API}/${config.instagram.igUserId}?${qs}`);
      return res.ok
        ? { configured: true, detail: 'ok' }
        : { configured: false, detail: `HTTP ${res.status} — token süresi dolmuş olabilir` };
    } catch (err) {
      return { configured: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  getPublishingCapabilities(): PublishingCapabilities {
    return {
      canPublish: isConfigured(),
      contentTypes: ['image'],
      requiresMediaUrl: true,
      maxTextLength: 2200,
    };
  },
};
