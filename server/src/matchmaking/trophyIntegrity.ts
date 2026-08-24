import { pool } from '../db/pool.ts';
import { clamp } from './random.ts';
import { expectedScore } from './skillRating.ts';

export const TROPHY_GAIN_MIN = 28;
export const TROPHY_GAIN_MAX = 35;
export const TROPHY_LOSS_MIN = 15;
export const TROPHY_LOSS_MAX = 20;

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
}): number {
  const currentTrophies = Math.max(0, Math.floor(Number.isFinite(args.currentTrophies) ? args.currentTrophies : 0));
  const rawDelta = Number.isFinite(args.rawDelta) ? args.rawDelta : 0;
  if (args.won) {
    return Math.round(clamp(Math.round(rawDelta), TROPHY_GAIN_MIN, TROPHY_GAIN_MAX));
  }
  const loss = Math.round(clamp(Math.round(Math.abs(rawDelta)), TROPHY_LOSS_MIN, TROPHY_LOSS_MAX));
  const actualLoss = Math.min(loss, currentTrophies);
  return actualLoss === 0 ? 0 : -actualLoss;
}

export function trophyDeltaExpectedScore(args: {
  playerSkillMean: number;
  opponentSkillMean: number;
  playerSkillUncertainty?: number;
  opponentSkillUncertainty?: number;
  won: boolean;
  playerTrophies: number;
  opponentTrophies?: number | null;
}): TrophyCalculation {
  const expected = expectedScore(
    args.playerSkillMean,
    args.opponentSkillMean,
    args.playerSkillUncertainty ?? 120,
    args.opponentSkillUncertainty ?? 120,
  );
  const raw = args.won
    ? TROPHY_GAIN_MIN + (TROPHY_GAIN_MAX - TROPHY_GAIN_MIN) * clamp((0.75 - expected) / 0.5, 0, 1)
    : -(TROPHY_LOSS_MIN + (TROPHY_LOSS_MAX - TROPHY_LOSS_MIN) * clamp((expected - 0.25) / 0.5, 0, 1));
  const delta = clampFinalTrophyDelta({ rawDelta: raw, won: args.won, currentTrophies: args.playerTrophies });
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
    const pressure = clamp(
      (gainedLast10 >= 260 ? 0.32 : gainedLast10 >= 180 ? 0.22 : gainedLast10 >= 110 ? 0.12 : 0)
        + (gainedLastHour >= 380 ? 0.34 : gainedLastHour >= 240 ? 0.22 : gainedLastHour >= 150 ? 0.12 : 0)
        + (botRows.length >= 8 && botContributionLast20 >= 200 ? 0.18 : 0),
      0,
      0.72,
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
