import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { clamp } from './random.ts';
import { expectedScore } from './skillRating.ts';

// İnsan-insan bandı env'den ayarlanabilir (TROPHY_MIN_GAIN vb., config.ts) —
// önceden bu sabitler hardcode'du ve env değişkenleri hiç okunmuyordu, "tune
// ettim ama değişmedi" tuzağı vardı. Bozuk sıralamalar (min>max) burada
// düzeltilir ki settlement asla ters banda düşmesin.
function sanitizeBand(min: number, max: number, fallbackMin: number, fallbackMax: number): [number, number] {
  const lo = Math.max(1, Math.round(Number.isFinite(min) ? min : fallbackMin));
  const hi = Math.max(lo, Math.round(Number.isFinite(max) ? max : fallbackMax));
  return [lo, hi];
}
const [GAIN_MIN, GAIN_MAX] = sanitizeBand(config.opponentSystem.trophyMinGain, config.opponentSystem.trophyMaxGain, 28, 35);
const [LOSS_MIN, LOSS_MAX] = sanitizeBand(config.opponentSystem.trophyMinLoss, config.opponentSystem.trophyMaxLoss, 15, 25);
export const TROPHY_GAIN_MIN = GAIN_MIN;
export const TROPHY_GAIN_MAX = GAIN_MAX;
export const TROPHY_LOSS_MIN = LOSS_MIN;
export const TROPHY_LOSS_MAX = LOSS_MAX;

export interface TrophyCalculation {
  expectedWinProbability: number;
  delta: number;
  k: number;
}

export interface TrophyVelocity {
  gainedLast10: number;
  gainedLast20: number;
  gainedLastHour: number;
  botContributionLast20: number;
  humanContributionLast20: number;
  pressure: number;
}

export function clampFinalTrophyDelta(args: {
  rawDelta: number;
  won: boolean;
  currentTrophies: number;
  /** Bot maçı bandı (2026-08-26, Riot-vari): insan-insan 28-35 aynen kalır;
   * bot maçında bant genişler ki kolay rakip taban, zor rakip dolgun ödesin. */
  gainMin?: number;
  gainMax?: number;
  lossMin?: number;
  lossMax?: number;
}): number {
  const gainMin = args.gainMin ?? TROPHY_GAIN_MIN;
  const gainMax = args.gainMax ?? TROPHY_GAIN_MAX;
  const lossMin = args.lossMin ?? TROPHY_LOSS_MIN;
  const lossMax = args.lossMax ?? TROPHY_LOSS_MAX;
  const currentTrophies = Math.max(0, Math.floor(Number.isFinite(args.currentTrophies) ? args.currentTrophies : 0));
  const rawDelta = Number.isFinite(args.rawDelta) ? args.rawDelta : 0;
  if (args.won) {
    return Math.round(clamp(Math.round(rawDelta), gainMin, gainMax));
  }
  const loss = Math.round(clamp(Math.round(Math.abs(rawDelta)), lossMin, lossMax));
  const actualLoss = Math.min(loss, currentTrophies);
  return actualLoss === 0 ? 0 : -actualLoss;
}

// KULLANICI KARARI (2026-08-27, kesin): bot/insan AYRIMI YOK — her dereceli
// maçta kazanç 28-35, kayıp 15-28. (Eski 'kolay bot taban 12' bandı '+12
// veriyor' şikayetiyle kaldırıldı; oyuncu bot maçını ayırt edememeli.)
export const BOT_GAIN_MIN = 28;
export const BOT_GAIN_MAX = 35;
export const BOT_LOSS_MIN = 15;
export const BOT_LOSS_MAX = 25;

export function trophyDeltaExpectedScore(args: {
  playerSkillMean: number;
  opponentSkillMean: number;
  playerSkillUncertainty?: number;
  opponentSkillUncertainty?: number;
  won: boolean;
  playerTrophies: number;
  opponentTrophies?: number | null;
  vsBot?: boolean;
}): TrophyCalculation {
  const expected = expectedScore(
    args.playerSkillMean,
    args.opponentSkillMean,
    args.playerSkillUncertainty ?? 120,
    args.opponentSkillUncertainty ?? 120,
  );
  let raw: number;
  if (args.vsBot) {
    // Riot-vari ekonomi: kazanç, yenilen botun GERÇEK gücüyle ölçeklenir.
    // Kolay bot (expected≈0.8) → ~12; denk (0.5) → ~21; elit (0.3) → ~28-30.
    raw = args.won
      ? BOT_GAIN_MIN + (BOT_GAIN_MAX - BOT_GAIN_MIN) * clamp((0.78 - expected) / 0.55, 0, 1)
      : -(BOT_LOSS_MIN + (BOT_LOSS_MAX - BOT_LOSS_MIN) * clamp((expected - 0.25) / 0.5, 0, 1));
  } else {
    raw = args.won
      ? TROPHY_GAIN_MIN + (TROPHY_GAIN_MAX - TROPHY_GAIN_MIN) * clamp((0.75 - expected) / 0.5, 0, 1)
      : -(TROPHY_LOSS_MIN + (TROPHY_LOSS_MAX - TROPHY_LOSS_MIN) * clamp((expected - 0.25) / 0.5, 0, 1));
  }
  const bounds = args.vsBot ? { gainMin: BOT_GAIN_MIN, gainMax: BOT_GAIN_MAX, lossMin: BOT_LOSS_MIN, lossMax: BOT_LOSS_MAX } : {};
  const delta = clampFinalTrophyDelta({ rawDelta: raw, won: args.won, currentTrophies: args.playerTrophies, ...bounds });
  return { expectedWinProbability: Number(expected.toFixed(4)), delta, k: Number(Math.abs(raw).toFixed(2)) };
}

export async function getTrophyVelocity(userId: string): Promise<TrophyVelocity> {
  try {
    const { rows } = await pool.query<{ won: boolean; opponent_id: string | null; played_at: string; player_trophies: number }>(
      `SELECT won, opponent_id::text AS opponent_id, played_at, player_trophies
         FROM match_history
        WHERE player_id = $1
        ORDER BY played_at DESC
        LIMIT 24`,
      [userId],
    );
    const current = await pool.query<{ trophies: number }>(`SELECT trophies FROM users WHERE id = $1`, [userId]);
    const nowTrophies = Number(current.rows[0]?.trophies ?? 0);
    const now = Date.now();
    const gainedLast10 = gainSince(nowTrophies, rows.slice(0, 10));
    const gainedLast20 = gainSince(nowTrophies, rows.slice(0, 20));
    const lastHour = rows.filter((r) => now - new Date(r.played_at).getTime() <= 3600_000);
    const gainedLastHour = gainSince(nowTrophies, lastHour);
    const botRows = rows.slice(0, 20).filter((r) => r.opponent_id == null);
    const humanRows = rows.slice(0, 20).filter((r) => r.opponent_id != null);
    const botContributionLast20 = gainSince(nowTrophies, botRows);
    const humanContributionLast20 = gainSince(nowTrophies, humanRows);
    // Eşikler ~%50 gevşetildi (2026-08-27, tutundurma-öncelik): eski eşikler
    // saatte 5-6 galibiyeti (~150 kupa) "farm" sayıp baskı üretiyordu — o tempo
    // bağlı bir oyuncunun NORMAL seansı. Baskı ancak aşırı uçta devreye girer.
    const pressure = clamp(
      (gainedLast10 >= 340 ? 0.32 : gainedLast10 >= 260 ? 0.20 : gainedLast10 >= 180 ? 0.10 : 0)
        + (gainedLastHour >= 520 ? 0.32 : gainedLastHour >= 380 ? 0.20 : gainedLastHour >= 260 ? 0.10 : 0)
        + (botRows.length >= 10 && botContributionLast20 >= 300 ? 0.16 : 0),
      0,
      0.60,
    );
    return { gainedLast10, gainedLast20, gainedLastHour, botContributionLast20, humanContributionLast20, pressure };
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return { gainedLast10: 0, gainedLast20: 0, gainedLastHour: 0, botContributionLast20: 0, humanContributionLast20: 0, pressure: 0 };
    throw err;
  }
}

function gainSince(currentTrophies: number, rows: { player_trophies: number }[]): number {
  if (!rows.length) return 0;
  const baseline = Math.min(...rows.map((r) => Number(r.player_trophies) || 0));
  return Math.max(0, currentTrophies - baseline);
}
