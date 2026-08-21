import type { BotProfile, KnowledgeDomain } from './botProfiles.ts';
import { liveOpsConfig } from './liveOpsConfig.ts';
import { opponentConfig } from './opponentConfig.ts';
import { SeededRandom, chance, clamp, logNormal, mathRandom, pick, type RandomSource } from './random.ts';

export type QuestionDifficulty = 'obvious' | 'normal' | 'difficult' | 'very_difficult';
export type BotCognitiveState = 'INSTANT_RECOGNITION' | 'RECALL' | 'UNSURE' | 'WRONG_ASSOCIATION' | 'NO_ANSWER';

export interface BotQuestionContext {
  difficultyScore: number;
  answerPopularity?: number;
  domain?: KnowledgeDomain;
  botScore?: number;
  opponentScore?: number;
  previousTempoMs?: number | null;
  rng?: RandomSource;
}

export interface BotDecision {
  cognitiveState: BotCognitiveState;
  knowsAnswer: boolean;
  willAnswer: boolean;
  shouldMistake: boolean;
  shouldTimeout: boolean;
  reactionDelayMs: number;
  knowsProbability: number;
  wrongAssociationProbability: number;
  timeoutProbability: number;
  participationProbability: number;
  difficultyScore: number;
  answerPopularity: number;
}

export function difficultyScore(kind: QuestionDifficulty): number {
  if (kind === 'obvious') return 0.12;
  if (kind === 'normal') return 0.42;
  if (kind === 'difficult') return 0.72;
  return 0.92;
}

export function difficultyFromScore(score: number): QuestionDifficulty {
  if (score < 0.24) return 'obvious';
  if (score < 0.55) return 'normal';
  if (score < 0.82) return 'difficult';
  return 'very_difficult';
}

export function classifyTeamTeamQuestion(ranked: { fame: number }[]): QuestionDifficulty {
  if (!ranked.length) return 'very_difficult';
  const fameNorm = clamp((ranked[0]!.fame - 40) / 220, 0, 1);
  const abundance = clamp(ranked.length / 6, 0, 1);
  const ease = fameNorm * 0.7 + abundance * 0.3;
  return difficultyFromScore(1 - ease);
}

export function classifyAnswerList(count: number): QuestionDifficulty {
  if (count >= 5) return 'obvious';
  if (count >= 3) return 'normal';
  if (count >= 1) return 'difficult';
  return 'very_difficult';
}

export function botKnowsProbability(profile: BotProfile, context: BotQuestionContext): number {
  const live = liveOpsConfig();
  const difficulty = clamp(context.difficultyScore, 0, 1);
  const popularity = clamp(context.answerPopularity ?? 0.35, 0, 1);
  const domainFamiliarity = context.domain ? domainModifier(profile, context.domain) : 1;
  const depthFit = clamp(profile.questionDepthTolerance * (1.05 - difficulty * 0.42), 0, 1);
  const base = profile.footballKnowledge * (1 - difficulty * 0.70) + depthFit * 0.18 + popularity * (0.12 + (1 - difficulty) * 0.08);
  const accuracyAnchor = difficulty < 0.34 ? profile.easyAccuracy : difficulty < 0.72 ? profile.mediumAccuracy : profile.hardAccuracy;
  const raw = (base * 0.50 + accuracyAnchor * 0.50) * domainFamiliarity;
  const floor = live.killSwitches.botKnowledgeFloorEnabled ? knowledgeFloor(difficulty, popularity) : 0;
  const p = Math.max(raw, floor);
  return clamp(p, 0.015, 0.985);
}

export function decideBotAnswer(profile: BotProfile, context: BotQuestionContext): BotDecision {
  const rng = context.rng ?? mathRandom;
  const cfg = opponentConfig();
  const difficulty = clamp(context.difficultyScore, 0, 1);
  const popularity = clamp(context.answerPopularity ?? 0.35, 0, 1);
  const pressure = matchPressure(profile, context);
  const knowsP = clamp(botKnowsProbability(profile, context) + pressure.knowledgeBias, 0.01, 0.985);
  const knows = chance(rng, knowsP);
  const wrongAssociationP = clamp(profile.mistakeProbability + difficulty * 0.10 + pressure.mistakeBias, cfg.botErrorMin, cfg.botErrorMax);
  const timeoutP = clamp(profile.timeoutProbability + difficulty * 0.12 - profile.confidence * 0.035, cfg.botTimeoutMin, cfg.botTimeoutMax);
  const participationP = clamp(profile.participationRate - difficulty * 0.16 + popularity * 0.06 + pressure.speedBias * 0.6, 0.18, 0.995);
  let cognitiveState: BotCognitiveState;
  if (knows) {
    const instantP = clamp((1 - difficulty) * 0.38 + profile.reactionSpeed * 0.22 + (context.answerPopularity ?? 0) * 0.18, 0.02, 0.72);
    cognitiveState = chance(rng, instantP) ? 'INSTANT_RECOGNITION' : 'RECALL';
  } else if (chance(rng, wrongAssociationP)) {
    cognitiveState = 'WRONG_ASSOCIATION';
  } else if (chance(rng, clamp(0.32 + profile.confidence * 0.18 - difficulty * 0.18, 0.10, 0.55))) {
    cognitiveState = 'UNSURE';
  } else if (chance(rng, participationP * clamp(0.48 - difficulty * 0.22, 0.12, 0.50))) {
    cognitiveState = 'UNSURE';
  } else {
    cognitiveState = 'NO_ANSWER';
  }
  const shouldTimeout = cognitiveState === 'NO_ANSWER' || (cognitiveState === 'UNSURE' && chance(rng, timeoutP));
  const shouldMistake = cognitiveState === 'WRONG_ASSOCIATION' || (knows && chance(rng, clamp(profile.mistakeProbability * (0.30 + profile.riskTolerance * 0.42) + pressure.mistakeBias, 0, 0.26)));
  const willAnswer = !shouldTimeout && (knows || cognitiveState === 'WRONG_ASSOCIATION' || (cognitiveState === 'UNSURE' && chance(rng, participationP * (0.36 + profile.riskTolerance * 0.26))));
  const reactionDelayMs = reactionDelayMsForState(profile, cognitiveState, context, rng);
  return {
    cognitiveState,
    knowsAnswer: knows,
    willAnswer,
    shouldMistake,
    shouldTimeout,
    reactionDelayMs,
    knowsProbability: Number(knowsP.toFixed(4)),
    wrongAssociationProbability: Number(wrongAssociationP.toFixed(4)),
    timeoutProbability: Number(timeoutP.toFixed(4)),
    participationProbability: Number(participationP.toFixed(4)),
    difficultyScore: Number(difficulty.toFixed(4)),
    answerPopularity: Number(popularity.toFixed(4)),
  };
}

export function knowsAnswer(profile: BotProfile, difficulty: QuestionDifficulty, popularityBoost = 0): boolean {
  return chance(mathRandom, botKnowsProbability(profile, { difficultyScore: difficultyScore(difficulty), answerPopularity: popularityBoost * 4 }));
}

export function shouldMakeMistake(profile: BotProfile, difficulty: QuestionDifficulty): boolean {
  return chance(mathRandom, clamp(profile.mistakeProbability + difficultyScore(difficulty) * 0.13 + profile.aggression * 0.04, 0.01, 0.55));
}

export function reactionDelayMs(profile: BotProfile, difficulty: QuestionDifficulty, knows: boolean): number {
  const state: BotCognitiveState = knows ? (Math.random() < 0.42 ? 'INSTANT_RECOGNITION' : 'RECALL') : (Math.random() < 0.4 ? 'UNSURE' : 'NO_ANSWER');
  return reactionDelayMsForState(profile, state, { difficultyScore: difficultyScore(difficulty) }, mathRandom);
}

export function rngForBotRound(profile: BotProfile, roundNumber: number, questionKey: string): RandomSource {
  return new SeededRandom(`${profile.seed}:${roundNumber}:${questionKey}`);
}

function reactionDelayMsForState(profile: BotProfile, state: BotCognitiveState, context: BotQuestionContext, rng: RandomSource): number {
  const cfg = opponentConfig();
  const difficulty = clamp(context.difficultyScore, 0, 1);
  const pressure = matchPressure(profile, context);
  const tempoBias = typeof context.previousTempoMs === 'number'
    ? clamp((context.previousTempoMs - 3200) / 9000, -0.10, 0.10)
    : 0;
  const stateFactor: Record<BotCognitiveState, number> = {
    INSTANT_RECOGNITION: 0.52,
    RECALL: 1.0,
    UNSURE: 1.38,
    WRONG_ASSOCIATION: 1.06,
    NO_ANSWER: 1.68,
  };
  const median = profile.responseMedianMs
    * stateFactor[state]
    * (0.78 + difficulty * 0.58)
    * (1 - pressure.speedBias + tempoBias)
    * (1.06 - profile.inputSpeed * 0.10);
  const sigma = clamp(0.20 + (1 - profile.consistency) * 0.38 + difficulty * 0.10, 0.16, 0.64);
  let delay = logNormal(rng, median, sigma);
  if (chance(rng, profile.hesitationProbability + difficulty * 0.08)) delay += 450 + rng.next() * (2400 + difficulty * 2400);
  if (state === 'NO_ANSWER') delay = cfg.botReactionMaxMs + 250;
  const floor = state === 'INSTANT_RECOGNITION' ? cfg.botReactionMinMs : cfg.botReactionMinMs + 350 + difficulty * 700;
  return Math.round(clamp(delay, floor, cfg.botReactionMaxMs + 500));
}

function matchPressure(profile: BotProfile, context: BotQuestionContext): { speedBias: number; mistakeBias: number; knowledgeBias: number } {
  const botScore = context.botScore ?? 0;
  const oppScore = context.opponentScore ?? 0;
  const behind = Math.max(0, oppScore - botScore);
  const ahead = Math.max(0, botScore - oppScore);
  const aggression = profile.aggression;
  return {
    speedBias: clamp(behind * 0.035 * aggression - ahead * 0.018 * (1 - aggression) - (1 - profile.pressureHandling) * ahead * 0.012, -0.06, 0.08),
    mistakeBias: clamp(behind * 0.018 * aggression - ahead * 0.010 + (1 - profile.pressureHandling) * (behind + ahead) * 0.010, -0.025, 0.052),
    knowledgeBias: clamp((profile.answerConfidence - 0.5) * 0.035 - (1 - profile.pressureHandling) * ahead * 0.006, -0.035, 0.035),
  };
}

function knowledgeFloor(difficulty: number, popularity: number): number {
  const floor = liveOpsConfig().botDifficulty.knowledgeFloorByDifficulty;
  const popularityGate = clamp(0.38 + popularity * 0.78, 0, 1);
  if (difficulty < 0.24) return floor.veryEasy * popularityGate;
  if (difficulty < 0.44) return floor.easy * popularityGate;
  if (difficulty < 0.68) return floor.medium * clamp(0.24 + popularity * 0.90, 0, 1);
  if (difficulty < 0.86) return floor.hard * clamp(0.18 + popularity * 0.72, 0, 1);
  return floor.obscure * clamp(0.12 + popularity * 0.55, 0, 1);
}

function domainModifier(profile: BotProfile, domain: KnowledgeDomain): number {
  if (profile.favoriteKnowledgeDomains.includes(domain)) return 1.12;
  if (profile.weakKnowledgeDomains.includes(domain)) return 0.82;
  return 1;
}

export function pickWrongName(rng: RandomSource, candidates: string[], validNames: string[]): string | null {
  const valid = new Set(validNames.map((n) => n.toLowerCase()));
  const filtered = candidates.filter((n) => !valid.has(n.toLowerCase()));
  return pick(rng, filtered.length ? filtered : candidates) ?? null;
}
