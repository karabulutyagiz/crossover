import 'dotenv/config';

// Growth OS yapılandırması. Oyun sunucusuyla AYNI Postgres'i kullanır (growth_*
// tablo öneki), ama ayrı bir süreçte koşar: growth tarafında bir çökme oyunu
// asla etkilemez.

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

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export const config = {
  databaseUrl: required('DATABASE_URL', 'postgres://localhost:5432/crossover_dev'),
  port: numberEnv('GROWTH_PORT', 8090),

  // Boş = growth API tamamen kapalı (oyun admin panelindeki ADMIN_TOKEN sözleşmesinin aynısı).
  adminToken: process.env.GROWTH_ADMIN_TOKEN ?? '',

  dbPoolMax: numberEnv('GROWTH_DB_POOL_MAX', 10),
  dbConnectionTimeoutMs: numberEnv('DB_CONNECTION_TIMEOUT_MS', 5000),
  dbIdleTimeoutMs: numberEnv('DB_IDLE_TIMEOUT_MS', 30000),

  // Tracking linkleri bu origin üzerinden döner (/r/<code>).
  trackingBaseUrl: process.env.TRACKING_BASE_URL ?? 'https://growth.crossoverfootball.com',
  websiteUrl: process.env.WEBSITE_URL ?? 'https://crossoverfootball.com',
  iosStoreUrl: process.env.IOS_STORE_URL ?? 'https://apps.apple.com/tr/app/id6778542426',
  androidStoreUrl:
    process.env.ANDROID_STORE_URL ??
    'https://play.google.com/store/apps/details?id=com.crossover.football',

  // ── Provider kimlik bilgileri (hepsi opsiyonel; yoksa provider "not_configured") ──
  x: {
    apiKey: process.env.X_API_KEY ?? '',
    apiSecret: process.env.X_API_SECRET ?? '',
    accessToken: process.env.X_ACCESS_TOKEN ?? '',
    accessSecret: process.env.X_ACCESS_SECRET ?? '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    // Owned kanal(lar). Virgülle ayrılmış chat id / @kanaladi listesi.
    ownedChannels: (process.env.TELEGRAM_OWNED_CHANNELS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  instagram: {
    igUserId: process.env.IG_USER_ID ?? '',
    accessToken: process.env.IG_ACCESS_TOKEN ?? '',
  },

  // Opsiyonel LLM cilası (kapalıysa şablon motoru tek başına çalışır).
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',

  // ── Güvenlik/politika varsayılanları ──
  // Owned hesaplarda bile otomatik yayın varsayılan olarak KAPALI:
  // her içerik dashboard onayından geçer. Açmak bilinçli bir karardır.
  autoPublishOwned: boolEnv('GROWTH_AUTO_PUBLISH_OWNED', false),

  // Global emniyet tavanları (provider-özel limitler bunların ALTINDA kalabilir, üstüne çıkamaz).
  globalMaxPostsPerDay: numberEnv('GROWTH_GLOBAL_MAX_POSTS_PER_DAY', 20),
  globalMinIntervalMinutes: numberEnv('GROWTH_GLOBAL_MIN_INTERVAL_MINUTES', 20),

  // Günlük plan hedefleri (platform başına üretilecek aday içerik sayısı).
  dailyPlanTargets: {
    x: numberEnv('GROWTH_PLAN_X_PER_DAY', 4),
    instagram: numberEnv('GROWTH_PLAN_IG_PER_DAY', 2),
    telegram: numberEnv('GROWTH_PLAN_TG_PER_DAY', 2),
  },

  // İçerik yorgunluğu: bu pencerede (gün) benzer içerik tekrar kullanılmaz.
  fatigueWindowDays: numberEnv('GROWTH_FATIGUE_WINDOW_DAYS', 30),
  // Jaccard benzerliği bu eşiği aşarsa içerik duplicate sayılır.
  similarityThreshold: numberEnv('GROWTH_SIMILARITY_THRESHOLD', 0.85),

  // Keşif/exploit dengesi: öğrenilmiş ağırlıklarla seçim oranı (kalanı uniform keşif).
  exploitRatio: numberEnv('GROWTH_EXPLOIT_RATIO', 0.8),

  timezone: process.env.GROWTH_TIMEZONE ?? 'Europe/Istanbul',
} as const;

export type GrowthConfig = typeof config;
