import { config } from '../config.ts';
import { ARENAS } from '../game/rank.ts';

type RolloutStage = 'development' | 'staging' | 'internal' | 'percent' | 'all';

export interface LiveOpsMatchmakingConfig {
  rollout: { stage: RolloutStage; percentage: number; experimentSalt: string };
  killSwitches: {
    botMatchmakingEnabled: boolean;
    adaptiveDifficultyEnabled: boolean;
    newPlayerProtectionEnabled: boolean;
    recoveryAdjustmentEnabled: boolean;
    botKnowledgeFloorEnabled: boolean;
    botDifficultyLiveTuningEnabled: boolean;
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
  botDifficulty: {
    algorithmVersion: string;
    balanceVersion: string;
    liveOpsSkillOffsetMmr: number;
    newPlayerSkillOffsetMmr: number;
    earlyProgressionSkillOffsetMmr: number;
    recoveryMaxAdjustmentMmr: number;
    dominanceMaxAdjustmentMmr: number;
    lossStreakSensitivity: number;
    blowoutLossWeight: number;
    closeLossWeight: number;
    intentionalLossBlockThreshold: number;
    maxBotSkillStepMmr: number;
    smurfAccelerationMmr: number;
    frustrationAdjustmentMmr: number;
    momentumAdjustmentMmr: number;
    blowoutSensitivity: number;
    emoteFrustrationSensitivity: number;
    targetCompetitiveProbabilityByState: Record<CompetitiveState, { min: number; max: number }>;
    engagementWeights: {
      closeness: number;
      lowFrustration: number;
      masteryOpportunity: number;
      nonToxicity: number;
    };
    targetWinProbabilityBySegment: Record<ProgressionSegment, { min: number; max: number }>;
    knowledgeFloorByDifficulty: {
      veryEasy: number;
      easy: number;
      medium: number;
      hard: number;
      obscure: number;
    };
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
export type CompetitiveState = 'STRUGGLING' | 'SLIGHTLY_STRUGGLING' | 'BALANCED' | 'PERFORMING_WELL' | 'DOMINATING';

const DEFAULTS: LiveOpsMatchmakingConfig = {
  rollout: {
    stage: (process.env.NODE_ENV === 'production' ? 'percent' : 'development'),
    percentage: 100,
    experimentSalt: 'crossover-matchmaking-v1',
  },
  killSwitches: {
    botMatchmakingEnabled: true,
    adaptiveDifficultyEnabled: true,
    newPlayerProtectionEnabled: true,
    recoveryAdjustmentEnabled: true,
    botKnowledgeFloorEnabled: true,
    botDifficultyLiveTuningEnabled: true,
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
    // Oran, erken bot düşüşünü seyreltir (yüksek segment insan rakibi daha uzun
    // bekler); 15 sn güvenlik ağını ASLA kapatmaz — rakipsiz kalan oyuncu olamaz.
    maxBotRatioBySegment: { NEW_PLAYER: 0.95, EARLY: 0.85, MID: 0.62, HIGH: 0.28, ELITE: 0.08 },
    highProgressionMinQueueHealth: 0.28,
    // true (2026-08-27): false iken 3500+ oyuncu insan yoksa "Rakip bulunamadı"
    // görüyordu — kimse rakipsiz kalmaz kararıyla elit botlar da açıldı.
    eliteBotsEnabled: true,
    maxDifficultyAdjustment: 0.16,
  },
  recovery: {
    frustrationThreshold: 0.58,
    dominanceThreshold: 0.68,
    maxAdjustmentMmr: 115,
    cooldownMs: 45 * 60_000,
    intentionalLossBlockThreshold: 0.62,
  },
  botDifficulty: {
    algorithmVersion: 'engagement-safe-director-v2',
    balanceVersion: '2026-08-27-retention-first',
    liveOpsSkillOffsetMmr: 0,
    newPlayerSkillOffsetMmr: 150,
    earlyProgressionSkillOffsetMmr: 78,
    recoveryMaxAdjustmentMmr: 115,
    // 130 → 95: seri yapan oyuncuyu "duvara çarptırmak" hile hissi veriyor —
    // sıcak seri bir tutundurma motorudur, kırılmaz, sadece hafif zorlaşır.
    dominanceMaxAdjustmentMmr: 95,
    lossStreakSensitivity: 0.17,
    blowoutLossWeight: 0.20,
    closeLossWeight: 0.05,
    intentionalLossBlockThreshold: 0.62,
    maxBotSkillStepMmr: 90,
    smurfAccelerationMmr: 185,
    frustrationAdjustmentMmr: 115,
    momentumAdjustmentMmr: 100,
    blowoutSensitivity: 0.22,
    emoteFrustrationSensitivity: 0.72,
    // TUTUNDURMA-ÖNCELİK (kullanıcı kararı 2026-08-27): 1 numaralı hedef
    // oyuncuyu oyunda tutmak. Kayıp, kazancın ~2 katı acı verir (kayıptan
    // kaçınma) — bot-ağırlıklı bir merdivende oyuncu NET kazanan olmalı.
    // Bantlar oyuncu-lehine kaydırıldı; DOMINATING bile ≥0.46 (seri sürsün).
    targetCompetitiveProbabilityByState: {
      STRUGGLING: { min: 0.66, max: 0.76 },
      SLIGHTLY_STRUGGLING: { min: 0.60, max: 0.68 },
      BALANCED: { min: 0.54, max: 0.62 },
      PERFORMING_WELL: { min: 0.50, max: 0.58 },
      DOMINATING: { min: 0.46, max: 0.53 },
    },
    engagementWeights: {
      closeness: 0.36,
      lowFrustration: 0.28,
      masteryOpportunity: 0.18,
      nonToxicity: 0.18,
    },
    targetWinProbabilityBySegment: {
      NEW_PLAYER: { min: 0.68, max: 0.78 },
      EARLY: { min: 0.62, max: 0.72 },
      MID: { min: 0.56, max: 0.64 },
      HIGH: { min: 0.52, max: 0.60 },
      ELITE: { min: 0.48, max: 0.55 },
    },
    knowledgeFloorByDifficulty: {
      veryEasy: 0.74,
      easy: 0.62,
      medium: 0.34,
      hard: 0.16,
      obscure: 0.06,
    },
  },
  antiFarm: {
    repeatedOpponentWindowMs: 24 * 60 * 60_000,
    // İnsan-insan ikili farm (danışıklı) SIKI kalır — gerçek suistimal orada.
    pairDecayStart: 3,
    pairDecayFloor: 0.08,
    highRiskThreshold: 0.58,
    criticalRiskThreshold: 0.82,
    botExposureWindowMs: 60 * 60_000,
    // 5→10 ve 0.18→0.45 (2026-08-27): saatte 6-10 bot maçı FARM DEĞİL, bağlı
    // oyuncunun normal seansı. 5. maçtan sonra kupanın 28'den 5'e düşmesi en
    // hevesli oyuncuyu cezalandırıyordu — antifarm 1 numaralı öncelik değil.
    botExposureDecayStart: 10,
    botExposureDecayFloor: 0.45,
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
      botMatchmakingEnabled: boolAny(['BOT_MATCHMAKING_ENABLED'], DEFAULTS.killSwitches.botMatchmakingEnabled),
      adaptiveDifficultyEnabled: boolAny(['ADAPTIVE_BOT_DIFFICULTY_ENABLED', 'ADAPTIVE_DIFFICULTY_ENABLED'], DEFAULTS.killSwitches.adaptiveDifficultyEnabled),
      newPlayerProtectionEnabled: boolAny(['NEW_PLAYER_PROTECTION_ENABLED'], DEFAULTS.killSwitches.newPlayerProtectionEnabled),
      recoveryAdjustmentEnabled: boolAny(['RECOVERY_ADJUSTMENT_ENABLED', 'RECOVERY_MATCHES_ENABLED'], DEFAULTS.killSwitches.recoveryAdjustmentEnabled),
      botKnowledgeFloorEnabled: boolAny(['BOT_KNOWLEDGE_FLOOR_ENABLED'], DEFAULTS.killSwitches.botKnowledgeFloorEnabled),
      botDifficultyLiveTuningEnabled: boolAny(['BOT_DIFFICULTY_LIVE_TUNING_ENABLED'], DEFAULTS.killSwitches.botDifficultyLiveTuningEnabled),
      antiFarmEnabled: boolAny(['ANTI_FARM_ENABLED'], DEFAULTS.killSwitches.antiFarmEnabled),
      trophyEconomyControllerEnabled: boolAny(['TROPHY_ECONOMY_CONTROLLER_ENABLED'], DEFAULTS.killSwitches.trophyEconomyControllerEnabled),
      recoveryMatchesEnabled: boolAny(['RECOVERY_MATCHES_ENABLED', 'RECOVERY_ADJUSTMENT_ENABLED'], DEFAULTS.killSwitches.recoveryMatchesEnabled),
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
    // bots/recovery/antiFarm/trophyEconomy önceden DEFAULTS'a sabitlenmişti
    // ("uzaktan ayarlanır" sanılıp deploy gerektiriyordu) — artık gerçekten env'den okunur.
    bots: {
      repeatIdentityCooldown: intAny(['BOT_REPEAT_IDENTITY_COOLDOWN'], DEFAULTS.bots.repeatIdentityCooldown),
      maxBotRatioBySegment: {
        NEW_PLAYER: numAny(['MAX_BOT_RATIO_NEW_PLAYER'], DEFAULTS.bots.maxBotRatioBySegment.NEW_PLAYER),
        EARLY: numAny(['MAX_BOT_RATIO_EARLY'], DEFAULTS.bots.maxBotRatioBySegment.EARLY),
        MID: numAny(['MAX_BOT_RATIO_MID'], DEFAULTS.bots.maxBotRatioBySegment.MID),
        HIGH: numAny(['MAX_BOT_RATIO_HIGH'], DEFAULTS.bots.maxBotRatioBySegment.HIGH),
        ELITE: numAny(['MAX_BOT_RATIO_ELITE'], DEFAULTS.bots.maxBotRatioBySegment.ELITE),
      },
      highProgressionMinQueueHealth: numAny(['HIGH_PROGRESSION_MIN_QUEUE_HEALTH'], DEFAULTS.bots.highProgressionMinQueueHealth),
      eliteBotsEnabled: boolAny(['ELITE_BOTS_ENABLED'], DEFAULTS.bots.eliteBotsEnabled),
      maxDifficultyAdjustment: numAny(['BOT_MAX_DIFFICULTY_ADJUSTMENT'], DEFAULTS.bots.maxDifficultyAdjustment),
    },
    recovery: {
      frustrationThreshold: numAny(['RECOVERY_FRUSTRATION_THRESHOLD'], DEFAULTS.recovery.frustrationThreshold),
      dominanceThreshold: numAny(['RECOVERY_DOMINANCE_THRESHOLD'], DEFAULTS.recovery.dominanceThreshold),
      maxAdjustmentMmr: intAny(['RECOVERY_MAX_ADJUSTMENT_MMR', 'RECOVERY_MAX_ADJUSTMENT'], DEFAULTS.recovery.maxAdjustmentMmr),
      cooldownMs: intAny(['RECOVERY_COOLDOWN_MS'], DEFAULTS.recovery.cooldownMs),
      intentionalLossBlockThreshold: numAny(['INTENTIONAL_LOSS_BLOCK_THRESHOLD'], DEFAULTS.recovery.intentionalLossBlockThreshold),
    },
    botDifficulty: {
      algorithmVersion: str('BOT_DIFFICULTY_ALGORITHM_VERSION', DEFAULTS.botDifficulty.algorithmVersion),
      balanceVersion: str('BOT_DIFFICULTY_BALANCE_VERSION', DEFAULTS.botDifficulty.balanceVersion),
      liveOpsSkillOffsetMmr: intAny(['BOT_DIFFICULTY_LIVEOPS_OFFSET_MMR'], DEFAULTS.botDifficulty.liveOpsSkillOffsetMmr),
      newPlayerSkillOffsetMmr: intAny(['NEW_PLAYER_SKILL_OFFSET_MMR'], DEFAULTS.botDifficulty.newPlayerSkillOffsetMmr),
      earlyProgressionSkillOffsetMmr: intAny(['EARLY_PROGRESSION_SKILL_OFFSET_MMR'], DEFAULTS.botDifficulty.earlyProgressionSkillOffsetMmr),
      recoveryMaxAdjustmentMmr: intAny(['RECOVERY_MAX_ADJUSTMENT_MMR', 'RECOVERY_MAX_ADJUSTMENT'], DEFAULTS.botDifficulty.recoveryMaxAdjustmentMmr),
      dominanceMaxAdjustmentMmr: intAny(['DOMINANCE_MAX_ADJUSTMENT_MMR', 'DOMINANCE_MAX_ADJUSTMENT'], DEFAULTS.botDifficulty.dominanceMaxAdjustmentMmr),
      lossStreakSensitivity: numAny(['LOSS_STREAK_SENSITIVITY'], DEFAULTS.botDifficulty.lossStreakSensitivity),
      blowoutLossWeight: numAny(['BLOWOUT_LOSS_WEIGHT'], DEFAULTS.botDifficulty.blowoutLossWeight),
      closeLossWeight: numAny(['CLOSE_LOSS_WEIGHT'], DEFAULTS.botDifficulty.closeLossWeight),
      intentionalLossBlockThreshold: numAny(['INTENTIONAL_LOSS_BLOCK_THRESHOLD'], DEFAULTS.botDifficulty.intentionalLossBlockThreshold),
      maxBotSkillStepMmr: intAny(['MAX_BOT_SKILL_STEP_MMR', 'BOT_SKILL_SMOOTHING_MMR'], DEFAULTS.botDifficulty.maxBotSkillStepMmr),
      smurfAccelerationMmr: intAny(['SMURF_ACCELERATION_MMR'], DEFAULTS.botDifficulty.smurfAccelerationMmr),
      frustrationAdjustmentMmr: intAny(['FRUSTRATION_ADJUSTMENT_MMR'], DEFAULTS.botDifficulty.frustrationAdjustmentMmr),
      momentumAdjustmentMmr: intAny(['MOMENTUM_ADJUSTMENT_MMR'], DEFAULTS.botDifficulty.momentumAdjustmentMmr),
      blowoutSensitivity: numAny(['BLOWOUT_SENSITIVITY'], DEFAULTS.botDifficulty.blowoutSensitivity),
      emoteFrustrationSensitivity: numAny(['EMOTE_FRUSTRATION_SENSITIVITY'], DEFAULTS.botDifficulty.emoteFrustrationSensitivity),
      targetCompetitiveProbabilityByState: {
        STRUGGLING: stateBand('STRUGGLING', DEFAULTS.botDifficulty.targetCompetitiveProbabilityByState.STRUGGLING),
        SLIGHTLY_STRUGGLING: stateBand('SLIGHTLY_STRUGGLING', DEFAULTS.botDifficulty.targetCompetitiveProbabilityByState.SLIGHTLY_STRUGGLING),
        BALANCED: stateBand('BALANCED', DEFAULTS.botDifficulty.targetCompetitiveProbabilityByState.BALANCED),
        PERFORMING_WELL: stateBand('PERFORMING_WELL', DEFAULTS.botDifficulty.targetCompetitiveProbabilityByState.PERFORMING_WELL),
        DOMINATING: stateBand('DOMINATING', DEFAULTS.botDifficulty.targetCompetitiveProbabilityByState.DOMINATING),
      },
      engagementWeights: {
        closeness: numAny(['ENGAGEMENT_WEIGHT_CLOSENESS'], DEFAULTS.botDifficulty.engagementWeights.closeness),
        lowFrustration: numAny(['ENGAGEMENT_WEIGHT_LOW_FRUSTRATION'], DEFAULTS.botDifficulty.engagementWeights.lowFrustration),
        masteryOpportunity: numAny(['ENGAGEMENT_WEIGHT_MASTERY'], DEFAULTS.botDifficulty.engagementWeights.masteryOpportunity),
        nonToxicity: numAny(['ENGAGEMENT_WEIGHT_NON_TOXICITY'], DEFAULTS.botDifficulty.engagementWeights.nonToxicity),
      },
      targetWinProbabilityBySegment: {
        NEW_PLAYER: winBand('NEW_PLAYER', DEFAULTS.botDifficulty.targetWinProbabilityBySegment.NEW_PLAYER),
        EARLY: winBand('EARLY', DEFAULTS.botDifficulty.targetWinProbabilityBySegment.EARLY),
        MID: winBand('MID', DEFAULTS.botDifficulty.targetWinProbabilityBySegment.MID),
        HIGH: winBand('HIGH', DEFAULTS.botDifficulty.targetWinProbabilityBySegment.HIGH),
        ELITE: winBand('ELITE', DEFAULTS.botDifficulty.targetWinProbabilityBySegment.ELITE),
      },
      knowledgeFloorByDifficulty: {
        veryEasy: numAny(['KNOWLEDGE_FLOOR_VERY_EASY'], DEFAULTS.botDifficulty.knowledgeFloorByDifficulty.veryEasy),
        easy: numAny(['KNOWLEDGE_FLOOR_EASY'], DEFAULTS.botDifficulty.knowledgeFloorByDifficulty.easy),
        medium: numAny(['KNOWLEDGE_FLOOR_MEDIUM'], DEFAULTS.botDifficulty.knowledgeFloorByDifficulty.medium),
        hard: numAny(['KNOWLEDGE_FLOOR_HARD'], DEFAULTS.botDifficulty.knowledgeFloorByDifficulty.hard),
        obscure: numAny(['KNOWLEDGE_FLOOR_OBSCURE'], DEFAULTS.botDifficulty.knowledgeFloorByDifficulty.obscure),
      },
    },
    antiFarm: {
      repeatedOpponentWindowMs: intAny(['ANTI_FARM_PAIR_WINDOW_MS'], DEFAULTS.antiFarm.repeatedOpponentWindowMs),
      pairDecayStart: intAny(['ANTI_FARM_PAIR_DECAY_START'], DEFAULTS.antiFarm.pairDecayStart),
      pairDecayFloor: numAny(['ANTI_FARM_PAIR_DECAY_FLOOR'], DEFAULTS.antiFarm.pairDecayFloor),
      highRiskThreshold: numAny(['ANTI_FARM_HIGH_RISK_THRESHOLD'], DEFAULTS.antiFarm.highRiskThreshold),
      criticalRiskThreshold: numAny(['ANTI_FARM_CRITICAL_RISK_THRESHOLD'], DEFAULTS.antiFarm.criticalRiskThreshold),
      botExposureWindowMs: intAny(['ANTI_FARM_BOT_EXPOSURE_WINDOW_MS'], DEFAULTS.antiFarm.botExposureWindowMs),
      botExposureDecayStart: intAny(['ANTI_FARM_BOT_EXPOSURE_DECAY_START'], DEFAULTS.antiFarm.botExposureDecayStart),
      botExposureDecayFloor: numAny(['ANTI_FARM_BOT_EXPOSURE_DECAY_FLOOR'], DEFAULTS.antiFarm.botExposureDecayFloor),
    },
    trophyEconomy: {
      targetDailyInflationMin: numAny(['TROPHY_TARGET_DAILY_INFLATION_MIN'], DEFAULTS.trophyEconomy.targetDailyInflationMin),
      targetDailyInflationMax: numAny(['TROPHY_TARGET_DAILY_INFLATION_MAX'], DEFAULTS.trophyEconomy.targetDailyInflationMax),
      botInjectionBudgetDaily: intAny(['TROPHY_BOT_INJECTION_BUDGET_DAILY'], DEFAULTS.trophyEconomy.botInjectionBudgetDaily),
      adjustmentSpeed: numAny(['TROPHY_ECONOMY_ADJUSTMENT_SPEED'], DEFAULTS.trophyEconomy.adjustmentSpeed),
      minMultiplier: numAny(['TROPHY_ECONOMY_MIN_MULTIPLIER'], DEFAULTS.trophyEconomy.minMultiplier),
      maxMultiplier: numAny(['TROPHY_ECONOMY_MAX_MULTIPLIER'], DEFAULTS.trophyEconomy.maxMultiplier),
    },
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
  if (cfg.trophyEconomy.targetDailyInflationMin > cfg.trophyEconomy.targetDailyInflationMax) return false;
  if (cfg.trophyEconomy.botInjectionBudgetDaily < 0 || cfg.trophyEconomy.adjustmentSpeed < 0 || cfg.trophyEconomy.adjustmentSpeed > 1) return false;
  if (cfg.antiFarm.pairDecayFloor < 0 || cfg.antiFarm.pairDecayFloor > 1) return false;
  if (cfg.antiFarm.botExposureDecayFloor < 0 || cfg.antiFarm.botExposureDecayFloor > 1) return false;
  if (cfg.antiFarm.pairDecayStart < 1 || cfg.antiFarm.botExposureDecayStart < 1) return false;
  if (cfg.antiFarm.highRiskThreshold < 0 || cfg.antiFarm.criticalRiskThreshold > 1 || cfg.antiFarm.highRiskThreshold > cfg.antiFarm.criticalRiskThreshold) return false;
  if (cfg.antiFarm.repeatedOpponentWindowMs < 60_000 || cfg.antiFarm.botExposureWindowMs < 60_000) return false;
  for (const ratio of Object.values(cfg.bots.maxBotRatioBySegment)) {
    if (ratio < 0 || ratio > 1) return false;
  }
  if (cfg.bots.repeatIdentityCooldown < 1 || cfg.bots.highProgressionMinQueueHealth < 0 || cfg.bots.highProgressionMinQueueHealth > 1) return false;
  if (cfg.recovery.frustrationThreshold < 0 || cfg.recovery.frustrationThreshold > 1) return false;
  if (cfg.recovery.dominanceThreshold < 0 || cfg.recovery.dominanceThreshold > 1) return false;
  if (cfg.recovery.maxAdjustmentMmr < 0 || cfg.recovery.maxAdjustmentMmr > 400 || cfg.recovery.cooldownMs < 0) return false;
  if (cfg.recovery.intentionalLossBlockThreshold < 0 || cfg.recovery.intentionalLossBlockThreshold > 1) return false;
  for (const band of Object.values(cfg.botDifficulty.targetWinProbabilityBySegment)) {
    if (band.min < 0.25 || band.max > 0.80 || band.min > band.max) return false;
  }
  for (const band of Object.values(cfg.botDifficulty.targetCompetitiveProbabilityByState)) {
    if (band.min < 0.25 || band.max > 0.80 || band.min > band.max) return false;
  }
  for (const floor of Object.values(cfg.botDifficulty.knowledgeFloorByDifficulty)) {
    if (floor < 0 || floor > 0.95) return false;
  }
  if (cfg.botDifficulty.frustrationAdjustmentMmr < 0 || cfg.botDifficulty.frustrationAdjustmentMmr > 260) return false;
  if (cfg.botDifficulty.momentumAdjustmentMmr < 0 || cfg.botDifficulty.momentumAdjustmentMmr > 320) return false;
  if (cfg.botDifficulty.blowoutSensitivity < 0 || cfg.botDifficulty.blowoutSensitivity > 1) return false;
  if (cfg.botDifficulty.emoteFrustrationSensitivity < 0 || cfg.botDifficulty.emoteFrustrationSensitivity > 1) return false;
  for (const weight of Object.values(cfg.botDifficulty.engagementWeights)) {
    if (weight < 0 || weight > 5) return false;
  }
  const totalWeight = Object.values(cfg.botDifficulty.engagementWeights).reduce((sum, n) => sum + n, 0);
  if (totalWeight <= 0) return false;
  return true;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function boolAny(names: string[], fallback: boolean): boolean {
  for (const name of names) {
    const raw = process.env[name];
    if (raw != null && raw !== '') return raw === '1' || raw.toLowerCase() === 'true';
  }
  return fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function numAny(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function int(name: string, fallback: number): number { return Math.round(num(name, fallback)); }
function intAny(names: string[], fallback: number): number { return Math.round(numAny(names, fallback)); }
function pct(name: string, fallback: number): number { return Math.max(0, Math.min(100, num(name, fallback))); }
function str(name: string, fallback: string): string { return process.env[name] || fallback; }

function winBand(segment: ProgressionSegment, fallback: { min: number; max: number }): { min: number; max: number } {
  const prefix = `TARGET_WIN_PROBABILITY_${segment}`;
  const min = numAny([`${prefix}_MIN`], fallback.min);
  const max = numAny([`${prefix}_MAX`], fallback.max);
  return { min: Math.max(0.25, Math.min(0.80, min)), max: Math.max(0.25, Math.min(0.80, max)) };
}

function stateBand(state: CompetitiveState, fallback: { min: number; max: number }): { min: number; max: number } {
  const prefix = `TARGET_COMPETITIVE_PROBABILITY_${state}`;
  const min = numAny([`${prefix}_MIN`], fallback.min);
  const max = numAny([`${prefix}_MAX`], fallback.max);
  return { min: Math.max(0.25, Math.min(0.80, min)), max: Math.max(0.25, Math.min(0.80, max)) };
}

function rolloutStageEnv(name: string, fallback: RolloutStage): RolloutStage {
  const raw = process.env[name];
  return raw === 'development' || raw === 'staging' || raw === 'internal' || raw === 'percent' || raw === 'all' ? raw : fallback;
}
