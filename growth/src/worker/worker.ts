import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';
import { publishScheduledPost } from '../policy/pipeline.ts';
import { backoffDelayMs } from '../policy/rateLimiter.ts';
import { ensureLimitsRow } from '../policy/rateLimiter.ts';
import { allProviders } from '../providers/registry.ts';
import { claimDuePosts, recoverStuckPosts } from './queue.ts';
import { processCommentQueue } from '../comments/service.ts';

// Yayın worker'ı. Tek tık kuralı: bir tick'te bir hata bütün döngüyü öldürmez;
// her post kendi try/catch'inde işlenir (bölüm 29 — provider çökerse sistem çökmez).

const TICK_MS = 30 * 1000;
const BATCH = 5;

async function processTick(): Promise<void> {
  const recovered = await recoverStuckPosts();
  if (recovered > 0) log.warn('stuck_posts_recovered', { count: recovered });

  // Onaylı X yanıtları (comment marketing) — kendi bütçesiyle, tick başına 1.
  await processCommentQueue().catch((err) =>
    log.error('comment_queue_failed', { message: err instanceof Error ? err.message : String(err) }));

  const due = await claimDuePosts(BATCH);
  for (const post of due) {
    try {
      await publishScheduledPost(post);
    } catch (err) {
      // Beklenmedik hata: post'u kaybetme, backoff ile yeniden dene.
      const attempt = post.attempt + 1;
      const retryAt = new Date(Date.now() + backoffDelayMs(attempt));
      await pool.query(
        `UPDATE growth_scheduled_posts
            SET status = CASE WHEN $2 >= 5 THEN 'FAILED' ELSE 'RETRY_SCHEDULED' END,
                attempt = $2, last_error = $3, next_retry_at = $4
          WHERE id = $1`,
        [post.id, attempt, err instanceof Error ? err.message : String(err), retryAt],
      ).catch(() => { /* DB de düştüyse bir sonraki tick recovery toparlar */ });
      log.error('publish_pipeline_crashed', {
        postId: post.id, attempt,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function startWorker(): () => void {
  // Limit satırlarını provider varsayılanlarıyla tohumla.
  void (async () => {
    for (const p of allProviders()) {
      await ensureLimitsRow(p.platform, p.getLimits()).catch((err) =>
        log.error('ensure_limits_failed', { platform: p.platform, message: String(err) }));
    }
  })();

  let running = false;
  const timer = setInterval(() => {
    if (running) return; // üst üste binen tick yok
    running = true;
    processTick()
      .catch((err) => log.error('worker_tick_failed', { message: err instanceof Error ? err.message : String(err) }))
      .finally(() => { running = false; });
  }, TICK_MS);
  log.info('worker_started', { tickMs: TICK_MS });
  return () => clearInterval(timer);
}
