import { pool } from '../db/pool.ts';
import type { Platform, PostMetrics, ProviderLimits, PublishInput, PublishResult, PublishingCapabilities } from '../core/types.ts';
import type { AuthStatus, ManualTaskInput, SocialProvider, ValidationResult } from './types.ts';

// Programatik yayın desteklenmeyen / Phase 1'de bağlanmayan platformlar
// (Reddit, Discord, Facebook, YouTube, TikTok, Threads, Ekşi) için provider:
// publish() ASLA platforma dokunmaz — dashboard'da görünen bir insan görevi
// (manual task) oluşturur. Ekşi Sözlük özellikle böyle çalışır (bölüm 7):
// entry taslağı üretilir, "Potential Ekşi opportunity" olarak gösterilir,
// gönderme kararı ve eylemi tamamen insana aittir.

export async function createManualTask(
  platform: Platform,
  task: ManualTaskInput,
  scheduledPostId?: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO growth_manual_tasks (scheduled_post_id, platform, title, instructions, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
    [scheduledPostId ?? null, platform, task.title, task.instructions, JSON.stringify(task.payload)],
  );
  return rows[0]!.id;
}

export function makeManualProvider(platform: Platform, note: string): SocialProvider {
  return {
    platform,

    async publish(input: PublishInput): Promise<PublishResult> {
      // Otomatik yayın YOK: içerik insan görevi olarak kuyruğa düşer.
      const taskId = await createManualTask(platform, {
        title: `${platform} için elle paylaşım`,
        instructions: `${note}\n\nMetni gözden geçir, platform kurallarına uygunsa elle paylaş.`,
        payload: { text: input.text, mediaUrl: input.mediaUrl ?? null, link: input.link ?? null },
      });
      return { ok: false, failure: 'not_configured', detail: `manuel görev oluşturuldu: ${taskId}` };
    },

    async schedule(): Promise<PublishResult | null> {
      return null;
    },

    validateContent(input: PublishInput): ValidationResult {
      return { valid: input.text.trim().length > 0, problems: input.text.trim() ? [] : ['metin boş'] };
    },

    async getMetrics(): Promise<PostMetrics | null> {
      return null; // elle girilen metrikler dashboard'dan gelir
    },

    getLimits(): ProviderLimits {
      return { maxPostsPerDay: 2, maxPostsPerHour: 1, minIntervalMinutes: 240 };
    },

    async refreshAuthentication(): Promise<AuthStatus> {
      return { configured: false, detail: 'manuel kanal — API entegrasyonu yok' };
    },

    getPublishingCapabilities(): PublishingCapabilities {
      return { canPublish: false, contentTypes: ['manual'], requiresMediaUrl: false, maxTextLength: 10000 };
    },
  };
}
