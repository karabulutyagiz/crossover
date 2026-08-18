import { decideBotAnswer } from './botDecision.ts';
import { selectBotProfileForSkill } from './botProfiles.ts';
import { MatchmakingOrchestrator } from './policy.ts';
import { SeededRandom, clamp } from './random.ts';
import { expectedScore } from './skillRating.ts';
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
  responseTime: { min: number; p50: number; p95: number; max: number };
  population?: PopulationSimulationSummary[];
}

export interface PopulationSimulationSummary {
  players: number;
  estimatedBotRate: number;
  medianQueueMs: number;
  p95QueueMs: number;
}

const COHORTS = [
  { name: 'beginner', skillMean: 820, uncertainty: 330, trophies: 80, matches: 0 },
  { name: 'below_average', skillMean: 940, uncertainty: 250, trophies: 260, matches: 8 },
  { name: 'average', skillMean: 1080, uncertainty: 180, trophies: 700, matches: 28 },
  { name: 'above_average', skillMean: 1260, uncertainty: 130, trophies: 1600, matches: 80 },
  { name: 'expert', skillMean: 1480, uncertainty: 95, trophies: 3600, matches: 180 },
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
      seed: `${seed}:bot:${i}`,
    });
    const skillGap = profile.skillMean - cohort.skillMean;
    if (cohort.name === 'expert' && skillGap < -420) impossibleResults.push(`expert matched too low: ${skillGap}`);
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
      if (decision.willAnswer) responseTimes.push(decision.reactionDelayMs);
      const playerKnows = rng.next() < clamp((cohort.skillMean - 650) / 1050 - difficulty * 0.38 + 0.20, 0.05, 0.96);
      const playerDelay = playerKnows ? 900 + rng.next() * (6200 + difficulty * 5200) : Infinity;
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
    if (cohort.name === 'average' && predicted < 0.28) impossibleResults.push('average bot too strong');
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
  const equalish = cohortSummary.average;
  if (equalish && (equalish.playerWinRate > 0.80 || equalish.playerWinRate < 0.20)) impossibleResults.push(`average cohort win rate impossible: ${equalish.playerWinRate}`);
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
    responseTime: { min: sorted[0] ?? 0, p50: p(0.5), p95: p(0.95), max: sorted[sorted.length - 1] ?? 0 },
    population: runPopulationSimulation(seed),
  };
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
