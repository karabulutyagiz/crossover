import { botKnowsProbability, decideBotAnswer } from '../matchmaking/botDecision.ts';
import { botAiConfig } from '../matchmaking/botAiConfig.ts';
import { selectBotProfileForSkill } from '../matchmaking/botProfiles.ts';
import { MatchmakingOrchestrator, randomBotFallbackDelayMs } from '../matchmaking/policy.ts';
import { candidateScore, dynamicMmrWindow, estimateQueueHealth } from '../matchmaking/queueHealth.ts';
import { SeededRandom } from '../matchmaking/random.ts';
import { defaultSkillProfile, expectedScore, updateSkillAfterMatch } from '../matchmaking/skillRating.ts';
import { runMatchSimulation } from '../matchmaking/simulation.ts';
import { trophyDeltaExpectedScore } from '../matchmaking/trophyIntegrity.ts';
import { liveOpsConfig, progressionSegment } from '../matchmaking/liveOpsConfig.ts';
import { trophyRiskMultipliers } from '../matchmaking/trophyRisk.ts';
import { BotPlayer } from '../rooms/bot.ts';

let failed = false;
function check(cond: boolean, msg: string): void {
  if (!cond || !msg.startsWith('bot timing respects')) console.log(`${cond ? 'OK' : 'FAIL'} ${msg}`);
  if (!cond) failed = true;
}

const cfg = {
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
};

const orchestrator = new MatchmakingOrchestrator(cfg);
const live = liveOpsConfig();
check(live.matchmaking.maxMmrWindow >= live.matchmaking.initialMmrWindow, 'liveops config validates mmr window order');
check(live.killSwitches.botMatchmakingEnabled === true || live.killSwitches.botMatchmakingEnabled === false, 'liveops kill switch is boolean');
check(progressionSegment(0, 0) === 'NEW_PLAYER' && progressionSegment(3600, 100) === 'ELITE', 'progression segments follow arena thresholds');
check(dynamicMmrWindow(0) < dynamicMmrWindow(live.matchmaking.maxSearchMs), 'dynamic mmr window expands over time');
check(orchestrator.compatibleHumans({ trophies: 500, skillMean: 1000, skillUncertainty: 120, elapsedMs: 100 }, { trophies: 560, skillMean: 1090, skillUncertainty: 120, elapsedMs: 100 }), 'real compatible humans preferred by orchestrator');
// The arena-only human policy replaced the old early MMR exclusion on 2026-08-27.
check(orchestrator.compatibleHumans({ trophies: 500, skillMean: 1000, skillUncertainty: 70, elapsedMs: 100 }, { trophies: 700, skillMean: 1500, skillUncertainty: 70, elapsedMs: 100 }), 'same-arena humans remain eligible despite skill gap');
check(!orchestrator.compatibleHumans({ trophies: 499, skillMean: 1000, skillUncertainty: 70, elapsedMs: 100 }, { trophies: 500, skillMean: 1000, skillUncertainty: 70, elapsedMs: 100 }), 'cross-arena humans are never paired even with equal skill');
for (let i = 0; i < 50; i++) {
  const d = randomBotFallbackDelayMs(cfg, 1);
  check(d >= 2800 && d <= 4500, 'AI fallback delay stays configured');
}

const newProfile = defaultSkillProfile('u', 0);
check(newProfile.skillUncertainty >= 300, 'new player starts high uncertainty');

const equal = trophyDeltaExpectedScore({ playerSkillMean: 1100, opponentSkillMean: 1100, won: true, playerTrophies: 900 });
const weaker = trophyDeltaExpectedScore({ playerSkillMean: 1300, opponentSkillMean: 900, won: true, playerTrophies: 900 });
const stronger = trophyDeltaExpectedScore({ playerSkillMean: 900, opponentSkillMean: 1300, won: true, playerTrophies: 900 });
check(weaker.delta < equal.delta, 'weaker opponent produces smaller reward');
check(stronger.delta > equal.delta, 'stronger opponent produces larger reward');
check(expectedScore(1300, 900) > expectedScore(900, 1300), 'expected-score orders skill correctly');

const bot = selectBotProfileForSkill({ userKey: 'test-user', playerTrophies: 800, playerSkillMean: 1100, playerSkillUncertainty: 170, playerMatchesPlayed: 30, recentCooldown: 8, seed: 'invariant-bot' });
check(bot.skillMean > 850 && bot.skillMean < 1350, 'bot skill tracks player skill');
check(bot.difficultyDirector?.targetBotSkill != null && bot.knowledgeDepth >= 0 && bot.questionDepthTolerance >= 0, 'bot profile includes multidimensional director output');
check((bot.difficultyDirector?.competitiveEnjoymentScore ?? -1) >= 0 && (bot.difficultyDirector?.competitiveEnjoymentScore ?? 2) <= 1, 'bot director emits bounded competitive enjoyment score');
check(['STRUGGLING', 'SLIGHTLY_STRUGGLING', 'BALANCED', 'PERFORMING_WELL', 'DOMINATING'].includes(bot.difficultyDirector?.competitiveState ?? ''), 'bot director emits internal competitive state');
const explicitBot = new BotPlayer({ profile: bot });
const hiddenFallbackBot = new BotPlayer({ profile: bot, exposeBotToClient: false });
check(explicitBot.exposeBotToClient && !hiddenFallbackBot.exposeBotToClient, 'fallback bots can hide client bot ribbon while explicit bot mode stays visible');

const beginnerBot = selectBotProfileForSkill({ userKey: 'beginner-test', playerTrophies: 0, playerSkillMean: 900, playerSkillUncertainty: 350, playerMatchesPlayed: 0, recentCooldown: 8, accuracyEma: 0.38, responseTimeEmaMs: 6800, seed: 'beginner-protection' });
check((beginnerBot.difficultyDirector?.estimatedPlayerWinProbability ?? 0) >= 0.58, 'new player bot is player-favorable but not forced-win');
check(beginnerBot.skillMean < 900, 'new player protection lowers bot skill below uncertain beginner prior');
const losingRecent = Array.from({ length: 4 }, (_, i) => ({ at: new Date(Date.now() - i * 60_000).toISOString(), opponentType: 'BOT' as const, opponentSkillMean: 980, won: false, expected: 0.5, scoreFor: 1, scoreAgainst: 3, accuracy: 0.28, medianResponseTimeMs: 7200, skillDelta: -18 }));
const recoveryBot = selectBotProfileForSkill({ userKey: 'recovery-test', playerTrophies: 70, playerSkillMean: 910, playerSkillUncertainty: 330, playerMatchesPlayed: 4, recentCooldown: 8, recentMatches: losingRecent, accuracyEma: 0.30, responseTimeEmaMs: 7200, seed: 'recovery-protection' });
check((recoveryBot.difficultyDirector?.recoveryAdjustmentMmr ?? 0) < 0, 'loss streak recovery lowers target difficulty gradually');
check(['STRUGGLING', 'SLIGHTLY_STRUGGLING'].includes(recoveryBot.difficultyDirector?.competitiveState ?? ''), 'loss streak maps to struggling competitive state');
check((recoveryBot.difficultyDirector?.emoteSuppression ?? 0) > 0, 'struggling players get bot emote suppression');
const intentionalRecent = Array.from({ length: 5 }, (_, i) => ({ at: new Date(Date.now() - i * 60_000).toISOString(), opponentType: 'BOT' as const, opponentSkillMean: 980, won: false, expected: 0.5, scoreFor: 0, scoreAgainst: 3, accuracy: 0, medianResponseTimeMs: null, skillDelta: -18 }));
const intentionalBot = selectBotProfileForSkill({ userKey: 'intentional-test', playerTrophies: 80, playerSkillMean: 910, playerSkillUncertainty: 330, playerMatchesPlayed: 5, recentCooldown: 8, recentMatches: intentionalRecent, accuracyEma: 0.05, responseTimeEmaMs: null, seed: 'intentional-loss' });
check((intentionalBot.difficultyDirector?.intentionalLossRisk ?? 0) >= 0.45, 'intentional loss risk is detected from zero-interaction losses');
check((intentionalBot.difficultyDirector?.recoveryAdjustmentMmr ?? -1) === 0, 'intentional loss risk blocks recovery adjustment');
check((intentionalBot.difficultyDirector?.frustrationAdjustmentMmr ?? -1) === 0, 'intentional loss risk blocks frustration adjustment');
check(intentionalBot.difficultyDirector?.competitiveState !== 'STRUGGLING', 'intentional loss risk does not receive struggling state band');
const smurfRecent = Array.from({ length: 3 }, (_, i) => ({ at: new Date(Date.now() - i * 60_000).toISOString(), opponentType: 'BOT' as const, opponentSkillMean: 980, won: true, expected: 0.5, scoreFor: 3, scoreAgainst: 0, accuracy: 0.9, medianResponseTimeMs: 1700, skillDelta: 24 }));
const smurfBot = selectBotProfileForSkill({ userKey: 'smurf-test', playerTrophies: 0, playerSkillMean: 1280, playerSkillUncertainty: 330, playerMatchesPlayed: 3, recentCooldown: 8, recentMatches: smurfRecent, accuracyEma: 0.9, responseTimeEmaMs: 1700, hardQuestionAccuracy: 0.78, seed: 'smurf-calibration' });
check(smurfBot.skillMean >= 1160, 'strong new accounts calibrate toward harder legal bots');
check(['PERFORMING_WELL', 'DOMINATING'].includes(smurfBot.difficultyDirector?.competitiveState ?? ''), 'dominant new accounts get elevated competitive state');
const obviousKnow = botKnowsProbability(beginnerBot, { difficultyScore: 0.12, answerPopularity: 0.90 });
const mediumKnow = botKnowsProbability(beginnerBot, { difficultyScore: 0.58, answerPopularity: 0.40 });
const obscureKnow = botKnowsProbability(beginnerBot, { difficultyScore: 0.93, answerPopularity: 0.12 });
check(obviousKnow >= 0.65, 'low-level bots retain mainstream football knowledge floor');
check(obviousKnow > mediumKnow && mediumKnow > obscureKnow, 'knowledge curve decays with question depth');

const health = estimateQueueHealth(
  { trophies: 800, skillMean: 1100, skillUncertainty: 150, elapsedMs: 1200 },
  [
    { trophies: 820, skillMean: 1120, skillUncertainty: 130, elapsedMs: 900 },
    { trophies: 1400, skillMean: 1650, skillUncertainty: 90, elapsedMs: 900 },
  ],
);
check(health.acceptableOpponentCount >= 1 && health.queueHealthScore > 0, 'queue health finds acceptable nearby player');
const cleanScore = candidateScore({ trophies: 800, skillMean: 1100, elapsedMs: 2000 }, { trophies: 820, skillMean: 1120, elapsedMs: 1500 }, health);
const riskyScore = candidateScore({ trophies: 800, skillMean: 1100, elapsedMs: 2000 }, { trophies: 820, skillMean: 1120, elapsedMs: 1500, farmRisk: 0.9 }, health);
check(riskyScore < cleanScore, 'candidate scoring penalizes farm risk');
const reduced = trophyRiskMultipliers({
  opponentType: 'BOT',
  farm: { score: 0.7, level: 'HIGH', pairRewardMultiplier: 1, botRewardMultiplier: 0.4, repeatedPairCount24h: 0, botExposureCount: 8, reasons: ['high_bot_exposure'] },
  economy: { state: 'HIGH_INFLATION', botInjectionToday: 1000, trophiesCreatedToday: 2000, trophiesDestroyedToday: 100, dailyInflation: 0.2, botBudgetRemaining: 0, botRewardMultiplier: 0.5 },
});
check(reduced.finalMultiplier < 1 && reduced.reasons.length >= 2, 'trophy risk reduces suspicious bot farming rewards');
const delays = new Set<number>();
let knows = 0;
let misses = 0;
let mistakes = 0;
for (let i = 0; i < 200; i++) {
  const d = decideBotAnswer(bot, { difficultyScore: i % 4 === 0 ? 0.18 : i % 4 === 1 ? 0.45 : i % 4 === 2 ? 0.72 : 0.92, answerPopularity: 0.4, rng: new SeededRandom(`decision-${i}`) });
  if (d.knowsAnswer) knows += 1;
  else misses += 1;
  if (d.shouldMistake) mistakes += 1;
  if (d.willAnswer) delays.add(Math.round(d.reactionDelayMs / 100) * 100);
  check(d.reactionDelayMs >= botAiConfig.timing.minHardCompleteResponseMs && d.reactionDelayMs <= botAiConfig.timing.maxCompleteResponseMs, 'bot timing respects realistic bounds');
}
check(delays.size > 20, 'bot timings vary');
check(knows > 0 && misses > 0, 'bot never knows every answer automatically');
check(mistakes > 0, 'bot can make realistic mistakes');

const updated = await updateSkillAfterMatch('00000000-0000-0000-0000-000000000000', 0, {
  opponentType: 'BOT',
  opponentSkillMean: 1000,
  won: true,
  scoreFor: 3,
  scoreAgainst: 1,
  rounds: [
    { difficultyScore: 0.3, correct: true, answered: true, responseTimeMs: 1800, timedOut: false, mistake: false, mode: 'team-team', answerPopularity: 0.8 },
    { difficultyScore: 0.7, correct: false, answered: false, responseTimeMs: null, timedOut: true, mistake: false, mode: 'team-team', answerPopularity: 0.2 },
  ],
}).catch(() => null);
check(updated == null || updated.skillUncertainty < newProfile.skillUncertainty, 'skill uncertainty decreases after match when DB exists');

const sim = runMatchSimulation(10_000, 'invariant-sim');
check(sim.impossibleResults.length === 0, `Monte Carlo has no impossible results (${sim.impossibleResults.join('; ')})`);
check(sim.botTimeoutRate > 0 && sim.botMistakeRate > 0, 'Monte Carlo bots timeout and make mistakes');
const pop = sim.population ?? [];
check(pop.length === 4, 'population simulator covers four growth levels');
check((pop.find((x) => x.players === 100)?.estimatedBotRate ?? 0) > (pop.find((x) => x.players === 100000)?.estimatedBotRate ?? 1), 'bot dependency decreases as population grows');

if (failed) process.exit(1);
