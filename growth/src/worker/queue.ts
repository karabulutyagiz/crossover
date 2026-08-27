import { pool } from '../db/pool.ts';
import type { ScheduledPostRow } from '../policy/pipeline.ts';

// PG-tabanlı kuyruk (bölüm 29). Repoda Redis yok ve tek worker süreci yeterli;
// FOR UPDATE SKIP LOCKED ile claim, crash'te kaldığı yerden devam. Redis'e
// geçilecek olursa yalnız bu dosya değişir.

export async function claimDuePosts(limit: number): Promise<ScheduledPostRow[]> {
  const { rows } = await pool.query<ScheduledPostRow>(
    `UPDATE growth_scheduled_posts
        SET status = 'PROCESSING'
      WHERE id IN (
        SELECT id FROM growth_scheduled_posts
         WHERE (status = 'PENDING' AND scheduled_at <= now())
            OR (status = 'RETRY_SCHEDULED' AND next_retry_at IS NOT NULL AND next_retry_at <= now())
         ORDER BY scheduled_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
      )
      RETURNING id, content_item_id, platform, account_id, community_id,
                scheduled_at, attempt, idempotency_key, tracking_code`,
    [limit],
  );
  return rows;
}

/**
 * Crash kurtarma: PROCESSING'de 15 dakikadan uzun takılı kalan post'lar
 * (worker yayın ortasında öldüyse) yeniden denemeye alınır. Idempotency
 * kontrolü (published_posts) çift yayını zaten engeller.
 */
export async function recoverStuckPosts(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE growth_scheduled_posts
        SET status = 'RETRY_SCHEDULED', next_retry_at = now()
      WHERE status = 'PROCESSING'
        AND scheduled_at < now() - interval '15 minutes'
        AND id NOT IN (SELECT scheduled_post_id FROM growth_published_posts)`,
  );
  return rowCount ?? 0;
}
