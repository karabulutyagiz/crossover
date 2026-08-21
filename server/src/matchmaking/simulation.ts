import { decideBotAnswer } from './botDecision.ts';
import { selectBotProfileForSkill } from './botProfiles.ts';
import { MatchmakingOrchestrator } from './policy.ts';
import { SeededRandom, clamp } from './random.ts';
import { expectedScore, type SkillRecentMatch } from './skillRating.ts';
import { trophyDeltaExpectedScore } from './trophyIntegrity.ts';

export interface SimulationSummary {
  matches: number;
  playerWinRate: number;
  avgTrophyDelta: number;
  trophyInflation: number;
  botTimeoutRate: number;
  botMistakeRate: number;
  impossibleResults: string[];
  cohorts: Record<string, { matches: number; playerWinRate: number; avgTrophyDelta: number }>;
  cohortDiagnostics: Record<string, { avgEstimatedPlayerWinProbability: number; avgBotSkillMean: number; avgBotSkill: number; avgFrustrationRisk: number; avgDominanceScore: number; avgIntentionalLossRisk: number; avgCompetitiveEnjoymentScore: number; avgMomentumScore: number }>;
  responseTime: { min: number; p50: number; p95: number; max: number };
  responseTimeBySkill: Record<string, { p10: number; p50: number; p90: number }>;
  botKnowledgeCurve: Record<string, { obvious: number; easy: number; medium: number; hard: number; obscure: number }>;
  population?: PopulationSimulationSummary[];
}

export interface PopulationSimulationSummary {
  players: number;
  estimatedBotRate: number;
  medianQueueMs: number;
  p95QueueMs: number;
}

const COHORTS: { name: string; skillMean: number; uncertainty: number; trophies: number; matches: number; accuracy: number; responseMs: number | null; recentMatches?: SkillRecentMatch[] }[] = [
  { name: 'beginner_0', skillMean: 900, uncertainty: 350, trophies: 0, matches: 0, accuracy: 0.38, responseMs: 6800 },
  { name: 'beginner_losing', skillMean: 910, uncertainty: 330, trophies: 70, matches: 4, accuracy: 0.34, responseMs: 7200, recentMatches: losses(4, 980, 0.32, 1, 3) },
  { name: 'beginner_intentional_loss', skillMean: 910, uncertainty: 330, trophies: 80, matches: 5, accuracy: 0.05, responseMs: null, recentMatches: losses(5, 980, 0.05, 0, 3, true) },
  { name: 'smurf_0', skillMean: 1280, uncertainty: 330, trophies: 0, matches: 3, accuracy: 0.88, responseMs: 1800, recentMatches: wins(3, 980, 0.88, 3, 0, 1600) },
  { name: 'protected_150', skillMean: 970, uncertainty: 280, trophies: 150, matches: 7, accuracy: 0.45, responseMs: 5600 },
  { name: 'early_260', skillMean: 990, uncertainty: 250, trophies: 260, matches: 12, accuracy: 0.48, responseMs: 5400 },
  { name: 'average_700', skillMean: 1080, uncertainty: 180, trophies: 700, matches: 28, accuracy: 0.56, responseMs: 4400 },
  { name: 'skilled_500_plus', skillMean: 1260, uncertainty: 130, trophies: 1600, matches: 80, accuracy: 0.66, responseMs: 3300 },
  { name: 'expert', skillMean: 1480, uncertainty: 95, trophies: 3600, matches: 180, accuracy: 0.74, responseMs: 2600 },
];

export function runMatchSimulation(matches = 10_000, seed = 'cof-sim'): SimulationSummary {
  const rng = new SeededRandom(seed);
  const responseTimes: number[] = [];
  const impossibleResults: string[] = [];
  let playerWins = 0;
  let trophyDeltaTotal = 0;
  let trophyInflation = 0;
  let botTimeouts = 0;
  let botMistakes = 0;
  let botDecisions = 0;
  const cohorts: Record<string, { matches: number; wins: number; trophyDelta: number }> = {};
  const diagnostics: Record<string, { estimated: number; botSkillMean: number; botSkill: number; frustration: number; dominance: number; intentional: number; competitiveEnjoyment: number; momentum: number }> = {};
  const skillResponseTimes: Record<string, number[]> = { low: [], mid: [], high: [] };
  const knowledgeSamples: Record<string, Record<string, { knows: number; n: number }>> = {};
  const orchestrator = new MatchmakingOrchestrator({
    realPlayerSearchWindowMs: 1200,
    expandedSearchWindowMs: 2800,
    botFallbackMinDelayMs: 2800,
    botFallbackMaxDelayMs: 4500,
    initialTrophyRange: 100,
    expandedTrophyRange: 450,
    initialSkillRange: 180,
    expandedSkillRange: 520,
    matchmakingTimeoutMs: 15000,
    botFallbackPercentage: 100,
    humanLiquidityHoldMs: 6500,
    botFallbackRetryMs: 700,
  });

  for (let i = 0; i < matches; i++) {
    const cohort = COHORTS[i % COHORTS.length]!;
    cohorts[cohort.name] ??= { matches: 0, wins: 0, trophyDelta: 0 };
    const profile = selectBotProfileForSkill({
      userKey: `sim-${cohort.name}-${i % 31}`,
      playerTrophies: cohort.trophies,
      playerSkillMean: cohort.skillMean,
      playerSkillUncertainty: cohort.uncertainty,
      playerMatchesPlayed: cohort.matches,
      recentCooldown: 8,
      recentMatches: cohort.recentMatches,
      accuracyEma: cohort.accuracy,
      responseTimeEmaMs: cohort.responseMs,
      hardQuestionAccuracy: cohort.name === 'smurf_0' ? 0.78 : cohort.name === 'expert' ? 0.72 : 0.48,
      currentForm: cohort.recentMatches ? cohort.recentMatches.filter((m) => m.won).length / cohort.recentMatches.length - 0.5 : 0,
      seed: `${seed}:bot:${i}`,
    });
    diagnostics[cohort.name] ??= { estimated: 0, botSkillMean: 0, botSkill: 0, frustration: 0, dominance: 0, intentional: 0, competitiveEnjoyment: 0, momentum: 0 };
    diagnostics[cohort.name]!.estimated += profile.difficultyDirector?.estimatedPlayerWinProbability ?? expectedScore(cohort.skillMean, profile.skillMean, cohort.uncertainty, profile.skillUncertainty);
    diagnostics[cohort.name]!.botSkillMean += profile.skillMean;
    diagnostics[cohort.name]!.botSkill += profile.skillRating;
    diagnostics[cohort.name]!.frustration += profile.difficultyDirector?.frustrationRisk ?? 0;
    diagnostics[cohort.name]!.dominance += profile.difficultyDirector?.dominanceScore ?? 0;
    diagnostics[cohort.name]!.intentional += profile.difficultyDirector?.intentionalLossRisk ?? 0;
    diagnostics[cohort.name]!.competitiveEnjoyment += profile.difficultyDirector?.competitiveEnjoymentScore ?? 0;
    diagnostics[cohort.name]!.momentum += profile.difficultyDirector?.momentumScore ?? 0;
    const skillGap = profile.skillMean - cohort.skillMean;
    if (cohort.name === 'expert' && skillGap < -420) impossibleResults.push(`expert matched too low: ${skillGap}`);
    if (cohort.name === 'beginner_0' && (profile.difficultyDirector?.estimatedPlayerWinProbability ?? 0) < 0.55) impossibleResults.push('beginner_0 expected win probability too low');
    if (cohort.name === 'beginner_losing' && (profile.difficultyDirector?.recoveryAdjustmentMmr ?? 0) >= 0) impossibleResults.push('beginner losing did not receive recovery adjustment');
    if (cohort.name === 'beginner_intentional_loss' && (profile.difficultyDirector?.intentionalLossRisk ?? 0) < 0.45) impossibleResults.push('intentional loss risk not detected');
    if (profile.difficultyDirector && (profile.difficultyDirector.competitiveEnjoymentScore < 0 || profile.difficultyDirector.competitiveEnjoymentScore > 1)) impossibleResults.push('competitive enjoyment score outside 0..1');
    if (cohort.name === 'smurf_0' && skillGap < -120) impossibleResults.push(`smurf bot stayed too weak: ${skillGap}`);
    let playerScore = 0;
    let botScore = 0;
    for (let r = 0; r < 5 && playerScore < 3 && botScore < 3; r++) {
      const difficulty = clamp(0.08 + rng.next() * 0.88 + (cohort.name === 'expert' ? 0.05 : 0), 0.04, 0.97);
      const decision = decideBotAnswer(profile, {
        difficultyScore: difficulty,
        answerPopularity: rng.next(),
        botScore,
        opponentScore: playerScore,
        previousTempoMs: 1200 + rng.next() * 5200,
        rng: new SeededRandom(`${seed}:round:${i}:${r}`),
      });
      botDecisions += 1;
      if (decision.shouldTimeout) botTimeouts += 1;
      if (decision.shouldMistake) botMistakes += 1;
      if (decision.reactionDelayMs <= 700) impossibleResults.push(`superhuman delay ${decision.reactionDelayMs}`);
      if (decision.willAnswer) {
        responseTimes.push(decision.reactionDelayMs);
        const bucket = profile.skillRating < 0.36 ? 'low' : profile.skillRating < 0.68 ? 'mid' : 'high';
        skillResponseTimes[bucket]!.push(decision.reactionDelayMs);
      }
      const difficultyBucket = difficulty < 0.24 ? 'obvious' : difficulty < 0.44 ? 'easy' : difficulty < 0.68 ? 'medium' : difficulty < 0.86 ? 'hard' : 'obscure';
      knowledgeSamples[cohort.name] ??= { obvious: { knows: 0, n: 0 }, easy: { knows: 0, n: 0 }, medium: { knows: 0, n: 0 }, hard: { knows: 0, n: 0 }, obscure: { knows: 0, n: 0 } };
      knowledgeSamples[cohort.name]![difficultyBucket]!.n += 1;
      if (decision.knowsAnswer) knowledgeSamples[cohort.name]![difficultyBucket]!.knows += 1;
      const playerKnows = rng.next() < clamp(0.205 + cohort.accuracy * 0.55 + (cohort.skillMean - 900) / 1300 * 0.24 - difficulty * 0.34, 0.05, 0.96);
      const playerDelay = playerKnows ? 900 + rng.next() * (6200 + difficulty * 5200) + Math.max(0, (cohort.responseMs ?? 4800) - 4800) * 0.25 : Infinity;
      const botDelay = decision.willAnswer ? decision.reactionDelayMs : Infinity;
      if (playerKnows && playerDelay < botDelay) playerScore += 1;
      else if (decision.willAnswer && !decision.shouldMistake && botDelay < playerDelay) botScore += 1;
    }
    const playerWon = playerScore >= botScore;
    const calc = trophyDeltaExpectedScore({
      playerSkillMean: cohort.skillMean,
      opponentSkillMean: profile.skillMean,
      playerSkillUncertainty: cohort.uncertainty,
      opponentSkillUncertainty: profile.skillUncertainty,
      won: playerWon,
      playerTrophies: cohort.trophies,
      opponentTrophies: profile.trophyRating,
    });
    const botCalc = trophyDeltaExpectedScore({
      playerSkillMean: profile.skillMean,
      opponentSkillMean: cohort.skillMean,
      playerSkillUncertainty: profile.skillUncertainty,
      opponentSkillUncertainty: cohort.uncertainty,
      won: !playerWon,
      playerTrophies: profile.trophyRating,
      opponentTrophies: cohort.trophies,
    });
    if (playerWon) playerWins += 1;
    trophyDeltaTotal += calc.delta;
    trophyInflation += calc.delta + botCalc.delta;
    cohorts[cohort.name]!.matches += 1;
    cohorts[cohort.name]!.wins += playerWon ? 1 : 0;
    cohorts[cohort.name]!.trophyDelta += calc.delta;
    const predicted = expectedScore(cohort.skillMean, profile.skillMean, cohort.uncertainty, profile.skillUncertainty);
    if (cohort.name === 'average_700' && predicted < 0.28) impossibleResults.push('average bot too strong');
    if (!orchestrator.compatibleHumans({ trophies: 1000, skillMean: 1000, skillUncertainty: 160, elapsedMs: 100 }, { trophies: 1060, skillMean: 1110, skillUncertainty: 150, elapsedMs: 100 })) {
      impossibleResults.push('orchestrator rejected compatible humans');
    }
  }

  const sorted = responseTimes.sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const cohortSummary = Object.fromEntries(Object.entries(cohorts).map(([name, c]) => [name, {
    matches: c.matches,
    playerWinRate: c.matches ? c.wins / c.matches : 0,
    avgTrophyDelta: c.matches ? c.trophyDelta / c.matches : 0,
  }]));
  const cohortDiagnostics = Object.fromEntries(Object.entries(diagnostics).map(([name, d]) => {
    const n = cohorts[name]?.matches ?? 1;
    return [name, {
      avgEstimatedPlayerWinProbability: d.estimated / n,
      avgBotSkillMean: d.botSkillMean / n,
      avgBotSkill: d.botSkill / n,
      avgFrustrationRisk: d.frustration / n,
      avgDominanceScore: d.dominance / n,
      avgIntentionalLossRisk: d.intentional / n,
      avgCompetitiveEnjoymentScore: d.competitiveEnjoyment / n,
      avgMomentumScore: d.momentum / n,
    }];
  }));
  const responseTimeBySkill = Object.fromEntries(Object.entries(skillResponseTimes).map(([bucket, values]) => [bucket, percentileSummary(values)]));
  const botKnowledgeCurve: Record<string, { obvious: number; easy: number; medium: number; hard: number; obscure: number }> = {};
  for (const [name, buckets] of Object.entries(knowledgeSamples)) {
    botKnowledgeCurve[name] = {
      obvious: sampleRate(buckets.obvious),
      easy: sampleRate(buckets.easy),
      medium: sampleRate(buckets.medium),
      hard: sampleRate(buckets.hard),
      obscure: sampleRate(buckets.obscure),
    };
  }
  const equalish = cohortSummary.average_700;
  if (equalish && (equalish.playerWinRate > 0.80 || equalish.playerWinRate < 0.20)) impossibleResults.push(`average cohort win rate impossible: ${equalish.playerWinRate}`);
  const beginner = cohortSummary.beginner_0;
  if (beginner && (beginner.playerWinRate < 0.48 || beginner.playerWinRate > 0.84)) impossibleResults.push(`beginner_0 win rate outside healthy range: ${beginner.playerWinRate}`);
  if (botDecisions > 0 && botTimeouts === 0) impossibleResults.push('bot never timed out');
  if (botDecisions > 0 && botMistakes === 0) impossibleResults.push('bot never made mistakes');
  if (Math.abs(trophyInflation / Math.max(1, matches)) > 14) impossibleResults.push(`large trophy inflation: ${trophyInflation / matches}`);

  return {
    matches,
    playerWinRate: playerWins / matches,
    avgTrophyDelta: trophyDeltaTotal / matches,
    trophyInflation,
    botTimeoutRate: botTimeouts / Math.max(1, botDecisions),
    botMistakeRate: botMistakes / Math.max(1, botDecisions),
    impossibleResults,
    cohorts: cohortSummary,
    cohortDiagnostics,
    responseTime: { min: sorted[0] ?? 0, p50: p(0.5), p95: p(0.95), max: sorted[sorted.length - 1] ?? 0 },
    responseTimeBySkill,
    botKnowledgeCurve,
    population: runPopulationSimulation(seed),
  };
}

function sampleRate(value: { knows: number; n: number } | undefined): number {
  return value?.n ? value.knows / value.n : 0;
}

function percentileSummary(values: number[]): { p10: number; p50: number; p90: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);
  return { p10: p(0.10), p50: p(0.50), p90: p(0.90) };
}

function losses(n: number, opponentSkillMean: number, accuracy: number, scoreFor: number, scoreAgainst: number, lowInteraction = false): SkillRecentMatch[] {
  return Array.from({ length: n }, (_, i) => ({
    at: new Date(Date.now() - i * 8 * 60_000).toISOString(),
    opponentType: 'BOT' as const,
    opponentSkillMean,
    won: false,
    expected: 0.5,
    scoreFor: lowInteraction ? 0 : scoreFor,
    scoreAgainst,
    accuracy: lowInteraction ? 0 : accuracy,
    medianResponseTimeMs: lowInteraction ? null : 7200,
    skillDelta: -18,
  }));
}

function wins(n: number, opponentSkillMean: number, accuracy: number, scoreFor: number, scoreAgainst: number, responseMs: number): SkillRecentMatch[] {
  return Array.from({ length: n }, (_, i) => ({
    at: new Date(Date.now() - i * 8 * 60_000).toISOString(),
    opponentType: 'BOT' as const,
    opponentSkillMean,
    won: true,
    expected: 0.5,
    scoreFor,
    scoreAgainst,
    accuracy,
    medianResponseTimeMs: responseMs,
    skillDelta: 24,
  }));
}

export function runPopulationSimulation(seed = 'cof-population-sim'): PopulationSimulationSummary[] {
  const rng = new SeededRandom(seed);
  return [100, 1000, 10000, 100000].map((players) => {
    const density = Math.min(1, Math.log10(players) / 5);
    const queueSamples: number[] = [];
    let botMatches = 0;
    const matches = 2000;
    for (let i = 0; i < matches; i++) {
      const localDensity = clamp(density + (rng.next() - 0.5) * 0.18, 0.02, 1);
      const wait = Math.round(350 + (1 - localDensity) * (7200 + rng.next() * 5500));
      queueSamples.push(wait);
      const botP = clamp(0.82 * (1 - localDensity) ** 1.55, 0.015, 0.88);
      if (rng.next() < botP) botMatches += 1;
    }
    queueSamples.sort((a, b) => a - b);
    return {
      players,
      estimatedBotRate: Number((botMatches / matches).toFixed(4)),
      medianQueueMs: queueSamples[Math.floor(queueSamples.length * 0.5)] ?? 0,
      p95QueueMs: queueSamples[Math.floor(queueSamples.length * 0.95)] ?? 0,
    };
  });
}
