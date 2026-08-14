import type { Arena } from '../game/rank.ts';

export type MatchmakingState =
  | 'IDLE'
  | 'SEARCHING_CLOSE'
  | 'SEARCHING_EXPANDED'
  | 'OPPONENT_RESERVED'
  | 'MATCH_FOUND'
  | 'STARTING_MATCH'
  | 'CANCELLED'
  | 'FAILED';

export interface HybridMatchmakingConfig {
  realPlayerSearchWindowMs: number;
  expandedSearchWindowMs: number;
  botFallbackMinDelayMs: number;
  botFallbackMaxDelayMs: number;
  initialTrophyRange: number;
  expandedTrophyRange: number;
  matchmakingTimeoutMs: number;
  botFallbackPercentage: number;
  humanLiquidityHoldMs: number;
  botFallbackRetryMs: number;
  initialSkillRange: number;
  expandedSkillRange: number;
}

export function trophyRangeForElapsed(elapsedMs: number, cfg: HybridMatchmakingConfig): number {
  if (elapsedMs <= cfg.realPlayerSearchWindowMs) return cfg.initialTrophyRange;
  if (elapsedMs >= cfg.expandedSearchWindowMs) return cfg.expandedTrophyRange;
  const t = (elapsedMs - cfg.realPlayerSearchWindowMs) / Math.max(1, cfg.expandedSearchWindowMs - cfg.realPlayerSearchWindowMs);
  return Math.round(cfg.initialTrophyRange + (cfg.expandedTrophyRange - cfg.initialTrophyRange) * t);
}

export function compatibleTrophies(a: number, b: number, aElapsedMs: number, bElapsedMs: number, cfg: HybridMatchmakingConfig): boolean {
  const range = Math.max(trophyRangeForElapsed(aElapsedMs, cfg), trophyRangeForElapsed(bElapsedMs, cfg));
  return Math.abs(a - b) <= range;
}

export function skillRangeForElapsed(elapsedMs: number, cfg: HybridMatchmakingConfig): number {
  if (elapsedMs <= cfg.realPlayerSearchWindowMs) return cfg.initialSkillRange;
  if (elapsedMs >= cfg.expandedSearchWindowMs) return cfg.expandedSkillRange;
  const t = (elapsedMs - cfg.realPlayerSearchWindowMs) / Math.max(1, cfg.expandedSearchWindowMs - cfg.realPlayerSearchWindowMs);
  return Math.round(cfg.initialSkillRange + (cfg.expandedSkillRange - cfg.initialSkillRange) * t);
}

export function compatibleSkill(
  aMean: number,
  bMean: number,
  aUncertainty: number,
  bUncertainty: number,
  aElapsedMs: number,
  bElapsedMs: number,
  cfg: HybridMatchmakingConfig,
): boolean {
  const range = Math.max(skillRangeForElapsed(aElapsedMs, cfg), skillRangeForElapsed(bElapsedMs, cfg));
  const uncertaintyAllowance = Math.min(260, Math.round((Math.max(0, aUncertainty) + Math.max(0, bUncertainty)) * 0.22));
  return Math.abs(aMean - bMean) <= range + uncertaintyAllowance;
}

export function potentialTrophyCompatibility(a: number, b: number, cfg: HybridMatchmakingConfig): boolean {
  return Math.abs(a - b) <= cfg.expandedTrophyRange;
}

export function potentialSkillCompatibility(aMean: number, bMean: number, aUncertainty: number, bUncertainty: number, cfg: HybridMatchmakingConfig): boolean {
  const uncertaintyAllowance = Math.min(320, Math.round((Math.max(0, aUncertainty) + Math.max(0, bUncertainty)) * 0.28));
  return Math.abs(aMean - bMean) <= cfg.expandedSkillRange + uncertaintyAllowance;
}

export class MatchmakingOrchestrator {
  constructor(private readonly cfg: HybridMatchmakingConfig) {}

  compatibleHumans(a: { trophies: number; skillMean?: number; skillUncertainty?: number; elapsedMs: number }, b: { trophies: number; skillMean?: number; skillUncertainty?: number; elapsedMs: number }): boolean {
    if (typeof a.skillMean === 'number' && typeof b.skillMean === 'number') {
      return compatibleSkill(a.skillMean, b.skillMean, a.skillUncertainty ?? 220, b.skillUncertainty ?? 220, a.elapsedMs, b.elapsedMs, this.cfg);
    }
    return compatibleTrophies(a.trophies, b.trophies, a.elapsedMs, b.elapsedMs, this.cfg);
  }

  potentialHuman(a: { trophies: number; skillMean?: number; skillUncertainty?: number }, b: { trophies: number; skillMean?: number; skillUncertainty?: number }): boolean {
    if (typeof a.skillMean === 'number' && typeof b.skillMean === 'number') {
      return potentialSkillCompatibility(a.skillMean, b.skillMean, a.skillUncertainty ?? 220, b.skillUncertainty ?? 220, this.cfg);
    }
    return potentialTrophyCompatibility(a.trophies, b.trophies, this.cfg);
  }

  shouldHoldForHuman(elapsedMs: number, hasPotentialHuman: boolean): boolean {
    return shouldHoldForHumanLiquidity(elapsedMs, hasPotentialHuman, this.cfg);
  }

  fallbackDelayMs(queueDepth: number): number {
    return randomBotFallbackDelayMs(this.cfg, queueDepth);
  }
}

export function shouldHoldForHumanLiquidity(elapsedMs: number, hasPotentialHuman: boolean, cfg: HybridMatchmakingConfig): boolean {
  return hasPotentialHuman && elapsedMs < cfg.humanLiquidityHoldMs;
}

export function randomBotFallbackDelayMs(cfg: HybridMatchmakingConfig, queueDepth: number): number {
  const min = Math.max(0, cfg.botFallbackMinDelayMs);
  const max = Math.max(min, cfg.botFallbackMaxDelayMs);
  // Higher queue depth means another human may arrive any moment; wait slightly
  // longer before fallback so real liquidity wins naturally.
  const depthBias = Math.min(600, Math.max(0, queueDepth - 1) * 180);
  const span = Math.max(0, max - min);
  const triangular = (Math.random() + Math.random()) / 2;
  return Math.round(Math.min(max + depthBias, min + Math.round(span * triangular) + depthBias));
}

export function shouldUseBotFallback(percentage: number): boolean {
  return Math.random() * 100 < Math.max(0, Math.min(100, percentage));
}

export interface OpponentProfile {
  id: string;
  displayName: string;
  trophies: number;
  arena: Arena;
  avatar: string | null;
  level: number;
  frame: string | null;
  opponentType: 'HUMAN' | 'BOT';
}
