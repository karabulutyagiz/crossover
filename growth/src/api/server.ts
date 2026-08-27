import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { log } from '../logger.ts';
import { audit } from '../core/audit.ts';
import { audienceFitScore } from '../core/score.ts';
import type { Role } from '../core/types.ts';
import { allProviders } from '../providers/registry.ts';
import { planDaily } from '../scheduler/planner.ts';
import { runLearningOnce } from '../analytics/learning.ts';
import { loadWeights } from '../analytics/weights.ts';
import { checkLogin, issueToken, verifyToken, hasRole, type Session } from './auth.ts';
import {
  createOpportunity, regenerateDrafts, approveDraft, discoverOpportunities,
} from '../comments/service.ts';

// Growth API + dashboard + tracking redirect. Oyun sunucusundaki hand-rolled
// router deseninin düzenlenmiş hali: route tablosu + rol kontrolü.

const __dirname = dirname(fileURLToPath(import.meta.url));

const dashboardHtml = (() => {
  try { return readFileSync(join(__dirname, '../../dashboard/index.html'), 'utf8'); }
  catch { return ''; }
})();

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
} as const;

function json(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 200_000) { req.destroy(); reject(new Error('body too large')); }
    });
    req.on('end', () => {
      try { resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}); }
      catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

type Handler = (ctx: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  session: Session;
  body: Record<string, unknown>;
}) => Promise<void>;

interface Route {
  method: string;
  parts: string[];
  minRole: Role;
  handler: Handler;
}

const routes: Route[] = [];

function route(method: string, pattern: string, minRole: Role, handler: Handler): void {
  routes.push({ method, parts: pattern.split('/').filter(Boolean), minRole, handler });
}

function matchRoute(method: string, path: string): { r: Route; params: Record<string, string> } | null {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) {
      const p = r.parts[i]!;
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(parts[i]!);
      else if (p !== parts[i]) { ok = false; break; }
    }
    if (ok) return { r, params };
  }
  return null;
}

// ── Routes ───────────────────────────────────────────────────────────────

route('GET', '/growth/api/overview', 'VIEWER', async ({ res }) => {
  const [queue, sched, pub7, clicks7, visits7, installs, tasks] = await Promise.all([
    pool.query(`SELECT status, count(*)::int AS n FROM growth_content_items GROUP BY status`),
    pool.query(`SELECT status, count(*)::int AS n FROM growth_scheduled_posts GROUP BY status`),
    pool.query(`SELECT count(*)::int AS n FROM growth_published_posts WHERE published_at > now() - interval '7 days'`),
    pool.query(`SELECT count(*)::int AS n FROM growth_link_clicks WHERE clicked_at > now() - interval '7 days'`),
    pool.query(`SELECT COALESCE(sum(store_visits),0)::int AS n FROM growth_conversion_attribution WHERE day > current_date - 7`),
    pool.query(`SELECT COALESCE(sum(installs),0)::int AS i, COALESCE(sum(first_matches),0)::int AS fm
                  FROM growth_conversion_attribution WHERE day > current_date - 7`),
    pool.query(`SELECT count(*)::int AS n FROM growth_manual_tasks WHERE status = 'OPEN'`),
  ]);
  const providers = allProviders().map((p) => ({
    platform: p.platform,
    capabilities: p.getPublishingCapabilities(),
    limits: p.getLimits(),
  }));
  json(res, 200, {
    contentByStatus: queue.rows,
    scheduledByStatus: sched.rows,
    published7d: pub7.rows[0]?.n ?? 0,
    linkClicks7d: clicks7.rows[0]?.n ?? 0,
    storeVisits7d: visits7.rows[0]?.n ?? 0,
    installs7d: installs.rows[0]?.i ?? 0,
    firstMatches7d: installs.rows[0]?.fm ?? 0,
    openManualTasks: tasks.rows[0]?.n ?? 0,
    providers,
    autoPublishOwned: config.autoPublishOwned,
  });
});

route('GET', '/growth/api/queue', 'VIEWER', async ({ res, query }) => {
  const status = query.get('status') ?? 'REQUIRES_APPROVAL';
  const { rows } = await pool.query(
    `SELECT id, platform, content_type, pillar, hook, hook_type, body, cta, cta_id,
            hashtags, media_brief, teams, players, football_context, posting_reason,
            suggested_time, risk_score, predicted_engagement, hook_quality_score,
            language, status, reviewed_by, created_at
       FROM growth_content_items
      WHERE status = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [status],
  );
  json(res, 200, { items: rows });
});

route('POST', '/growth/api/content/:id/approve', 'MARKETING', async ({ res, params, session, body }) => {
  const id = params.id!;
  const { rows } = await pool.query<{ platform: string; suggested_time: Date | null; status: string }>(
    `SELECT platform, suggested_time, status FROM growth_content_items WHERE id = $1`, [id],
  );
  const item = rows[0];
  if (!item) { json(res, 404, { error: 'not_found' }); return; }
  if (item.status === 'APPROVED') { json(res, 409, { error: 'already_approved' }); return; }

  const when = typeof body.scheduledAt === 'string' && body.scheduledAt
    ? new Date(body.scheduledAt)
    : item.suggested_time ?? new Date(Date.now() + 10 * 60 * 1000);
  if (Number.isNaN(when.getTime())) { json(res, 400, { error: 'invalid_scheduledAt' }); return; }

  await pool.query(
    `UPDATE growth_content_items SET status='APPROVED', reviewed_by=$2, reviewed_at=now() WHERE id=$1`,
    [id, session.email],
  );
  const idem = crypto.createHash('sha256').update(`${id}|${item.platform}|${when.toISOString()}`).digest('hex');
  await pool.query(
    `INSERT INTO growth_scheduled_posts (content_item_id, platform, scheduled_at, status, idempotency_key)
     VALUES ($1,$2,$3,'PENDING',$4)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [id, item.platform, when, idem],
  );
  await audit(session.email, 'content_approved', 'content_item', id, { scheduledAt: when.toISOString() });
  json(res, 200, { ok: true, scheduledAt: when.toISOString() });
});

route('POST', '/growth/api/content/:id/reject', 'MARKETING', async ({ res, params, session, body }) => {
  const { rowCount } = await pool.query(
    `UPDATE growth_content_items SET status='REJECTED', reviewed_by=$2, reviewed_at=now() WHERE id=$1`,
    [params.id, session.email],
  );
  if (!rowCount) { json(res, 404, { error: 'not_found' }); return; }
  await audit(session.email, 'content_rejected', 'content_item', params.id, { reason: body.reason ?? '' });
  json(res, 200, { ok: true });
});

route('POST', '/growth/api/content/:id/edit', 'MARKETING', async ({ res, params, session, body }) => {
  const fields: string[] = [];
  const values: unknown[] = [params.id];
  const editable: Record<string, string> = { hook: 'hook', body: 'body', cta: 'cta' };
  for (const [key, col] of Object.entries(editable)) {
    if (typeof body[key] === 'string') {
      values.push(body[key]);
      fields.push(`${col} = $${values.length}`);
    }
  }
  if (!fields.length) { json(res, 400, { error: 'no_editable_fields' }); return; }
  const { rowCount } = await pool.query(
    `UPDATE growth_content_items SET ${fields.join(', ')} WHERE id = $1 AND status IN ('DRAFT','REQUIRES_APPROVAL')`,
    values,
  );
  if (!rowCount) { json(res, 409, { error: 'not_editable' }); return; }
  await audit(session.email, 'content_edited', 'content_item', params.id, { fields: Object.keys(editable).filter((k) => typeof body[k] === 'string') });
  json(res, 200, { ok: true });
});

route('POST', '/growth/api/scheduled/:id/reschedule', 'MARKETING', async ({ res, params, session, body }) => {
  const when = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) { json(res, 400, { error: 'invalid_scheduledAt' }); return; }
  const { rowCount } = await pool.query(
    `UPDATE growth_scheduled_posts SET scheduled_at=$2, status='PENDING', next_retry_at=NULL
      WHERE id=$1 AND status IN ('PENDING','RETRY_SCHEDULED','FAILED','REQUIRES_APPROVAL')`,
    [params.id, when],
  );
  if (!rowCount) { json(res, 409, { error: 'not_reschedulable' }); return; }
  await audit(session.email, 'post_rescheduled', 'scheduled_post', params.id, { scheduledAt: when.toISOString() });
  json(res, 200, { ok: true });
});

route('POST', '/growth/api/scheduled/:id/cancel', 'MARKETING', async ({ res, params, session }) => {
  const { rowCount } = await pool.query(
    `UPDATE growth_scheduled_posts SET status='CANCELLED' WHERE id=$1 AND status NOT IN ('PUBLISHED','PROCESSING')`,
    [params.id],
  );
  if (!rowCount) { json(res, 409, { error: 'not_cancellable' }); return; }
  await audit(session.email, 'post_cancelled', 'scheduled_post', params.id);
  json(res, 200, { ok: true });
});

route('GET', '/growth/api/scheduled', 'VIEWER', async ({ res }) => {
  const { rows } = await pool.query(
    `SELECT sp.id, sp.platform, sp.scheduled_at, sp.status, sp.attempt, sp.last_error,
            sp.next_retry_at, sp.tracking_code, ci.body, ci.pillar, ci.hook
       FROM growth_scheduled_posts sp
       JOIN growth_content_items ci ON ci.id = sp.content_item_id
      WHERE sp.status NOT IN ('PUBLISHED','CANCELLED')
      ORDER BY sp.scheduled_at
      LIMIT 100`,
  );
  json(res, 200, { items: rows });
});

route('GET', '/growth/api/published', 'VIEWER', async ({ res }) => {
  const { rows } = await pool.query(
    `SELECT pp.id, pp.platform, pp.external_url, pp.published_at, pp.tracking_code,
            ci.body, ci.pillar, ci.hook_type, ci.cta_id,
            m.impressions, m.likes, m.comments, m.shares,
            COALESCE(cl.clicks, 0)::int AS clicks
       FROM growth_published_posts pp
       JOIN growth_content_items ci ON ci.id = pp.content_item_id
       LEFT JOIN LATERAL (
         SELECT impressions, likes, comments, shares FROM growth_platform_metrics
          WHERE published_post_id = pp.id ORDER BY captured_at DESC LIMIT 1
       ) m ON TRUE
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS clicks FROM growth_link_clicks WHERE code = pp.tracking_code
       ) cl ON TRUE
      ORDER BY pp.published_at DESC
      LIMIT 100`,
  );
  json(res, 200, { items: rows });
});

route('GET', '/growth/api/analytics', 'VIEWER', async ({ res }) => {
  const [byPillar, byPlatform] = await Promise.all([
    pool.query(
      `SELECT ci.platform, ci.pillar, count(*)::int AS posts,
              COALESCE(sum(cl.clicks),0)::int AS clicks
         FROM growth_published_posts pp
         JOIN growth_content_items ci ON ci.id = pp.content_item_id
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS clicks FROM growth_link_clicks WHERE code = pp.tracking_code
         ) cl ON TRUE
        WHERE pp.published_at > now() - interval '30 days'
        GROUP BY ci.platform, ci.pillar
        ORDER BY clicks DESC`,
    ),
    pool.query(
      `SELECT platform, count(*)::int AS posts FROM growth_published_posts
        WHERE published_at > now() - interval '30 days' GROUP BY platform`,
    ),
  ]);
  const weights = {
    x: await loadWeights('x'),
    instagram: await loadWeights('instagram'),
    telegram: await loadWeights('telegram'),
  };
  json(res, 200, { byPillar: byPillar.rows, byPlatform: byPlatform.rows, weights });
});

route('POST', '/growth/api/plan/run', 'MARKETING', async ({ res, session }) => {
  const result = await planDaily();
  await audit(session.email, 'plan_triggered', 'plan', undefined, result);
  json(res, 200, result);
});

route('POST', '/growth/api/learning/run', 'ADMIN', async ({ res, session }) => {
  await runLearningOnce();
  await audit(session.email, 'learning_triggered');
  json(res, 200, { ok: true });
});

// ── Topluluklar ──
route('GET', '/growth/api/communities', 'VIEWER', async ({ res }) => {
  const { rows } = await pool.query(
    `SELECT c.*, p.promotion_policy, p.approval_status
       FROM growth_communities c
       LEFT JOIN growth_community_permissions p ON p.community_id = c.id
      ORDER BY c.audience_fit_score DESC NULLS LAST
      LIMIT 200`,
  );
  json(res, 200, { items: rows });
});

route('POST', '/growth/api/communities', 'MARKETING', async ({ res, session, body }) => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform : '';
  if (!name || !platform) { json(res, 400, { error: 'name_and_platform_required' }); return; }
  const fitInput = (body.fit ?? {}) as Record<string, number>;
  const fit = audienceFitScore({
    footballRelevance: Number(fitInput.footballRelevance ?? 0),
    engagement: Number(fitInput.engagement ?? 0),
    audienceAgeFit: Number(fitInput.audienceAgeFit ?? 0),
    mobileGamingOverlap: Number(fitInput.mobileGamingOverlap ?? 0),
    turkeyRelevance: Number(fitInput.turkeyRelevance ?? 0),
    promotionFriendliness: Number(fitInput.promotionFriendliness ?? 0),
  });
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO growth_communities
       (platform, name, url, football_category, language, member_estimate, audience_fit_score, fit_breakdown, rules, admin_contact, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
     ON CONFLICT (platform, name) DO UPDATE SET
       url = EXCLUDED.url, audience_fit_score = EXCLUDED.audience_fit_score,
       fit_breakdown = EXCLUDED.fit_breakdown, rules = EXCLUDED.rules
     RETURNING id`,
    [platform, name, body.url ?? null, body.footballCategory ?? null, body.language ?? 'tr',
     Number(body.memberEstimate ?? 0) || null, fit, JSON.stringify(fitInput),
     JSON.stringify(body.rules ?? {}), body.adminContact ?? null, body.notes ?? null],
  );
  const communityId = rows[0]!.id;
  // Varsayılan izin: MANUAL_APPROVAL_REQUIRED (bölüm 2).
  await pool.query(
    `INSERT INTO growth_community_permissions (community_id) VALUES ($1)
     ON CONFLICT (community_id) DO NOTHING`,
    [communityId],
  );
  await audit(session.email, 'community_upserted', 'community', communityId, { name, platform, fit });
  json(res, 200, { ok: true, id: communityId, audienceFitScore: fit });
});

route('POST', '/growth/api/communities/:id/permission', 'ADMIN', async ({ res, params, session, body }) => {
  const policy = typeof body.promotionPolicy === 'string' ? body.promotionPolicy : '';
  const approval = typeof body.approvalStatus === 'string' ? body.approvalStatus : '';
  if (!['AUTO_POST_ALLOWED', 'MANUAL_APPROVAL_REQUIRED', 'DO_NOT_POST'].includes(policy)) {
    json(res, 400, { error: 'invalid_policy' }); return;
  }
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(approval)) {
    json(res, 400, { error: 'invalid_approval' }); return;
  }
  await pool.query(
    `INSERT INTO growth_community_permissions (community_id, promotion_policy, approval_status, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (community_id) DO UPDATE SET
       promotion_policy = EXCLUDED.promotion_policy, approval_status = EXCLUDED.approval_status,
       approved_by = EXCLUDED.approved_by, approved_at = now()`,
    [params.id, policy, approval, session.email],
  );
  await audit(session.email, 'community_permission_set', 'community', params.id, { policy, approval });
  json(res, 200, { ok: true });
});

// ── Manuel görevler ──
route('GET', '/growth/api/manual-tasks', 'VIEWER', async ({ res }) => {
  const { rows } = await pool.query(
    `SELECT id, platform, title, instructions, payload, status, created_at
       FROM growth_manual_tasks WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT 100`,
  );
  json(res, 200, { items: rows });
});

route('POST', '/growth/api/manual-tasks/:id/done', 'MARKETING', async ({ res, params, session }) => {
  const { rowCount } = await pool.query(
    `UPDATE growth_manual_tasks SET status='DONE', done_by=$2, done_at=now() WHERE id=$1 AND status='OPEN'`,
    [params.id, session.email],
  );
  if (!rowCount) { json(res, 404, { error: 'not_found' }); return; }
  await audit(session.email, 'manual_task_done', 'manual_task', params.id);
  json(res, 200, { ok: true });
});

// ── Hesap durumu ──
route('GET', '/growth/api/accounts', 'VIEWER', async ({ res }) => {
  const statuses = await Promise.all(
    allProviders().map(async (p) => ({
      platform: p.platform,
      auth: await p.refreshAuthentication(),
      capabilities: p.getPublishingCapabilities(),
      limits: p.getLimits(),
    })),
  );
  json(res, 200, { accounts: statuses });
});

// ── Elle atıf girişi (install/registration/first_match — MMP yokken dürüst kayıt) ──
route('POST', '/growth/api/attribution', 'MARKETING', async ({ res, session, body }) => {
  const day = typeof body.day === 'string' ? body.day : new Date().toISOString().slice(0, 10);
  const code = typeof body.trackingCode === 'string' && body.trackingCode ? body.trackingCode : null;
  await pool.query(
    `INSERT INTO growth_conversion_attribution (tracking_code, day, installs, registrations, first_matches, source)
     VALUES ($1,$2,$3,$4,$5,'manual')
     ON CONFLICT (tracking_code, day, source) DO UPDATE SET
       installs = EXCLUDED.installs, registrations = EXCLUDED.registrations, first_matches = EXCLUDED.first_matches`,
    [code, day, Number(body.installs ?? 0) || 0, Number(body.registrations ?? 0) || 0, Number(body.firstMatches ?? 0) || 0],
  );
  await audit(session.email, 'attribution_entered', 'attribution', code ?? 'global', { day });
  json(res, 200, { ok: true });
});

// ── Yorum fırsatları (comment marketing) ──
route('GET', '/growth/api/comments', 'VIEWER', async ({ res }) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.platform, o.target_url, o.author, o.context, o.source, o.engagement,
            o.status, o.created_at,
            COALESCE(json_agg(json_build_object(
              'id', d.id, 'text', d.text, 'variant_key', d.variant_key,
              'mentions_brand', d.mentions_brand, 'status', d.status,
              'published_external_id', d.published_external_id, 'last_error', d.last_error
            ) ORDER BY d.created_at) FILTER (WHERE d.id IS NOT NULL), '[]') AS drafts
       FROM growth_comment_opportunities o
       LEFT JOIN growth_comment_drafts d ON d.opportunity_id = o.id AND d.status <> 'REJECTED'
      WHERE o.status NOT IN ('DISMISSED')
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 60`,
  );
  json(res, 200, { items: rows });
});

route('POST', '/growth/api/comments/opportunities', 'MARKETING', async ({ res, session, body }) => {
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) { json(res, 400, { error: 'url_required' }); return; }
  const teamA = typeof body.teamA === 'string' ? body.teamA.trim() : '';
  const teamB = typeof body.teamB === 'string' ? body.teamB.trim() : '';
  const result = await createOpportunity({
    url,
    teams: teamA && teamB ? [teamA, teamB] : undefined,
    topic: typeof body.topic === 'string' ? body.topic : undefined,
    note: typeof body.note === 'string' ? body.note : undefined,
  }, session.email);
  if ('error' in result) { json(res, 400, { error: result.error }); return; }
  json(res, 200, result);
});

route('POST', '/growth/api/comments/opportunities/:id/regen', 'MARKETING', async ({ res, params, session }) => {
  const n = await regenerateDrafts(params.id!, session.email);
  json(res, 200, { ok: true, drafts: n });
});

route('POST', '/growth/api/comments/opportunities/:id/dismiss', 'MARKETING', async ({ res, params, session }) => {
  await pool.query(`UPDATE growth_comment_opportunities SET status='DISMISSED' WHERE id=$1`, [params.id]);
  await audit(session.email, 'comment_opportunity_dismissed', 'comment_opportunity', params.id);
  json(res, 200, { ok: true });
});

route('POST', '/growth/api/comments/drafts/:id/approve', 'MARKETING', async ({ res, params, session }) => {
  const result = await approveDraft(params.id!, session.email);
  if (!result.ok) { json(res, 409, { error: result.error }); return; }
  json(res, 200, result);
});

route('POST', '/growth/api/comments/drafts/:id/reject', 'MARKETING', async ({ res, params, session }) => {
  await pool.query(`UPDATE growth_comment_drafts SET status='REJECTED' WHERE id=$1 AND status='DRAFT'`, [params.id]);
  await audit(session.email, 'comment_draft_rejected', 'comment_draft', params.id);
  json(res, 200, { ok: true });
});

route('POST', '/growth/api/comments/drafts/:id/edit', 'MARKETING', async ({ res, params, session, body }) => {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 500) { json(res, 400, { error: 'invalid_text' }); return; }
  const { rowCount } = await pool.query(
    `UPDATE growth_comment_drafts SET text=$2 WHERE id=$1 AND status='DRAFT'`,
    [params.id, text],
  );
  if (!rowCount) { json(res, 409, { error: 'not_editable' }); return; }
  await audit(session.email, 'comment_draft_edited', 'comment_draft', params.id);
  json(res, 200, { ok: true });
});

route('POST', '/growth/api/comments/discover', 'MARKETING', async ({ res, session }) => {
  const result = await discoverOpportunities(session.email);
  json(res, 200, result);
});

route('GET', '/growth/api/audit', 'ADMIN', async ({ res }) => {
  const { rows } = await pool.query(
    `SELECT actor, action, entity, entity_id, detail, created_at
       FROM growth_audit_logs ORDER BY created_at DESC LIMIT 200`,
  );
  json(res, 200, { items: rows });
});

// ── Tracking redirect (public) ───────────────────────────────────────────
async function handleRedirect(req: http.IncomingMessage, res: http.ServerResponse, code: string): Promise<void> {
  const { rows } = await pool.query<{ target_url: string }>(
    `SELECT target_url FROM growth_tracking_links WHERE code = $1`, [code],
  );
  const link = rows[0];
  if (!link) {
    res.writeHead(302, { location: config.websiteUrl });
    res.end();
    return;
  }
  const ua = String(req.headers['user-agent'] ?? '');
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0]?.trim() ?? '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const store = isIos ? 'ios' : isAndroid ? 'android' : 'web';
  const target = isIos ? config.iosStoreUrl : isAndroid ? config.androidStoreUrl : link.target_url;

  res.writeHead(302, { location: target, 'cache-control': 'no-store' });
  res.end();

  // Loglama yönlendirmeyi geciktirmesin — best effort.
  void (async () => {
    await pool.query(
      `INSERT INTO growth_link_clicks (code, ip_hash, user_agent, store) VALUES ($1, md5($2), $3, $4)`,
      [code, ip, ua.slice(0, 300), store],
    );
    if (store !== 'web') {
      await pool.query(
        `INSERT INTO growth_conversion_attribution (tracking_code, day, store_visits, source)
         VALUES ($1, current_date, 1, 'redirect')
         ON CONFLICT (tracking_code, day, source)
         DO UPDATE SET store_visits = growth_conversion_attribution.store_visits + 1`,
        [code],
      );
    }
  })().catch((err) => log.warn('click_log_failed', { message: err instanceof Error ? err.message : String(err) }));
}

// ── HTTP server ──────────────────────────────────────────────────────────
export function startApiServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (path === '/health') { json(res, 200, { ok: true }); return; }

      if (path.startsWith('/r/') && req.method === 'GET') {
        await handleRedirect(req, res, path.slice(3));
        return;
      }

      if ((path === '/growth' || path === '/growth/') && req.method === 'GET') {
        if (!dashboardHtml) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Growth dashboard is not bundled.');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(dashboardHtml);
        return;
      }

      if (path === '/growth/api/login' && req.method === 'POST') {
        const body = await readBody(req).catch(() => null);
        if (!body) { json(res, 400, { error: 'invalid_body' }); return; }
        const email = String(body.email ?? '');
        const password = String(body.password ?? '');
        const role = await checkLogin(email, password);
        if (!role) { json(res, 401, { error: 'invalid' }); return; }
        await audit(email.trim().toLowerCase(), 'login');
        json(res, 200, { ok: true, token: issueToken(email, role), role });
        return;
      }

      const match = matchRoute(req.method ?? 'GET', path);
      if (!match) { json(res, 404, { error: 'not_found' }); return; }

      const auth = String(req.headers.authorization ?? '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const session = verifyToken(token);
      if (!session) { json(res, 401, { error: 'unauthorized' }); return; }
      if (!hasRole(session, match.r.minRole)) { json(res, 403, { error: 'forbidden' }); return; }

      const body = req.method === 'POST' ? await readBody(req).catch(() => null) : {};
      if (body === null) { json(res, 400, { error: 'invalid_body' }); return; }

      await match.r.handler({ req, res, params: match.params, query: url.searchParams, session, body });
    })().catch((err) => {
      log.error('api_request_failed', {
        url: req.url, message: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) json(res, 500, { error: 'server' });
    });
  });
  server.listen(port, () => log.info('growth_api_listening', { port }));
  return server;
}
