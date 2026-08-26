import { ARENAS, getArena } from '../game/rank.ts';
import { selectBotProfile, selectBotProfileForSkill, botTrophiesForPlayer } from '../matchmaking/botProfiles.ts';
import { compatibleTrophies, potentialTrophyCompatibility, randomBotFallbackDelayMs, shouldHoldForHumanLiquidity, trophyRangeForElapsed } from '../matchmaking/policy.ts';

const cfg = {
  realPlayerSearchWindowMs: 1200,
  expandedSearchWindowMs: 2500,
  botFallbackMinDelayMs: 1800,
  botFallbackMaxDelayMs: 3800,
  initialTrophyRange: 100,
  expandedTrophyRange: 450,
  matchmakingTimeoutMs: 15000,
  botFallbackPercentage: 100,
  humanLiquidityHoldMs: 6500,
  botFallbackRetryMs: 700,
  initialSkillRange: 180,
  expandedSkillRange: 520,
};

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

for (const trophies of [0, 80, 240, 520, 1240, 2300, 3900, 5200]) {
  const difficulties = new Map<string, number>();
  for (let i = 0; i < 80; i++) {
    const bot = selectBotProfile(`test-${trophies}`, trophies, 6);
    assert(bot.displayName && !/bot|cpu|ai|computer|ivan|hugo|luca|marco|bruno|diego|dante/i.test(bot.displayName), `bad bot name: ${bot.displayName}`);
    assert(/^[A-Za-zÇĞİÖŞÜçğıöşü]+$/.test(bot.displayName), `bot name should not contain numbers or symbols: ${bot.displayName}`);
    assert(bot.trophyRating >= 0, 'negative bot trophies');
    assert(ARENAS.includes(bot.arena), 'unknown bot arena');
    assert(bot.arena.minTrophies <= bot.trophyRating, 'impossible bot arena/trophy combo');
    assert(bot.arena === getArena(trophies), `bot arena mismatch for ${trophies}: ${bot.trophyRating}`);
    assert(bot.avatarId.startsWith('pp'), 'missing avatar');
    assert(bot.skillRating >= 0.1 && bot.skillRating <= 0.98, 'skill out of range');
    difficulties.set(bot.difficulty, (difficulties.get(bot.difficulty) ?? 0) + 1);
  }
  if (trophies < 1000) assert((difficulties.get('hard') ?? 0) <= 4, `too many hard low/mid bots for ${trophies}`);
  const sample = Array.from({ length: 200 }, () => botTrophiesForPlayer(trophies));
  assert(new Set(sample).size > 40, `trophy generation too repetitive for ${trophies}`);
}

const reservedBot = selectBotProfileForSkill({ userKey: 'reserved-test', playerTrophies: 800, playerSkillMean: 1100, playerSkillUncertainty: 170, playerMatchesPlayed: 30, recentCooldown: 8, seed: 'reserved-identity' });
const alternateBot = selectBotProfileForSkill({
  userKey: 'reserved-test-2',
  playerTrophies: 800,
  playerSkillMean: 1100,
  playerSkillUncertainty: 170,
  playerMatchesPlayed: 30,
  recentCooldown: 8,
  blockedBotIds: new Set([reservedBot.id]),
  blockedBotDisplayNames: new Set([reservedBot.displayName.toLowerCase()]),
  seed: 'reserved-identity',
});
assert(alternateBot.id !== reservedBot.id, 'active bot id should be excluded');
assert(alternateBot.displayName.toLowerCase() !== reservedBot.displayName.toLowerCase(), 'active bot display name should be excluded');

assert(trophyRangeForElapsed(0, cfg) === 100, 'initial range mismatch');
assert(trophyRangeForElapsed(2500, cfg) === 450, 'expanded range mismatch');
assert(compatibleTrophies(1000, 1080, 100, 100, cfg), 'close trophies should match');
assert(!compatibleTrophies(1000, 1400, 100, 100, cfg), 'far trophies should not match early');
assert(compatibleTrophies(1000, 1400, 3000, 3000, cfg), 'far trophies should match after expansion');
assert(potentialTrophyCompatibility(1000, 1400, cfg), 'expanded-range human should be potential liquidity');
assert(!potentialTrophyCompatibility(1000, 1800, cfg), 'outside expanded range should not hold fallback');
assert(shouldHoldForHumanLiquidity(3200, true, cfg), 'should hold bot while human liquidity exists');
assert(!shouldHoldForHumanLiquidity(7000, true, cfg), 'should stop holding after liquidity window');
assert(!shouldHoldForHumanLiquidity(3200, false, cfg), 'should not hold without human liquidity');
for (let i = 0; i < 100; i++) {
  const d = randomBotFallbackDelayMs(cfg, 1);
  assert(d >= 1800 && d <= 3800, 'fallback delay outside range');
}

console.log('✓ Hybrid matchmaking pure checks passed.');
