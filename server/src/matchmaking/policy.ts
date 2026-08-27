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

// AYNI ARENA KURALI (kullanıcı kararı 2026-08-27, önceki sert bandın yerine):
// İKİ İNSAN aynı arenadaysa kupa farkı NE OLURSA OLSUN eşleşebilir (0 ile 199
// ikisi de Mahalle Sahası → serbest); farklı arenadaysa ASLA (0 ile 201: 201
// Amatör Lig'de → yasak). Eşikler rank.ts ARENAS ile birebir aynı tutulur —
// oraya arena eklenirse burası da güncellenir (matchmaking→rank import'u
// döngü riski taşıdığı için eşikler burada sabit kopya).
const ARENA_STEPS = [0, 200, 500, 1000, 2000, 3500, 5000] as const;
export function arenaIndexFor(trophies: number): number {
  let idx = 0;
  for (let i = 0; i < ARENA_STEPS.length; i++) if (trophies >= ARENA_STEPS[i]!) idx = i;
  return idx;
}
export function sameArenaPair(a: number, b: number): boolean {
  return arenaIndexFor(Math.max(0, a)) === arenaIndexFor(Math.max(0, b));
}

// (Eski kademeli bant — şimdilik yalnız BOT üretiminde referans olarak duruyor.)
export function maxTrophyGapFor(trophies: number): number {
  return Math.round(Math.min(300, Math.max(150, trophies * 0.09)));
}

/** Çift için izin verilen en büyük fark — yüksek oyuncunun bandı belirler
 * (3500 vs 3200: 3500'ün bandı 300 → tam sınırda eşleşebilir). */
export function maxPairTrophyGap(a: number, b: number): number {
  return Math.max(maxTrophyGapFor(a), maxTrophyGapFor(b));
}

export function trophyRangeForElapsed(elapsedMs: number, cfg: HybridMatchmakingConfig): number {
  if (elapsedMs <= cfg.realPlayerSearchWindowMs) return cfg.initialTrophyRange;
  if (elapsedMs >= cfg.expandedSearchWindowMs) return cfg.expandedTrophyRange;
  const t = (elapsedMs - cfg.realPlayerSearchWindowMs) / Math.max(1, cfg.expandedSearchWindowMs - cfg.realPlayerSearchWindowMs);
  return Math.round(cfg.initialTrophyRange + (cfg.expandedTrophyRange - cfg.initialTrophyRange) * t);
}

export function compatibleTrophies(a: number, b: number, _aElapsedMs: number, _bElapsedMs: number, _cfg: HybridMatchmakingConfig): boolean {
  // Aynı arena = kupa sınırı yok; farklı arena = asla (2026-08-27).
  return sameArenaPair(a, b);
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

export function potentialTrophyCompatibility(a: number, b: number, _cfg: HybridMatchmakingConfig): boolean {
  // Potansiyel = aynı arena: farklı arenadaki insan için beklemek anlamsız.
  return sameArenaPair(a, b);
}

export function potentialSkillCompatibility(aMean: number, bMean: number, aUncertainty: number, bUncertainty: number, cfg: HybridMatchmakingConfig): boolean {
  const uncertaintyAllowance = Math.min(320, Math.round((Math.max(0, aUncertainty) + Math.max(0, bUncertainty)) * 0.28));
  return Math.abs(aMean - bMean) <= cfg.expandedSkillRange + uncertaintyAllowance;
}

export class MatchmakingOrchestrator {
  constructor(private readonly cfg: HybridMatchmakingConfig) {}

  compatibleHumans(a: { trophies: number; skillMean?: number; skillUncertainty?: number; elapsedMs: number }, b: { trophies: number; skillMean?: number; skillUncertainty?: number; elapsedMs: number }): boolean {
    // AYNI ARENA HER YOLDA ön şart; arena tutuyorsa kupa/MMR farkı eşleşmeyi
    // ENGELLEMEZ (kullanıcı kararı 2026-08-27: az oyunculu dönemde insan-insan
    // eşleşmesi öncelik — sınır yalnız arena).
    if (!sameArenaPair(a.trophies, b.trophies)) return false;
    return true;
  }

  potentialHuman(a: { trophies: number; skillMean?: number; skillUncertainty?: number }, b: { trophies: number; skillMean?: number; skillUncertainty?: number }): boolean {
    return sameArenaPair(a.trophies, b.trophies);
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
  const depthBias = Math.min(300, Math.max(0, queueDepth - 1) * 150);
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
