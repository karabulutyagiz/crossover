import type { FarmRiskAssessment } from './antiFarm.ts';
import type { TrophyEconomyState } from './trophyEconomy.ts';

export interface TrophyRiskMultipliers {
  antiFarmMultiplier: number;
  botEconomyMultiplier: number;
  finalMultiplier: number;
  reasons: string[];
}

export function trophyRiskMultipliers(args: {
  opponentType: 'HUMAN' | 'BOT';
  farm: FarmRiskAssessment;
  economy: TrophyEconomyState;
}): TrophyRiskMultipliers {
  const antiFarmMultiplier = args.opponentType === 'BOT'
    ? args.farm.botRewardMultiplier
    : args.farm.pairRewardMultiplier;
  const botEconomyMultiplier = args.opponentType === 'BOT' ? args.economy.botRewardMultiplier : 1;
  const finalMultiplier = Number(Math.max(0, Math.min(1.25, antiFarmMultiplier * botEconomyMultiplier)).toFixed(4));
  return { antiFarmMultiplier, botEconomyMultiplier, finalMultiplier, reasons: [...args.farm.reasons, args.economy.state !== 'HEALTHY' ? `economy_${args.economy.state.toLowerCase()}` : ''].filter(Boolean) };
}

export function applyWinMultiplier(delta: number, multiplier: number): number {
  if (delta <= 0) return delta;
  return Math.max(delta > 0 && multiplier > 0 ? 1 : 0, Math.round(delta * multiplier));
}
