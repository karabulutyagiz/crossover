import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProfileView } from './protocol';

export type PowerId = 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken';

export type MonetizationTrigger =
  | 'post_match_loss'
  | 'streak_lost'
  | 'near_level'
  | 'post_win_xp'
  | 'arena_protection'
  | 'social_pack_discovery'
  | 'premium_mode_locked';

export type MonetizationOfferType = 'power' | 'social_pack';

export const PROMOTION_PRIORITY = {
  critical: 1000,
  reward: 800,
  postMatch: 500,
  socialPackStartup: 300,
  diamondGeneric: 100,
} as const;

export const PROMOTION_TIMING = {
  postMatchSettleDelayMs: 1400,
} as const;

export type MonetizationOffer = {
  offerId: string;
  offerType: MonetizationOfferType;
  trigger: MonetizationTrigger;
  priority: number;
  product?: PowerId;
  titleKey: string;
  bodyKey: string;
  ctaKey: string;
  secondaryKey: string;
  analyticsMetadata?: Record<string, string | number | boolean | null | undefined>;
  autoUseAfterPurchase?: boolean;
};

export type DiamondIntent = {
  source: MonetizationTrigger | 'store' | 'collection' | 'level_road';
  product: 'power';
  powerId: PowerId;
  requiredDiamonds: number;
  currentBalance: number;
  missingDiamonds: number;
  autoUseAfterPurchase?: boolean;
};

export type OfferEngineContext = {
  profile: ProfileView | null;
  trophyDelta?: number | null;
  shielded?: boolean | null;
  youWon?: boolean | null;
  xpGained?: number | null;
  youScore?: number | null;
  oppScore?: number | null;
};

export type OfferCaps = {
  sessionOffers: number;
  lastOfferAt: number;
  lastSocialPackOfferAt: number;
  offersSeenToday: number;
  dayKey: string;
  seenByOffer: Record<string, number>;
  dismissedByOffer: Record<string, number>;
  postMatchSeenCount: number;
  matchesSincePostMatchOffer: number;
  lastPostMatchOfferAt: number;
  lastDeclineAt: number;
  lastPurchaseAt: number;
};

export type MonetizationRemoteConfig = {
  enabled: boolean;
  holdoutPercent: number;
  maxSessionOffers: number;
  maxDailyOffers: number;
  postMatchEveryMatches: number;
  postMatchCooldownMs: number;
  purchaseDeclineCooldownMs: number;
  purchaseSuccessCooldownMs: number;
  globalCooldownMs: number;
  socialPackCooldownMs: number;
  minSessionForSocialPackDiscovery: number;
  minStreakLost: number;
  largeTrophyLoss: number;
  nearLevelXpRemaining: number;
  arenaProtectionDistance: number;
  maxSameOfferDismissals: number;
  offers: {
    streakRestore: boolean;
    trophyShield: boolean;
    xpBoost: boolean;
    socialPackDiscovery: boolean;
  };
  // Reklam kurgusu (2026-08-29) — sunucu /monetization-config'ten gelir; eski
  // sunucuda alan yoksa güvenli varsayılanlar (geçiş reklamı KAPALI) kullanılır.
  // Android'de Google doğrulaması kurulu mu (sunucudaki service account).
  // false → Android'de satın alma HİÇ başlatılmaz: para çekilip hak
  // verilememesi riskine karşı sert kapı (2026-08-29).
  androidIapReady: boolean;
  ads: {
    interstitialEnabled: boolean;
    interstitialEveryMatches: number;
    interstitialGraceMatches: number;
    interstitialUnitIos: string | null;
    interstitialUnitAndroid: string | null;
    rewardedPostLoss: boolean;
    rewardedShortfall: boolean;
    dailyChest: boolean;
  };
};

export const MONETIZATION_CONFIG: MonetizationRemoteConfig = {
  enabled: true,
  holdoutPercent: 0,
  maxSessionOffers: 1,
  maxDailyOffers: 3,
  postMatchEveryMatches: 1,
  postMatchCooldownMs: 6 * 60 * 1000,
  purchaseDeclineCooldownMs: 10 * 60 * 1000,
  purchaseSuccessCooldownMs: 30 * 60 * 1000,
  globalCooldownMs: 8 * 60 * 1000,
  socialPackCooldownMs: 3 * 24 * 60 * 60 * 1000,
  minSessionForSocialPackDiscovery: 1,
  minStreakLost: 3,
  largeTrophyLoss: 20,
  nearLevelXpRemaining: 180,
  arenaProtectionDistance: 35,
  maxSameOfferDismissals: 2,
  offers: {
    streakRestore: true,
    trophyShield: true,
    xpBoost: true,
    socialPackDiscovery: true,
  },
  androidIapReady: false,
  ads: {
    interstitialEnabled: false,
    interstitialEveryMatches: 3,
    interstitialGraceMatches: 5,
    interstitialUnitIos: null,
    interstitialUnitAndroid: null,
    rewardedPostLoss: true,
    rewardedShortfall: true,
    dailyChest: true,
  },
};

const CAPS_KEY = '@crossover_monetization_caps_v2';
let pendingDiamondIntent: DiamondIntent | null = null;
let pendingAutoUsePower: PowerId | null = null;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeConfig(value: unknown): MonetizationRemoteConfig {
  if (!value || typeof value !== 'object') return MONETIZATION_CONFIG;
  const v = value as Partial<MonetizationRemoteConfig>;
  const offers = typeof v.offers === 'object' && v.offers ? v.offers : {};
  const ads = typeof v.ads === 'object' && v.ads ? v.ads : {};
  return {
    ...MONETIZATION_CONFIG,
    ...v,
    offers: { ...MONETIZATION_CONFIG.offers, ...offers },
    ads: { ...MONETIZATION_CONFIG.ads, ...ads },
  };
}

// Son yüklenen config'in modül-seviyesi kopyası: ekranlar (ResultScreen/Store)
// prop zinciri kurmadan reklam bayraklarına buradan bakar (2026-08-29).
let lastLoadedConfig: MonetizationRemoteConfig = MONETIZATION_CONFIG;
export function getMonetizationConfig(): MonetizationRemoteConfig {
  return lastLoadedConfig;
}

export async function loadMonetizationConfig(fetcher?: () => Promise<unknown>): Promise<MonetizationRemoteConfig> {
  if (!fetcher) return MONETIZATION_CONFIG;
  try {
    lastLoadedConfig = sanitizeConfig(await fetcher());
    return lastLoadedConfig;
  } catch {
    return MONETIZATION_CONFIG;
  }
}

export function setPendingDiamondIntent(intent: DiamondIntent | null): void {
  pendingDiamondIntent = intent;
}

export function takePendingDiamondIntent(): DiamondIntent | null {
  const intent = pendingDiamondIntent;
  pendingDiamondIntent = null;
  return intent;
}

export function peekPendingDiamondIntent(): DiamondIntent | null {
  return pendingDiamondIntent;
}

export function setPendingAutoUsePower(powerId: PowerId | null): void {
  pendingAutoUsePower = powerId;
}

export function takePendingAutoUsePower(powerId: string | undefined | null): PowerId | null {
  if (!pendingAutoUsePower || pendingAutoUsePower !== powerId) return null;
  const p = pendingAutoUsePower;
  pendingAutoUsePower = null;
  return p;
}

export async function loadOfferCaps(): Promise<OfferCaps> {
  const day = todayKey();
  try {
    const raw = await AsyncStorage.getItem(CAPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OfferCaps>;
      const sameDay = parsed.dayKey === day;
      return {
        sessionOffers: 0,
        lastOfferAt: Number(parsed.lastOfferAt ?? 0),
        lastSocialPackOfferAt: Number(parsed.lastSocialPackOfferAt ?? 0),
        offersSeenToday: sameDay ? Number(parsed.offersSeenToday ?? 0) : 0,
        dayKey: day,
        seenByOffer: parsed.seenByOffer ?? {},
        dismissedByOffer: parsed.dismissedByOffer ?? {},
        postMatchSeenCount: Number(parsed.postMatchSeenCount ?? 0),
        matchesSincePostMatchOffer: Number(parsed.matchesSincePostMatchOffer ?? MONETIZATION_CONFIG.postMatchEveryMatches),
        lastPostMatchOfferAt: Number(parsed.lastPostMatchOfferAt ?? 0),
        lastDeclineAt: Number(parsed.lastDeclineAt ?? 0),
        lastPurchaseAt: Number(parsed.lastPurchaseAt ?? 0),
      };
    }
  } catch { /* caps are best-effort; gameplay must continue */ }
  return { sessionOffers: 0, lastOfferAt: 0, lastSocialPackOfferAt: 0, offersSeenToday: 0, dayKey: day, seenByOffer: {}, dismissedByOffer: {}, postMatchSeenCount: 0, matchesSincePostMatchOffer: MONETIZATION_CONFIG.postMatchEveryMatches, lastPostMatchOfferAt: 0, lastDeclineAt: 0, lastPurchaseAt: 0 };
}

export async function saveOfferCaps(caps: OfferCaps): Promise<void> {
  try {
    await AsyncStorage.setItem(CAPS_KEY, JSON.stringify({
      lastOfferAt: caps.lastOfferAt,
      lastSocialPackOfferAt: caps.lastSocialPackOfferAt,
      offersSeenToday: caps.offersSeenToday,
      dayKey: caps.dayKey,
      seenByOffer: caps.seenByOffer,
      dismissedByOffer: caps.dismissedByOffer,
      postMatchSeenCount: caps.postMatchSeenCount,
      matchesSincePostMatchOffer: caps.matchesSincePostMatchOffer,
      lastPostMatchOfferAt: caps.lastPostMatchOfferAt,
      lastDeclineAt: caps.lastDeclineAt,
      lastPurchaseAt: caps.lastPurchaseAt,
    }));
  } catch { /* ignore */ }
}

export function markOfferSeen(caps: OfferCaps, offerId: string): OfferCaps {
  const day = todayKey();
  const sameDay = caps.dayKey === day;
  return {
    ...caps,
    sessionOffers: caps.sessionOffers + 1,
    offersSeenToday: (sameDay ? caps.offersSeenToday : 0) + 1,
    dayKey: day,
    lastOfferAt: Date.now(),
    seenByOffer: { ...caps.seenByOffer, [offerId]: (caps.seenByOffer[offerId] ?? 0) + 1 },
  };
}

export function markSocialPackOfferSeen(caps: OfferCaps, offerId: string): OfferCaps {
  return {
    ...caps,
    lastSocialPackOfferAt: Date.now(),
    seenByOffer: { ...caps.seenByOffer, [offerId]: (caps.seenByOffer[offerId] ?? 0) + 1 },
  };
}

export function markOfferDismissed(caps: OfferCaps, offerId: string): OfferCaps {
  return {
    ...caps,
    dismissedByOffer: { ...caps.dismissedByOffer, [offerId]: (caps.dismissedByOffer[offerId] ?? 0) + 1 },
  };
}

export function markMatchCompleted(caps: OfferCaps): OfferCaps {
  return { ...caps, matchesSincePostMatchOffer: caps.matchesSincePostMatchOffer + 1 };
}

export function markPostMatchOfferSeen(caps: OfferCaps, offerId: string): OfferCaps {
  return {
    ...markOfferSeen(caps, offerId),
    postMatchSeenCount: caps.postMatchSeenCount + 1,
    matchesSincePostMatchOffer: 0,
    lastPostMatchOfferAt: Date.now(),
  };
}

export function markPurchaseDeclined(caps: OfferCaps): OfferCaps {
  return { ...caps, lastDeclineAt: Date.now() };
}

export function markPurchaseSucceeded(caps: OfferCaps): OfferCaps {
  return { ...caps, lastPurchaseAt: Date.now() };
}

function capped(caps: OfferCaps, offerId: string, cfg: MonetizationRemoteConfig): boolean {
  const day = todayKey();
  const offersToday = caps.dayKey === day ? caps.offersSeenToday : 0;
  if (!cfg.enabled) return true;
  if (caps.sessionOffers >= cfg.maxSessionOffers) return true;
  if (offersToday >= cfg.maxDailyOffers) return true;
  if (Date.now() - caps.lastOfferAt < cfg.globalCooldownMs) return true;
  return (caps.dismissedByOffer[offerId] ?? 0) >= cfg.maxSameOfferDismissals;
}

function postMatchCapped(caps: OfferCaps, offerId: string, cfg: MonetizationRemoteConfig): boolean {
  if (capped(caps, offerId, cfg)) return true;
  if (caps.matchesSincePostMatchOffer < cfg.postMatchEveryMatches) return true;
  if (Date.now() - caps.lastPostMatchOfferAt < cfg.postMatchCooldownMs) return true;
  if (Date.now() - caps.lastDeclineAt < cfg.purchaseDeclineCooldownMs) return true;
  if (Date.now() - caps.lastPurchaseAt < cfg.purchaseSuccessCooldownMs) return true;
  return false;
}

function inHoldout(userId: string | undefined, cfg: MonetizationRemoteConfig): boolean {
  if (!userId || cfg.holdoutPercent <= 0) return false;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 10_000;
  return h % 100 < Math.max(0, Math.min(100, cfg.holdoutPercent));
}

function xpRemaining(profile: ProfileView): number {
  // Mirrors the visible level road pacing enough for offer eligibility; exact reward
  // grant remains server-authoritative.
  const need = Math.max(100, profile.level * 100);
  return Math.max(0, need - (profile.xp ?? 0));
}

export function evaluateMonetizationOffer(ctx: OfferEngineContext, caps: OfferCaps, cfg: MonetizationRemoteConfig = MONETIZATION_CONFIG): MonetizationOffer | null {
  const p = ctx.profile;
  if (!p) return null;
  if (inHoldout(p.userId, cfg)) return null;
  const candidates: MonetizationOffer[] = [];
  const lostStreak = p.lostStreak ?? 0;
  const trophyDelta = ctx.trophyDelta ?? 0;
  const closeLoss = ctx.youWon === false && typeof ctx.youScore === 'number' && typeof ctx.oppScore === 'number' && ctx.oppScore - ctx.youScore === 1;

  if (closeLoss && cfg.offers.xpBoost) {
    candidates.push({
      offerId: 'training_close_loss',
      offerType: 'power',
      trigger: 'post_match_loss',
      priority: 90,
      product: 'training',
      titleKey: 'monetization.closeLossTitle',
      bodyKey: 'monetization.closeLossBody',
      ctaKey: 'monetization.inspectPowerCta',
      secondaryKey: 'common.continue',
      autoUseAfterPurchase: false,
      analyticsMetadata: { matchResult: 'close_loss', trophyDelta, diamond_balance: p.diamonds },
    });
  }

  if (cfg.offers.streakRestore && lostStreak >= cfg.minStreakLost) {
    candidates.push({
      offerId: 'streak_restore_post_loss',
      offerType: 'power',
      trigger: 'streak_lost',
      priority: 100,
      product: 'streak',
      titleKey: 'monetization.streakLostTitle',
      bodyKey: 'monetization.streakLostBody',
      ctaKey: (p.powerStreak ?? 0) > 0 ? 'monetization.useNow' : 'monetization.restoreStreakCta',
      secondaryKey: 'common.continue',
      autoUseAfterPurchase: true,
      analyticsMetadata: { lost_streak: lostStreak, diamond_balance: p.diamonds },
    });
  }

  if (cfg.offers.trophyShield && trophyDelta <= -cfg.largeTrophyLoss && !ctx.shielded && !p.shieldArmed) {
    candidates.push({
      offerId: 'trophy_shield_post_loss',
      offerType: 'power',
      trigger: 'post_match_loss',
      priority: 80,
      product: 'shield',
      titleKey: 'monetization.shieldLossTitle',
      bodyKey: 'monetization.shieldLossBody',
      ctaKey: (p.powerShield ?? 0) > 0 ? 'monetization.armShieldCta' : 'monetization.buyShieldCta',
      secondaryKey: 'common.continue',
      autoUseAfterPurchase: true,
      analyticsMetadata: { trophy_delta: trophyDelta, diamond_balance: p.diamonds },
    });
  }

  const nearLevel = xpRemaining(p) <= cfg.nearLevelXpRemaining;
  const xpBoostActive = p.xpBoostUntil ? new Date(p.xpBoostUntil).getTime() > Date.now() : false;
  if (cfg.offers.xpBoost && !xpBoostActive && (nearLevel || ((ctx.youWon ?? false) && (ctx.xpGained ?? 0) >= 100))) {
    candidates.push({
      offerId: nearLevel ? 'xp2x_near_level' : 'xp2x_post_win',
      offerType: 'power',
      trigger: nearLevel ? 'near_level' : 'post_win_xp',
      priority: nearLevel ? 55 : 40,
      product: 'xp2x',
      titleKey: nearLevel ? 'monetization.nearLevelTitle' : 'monetization.bigWinXpTitle',
      bodyKey: 'monetization.xpBoostBody',
      ctaKey: (p.powerXp2x ?? 0) > 0 ? 'monetization.activateXpCta' : 'monetization.buyXpCta',
      secondaryKey: 'common.continue',
      autoUseAfterPurchase: true,
      analyticsMetadata: { xp_remaining: xpRemaining(p), xp_gained: ctx.xpGained ?? 0, diamond_balance: p.diamonds },
    });
  }

  const eligible = candidates
    .filter((offer) => {
      // SERİ KURTARMA MUAFİYETİ (2026-08-27): 5+ maçlık seri kırıldığı AN,
      // oturum/gün/cooldown cap'lerinden muaftır — bu, elmas talebinin en
      // yüksek-niyet anıdır ve "oturumda 1 teklif" kotasına kurban gitmez.
      // İki fren kalır: aynı teklifin reddedilme sınırı + satın alma sonrası
      // sükunet (yeni ödeme yapan oyuncuya üst üste teklif atılmaz).
      if (offer.offerId === 'streak_restore_post_loss' && lostStreak >= 5) {
        if ((caps.dismissedByOffer[offer.offerId] ?? 0) >= cfg.maxSameOfferDismissals) return false;
        if (Date.now() - caps.lastPurchaseAt < cfg.purchaseSuccessCooldownMs) return false;
        return true;
      }
      return !postMatchCapped(caps, offer.offerId, cfg);
    })
    .sort((a, b) => b.priority - a.priority);
  return eligible[0] ?? null;
}

export function hasActiveSocialPack(profile: ProfileView | null): boolean {
  return Boolean(profile?.socialPackUntil && new Date(profile.socialPackUntil).getTime() > Date.now());
}

export function evaluateSocialPackDiscovery(profile: ProfileView | null, caps: OfferCaps, cfg: MonetizationRemoteConfig = MONETIZATION_CONFIG, coldLaunchSession = false): MonetizationOffer | null {
  if (!profile || !cfg.enabled || !cfg.offers.socialPackDiscovery) return null;
  if (inHoldout(profile.userId, cfg)) return null;
  if (hasActiveSocialPack(profile)) return null;
  const offerId = coldLaunchSession ? 'social_pack_cold_start' : 'social_pack_discovery_lobby';
  if (!coldLaunchSession && (caps.dismissedByOffer[offerId] ?? 0) >= cfg.maxSameOfferDismissals) return null;
  if (!coldLaunchSession && Date.now() - caps.lastSocialPackOfferAt < cfg.socialPackCooldownMs) return null;
  return {
    offerId,
    offerType: 'social_pack',
    trigger: 'social_pack_discovery',
    priority: PROMOTION_PRIORITY.socialPackStartup,
    titleKey: 'socialPack.startupTitle',
    bodyKey: 'socialPack.startupBody',
    ctaKey: 'socialPack.startupCta',
    secondaryKey: 'common.close',
    analyticsMetadata: { diamond_balance: profile.diamonds, social_token_count: profile.powerSocialToken ?? 0 },
  };
}
