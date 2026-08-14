import { config } from '../config.ts';

export interface OpponentSystemConfig {
  enabled: boolean;
  targetWinProbabilityMin: number;
  targetWinProbabilityMax: number;
  targetSkillDifference: number;
  newPlayerDifficultyBias: number;
  skillUpdateK: number;
  skillUncertaintyDecay: number;
  skillUncertaintyMin: number;
  skillUncertaintyMax: number;
  botReactionMinMs: number;
  botReactionMaxMs: number;
  botErrorMin: number;
  botErrorMax: number;
  botTimeoutMin: number;
  botTimeoutMax: number;
  trophyMinGain: number;
  trophyMaxGain: number;
  trophyMinLoss: number;
  trophyMaxLoss: number;
  rematchProbability: number;
  emoteProbability: number;
  humanTelemetryWeightMinPlays: number;
  humanTelemetryWeightFullPlays: number;
}

export function opponentConfig(): OpponentSystemConfig {
  return config.opponentSystem;
}
