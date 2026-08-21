import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';
import type { BotProfile } from './botProfiles.ts';

export function botProfileSnapshot(profile: BotProfile): Record<string, unknown> {
  return {
    botId: profile.id,
    botName: profile.displayName,
    archetype: profile.behaviorArchetype,
    difficulty: profile.difficulty,
    skillRating: profile.skillRating,
    skillMean: profile.skillMean,
    skillUncertainty: profile.skillUncertainty,
    trophyRating: profile.trophyRating,
    arena: profile.arena.name,
    footballKnowledge: profile.footballKnowledge,
    knowledgeDepth: profile.knowledgeDepth,
    recallConsistency: profile.recallConsistency,
    reactionSpeed: profile.reactionSpeed,
    inputSpeed: profile.inputSpeed,
    pressureHandling: profile.pressureHandling,
    answerConfidence: profile.answerConfidence,
    questionDepthTolerance: profile.questionDepthTolerance,
    consistency: profile.consistency,
    confidence: profile.confidence,
    riskTolerance: profile.riskTolerance,
    easyAccuracy: profile.easyAccuracy,
    mediumAccuracy: profile.mediumAccuracy,
    hardAccuracy: profile.hardAccuracy,
    answerAccuracy: profile.answerAccuracy,
    mistakeProbability: profile.mistakeProbability,
    timeoutProbability: profile.timeoutProbability,
    hesitationProbability: profile.hesitationProbability,
    participationRate: profile.participationRate,
    responseMedianMs: profile.responseMedianMs,
    responseVarianceMs: profile.responseVarianceMs,
    preferredDecisionDelay: profile.preferredDecisionDelay,
    reactionSpeedProfile: profile.reactionSpeedProfile,
    favoriteKnowledgeDomains: profile.favoriteKnowledgeDomains,
    weakKnowledgeDomains: profile.weakKnowledgeDomains,
    director: profile.difficultyDirector,
  };
}

export function recordBotMatchProfile(args: {
  matchId: string;
  roomCode: string;
  userId?: string | null;
  gameMode: string;
  playerTrophies: number;
  playerSkillMean?: number | null;
  playerSkillUncertainty?: number | null;
  playerMatchesPlayed?: number | null;
  profile: BotProfile;
  queueDurationMs: number;
  queueHealth?: Record<string, unknown> | null;
  pressureProfile?: Record<string, unknown> | null;
  economyState?: string | null;
}): void {
  const director = args.profile.difficultyDirector;
  pool.query(
    `INSERT INTO bot_match_profiles
       (match_id, room_code, user_id, bot_id, bot_name, algorithm_version, balance_version, rollout_variant,
        segment, game_mode, player_trophies, player_skill_mean, player_skill_uncertainty, player_matches_played,
        target_win_probability, estimated_player_win_probability, target_bot_skill, target_skill_mean,
        selected_bot_skill, selected_bot_skill_mean, bot_difficulty, bot_archetype,
        knowledge_depth, recall_consistency, reaction_speed, input_speed, pressure_handling, answer_confidence,
        question_depth_tolerance, mistake_probability, timeout_probability, participation_rate,
        response_median_ms, response_variance_ms, frustration_risk, dominance_score, intentional_loss_risk,
        progression_adjustment_mmr, form_adjustment_mmr, recovery_adjustment_mmr, dominance_adjustment_mmr,
        pressure_adjustment_mmr, smoothing_adjustment_mmr, liveops_adjustment_mmr,
        queue_duration_ms, queue_health, pressure_profile, economy_state, profile_snapshot, director_snapshot)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32,
        $33, $34, $35, $36, $37,
        $38, $39, $40, $41,
        $42, $43, $44,
        $45, $46::jsonb, $47::jsonb, $48, $49::jsonb, $50::jsonb)
     ON CONFLICT (match_id) DO UPDATE SET
       profile_snapshot = EXCLUDED.profile_snapshot,
       director_snapshot = EXCLUDED.director_snapshot,
       created_at = now()`,
    [
      args.matchId,
      args.roomCode,
      args.userId ?? null,
      args.profile.id,
      args.profile.displayName,
      director?.algorithmVersion ?? 'legacy',
      director?.balanceVersion ?? 'legacy',
      director?.rolloutVariant ?? 'control',
      director?.segment ?? null,
      args.gameMode,
      args.playerTrophies,
      args.playerSkillMean ?? null,
      args.playerSkillUncertainty ?? null,
      args.playerMatchesPlayed ?? null,
      director?.targetWinProbability ?? null,
      director?.estimatedPlayerWinProbability ?? null,
      director?.targetBotSkill ?? null,
      director?.targetSkillMean ?? null,
      args.profile.skillRating,
      args.profile.skillMean,
      args.profile.difficulty,
      args.profile.behaviorArchetype,
      args.profile.knowledgeDepth,
      args.profile.recallConsistency,
      args.profile.reactionSpeed,
      args.profile.inputSpeed,
      args.profile.pressureHandling,
      args.profile.answerConfidence,
      args.profile.questionDepthTolerance,
      args.profile.mistakeProbability,
      args.profile.timeoutProbability,
      args.profile.participationRate,
      args.profile.responseMedianMs,
      args.profile.responseVarianceMs,
      director?.frustrationRisk ?? null,
      director?.dominanceScore ?? null,
      director?.intentionalLossRisk ?? null,
      director?.progressionAdjustmentMmr ?? null,
      director?.formAdjustmentMmr ?? null,
      director?.recoveryAdjustmentMmr ?? null,
      director?.dominanceAdjustmentMmr ?? null,
      director?.pressureAdjustmentMmr ?? null,
      director?.smoothingAdjustmentMmr ?? null,
      director?.liveOpsAdjustmentMmr ?? null,
      args.queueDurationMs,
      JSON.stringify(args.queueHealth ?? {}),
      JSON.stringify(args.pressureProfile ?? {}),
      args.economyState ?? null,
      JSON.stringify(botProfileSnapshot(args.profile)),
      JSON.stringify(director ?? {}),
    ],
  ).catch((err) => {
    const code = (err as { code?: string }).code;
    if (code !== '42P01' && code !== '42703') {
      log.warn('bot_match_profile_write_failed', { matchId: args.matchId, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

export function recordBotRoundOutcome(args: {
  matchId: string;
  roomCode: string;
  roundNumber: number;
  gameMode: string;
  questionKey?: string | null;
  questionDifficulty?: number | null;
  answerPopularity?: number | null;
  validAnswerCount?: number | null;
  botId?: string | null;
  botSkill?: number | null;
  botSkillMean?: number | null;
  decision?: Record<string, unknown> | null;
  answeredByBot: boolean;
  answeredByHuman: boolean;
  correct: boolean;
  reason: string;
  responseTimeMs?: number | null;
  score?: Record<string, unknown>;
}): void {
  pool.query(
    `INSERT INTO bot_round_outcomes
       (match_id, room_code, round_number, game_mode, question_key, question_difficulty,
        answer_popularity, valid_answer_count, bot_id, bot_skill, bot_skill_mean,
        cognitive_state, knows_answer, will_answer, should_mistake, should_timeout,
        reaction_delay_ms, knows_probability, wrong_association_probability, timeout_probability,
        participation_probability, answered_by_bot, answered_by_human, correct, reason,
        response_time_ms, score)
     VALUES
       ($1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24, $25,
        $26, $27::jsonb)
     ON CONFLICT (match_id, round_number) DO UPDATE SET
       cognitive_state = EXCLUDED.cognitive_state,
       knows_answer = EXCLUDED.knows_answer,
       will_answer = EXCLUDED.will_answer,
       should_mistake = EXCLUDED.should_mistake,
       should_timeout = EXCLUDED.should_timeout,
       reaction_delay_ms = EXCLUDED.reaction_delay_ms,
       answered_by_bot = EXCLUDED.answered_by_bot,
       answered_by_human = EXCLUDED.answered_by_human,
       correct = EXCLUDED.correct,
       reason = EXCLUDED.reason,
       response_time_ms = EXCLUDED.response_time_ms,
       score = EXCLUDED.score`,
    [
      args.matchId,
      args.roomCode,
      args.roundNumber,
      args.gameMode,
      args.questionKey ?? null,
      args.questionDifficulty ?? null,
      args.answerPopularity ?? null,
      args.validAnswerCount ?? null,
      args.botId ?? null,
      args.botSkill ?? null,
      args.botSkillMean ?? null,
      stringValue(args.decision?.cognitiveState),
      boolValue(args.decision?.knowsAnswer),
      boolValue(args.decision?.willAnswer),
      boolValue(args.decision?.shouldMistake),
      boolValue(args.decision?.shouldTimeout),
      numberValue(args.decision?.reactionDelayMs),
      numberValue(args.decision?.knowsProbability),
      numberValue(args.decision?.wrongAssociationProbability),
      numberValue(args.decision?.timeoutProbability),
      numberValue(args.decision?.participationProbability),
      args.answeredByBot,
      args.answeredByHuman,
      args.correct,
      args.reason,
      args.responseTimeMs ?? null,
      JSON.stringify(args.score ?? {}),
    ],
  ).catch((err) => {
    const code = (err as { code?: string }).code;
    if (code !== '42P01' && code !== '42703') {
      log.warn('bot_round_outcome_write_failed', { matchId: args.matchId, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function boolValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
