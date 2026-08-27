import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { log } from '../logger.ts';
import { contentScore } from '../core/score.ts';
import { EXPERIMENTAL_SLOTS } from '../scheduler/slots.ts';
import { saveWeights, type PlatformWeights } from './weights.ts';

// AI Learning Loop (bölüm 24). Her gün: hangi pillar/hook/CTA/slot install'a
// yaklaşan sinyal üretiyor → ağırlıklar güncellenir. Exploitation-only YOK:
// final ağırlık = exploitRatio * öğrenilen + (1-exploitRatio) * uniform, ve
// pickWeighted her seçeneğe 0.05 taban olasılık bırakır (multi-armed bandit
// yumuşatması). Veri azken (post < 5) ağırlıklar uniform kalır — gürültüden
// öğrenilmez.

const PLATFORMS = ['x', 'instagram', 'telegram'] as const;
const MIN_POSTS_TO_LEARN = 5;

interface PerfRow {
  pillar: string;
  hook_type: string;
  cta_id: string;
  published_at: Date;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number;
  store_visits: number;
  installs: number;
  first_matches: number;
}

function nearestSlot(publishedAt: Date): string {
  const istHour = (publishedAt.getUTCHours() + 3) % 24;
  const minutes = istHour * 60 + publishedAt.getUTCMinutes();
  let best: string = EXPERIMENTAL_SLOTS[0];
  let bestDist = Infinity;
  for (const slot of EXPERIMENTAL_SLOTS) {
    const [h, m] = slot.split(':').map(Number);
    const slotMin = (h ?? 0) * 60 + (m ?? 0);
    const dist = Math.min(Math.abs(minutes - slotMin), 1440 - Math.abs(minutes - slotMin));
    if (dist < bestDist) { bestDist = dist; best = slot; }
  }
  return best;
}

function scoreRow(r: PerfRow): number {
  if (r.impressions != null && r.impressions > 0) {
    return contentScore({
      impressions: r.impressions,
      linkClicks: r.clicks,
      storeVisits: r.store_visits,
      installs: r.installs,
      shares: r.shares ?? 0,
      comments: r.comments ?? 0,
      activatedPlayers: r.first_matches,
    });
  }
  // Metriği olmayan platformlarda (ör. Telegram) tek gerçek sinyal tıklama +
  // store ziyareti — küçük ölçekte normalize edilir.
  return Math.min(1, (r.clicks + r.store_visits * 2 + r.installs * 5) / 25);
}

function dimensionWeights(
  rows: { key: string; score: number }[],
  exploitRatio: number,
): Record<string, number> {
  const byKey = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.key) continue;
    const arr = byKey.get(r.key) ?? [];
    arr.push(r.score);
    byKey.set(r.key, arr);
  }
  const all = rows.map((r) => r.score);
  const globalMean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  const out: Record<string, number> = {};
  for (const [key, scores] of byKey) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const learned = globalMean > 0 ? Math.max(0.25, Math.min(4, mean / globalMean)) : 1;
    out[key] = Math.round((exploitRatio * learned + (1 - exploitRatio) * 1) * 100) / 100;
  }
  return out;
}

export async function runLearningOnce(): Promise<void> {
  for (const platform of PLATFORMS) {
    const { rows } = await pool.query<PerfRow>(
      `SELECT ci.pillar, ci.hook_type, ci.cta_id, pp.published_at,
              m.impressions, m.likes, m.comments, m.shares,
              COALESCE(cl.clicks, 0)::int AS clicks,
              COALESCE(att.store_visits, 0)::int AS store_visits,
              COALESCE(att.installs, 0)::int AS installs,
              COALESCE(att.first_matches, 0)::int AS first_matches
         FROM growth_published_posts pp
         JOIN growth_content_items ci ON ci.id = pp.content_item_id
         LEFT JOIN LATERAL (
           SELECT impressions, likes, comments, shares
             FROM growth_platform_metrics
            WHERE published_post_id = pp.id
            ORDER BY captured_at DESC LIMIT 1
         ) m ON TRUE
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS clicks FROM growth_link_clicks WHERE code = pp.tracking_code
         ) cl ON TRUE
         LEFT JOIN LATERAL (
           SELECT sum(store_visits)::int AS store_visits, sum(installs)::int AS installs,
                  sum(first_matches)::int AS first_matches
             FROM growth_conversion_attribution WHERE tracking_code = pp.tracking_code
         ) att ON TRUE
        WHERE pp.platform = $1
          AND pp.published_at > now() - interval '45 days'`,
      [platform],
    );

    if (rows.length < MIN_POSTS_TO_LEARN) {
      log.info('learning_skipped_insufficient_data', { platform, posts: rows.length });
      continue;
    }

    const scored = rows.map((r) => ({ row: r, score: scoreRow(r) }));
    const weights: PlatformWeights = {
      pillar: dimensionWeights(scored.map((s) => ({ key: s.row.pillar, score: s.score })), config.exploitRatio),
      hook_type: dimensionWeights(scored.map((s) => ({ key: s.row.hook_type, score: s.score })), config.exploitRatio),
      cta: dimensionWeights(scored.map((s) => ({ key: s.row.cta_id, score: s.score })), config.exploitRatio),
      slot: dimensionWeights(scored.map((s) => ({ key: nearestSlot(s.row.published_at), score: s.score })), config.exploitRatio),
    };
    await saveWeights(platform, weights);
    log.info('learning_updated', { platform, posts: rows.length });
  }
}

export function startLearningJob(): () => void {
  const CHECK_MS = 6 * 60 * 60 * 1000;
  const run = async (): Promise<void> => {
    // Günde bir kez yeter: son güncelleme 20 saatten yeniyse dokunma.
    const { rows } = await pool.query<{ fresh: boolean }>(
      `SELECT bool_or(updated_at > now() - interval '20 hours') AS fresh FROM growth_learning_state`,
    );
    if (rows[0]?.fresh) return;
    await runLearningOnce();
  };
  const timer = setInterval(() => {
    run().catch((err) => log.error('learning_job_failed', { message: err instanceof Error ? err.message : String(err) }));
  }, CHECK_MS);
  setTimeout(() => { void run().catch(() => {}); }, 60 * 1000);
  return () => clearInterval(timer);
}
