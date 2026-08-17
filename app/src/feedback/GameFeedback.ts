import { AudioEvent, GameFeedbackEvent, HapticEvent } from './events';
import { boostAmbience, duckMusic, playSFX } from './AudioService';
import { playHaptic } from './HapticsService';

const EVENT_MAP: Partial<Record<GameFeedbackEvent, { sfx?: AudioEvent; haptic?: HapticEvent; duck?: boolean; crowd?: boolean; volume?: number }>> = {
  [GameFeedbackEvent.UI_TAP]: { sfx: AudioEvent.UI_TAP, haptic: HapticEvent.LIGHT, volume: 0.46 },
  [GameFeedbackEvent.UI_CONFIRM]: { sfx: AudioEvent.UI_CONFIRM, haptic: HapticEvent.LIGHT },
  [GameFeedbackEvent.UI_BACK]: { sfx: AudioEvent.UI_BACK, haptic: HapticEvent.LIGHT, volume: 0.5 },
  [GameFeedbackEvent.UI_CLOSE]: { sfx: AudioEvent.UI_CLOSE, haptic: HapticEvent.LIGHT, volume: 0.5 },
  [GameFeedbackEvent.UI_OPEN]: { sfx: AudioEvent.UI_OPEN, haptic: HapticEvent.LIGHT, volume: 0.55 },
  [GameFeedbackEvent.UI_TAB_SWITCH]: { sfx: AudioEvent.UI_TAB_SWITCH, haptic: HapticEvent.LIGHT, volume: 0.48 },
  [GameFeedbackEvent.UI_TOGGLE_ON]: { sfx: AudioEvent.UI_TOGGLE_ON, haptic: HapticEvent.LIGHT },
  [GameFeedbackEvent.UI_TOGGLE_OFF]: { sfx: AudioEvent.UI_TOGGLE_OFF, haptic: HapticEvent.LIGHT },
  [GameFeedbackEvent.UI_PURCHASE]: { sfx: AudioEvent.UI_PURCHASE, haptic: HapticEvent.SUCCESS, duck: true },
  [GameFeedbackEvent.UI_ERROR]: { sfx: AudioEvent.UI_ERROR, haptic: HapticEvent.ERROR },
  [GameFeedbackEvent.ANSWER_SUBMIT]: { sfx: AudioEvent.ANSWER_SUBMIT, haptic: HapticEvent.MEDIUM },
  [GameFeedbackEvent.COUNTDOWN_3]: { sfx: AudioEvent.COUNTDOWN_3, haptic: HapticEvent.MEDIUM },
  [GameFeedbackEvent.COUNTDOWN_2]: { sfx: AudioEvent.COUNTDOWN_2, haptic: HapticEvent.MEDIUM },
  [GameFeedbackEvent.COUNTDOWN_1]: { sfx: AudioEvent.COUNTDOWN_1, haptic: HapticEvent.HEAVY },
  [GameFeedbackEvent.MATCH_START]: { sfx: AudioEvent.MATCH_START, haptic: HapticEvent.HEAVY, crowd: true },
  [GameFeedbackEvent.TIMER_WARNING]: { sfx: AudioEvent.TIMER_WARNING },
  [GameFeedbackEvent.TIMER_CRITICAL]: { sfx: AudioEvent.TIMER_CRITICAL, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.TIMEOUT]: { sfx: AudioEvent.TIMEOUT_IMPACT, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.ANSWER_CORRECT]: { sfx: AudioEvent.ANSWER_CORRECT, haptic: HapticEvent.SUCCESS, crowd: true },
  [GameFeedbackEvent.ANSWER_WRONG]: { sfx: AudioEvent.ANSWER_WRONG, haptic: HapticEvent.ERROR },
  [GameFeedbackEvent.OPPONENT_CORRECT]: { sfx: AudioEvent.OPPONENT_CORRECT, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.ROUND_WIN]: { sfx: AudioEvent.ROUND_WIN, haptic: HapticEvent.SUCCESS },
  [GameFeedbackEvent.ROUND_LOSE]: { sfx: AudioEvent.ROUND_LOSE, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.MATCH_FOUND]: { sfx: AudioEvent.MATCHMAKING_FOUND, haptic: HapticEvent.MEDIUM, duck: true },
  [GameFeedbackEvent.MATCH_WIN]: { sfx: AudioEvent.MATCH_WIN, haptic: HapticEvent.SUCCESS, duck: true, crowd: true },
  [GameFeedbackEvent.MATCH_LOSE]: { sfx: AudioEvent.MATCH_LOSE, haptic: HapticEvent.WARNING, duck: true },
  [GameFeedbackEvent.TROPHY_GAIN]: { sfx: AudioEvent.TROPHY_GAIN, haptic: HapticEvent.SUCCESS },
  [GameFeedbackEvent.TROPHY_LOSS]: { sfx: AudioEvent.TROPHY_LOSS, haptic: HapticEvent.WARNING },
  [GameFeedbackEvent.XP_GAIN]: { sfx: AudioEvent.XP_GAIN, haptic: HapticEvent.LIGHT },
  [GameFeedbackEvent.LEVEL_UP]: { sfx: AudioEvent.LEVEL_UP, haptic: HapticEvent.HEAVY, duck: true },
  [GameFeedbackEvent.ARENA_UNLOCK]: { sfx: AudioEvent.ARENA_UNLOCK, haptic: HapticEvent.HEAVY, duck: true, crowd: true },
  [GameFeedbackEvent.REWARD_OPEN]: { sfx: AudioEvent.REWARD_OPEN, haptic: HapticEvent.SUCCESS },
  [GameFeedbackEvent.DIAMOND_GAIN]: { sfx: AudioEvent.DIAMOND_GAIN, haptic: HapticEvent.SUCCESS },
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
  const cfg = EVENT_MAP[event];
  if (!cfg) return;
  if (cfg.duck) duckMusic();
  if (cfg.crowd) boostAmbience();
  if (cfg.sfx) playSFX(cfg.sfx, { volume: cfg.volume });
  if (cfg.haptic) playHaptic(cfg.haptic);
}

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
