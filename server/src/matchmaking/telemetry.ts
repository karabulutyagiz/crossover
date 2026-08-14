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
      rematchRate: offered ? accepted / offered : 0,
      closeMatchRate: Number((closeMatches.rows[0] as any)?.close_match_rate ?? 0),
    };
  }, empty);
}
