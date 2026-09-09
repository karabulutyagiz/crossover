import { pool } from '../db/pool.ts';
import { liveOpsConfig } from './liveOpsConfig.ts';

export type FarmRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FarmRiskAssessment {
  score: number;
  level: FarmRiskLevel;
  pairRewardMultiplier: number;
  botRewardMultiplier: number;
  repeatedPairCount24h: number;
  botExposureCount: number;
  reasons: string[];
}

export async function assessFarmRisk(args: {
  playerId: string;
  opponentId?: string | null;
  opponentType: 'HUMAN' | 'BOT';
  playerWon?: boolean;
}): Promise<FarmRiskAssessment> {
  const cfg = liveOpsConfig();
  if (!cfg.killSwitches.antiFarmEnabled) return emptyRisk();
  const reasons: string[] = [];
  let repeatedPairCount24h = 0;
  let oneWayTransfers = 0;
  let botExposureCount = 0;
  try {
    if (args.opponentType === 'HUMAN' && args.opponentId) {
      const pairKey = pairKeyFor(args.playerId, args.opponentId);
      const { rows } = await pool.query<{ matches_24h: string; one_way: string }>(
        `SELECT count(*)::int AS matches_24h,
                count(*) FILTER (WHERE winner_id = $2)::int AS one_way
           FROM opponent_history
          WHERE pair_key = $1 AND created_at >= now() - interval '24 hours'`,
        [pairKey, args.playerId],
      );
      repeatedPairCount24h = Number(rows[0]?.matches_24h ?? 0);
      oneWayTransfers = Number(rows[0]?.one_way ?? 0);
      if (repeatedPairCount24h >= cfg.antiFarm.pairDecayStart) reasons.push('repeated_pair');
      if (repeatedPairCount24h >= 4 && oneWayTransfers / Math.max(1, repeatedPairCount24h) >= 0.78) reasons.push('one_way_transfer');
    } else {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM player_bot_exposure WHERE user_id = $1 AND created_at >= now() - ($2::text || ' milliseconds')::interval`,
        [args.playerId, cfg.antiFarm.botExposureWindowMs],
      );
      botExposureCount = Number(rows[0]?.n ?? 0);
      if (botExposureCount >= cfg.antiFarm.botExposureDecayStart) reasons.push('high_bot_exposure');
    }
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
  }
  const pairPressure = Math.max(0, repeatedPairCount24h - cfg.antiFarm.pairDecayStart + 1) * 0.14;
  const oneWayPressure = oneWayTransfers >= 3 ? 0.18 + Math.min(0.22, oneWayTransfers * 0.025) : 0;
  const botPressure = Math.max(0, botExposureCount - cfg.antiFarm.botExposureDecayStart + 1) * 0.10;
  const score = Math.max(0, Math.min(1, pairPressure + oneWayPressure + botPressure));
  const level = score >= cfg.antiFarm.criticalRiskThreshold ? 'CRITICAL' : score >= cfg.antiFarm.highRiskThreshold ? 'HIGH' : score >= 0.32 ? 'MEDIUM' : 'LOW';
  return {
    score: Number(score.toFixed(4)),
    level,
    pairRewardMultiplier: args.opponentType === 'HUMAN' ? multiplierFromPressure(pairPressure + oneWayPressure, cfg.antiFarm.pairDecayFloor) : 1,
    botRewardMultiplier: args.opponentType === 'BOT' ? multiplierFromPressure(botPressure, cfg.antiFarm.botExposureDecayFloor) : 1,
    repeatedPairCount24h,
    botExposureCount,
    reasons,
  };
}

/** Same human-pair score as assessFarmRisk, fetched in one query per search.
 * Settlement still reads fresh risk; this is not a reward/anti-farm cache.
 */
export async function assessHumanCandidateRisks(
  playerId: string,
  opponentIds: readonly string[],
  db: Pick<typeof pool, 'query'> = pool,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  const cfg = liveOpsConfig();
  if (!cfg.killSwitches.antiFarmEnabled || opponentIds.length === 0) return scores;
  const keys = [...new Set(opponentIds.map((id) => pairKeyFor(playerId, id)))];
  try {
    const { rows } = await db.query<{ pair_key: string; matches_24h: number; one_way: number }>(
      `SELECT pair_key, count(*)::int AS matches_24h,
              count(*) FILTER (WHERE winner_id = $2)::int AS one_way
         FROM opponent_history
        WHERE pair_key = ANY($1::text[]) AND created_at >= now() - interval '24 hours'
        GROUP BY pair_key`,
      [keys, playerId],
    );
    const byPair = new Map(rows.map((row) => [row.pair_key, row]));
    for (const id of opponentIds) {
      const row = byPair.get(pairKeyFor(playerId, id));
      const pairPressure = Math.max(0, Number(row?.matches_24h ?? 0) - cfg.antiFarm.pairDecayStart + 1) * 0.14;
      const wins = Number(row?.one_way ?? 0);
      const oneWayPressure = wins >= 3 ? 0.18 + Math.min(0.22, wins * 0.025) : 0;
      scores.set(id, Number(Math.max(0, Math.min(1, pairPressure + oneWayPressure)).toFixed(4)));
    }
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
  }
  return scores;
}

export async function recordOpponentHistory(args: {
  matchId: string;
  playerId: string;
  opponentId?: string | null;
  opponentType: 'HUMAN' | 'BOT';
  winnerId?: string | null;
  won: boolean;
  trophyDelta: number;
  durationSecs: number;
  answerPattern?: Record<string, unknown>;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO opponent_history (match_id, player_id, opponent_id, opponent_type, pair_key, winner_id, won, trophy_delta, duration_secs, answer_pattern)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT DO NOTHING`,
      [args.matchId, args.playerId, args.opponentId ?? null, args.opponentType, args.opponentId ? pairKeyFor(args.playerId, args.opponentId) : null, args.winnerId ?? null, args.won, args.trophyDelta, args.durationSecs, JSON.stringify(args.answerPattern ?? {})],
    );
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
  }
}

export async function recordBotExposure(userId: string, botId: string, matchId: string, segment: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO player_bot_exposure (user_id, bot_id, match_id, segment) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [userId, botId, matchId, segment],
    );
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
  }
}

export function pairKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}

function multiplierFromPressure(pressure: number, floor: number): number {
  return Number(Math.max(floor, 1 - pressure).toFixed(4));
}

function emptyRisk(): FarmRiskAssessment {
  return { score: 0, level: 'LOW', pairRewardMultiplier: 1, botRewardMultiplier: 1, repeatedPairCount24h: 0, botExposureCount: 0, reasons: [] };
}
