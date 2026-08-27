import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { log } from '../logger.ts';
import { audit } from '../core/audit.ts';
import type { Platform, PublishInput } from '../core/types.ts';
import { buildUtmUrl, newTrackingCode, trackingUrl, utmContentSlug } from '../core/utm.ts';
import { getProvider } from '../providers/registry.ts';
import { createManualTask } from '../providers/manual.ts';
import { checkPermission } from './permissions.ts';
import { checkRateLimit, recordRateLimitHit, resetBackoff, backoffDelayMs } from './rateLimiter.ts';

// Yayın hattı (bölüm 28):
//   Content → PlatformPolicy → Permission → DuplicateDetection → RateLimiter → Publisher
// Bu zincirden geçmeyen HİÇBİR şey yayınlanamaz. Her adımın reddi scheduled
// post durumuna ve audit log'a yazılır.

const MAX_ATTEMPTS = 5;

export interface ScheduledPostRow {
  id: string;
  content_item_id: string;
  platform: Platform;
  account_id: string | null;
  community_id: string | null;
  scheduled_at: Date;
  attempt: number;
  idempotency_key: string;
  tracking_code: string | null;
}

interface ContentRow {
  id: string;
  platform: Platform;
  body: string;
  cta_id: string;
  teams: string[];
  players: string[];
  pillar: string;
  status: string;
  reviewed_by: string | null;
  media_brief: unknown;
  campaign_utm: string | null;
}

async function loadContent(contentItemId: string): Promise<ContentRow | null> {
  const { rows } = await pool.query<ContentRow>(
    `SELECT ci.id, ci.platform, ci.body, ci.cta_id, ci.teams, ci.players, ci.pillar,
            ci.status, ci.reviewed_by, ci.media_brief, ca.utm_campaign AS campaign_utm
       FROM growth_content_items ci
       LEFT JOIN growth_campaigns ca ON ca.id = ci.campaign_id
      WHERE ci.id = $1`,
    [contentItemId],
  );
  return rows[0] ?? null;
}

async function setStatus(postId: string, status: string, lastError?: string, nextRetryAt?: Date): Promise<void> {
  await pool.query(
    `UPDATE growth_scheduled_posts
        SET status = $2, last_error = $3, next_retry_at = $4
      WHERE id = $1`,
    [postId, status, lastError ?? null, nextRetryAt ?? null],
  );
}

/** UTM'li tracking link üretir ve DB'ye bağlar (atıf — bölüm 20). */
async function ensureTrackingLink(post: ScheduledPostRow, content: ContentRow): Promise<string> {
  if (post.tracking_code) return post.tracking_code;
  const code = newTrackingCode();
  const utmContent = utmContentSlug(content.teams, content.players[0] ?? '', content.pillar);
  const target = buildUtmUrl(config.websiteUrl, {
    source: post.platform,
    medium: post.community_id ? 'community' : 'organic',
    campaign: content.campaign_utm ?? 'football_challenge',
    content: utmContent,
  });
  await pool.query(
    `INSERT INTO growth_tracking_links (code, target_url, utm_source, utm_medium, utm_campaign, utm_content, scheduled_post_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [code, target, post.platform, post.community_id ? 'community' : 'organic',
     content.campaign_utm ?? 'football_challenge', utmContent, post.id],
  );
  await pool.query(`UPDATE growth_scheduled_posts SET tracking_code = $2 WHERE id = $1`, [post.id, code]);
  return code;
}

function renderFinalText(post: ScheduledPostRow, content: ContentRow, code: string): string {
  // Link yalnızca CTA taşıyan içeriğe eklenir — value/conversation içerikleri
  // link'siz kalır ki feed'de reklam gibi durmasın (bölüm 5/14).
  const linkAllowed = post.platform === 'x' || post.platform === 'telegram';
  if (!linkAllowed || content.cta_id === 'none') return content.body;
  return `${content.body}\n${trackingUrl(config.trackingBaseUrl, code)}`;
}

export async function publishScheduledPost(post: ScheduledPostRow): Promise<void> {
  const content = await loadContent(post.content_item_id);
  if (!content) {
    await setStatus(post.id, 'FAILED', 'içerik kaydı bulunamadı');
    return;
  }

  // 1) İçerik onay kontrolü.
  if (content.status !== 'APPROVED') {
    await setStatus(post.id, 'REQUIRES_APPROVAL', `içerik durumu: ${content.status}`);
    return;
  }

  const provider = getProvider(post.platform);

  // 2) PlatformPolicy: yayın yeteneği + içerik doğrulama.
  const caps = provider.getPublishingCapabilities();
  const code = await ensureTrackingLink(post, content);
  const mediaBrief = content.media_brief as { mediaUrl?: string } | null;
  const input: PublishInput = {
    text: renderFinalText(post, content, code),
    mediaUrl: typeof mediaBrief?.mediaUrl === 'string' ? mediaBrief.mediaUrl : undefined,
    idempotencyKey: post.idempotency_key,
    target: undefined,
  };

  if (!caps.canPublish) {
    // Programatik yayın yok → insan görevi (spec: publish yerine createManualTask).
    const taskId = await createManualTask(post.platform, {
      title: `${post.platform} paylaşımı (elle)`,
      instructions: 'Bu platformda otomatik yayın yok/yapılandırılmamış. İçeriği gözden geçirip elle paylaş.',
      payload: { text: input.text, mediaUrl: input.mediaUrl ?? null, trackingCode: code },
    }, post.id);
    await setStatus(post.id, 'MANUAL', `manuel görev: ${taskId}`);
    await audit('system', 'manual_task_created', 'scheduled_post', post.id, { platform: post.platform, taskId });
    return;
  }

  const validation = provider.validateContent(input);
  if (!validation.valid) {
    await setStatus(post.id, 'FAILED', `içerik doğrulama: ${validation.problems.join('; ')}`);
    await audit('system', 'publish_rejected_validation', 'scheduled_post', post.id, { problems: validation.problems });
    return;
  }

  // 3) Permission.
  const permission = await checkPermission({
    platform: post.platform,
    accountId: post.account_id,
    communityId: post.community_id,
    contentReviewedBy: content.reviewed_by,
  });
  if (!permission.allowed) {
    await setStatus(post.id, 'FAILED', `izin reddi: ${permission.reason}`);
    await audit('system', 'publish_rejected_permission', 'scheduled_post', post.id, { reason: permission.reason });
    return;
  }

  // 4) DuplicateDetection / idempotency: bu post zaten yayınlanmışsa (önceki
  // deneme timeout görünüp aslında başarılı olduysa) İKİNCİ kez yayınlama.
  const dup = await pool.query(
    `SELECT 1 FROM growth_published_posts WHERE scheduled_post_id = $1 LIMIT 1`,
    [post.id],
  );
  if (dup.rowCount) {
    await setStatus(post.id, 'PUBLISHED');
    return;
  }

  // 5) RateLimiter.
  const rate = await checkRateLimit(post.platform);
  if (!rate.allowed) {
    const retryAt = rate.retryAt ?? new Date(Date.now() + backoffDelayMs(post.attempt));
    await setStatus(post.id, 'RETRY_SCHEDULED', `rate limit: ${rate.reason}`, retryAt);
    return;
  }

  // 6) Publisher.
  const result = await provider.publish(input);

  if (result.ok) {
    await pool.query(
      `INSERT INTO growth_published_posts (scheduled_post_id, content_item_id, platform, external_id, external_url, tracking_code)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (scheduled_post_id) DO NOTHING`,
      [post.id, content.id, post.platform, result.externalId ?? null, result.externalUrl ?? null, code],
    );
    await setStatus(post.id, 'PUBLISHED');
    await resetBackoff(post.platform);
    await audit('system', 'published', 'scheduled_post', post.id, {
      platform: post.platform, externalId: result.externalId, externalUrl: result.externalUrl,
    });
    log.info('post_published', { platform: post.platform, postId: post.id, externalId: result.externalId });
    return;
  }

  switch (result.failure) {
    case 'rate_limited': {
      const until = await recordRateLimitHit(post.platform, result.retryAfterMs);
      await setStatus(post.id, 'RETRY_SCHEDULED', 'platform 429', until);
      log.warn('post_rate_limited', { platform: post.platform, postId: post.id, retryAt: until.toISOString() });
      return;
    }
    case 'not_configured': {
      const taskId = await createManualTask(post.platform, {
        title: `${post.platform} paylaşımı (API yapılandırılmamış)`,
        instructions: 'Platform kimlik bilgileri eksik. İçeriği elle paylaş veya env\'i tamamla.',
        payload: { text: input.text, mediaUrl: input.mediaUrl ?? null, trackingCode: code },
      }, post.id);
      await setStatus(post.id, 'MANUAL', `manuel görev: ${taskId} (${result.detail ?? 'not_configured'})`);
      return;
    }
    case 'invalid': {
      await setStatus(post.id, 'FAILED', result.detail ?? 'içerik/kimlik geçersiz');
      await audit('system', 'publish_failed_invalid', 'scheduled_post', post.id, { detail: result.detail });
      return;
    }
    default: {
      const attempt = post.attempt + 1;
      if (attempt >= MAX_ATTEMPTS) {
        await pool.query(
          `UPDATE growth_scheduled_posts SET status='FAILED', attempt=$2, last_error=$3 WHERE id=$1`,
          [post.id, attempt, `deneme tavanı (${MAX_ATTEMPTS}): ${result.detail ?? 'hata'}`],
        );
        await audit('system', 'publish_failed_final', 'scheduled_post', post.id, { detail: result.detail, attempt });
        return;
      }
      const retryAt = new Date(Date.now() + backoffDelayMs(attempt));
      await pool.query(
        `UPDATE growth_scheduled_posts SET status='RETRY_SCHEDULED', attempt=$2, last_error=$3, next_retry_at=$4 WHERE id=$1`,
        [post.id, attempt, result.detail ?? 'geçici hata', retryAt],
      );
      log.warn('post_retry_scheduled', { platform: post.platform, postId: post.id, attempt, retryAt: retryAt.toISOString() });
    }
  }
}
