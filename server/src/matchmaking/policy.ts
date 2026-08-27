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

// SERT KUPA BANDI (kullanıcı kararı 2026-08-27): rakip (insan VEYA bot) kupa
// farkı bu bandı asla aşamaz. Alt ligde 150 (250'lik oyuncu 0'lıkla eşleşmez),
// kademeli büyür, 300'de tavan (3500'lük oyuncu en az 3200'lükle eşleşir).
// Pencere genişlemesi ve MMR yolu dahil HER eşleşme yolunda uygulanır.
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

export function compatibleTrophies(a: number, b: number, aElapsedMs: number, bElapsedMs: number, cfg: HybridMatchmakingConfig): boolean {
  // Genişleyen pencere bile sert bandı aşamaz — bekleme süresi kupa farkını
  // sonsuza esnetmesin (eski expandedTrophyRange=450 bandın üstündeydi).
  const range = Math.min(
    Math.max(trophyRangeForElapsed(aElapsedMs, cfg), trophyRangeForElapsed(bElapsedMs, cfg)),
    maxPairTrophyGap(a, b),
  );
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
  // Potansiyel de bantla sınırlı: bandın dışındaki insan için kuyrukta
  // beklemek anlamsız — asla eşleşemeyecekler.
  return Math.abs(a - b) <= Math.min(cfg.expandedTrophyRange, maxPairTrophyGap(a, b));
}

export function potentialSkillCompatibility(aMean: number, bMean: number, aUncertainty: number, bUncertainty: number, cfg: HybridMatchmakingConfig): boolean {
  const uncertaintyAllowance = Math.min(320, Math.round((Math.max(0, aUncertainty) + Math.max(0, bUncertainty)) * 0.28));
  return Math.abs(aMean - bMean) <= cfg.expandedSkillRange + uncertaintyAllowance;
}

export class MatchmakingOrchestrator {
  constructor(private readonly cfg: HybridMatchmakingConfig) {}

  compatibleHumans(a: { trophies: number; skillMean?: number; skillUncertainty?: number; elapsedMs: number }, b: { trophies: number; skillMean?: number; skillUncertainty?: number; elapsedMs: number }): boolean {
    // KUPA BANDI HER YOLDA: MMR yolu eskiden kupayı hiç kontrol etmiyordu —
    // benzer MMR'lı 1000 vs 1900 eşleşebiliyordu. Artık bant ön şart.
    if (Math.abs(a.trophies - b.trophies) > maxPairTrophyGap(a.trophies, b.trophies)) return false;
    if (typeof a.skillMean === 'number' && typeof b.skillMean === 'number') {
      return compatibleSkill(a.skillMean, b.skillMean, a.skillUncertainty ?? 220, b.skillUncertainty ?? 220, a.elapsedMs, b.elapsedMs, this.cfg);
    }
    return compatibleTrophies(a.trophies, b.trophies, a.elapsedMs, b.elapsedMs, this.cfg);
  }

  potentialHuman(a: { trophies: number; skillMean?: number; skillUncertainty?: number }, b: { trophies: number; skillMean?: number; skillUncertainty?: number }): boolean {
    if (Math.abs(a.trophies - b.trophies) > maxPairTrophyGap(a.trophies, b.trophies)) return false;
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
