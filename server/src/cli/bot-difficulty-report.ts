import { closePool, pool } from '../db/pool.ts';

type Period = 'before' | 'after';

interface MetricRow {
  period: Period;
  [key: string]: unknown;
}

const updateAtRaw = process.env.BOT_UPDATE_AT ?? process.env.BOT_DIFFICULTY_UPDATE_AT;
const windowDays = Number(process.env.BOT_REPORT_WINDOW_DAYS ?? '7');

if (!updateAtRaw) {
  console.log(JSON.stringify({
    ok: false,
    reason: 'BOT_UPDATE_AT is required for before/after attribution. Example: BOT_UPDATE_AT=2026-08-15T12:00:00Z npm run report:bot-difficulty',
    causation: 'not_assessed',
  }, null, 2));
  await closePool();
  process.exit(0);
}

const updateAt = new Date(updateAtRaw);
if (!Number.isFinite(updateAt.getTime()) || !Number.isFinite(windowDays) || windowDays <= 0) {
  console.log(JSON.stringify({ ok: false, reason: 'Invalid BOT_UPDATE_AT or BOT_REPORT_WINDOW_DAYS', causation: 'not_assessed' }, null, 2));
  await closePool();
  process.exit(0);
}

const afterStart = updateAt.toISOString();
const afterEnd = new Date(updateAt.getTime() + windowDays * 24 * 60 * 60_000).toISOString();
const beforeStart = new Date(updateAt.getTime() - windowDays * 24 * 60 * 60_000).toISOString();
const beforeEnd = afterStart;

try {
  const [matchmaking, matchOutcomes, answerTimes, sessions, lossStreaks, retention, botProfiles] = await Promise.all([
    safeQuery<MetricRow>(periodSql(`
      SELECT period,
             count(*) FILTER (WHERE event_name = 'matchmaking_started')::int AS matchmaking_started,
             count(*) FILTER (WHERE event_name IN ('human_opponent_found','bot_fallback_created'))::int AS matchmaking_completed,
             count(*) FILTER (WHERE event_name = 'bot_fallback_created')::int AS bot_fallback_created,
             count(*) FILTER (WHERE event_name = 'human_opponent_found')::int AS human_opponent_found,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE((payload->>'queueDuration')::double precision, (payload->>'searchDurationMs')::double precision, 0)) AS p50_queue_ms,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY COALESCE((payload->>'queueDuration')::double precision, (payload->>'searchDurationMs')::double precision, 0)) AS p95_queue_ms
        FROM match_telemetry, periods
       WHERE event_name IN ('matchmaking_started','human_opponent_found','bot_fallback_created')
         AND created_at >= start_at AND created_at < end_at
       GROUP BY period`)),
    safeQuery<MetricRow>(periodSql(`
      SELECT period,
             count(*)::int AS matches_finished,
             count(DISTINCT player_id)::int AS active_match_players,
             count(*)::float / NULLIF(count(DISTINCT player_id), 0) AS matches_per_active_player,
             avg(CASE WHEN opponent_type = 'BOT' THEN 1 ELSE 0 END)::float AS bot_match_rate,
             avg(CASE WHEN opponent_type = 'HUMAN' THEN 1 ELSE 0 END)::float AS human_match_rate,
             avg(CASE WHEN opponent_type = 'BOT' AND payload->>'matchResult' = 'win' THEN 1 WHEN opponent_type = 'BOT' THEN 0 END)::float AS player_win_rate_vs_bot,
             avg(CASE WHEN opponent_type = 'HUMAN' AND payload->>'matchResult' = 'win' THEN 1 WHEN opponent_type = 'HUMAN' THEN 0 END)::float AS player_win_rate_vs_human,
             avg(CASE WHEN opponent_type = 'BOT' AND COALESCE((payload->>'playerTrophies')::int, 0) < 200 AND payload->>'matchResult' = 'win' THEN 1 WHEN opponent_type = 'BOT' AND COALESCE((payload->>'playerTrophies')::int, 0) < 200 THEN 0 END)::float AS new_player_bot_win_rate,
             avg(CASE WHEN opponent_type = 'BOT' AND COALESCE((payload->>'playerTrophies')::int, 0) >= 200 AND COALESCE((payload->>'playerTrophies')::int, 0) < 500 AND payload->>'matchResult' = 'win' THEN 1 WHEN opponent_type = 'BOT' AND COALESCE((payload->>'playerTrophies')::int, 0) >= 200 AND COALESCE((payload->>'playerTrophies')::int, 0) < 500 THEN 0 END)::float AS low_trophy_bot_win_rate,
             avg(CASE WHEN ABS(COALESCE((payload->>'scoreFor')::int,0) - COALESCE((payload->>'scoreAgainst')::int,0)) >= 3 THEN 1 ELSE 0 END)::float AS blowout_rate,
             avg(CASE WHEN payload ? 'forfeitReason' THEN 1 ELSE 0 END)::float AS forfeit_or_abandon_rate,
             avg(CASE WHEN payload->>'matchResult' = 'loss' AND payload ? 'forfeitReason' THEN 1 ELSE 0 END)::float AS quit_loss_rate
        FROM match_telemetry, periods
       WHERE event_name = 'match_finished'
         AND created_at >= start_at AND created_at < end_at
       GROUP BY period`)),
    safeQuery<MetricRow>(periodSql(`
      SELECT period,
             payload->>'actorType' AS actor_type,
             COALESCE(payload->>'matchOpponentType', opponent_type) AS match_opponent_type,
             percentile_cont(0.1) WITHIN GROUP (ORDER BY (payload->>'responseTimeMs')::double precision) AS p10_response_ms,
             percentile_cont(0.25) WITHIN GROUP (ORDER BY (payload->>'responseTimeMs')::double precision) AS p25_response_ms,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY (payload->>'responseTimeMs')::double precision) AS p50_response_ms,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY (payload->>'responseTimeMs')::double precision) AS p75_response_ms,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY (payload->>'responseTimeMs')::double precision) AS p90_response_ms,
             avg(CASE WHEN payload->>'correct' = 'true' THEN 1 ELSE 0 END)::float AS accuracy
        FROM match_telemetry, periods
       WHERE event_name = 'player_answered'
         AND payload ? 'responseTimeMs'
         AND created_at >= start_at AND created_at < end_at
       GROUP BY period, actor_type, match_opponent_type`)),
    safeQuery<MetricRow>(periodSql(`
      SELECT period,
             count(*)::int AS sessions,
             avg(duration_secs)::float AS avg_session_length_sec,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_secs) AS p50_session_length_sec
        FROM play_sessions, periods
       WHERE started_at >= start_at AND started_at < end_at
       GROUP BY period`)),
    safeQuery<MetricRow>(periodSql(`
      WITH ordered AS (
        SELECT period, player_id, played_at, won,
               row_number() OVER (PARTITION BY period, player_id ORDER BY played_at) AS rn,
               row_number() OVER (PARTITION BY period, player_id, won ORDER BY played_at) AS state_rn
          FROM match_history, periods
         WHERE played_at >= start_at AND played_at < end_at AND ranked = TRUE
      ), losses AS (
        SELECT period, player_id, count(*) AS streak_len
          FROM ordered
         WHERE won = FALSE
         GROUP BY period, player_id, rn - state_rn
      )
      SELECT period,
             count(*) FILTER (WHERE streak_len >= 2)::int AS loss_streak_2_plus,
             count(*) FILTER (WHERE streak_len >= 3)::int AS loss_streak_3_plus,
             avg(streak_len)::float AS average_loss_streak
        FROM losses
       GROUP BY period`)),
    safeQuery<MetricRow>(periodSql(`
      SELECT period,
             count(*)::int AS cohort_users,
             avg(CASE WHEN last_seen >= created_at THEN 1 ELSE 0 END)::float AS d0_retention,
             avg(CASE WHEN last_seen >= created_at + interval '1 day' THEN 1 ELSE 0 END)::float AS d1_retention,
             avg(CASE WHEN last_seen >= created_at + interval '3 days' THEN 1 ELSE 0 END)::float AS d3_retention,
             avg(CASE WHEN last_seen >= created_at + interval '7 days' THEN 1 ELSE 0 END)::float AS d7_retention
        FROM users, periods
       WHERE created_at >= start_at AND created_at < end_at
       GROUP BY period`)),
    safeQuery<MetricRow>(periodSql(`
      SELECT period,
             segment,
             bot_difficulty,
             count(*)::int AS bot_matches,
             avg(selected_bot_skill)::float AS avg_selected_bot_skill,
             avg(estimated_player_win_probability)::float AS avg_estimated_player_win_probability,
             avg(frustration_risk)::float AS avg_frustration_risk,
             avg(dominance_score)::float AS avg_dominance_score,
             avg(intentional_loss_risk)::float AS avg_intentional_loss_risk,
             avg(response_median_ms)::float AS avg_bot_response_median_ms
        FROM bot_match_profiles, periods
       WHERE created_at >= start_at AND created_at < end_at
       GROUP BY period, segment, bot_difficulty`)),
  ]);

  const evidence = evidenceLevel(matchmaking.rows, matchOutcomes.rows, botProfiles.rows);
  console.log(JSON.stringify({
    ok: true,
    botUpdateAt: updateAt.toISOString(),
    before: { start: beforeStart, end: beforeEnd },
    after: { start: afterStart, end: afterEnd },
    evidence,
    causation: evidence === 'insufficient' ? 'not_claimed_insufficient_telemetry' : 'correlation_only_requires_experiment_or_confounder_review',
    metrics: {
      matchmaking: matchmaking.rows,
      matchOutcomes: matchOutcomes.rows,
      answerTimes: answerTimes.rows,
      sessions: sessions.rows,
      lossStreaks: lossStreaks.rows,
      retention: retention.rows,
      botProfiles: botProfiles.rows,
    },
    missingOrWeakSignals: missingSignals({ matchmaking: matchmaking.rows, matchOutcomes: matchOutcomes.rows, botProfiles: botProfiles.rows }),
  }, null, 2));
} catch (err) {
  console.log(JSON.stringify({
    ok: false,
    reason: err instanceof Error ? err.message : String(err),
    causation: 'not_assessed',
  }, null, 2));
  process.exitCode = 1;
} finally {
  await closePool();
}

function periodSql(inner: string): string {
  return `WITH periods(period, start_at, end_at) AS (
    VALUES ('before'::text, '${beforeStart}'::timestamptz, '${beforeEnd}'::timestamptz),
           ('after'::text, '${afterStart}'::timestamptz, '${afterEnd}'::timestamptz)
  ) ${inner}`;
}

async function safeQuery<T extends Record<string, unknown>>(sql: string): Promise<{ rows: T[]; error?: string }> {
  try {
    const result = await pool.query(sql);
    return { rows: result.rows as T[] };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42P01' || code === '42703' || code === '42883') return { rows: [], error: err instanceof Error ? err.message : String(err) };
    throw err;
  }
}

function evidenceLevel(matchmaking: MetricRow[], outcomes: MetricRow[], botProfiles: MetricRow[]): 'insufficient' | 'partial' | 'usable' {
  const mm = sumMetric(matchmaking, 'matchmaking_completed');
  const matches = sumMetric(outcomes, 'matches_finished');
  if (mm < 100 || matches < 100) return 'insufficient';
  if (botProfiles.length === 0) return 'partial';
  return 'usable';
}

function sumMetric(rows: MetricRow[], key: string): number {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

function missingSignals(args: { matchmaking: MetricRow[]; matchOutcomes: MetricRow[]; botProfiles: MetricRow[] }): string[] {
  const missing: string[] = [];
  if (!args.matchmaking.length) missing.push('matchmaking_started/completed telemetry unavailable for selected window');
  if (!args.matchOutcomes.length) missing.push('match_finished telemetry unavailable for selected window');
  if (!args.botProfiles.length) missing.push('bot_match_profiles unavailable before migration; bot profile/config causality cannot be isolated');
  missing.push('true rage_quit and next-match-within-X need explicit client/server continuation events beyond current session_exit/rematch events');
  return missing;
}
