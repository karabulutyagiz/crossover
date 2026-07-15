// Expo Push API sender + the two push crons (re-engagement, store refresh).
// Everything here is fire-and-forget safe: no exported function ever throws
// into its caller — failures are logged and swallowed, because a broken push
// must never take down a game action. Gated behind config.pushEnabled.

import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';
import { config } from '../config.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;        // Expo accepts at most 100 messages per request
const FETCH_TIMEOUT_MS = 10_000;

export interface PushMessage {
  title: string;
  body: string;
  data?: object;
  badge?: number;
}

export interface PushTokenRow {
  token: string;
  lang: string;
}

// Expo push ticket (one per message, same order as the request).
interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Save (or re-point) a device's Expo push token. Upsert keyed on the token. */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: 'ios' | 'android',
  lang: string,
): Promise<void> {
  if (!config.pushEnabled || !userId || !token) return;
  await pool.query(
    `INSERT INTO push_tokens (token, user_id, platform, lang, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           lang = EXCLUDED.lang,
           updated_at = now()`,
    [token, userId, platform, lang],
  );
}

async function postChunk(messages: object[]): Promise<ExpoTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`expo push http ${res.status}`);
  const json = (await res.json()) as { data?: ExpoTicket[] };
  return json.data ?? [];
}

/**
 * Send one message to a list of raw tokens (chunked by 100). Never throws.
 * Tickets come back in request order; any DeviceNotRegistered token is deleted
 * so we stop pushing to uninstalled apps. Used directly by the crons, which
 * group tokens by language and call this once per language bucket.
 */
export async function sendPushRaw(tokenRows: { token: string }[], msg: PushMessage): Promise<void> {
  if (!config.pushEnabled || tokenRows.length === 0) return;
  const payload = { title: msg.title, body: msg.body, data: msg.data, badge: msg.badge, sound: 'default' };
  for (let i = 0; i < tokenRows.length; i += CHUNK_SIZE) {
    const chunk = tokenRows.slice(i, i + CHUNK_SIZE);
    try {
      const tickets = await postChunk(chunk.map((r) => ({ to: r.token, ...payload })));
      const dead = chunk
        .filter((_, j) => tickets[j]?.details?.error === 'DeviceNotRegistered')
        .map((r) => r.token);
      if (dead.length) {
        await pool.query(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [dead]);
        log.info('push_tokens_pruned', { count: dead.length });
      }
    } catch (err) {
      log.warn('push_send_failed', { count: chunk.length, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Send one message to every device of the given users. Never throws. */
export async function sendPushToUsers(userIds: string[], msg: PushMessage): Promise<void> {
  if (!config.pushEnabled || userIds.length === 0) return;
  try {
    const { rows } = await pool.query<{ token: string }>(
      `SELECT token FROM push_tokens WHERE user_id = ANY($1::uuid[])`,
      [userIds],
    );
    await sendPushRaw(rows, msg);
  } catch (err) {
    log.warn('push_lookup_failed', { userIds: userIds.length, error: err instanceof Error ? err.message : String(err) });
  }
}

// ---- Crons ----

const REENGAGE_INTERVAL_MS = 30 * 60 * 1000;   // check every 30 min
const STORE_CHECK_INTERVAL_MS = 10 * 60 * 1000; // check every 10 min
const PUSH_TITLE = 'Crossover';

// We only localize into tr/en; anything else falls back to en ('tr' is the
// schema default, so unset devices get Turkish copy).
function langBucket(lang: string): 'tr' | 'en' {
  return lang.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

function groupByLang(rows: PushTokenRow[]): Record<'tr' | 'en', PushTokenRow[]> {
  const groups: Record<'tr' | 'en', PushTokenRow[]> = { tr: [], en: [] };
  for (const r of rows) groups[langBucket(r.lang)].push(r);
  return groups;
}

const REENGAGE_COPY: Record<'tr' | 'en', string[]> = {
  tr: [
    '⚽ Arena seni bekliyor! Rakiplerin kupa topluyor, sen neredesin?',
    '🏆 Formunu koruma zamanı — bugün bir maç yapmadan olmaz!',
    '🔥 Kupalar kendini toplamaz. Bir maçlık işin var!',
  ],
  en: [
    '⚽ The arena awaits! Your rivals are stacking trophies…',
    '🏆 Time to defend your form — one match today!',
    '🔥 Trophies won’t collect themselves. One quick match!',
  ],
};

const STORE_COPY: Record<'tr' | 'en', string> = {
  tr: '🛍️ Mağaza yenilendi! Yeni ifadeler seni bekliyor.',
  en: '🛍️ The store just refreshed! New emotes await.',
};

// Nudge players who drifted away: gone 48h+, not nudged in the last 72h.
// Selecting the batch and stamping last_reengage_at happen in ONE statement,
// so an overlapping run can never double-send to the same user.
async function runReengageCron(): Promise<void> {
  const { rows } = await pool.query<PushTokenRow>(
    `WITH batch AS (
       SELECT id FROM users u
        WHERE u.last_seen < now() - interval '48 hours'
          AND (u.last_reengage_at IS NULL OR u.last_reengage_at < now() - interval '72 hours')
          AND EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id = u.id)
        LIMIT 500
     ), stamped AS (
       UPDATE users u SET last_reengage_at = now()
         FROM batch b WHERE u.id = b.id
       RETURNING u.id
     )
     SELECT pt.token, pt.lang
       FROM stamped s
       JOIN push_tokens pt ON pt.user_id = s.id`,
  );
  if (rows.length === 0) return;
  // Rotate the copy per run (time-derived so restarts don't reset the cycle).
  const variant = Math.floor(Date.now() / REENGAGE_INTERVAL_MS) % 3;
  const groups = groupByLang(rows);
  for (const lang of ['tr', 'en'] as const) {
    await sendPushRaw(groups[lang], {
      title: PUSH_TITLE,
      body: REENGAGE_COPY[lang][variant]!,
      data: { kind: 'reengage' },
    });
  }
  log.info('push_reengage_sent', { tokens: rows.length, variant });
}

function istanbulNow(): { weekday: string; hour: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')), date: `${get('year')}-${get('month')}-${get('day')}` };
}

// Announce the weekly store refresh: Monday 09:xx Europe/Istanbul, once per day.
// The app_state upsert only touches the row when the stored date differs, so
// exactly one tick (even across concurrent processes) claims the send.
async function runStoreRefreshCron(): Promise<void> {
  const { weekday, hour, date } = istanbulNow();
  if (weekday !== 'Mon' || hour !== 9) return;
  const claim = await pool.query(
    `INSERT INTO app_state (key, value) VALUES ('last_store_push', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       WHERE app_state.value <> EXCLUDED.value
     RETURNING value`,
    [date],
  );
  if (claim.rows.length === 0) return; // already sent today
  const { rows } = await pool.query<PushTokenRow>(`SELECT token, lang FROM push_tokens`);
  const groups = groupByLang(rows);
  for (const lang of ['tr', 'en'] as const) {
    await sendPushRaw(groups[lang], {
      title: PUSH_TITLE,
      body: STORE_COPY[lang],
      data: { kind: 'store' },
    });
  }
  log.info('push_store_sent', { tokens: rows.length, date });
}

/** Start the push crons. The process is long-lived; the timers are never cleared. */
export function startPushCrons(): void {
  if (!config.pushEnabled) return;
  setInterval(() => {
    runReengageCron().catch((err) =>
      log.error('push_reengage_cron_failed', { error: err instanceof Error ? err.message : String(err) }));
  }, REENGAGE_INTERVAL_MS);
  setInterval(() => {
    runStoreRefreshCron().catch((err) =>
      log.error('push_store_cron_failed', { error: err instanceof Error ? err.message : String(err) }));
  }, STORE_CHECK_INTERVAL_MS);
  log.info('push_crons_started');
}
