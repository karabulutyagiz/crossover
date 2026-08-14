import { pool } from '../db/pool.ts';
import { opponentConfig } from './opponentConfig.ts';
import { clamp } from './random.ts';

export interface SkillProfile {
  userId: string;
  skillMean: number;
  skillUncertainty: number;
  matchesPlayed: number;
  recentMatches: SkillRecentMatch[];
  overallAccuracy: number;
  medianCorrectResponseTimeMs: number | null;
  responseTimeVariance: number;
  easyQuestionAccuracy: number;
  mediumQuestionAccuracy: number;
  hardQuestionAccuracy: number;
  famousPlayerAccuracy: number;
  obscurePlayerAccuracy: number;
  clubKnowledge: number;
  nationalTeamKnowledge: number;
  leagueKnowledge: number;
  fastAnswerRate: number;
  timeoutRate: number;
  mistakeRate: number;
  currentForm: number;
  updatedAt?: string;
}

export interface SkillRecentMatch {
  at: string;
  opponentType: 'HUMAN' | 'BOT';
  opponentSkillMean: number;
  won: boolean;
  expected: number;
  scoreFor: number;
  scoreAgainst: number;
  accuracy: number;
  medianResponseTimeMs: number | null;
  skillDelta: number;
}

export interface SkillRoundSignal {
  difficultyScore: number;
  correct: boolean;
  answered: boolean;
  responseTimeMs: number | null;
  timedOut: boolean;
  mistake: boolean;
  mode: string;
  answerPopularity?: number;
}

export interface SkillMatchSignal {
  opponentType: 'HUMAN' | 'BOT';
  opponentSkillMean: number;
  opponentSkillUncertainty?: number;
  won: boolean;
  scoreFor: number;
  scoreAgainst: number;
  rounds: SkillRoundSignal[];
}

interface DbSkillProfile {
  user_id: string;
  skill_mean: number;
  skill_uncertainty: number;
  matches_played: number;
  recent_matches: SkillRecentMatch[] | string;
  overall_accuracy: number;
  median_correct_response_time_ms: number | null;
  response_time_variance: number;
  easy_question_accuracy: number;
  medium_question_accuracy: number;
  hard_question_accuracy: number;
  famous_player_accuracy: number;
  obscure_player_accuracy: number;
  club_knowledge: number;
  national_team_knowledge: number;
  league_knowledge: number;
  fast_answer_rate: number;
  timeout_rate: number;
  mistake_rate: number;
  current_form: number;
  updated_at: string;
}

export function expectedScore(
  playerSkillMean: number,
  opponentSkillMean: number,
  playerSkillUncertainty = 120,
  opponentSkillUncertainty = 120,
): number {
  const uncertaintyScale = Math.sqrt(playerSkillUncertainty ** 2 + opponentSkillUncertainty ** 2) * 0.32;
  const scale = Math.max(220, 300 + uncertaintyScale);
  return clamp(1 / (1 + Math.exp(-(playerSkillMean - opponentSkillMean) / scale)), 0.02, 0.98);
}

export function defaultSkillProfile(userId: string, trophies = 0): SkillProfile {
  // Visible trophies are only a loose prior for existing accounts. Uncertainty stays high
  // until actual gameplay signals arrive, so trophies never become hidden skill by proxy.
  const trophyPrior = clamp(Math.sqrt(Math.max(0, trophies)) * 5.2, 0, 420);
  return {
    userId,
    skillMean: Math.round(1000 + trophyPrior),
    skillUncertainty: opponentConfig().skillUncertaintyMax,
    matchesPlayed: 0,
    recentMatches: [],
    overallAccuracy: 0.5,
    medianCorrectResponseTimeMs: null,
    responseTimeVariance: 0,
    easyQuestionAccuracy: 0.5,
    mediumQuestionAccuracy: 0.5,
    hardQuestionAccuracy: 0.5,
    famousPlayerAccuracy: 0.5,
    obscurePlayerAccuracy: 0.5,
    clubKnowledge: 0.5,
    nationalTeamKnowledge: 0.5,
    leagueKnowledge: 0.5,
    fastAnswerRate: 0,
    timeoutRate: 0,
    mistakeRate: 0,
    currentForm: 0,
  };
}

export async function getOrCreateSkillProfile(userId: string, trophies = 0): Promise<SkillProfile> {
  const fallback = defaultSkillProfile(userId, trophies);
  try {
    const inserted = await pool.query<DbSkillProfile>(
      `INSERT INTO player_skill_profiles (user_id, skill_mean, skill_uncertainty)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [userId, fallback.skillMean, fallback.skillUncertainty],
    );
    if (inserted.rows[0]) return toSkillProfile(inserted.rows[0]);
    const { rows } = await pool.query<DbSkillProfile>(`SELECT * FROM player_skill_profiles WHERE user_id = $1`, [userId]);
    return rows[0] ? toSkillProfile(rows[0]) : fallback;
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return fallback;
    throw err;
  }
}

export async function updateSkillAfterMatch(userId: string, trophies: number, signal: SkillMatchSignal): Promise<SkillProfile> {
  const cfg = opponentConfig();
  const current = await getOrCreateSkillProfile(userId, trophies);
  const expected = expectedScore(
    current.skillMean,
    signal.opponentSkillMean,
    current.skillUncertainty,
    signal.opponentSkillUncertainty ?? 120,
  );
  const rounds = signal.rounds.filter((r) => r.difficultyScore >= 0);
  const answered = rounds.filter((r) => r.answered);
  const correct = rounds.filter((r) => r.correct);
  const accuracy = rounds.length ? correct.length / rounds.length : (signal.won ? 0.58 : 0.42);
  const responseTimes = correct.map((r) => r.responseTimeMs).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  const medianResponse = median(responseTimes);
  const speedScore = medianResponse == null ? 0.5 : clamp((7500 - medianResponse) / 6500, 0, 1);
  const margin = signal.scoreFor + signal.scoreAgainst > 0
    ? (signal.scoreFor - signal.scoreAgainst) / Math.max(1, signal.scoreFor + signal.scoreAgainst)
    : 0;
  const closeLoss = !signal.won && signal.scoreAgainst - signal.scoreFor <= 1;
  const blowout = Math.abs(signal.scoreFor - signal.scoreAgainst) >= 3;
  const resultEvidence = signal.won ? 1 : closeLoss ? 0.42 : 0;
  const performance = clamp(
    resultEvidence * 0.62
      + accuracy * 0.22
      + speedScore * 0.08
      + clamp(0.5 + margin * 0.5, 0, 1) * 0.08,
    0,
    1,
  );
  const uncertaintyBoost = clamp(current.skillUncertainty / 210, 0.70, 1.85);
  const blowoutBoost = blowout ? 1.18 : 1;
  const delta = clamp(
    cfg.skillUpdateK * uncertaintyBoost * blowoutBoost * (performance - expected),
    -72,
    72,
  );
  const nextMean = Math.round(clamp(current.skillMean + delta, 100, 2400));
  const surprise = Math.abs((signal.won ? 1 : 0) - expected);
  const nextSigma = Math.round(clamp(
    current.skillUncertainty * cfg.skillUncertaintyDecay - 5 + surprise * 8,
    cfg.skillUncertaintyMin,
    cfg.skillUncertaintyMax,
  ));
  const recent: SkillRecentMatch = {
    at: new Date().toISOString(),
    opponentType: signal.opponentType,
    opponentSkillMean: Math.round(signal.opponentSkillMean),
    won: signal.won,
    expected: Number(expected.toFixed(4)),
    scoreFor: signal.scoreFor,
    scoreAgainst: signal.scoreAgainst,
    accuracy: Number(accuracy.toFixed(4)),
    medianResponseTimeMs: medianResponse,
    skillDelta: Number(delta.toFixed(3)),
  };
  const recentMatches = [recent, ...current.recentMatches].slice(0, 30);
  const nextMatchesPlayed = current.matchesPlayed + 1;
  const weight = Math.min(1, rounds.length / 5) * Math.min(1, 4 / Math.sqrt(Math.max(4, nextMatchesPlayed)));
  const overallAccuracy = ewma(current.overallAccuracy, accuracy, weight);
  const timeoutRate = ewma(current.timeoutRate, ratio(rounds, (r) => r.timedOut), weight);
  const mistakeRate = ewma(current.mistakeRate, ratio(rounds, (r) => r.mistake), weight);
  const fastAnswerRate = ewma(current.fastAnswerRate, ratio(answered, (r) => (r.responseTimeMs ?? Infinity) <= 2500), weight);
  const easyAccuracy = ewma(current.easyQuestionAccuracy, ratio(rounds.filter((r) => r.difficultyScore < 0.34), (r) => r.correct), weight);
  const mediumAccuracy = ewma(current.mediumQuestionAccuracy, ratio(rounds.filter((r) => r.difficultyScore >= 0.34 && r.difficultyScore < 0.72), (r) => r.correct), weight);
  const hardAccuracy = ewma(current.hardQuestionAccuracy, ratio(rounds.filter((r) => r.difficultyScore >= 0.72), (r) => r.correct), weight);
  const famousAccuracy = ewma(current.famousPlayerAccuracy, ratio(rounds.filter((r) => (r.answerPopularity ?? 0) >= 0.55), (r) => r.correct), weight);
  const obscureAccuracy = ewma(current.obscurePlayerAccuracy, ratio(rounds.filter((r) => (r.answerPopularity ?? 0) < 0.35), (r) => r.correct), weight);
  const clubKnowledge = ewma(current.clubKnowledge, ratio(rounds.filter((r) => r.mode === 'team-team' || r.mode === 'player-player'), (r) => r.correct), weight);
  const nationalKnowledge = ewma(current.nationalTeamKnowledge, ratio(rounds.filter((r) => r.mode === 'country-team'), (r) => r.correct), weight);
  const leagueKnowledge = ewma(current.leagueKnowledge, ratio(rounds.filter((r) => r.mode === 'letter-team'), (r) => r.correct), weight);
  const variance = responseTimes.length >= 2 ? sampleVariance(responseTimes) : current.responseTimeVariance;
  const currentForm = clamp(recentMatches.slice(0, 10).reduce((sum, m) => sum + (m.won ? 1 : 0), 0) / Math.max(1, Math.min(10, recentMatches.length)) - 0.5, -0.5, 0.5);

  try {
    const { rows } = await pool.query<DbSkillProfile>(
      `UPDATE player_skill_profiles SET
         skill_mean = $2,
         skill_uncertainty = $3,
         matches_played = $4,
         recent_matches = $5::jsonb,
         overall_accuracy = $6,
         median_correct_response_time_ms = $7,
         response_time_variance = $8,
         easy_question_accuracy = $9,
         medium_question_accuracy = $10,
         hard_question_accuracy = $11,
         famous_player_accuracy = $12,
         obscure_player_accuracy = $13,
         club_knowledge = $14,
         national_team_knowledge = $15,
         league_knowledge = $16,
         fast_answer_rate = $17,
         timeout_rate = $18,
         mistake_rate = $19,
         current_form = $20,
         updated_at = now()
       WHERE user_id = $1
       RETURNING *`,
      [
        userId, nextMean, nextSigma, nextMatchesPlayed, JSON.stringify(recentMatches),
        overallAccuracy, medianResponse ?? current.medianCorrectResponseTimeMs, variance,
        easyAccuracy, mediumAccuracy, hardAccuracy, famousAccuracy, obscureAccuracy,
        clubKnowledge, nationalKnowledge, leagueKnowledge, fastAnswerRate, timeoutRate,
        mistakeRate, currentForm,
      ],
    );
    return rows[0] ? toSkillProfile(rows[0]) : { ...current, skillMean: nextMean, skillUncertainty: nextSigma };
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return { ...current, skillMean: nextMean, skillUncertainty: nextSigma };
    throw err;
  }
}

export async function adjustSkillForDebug(userId: string, action: 'reset' | 'increase' | 'decrease' | 'increase_uncertainty'): Promise<void> {
  if (action === 'reset') {
    await pool.query(`DELETE FROM player_skill_profiles WHERE user_id = $1`, [userId]);
  } else if (action === 'increase') {
    await pool.query(`UPDATE player_skill_profiles SET skill_mean = skill_mean + 80, updated_at = now() WHERE user_id = $1`, [userId]);
  } else if (action === 'decrease') {
    await pool.query(`UPDATE player_skill_profiles SET skill_mean = GREATEST(100, skill_mean - 80), updated_at = now() WHERE user_id = $1`, [userId]);
  } else {
    await pool.query(`UPDATE player_skill_profiles SET skill_uncertainty = LEAST($2, skill_uncertainty + 80), updated_at = now() WHERE user_id = $1`, [userId, opponentConfig().skillUncertaintyMax]);
  }
}

function toSkillProfile(row: DbSkillProfile): SkillProfile {
  const recent = typeof row.recent_matches === 'string' ? JSON.parse(row.recent_matches) : row.recent_matches;
  return {
    userId: row.user_id,
    skillMean: Number(row.skill_mean),
    skillUncertainty: Number(row.skill_uncertainty),
    matchesPlayed: Number(row.matches_played),
    recentMatches: Array.isArray(recent) ? recent : [],
    overallAccuracy: Number(row.overall_accuracy),
    medianCorrectResponseTimeMs: row.median_correct_response_time_ms == null ? null : Number(row.median_correct_response_time_ms),
    responseTimeVariance: Number(row.response_time_variance),
    easyQuestionAccuracy: Number(row.easy_question_accuracy),
    mediumQuestionAccuracy: Number(row.medium_question_accuracy),
    hardQuestionAccuracy: Number(row.hard_question_accuracy),
    famousPlayerAccuracy: Number(row.famous_player_accuracy),
    obscurePlayerAccuracy: Number(row.obscure_player_accuracy),
    clubKnowledge: Number(row.club_knowledge),
    nationalTeamKnowledge: Number(row.national_team_knowledge),
    leagueKnowledge: Number(row.league_knowledge),
    fastAnswerRate: Number(row.fast_answer_rate),
    timeoutRate: Number(row.timeout_rate),
    mistakeRate: Number(row.mistake_rate),
    currentForm: Number(row.current_form),
    updatedAt: row.updated_at,
  };
}

function ewma(current: number, value: number | null, weight: number): number {
  if (value == null || !Number.isFinite(value)) return current;
  return Number(clamp(current * (1 - weight) + value * weight, 0, 1).toFixed(4));
}

function ratio<T>(items: T[], pred: (item: T) => boolean): number | null {
  if (!items.length) return null;
  return items.filter(pred).length / items.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return Math.round(sorted[mid]!);
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1));
}
