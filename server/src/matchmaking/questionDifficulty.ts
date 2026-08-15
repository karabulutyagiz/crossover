import { pool } from '../db/pool.ts';
import { countryTeamAnswerStats } from '../game/verify.ts';
import type { GameMode } from '../protocol.ts';
import { opponentConfig } from './opponentConfig.ts';
import { clamp } from './random.ts';

export interface QuestionDifficultyEstimate {
  questionKey: string;
  gameMode: GameMode;
  teamAId: number | null;
  teamBId: number | null;
  extraKey: string | null;
  heuristicDifficulty: number;
  difficultyScore: number;
  validAnswerCount: number;
  answerPopularity: number;
  humanAttempts: number;
}

interface QuestionStatsRow {
  question_key: string;
  game_mode: GameMode;
  team_a_id: string | null;
  team_b_id: string | null;
  extra_key: string | null;
  heuristic_difficulty: number;
  difficulty_score: number;
  human_attempts: number;
  valid_answer_count: number;
  answer_popularity: number;
}

export function difficultyBucket(score: number): 'easy' | 'medium' | 'hard' {
  if (score < 0.34) return 'easy';
  if (score < 0.72) return 'medium';
  return 'hard';
}

export function makeQuestionKey(mode: GameMode, teamAId: number, teamBId: number, extra?: string | null): string {
  if (mode === 'team-team' || mode === 'player-player') {
    const a = Math.min(teamAId, teamBId);
    const b = Math.max(teamAId, teamBId);
    return `${mode}:${a}:${b}`;
  }
  return `${mode}:${teamAId}:${teamBId}:${(extra ?? '').trim().toLowerCase()}`;
}

export async function getQuestionDifficulty(
  mode: GameMode,
  teamAId: number,
  teamBId: number,
  extra?: string | null,
): Promise<QuestionDifficultyEstimate> {
  const questionKey = makeQuestionKey(mode, teamAId, teamBId, extra);
  const heuristic = await heuristicDifficulty(mode, teamAId, teamBId, extra);
  try {
    const { rows } = await pool.query<QuestionStatsRow>(
      `INSERT INTO question_difficulty_stats
         (question_key, game_mode, team_a_id, team_b_id, extra_key, heuristic_difficulty, difficulty_score, valid_answer_count, answer_popularity, last_played_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, now())
       ON CONFLICT (question_key) DO UPDATE SET
         heuristic_difficulty = EXCLUDED.heuristic_difficulty,
         difficulty_score = CASE
           WHEN question_difficulty_stats.human_attempts >= $9 THEN question_difficulty_stats.difficulty_score
           ELSE EXCLUDED.heuristic_difficulty
         END,
         valid_answer_count = EXCLUDED.valid_answer_count,
         answer_popularity = EXCLUDED.answer_popularity,
         last_played_at = now(),
         updated_at = now()
       RETURNING question_key, game_mode, team_a_id, team_b_id, extra_key, heuristic_difficulty, difficulty_score, human_attempts, valid_answer_count, answer_popularity`,
      [
        questionKey, mode, nullableId(teamAId), nullableId(teamBId), extra ?? null,
        heuristic.heuristicDifficulty, heuristic.validAnswerCount, heuristic.answerPopularity,
        opponentConfig().humanTelemetryWeightMinPlays,
      ],
    );
    return toEstimate(rows[0], heuristic, questionKey, mode, teamAId, teamBId, extra ?? null);
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
    return {
      questionKey,
      gameMode: mode,
      teamAId,
      teamBId,
      extraKey: extra ?? null,
      heuristicDifficulty: heuristic.heuristicDifficulty,
      difficultyScore: heuristic.heuristicDifficulty,
      validAnswerCount: heuristic.validAnswerCount,
      answerPopularity: heuristic.answerPopularity,
      humanAttempts: 0,
    };
  }
}

export async function recordQuestionOutcome(args: {
  questionKey: string;
  mode: GameMode;
  teamAId: number | null;
  teamBId: number | null;
  extraKey: string | null;
  opponentType: 'HUMAN' | 'BOT';
  answered: boolean;
  correct: boolean;
  timedOut: boolean;
  responseTimeMs: number | null;
  playerSkillMean?: number | null;
}): Promise<void> {
  try {
    const responseTime = args.responseTimeMs != null && Number.isFinite(args.responseTimeMs)
      ? Math.max(0, Math.round(args.responseTimeMs))
      : null;
    await pool.query(
      `INSERT INTO question_difficulty_stats
         (question_key, game_mode, team_a_id, team_b_id, extra_key, total_attempts, human_attempts, human_correct, human_timeouts,
          bot_attempts, bot_correct, response_time_samples, response_time_sum_ms, response_time_sum_sq_ms, last_played_at)
       VALUES ($1, $2, $3, $4, $5,
          1,
          CASE WHEN $6 = 'HUMAN' THEN 1 ELSE 0 END,
          CASE WHEN $6 = 'HUMAN' AND $7 THEN 1 ELSE 0 END,
          CASE WHEN $6 = 'HUMAN' AND $8 THEN 1 ELSE 0 END,
          CASE WHEN $6 = 'BOT' THEN 1 ELSE 0 END,
          CASE WHEN $6 = 'BOT' AND $7 THEN 1 ELSE 0 END,
          CASE WHEN $9::int IS NULL THEN 0 ELSE 1 END,
          COALESCE($9::int, 0),
          CASE WHEN $9::int IS NULL THEN 0 ELSE ($9::int * $9::int)::double precision END,
          now())
       ON CONFLICT (question_key) DO UPDATE SET
         total_attempts = question_difficulty_stats.total_attempts + 1,
         human_attempts = question_difficulty_stats.human_attempts + CASE WHEN $6 = 'HUMAN' THEN 1 ELSE 0 END,
         human_correct = question_difficulty_stats.human_correct + CASE WHEN $6 = 'HUMAN' AND $7 THEN 1 ELSE 0 END,
         human_timeouts = question_difficulty_stats.human_timeouts + CASE WHEN $6 = 'HUMAN' AND $8 THEN 1 ELSE 0 END,
         bot_attempts = question_difficulty_stats.bot_attempts + CASE WHEN $6 = 'BOT' THEN 1 ELSE 0 END,
         bot_correct = question_difficulty_stats.bot_correct + CASE WHEN $6 = 'BOT' AND $7 THEN 1 ELSE 0 END,
         response_time_samples = question_difficulty_stats.response_time_samples + CASE WHEN $9::int IS NULL THEN 0 ELSE 1 END,
         response_time_sum_ms = question_difficulty_stats.response_time_sum_ms + COALESCE($9::int, 0),
         response_time_sum_sq_ms = question_difficulty_stats.response_time_sum_sq_ms + CASE WHEN $9::int IS NULL THEN 0 ELSE ($9::int * $9::int)::double precision END,
         difficulty_score = CASE
           WHEN question_difficulty_stats.human_attempts + CASE WHEN $6 = 'HUMAN' THEN 1 ELSE 0 END < $10 THEN question_difficulty_stats.heuristic_difficulty
           ELSE LEAST(1, GREATEST(0,
             question_difficulty_stats.heuristic_difficulty * GREATEST(0, 1 - LEAST(1, (question_difficulty_stats.human_attempts + CASE WHEN $6 = 'HUMAN' THEN 1 ELSE 0 END)::double precision / $11))
             + (
               (1 - ((question_difficulty_stats.human_correct + CASE WHEN $6 = 'HUMAN' AND $7 THEN 1 ELSE 0 END)::double precision
                    / GREATEST(1, question_difficulty_stats.human_attempts + CASE WHEN $6 = 'HUMAN' THEN 1 ELSE 0 END))) * 0.58
               + (((question_difficulty_stats.human_timeouts + CASE WHEN $6 = 'HUMAN' AND $8 THEN 1 ELSE 0 END)::double precision)
                    / GREATEST(1, question_difficulty_stats.human_attempts + CASE WHEN $6 = 'HUMAN' THEN 1 ELSE 0 END)) * 0.24
               + LEAST(1, GREATEST(0, ((question_difficulty_stats.response_time_sum_ms + COALESCE($9::int, 0))::double precision
                    / GREATEST(1, question_difficulty_stats.response_time_samples + CASE WHEN $9::int IS NULL THEN 0 ELSE 1 END) - 2200) / 7800)) * 0.18
             ) * LEAST(1, (question_difficulty_stats.human_attempts + CASE WHEN $6 = 'HUMAN' THEN 1 ELSE 0 END)::double precision / $11)
           ))
         END,
         last_played_at = now(),
         updated_at = now()`,
      [
        args.questionKey, args.mode, args.teamAId, args.teamBId, args.extraKey,
        args.opponentType, args.correct, args.timedOut, responseTime,
        opponentConfig().humanTelemetryWeightMinPlays,
        opponentConfig().humanTelemetryWeightFullPlays,
      ],
    );
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
  }
}

async function heuristicDifficulty(mode: GameMode, teamAId: number, teamBId: number, extra?: string | null): Promise<{ heuristicDifficulty: number; validAnswerCount: number; answerPopularity: number }> {
  if (mode === 'team-team') return teamTeamHeuristic(teamAId, teamBId);
  if (mode === 'player-player') return playerPlayerHeuristic(teamAId, teamBId);
  if (mode === 'country-team') return countryTeamHeuristic(teamBId, extra ?? '');
  return letterTeamHeuristic(teamBId, extra ?? '');
}

async function teamTeamHeuristic(teamAId: number, teamBId: number): Promise<{ heuristicDifficulty: number; validAnswerCount: number; answerPopularity: number }> {
  const { rows } = await pool.query<{ count: string; fame: string }>(
    `WITH answers AS (
       SELECT p.id,
              MAX(GREATEST(COALESCE(c.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc.club_id))) AS fame
         FROM players p
         JOIN player_clubs a ON a.player_id = p.id AND a.club_id = $1
         JOIN player_clubs b ON b.player_id = p.id AND b.club_id = $2
         JOIN player_clubs pc ON pc.player_id = p.id
         JOIN clubs c ON c.id = pc.club_id
        GROUP BY p.id
     )
     SELECT count(*) AS count, COALESCE(MAX(fame), 0) AS fame FROM answers`,
    [teamAId, teamBId],
  );
  return fromCountAndFame(Number(rows[0]?.count ?? 0), Number(rows[0]?.fame ?? 0));
}

async function playerPlayerHeuristic(playerAId: number, playerBId: number): Promise<{ heuristicDifficulty: number; validAnswerCount: number; answerPopularity: number }> {
  const { rows } = await pool.query<{ count: string; fame: string }>(
    `SELECT count(*) AS count, COALESCE(MAX(COALESCE(c.popularity, 0)), 0) AS fame
       FROM clubs c
      WHERE c.is_national = false
        AND EXISTS (SELECT 1 FROM player_clubs WHERE player_id = $1 AND club_id = c.id)
        AND EXISTS (SELECT 1 FROM player_clubs WHERE player_id = $2 AND club_id = c.id)`,
    [playerAId, playerBId],
  );
  return fromCountAndFame(Number(rows[0]?.count ?? 0), Number(rows[0]?.fame ?? 0));
}

async function countryTeamHeuristic(clubId: number, country: string): Promise<{ heuristicDifficulty: number; validAnswerCount: number; answerPopularity: number }> {
  const stats = await countryTeamAnswerStats(clubId, country);
  return fromCountAndFame(stats.count, stats.fame);
}

async function letterTeamHeuristic(clubId: number, letter: string): Promise<{ heuristicDifficulty: number; validAnswerCount: number; answerPopularity: number }> {
  const prefix = letter.trim().toLowerCase().slice(0, 1);
  const { rows } = await pool.query<{ count: string; fame: string }>(
    `SELECT count(DISTINCT p.id) AS count,
            COALESCE(MAX(GREATEST(COALESCE(c.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       JOIN player_clubs pc2 ON pc2.player_id = p.id
       JOIN clubs c ON c.id = pc2.club_id
      WHERE p.name_norm LIKE $2 || '%' OR p.name_norm LIKE '% ' || $2 || '%'`,
    [clubId, prefix],
  );
  return fromCountAndFame(Number(rows[0]?.count ?? 0), Number(rows[0]?.fame ?? 0));
}

function fromCountAndFame(count: number, fame: number): { heuristicDifficulty: number; validAnswerCount: number; answerPopularity: number } {
  const abundanceEase = clamp(Math.log1p(count) / Math.log(9), 0, 1);
  const popularity = clamp(Math.log10(Math.max(1, fame)) / 9.5, 0, 1);
  const ease = abundanceEase * 0.56 + popularity * 0.44;
  const noAnswerPenalty = count <= 0 ? 0.12 : 0;
  return {
    heuristicDifficulty: Number(clamp(1 - ease + noAnswerPenalty, 0.03, 0.98).toFixed(4)),
    validAnswerCount: Math.max(0, Math.round(count)),
    answerPopularity: Number(popularity.toFixed(4)),
  };
}

function nullableId(id: number): number | null {
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toEstimate(
  row: QuestionStatsRow | undefined,
  heuristic: { heuristicDifficulty: number; validAnswerCount: number; answerPopularity: number },
  questionKey: string,
  mode: GameMode,
  teamAId: number,
  teamBId: number,
  extra: string | null,
): QuestionDifficultyEstimate {
  if (!row) {
    return {
      questionKey,
      gameMode: mode,
      teamAId,
      teamBId,
      extraKey: extra,
      heuristicDifficulty: heuristic.heuristicDifficulty,
      difficultyScore: heuristic.heuristicDifficulty,
      validAnswerCount: heuristic.validAnswerCount,
      answerPopularity: heuristic.answerPopularity,
      humanAttempts: 0,
    };
  }
  return {
    questionKey: row.question_key,
    gameMode: row.game_mode,
    teamAId: row.team_a_id == null ? null : Number(row.team_a_id),
    teamBId: row.team_b_id == null ? null : Number(row.team_b_id),
    extraKey: row.extra_key,
    heuristicDifficulty: Number(row.heuristic_difficulty),
    difficultyScore: Number(row.difficulty_score),
    validAnswerCount: Number(row.valid_answer_count),
    answerPopularity: Number(row.answer_popularity),
    humanAttempts: Number(row.human_attempts),
  };
}
