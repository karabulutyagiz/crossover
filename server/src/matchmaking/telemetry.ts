import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';

export type TelemetryOpponentType = 'HUMAN' | 'BOT';

export interface MatchTelemetryEvent {
  eventName:
    | 'matchmaking_started'
    | 'human_opponent_found'
    | 'bot_fallback_created'
    | 'match_started'
    | 'round_started'
    | 'player_answered'
    | 'bot_decision_created'
    | 'round_finished'
    | 'match_finished'
    | 'rematch_offered'
    | 'rematch_accepted'
    | 'session_exit';
  matchId?: string;
  roomCode?: string;
  playerId?: string | null;
  opponentId?: string | null;
  opponentType?: TelemetryOpponentType;
  payload?: Record<string, unknown>;
}

export function recordTelemetry(event: MatchTelemetryEvent): void {
  const payload = event.payload ?? {};
  log.info(event.eventName, {
    matchId: event.matchId,
    room: event.roomCode,
    playerId: event.playerId,
    opponentType: event.opponentType,
    ...payload,
  });
  pool.query(
    `INSERT INTO match_telemetry (event_name, match_id, room_code, player_id, opponent_id, opponent_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      event.eventName,
      event.matchId ?? null,
      event.roomCode ?? null,
      event.playerId ?? null,
      event.opponentId ?? null,
      event.opponentType ?? null,
      JSON.stringify(payload),
    ],
  ).catch((err) => {
    if ((err as { code?: string }).code !== '42P01') {
      log.warn('telemetry_write_failed', { eventName: event.eventName, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

export async function getOpponentKpis(): Promise<Record<string, unknown>> {
  const empty = {
    matchmaking: { humanPercent: 0, aiFallbackPercent: 0, p50Ms: 0, p95Ms: 0 },
    winRates: [],
    responseTimes: [],
    trophy: { trophy_delta_30d: 0, avg_trophy_delta: 0 },
    trophyEconomy: { trophies_created: 0, trophies_destroyed: 0, bot_trophies_injected: 0, avg_reward_multiplier: 1 },
    matchmakingDirector: { p50_queue_ms: 0, p95_queue_ms: 0, avg_match_quality: 0, bot_selection_rate: 0 },
    botDifficulty: [],
    antiFarm: { high_risk_rewards: 0, avg_farm_risk: 0, reduced_rewards: 0 },
    rematchRate: 0,
    closeMatchRate: 0,
  };
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch (err) { return ((err as { code?: string }).code === '42P01' ? fallback : Promise.reject(err)) as T; }
  };
  return safe(async () => {
    const [matchmaking, wins, responseTimes, trophy, rematch, closeMatches] = await Promise.all([
      pool.query(`
        SELECT
          count(*) FILTER (WHERE event_name = 'human_opponent_found')::int AS human_matches,
          count(*) FILTER (WHERE event_name = 'bot_fallback_created')::int AS bot_matches,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE((payload->>'queueDuration')::double precision, (payload->>'searchDurationMs')::double precision, 0)) AS p50_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY COALESCE((payload->>'queueDuration')::double precision, (payload->>'searchDurationMs')::double precision, 0)) AS p95_ms
         FROM match_telemetry
        WHERE event_name IN ('human_opponent_found', 'bot_fallback_created')
          AND created_at >= now() - interval '30 days'`),
      pool.query(`
        SELECT opponent_type,
               count(*)::int AS matches,
               avg(CASE WHEN payload->>'matchResult' = 'win' THEN 1 ELSE 0 END)::float AS player_win_rate
          FROM match_telemetry
         WHERE event_name = 'match_finished'
           AND created_at >= now() - interval '30 days'
         GROUP BY opponent_type`),
      pool.query(`
        SELECT opponent_type,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY (payload->>'responseTimeMs')::double precision) AS p50_response_ms,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY (payload->>'responseTimeMs')::double precision) AS p95_response_ms,
               avg(CASE WHEN payload->>'correct' = 'true' THEN 1 ELSE 0 END)::float AS accuracy
          FROM match_telemetry
         WHERE event_name = 'player_answered'
           AND payload ? 'responseTimeMs'
           AND created_at >= now() - interval '30 days'
         GROUP BY opponent_type`),
      pool.query(`
        SELECT COALESCE(sum((payload->>'trophyDelta')::int), 0)::int AS trophy_delta_30d,
               COALESCE(avg((payload->>'trophyDelta')::double precision), 0)::float AS avg_trophy_delta
          FROM match_telemetry
         WHERE event_name = 'match_finished'
           AND payload ? 'trophyDelta'
           AND created_at >= now() - interval '30 days'`),
      pool.query(`
        SELECT count(*) FILTER (WHERE event_name = 'rematch_offered')::int AS offered,
               count(*) FILTER (WHERE event_name = 'rematch_accepted')::int AS accepted
          FROM match_telemetry
         WHERE event_name IN ('rematch_offered', 'rematch_accepted')
           AND created_at >= now() - interval '30 days'`),
      pool.query(`
        SELECT avg(CASE WHEN ABS(COALESCE((payload->>'scoreFor')::int, 0) - COALESCE((payload->>'scoreAgainst')::int, 0)) <= 1 THEN 1 ELSE 0 END)::float AS close_match_rate
          FROM match_telemetry
         WHERE event_name = 'match_finished'
           AND created_at >= now() - interval '30 days'`),
    ]);
    const [ledger, decision, farm, botDifficulty] = await Promise.all([
      pool.query(`
        SELECT COALESCE(sum(GREATEST(delta, 0)), 0)::int AS trophies_created,
               COALESCE(sum(GREATEST(-delta, 0)), 0)::int AS trophies_destroyed,
               COALESCE(sum(CASE WHEN source = 'BOT_TO_HUMAN_INJECTION' THEN GREATEST(delta, 0) ELSE 0 END), 0)::int AS bot_trophies_injected,
               COALESCE(avg(final_multiplier), 1)::float AS avg_reward_multiplier
          FROM trophy_ledger
         WHERE created_at >= now() - interval '30 days'`).catch(() => ({ rows: [] } as any)),
      pool.query(`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY queue_duration_ms) AS p50_queue_ms,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY queue_duration_ms) AS p95_queue_ms,
               avg(match_quality_score)::float AS avg_match_quality,
               avg(CASE WHEN selected_opponent_type = 'BOT' THEN 1 ELSE 0 END)::float AS bot_selection_rate
          FROM match_decision_traces
         WHERE created_at >= now() - interval '30 days'`).catch(() => ({ rows: [] } as any)),
      pool.query(`
        SELECT count(*) FILTER (WHERE farm_risk_level IN ('HIGH', 'CRITICAL'))::int AS high_risk_rewards,
               avg(farm_risk_score)::float AS avg_farm_risk,
               count(*) FILTER (WHERE final_multiplier < 0.99)::int AS reduced_rewards
           FROM trophy_ledger
          WHERE created_at >= now() - interval '30 days'`).catch(() => ({ rows: [] } as any)),
      pool.query(`
        SELECT b.segment,
               COALESCE(b.director_snapshot->>'competitiveState', 'UNKNOWN') AS competitive_state,
               b.bot_difficulty,
               b.bot_archetype,
               count(*)::int AS matches,
               avg(b.selected_bot_skill)::float AS avg_bot_skill,
               avg(b.estimated_player_win_probability)::float AS avg_estimated_player_win_probability,
               avg(NULLIF(b.director_snapshot->>'competitiveEnjoymentScore', '')::double precision)::float AS avg_competitive_enjoyment_score,
               avg(NULLIF(b.director_snapshot->>'frustrationRiskScore', '')::double precision)::float AS avg_frustration_risk_score,
               avg(NULLIF(b.director_snapshot->>'momentumScore', '')::double precision)::float AS avg_momentum_score,
               avg(NULLIF(b.director_snapshot->>'blowoutRisk', '')::double precision)::float AS avg_blowout_risk,
               avg(b.response_median_ms)::float AS avg_response_median_ms,
               avg(CASE WHEN m.payload->>'matchResult' = 'win' THEN 1 WHEN m.payload ? 'matchResult' THEN 0 END)::float AS player_win_rate
          FROM bot_match_profiles b
          LEFT JOIN match_telemetry m
            ON m.match_id = b.match_id
           AND m.event_name = 'match_finished'
           AND m.player_id = b.user_id
         WHERE b.created_at >= now() - interval '30 days'
          GROUP BY b.segment, COALESCE(b.director_snapshot->>'competitiveState', 'UNKNOWN'), b.bot_difficulty, b.bot_archetype
          ORDER BY b.segment, competitive_state, b.bot_difficulty, matches DESC`).catch(() => ({ rows: [] } as any)),
    ]);
    const mm = matchmaking.rows[0] as any;
    const offered = Number((rematch.rows[0] as any)?.offered ?? 0);
    const accepted = Number((rematch.rows[0] as any)?.accepted ?? 0);
    const humanMatches = Number(mm?.human_matches ?? 0);
    const botMatches = Number(mm?.bot_matches ?? 0);
    const totalMatches = humanMatches + botMatches;
    return {
      matchmaking: {
        humanPercent: totalMatches ? humanMatches / totalMatches : 0,
        aiFallbackPercent: totalMatches ? botMatches / totalMatches : 0,
        p50Ms: Math.round(Number(mm?.p50_ms ?? 0)),
        p95Ms: Math.round(Number(mm?.p95_ms ?? 0)),
      },
      winRates: wins.rows,
      responseTimes: responseTimes.rows,
      trophy: trophy.rows[0] ?? { trophy_delta_30d: 0, avg_trophy_delta: 0 },
      trophyEconomy: ledger.rows[0] ?? { trophies_created: 0, trophies_destroyed: 0, bot_trophies_injected: 0, avg_reward_multiplier: 1 },
      matchmakingDirector: decision.rows[0] ?? { p50_queue_ms: 0, p95_queue_ms: 0, avg_match_quality: 0, bot_selection_rate: 0 },
      botDifficulty: botDifficulty.rows,
      antiFarm: farm.rows[0] ?? { high_risk_rewards: 0, avg_farm_risk: 0, reduced_rewards: 0 },
      rematchRate: offered ? accepted / offered : 0,
      closeMatchRate: Number((closeMatches.rows[0] as any)?.close_match_rate ?? 0),
    };
  }, empty);
}
