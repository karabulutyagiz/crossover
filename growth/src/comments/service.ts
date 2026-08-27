import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';
import { audit } from '../core/audit.ts';
import { isDuplicateText } from '../core/signature.ts';
import { config } from '../config.ts';
import { generateCommentDrafts, parseTweetId, detectPlatform, type CommentContext } from '../content/comments.ts';
import { pairChallengeFor } from '../content/pairs.ts';
import { defaultRandom, type RandomSource } from '../content/teams.ts';
import { xProvider, searchRecentTweets } from '../providers/x.ts';
import { createManualTask } from '../providers/manual.ts';
import { ensureLimitsRow, recordRateLimitHit, resetBackoff } from '../policy/rateLimiter.ts';

// Comment marketing servisi. Akış:
//   fırsat (URL + bağlam) → taslaklar → İNSAN ONAYI → X: otomatik yanıt
//   (bütçeli) / IG-TikTok-YouTube: kopyala-yapıştır görevi.
// Spam frenleri: hedef başına TEK yanıt (partial unique index), günlük yanıt
// tavanı (varsayılan 6/gün, min 30 dk ara), marka dozu üreticide, 30 günlük
// pencerede birebir/yakın kopya yorum metni reddedilir, link eklenmez.

const REPLY_BUDGET_KEY = 'x_reply';
const REPLY_LIMITS = { maxPostsPerDay: 6, maxPostsPerHour: 2, minIntervalMinutes: 30 };

type CommentPlatform = 'x' | 'instagram' | 'tiktok' | 'youtube';

export interface OpportunityInput {
  url: string;
  teams?: [string, string];
  topic?: string;
  note?: string;
  source?: 'manual' | 'search';
  engagement?: Record<string, unknown>;
}

async function recentCommentTexts(): Promise<string[]> {
  const { rows } = await pool.query<{ text: string }>(
    `SELECT text FROM growth_comment_drafts
      WHERE created_at > now() - interval '30 days' AND status <> 'REJECTED'
      ORDER BY created_at DESC LIMIT 400`,
  );
  return rows.map((r) => r.text);
}

async function buildContext(input: OpportunityInput): Promise<CommentContext> {
  const ctx: CommentContext = { topic: input.topic };
  if (input.teams && input.teams[0] && input.teams[1]) {
    ctx.teams = input.teams;
    // Cevap DB'den doğrulanır — uydurma "flex" yorumu asla üretilmez.
    const challenge = await pairChallengeFor(input.teams[0], input.teams[1]).catch(() => null);
    if (challenge) {
      ctx.teams = [challenge.clubA.name, challenge.clubB.name];
      ctx.commonPlayer = challenge.commonPlayers[0]?.name;
    }
  }
  return ctx;
}

async function insertDrafts(
  opportunityId: string,
  platform: CommentPlatform,
  ctx: CommentContext,
  rnd: RandomSource,
): Promise<number> {
  const history = await recentCommentTexts();
  const drafts = generateCommentDrafts(platform, ctx, rnd)
    .filter((d) => !isDuplicateText(d.text, history, config.similarityThreshold));
  for (const d of drafts) {
    await pool.query(
      `INSERT INTO growth_comment_drafts (opportunity_id, text, variant_key, mentions_brand)
       VALUES ($1,$2,$3,$4)`,
      [opportunityId, d.text, d.variantKey, d.mentionsBrand],
    );
  }
  return drafts.length;
}

export async function createOpportunity(
  input: OpportunityInput,
  actor: string,
  rnd: RandomSource = defaultRandom,
): Promise<{ id: string; created: boolean; drafts: number } | { error: string }> {
  const platform = detectPlatform(input.url);
  if (!platform) return { error: 'URL tanınmadı (x/instagram/tiktok/youtube bekleniyor)' };
  const externalId = platform === 'x' ? parseTweetId(input.url) : null;
  if (platform === 'x' && !externalId) return { error: 'tweet URL\'inden id çıkarılamadı' };

  const { rows } = await pool.query<{ id: string; inserted: boolean }>(
    `INSERT INTO growth_comment_opportunities (platform, target_url, external_id, context, source, engagement)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb)
     ON CONFLICT (platform, target_url)
     DO UPDATE SET context = growth_comment_opportunities.context
     RETURNING id, (xmax = 0) AS inserted`,
    [platform, input.url.trim(), externalId,
     JSON.stringify({ teams: input.teams ?? null, topic: input.topic ?? null, note: input.note ?? null }),
     input.source ?? 'manual', JSON.stringify(input.engagement ?? {})],
  );
  const row = rows[0]!;
  if (!row.inserted) {
    return { id: row.id, created: false, drafts: 0 }; // aynı hedefe ikinci fırsat açılmaz
  }
  const ctx = await buildContext(input);
  const draftCount = await insertDrafts(row.id, platform, ctx, rnd);
  await audit(actor, 'comment_opportunity_created', 'comment_opportunity', row.id, { url: input.url, platform });
  return { id: row.id, created: true, drafts: draftCount };
}

export async function regenerateDrafts(opportunityId: string, actor: string): Promise<number> {
  const { rows } = await pool.query<{ platform: CommentPlatform; context: { teams?: [string, string] | null; topic?: string | null } }>(
    `SELECT platform, context FROM growth_comment_opportunities WHERE id = $1`,
    [opportunityId],
  );
  const opp = rows[0];
  if (!opp) return 0;
  await pool.query(
    `UPDATE growth_comment_drafts SET status='REJECTED' WHERE opportunity_id=$1 AND status='DRAFT'`,
    [opportunityId],
  );
  const ctx = await buildContext({
    url: '', teams: opp.context.teams ?? undefined, topic: opp.context.topic ?? undefined,
  });
  const n = await insertDrafts(opportunityId, opp.platform, ctx, defaultRandom);
  await audit(actor, 'comment_drafts_regenerated', 'comment_opportunity', opportunityId, { drafts: n });
  return n;
}

export async function approveDraft(draftId: string, actor: string): Promise<{ ok: boolean; mode?: 'auto' | 'manual'; error?: string }> {
  const { rows } = await pool.query<{
    id: string; text: string; status: string; opportunity_id: string;
    platform: CommentPlatform; target_url: string; external_id: string | null;
  }>(
    `SELECT d.id, d.text, d.status, d.opportunity_id, o.platform, o.target_url, o.external_id
       FROM growth_comment_drafts d
       JOIN growth_comment_opportunities o ON o.id = d.opportunity_id
      WHERE d.id = $1`,
    [draftId],
  );
  const d = rows[0];
  if (!d) return { ok: false, error: 'not_found' };
  if (d.status !== 'DRAFT') return { ok: false, error: `taslak durumu: ${d.status}` };

  // Kardeş taslaklar kapanır — hedef başına tek yanıt.
  await pool.query(
    `UPDATE growth_comment_drafts SET status='REJECTED'
      WHERE opportunity_id=$1 AND id<>$2 AND status='DRAFT'`,
    [d.opportunity_id, draftId],
  );

  const autoCapable = d.platform === 'x' && xProvider.getPublishingCapabilities().canPublish;
  if (autoCapable) {
    try {
      await pool.query(
        `UPDATE growth_comment_drafts SET status='APPROVED', approved_by=$2, approved_at=now() WHERE id=$1`,
        [draftId, actor],
      );
    } catch (err) {
      // partial unique index: bu fırsatta zaten onaylı/yayınlı taslak var
      return { ok: false, error: 'bu hedefe zaten onaylı bir yanıt var' };
    }
    await pool.query(`UPDATE growth_comment_opportunities SET status='QUEUED' WHERE id=$1`, [d.opportunity_id]);
    await audit(actor, 'comment_approved_auto', 'comment_draft', draftId);
    return { ok: true, mode: 'auto' };
  }

  // Otomasyon yok/izinsiz → kopyala-yapıştır görevi.
  try {
    await pool.query(
      `UPDATE growth_comment_drafts SET status='MANUAL', approved_by=$2, approved_at=now() WHERE id=$1`,
      [draftId, actor],
    );
  } catch {
    return { ok: false, error: 'bu hedefe zaten onaylı bir yanıt var' };
  }
  await createManualTask(d.platform === 'x' ? 'x' : d.platform, {
    title: `${d.platform} yorumu (elle yapıştır)`,
    instructions: `Hedef: ${d.target_url}\nYorumu kopyala, hedefin altına COF hesabından yapıştır. Platform kurallarına uy; aynı hedefe ikinci yorum atma.`,
    payload: { text: d.text, targetUrl: d.target_url },
  });
  await pool.query(`UPDATE growth_comment_opportunities SET status='DONE' WHERE id=$1`, [d.opportunity_id]);
  await audit(actor, 'comment_approved_manual', 'comment_draft', draftId);
  return { ok: true, mode: 'manual' };
}

// ── X yanıt bütçesi + kuyruk işleyici (worker tick'inden çağrılır) ──────
async function replyBudgetOk(): Promise<{ ok: boolean; reason?: string }> {
  const { rows: limitRows } = await pool.query<{
    max_per_day: number; max_per_hour: number; min_interval_minutes: number; backoff_until: Date | null;
  }>(`SELECT max_per_day, max_per_hour, min_interval_minutes, backoff_until
        FROM growth_provider_rate_limits WHERE platform = $1`, [REPLY_BUDGET_KEY]);
  const limits = limitRows[0];
  if (!limits) return { ok: true };
  if (limits.backoff_until && limits.backoff_until.getTime() > Date.now()) {
    return { ok: false, reason: 'backoff' };
  }
  const { rows } = await pool.query<{ day: string; hour: string; last_at: Date | null }>(
    `SELECT count(*) FILTER (WHERE published_at > now() - interval '24 hours') AS day,
            count(*) FILTER (WHERE published_at > now() - interval '1 hour') AS hour,
            max(published_at) AS last_at
       FROM growth_comment_drafts WHERE status = 'PUBLISHED'`,
  );
  const s = rows[0]!;
  if (Number(s.day) >= limits.max_per_day) return { ok: false, reason: 'günlük yanıt tavanı' };
  if (Number(s.hour) >= limits.max_per_hour) return { ok: false, reason: 'saatlik yanıt tavanı' };
  if (s.last_at && s.last_at.getTime() + limits.min_interval_minutes * 60_000 > Date.now()) {
    return { ok: false, reason: 'min aralık' };
  }
  return { ok: true };
}

export async function processCommentQueue(): Promise<void> {
  await ensureLimitsRow(REPLY_BUDGET_KEY, REPLY_LIMITS);
  const budget = await replyBudgetOk();
  if (!budget.ok) return; // sessizce bekle — bir sonraki tick dener

  // Tek tek işle (yanıtlar seyrek olmalı; toplu atım zaten min-interval'e takılır).
  const { rows } = await pool.query<{
    id: string; text: string; opportunity_id: string; external_id: string; target_url: string;
  }>(
    `SELECT d.id, d.text, d.opportunity_id, o.external_id, o.target_url
       FROM growth_comment_drafts d
       JOIN growth_comment_opportunities o ON o.id = d.opportunity_id
      WHERE d.status = 'APPROVED' AND o.platform = 'x' AND o.external_id IS NOT NULL
      ORDER BY d.approved_at
      FOR UPDATE OF d SKIP LOCKED
      LIMIT 1`,
  );
  const d = rows[0];
  if (!d) return;

  const result = await xProvider.publish({
    text: d.text,
    idempotencyKey: `comment:${d.id}`,
    replyToExternalId: d.external_id,
  });

  if (result.ok) {
    await pool.query(
      `UPDATE growth_comment_drafts
          SET status='PUBLISHED', published_external_id=$2, published_at=now(), last_error=NULL
        WHERE id=$1`,
      [d.id, result.externalId ?? null],
    );
    await pool.query(`UPDATE growth_comment_opportunities SET status='DONE' WHERE id=$1`, [d.opportunity_id]);
    await resetBackoff(REPLY_BUDGET_KEY);
    await audit('system', 'comment_reply_published', 'comment_draft', d.id, {
      target: d.target_url, externalId: result.externalId,
    });
    log.info('comment_reply_published', { draftId: d.id, target: d.target_url });
    return;
  }

  if (result.failure === 'rate_limited') {
    await recordRateLimitHit(REPLY_BUDGET_KEY, result.retryAfterMs);
    log.warn('comment_reply_rate_limited', { draftId: d.id });
    return; // APPROVED kalır; backoff bitince tekrar denenir
  }
  if (result.failure === 'not_configured') {
    // Kimlik kayboldu → insan görevine düşür, kuyruğu tıkama.
    await pool.query(`UPDATE growth_comment_drafts SET status='MANUAL', last_error=$2 WHERE id=$1`,
      [d.id, result.detail ?? 'not_configured']);
    await createManualTask('x', {
      title: 'X yorumu (elle yapıştır — API kapalı)',
      instructions: `Hedef: ${d.target_url}`,
      payload: { text: d.text, targetUrl: d.target_url },
    });
    return;
  }
  // invalid/error: otomatik retry YOK — insan yeniden onaylarsa tekrar denenir.
  await pool.query(`UPDATE growth_comment_drafts SET status='FAILED', last_error=$2 WHERE id=$1`,
    [d.id, result.detail ?? result.failure ?? 'hata']);
  await audit('system', 'comment_reply_failed', 'comment_draft', d.id, { detail: result.detail });
}

// ── Keşif: X'te güncel futbol tweet'leri (plan destekliyorsa) ────────────
const DISCOVERY_QUERY =
  '(galatasaray OR fenerbahçe OR beşiktaş OR "süper lig" OR "şampiyonlar ligi" OR transfermarkt OR futbol) lang:tr -is:retweet -is:reply';

export async function discoverOpportunities(actor: string): Promise<{ ok: boolean; added: number; detail?: string }> {
  const res = await searchRecentTweets(DISCOVERY_QUERY, 25);
  if (!res.ok) return { ok: false, added: 0, detail: res.detail };
  let added = 0;
  for (const t of res.tweets.slice(0, 8)) {
    if (t.likes + t.retweets < 20) continue; // ölü tweet'e yorum fırsatı açma
    const created = await createOpportunity({
      url: t.url,
      topic: t.text.slice(0, 120),
      source: 'search',
      engagement: { likes: t.likes, retweets: t.retweets },
    }, actor);
    if ('created' in created && created.created) added += 1;
  }
  return { ok: true, added };
}
