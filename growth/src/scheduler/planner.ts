import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { log } from '../logger.ts';
import { contentSignature } from '../core/signature.ts';
import type { GeneratedContent, Pillar, Platform } from '../core/types.ts';
import { generateContent } from '../content/generator.ts';
import { checkFatigue } from '../content/fatigue.ts';
import { pickPairChallenge, pickCareerPath, pairChallengeFor } from '../content/pairs.ts';
import { DERBIES, pickWeighted, defaultRandom, type RandomSource } from '../content/teams.ts';
import { loadWeights } from '../analytics/weights.ts';
import { pickSlot, nextOccurrence } from './slots.ts';

// Günlük içerik planlayıcı: her platform için hedef sayıda aday üretir.
// Adaylar REQUIRES_APPROVAL durumunda kuyruğa düşer — dashboard onaylamadan
// hiçbir şey yayınlanmaz (autoPublishOwned açık olsa bile üretim → onay →
// zamanlama zinciri audit'lenir).

// Harici doğrulanmış bağlam (transfer haberi, maç günü) olmadan üretilemeyen
// pillar'lar plansız üretimden dışlanır (bölüm 15: SourceVerified şartı).
const PLANNABLE_PILLARS: readonly Pillar[] = [
  'challenge', 'guess_path', 'impossible', 'derby',
  'nostalgia', 'turkish_football', 'european_football', 'competitive',
];

type PlannablePlatform = Extract<Platform, 'x' | 'instagram' | 'telegram'>;

async function buildOne(
  platform: PlannablePlatform,
  rnd: RandomSource,
): Promise<GeneratedContent | null> {
  const weights = await loadWeights(platform);
  const pillar = pickWeighted([...PLANNABLE_PILLARS], weights.pillar, rnd);

  if (pillar === 'guess_path') {
    const careerPath = await pickCareerPath(3, rnd);
    if (!careerPath) return null;
    return generateContent({ platform, pillar, careerPath, weights, rnd });
  }

  if (pillar === 'derby') {
    const derby = DERBIES[Math.floor(rnd.next() * DERBIES.length)]!;
    const challenge = await pairChallengeFor(derby[0], derby[1]);
    if (!challenge) return null;
    return generateContent({ platform, pillar, challenge, weights, rnd });
  }

  const challenge = await pickPairChallenge({
    wantHard: pillar === 'impossible',
    preferTurkish: pillar === 'turkish_football',
    rnd,
  });
  if (!challenge) return null;
  return generateContent({ platform, pillar, challenge, weights, rnd });
}

export async function insertContentItem(c: GeneratedContent, suggestedTime: Date | null): Promise<string | null> {
  const signature = contentSignature({
    platform: c.platform,
    teams: c.teams,
    player: c.players[0] ?? '',
    hookType: c.hookType,
    ctaId: c.ctaId,
    templateId: c.templateId,
  });

  const verdict = await checkFatigue(c.platform, signature, `${c.hook} ${c.body}`);
  if (!verdict.fresh) {
    log.info('content_skipped_fatigue', { platform: c.platform, reason: verdict.reason, teams: c.teams });
    return null;
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO growth_content_items
       (platform, content_type, pillar, hook, hook_type, body, cta, cta_id, hashtags,
        media_brief, target_audience, teams, players, football_context, posting_reason,
        suggested_time, risk_score, predicted_engagement, hook_quality_score, language,
        template_id, content_signature, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'REQUIRES_APPROVAL')
     RETURNING id`,
    [
      c.platform, c.contentType, c.pillar, c.hook, c.hookType, c.body, c.cta, c.ctaId,
      c.hashtags, c.mediaBrief ? JSON.stringify(c.mediaBrief) : null, c.targetAudience,
      c.teams, c.players, c.footballContext, c.postingReason, suggestedTime,
      c.riskScore, c.predictedEngagement, c.hookQualityScore, c.language,
      c.templateId, signature,
    ],
  );
  return rows[0]?.id ?? null;
}

/** Bugün için üretilmiş aday sayısı (mükerrer plan koşusuna karşı). */
async function producedToday(platform: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) AS count FROM growth_content_items
      WHERE platform = $1 AND created_at > date_trunc('day', now())`,
    [platform],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function planDaily(rnd: RandomSource = defaultRandom): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const targets: [PlannablePlatform, number][] = [
    ['x', config.dailyPlanTargets.x],
    ['instagram', config.dailyPlanTargets.instagram],
    ['telegram', config.dailyPlanTargets.telegram],
  ];

  for (const [platform, target] of targets) {
    const existing = await producedToday(platform);
    const need = Math.max(0, target - existing);
    for (let i = 0; i < need; i += 1) {
      try {
        const content = await buildOne(platform, rnd);
        if (!content) { skipped += 1; continue; }
        const weights = await loadWeights(platform);
        const slot = pickSlot(weights.slot, rnd);
        const when = nextOccurrence(slot, new Date(), 7, rnd);
        const id = await insertContentItem(content, when);
        if (id) created += 1; else skipped += 1;
      } catch (err) {
        skipped += 1;
        log.error('plan_item_failed', { platform, message: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  log.info('daily_plan_done', { created, skipped });
  return { created, skipped };
}
