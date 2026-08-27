import { AudioEvent, GameFeedbackEvent, HapticEvent } from './events';
import { boostAmbience, duckMusic, playSFX, startMatchFoundAlert } from './AudioService';
import { playHaptic } from './HapticsService';

const EVENT_MAP: Partial<Record<GameFeedbackEvent, { sfx?: AudioEvent; haptic?: HapticEvent; duck?: boolean; crowd?: boolean; volume?: number; priority?: number }>> = {
  [GameFeedbackEvent.UI_TAP]: { sfx: AudioEvent.UI_TAP, haptic: HapticEvent.LIGHT, volume: 0.58 },
  [GameFeedbackEvent.UI_NAVIGATION]: { sfx: AudioEvent.UI_NAVIGATION, haptic: HapticEvent.LIGHT, volume: 0.42 },
  [GameFeedbackEvent.UI_PRIMARY]: { sfx: AudioEvent.UI_PRIMARY, haptic: HapticEvent.MEDIUM, volume: 0.72 },
  [GameFeedbackEvent.UI_PLAY]: { sfx: AudioEvent.UI_PLAY, haptic: HapticEvent.MEDIUM, volume: 0.78 },
  [GameFeedbackEvent.UI_SECONDARY]: { sfx: AudioEvent.UI_SECONDARY, haptic: HapticEvent.LIGHT, volume: 0.54 },
  [GameFeedbackEvent.UI_CARD]: { sfx: AudioEvent.UI_SECONDARY, haptic: HapticEvent.LIGHT, volume: 0.56 },
  [GameFeedbackEvent.UI_CONFIRM]: { sfx: AudioEvent.UI_CONFIRM, haptic: HapticEvent.MEDIUM, volume: 0.70 },
  [GameFeedbackEvent.UI_NEGATIVE]: { sfx: AudioEvent.UI_NEGATIVE, haptic: HapticEvent.LIGHT, volume: 0.50 },
  [GameFeedbackEvent.UI_DANGER]: { sfx: AudioEvent.UI_NEGATIVE, haptic: HapticEvent.MEDIUM, volume: 0.56 },
  [GameFeedbackEvent.UI_DESTRUCTIVE]: { sfx: AudioEvent.UI_DESTRUCTIVE, haptic: HapticEvent.HEAVY, volume: 0.72 },
  [GameFeedbackEvent.UI_BACK]: { sfx: AudioEvent.UI_BACK, haptic: HapticEvent.LIGHT, volume: 0.48 },
  [GameFeedbackEvent.UI_CLOSE]: { sfx: AudioEvent.UI_CLOSE, haptic: HapticEvent.LIGHT, volume: 0.46 },
  [GameFeedbackEvent.UI_OPEN]: { sfx: AudioEvent.UI_SECONDARY, haptic: HapticEvent.LIGHT, volume: 0.54 },
  [GameFeedbackEvent.UI_TAB_SWITCH]: { sfx: AudioEvent.UI_NAVIGATION, haptic: HapticEvent.LIGHT, volume: 0.42 },
  [GameFeedbackEvent.UI_TOGGLE_ON]: { sfx: AudioEvent.UI_TOGGLE_ON, haptic: HapticEvent.LIGHT },
  [GameFeedbackEvent.UI_TOGGLE_OFF]: { sfx: AudioEvent.UI_TOGGLE_OFF, haptic: HapticEvent.LIGHT },
  [GameFeedbackEvent.UI_PURCHASE]: { sfx: AudioEvent.UI_PURCHASE, haptic: HapticEvent.MEDIUM, volume: 0.62 },
  [GameFeedbackEvent.UI_REWARD]: { sfx: AudioEvent.UI_REWARD, haptic: HapticEvent.SUCCESS, volume: 0.68 },
  [GameFeedbackEvent.PURCHASE_CONFIRMED]: { sfx: AudioEvent.PURCHASE_SUCCESS_TICK, haptic: HapticEvent.SUCCESS, duck: true, volume: 0.78, priority: 72 },
  [GameFeedbackEvent.DIAMOND_COLLECTION_COMPLETE]: { sfx: AudioEvent.DIAMOND_SETTLE, haptic: HapticEvent.MEDIUM, volume: 0.76, priority: 68 },
  [GameFeedbackEvent.UI_DISABLED]: { sfx: AudioEvent.UI_DISABLED, haptic: HapticEvent.LIGHT, volume: 0.26 },
  [GameFeedbackEvent.UI_ERROR]: { sfx: AudioEvent.UI_ERROR, haptic: HapticEvent.ERROR, volume: 0.48 },
  [GameFeedbackEvent.SPLASH_ELECTRIC_IMPACT]: { sfx: AudioEvent.SPLASH_ELECTRIC_IMPACT, haptic: HapticEvent.HEAVY, duck: true, volume: 0.96, priority: 96 },
  [GameFeedbackEvent.ANSWER_SUBMIT]: { sfx: AudioEvent.ANSWER_SUBMIT, haptic: HapticEvent.LIGHT, volume: 0.68 },
  [GameFeedbackEvent.COUNTDOWN_3]: { sfx: AudioEvent.COUNTDOWN_3, haptic: HapticEvent.LIGHT, volume: 0.72 },
  [GameFeedbackEvent.COUNTDOWN_2]: { sfx: AudioEvent.COUNTDOWN_2, haptic: HapticEvent.MEDIUM, volume: 0.82 },
  [GameFeedbackEvent.COUNTDOWN_1]: { sfx: AudioEvent.COUNTDOWN_1, haptic: HapticEvent.HEAVY, volume: 0.92 },
  [GameFeedbackEvent.MATCH_START]: { sfx: AudioEvent.MATCH_START, haptic: HapticEvent.SPECIAL, crowd: true, volume: 0.96 },
  [GameFeedbackEvent.TIMER_WARNING]: { sfx: AudioEvent.TIMER_WARNING },
  [GameFeedbackEvent.TIMER_CRITICAL]: { sfx: AudioEvent.TIMER_CRITICAL, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.TIMEOUT]: { sfx: AudioEvent.TIMEOUT_IMPACT, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.ANSWER_CORRECT]: { sfx: AudioEvent.ANSWER_CORRECT, haptic: HapticEvent.SUCCESS, crowd: true },
  [GameFeedbackEvent.ANSWER_WRONG]: { sfx: AudioEvent.ANSWER_WRONG, haptic: HapticEvent.ERROR },
  [GameFeedbackEvent.OPPONENT_CORRECT]: { sfx: AudioEvent.OPPONENT_CORRECT },
  [GameFeedbackEvent.ROUND_WIN]: { sfx: AudioEvent.ROUND_WIN, haptic: HapticEvent.SUCCESS },
  [GameFeedbackEvent.ROUND_LOSE]: { sfx: AudioEvent.ROUND_LOSE, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.MATCH_FOUND]: { sfx: AudioEvent.MATCHMAKING_FOUND, haptic: HapticEvent.HEAVY, duck: true, volume: 1, priority: 96 },
  [GameFeedbackEvent.MATCH_WIN]: { sfx: AudioEvent.MATCH_WIN, haptic: HapticEvent.SUCCESS, duck: true, crowd: true },
  [GameFeedbackEvent.MATCH_LOSE]: { sfx: AudioEvent.MATCH_LOSE, haptic: HapticEvent.WARNING, duck: true },
  [GameFeedbackEvent.MATCH_DRAW]: { sfx: AudioEvent.DRAW, haptic: HapticEvent.WARNING, duck: true },
  [GameFeedbackEvent.TROPHY_GAIN]: { sfx: AudioEvent.TROPHY_GAIN, haptic: HapticEvent.SUCCESS },
  [GameFeedbackEvent.TROPHY_LOSS]: { sfx: AudioEvent.TROPHY_LOSS, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.XP_GAIN]: { sfx: AudioEvent.XP_GAIN, haptic: HapticEvent.LIGHT },
  [GameFeedbackEvent.LEVEL_UP]: { sfx: AudioEvent.LEVEL_UP, haptic: HapticEvent.HEAVY, duck: true },
  [GameFeedbackEvent.ARENA_UNLOCK]: { sfx: AudioEvent.ARENA_UNLOCK, haptic: HapticEvent.HEAVY, duck: true, crowd: true },
  [GameFeedbackEvent.REWARD_OPEN]: { sfx: AudioEvent.UI_REWARD, haptic: HapticEvent.SUCCESS, volume: 0.66 },
  // ---- Maç içi Özel Güçler: mevcut premium ses paletiyle eşlenir (yeni asset yok;
  // tiz/oyuncak hypercasual tınılar YASAK — spec §59) ----
  [GameFeedbackEvent.SP_FREEZE]: { sfx: AudioEvent.TIMEOUT_IMPACT, haptic: HapticEvent.MEDIUM, volume: 0.72 },
  [GameFeedbackEvent.SP_REVEAL]: { sfx: AudioEvent.UI_REWARD, haptic: HapticEvent.SUCCESS, volume: 0.74 },
  [GameFeedbackEvent.SP_SKIP]: { sfx: AudioEvent.UI_NAVIGATION, haptic: HapticEvent.MEDIUM, volume: 0.78 },
  [GameFeedbackEvent.SP_EXTRATIME]: { sfx: AudioEvent.TIMER_WARNING, haptic: HapticEvent.LIGHT, volume: 0.62 },
  [GameFeedbackEvent.SP_SECONDCHANCE]: { sfx: AudioEvent.ACHIEVEMENT, haptic: HapticEvent.SUCCESS, volume: 0.66 },
  [GameFeedbackEvent.SP_OPPONENT]: { sfx: AudioEvent.NOTIFICATION, haptic: HapticEvent.WARNING, volume: 0.62 },
  [GameFeedbackEvent.SP_FROZEN_HIT]: { sfx: AudioEvent.TIMEOUT_IMPACT, haptic: HapticEvent.HEAVY, volume: 0.8 },
  [GameFeedbackEvent.SP_SC_TRIGGERED]: { sfx: AudioEvent.ACHIEVEMENT, haptic: HapticEvent.SUCCESS, volume: 0.7 },
  [GameFeedbackEvent.DIAMOND_GAIN]: { sfx: AudioEvent.UI_REWARD, haptic: HapticEvent.SUCCESS, volume: 0.68 },
  [GameFeedbackEvent.EMOTE_SEND]: { sfx: AudioEvent.EMOTE_SEND, haptic: HapticEvent.LIGHT },
  [GameFeedbackEvent.EMOTE_RECEIVE]: { sfx: AudioEvent.EMOTE_RECEIVE },
  [GameFeedbackEvent.NOTIFICATION]: { sfx: AudioEvent.NOTIFICATION, haptic: HapticEvent.LIGHT },
};

export function triggerFeedback(event: GameFeedbackEvent) {
  if (event === GameFeedbackEvent.SPECIAL_PLAYER_RONALDO) {
    playHaptic(HapticEvent.SPECIAL);
    duckMusic(900, 0.65);
    boostAmbience(900);
    playSFX(AudioEvent.SPECIAL_RONALDO_IMPACT, { priority: 90, volume: 0.86 });
    setTimeout(() => playSFX(AudioEvent.SPECIAL_RONALDO_CELEBRATION, { priority: 92, volume: 0.9 }), 130);
    setTimeout(() => playSFX(AudioEvent.SPECIAL_CROWD_PUNCH, { priority: 90, volume: 0.8 }), 620);
    return;
  }
  if (event === GameFeedbackEvent.MATCH_FOUND) {
    duckMusic(900, 0.48);
    startMatchFoundAlert();
    playHaptic(HapticEvent.HEAVY);
    return;
  }
  const cfg = EVENT_MAP[event];
  if (!cfg) return;
  if (typeof __DEV__ !== 'undefined' && __DEV__ && event.toString().startsWith('UI_')) {
    console.log('[AUDIO][UI]', event);
  }
  if (cfg.duck) duckMusic();
  if (cfg.crowd) boostAmbience();
  if (cfg.sfx) playSFX(cfg.sfx, { volume: cfg.volume, priority: cfg.priority });
  if (cfg.haptic) playHaptic(cfg.haptic);
}

export function triggerDiamondCollectTick(intensity = 0) {
  const k = Math.max(0, Math.min(1, intensity));
  playSFX(AudioEvent.DIAMOND_COLLECT_TICK, {
    priority: 50,
    volume: 0.46 + k * 0.18,
    rate: 0.96 + k * 0.13,
  });
}

export const GameFeedback = {
  uiTap: () => triggerFeedback(GameFeedbackEvent.UI_TAP),
  navigation: () => triggerFeedback(GameFeedbackEvent.UI_NAVIGATION),
  primaryAction: () => triggerFeedback(GameFeedbackEvent.UI_PRIMARY),
  play: () => triggerFeedback(GameFeedbackEvent.UI_PLAY),
  secondary: () => triggerFeedback(GameFeedbackEvent.UI_SECONDARY),
  close: () => triggerFeedback(GameFeedbackEvent.UI_CLOSE),
  back: () => triggerFeedback(GameFeedbackEvent.UI_BACK),
  confirm: () => triggerFeedback(GameFeedbackEvent.UI_CONFIRM),
  negative: () => triggerFeedback(GameFeedbackEvent.UI_NEGATIVE),
  destructive: () => triggerFeedback(GameFeedbackEvent.UI_DESTRUCTIVE),
  purchase: () => triggerFeedback(GameFeedbackEvent.UI_PURCHASE),
  purchaseSuccess: () => triggerFeedback(GameFeedbackEvent.PURCHASE_CONFIRMED),
  diamondCollectTick: triggerDiamondCollectTick,
  diamondCollectionComplete: () => triggerFeedback(GameFeedbackEvent.DIAMOND_COLLECTION_COMPLETE),
  reward: () => triggerFeedback(GameFeedbackEvent.UI_REWARD),
  disabled: () => triggerFeedback(GameFeedbackEvent.UI_DISABLED),
  answerSubmit: () => triggerFeedback(GameFeedbackEvent.ANSWER_SUBMIT),
} as const;

export function isRonaldoAnswer(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/[^a-zA-Z. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized === 'ronaldo'
    || normalized === 'cristiano ronaldo'
    || normalized === 'cristiano'
    || normalized === 'c. ronaldo'
    || normalized === 'c ronaldo';
}
