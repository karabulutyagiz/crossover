import { clamp } from './random.ts';

export type BotPlannedAction = 'CORRECT_ANSWER' | 'WRONG_ATTEMPT_THEN_CONTINUE' | 'PASS' | 'THINK_UNTIL_TIMEOUT';

export const botAiConfig = {
  timing: {
    // Full completed answers must feel human. Famous answers raise knowledge odds,
    // not the right to submit at impossible speed.
    minCompleteResponseMs: intEnv('BOT_MIN_COMPLETE_RESPONSE_MS', 1600),
    minHardCompleteResponseMs: intEnv('BOT_HARD_MIN_COMPLETE_RESPONSE_MS', 1450),
    maxCompleteResponseMs: intEnv('BOT_MAX_COMPLETE_RESPONSE_MS', 17_500),
    minPassMs: intEnv('BOT_MIN_PASS_MS', 4_200),
    maxPassMs: intEnv('BOT_MAX_PASS_MS', 13_800),
    typingBaseMs: intEnv('BOT_TYPING_BASE_MS', 420),
    typingPerCharMs: intEnv('BOT_TYPING_PER_CHAR_MS', 34),
    typingJitterMs: intEnv('BOT_TYPING_JITTER_MS', 360),
    retryReconsiderMinMs: intEnv('BOT_RETRY_RECONSIDER_MIN_MS', 1_250),
    retryReconsiderMaxMs: intEnv('BOT_RETRY_RECONSIDER_MAX_MS', 3_300),
    timeoutSlackMinMs: intEnv('BOT_TIMEOUT_SLACK_MIN_MS', 400),
    timeoutSlackMaxMs: intEnv('BOT_TIMEOUT_SLACK_MAX_MS', 2_200),
  },
  action: {
    passBaseProbability: numEnv('BOT_PASS_BASE_PROBABILITY', 0.42),
    retryAfterWrongBaseProbability: numEnv('BOT_RETRY_AFTER_WRONG_PROBABILITY', 0.32),
  },
  knowledge: {
    iconicFloor: numEnv('BOT_ICONIC_KNOWLEDGE_FLOOR', 0.78),
    superstarFloor: numEnv('BOT_SUPERSTAR_KNOWLEDGE_FLOOR', 0.68),
    popularFloor: numEnv('BOT_POPULAR_KNOWLEDGE_FLOOR', 0.48),
  },
} as const;

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clamp(n, 0, 1_000_000) : fallback;
}

function intEnv(name: string, fallback: number): number {
  return Math.round(numEnv(name, fallback));
}
