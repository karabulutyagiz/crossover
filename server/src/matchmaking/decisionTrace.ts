import { pool } from '../db/pool.ts';

export interface MatchmakingDecisionTrace {
  matchId?: string;
  playerId?: string | null;
  queueStart: number;
  queueDurationMs: number;
  humanCandidatesFound: number;
  selectedOpponentType: 'HUMAN' | 'BOT' | 'NONE';
  selectedOpponentId?: string | null;
  selectedOpponentMmr?: number | null;
  playerMmr?: number | null;
  mmrDifference?: number | null;
  botSkill?: number | null;
  queueHealth?: Record<string, unknown>;
  formScore?: number | null;
  frustrationRisk?: number | null;
  farmRisk?: number | null;
  trophyEconomyState?: string | null;
  matchQualityScore?: number | null;
  selectionReason: string;
}

export function recordDecisionTrace(trace: MatchmakingDecisionTrace): void {
  pool.query(
    `INSERT INTO match_decision_traces
       (match_id, player_id, queue_start, queue_duration_ms, human_candidates_found, selected_opponent_type,
        selected_opponent_id, selected_opponent_mmr, player_mmr, mmr_difference, bot_skill, queue_health,
        form_score, frustration_risk, farm_risk, trophy_economy_state, match_quality_score, selection_reason)
     VALUES ($1, $2, to_timestamp($3::double precision / 1000), $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18)`,
    [
      trace.matchId ?? null,
      trace.playerId ?? null,
      trace.queueStart,
      trace.queueDurationMs,
      trace.humanCandidatesFound,
      trace.selectedOpponentType,
      trace.selectedOpponentId ?? null,
      trace.selectedOpponentMmr ?? null,
      trace.playerMmr ?? null,
      trace.mmrDifference ?? null,
      trace.botSkill ?? null,
      JSON.stringify(trace.queueHealth ?? {}),
      trace.formScore ?? null,
      trace.frustrationRisk ?? null,
      trace.farmRisk ?? null,
      trace.trophyEconomyState ?? null,
      trace.matchQualityScore ?? null,
      trace.selectionReason,
    ],
  ).catch((err) => {
    if ((err as { code?: string }).code !== '42P01') console.warn('decision_trace_write_failed', err);
  });
}
