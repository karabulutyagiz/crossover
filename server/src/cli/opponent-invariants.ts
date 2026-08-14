import { decideBotAnswer } from '../matchmaking/botDecision.ts';
import { selectBotProfileForSkill } from '../matchmaking/botProfiles.ts';
import { MatchmakingOrchestrator, randomBotFallbackDelayMs } from '../matchmaking/policy.ts';
import { SeededRandom } from '../matchmaking/random.ts';
import { defaultSkillProfile, expectedScore, updateSkillAfterMatch } from '../matchmaking/skillRating.ts';
import { runMatchSimulation } from '../matchmaking/simulation.ts';
import { trophyDeltaExpectedScore } from '../matchmaking/trophyIntegrity.ts';

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
check(orchestrator.compatibleHumans({ trophies: 500, skillMean: 1000, skillUncertainty: 120, elapsedMs: 100 }, { trophies: 560, skillMean: 1090, skillUncertainty: 120, elapsedMs: 100 }), 'real compatible humans preferred by orchestrator');
check(!orchestrator.compatibleHumans({ trophies: 500, skillMean: 1000, skillUncertainty: 70, elapsedMs: 100 }, { trophies: 700, skillMean: 1500, skillUncertainty: 70, elapsedMs: 100 }), 'far skill humans not paired too early');
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
  check(d.reactionDelayMs >= 850 && d.reactionDelayMs <= 17000, 'bot timing respects realistic bounds');
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

if (failed) process.exit(1);
