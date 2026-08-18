import { pool } from '../db/pool.ts';
import { liveOpsConfig, progressionSegment, type ProgressionSegment } from './liveOpsConfig.ts';

export type TrophyEconomyStateName = 'DEFLATIONARY' | 'HEALTHY' | 'MILD_INFLATION' | 'HIGH_INFLATION';

export interface TrophyEconomyState {
  state: TrophyEconomyStateName;
  botInjectionToday: number;
  trophiesCreatedToday: number;
  trophiesDestroyedToday: number;
  dailyInflation: number;
  botBudgetRemaining: number;
  botRewardMultiplier: number;
}

export async function getTrophyEconomyState(): Promise<TrophyEconomyState> {
  const cfg = liveOpsConfig();
  if (!cfg.killSwitches.trophyEconomyControllerEnabled) return healthy();
  try {
    const { rows } = await pool.query<{ created: string; destroyed: string; bot_injected: string; supply: string }>(
      `SELECT
         COALESCE(sum(GREATEST(delta, 0)), 0)::bigint AS created,
         COALESCE(sum(GREATEST(-delta, 0)), 0)::bigint AS destroyed,
         COALESCE(sum(CASE WHEN source = 'BOT_TO_HUMAN_INJECTION' THEN GREATEST(delta, 0) ELSE 0 END), 0)::bigint AS bot_injected,
         COALESCE((SELECT sum(trophies) FROM users), 0)::bigint AS supply
       FROM trophy_ledger
      WHERE created_at >= date_trunc('day', now())`,
    );
    const row = rows[0];
    const created = Number(row?.created ?? 0);
    const destroyed = Number(row?.destroyed ?? 0);
    const botInjected = Number(row?.bot_injected ?? 0);
    const supply = Math.max(1, Number(row?.supply ?? 1));
    const dailyInflation = (created - destroyed) / supply;
    const state = dailyInflation > cfg.trophyEconomy.targetDailyInflationMax * 2 ? 'HIGH_INFLATION'
      : dailyInflation > cfg.trophyEconomy.targetDailyInflationMax ? 'MILD_INFLATION'
        : dailyInflation < cfg.trophyEconomy.targetDailyInflationMin ? 'DEFLATIONARY'
          : 'HEALTHY';
    const budgetPressure = Math.min(1, botInjected / Math.max(1, cfg.trophyEconomy.botInjectionBudgetDaily));
    const inflationPressure = state === 'HIGH_INFLATION' ? 0.45 : state === 'MILD_INFLATION' ? 0.22 : 0;
    const multiplier = Math.max(cfg.trophyEconomy.minMultiplier, Math.min(cfg.trophyEconomy.maxMultiplier, 1 - budgetPressure * 0.36 - inflationPressure));
    return {
      state,
      botInjectionToday: botInjected,
      trophiesCreatedToday: created,
      trophiesDestroyedToday: destroyed,
      dailyInflation: Number(dailyInflation.toFixed(6)),
      botBudgetRemaining: Math.max(0, cfg.trophyEconomy.botInjectionBudgetDaily - botInjected),
      botRewardMultiplier: Number(multiplier.toFixed(4)),
    };
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return healthy();
    throw err;
  }
}

export function botAvailabilityMultiplier(segment: ProgressionSegment, economy: TrophyEconomyState): number {
  const cfg = liveOpsConfig();
  if (segment === 'ELITE' && !cfg.bots.eliteBotsEnabled) return 0;
  const segmentCap = cfg.bots.maxBotRatioBySegment[segment];
  const economyCap = economy.state === 'HIGH_INFLATION' ? 0.45 : economy.state === 'MILD_INFLATION' ? 0.72 : 1;
  return Number(Math.max(0, Math.min(1, segmentCap * economyCap)).toFixed(4));
}

export function segmentForTrophySettlement(trophies: number, matchesPlayed = 0): ProgressionSegment {
  return progressionSegment(trophies, matchesPlayed);
}

function healthy(): TrophyEconomyState {
  return { state: 'HEALTHY', botInjectionToday: 0, trophiesCreatedToday: 0, trophiesDestroyedToday: 0, dailyInflation: 0, botBudgetRemaining: Number.MAX_SAFE_INTEGER, botRewardMultiplier: 1 };
}
