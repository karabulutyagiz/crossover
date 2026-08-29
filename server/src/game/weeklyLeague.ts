// ═══════════════════════════════════════════════════════════════════════════
// HAFTALIK LİG (2026-08-29) — Duolingo/CR tarzı küme yarışı.
//
// TEMEL KURAL: lig AYRI EŞLEŞME İSTEMEZ. "Hemen Oyna" akışı hiç değişmez;
// oyuncu normal dereceli maçlarını oynar, o maçlarda KAZANDIĞI kupalar lig
// puanı olarak birikir. Kayıp puan DÜŞÜRMEZ — oynamak asla cezalandırılmaz
// (retention-first kararının doğrudan sonucu).
//
// ÖDÜL YALNIZ PRESTİJ (kullanıcı kararı): yükselme/düşme + küme rozeti.
// Elmas ve güç dağıtılmaz — yeni bir ekonomi musluğu açılmaz.
//
// CRON YOK — iki mekanizma bunu gereksiz kılar:
//   1) Botlar DB'de saklanmaz; grup seed'inden deterministik üretilir ve
//      puanları "haftanın ne kadarı geçti" ile hesaplanır (canlı ilerler).
//   2) Hafta kapanışı TEMBELDİR: oyuncu ligi açtığında/puan kazandığında
//      geçmiş haftası varsa önce o kapatılır (league_settlements idempotency),
//      sonra bu haftanın grubuna alınır.
// ═══════════════════════════════════════════════════════════════════════════
import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';
import { SeededRandom, clamp } from '../matchmaking/random.ts';

export const LEAGUE_GROUP_SIZE = 30;
export const LEAGUE_PROMOTE_COUNT = 10; // ilk 10 üst kümeye
export const LEAGUE_DEMOTE_COUNT = 5;   // son 5 alt kümeye
export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'diamond', 'champion'] as const;
export type LeagueTier = typeof LEAGUE_TIERS[number];
export const LEAGUE_MAX_TIER = LEAGUE_TIERS.length - 1;

export interface LeagueRow {
  rank: number;
  name: string;
  points: number;
  isYou: boolean;
  isBot: boolean;
  avatar: string | null;
  zone: 'promote' | 'demote' | 'stay';
}

export interface LeagueStateView {
  tier: number;
  tierName: LeagueTier;
  weekKey: string;
  endsAt: string;          // ISO — haftanın bitişi (gelecek pazartesi 00:00 TR)
  yourRank: number;
  yourPoints: number;
  groupSize: number;
  promoteCount: number;
  demoteCount: number;
  rows: LeagueRow[];
  lastResult: {            // geçen hafta kapanışı (varsa) — "yükseldin/düştün" kutusu
    weekKey: string;
    rank: number;
    points: number;
    tierBefore: number;
    tierAfter: number;
  } | null;
}

// ── Hafta anahtarı ─────────────────────────────────────────────────────────
// Hafta TÜRKİYE saatiyle (UTC+3) pazartesi 00:00'da döner. Anahtar o
// pazartesinin tarihidir ('2026-08-24') — okunur ve sıralanabilir.
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

export function weekKeyFor(now: Date = new Date()): string {
  const tr = new Date(now.getTime() + TR_OFFSET_MS);
  const daysSinceMonday = (tr.getUTCDay() + 6) % 7; // 0=pazartesi
  const monday = new Date(tr.getTime() - daysSinceMonday * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/** Haftanın bitiş anı (gelecek pazartesi 00:00 TR) — UTC ISO damgası. */
export function weekEndsAt(weekKey: string): string {
  const mondayUtcMidnight = new Date(`${weekKey}T00:00:00.000Z`).getTime();
  // weekKey TR günü olduğundan gerçek başlangıç UTC'de 3 saat geridedir.
  return new Date(mondayUtcMidnight - TR_OFFSET_MS + 7 * 86_400_000).toISOString();
}

/** Haftanın ne kadarı geçti (0..1) — bot puanlarının canlı ilerlemesi için. */
function weekProgress(weekKey: string, now: Date): number {
  const end = new Date(weekEndsAt(weekKey)).getTime();
  const start = end - 7 * 86_400_000;
  return clamp((now.getTime() - start) / (end - start), 0, 1);
}

// ── Bot rakipler (DB'de saklanmaz; seed'den üretilir) ──────────────────────
// Not: isimler gerçek oyuncu rumuzu hissi vermeli — bot havuzunun tonuyla aynı
// (kısa, küçük harfli, futbol/Türkiye ağırlıklı).
const BOT_FIRST = [
  'kaan', 'emre', 'burak', 'mert', 'onur', 'serkan', 'tolga', 'yusuf', 'baran', 'efe',
  'arda', 'deniz', 'cem', 'umut', 'ozan', 'kerem', 'berk', 'tuna', 'sinan', 'volkan',
  'hakan', 'ilker', 'murat', 'furkan', 'eren', 'okan', 'polat', 'sarp', 'taner', 'yigit',
];
const BOT_SUFFIX = [
  '', '', '', '10', '07', '99', '61', '34', '35', '06', '_', 'x', '__', '1907', '1903', '1905',
  'fb', 'gs', 'bjk', 'ts', 'kral', 'efsane', 'pro', 'tr',
];

function botIdentity(seed: number, index: number): { name: string; avatar: string } {
  const rng = new SeededRandom(`league:${seed}:${index}`);
  const first = BOT_FIRST[Math.floor(rng.next() * BOT_FIRST.length)]!;
  const suffix = BOT_SUFFIX[Math.floor(rng.next() * BOT_SUFFIX.length)]!;
  const avatar = `pp${1 + Math.floor(rng.next() * 34)}`;
  return { name: `${first}${suffix}`, avatar };
}

/**
 * Bir bot slotunun ANLIK puanı. Her botun haftalık bir hedefi vardır (küme
 * yükseldikçe artar); puan hafta ilerledikçe hedefe doğru akar. Böylece
 * oyuncu hafta içinde tabloyu canlı görür — cron ya da yazma işlemi olmadan.
 */
function botPoints(seed: number, index: number, tier: number, progress: number): number {
  const rng = new SeededRandom(`league:pts:${seed}:${index}`);
  // Küme başına haftalık hedef bandı (bir galibiyet ≈ 30 kupa).
  const base = 380 + tier * 260;                    // Bronz ~380 .. Şampiyon ~1420
  const spread = 0.35 + rng.next() * 1.5;           // kimi tembel, kimi hırslı
  const target = base * spread;
  // Botlar tam doğrusal ilerlemez: hafta sonuna doğru hızlanan hafif eğri.
  const curve = Math.pow(progress, 0.85 + rng.next() * 0.3);
  return Math.max(0, Math.round(target * curve));
}

/**
 * Hafta sonu sırasının küme sonucu. Saf fonksiyon — kapanış mantığının tek
 * kaynağı, testlerin doğruladığı yer burasıdır.
 *   ilk LEAGUE_PROMOTE_COUNT → bir üst küme (Şampiyon'da tavan)
 *   son LEAGUE_DEMOTE_COUNT  → bir alt küme (Bronz'da taban)
 */
export function tierAfterRank(tierBefore: number, rank: number): number {
  if (rank <= LEAGUE_PROMOTE_COUNT) return Math.min(LEAGUE_MAX_TIER, tierBefore + 1);
  if (rank > LEAGUE_GROUP_SIZE - LEAGUE_DEMOTE_COUNT) return Math.max(0, tierBefore - 1);
  return tierBefore;
}

// ── Grup atama ─────────────────────────────────────────────────────────────
/** Oyuncuyu bu haftanın kümesindeki bir gruba koyar (yoksa grup açar). */
async function ensureMembership(userId: string, tier: number, weekKey: string): Promise<string> {
  const existing = await pool.query<{ group_id: string }>(
    `SELECT m.group_id FROM league_members m
       JOIN league_groups g ON g.id = m.group_id
      WHERE m.user_id = $1 AND g.week_key = $2
      LIMIT 1`,
    [userId, weekKey],
  );
  if (existing.rows[0]) return existing.rows[0].group_id;

  // Kapasitesi dolmamış bir grup ara; yoksa yeni aç. ON CONFLICT DO NOTHING ile
  // aynı anda iki maç biten iki oyuncu aynı slotu çakıştıramaz.
  for (let attempt = 0; attempt < 3; attempt++) {
    const open = await pool.query<{ id: string }>(
      `SELECT id FROM league_groups
        WHERE week_key = $1 AND tier = $2 AND member_count < $3
        ORDER BY member_count DESC
        LIMIT 1`,
      [weekKey, tier, LEAGUE_GROUP_SIZE],
    );
    let groupId = open.rows[0]?.id;
    if (!groupId) {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO league_groups (week_key, tier, seed) VALUES ($1, $2, $3) RETURNING id`,
        [weekKey, tier, Math.floor(Math.random() * 2_000_000_000)],
      );
      groupId = created.rows[0]!.id;
    }
    const joined = await pool.query(
      `INSERT INTO league_members (group_id, user_id) VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, userId],
    );
    if (joined.rowCount) {
      await pool.query(`UPDATE league_groups SET member_count = member_count + 1 WHERE id = $1`, [groupId]);
      return groupId;
    }
  }
  throw new Error('league group assignment failed');
}

// ── Hafta kapanışı (tembel) ────────────────────────────────────────────────
/**
 * Oyuncunun GEÇMİŞ haftalarını kapatır: sırasını hesaplar, kümesini günceller,
 * league_settlements'a yazar. (user, week) birincil anahtarı sayesinde aynı
 * hafta iki kez kapanamaz — paralel iki bağlantı da güvenle çağırabilir.
 */
async function settlePastWeeks(userId: string, currentWeekKey: string): Promise<void> {
  const { rows } = await pool.query<{ group_id: string; week_key: string; tier: number; seed: string; member_count: number; points: number }>(
    `SELECT m.group_id, g.week_key, g.tier, g.seed, g.member_count, m.points
       FROM league_members m
       JOIN league_groups g ON g.id = m.group_id
      WHERE m.user_id = $1
        AND g.week_key < $2
        AND NOT EXISTS (SELECT 1 FROM league_settlements s WHERE s.user_id = $1 AND s.week_key = g.week_key)
      ORDER BY g.week_key ASC
      LIMIT 8`,
    [userId, currentWeekKey],
  );
  for (const row of rows) {
    const rank = await rankInGroup(row.group_id, Number(row.seed), row.tier, row.member_count, row.week_key, userId, row.points, new Date(weekEndsAt(row.week_key)));
    if (rank == null) continue;
    const tierBefore = row.tier;
    const tierAfter = tierAfterRank(tierBefore, rank);

    const inserted = await pool.query(
      `INSERT INTO league_settlements (user_id, week_key, rank, points, tier_before, tier_after)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, week_key) DO NOTHING`,
      [userId, row.week_key, rank, row.points, tierBefore, tierAfter],
    );
    if (!inserted.rowCount) continue; // başka bir bağlantı kapatmış
    await pool.query(
      `UPDATE users SET league_tier = $2, league_best_tier = GREATEST(league_best_tier, $2) WHERE id = $1`,
      [userId, tierAfter],
    );
    log.info('league_week_settled', { userId, weekKey: row.week_key, rank, tierBefore, tierAfter });
  }
}

/** Oyuncunun gruptaki sırası (insanlar + üretilen botlar birlikte sıralanır). */
async function rankInGroup(
  groupId: string, seed: number, tier: number, memberCount: number,
  weekKey: string, userId: string, userPoints: number, at: Date,
): Promise<number | null> {
  const { rows } = await pool.query<{ user_id: string; points: number }>(
    `SELECT user_id, points FROM league_members WHERE group_id = $1`,
    [groupId],
  );
  const progress = weekProgress(weekKey, at);
  const scores: number[] = rows.map((r) => r.points);
  const botSlots = Math.max(0, LEAGUE_GROUP_SIZE - memberCount);
  for (let i = 0; i < botSlots; i++) scores.push(botPoints(seed, i, tier, progress));
  // Sıra = kendinden KESİN yüksek puanlıların sayısı + 1 (eşitlikte oyuncu önde).
  const ahead = scores.filter((p) => p > userPoints).length;
  return ahead + 1;
}

// ── Dış yüzey ──────────────────────────────────────────────────────────────
/**
 * Dereceli bir maçta KAZANILAN kupayı lig puanına ekler. Kayıpta çağrılmaz.
 * Hata durumunda sessiz düşer: lig, maç sonucunu asla bozmamalı.
 */
export async function addLeaguePoints(userId: string, trophyDelta: number): Promise<void> {
  if (trophyDelta <= 0) return;
  const weekKey = weekKeyFor();
  try {
    await settlePastWeeks(userId, weekKey);
    const { rows } = await pool.query<{ league_tier: number }>(`SELECT league_tier FROM users WHERE id = $1`, [userId]);
    const tier = rows[0]?.league_tier ?? 0;
    const groupId = await ensureMembership(userId, tier, weekKey);
    await pool.query(
      `UPDATE league_members SET points = points + $3, wins = wins + 1 WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId, Math.round(trophyDelta)],
    );
  } catch (err) {
    log.warn('league_points_failed', { userId, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Lig ekranının tamamı: tablo + senin sıran + geçen haftanın sonucu. */
export async function getLeagueState(userId: string): Promise<LeagueStateView> {
  const now = new Date();
  const weekKey = weekKeyFor(now);
  await settlePastWeeks(userId, weekKey);

  const { rows: userRows } = await pool.query<{ league_tier: number }>(`SELECT league_tier FROM users WHERE id = $1`, [userId]);
  const tier = userRows[0]?.league_tier ?? 0;
  const groupId = await ensureMembership(userId, tier, weekKey);

  const { rows: groupRows } = await pool.query<{ seed: string; member_count: number }>(
    `SELECT seed, member_count FROM league_groups WHERE id = $1`, [groupId],
  );
  const seed = Number(groupRows[0]?.seed ?? 0);
  const memberCount = groupRows[0]?.member_count ?? 1;

  const { rows: members } = await pool.query<{ user_id: string; points: number; display_name: string; avatar: string | null }>(
    `SELECT m.user_id, m.points, u.display_name, u.avatar
       FROM league_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = $1`,
    [groupId],
  );

  const progress = weekProgress(weekKey, now);
  const botSlots = Math.max(0, LEAGUE_GROUP_SIZE - memberCount);
  type Entry = { name: string; points: number; isYou: boolean; isBot: boolean; avatar: string | null };
  const entries: Entry[] = members.map((m) => ({
    name: m.display_name,
    points: m.points,
    isYou: m.user_id === userId,
    isBot: false,
    avatar: m.avatar,
  }));
  for (let i = 0; i < botSlots; i++) {
    const identity = botIdentity(seed, i);
    entries.push({ name: identity.name, points: botPoints(seed, i, tier, progress), isYou: false, isBot: true, avatar: identity.avatar });
  }
  // Eşit puanda İNSAN önde: bot kalabalığı oyuncuyu haksızca aşağı itmesin.
  entries.sort((a, b) => b.points - a.points || Number(a.isBot) - Number(b.isBot) || a.name.localeCompare(b.name, 'tr'));

  const rows: LeagueRow[] = entries.map((e, i) => ({
    rank: i + 1,
    name: e.name,
    points: e.points,
    isYou: e.isYou,
    isBot: e.isBot,
    avatar: e.avatar,
    zone: i < LEAGUE_PROMOTE_COUNT ? 'promote'
      : i >= LEAGUE_GROUP_SIZE - LEAGUE_DEMOTE_COUNT ? 'demote'
        : 'stay',
  }));
  const you = rows.find((r) => r.isYou);

  const { rows: lastRows } = await pool.query<{ week_key: string; rank: number; points: number; tier_before: number; tier_after: number }>(
    `SELECT week_key, rank, points, tier_before, tier_after
       FROM league_settlements WHERE user_id = $1 ORDER BY week_key DESC LIMIT 1`,
    [userId],
  );
  const last = lastRows[0] ?? null;

  return {
    tier,
    tierName: LEAGUE_TIERS[tier] ?? 'bronze',
    weekKey,
    endsAt: weekEndsAt(weekKey),
    yourRank: you?.rank ?? rows.length,
    yourPoints: you?.points ?? 0,
    groupSize: LEAGUE_GROUP_SIZE,
    promoteCount: LEAGUE_PROMOTE_COUNT,
    demoteCount: LEAGUE_DEMOTE_COUNT,
    rows,
    lastResult: last ? {
      weekKey: last.week_key,
      rank: last.rank,
      points: last.points,
      tierBefore: last.tier_before,
      tierAfter: last.tier_after,
    } : null,
  };
}
