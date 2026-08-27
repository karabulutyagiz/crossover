import { getArena, type Arena } from '../game/rank.ts';
import type { GameMode } from '../protocol.ts';
import { liveOpsConfig, progressionSegment, stableRolloutBucket, type CompetitiveState, type ProgressionSegment } from './liveOpsConfig.ts';
import { clamp, type RandomSource, mathRandom } from './random.ts';
import { expectedScore, type SkillRecentMatch } from './skillRating.ts';

export interface BotDifficultyDirectorInput {
  playerId?: string | null;
  playerHiddenMmr: number;
  playerSkillUncertainty: number;
  playerTrophies: number;
  arena?: Arena;
  accountAgeDays?: number | null;
  matchesPlayed: number;
  recentMatches?: SkillRecentMatch[];
  accuracyEma?: number;
  responseTimeEmaMs?: number | null;
  easyQuestionAccuracy?: number;
  mediumQuestionAccuracy?: number;
  hardQuestionAccuracy?: number;
  currentForm?: number;
  pressureProfile?: { pressure?: number; relief?: number; botWins?: number; botGames?: number; recentWins?: number; recentGames?: number; winStreak?: number; trophyGain30m?: number; botWins30m?: number };
  velocityPressure?: number;
  questionMode?: GameMode;
  queueHealthScore?: number | null;
  recentBotExposure?: number;
  rng?: RandomSource;
}

export interface BotDifficultyDirectorOutput {
  algorithmVersion: string;
  balanceVersion: string;
  enabled: boolean;
  rolloutVariant: 'control' | 'treatment';
  rolloutBucket: number | null;
  segment: ProgressionSegment;
  arenaName: string;
  targetWinProbability: number;
  targetCompetitiveProbability: number;
  estimatedPlayerWinProbability: number;
  targetBotSkill: number;
  targetSkillMean: number;
  mmrConfidence: number;
  competitiveState: CompetitiveState;
  competitiveEnjoymentScore: number;
  frustrationRiskScore: number;
  momentumScore: number;
  closeMatchScore: number;
  blowoutRisk: number;
  masteryOpportunityScore: number;
  nonToxicityScore: number;
  emoteSuppression: number;
  newPlayerProtection: number;
  progressionAdjustmentMmr: number;
  formAdjustmentMmr: number;
  frustrationAdjustmentMmr: number;
  momentumAdjustmentMmr: number;
  recoveryAdjustmentMmr: number;
  dominanceAdjustmentMmr: number;
  pressureAdjustmentMmr: number;
  smoothingAdjustmentMmr: number;
  liveOpsAdjustmentMmr: number;
  frustrationRisk: number;
  dominanceScore: number;
  intentionalLossRisk: number;
  recoveryCooldownActive: boolean;
  lossStreak: number;
  winStreak: number;
  blowoutLossRate: number;
  closeLossRate: number;
  smurfSuspicion: number;
  knowledgeDepth: number;
  recallConsistency: number;
  reactionQuality: number;
  inputSpeed: number;
  pressureHandling: number;
  answerConfidence: number;
  questionDepthTolerance: number;
}

export function runBotDifficultyDirector(input: BotDifficultyDirectorInput): BotDifficultyDirectorOutput {
  const live = liveOpsConfig();
  const cfg = live.botDifficulty;
  const rng = input.rng ?? mathRandom;
  const arena = input.arena ?? getArena(input.playerTrophies);
  const segment = progressionSegment(input.playerTrophies, input.matchesPlayed);
  const bucket = input.playerId ? stableRolloutBucket(input.playerId, live.rollout.experimentSalt) : null;
  const treatment = live.killSwitches.adaptiveDifficultyEnabled && rolloutEnabled(live.rollout.stage, live.rollout.percentage, bucket);
  const recent = input.recentMatches ?? [];
  const form = analyzeRecentForm(recent);
  const uncertainty = clamp(input.playerSkillUncertainty, 50, 600);
  const mmrConfidence = clamp(1 - (uncertainty - 70) / 280, 0, 1);
  const protection = live.killSwitches.newPlayerProtectionEnabled ? newPlayerProtection(segment, input.playerTrophies, input.matchesPlayed, mmrConfidence) : 0;
  const intentionalLossRisk = intentionalLossRiskFor(form, input);
  const recoveryCooldownActive = recoveryCooldownFor(recent, input.playerHiddenMmr, cfg.recoveryMaxAdjustmentMmr);
  const frustrationRisk = frustrationRiskFor(form, input, protection);
  const effectiveFrustrationRisk = intentionalLossRisk >= cfg.intentionalLossBlockThreshold ? frustrationRisk * 0.25 : frustrationRisk;
  const dominanceScore = dominanceScoreFor(form, input, mmrConfidence);
  const smurfSuspicion = smurfSuspicionFor(input, form, dominanceScore);
  const momentumScore = momentumScoreFor(form, input, dominanceScore);
  const competitiveState = competitiveStateFor(form, effectiveFrustrationRisk, dominanceScore, smurfSuspicion, momentumScore, intentionalLossRisk, cfg.intentionalLossBlockThreshold);
  const segmentWinBand = cfg.targetWinProbabilityBySegment[segment];
  const stateWinBand = cfg.targetCompetitiveProbabilityByState[competitiveState];
  const winBand = blendedWinBand(segmentWinBand, stateWinBand, 0.62);
  const targetCompetitiveProbability = targetWinProbabilityFor(winBand, effectiveFrustrationRisk, dominanceScore, smurfSuspicion, rng);
  const targetWinProbability = targetCompetitiveProbability;
  const targetFromWinProbability = opponentMeanForTargetWinProbability(input.playerHiddenMmr, uncertainty, targetWinProbability);
  const protectionFloor = input.playerHiddenMmr - protectionOffsetMmr(segment, protection, cfg.newPlayerSkillOffsetMmr, cfg.earlyProgressionSkillOffsetMmr);
  const protectedTarget = protection > 0 && smurfSuspicion < 0.42
    ? Math.min(targetFromWinProbability, protectionFloor)
    : targetFromWinProbability;
  const progressionAdjustmentMmr = protectedTarget - input.playerHiddenMmr;
  const formAdjustmentMmr = Math.round(clamp((input.currentForm ?? 0) * 42, -34, 42));
  const frustrationAdjustmentMmr = frustrationAdjustment(effectiveFrustrationRisk, intentionalLossRisk);
  const momentumAdjustmentMmr = momentumAdjustment(momentumScore, intentionalLossRisk);
  const recoveryAdjustmentMmr = recoveryAdjustment(frustrationRisk, intentionalLossRisk, recoveryCooldownActive, live.killSwitches.recoveryAdjustmentEnabled);
  const dominanceAdjustmentMmr = dominanceAdjustment(dominanceScore, smurfSuspicion);
  // Farm baskısı zorluğu ancak HAFİF itebilir (115→70, 2026-08-27): hızlı kupa
  // kazanan oyuncuya botları sertleştirmek "kazanınca oyun beni cezalandırıyor"
  // hissi veriyordu — tutundurma önceliği antifarm baskısının önündedir.
  const pressureAdjustmentMmr = Math.round(clamp((input.pressureProfile?.pressure ?? 0) * 70 - (input.pressureProfile?.relief ?? 0) * 55 + (input.velocityPressure ?? 0) * 45, -54, 70));
  const liveOpsAdjustmentMmr = live.killSwitches.botDifficultyLiveTuningEnabled ? cfg.liveOpsSkillOffsetMmr : 0;
  let targetSkillMean = protectedTarget + formAdjustmentMmr + frustrationAdjustmentMmr + momentumAdjustmentMmr + recoveryAdjustmentMmr + dominanceAdjustmentMmr + pressureAdjustmentMmr + liveOpsAdjustmentMmr;
  const beforeSmoothing = targetSkillMean;
  targetSkillMean = smoothAgainstRecentBot(recent, targetSkillMean, cfg.maxBotSkillStepMmr + Math.round(smurfSuspicion * cfg.smurfAccelerationMmr * 0.75) + Math.round(effectiveFrustrationRisk * 45));
  const smoothingAdjustmentMmr = Math.round(targetSkillMean - beforeSmoothing);

  if (segment === 'NEW_PLAYER' && smurfSuspicion < 0.55 && live.killSwitches.newPlayerProtectionEnabled) {
    targetSkillMean = Math.min(targetSkillMean, input.playerHiddenMmr - Math.round(36 + protection * 58));
  }
  if (segment === 'ELITE') targetSkillMean = Math.max(targetSkillMean, input.playerHiddenMmr - 120);
  targetSkillMean = Math.round(clamp(targetSkillMean, 560, 2100));

  const estimatedPlayerWinProbability = expectedScore(input.playerHiddenMmr, targetSkillMean, uncertainty, botUncertaintyFor(targetSkillMean));
  const targetBotSkill = botSkillFractionFromMean(targetSkillMean);
  const engagement = engagementScoresFor(estimatedPlayerWinProbability, targetCompetitiveProbability, frustrationRisk, dominanceScore, form, cfg);
  const dimensions = behaviorDimensions(targetBotSkill, protection, effectiveFrustrationRisk, dominanceScore, smurfSuspicion, input, form);

  return {
    algorithmVersion: cfg.algorithmVersion,
    balanceVersion: cfg.balanceVersion,
    enabled: treatment,
    rolloutVariant: treatment ? 'treatment' : 'control',
    rolloutBucket: bucket,
    segment,
    arenaName: arena.name,
    targetWinProbability: Number(targetWinProbability.toFixed(4)),
    targetCompetitiveProbability: Number(targetCompetitiveProbability.toFixed(4)),
    estimatedPlayerWinProbability: Number(estimatedPlayerWinProbability.toFixed(4)),
    targetBotSkill: Number(targetBotSkill.toFixed(4)),
    targetSkillMean,
    mmrConfidence: Number(mmrConfidence.toFixed(4)),
    competitiveState,
    competitiveEnjoymentScore: Number(engagement.competitiveEnjoymentScore.toFixed(4)),
    frustrationRiskScore: Number(frustrationRisk.toFixed(4)),
    momentumScore: Number(momentumScore.toFixed(4)),
    closeMatchScore: Number(engagement.closeMatchScore.toFixed(4)),
    blowoutRisk: Number(engagement.blowoutRisk.toFixed(4)),
    masteryOpportunityScore: Number(engagement.masteryOpportunityScore.toFixed(4)),
    nonToxicityScore: Number(engagement.nonToxicityScore.toFixed(4)),
    emoteSuppression: Number(engagement.emoteSuppression.toFixed(4)),
    newPlayerProtection: Number(protection.toFixed(4)),
    progressionAdjustmentMmr: Math.round(progressionAdjustmentMmr),
    formAdjustmentMmr,
    frustrationAdjustmentMmr,
    momentumAdjustmentMmr,
    recoveryAdjustmentMmr,
    dominanceAdjustmentMmr,
    pressureAdjustmentMmr,
    smoothingAdjustmentMmr,
    liveOpsAdjustmentMmr,
    frustrationRisk: Number(frustrationRisk.toFixed(4)),
    dominanceScore: Number(dominanceScore.toFixed(4)),
    intentionalLossRisk: Number(intentionalLossRisk.toFixed(4)),
    recoveryCooldownActive,
    lossStreak: form.lossStreak,
    winStreak: form.winStreak,
    blowoutLossRate: Number(form.blowoutLossRate.toFixed(4)),
    closeLossRate: Number(form.closeLossRate.toFixed(4)),
    smurfSuspicion: Number(smurfSuspicion.toFixed(4)),
    ...dimensions,
  };

  function recoveryAdjustment(frustration: number, intentional: number, cooldownActive: boolean, enabled: boolean): number {
    if (!enabled || cooldownActive || frustration < live.recovery.frustrationThreshold || intentional >= cfg.intentionalLossBlockThreshold) return 0;
    const normalized = clamp((frustration - live.recovery.frustrationThreshold) / Math.max(0.01, 1 - live.recovery.frustrationThreshold), 0, 1);
    return -Math.round(cfg.recoveryMaxAdjustmentMmr * normalized);
  }

  function frustrationAdjustment(frustration: number, intentional: number): number {
    if (intentional >= cfg.intentionalLossBlockThreshold || frustration < 0.35) return 0;
    const normalized = clamp((frustration - 0.35) / 0.65, 0, 1);
    return -Math.round(cfg.frustrationAdjustmentMmr * normalized * 0.45);
  }

  function momentumAdjustment(momentum: number, intentional: number): number {
    const signed = clamp((momentum - 0.5) * 2, -1, 1);
    const scale = signed >= 0 ? 0.35 : 0.22;
    const antiExploit = intentional >= cfg.intentionalLossBlockThreshold ? 0.3 : 1;
    return Math.round(cfg.momentumAdjustmentMmr * signed * scale * antiExploit);
  }

  function dominanceAdjustment(dominance: number, smurf: number): number {
    if (dominance < live.recovery.dominanceThreshold && smurf < 0.42) return 0;
    const normalized = clamp((Math.max(dominance, smurf) - live.recovery.dominanceThreshold) / Math.max(0.01, 1 - live.recovery.dominanceThreshold), 0, 1);
    const smurfBoost = input.matchesPlayed < 10 ? smurf * cfg.smurfAccelerationMmr : 0;
    return Math.round(cfg.dominanceMaxAdjustmentMmr * normalized + smurfBoost);
  }
}

function recoveryCooldownFor(recent: SkillRecentMatch[], playerMean: number, recoveryMaxAdjustmentMmr: number): boolean {
  const lastBot = recent.slice(0, 2).find((m) => m.opponentType === 'BOT' && Number.isFinite(m.opponentSkillMean));
  if (!lastBot) return false;
  return lastBot.opponentSkillMean <= playerMean - Math.max(85, recoveryMaxAdjustmentMmr * 0.75);
}

function rolloutEnabled(stage: string, percentage: number, bucket: number | null): boolean {
  if (stage === 'development' || stage === 'staging' || stage === 'internal' || stage === 'all') return true;
  if (stage === 'percent') return bucket == null || bucket < percentage;
  return false;
}

function opponentMeanForTargetWinProbability(playerMean: number, playerUncertainty: number, targetWin: number): number {
  const target = clamp(targetWin, 0.03, 0.97);
  const botUncertainty = 135;
  const uncertaintyScale = Math.sqrt(playerUncertainty ** 2 + botUncertainty ** 2) * 0.32;
  const scale = Math.max(220, 300 + uncertaintyScale);
  const logit = Math.log(target / (1 - target));
  return Math.round(playerMean - logit * scale);
}

function botSkillFractionFromMean(skillMean: number): number {
  return clamp((skillMean - 760) / 920, 0.12, 0.98);
}

function botUncertaintyFor(skillMean: number): number {
  const skill = botSkillFractionFromMean(skillMean);
  return Math.round(clamp(160 - skill * 65, 70, 160));
}

function newPlayerProtection(segment: ProgressionSegment, trophies: number, matchesPlayed: number, mmrConfidence: number): number {
  const trophyProtection = segment === 'NEW_PLAYER'
    ? clamp(1 - trophies / 200, 0.35, 1)
    : segment === 'EARLY'
      ? clamp(1 - (trophies - 200) / 300, 0.20, 0.75)
      : 0;
  const matchProtection = matchesPlayed < 3 ? 1 : matchesPlayed < 10 ? clamp(1 - (matchesPlayed - 3) / 7, 0.20, 1) : 0;
  const confidenceBoost = 1 - mmrConfidence * 0.42;
  return clamp(Math.max(trophyProtection, matchProtection) * confidenceBoost, 0, 1);
}

function protectionOffsetMmr(segment: ProgressionSegment, protection: number, newOffset: number, earlyOffset: number): number {
  if (segment === 'NEW_PLAYER') return newOffset * protection;
  if (segment === 'EARLY') return earlyOffset * protection;
  return 0;
}

function targetWinProbabilityFor(band: { min: number; max: number }, frustration: number, dominance: number, smurf: number, rng: RandomSource): number {
  const midpoint = (band.min + band.max) / 2;
  const jitter = (rng.next() - 0.5) * Math.max(0.01, band.max - band.min) * 0.42;
  const adjusted = midpoint + frustration * 0.035 - dominance * 0.042 - smurf * 0.065 + jitter;
  return clamp(adjusted, band.min, band.max);
}

function blendedWinBand(segmentBand: { min: number; max: number }, stateBand: { min: number; max: number }, stateWeight: number): { min: number; max: number } {
  const w = clamp(stateWeight, 0, 1);
  const min = segmentBand.min * (1 - w) + stateBand.min * w;
  const max = segmentBand.max * (1 - w) + stateBand.max * w;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function competitiveStateFor(
  form: RecentFormSummary,
  frustration: number,
  dominance: number,
  smurf: number,
  momentum: number,
  intentionalLossRisk: number,
  intentionalBlockThreshold: number,
): CompetitiveState {
  if (smurf >= 0.58 || dominance >= 0.78 || (form.winStreak >= 4 && form.avgScoreMargin >= 1.8)) return 'DOMINATING';
  if (dominance >= 0.56 || momentum >= 0.68) return 'PERFORMING_WELL';
  if (intentionalLossRisk >= intentionalBlockThreshold) return 'BALANCED';
  // Merhamet eşiği 4→3 (2026-08-27): 3 üst üste kayıp churn uçurumudur —
  // kayıptan kaçınma kazanç hazzının ~2 katı; 4. kaybı beklemek geç kalmaktır.
  if (frustration >= 0.68 || form.lossStreak >= 3 || (form.blowoutLossRate >= 0.5 && form.lossStreak >= 2)) return 'STRUGGLING';
  if (frustration >= 0.42 || form.lossStreak >= 2 || form.lossRate >= 0.62) return 'SLIGHTLY_STRUGGLING';
  return 'BALANCED';
}

function momentumScoreFor(form: RecentFormSummary, input: BotDifficultyDirectorInput, dominance: number): number {
  const formValue = clamp((input.currentForm ?? (form.winRate - 0.5)) + 0.5, 0, 1);
  const streak = clamp(form.winStreak / 5 - form.lossStreak / 6, -1, 1);
  const margin = clamp(form.avgScoreMargin / 3, -1, 1);
  const speed = input.responseTimeEmaMs == null ? 0.5 : clamp((5600 - input.responseTimeEmaMs) / 4600, 0, 1);
  const accuracy = clamp(((input.accuracyEma ?? form.avgAccuracy) - 0.34) / 0.38, 0, 1);
  return clamp(0.32 * formValue + 0.20 * ((streak + 1) / 2) + 0.15 * ((margin + 1) / 2) + 0.13 * speed + 0.12 * accuracy + 0.08 * dominance, 0, 1);
}

function engagementScoresFor(
  estimatedPlayerWinProbability: number,
  targetCompetitiveProbability: number,
  frustration: number,
  dominance: number,
  form: RecentFormSummary,
  cfg: ReturnType<typeof liveOpsConfig>['botDifficulty'],
): {
  competitiveEnjoymentScore: number;
  closeMatchScore: number;
  blowoutRisk: number;
  masteryOpportunityScore: number;
  nonToxicityScore: number;
  emoteSuppression: number;
} {
  const pWin = clamp(estimatedPlayerWinProbability, 0, 1);
  const targetFit = clamp(1 - Math.abs(pWin - targetCompetitiveProbability) / 0.24, 0, 1);
  const closeMatchScore = clamp(1 - Math.abs(pWin - 0.5) / 0.45, 0, 1);
  const closeness = clamp(targetFit * 0.72 + closeMatchScore * 0.28, 0, 1);
  const lossBlowoutRisk = clamp((0.52 - pWin) / 0.34, 0, 1);
  const historyRisk = clamp(form.blowoutLossRate * cfg.blowoutSensitivity + clamp(form.lossStreak / 6, 0, 1) * 0.10, 0, 0.32);
  const blowoutRisk = clamp(lossBlowoutRisk * (0.76 + frustration * 0.24) + historyRisk, 0, 1);
  const lowFrustration = clamp(1 - blowoutRisk * 0.68 + clamp((pWin - 0.42) / 0.32, 0, 1) * 0.32, 0, 1);
  const masteryTarget = dominance >= 0.58 ? 0.50 : frustration >= 0.50 ? 0.62 : 0.56;
  const masteryOpportunityScore = clamp(1 - Math.abs(pWin - masteryTarget) / 0.30, 0, 1);
  const nonToxicityScore = clamp(1 - blowoutRisk * (0.54 + frustration * 0.36) - Math.max(0, pWin - 0.76) * 0.55, 0, 1);
  const weights = cfg.engagementWeights;
  const totalWeight = Math.max(0.001, weights.closeness + weights.lowFrustration + weights.masteryOpportunity + weights.nonToxicity);
  const competitiveEnjoymentScore = clamp((
    closeness * weights.closeness
      + lowFrustration * weights.lowFrustration
      + masteryOpportunityScore * weights.masteryOpportunity
      + nonToxicityScore * weights.nonToxicity
  ) / totalWeight, 0, 1);
  const emoteSuppression = clamp(frustration * cfg.emoteFrustrationSensitivity * (0.45 + blowoutRisk * 0.55), 0, 0.92);
  return { competitiveEnjoymentScore, closeMatchScore, blowoutRisk, masteryOpportunityScore, nonToxicityScore, emoteSuppression };
}

interface RecentFormSummary {
  lossStreak: number;
  winStreak: number;
  lossRate: number;
  winRate: number;
  blowoutLossRate: number;
  closeLossRate: number;
  avgAccuracy: number;
  avgScoreMargin: number;
  lowInteractionLossRate: number;
  fastWinRate: number;
  lastBotOpponentMean: number | null;
}

function analyzeRecentForm(recent: SkillRecentMatch[]): RecentFormSummary {
  const sample = recent.slice(0, 10);
  let lossStreak = 0;
  for (const m of recent) { if (m.won) break; lossStreak += 1; }
  let winStreak = 0;
  for (const m of recent) { if (!m.won) break; winStreak += 1; }
  const losses = sample.filter((m) => !m.won);
  const wins = sample.filter((m) => m.won);
  const avg = (items: number[], fallback: number) => items.length ? items.reduce((s, n) => s + n, 0) / items.length : fallback;
  const lastBot = recent.find((m) => m.opponentType === 'BOT' && Number.isFinite(m.opponentSkillMean));
  return {
    lossStreak,
    winStreak,
    lossRate: sample.length ? losses.length / sample.length : 0,
    winRate: sample.length ? wins.length / sample.length : 0,
    blowoutLossRate: losses.length ? losses.filter((m) => m.scoreAgainst - m.scoreFor >= 3).length / losses.length : 0,
    closeLossRate: losses.length ? losses.filter((m) => m.scoreAgainst - m.scoreFor <= 1).length / losses.length : 0,
    avgAccuracy: avg(sample.map((m) => m.accuracy).filter(Number.isFinite), 0.5),
    avgScoreMargin: avg(sample.map((m) => m.scoreFor - m.scoreAgainst).filter(Number.isFinite), 0),
    lowInteractionLossRate: losses.length ? losses.filter((m) => m.scoreFor === 0 && m.accuracy <= 0.1 && m.medianResponseTimeMs == null).length / losses.length : 0,
    fastWinRate: wins.length ? wins.filter((m) => (m.medianResponseTimeMs ?? Infinity) <= 2500 && m.accuracy >= 0.72).length / wins.length : 0,
    lastBotOpponentMean: lastBot?.opponentSkillMean ?? null,
  };
}

function frustrationRiskFor(form: RecentFormSummary, input: BotDifficultyDirectorInput, protection: number): number {
  const cfg = liveOpsConfig().botDifficulty;
  const lossStreakPressure = clamp(form.lossStreak * cfg.lossStreakSensitivity, 0, 0.56);
  const blowoutPressure = form.blowoutLossRate * cfg.blowoutLossWeight;
  const closeLossRelief = form.closeLossRate * cfg.closeLossWeight;
  const accuracyPressure = clamp((0.46 - (input.accuracyEma ?? form.avgAccuracy)) / 0.34, 0, 0.28);
  const formPressure = clamp((-(input.currentForm ?? 0)) * 0.36, 0, 0.18);
  const protectionPressure = protection * 0.10;
  return clamp(lossStreakPressure + blowoutPressure + accuracyPressure + formPressure + protectionPressure - closeLossRelief, 0, 1);
}

function dominanceScoreFor(form: RecentFormSummary, input: BotDifficultyDirectorInput, mmrConfidence: number): number {
  const accuracy = input.accuracyEma ?? form.avgAccuracy;
  const speedScore = input.responseTimeEmaMs == null ? 0 : clamp((5200 - input.responseTimeEmaMs) / 4200, 0, 1);
  const hardAccuracy = input.hardQuestionAccuracy ?? 0.5;
  const streakScore = clamp(form.winStreak / 6, 0, 1);
  const marginScore = clamp((form.avgScoreMargin + 0.5) / 3.5, 0, 1);
  return clamp(streakScore * 0.30 + clamp((accuracy - 0.58) / 0.34, 0, 1) * 0.26 + speedScore * 0.17 + clamp((hardAccuracy - 0.54) / 0.36, 0, 1) * 0.18 + marginScore * 0.09 + mmrConfidence * 0.04, 0, 1);
}

function smurfSuspicionFor(input: BotDifficultyDirectorInput, form: RecentFormSummary, dominance: number): number {
  if (input.matchesPlayed > 14 || input.playerTrophies >= 500) return 0;
  const accuracy = clamp(((input.accuracyEma ?? form.avgAccuracy) - 0.68) / 0.25, 0, 1);
  const speed = input.responseTimeEmaMs == null ? 0 : clamp((3200 - input.responseTimeEmaMs) / 2200, 0, 1);
  const hard = clamp(((input.hardQuestionAccuracy ?? 0.5) - 0.60) / 0.28, 0, 1);
  return clamp(dominance * 0.42 + accuracy * 0.26 + speed * 0.18 + hard * 0.14, 0, 1);
}

function intentionalLossRiskFor(form: RecentFormSummary, input: BotDifficultyDirectorInput): number {
  const zeroInteraction = form.lowInteractionLossRate * 0.50;
  const suddenCollapse = (input.matchesPlayed >= 6 && form.lossStreak >= 3 && form.avgAccuracy < 0.12) ? 0.26 : 0;
  const repeatedFastLoss = form.lossStreak >= 4 && form.avgScoreMargin <= -2.5 ? 0.20 : 0;
  return clamp(zeroInteraction + suddenCollapse + repeatedFastLoss, 0, 1);
}

function smoothAgainstRecentBot(recent: SkillRecentMatch[], target: number, maxStep: number): number {
  const lastBot = recent.find((m) => m.opponentType === 'BOT' && Number.isFinite(m.opponentSkillMean));
  if (!lastBot || maxStep <= 0) return target;
  return clamp(target, lastBot.opponentSkillMean - maxStep, lastBot.opponentSkillMean + maxStep);
}

function behaviorDimensions(skill: number, protection: number, frustration: number, dominance: number, smurf: number, input: BotDifficultyDirectorInput, form: RecentFormSummary): Pick<BotDifficultyDirectorOutput, 'knowledgeDepth' | 'recallConsistency' | 'reactionQuality' | 'inputSpeed' | 'pressureHandling' | 'answerConfidence' | 'questionDepthTolerance'> {
  const modeDepthPenalty = input.questionMode === 'letter-team' ? 0.03 : input.questionMode === 'country-team' ? 0.015 : 0;
  const knowledgeDepth = clamp(0.24 + skill * 0.70 + dominance * 0.08 + smurf * 0.10 - protection * 0.05 - modeDepthPenalty, 0.14, 0.98);
  const recallConsistency = clamp(0.38 + skill * 0.48 + dominance * 0.07 - protection * 0.10 - frustration * 0.05, 0.18, 0.96);
  const reactionQuality = clamp(0.22 + skill * 0.64 + dominance * 0.10 + smurf * 0.08 - protection * 0.12, 0.12, 0.98);
  const inputSpeed = clamp(0.20 + skill * 0.58 + form.fastWinRate * 0.10 + smurf * 0.10 - protection * 0.16, 0.10, 0.96);
  const pressureHandling = clamp(0.30 + skill * 0.50 + dominance * 0.08 - frustration * 0.12, 0.12, 0.96);
  const answerConfidence = clamp(0.28 + skill * 0.54 + dominance * 0.07 + smurf * 0.06 - protection * 0.08 - frustration * 0.07, 0.12, 0.95);
  const questionDepthTolerance = clamp(0.18 + skill * 0.72 + dominance * 0.06 + smurf * 0.08 - protection * 0.04, 0.08, 0.98);
  return {
    knowledgeDepth: Number(knowledgeDepth.toFixed(4)),
    recallConsistency: Number(recallConsistency.toFixed(4)),
    reactionQuality: Number(reactionQuality.toFixed(4)),
    inputSpeed: Number(inputSpeed.toFixed(4)),
    pressureHandling: Number(pressureHandling.toFixed(4)),
    answerConfidence: Number(answerConfidence.toFixed(4)),
    questionDepthTolerance: Number(questionDepthTolerance.toFixed(4)),
  };
}
