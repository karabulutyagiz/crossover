import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { ProfileView } from './protocol';
import type { MonetizationOffer } from './monetization';

export enum EngagementPriority {
  CRITICAL = 1000,
  GAMEPLAY_RESULT = 800,
  PLAYER_REQUESTED = 700,
  DISCOVERY = 500,
  FEEDBACK = 300,
  STORE_RATING = 220,
  GENERAL_PROMOTION = 100,
}

export type EngagementKind =
  | 'SOCIAL_PACK_DISCOVERY'
  | 'SOCIAL_PACK_LOCKED_MODE'
  | 'POST_MATCH_OFFER'
  | 'FEEDBACK_PROMPT'
  | 'RATING_PROMPT'
  | 'DEV_TEST';

export type EngagementEvent =
  | 'APP_COLD_START'
  | 'HOME_READY'
  | 'MATCH_FINISHED'
  | 'MATCH_WON'
  | 'MATCH_LOST'
  | 'DIAMOND_BALANCE_LOW'
  | 'SOCIAL_MODE_LOCKED_TAPPED'
  | 'SESSION_ACTIVE_TIME'
  | 'PLAYER_MILESTONE'
  | 'PURCHASE_STARTED'
  | 'PURCHASE_SUCCESS'
  | 'ENGAGEMENT_CLOSED';

export type EngagementQueueItem = {
  id: string;
  kind: EngagementKind;
  priority: EngagementPriority;
  source: string;
  createdAt: number;
  playerRequested?: boolean;
  ignoreGlobalCooldown?: boolean;
  monetizationOffer?: MonetizationOffer;
  metadata?: Record<string, unknown>;
};

export type EngagementPersistedState = {
  totalActivePlaySeconds: number;
  totalMatches: number;
  completedSessions: number;
  lastGlobalPopupClosedAt: number;
  proactivePopupCountSessionDate: string;
  proactivePopupCountSession: number;
  lastFeedbackPromptAt: number;
  feedbackPromptCount: number;
  lastRatingRequestAt: number;
  ratingRequestCount: number;
  // Yıldız istemi (2026-08-29): 'Şimdi değil' ERTELER (kısa cooldown), yıldız
  // verilince bir daha sorulmaz. Native sheet'in sonucu okunamadığı için karar
  // bizim ön penceremizde alınır ve burada saklanır.
  ratingSnoozedUntil: number;
  ratingCompleted: boolean;
  lastSocialPackImpressionAt: number;
  socialPackImpressions: number;
  socialPackDismissals: number;
  lastDiamondOfferAt: number;
  diamondOfferDismissals: number;
  lastPurchaseAt: number;
};

export type EngagementRuntimeState = EngagementPersistedState & {
  sessionId: string;
  sessionStartedAt: number;
  activeSessionSeconds: number;
  matchesPlayedSession: number;
  currentlyPresentedEngagement: string | null;
  queuedEngagements: EngagementQueueItem[];
};

export type EngagementConfig = {
  globalPopupCooldownMs: number;
  proactivePopupBudgetPerSession: number;
  socialPackCooldownMs: number;
  feedbackMinActiveSeconds: number;
  feedbackMinCompletedMatches: number;
  feedbackCooldownMs: number;
  ratingMinActiveSeconds: number;
  ratingMinCompletedMatches: number;
  ratingCooldownMs: number;
  ratingSnoozeMs: number;
  ratingMaxAsks: number;
  postPurchaseSuppressionMs: number;
};

export const ENGAGEMENT_CONFIG: EngagementConfig = {
  globalPopupCooldownMs: 8 * 60 * 1000,
  proactivePopupBudgetPerSession: 1,
  socialPackCooldownMs: 24 * 60 * 60 * 1000,
  feedbackMinActiveSeconds: 8 * 60,
  feedbackMinCompletedMatches: 2,
  feedbackCooldownMs: 7 * 24 * 60 * 60 * 1000,
  // 20dk/5maç → 5dk/2maç (2026-08-27, kullanıcı kararı): yıldız istemi erken
  // gelsin — ASA/ASO döneminde puan SAYISI dönüşümün ana kaldıracı. Eşikler
  // VEYA'dır (evaluateRatingEngagement): 5 dk oyun YA DA 2 biten maç yeter.
  // iOS zaten requestReview'u yılda 3 gösterimle sınırlar; asıl fren odur.
  ratingMinActiveSeconds: 5 * 60,
  ratingMinCompletedMatches: 2,
  ratingCooldownMs: 21 * 24 * 60 * 60 * 1000,
  // 'Şimdi değil' sonrası tekrar sorma aralığı: 21 gün beklemek isteği öldürüyordu
  // (kullanıcı kararı 2026-08-29 'bir süre sonra tekrar sorsun').
  ratingSnoozeMs: 3 * 24 * 60 * 60 * 1000,
  ratingMaxAsks: 5,
  postPurchaseSuppressionMs: 30 * 60 * 1000,
};

const STORAGE_KEY = '@crossover_engagement_state_v1';

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function initialPersisted(): EngagementPersistedState {
  return {
    totalActivePlaySeconds: 0,
    totalMatches: 0,
    completedSessions: 0,
    lastGlobalPopupClosedAt: 0,
    proactivePopupCountSessionDate: dayKey(),
    proactivePopupCountSession: 0,
    lastFeedbackPromptAt: 0,
    feedbackPromptCount: 0,
    lastRatingRequestAt: 0,
    ratingRequestCount: 0,
    ratingSnoozedUntil: 0,
    ratingCompleted: false,
    lastSocialPackImpressionAt: 0,
    socialPackImpressions: 0,
    socialPackDismissals: 0,
    lastDiamondOfferAt: 0,
    diamondOfferDismissals: 0,
    lastPurchaseAt: 0,
  };
}

export function createEngagementRuntime(persisted: EngagementPersistedState = initialPersisted()): EngagementRuntimeState {
  return {
    ...persisted,
    sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sessionStartedAt: Date.now(),
    activeSessionSeconds: 0,
    matchesPlayedSession: 0,
    currentlyPresentedEngagement: null,
    queuedEngagements: [],
  };
}

export async function loadEngagementState(): Promise<EngagementRuntimeState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return createEngagementRuntime();
    const persisted = { ...initialPersisted(), ...(JSON.parse(raw) as Partial<EngagementPersistedState>) };
    // Migration: Social Pack cold-start is once per real app session, not persisted.
    persisted.lastSocialPackImpressionAt = 0;
    persisted.socialPackImpressions = 0;
    persisted.socialPackDismissals = 0;
    return createEngagementRuntime(persisted);
  } catch {
    return createEngagementRuntime();
  }
}

export async function saveEngagementState(state: EngagementRuntimeState): Promise<void> {
  const persisted: EngagementPersistedState = {
    totalActivePlaySeconds: state.totalActivePlaySeconds,
    totalMatches: state.totalMatches,
    completedSessions: state.completedSessions,
    lastGlobalPopupClosedAt: state.lastGlobalPopupClosedAt,
    proactivePopupCountSessionDate: state.proactivePopupCountSessionDate,
    proactivePopupCountSession: state.proactivePopupCountSession,
    lastFeedbackPromptAt: state.lastFeedbackPromptAt,
    feedbackPromptCount: state.feedbackPromptCount,
    lastRatingRequestAt: state.lastRatingRequestAt,
    ratingRequestCount: state.ratingRequestCount,
    ratingSnoozedUntil: state.ratingSnoozedUntil,
    ratingCompleted: state.ratingCompleted,
    lastSocialPackImpressionAt: state.lastSocialPackImpressionAt,
    socialPackImpressions: state.socialPackImpressions,
    socialPackDismissals: state.socialPackDismissals,
    lastDiamondOfferAt: state.lastDiamondOfferAt,
    diamondOfferDismissals: state.diamondOfferDismissals,
    lastPurchaseAt: state.lastPurchaseAt,
  };
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); } catch { /* best effort */ }
}

export async function resetEngagementState(): Promise<EngagementRuntimeState> {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  return createEngagementRuntime();
}

export function engagementLog(message: string, data?: Record<string, unknown>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[ENGAGEMENT] ${message}`, data ?? '');
}

export function isActivePlayEligible(phase: string, blocked: boolean): boolean {
  if (blocked || AppState.currentState !== 'active') return false;
  return phase === 'home' || phase === 'guess' || phase === 'result' || phase === 'pick';
}

export function isSafeMoment(phase: string, blocked: boolean): boolean {
  return !blocked && phase === 'home' && AppState.currentState === 'active';
}

function hasProactiveBudget(state: EngagementRuntimeState, cfg = ENGAGEMENT_CONFIG): boolean {
  const today = dayKey();
  const used = state.proactivePopupCountSessionDate === today ? state.proactivePopupCountSession : 0;
  return used < cfg.proactivePopupBudgetPerSession;
}

function globalCapped(state: EngagementRuntimeState, item: EngagementQueueItem, cfg = ENGAGEMENT_CONFIG): boolean {
  if (item.ignoreGlobalCooldown) return false;
  if (item.playerRequested || item.priority >= EngagementPriority.PLAYER_REQUESTED) return false;
  if (!hasProactiveBudget(state, cfg)) return true;
  if (Date.now() - state.lastPurchaseAt < cfg.postPurchaseSuppressionMs) return true;
  return Date.now() - state.lastGlobalPopupClosedAt < cfg.globalPopupCooldownMs;
}

export function enqueueEngagement(state: EngagementRuntimeState, item: EngagementQueueItem, cfg = ENGAGEMENT_CONFIG): EngagementRuntimeState {
  if (state.currentlyPresentedEngagement === item.id || state.queuedEngagements.some((q) => q.id === item.id)) return state;
  if (globalCapped(state, item, cfg)) {
    engagementLog(`Skipped ${item.kind}: frequency_cap`, { id: item.id });
    return state;
  }
  engagementLog(`Queued ${item.kind}`, { id: item.id, priority: item.priority });
  return { ...state, queuedEngagements: [...state.queuedEngagements, item].sort((a, b) => b.priority - a.priority) };
}

export function takeNextEngagement(state: EngagementRuntimeState, phase: string, blocked: boolean): { state: EngagementRuntimeState; item: EngagementQueueItem | null } {
  if (!isSafeMoment(phase, blocked) || state.currentlyPresentedEngagement || state.queuedEngagements.length === 0) return { state, item: null };
  const [item, ...rest] = state.queuedEngagements;
  if (!item) return { state, item: null };
  engagementLog(`Showing ${item.kind}`, { id: item.id, priority: item.priority });
  return { state: markEngagementImpression({ ...state, queuedEngagements: rest, currentlyPresentedEngagement: item.id }, item), item };
}

export function markEngagementImpression(state: EngagementRuntimeState, item: EngagementQueueItem): EngagementRuntimeState {
  const today = dayKey();
  const proactive = !item.playerRequested && !item.ignoreGlobalCooldown && item.priority < EngagementPriority.PLAYER_REQUESTED;
  return {
    ...state,
    proactivePopupCountSessionDate: today,
    proactivePopupCountSession: proactive ? (state.proactivePopupCountSessionDate === today ? state.proactivePopupCountSession : 0) + 1 : state.proactivePopupCountSession,
    lastSocialPackImpressionAt: state.lastSocialPackImpressionAt,
    socialPackImpressions: item.kind === 'SOCIAL_PACK_DISCOVERY' ? state.socialPackImpressions + 1 : state.socialPackImpressions,
    lastFeedbackPromptAt: item.kind === 'FEEDBACK_PROMPT' ? Date.now() : state.lastFeedbackPromptAt,
    feedbackPromptCount: item.kind === 'FEEDBACK_PROMPT' ? state.feedbackPromptCount + 1 : state.feedbackPromptCount,
    lastRatingRequestAt: item.kind === 'RATING_PROMPT' ? Date.now() : state.lastRatingRequestAt,
    ratingRequestCount: item.kind === 'RATING_PROMPT' ? state.ratingRequestCount + 1 : state.ratingRequestCount,
    lastDiamondOfferAt: item.kind === 'POST_MATCH_OFFER' ? Date.now() : state.lastDiamondOfferAt,
  };
}

export function closeEngagement(state: EngagementRuntimeState, item: EngagementQueueItem | null, dismissed = true): EngagementRuntimeState {
  return {
    ...state,
    currentlyPresentedEngagement: null,
    lastGlobalPopupClosedAt: Date.now(),
    socialPackDismissals: dismissed && item?.kind === 'SOCIAL_PACK_DISCOVERY' ? state.socialPackDismissals + 1 : state.socialPackDismissals,
    diamondOfferDismissals: dismissed && item?.kind === 'POST_MATCH_OFFER' ? state.diamondOfferDismissals + 1 : state.diamondOfferDismissals,
  };
}

export function recordActiveSeconds(state: EngagementRuntimeState, seconds: number): EngagementRuntimeState {
  const s = Math.max(0, seconds);
  return { ...state, activeSessionSeconds: state.activeSessionSeconds + s, totalActivePlaySeconds: state.totalActivePlaySeconds + s };
}

export function recordMatchFinished(state: EngagementRuntimeState): EngagementRuntimeState {
  return { ...state, matchesPlayedSession: state.matchesPlayedSession + 1, totalMatches: state.totalMatches + 1 };
}

export function recordPurchaseSuccess(state: EngagementRuntimeState, ownsSocialPack?: boolean): EngagementRuntimeState {
  return {
    ...state,
    lastPurchaseAt: Date.now(),
    queuedEngagements: ownsSocialPack ? state.queuedEngagements.filter((q) => q.kind !== 'SOCIAL_PACK_DISCOVERY' && q.kind !== 'SOCIAL_PACK_LOCKED_MODE') : state.queuedEngagements,
  };
}

export function evaluateSocialPackEngagement(profile: ProfileView | null, state: EngagementRuntimeState, hasActivePack: boolean, cfg = ENGAGEMENT_CONFIG): EngagementQueueItem | null {
  if (!profile?.usernameSet || hasActivePack) return null;
  return { id: `social_pack_discovery_${state.sessionId}`, kind: 'SOCIAL_PACK_DISCOVERY', priority: EngagementPriority.DISCOVERY, source: 'cold_start_home_ready', createdAt: Date.now(), ignoreGlobalCooldown: true };
}

export function evaluateFeedbackEngagement(profile: ProfileView | null, state: EngagementRuntimeState, cfg = ENGAGEMENT_CONFIG): EngagementQueueItem | null {
  if (!profile?.usernameSet) return null;
  if (state.totalActivePlaySeconds < cfg.feedbackMinActiveSeconds || state.totalMatches < cfg.feedbackMinCompletedMatches) return null;
  if (Date.now() - state.lastFeedbackPromptAt < cfg.feedbackCooldownMs) return null;
  return { id: 'feedback_prompt', kind: 'FEEDBACK_PROMPT', priority: EngagementPriority.FEEDBACK, source: 'natural_home_break', createdAt: Date.now() };
}

export function evaluateRatingEngagement(profile: ProfileView | null, state: EngagementRuntimeState, milestone = false, cfg = ENGAGEMENT_CONFIG): EngagementQueueItem | null {
  if (!profile?.usernameSet) return null;
  if (!milestone && state.totalMatches < cfg.ratingMinCompletedMatches && state.totalActivePlaySeconds < cfg.ratingMinActiveSeconds) return null;
  if (state.ratingCompleted) return null;                       // yıldızını verdi — bir daha rahatsız etme
  if (Date.now() < state.ratingSnoozedUntil) return null;        // 'şimdi değil' — erteleme sürüyor
  // Israr sınırı: 'şimdi değil' diyen oyuncuya en fazla 5 kez sorulur, sonra susulur.
  if (state.ratingRequestCount >= cfg.ratingMaxAsks) return null;
  // Erteleme yaşanmışsa 21 günlük cooldown ATLANIR — 'şimdi değil' diyene erteleme
  // süresi (3 gün) sonunda tekrar sorulur; hiç ertelenmediyse normal cooldown geçerli.
  if (state.ratingSnoozedUntil === 0 && Date.now() - state.lastRatingRequestAt < cfg.ratingCooldownMs) return null;
  // ignoreGlobalCooldown (2026-08-27): günde-1-proaktif-popup bütçesini Sosyal
  // Paket keşfi tüketince yıldız istemi o gün hiç çıkamıyordu. Yıldız istemi
  // bütçeden muaf — kendi 21 günlük cooldown'u + iOS'un yılda-3 sınırı yeterli fren.
  return { id: 'rating_prompt', kind: 'RATING_PROMPT', priority: EngagementPriority.STORE_RATING, source: milestone ? 'milestone' : 'experienced_player', createdAt: Date.now(), ignoreGlobalCooldown: true };
}
