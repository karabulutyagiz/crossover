import { liveOpsConfig } from './liveOpsConfig.ts';

export interface QueueCandidateSnapshot {
  trophies: number;
  skillMean?: number;
  skillUncertainty?: number;
  elapsedMs: number;
  recentOpponentPenalty?: number;
  farmRisk?: number;
}

export interface QueueHealth {
  realOpponentProbability: number;
  expectedRealWaitMs: number;
  availablePlayerCount: number;
  skillDensityAroundPlayer: number;
  acceptableOpponentCount: number;
  queueHealthScore: number;
}

export function estimateQueueHealth(player: QueueCandidateSnapshot, candidates: QueueCandidateSnapshot[], now = Date.now()): QueueHealth {
  const cfg = liveOpsConfig().matchmaking;
  const elapsed = Math.max(0, player.elapsedMs);
  const mmrWindow = dynamicMmrWindow(elapsed);
  const trophyWindow = dynamicTrophyWindow(elapsed);
  const playerMmr = player.skillMean ?? mmrFromTrophies(player.trophies);
  let acceptable = 0;
  let nearby = 0;
  for (const c of candidates) {
    const cMmr = c.skillMean ?? mmrFromTrophies(c.trophies);
    const mmrDiff = Math.abs(cMmr - playerMmr);
    const trophyDiff = Math.abs(c.trophies - player.trophies);
    if (mmrDiff <= mmrWindow * 1.35) nearby += 1;
    if (mmrDiff <= mmrWindow && trophyDiff <= trophyWindow && (c.farmRisk ?? 0) < 0.72) acceptable += 1;
  }
  const density = Math.min(1, nearby / 5);
  const acceptableScore = Math.min(1, acceptable / 3);
  const elapsedPressure = Math.min(1, elapsed / Math.max(1, cfg.maxSearchMs));
  const realOpponentProbability = Math.min(0.98, acceptableScore * 0.72 + density * 0.24 + Math.min(0.12, candidates.length * 0.015));
  const expectedRealWaitMs = Math.round(Math.max(350, cfg.preferredRealWaitMs + (1 - realOpponentProbability) * cfg.maxSearchMs * 0.65 - elapsedPressure * 900));
  const queueHealthScore = Math.max(0, Math.min(1, realOpponentProbability * 0.72 + density * 0.18 + Math.min(1, candidates.length / 20) * 0.10));
  void now;
  return {
    realOpponentProbability: Number(realOpponentProbability.toFixed(4)),
    expectedRealWaitMs,
    availablePlayerCount: candidates.length,
    skillDensityAroundPlayer: Number(density.toFixed(4)),
    acceptableOpponentCount: acceptable,
    queueHealthScore: Number(queueHealthScore.toFixed(4)),
  };
}

export function dynamicMmrWindow(elapsedMs: number): number {
  const cfg = liveOpsConfig().matchmaking;
  const t = smoothstep(Math.min(1, Math.max(0, elapsedMs / Math.max(1, cfg.maxSearchMs))));
  return Math.round(cfg.initialMmrWindow + (cfg.maxMmrWindow - cfg.initialMmrWindow) * t);
}

export function dynamicTrophyWindow(elapsedMs: number): number {
  const cfg = liveOpsConfig().matchmaking;
  const t = smoothstep(Math.min(1, Math.max(0, elapsedMs / Math.max(1, cfg.maxSearchMs))));
  return Math.round(cfg.initialTrophyWindow + (cfg.maxTrophyWindow - cfg.initialTrophyWindow) * t);
}

export function candidateScore(player: QueueCandidateSnapshot, candidate: QueueCandidateSnapshot, queueHealth: QueueHealth): number {
  const cfg = liveOpsConfig().matchmaking;
  const pMmr = player.skillMean ?? mmrFromTrophies(player.trophies);
  const cMmr = candidate.skillMean ?? mmrFromTrophies(candidate.trophies);
  const mmrDiff = Math.abs(pMmr - cMmr);
  const trophyDiff = Math.abs(player.trophies - candidate.trophies);
  const skillCompatibility = 1 - Math.min(1, mmrDiff / Math.max(1, cfg.maxMmrGap));
  const trophyCompatibility = 1 - Math.min(1, trophyDiff / Math.max(1, cfg.maxTrophyGap));
  const queueUrgency = Math.min(1, Math.max(player.elapsedMs, candidate.elapsedMs) / Math.max(1, cfg.maxSearchMs));
  const diversityPenalty = candidate.recentOpponentPenalty ?? 0;
  const farmPenalty = candidate.farmRisk ?? 0;
  const healthBonus = queueHealth.queueHealthScore * 0.06;
  return Number((skillCompatibility * 0.52 + trophyCompatibility * 0.20 + queueUrgency * 0.16 + healthBonus - diversityPenalty * 0.20 - farmPenalty * 0.34).toFixed(5));
}

function mmrFromTrophies(trophies: number): number {
  return 1000 + Math.sqrt(Math.max(0, trophies)) * 5.2;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
