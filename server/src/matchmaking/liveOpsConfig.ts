import { config } from '../config.ts';
import { ARENAS } from '../game/rank.ts';

type RolloutStage = 'development' | 'staging' | 'internal' | 'percent' | 'all';

export interface LiveOpsMatchmakingConfig {
  rollout: { stage: RolloutStage; percentage: number; experimentSalt: string };
  killSwitches: {
    botMatchmakingEnabled: boolean;
    adaptiveDifficultyEnabled: boolean;
    antiFarmEnabled: boolean;
    trophyEconomyControllerEnabled: boolean;
    recoveryMatchesEnabled: boolean;
  };
  matchmaking: {
    initialMmrWindow: number;
    maxMmrWindow: number;
    initialTrophyWindow: number;
    maxTrophyWindow: number;
    preferredRealWaitMs: number;
    botEligibilityWaitMs: number;
    maxSearchMs: number;
    maxMmrGap: number;
    maxTrophyGap: number;
    queueHealthBotThreshold: number;
    recentOpponentRelaxMs: number;
  };
  bots: {
    repeatIdentityCooldown: number;
    maxBotRatioBySegment: Record<ProgressionSegment, number>;
    highProgressionMinQueueHealth: number;
    eliteBotsEnabled: boolean;
    maxDifficultyAdjustment: number;
  };
  recovery: {
    frustrationThreshold: number;
    dominanceThreshold: number;
    maxAdjustmentMmr: number;
    cooldownMs: number;
    intentionalLossBlockThreshold: number;
  };
  antiFarm: {
    repeatedOpponentWindowMs: number;
    pairDecayStart: number;
    pairDecayFloor: number;
    highRiskThreshold: number;
    criticalRiskThreshold: number;
    botExposureWindowMs: number;
    botExposureDecayStart: number;
    botExposureDecayFloor: number;
  };
  trophyEconomy: {
    targetDailyInflationMin: number;
    targetDailyInflationMax: number;
    botInjectionBudgetDaily: number;
    adjustmentSpeed: number;
    minMultiplier: number;
    maxMultiplier: number;
  };
}

export type ProgressionSegment = 'NEW_PLAYER' | 'EARLY' | 'MID' | 'HIGH' | 'ELITE';

const DEFAULTS: LiveOpsMatchmakingConfig = {
  rollout: {
    stage: (process.env.NODE_ENV === 'production' ? 'percent' : 'development'),
    percentage: 100,
    experimentSalt: 'crossover-matchmaking-v1',
  },
  killSwitches: {
    botMatchmakingEnabled: true,
    adaptiveDifficultyEnabled: true,
    antiFarmEnabled: true,
    trophyEconomyControllerEnabled: true,
    recoveryMatchesEnabled: true,
  },
  matchmaking: {
    initialMmrWindow: config.matchmaking.initialSkillRange,
    maxMmrWindow: Math.max(config.matchmaking.expandedSkillRange, 720),
    initialTrophyWindow: config.matchmaking.initialTrophyRange,
    maxTrophyWindow: Math.max(config.matchmaking.expandedTrophyRange, 900),
    preferredRealWaitMs: config.matchmaking.realPlayerSearchWindowMs,
    botEligibilityWaitMs: config.matchmaking.botFallbackMinDelayMs,
    maxSearchMs: config.matchmaking.matchmakingTimeoutMs,
    maxMmrGap: 920,
    maxTrophyGap: 1600,
    queueHealthBotThreshold: 0.46,
    recentOpponentRelaxMs: 18_000,
  },
  bots: {
    repeatIdentityCooldown: config.matchmaking.recentBotCooldown,
    maxBotRatioBySegment: { NEW_PLAYER: 0.95, EARLY: 0.85, MID: 0.62, HIGH: 0.28, ELITE: 0.08 },
    highProgressionMinQueueHealth: 0.28,
    eliteBotsEnabled: false,
    maxDifficultyAdjustment: 0.16,
  },
  recovery: {
    frustrationThreshold: 0.58,
    dominanceThreshold: 0.68,
    maxAdjustmentMmr: 115,
    cooldownMs: 45 * 60_000,
    intentionalLossBlockThreshold: 0.62,
  },
  antiFarm: {
    repeatedOpponentWindowMs: 24 * 60 * 60_000,
    pairDecayStart: 3,
    pairDecayFloor: 0.08,
    highRiskThreshold: 0.58,
    criticalRiskThreshold: 0.82,
    botExposureWindowMs: 60 * 60_000,
    botExposureDecayStart: 5,
    botExposureDecayFloor: 0.18,
  },
  trophyEconomy: {
    targetDailyInflationMin: -0.02,
    targetDailyInflationMax: 0.08,
    botInjectionBudgetDaily: 60_000,
    adjustmentSpeed: 0.12,
    minMultiplier: 0.12,
    maxMultiplier: 1.18,
  },
};

let lastGood: LiveOpsMatchmakingConfig = DEFAULTS;

export function liveOpsConfig(): LiveOpsMatchmakingConfig {
  const candidate: LiveOpsMatchmakingConfig = {
    ...DEFAULTS,
    rollout: {
      stage: rolloutStageEnv('MATCHMAKING_ROLLOUT_STAGE', DEFAULTS.rollout.stage),
      percentage: pct('MATCHMAKING_ROLLOUT_PERCENTAGE', DEFAULTS.rollout.percentage),
      experimentSalt: str('MATCHMAKING_EXPERIMENT_SALT', DEFAULTS.rollout.experimentSalt),
    },
    killSwitches: {
      botMatchmakingEnabled: bool('BOT_MATCHMAKING_ENABLED', DEFAULTS.killSwitches.botMatchmakingEnabled),
      adaptiveDifficultyEnabled: bool('ADAPTIVE_DIFFICULTY_ENABLED', DEFAULTS.killSwitches.adaptiveDifficultyEnabled),
      antiFarmEnabled: bool('ANTI_FARM_ENABLED', DEFAULTS.killSwitches.antiFarmEnabled),
      trophyEconomyControllerEnabled: bool('TROPHY_ECONOMY_CONTROLLER_ENABLED', DEFAULTS.killSwitches.trophyEconomyControllerEnabled),
      recoveryMatchesEnabled: bool('RECOVERY_MATCHES_ENABLED', DEFAULTS.killSwitches.recoveryMatchesEnabled),
    },
    matchmaking: {
      initialMmrWindow: int('MM_INITIAL_MMR_WINDOW', DEFAULTS.matchmaking.initialMmrWindow),
      maxMmrWindow: int('MM_MAX_MMR_WINDOW', DEFAULTS.matchmaking.maxMmrWindow),
      initialTrophyWindow: int('MM_INITIAL_TROPHY_WINDOW', DEFAULTS.matchmaking.initialTrophyWindow),
      maxTrophyWindow: int('MM_MAX_TROPHY_WINDOW', DEFAULTS.matchmaking.maxTrophyWindow),
      preferredRealWaitMs: int('MM_PREFERRED_REAL_WAIT_MS', DEFAULTS.matchmaking.preferredRealWaitMs),
      botEligibilityWaitMs: int('MM_BOT_ELIGIBILITY_WAIT_MS', DEFAULTS.matchmaking.botEligibilityWaitMs),
      maxSearchMs: int('MM_MAX_SEARCH_MS', DEFAULTS.matchmaking.maxSearchMs),
      maxMmrGap: int('MM_MAX_MMR_GAP', DEFAULTS.matchmaking.maxMmrGap),
      maxTrophyGap: int('MM_MAX_TROPHY_GAP', DEFAULTS.matchmaking.maxTrophyGap),
      queueHealthBotThreshold: num('MM_QUEUE_HEALTH_BOT_THRESHOLD', DEFAULTS.matchmaking.queueHealthBotThreshold),
      recentOpponentRelaxMs: int('MM_RECENT_OPPONENT_RELAX_MS', DEFAULTS.matchmaking.recentOpponentRelaxMs),
    },
    bots: DEFAULTS.bots,
    recovery: DEFAULTS.recovery,
    antiFarm: DEFAULTS.antiFarm,
    trophyEconomy: DEFAULTS.trophyEconomy,
  };
  if (!validate(candidate)) return lastGood;
  lastGood = candidate;
  return candidate;
}

export function progressionSegment(trophies: number, matchesPlayed = 0): ProgressionSegment {
  if (matchesPlayed < 8 || trophies < ARENAS[1]!.minTrophies) return 'NEW_PLAYER';
  if (trophies < ARENAS[2]!.minTrophies) return 'EARLY';
  if (trophies < ARENAS[4]!.minTrophies) return 'MID';
  if (trophies < ARENAS[5]!.minTrophies) return 'HIGH';
  return 'ELITE';
}

export function stableRolloutBucket(playerId: string, salt = liveOpsConfig().rollout.experimentSalt): number {
  let h = 2166136261;
  const s = `${salt}:${playerId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 100;
}

function validate(cfg: LiveOpsMatchmakingConfig): boolean {
  const m = cfg.matchmaking;
  if (m.initialMmrWindow < 0 || m.maxMmrWindow < m.initialMmrWindow || m.maxMmrGap < m.maxMmrWindow) return false;
  if (m.initialTrophyWindow < 0 || m.maxTrophyWindow < m.initialTrophyWindow || m.maxTrophyGap < m.maxTrophyWindow) return false;
  if (m.preferredRealWaitMs < 0 || m.botEligibilityWaitMs < 0 || m.maxSearchMs < m.botEligibilityWaitMs) return false;
  if (cfg.trophyEconomy.minMultiplier < 0 || cfg.trophyEconomy.maxMultiplier > 2 || cfg.trophyEconomy.minMultiplier > cfg.trophyEconomy.maxMultiplier) return false;
  if (cfg.antiFarm.pairDecayFloor < 0 || cfg.antiFarm.pairDecayFloor > 1) return false;
  return true;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function int(name: string, fallback: number): number { return Math.round(num(name, fallback)); }
function pct(name: string, fallback: number): number { return Math.max(0, Math.min(100, num(name, fallback))); }
function str(name: string, fallback: string): string { return process.env[name] || fallback; }

function rolloutStageEnv(name: string, fallback: RolloutStage): RolloutStage {
  const raw = process.env[name];
  return raw === 'development' || raw === 'staging' || raw === 'internal' || raw === 'percent' || raw === 'all' ? raw : fallback;
}
