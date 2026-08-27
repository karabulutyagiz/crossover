import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';
import type { Platform } from '../core/types.ts';
import { getProvider } from '../providers/registry.ts';

// Analytics worker (bölüm 21): son 7 günün yayınları için provider
// metriklerini periyodik çeker. Metrik alınamayan platformlarda (ör. Telegram
// Bot API görüntülenme vermez) satır YAZILMAZ — dashboard'da boş görünür,
// uydurulmaz. Link tıklamaları zaten /r/ redirect'inden birebir loglanır.

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 saat
const BATCH = 50;

export async function collectMetricsOnce(): Promise<number> {
  const { rows } = await pool.query<{ id: string; platform: Platform; external_id: string }>(
    `SELECT id, platform, external_id
       FROM growth_published_posts
      WHERE external_id IS NOT NULL
        AND published_at > now() - interval '7 days'
      ORDER BY published_at DESC
      LIMIT $1`,
    [BATCH],
  );
  let captured = 0;
  for (const row of rows) {
    try {
      const metrics = await getProvider(row.platform).getMetrics(row.external_id);
      if (!metrics) continue;
      await pool.query(
        `INSERT INTO growth_platform_metrics
           (published_post_id, impressions, views, likes, comments, shares, saves, profile_visits, link_clicks, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [row.id, metrics.impressions ?? null, metrics.views ?? null, metrics.likes ?? null,
         metrics.comments ?? null, metrics.shares ?? null, metrics.saves ?? null,
         metrics.profileVisits ?? null, metrics.linkClicks ?? null, JSON.stringify(metrics.raw)],
      );
      captured += 1;
    } catch (err) {
      log.warn('metrics_capture_failed', { postId: row.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  if (captured > 0) log.info('metrics_captured', { captured });
  return captured;
}

export function startMetricsWorker(): () => void {
  const timer = setInterval(() => {
    collectMetricsOnce().catch((err) =>
      log.error('metrics_worker_failed', { message: err instanceof Error ? err.message : String(err) }));
  }, INTERVAL_MS);
  // Açılışta bir kez hemen dene (yeniden başlatmalarda boşluk kalmasın).
  setTimeout(() => { void collectMetricsOnce().catch(() => {}); }, 30 * 1000);
  return () => clearInterval(timer);
}
