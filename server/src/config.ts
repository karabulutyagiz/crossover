import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

function intEnv(name: string, fallback: number): number {
  return Math.round(numberEnv(name, fallback));
}

function pctEnv(name: string, fallback: number): number {
  return Math.max(0, Math.min(100, numberEnv(name, fallback)));
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function boundedNumberEnv(name: string, fallback: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, numberEnv(name, fallback)));
}

const debugMatchmaking = process.env.NODE_ENV !== 'production' && process.env.MATCHMAKING_DEBUG === '1';

export const config = {
  databaseUrl: required('DATABASE_URL', 'postgres://localhost:5432/crossover_dev'),
  wikidataUserAgent: required(
    'WIKIDATA_USER_AGENT',
    'CrossoverGame/0.1 (dev; yagizkarabulutmedya@gmail.com)',
  ),
  // Candidate net + the floor for auto-correcting a typo to a both-teams player.
  // Kept low so phonetic misspellings (e.g. "snayder" -> Sneijder) still match;
  // false accepts are bounded because auto-correct only targets players who
  // actually played for both of the round's teams.
  verifyMatchThreshold: Number(process.env.VERIFY_MATCH_THRESHOLD ?? '0.3'),
  // Above this, the guess is treated as a confident, specific player name (not a
  // typo): we evaluate THAT player strictly. This is what keeps "Ronaldinho"
  // from being auto-corrected into "Ronaldo". Below it, a guess is treated as an
  // approximate spelling and auto-corrected to the closest both-teams player.
  verifyExactThreshold: Number(process.env.VERIFY_EXACT_THRESHOLD ?? '0.85'),
  // Apple In-App Purchase: app-specific shared secret (App Store Connect → App
  // Information → App-Specific Shared Secret). Used to validate consumable receipts
  // with Apple before granting diamonds. Empty = IAP grants are refused.
  iapSharedSecret: process.env.IAP_SHARED_SECRET ?? '',
  maintenanceMode: process.env.MAINTENANCE_MODE === '1',
  // Expo push notifications. '0' turns off all sending + the push crons
  // (token registration is skipped too); defaults to on.
  pushEnabled: (process.env.PUSH_ENABLED ?? '1') === '1',
  minIosBuild: Number(process.env.MIN_IOS_BUILD ?? '1'),
  minAndroidVersionCode: Number(process.env.MIN_ANDROID_VERSION_CODE ?? '1'),
  // Admin paneli bearer anahtarı — /admin/api/* uçlarını korur. Boşsa admin API
  // tamamen kapalıdır (her istek 401 döner), yani anahtar tanımlanmadan veri sızmaz.
  adminToken: process.env.ADMIN_TOKEN ?? '',
  dbPoolMax: intEnv('DB_POOL_MAX', 30),
  dbConnectionTimeoutMs: intEnv('DB_CONNECTION_TIMEOUT_MS', 5_000),
  dbIdleTimeoutMs: intEnv('DB_IDLE_TIMEOUT_MS', 30_000),
  matchmaking: {
    // Quick match must never leave a player waiting forever. These flags now
    // control the early bot fallback rollout; the timeout safety net still starts
    // a bot if no human is available.
    hybridMatchmakingEnabled: boolEnv('HYBRID_MATCHMAKING_ENABLED', true),
    botFallbackEnabled: boolEnv('BOT_FALLBACK_ENABLED', true),
    botFallbackPercentage: pctEnv('BOT_FALLBACK_PERCENTAGE', 100),
    botFallbackMinDelayMs: intEnv('BOT_FALLBACK_MIN_DELAY_MS', 1800),
    botFallbackMaxDelayMs: intEnv('BOT_FALLBACK_MAX_DELAY_MS', 3800),
    realPlayerSearchWindowMs: intEnv('REAL_PLAYER_SEARCH_WINDOW_MS', 1200),
    expandedSearchWindowMs: intEnv('EXPANDED_SEARCH_WINDOW_MS', 2500),
    initialTrophyRange: intEnv('INITIAL_TROPHY_RANGE', 100),
    expandedTrophyRange: intEnv('EXPANDED_TROPHY_RANGE', 450),
    matchmakingTimeoutMs: intEnv('MATCHMAKING_TIMEOUT_MS', 15000),
    humanLiquidityHoldMs: intEnv('HUMAN_LIQUIDITY_HOLD_MS', 6500),
    botFallbackRetryMs: intEnv('BOT_FALLBACK_RETRY_MS', 700),
    recentBotCooldown: intEnv('RECENT_BOT_COOLDOWN', 6),
    initialSkillRange: intEnv('INITIAL_SKILL_RANGE', 180),
    expandedSkillRange: intEnv('EXPANDED_SKILL_RANGE', 520),
    debug: {
      enabled: debugMatchmaking,
      forceBot: debugMatchmaking && process.env.MATCHMAKING_DEBUG_FORCE_BOT === '1',
      forceHumanSearch: debugMatchmaking && process.env.MATCHMAKING_DEBUG_FORCE_HUMAN === '1',
      simulateNoOnlinePlayers: debugMatchmaking && process.env.MATCHMAKING_DEBUG_NO_ONLINE === '1',
      simulateTimeout: debugMatchmaking && process.env.MATCHMAKING_DEBUG_TIMEOUT === '1',
      botArchetype: debugMatchmaking ? process.env.MATCHMAKING_DEBUG_BOT_ARCHETYPE : undefined,
      botSkill: debugMatchmaking && process.env.MATCHMAKING_DEBUG_BOT_SKILL ? Number(process.env.MATCHMAKING_DEBUG_BOT_SKILL) : undefined,
    },
  },
  opponentSystem: {
    enabled: boolEnv('OPPONENT_SYSTEM_ENABLED', true),
    targetWinProbabilityMin: boundedNumberEnv('TARGET_WIN_PROBABILITY_MIN', 0.45, 0.25, 0.70),
    targetWinProbabilityMax: boundedNumberEnv('TARGET_WIN_PROBABILITY_MAX', 0.55, 0.30, 0.75),
    targetSkillDifference: intEnv('TARGET_SKILL_DIFFERENCE', 120),
    newPlayerDifficultyBias: boundedNumberEnv('NEW_PLAYER_DIFFICULTY_BIAS', 0.08, 0, 0.25),
    skillUpdateK: boundedNumberEnv('SKILL_UPDATE_K', 34, 4, 80),
    skillUncertaintyDecay: boundedNumberEnv('SKILL_UNCERTAINTY_DECAY', 0.94, 0.80, 0.995),
    skillUncertaintyMin: boundedNumberEnv('SKILL_UNCERTAINTY_MIN', 70, 20, 250),
    skillUncertaintyMax: boundedNumberEnv('SKILL_UNCERTAINTY_MAX', 350, 120, 600),
    botReactionMinMs: intEnv('BOT_REACTION_MIN_MS', 850),
    botReactionMaxMs: intEnv('BOT_REACTION_MAX_MS', 16500),
    botErrorMin: boundedNumberEnv('BOT_ERROR_MIN', 0.025, 0, 0.30),
    botErrorMax: boundedNumberEnv('BOT_ERROR_MAX', 0.42, 0.05, 0.70),
    botTimeoutMin: boundedNumberEnv('BOT_TIMEOUT_MIN', 0.015, 0, 0.25),
    botTimeoutMax: boundedNumberEnv('BOT_TIMEOUT_MAX', 0.30, 0.03, 0.65),
    trophyMinGain: intEnv('TROPHY_MIN_GAIN', 28),
    trophyMaxGain: intEnv('TROPHY_MAX_GAIN', 35),
    trophyMinLoss: intEnv('TROPHY_MIN_LOSS', 15),
    trophyMaxLoss: intEnv('TROPHY_MAX_LOSS', 20),
    rematchProbability: boundedNumberEnv('REMATCH_PROBABILITY', 0.58, 0, 1),
    emoteProbability: boundedNumberEnv('EMOTE_PROBABILITY', 0.34, 0, 1),
    humanTelemetryWeightMinPlays: intEnv('HUMAN_TELEMETRY_WEIGHT_MIN_PLAYS', 12),
    humanTelemetryWeightFullPlays: intEnv('HUMAN_TELEMETRY_WEIGHT_FULL_PLAYS', 200),
  },
} as const;
