import { config } from '../config.ts';
import { log } from '../logger.ts';
import type { PostMetrics, ProviderLimits, PublishInput, PublishResult, PublishingCapabilities } from '../core/types.ts';
import type { AuthStatus, SocialProvider, ValidationResult } from './types.ts';

// Telegram provider — RESMİ Bot API, yalnızca OWNED kanallar (bölüm 6).
// Bot kendi kendine gruplara girmez; harici topluluklara yayın, admin botu
// ekleyip growth_community_permissions'ta APPROVED olmadıkça pipeline'da
// zaten engellenir.

const API = 'https://api.telegram.org';

function isConfigured(): boolean {
  return Boolean(config.telegram.botToken && config.telegram.ownedChannels.length > 0);
}

function channelUrl(target: string, messageId: number): string | undefined {
  // @kanaladi hedefleri için public link üretilebilir; sayısal chat id için üretilemez.
  if (target.startsWith('@')) return `https://t.me/${target.slice(1)}/${messageId}`;
  return undefined;
}

export const telegramProvider: SocialProvider = {
  platform: 'telegram',

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!isConfigured()) {
      return { ok: false, failure: 'not_configured', detail: 'TELEGRAM_BOT_TOKEN / TELEGRAM_OWNED_CHANNELS eksik' };
    }
    const check = this.validateContent(input);
    if (!check.valid) return { ok: false, failure: 'invalid', detail: check.problems.join('; ') };

    const target = input.target ?? config.telegram.ownedChannels[0]!;
    // Güvenlik: hedef, yapılandırılmış owned kanal listesinde olmalı.
    if (!config.telegram.ownedChannels.includes(target)) {
      return { ok: false, failure: 'invalid', detail: `hedef owned kanal listesinde değil: ${target}` };
    }

    const method = input.mediaUrl ? 'sendPhoto' : 'sendMessage';
    const payload: Record<string, unknown> = input.mediaUrl
      ? { chat_id: target, photo: input.mediaUrl, caption: input.text }
      : { chat_id: target, text: input.text, disable_web_page_preview: false };

    try {
      const res = await fetch(`${API}/bot${config.telegram.botToken}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean; result?: { message_id?: number }; description?: string; parameters?: { retry_after?: number };
      };
      if (res.status === 429) {
        const retryAfterMs = (body.parameters?.retry_after ?? 60) * 1000;
        return { ok: false, failure: 'rate_limited', retryAfterMs };
      }
      if (!res.ok || !body.ok || !body.result?.message_id) {
        log.warn('telegram_publish_failed', { status: res.status, detail: body.description });
        const failure = res.status === 401 || res.status === 403 ? 'invalid' : 'error';
        return { ok: false, failure, detail: body.description ?? `HTTP ${res.status}` };
      }
      return {
        ok: true,
        externalId: `${target}:${body.result.message_id}`,
        externalUrl: channelUrl(target, body.result.message_id),
      };
    } catch (err) {
      return { ok: false, failure: 'error', detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async schedule(): Promise<PublishResult | null> {
    return null; // Bot API'de native zamanlama yok — merkezi kuyruk.
  },

  validateContent(input: PublishInput): ValidationResult {
    const problems: string[] = [];
    if (!input.text.trim()) problems.push('metin boş');
    const max = input.mediaUrl ? 1024 : 4096; // caption vs mesaj sınırı
    if (input.text.length > max) problems.push(`${max} karakter sınırı aşıldı`);
    return { valid: problems.length === 0, problems };
  },

  async getMetrics(): Promise<PostMetrics | null> {
    // Bot API kanal mesajı görüntülenme sayısı vermez (MTProto ister).
    // Uydurma metrik döndürmek yerine dürüstçe null — link tıklamaları zaten
    // tracking link üzerinden birebir ölçülür.
    return null;
  },

  getLimits(): ProviderLimits {
    return { maxPostsPerDay: 10, maxPostsPerHour: 3, minIntervalMinutes: 30 };
  },

  async refreshAuthentication(): Promise<AuthStatus> {
    if (!config.telegram.botToken) return { configured: false, detail: 'TELEGRAM_BOT_TOKEN eksik' };
    try {
      const res = await fetch(`${API}/bot${config.telegram.botToken}/getMe`);
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      return body.ok
        ? { configured: true, detail: 'ok' }
        : { configured: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { configured: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  getPublishingCapabilities(): PublishingCapabilities {
    return {
      canPublish: isConfigured(),
      contentTypes: ['post', 'image'],
      requiresMediaUrl: false,
      maxTextLength: 4096,
    };
  },
};
