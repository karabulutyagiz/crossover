import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { createAudioPlayer, preload, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { AMBIENCE_ASSETS, MUSIC_ASSETS, SFX_ASSETS } from './audioAssets';
import { AmbienceTrack, AudioEvent, MusicTrack } from './events';
import { getFeedbackPreferences, subscribeFeedbackPreferences } from './preferences';

type Player = ReturnType<typeof createAudioPlayer>;
type MusicState = 'idle' | 'loading' | 'playing' | 'paused' | 'transitioning' | 'interrupted' | 'error';
export type AudioScene = 'BOOT' | 'HOME' | 'MATCHMAKING' | 'MATCH_FOUND' | 'COUNTDOWN' | 'MATCH_ACTIVE' | 'RESULT' | 'BACKGROUND';

const PRIORITY: Record<AudioEvent, number> = {
  [AudioEvent.MATCH_WIN]: 100,
  [AudioEvent.ARENA_UNLOCK]: 100,
  [AudioEvent.SPECIAL_RONALDO_IMPACT]: 90,
  [AudioEvent.SPECIAL_RONALDO_CELEBRATION]: 90,
  [AudioEvent.SPECIAL_CROWD_PUNCH]: 90,
  [AudioEvent.MATCH_LOSE]: 85,
  [AudioEvent.MATCHMAKING_FOUND]: 80,
  [AudioEvent.LEVEL_UP]: 80,
  [AudioEvent.ANSWER_CORRECT]: 70,
  [AudioEvent.ROUND_WIN]: 70,
  [AudioEvent.ROUND_LOSE]: 65,
  [AudioEvent.ANSWER_WRONG]: 65,
  [AudioEvent.OPPONENT_CORRECT]: 60,
  [AudioEvent.MATCH_START]: 60,
  [AudioEvent.TROPHY_GAIN]: 55,
  [AudioEvent.TROPHY_LOSS]: 55,
  [AudioEvent.XP_GAIN]: 50,
  [AudioEvent.TIMER_CRITICAL]: 50,
  [AudioEvent.TIMER_WARNING]: 45,
  [AudioEvent.TIMEOUT_IMPACT]: 65,
  [AudioEvent.COUNTDOWN_1]: 45,
  [AudioEvent.COUNTDOWN_2]: 42,
  [AudioEvent.COUNTDOWN_3]: 40,
  [AudioEvent.ANSWER_SUBMIT]: 35,
  [AudioEvent.REWARD_OPEN]: 60,
  [AudioEvent.DIAMOND_GAIN]: 55,
  [AudioEvent.ACHIEVEMENT]: 60,
  [AudioEvent.EMOTE_SEND]: 30,
  [AudioEvent.EMOTE_RECEIVE]: 30,
  [AudioEvent.NOTIFICATION]: 35,
  [AudioEvent.UI_PURCHASE]: 45,
  [AudioEvent.UI_REWARD]: 55,
  [AudioEvent.PURCHASE_SUCCESS_TICK]: 72,
  [AudioEvent.DIAMOND_COLLECT_TICK]: 50,
  [AudioEvent.DIAMOND_SETTLE]: 68,
  [AudioEvent.UI_ERROR]: 40,
  [AudioEvent.UI_DESTRUCTIVE]: 42,
  [AudioEvent.UI_PLAY]: 40,
  [AudioEvent.UI_PRIMARY]: 34,
  [AudioEvent.UI_CONFIRM]: 30,
  [AudioEvent.UI_NEGATIVE]: 26,
  [AudioEvent.UI_SECONDARY]: 25,
  [AudioEvent.UI_NAVIGATION]: 24,
  [AudioEvent.UI_OPEN]: 25,
  [AudioEvent.UI_CLOSE]: 25,
  [AudioEvent.UI_BACK]: 24,
  [AudioEvent.UI_TOGGLE_ON]: 22,
  [AudioEvent.UI_TOGGLE_OFF]: 22,
  [AudioEvent.UI_DISABLED]: 18,
  [AudioEvent.UI_TAB_SWITCH]: 21,
  [AudioEvent.UI_TAP]: 20,
  [AudioEvent.SCORE_GAIN]: 45,
  [AudioEvent.SCORE_LOSE]: 42,
  [AudioEvent.DRAW]: 55,
};

const MIN_INTERVAL_MS: Partial<Record<AudioEvent, number>> = {
  [AudioEvent.UI_TAP]: 70,
  [AudioEvent.UI_NAVIGATION]: 82,
  [AudioEvent.UI_PRIMARY]: 95,
  [AudioEvent.UI_PLAY]: 160,
  [AudioEvent.UI_SECONDARY]: 85,
  [AudioEvent.UI_NEGATIVE]: 95,
  [AudioEvent.UI_CONFIRM]: 105,
  [AudioEvent.UI_DESTRUCTIVE]: 180,
  [AudioEvent.UI_PURCHASE]: 220,
  [AudioEvent.PURCHASE_SUCCESS_TICK]: 280,
  [AudioEvent.DIAMOND_COLLECT_TICK]: 55,
  [AudioEvent.DIAMOND_SETTLE]: 320,
  [AudioEvent.UI_DISABLED]: 130,
  [AudioEvent.UI_TAB_SWITCH]: 90,
  [AudioEvent.ANSWER_SUBMIT]: 95,
  [AudioEvent.TIMER_WARNING]: 700,
  [AudioEvent.TIMER_CRITICAL]: 700,
  [AudioEvent.MATCHMAKING_FOUND]: 1600,
  [AudioEvent.COUNTDOWN_3]: 850,
  [AudioEvent.COUNTDOWN_2]: 850,
  [AudioEvent.COUNTDOWN_1]: 850,
  [AudioEvent.MATCH_START]: 900,
};

const UI_VARIATION_EVENTS = new Set<AudioEvent>([
  AudioEvent.UI_TAP,
  AudioEvent.UI_NAVIGATION,
  AudioEvent.UI_SECONDARY,
  AudioEvent.UI_BACK,
  AudioEvent.UI_CLOSE,
  AudioEvent.UI_TAB_SWITCH,
]);

const BASE_SFX_VOLUME = 0.78;
const BASE_MUSIC_VOLUME = 0.34;
// Stadium ambience is broadband crowd/noise; above this it reads like speaker hiss
// behind the music on phones. Keep it as a barely-there match bed, not a second mix.
const BASE_AMBIENCE_VOLUME = 0.035;

let initialized = false;
let appActive = true;
let lastSfxAt = new Map<AudioEvent, number>();
let activeSfx = 0;
let musicPlayer: Player | null = null;
let musicTrack: MusicTrack | null = null;
let desiredMusicTrack: MusicTrack | null = null;
let musicState: MusicState = 'idle';
let ambiencePlayer: Player | null = null;
let ambienceTrack: AmbienceTrack | null = null;
let unsubscribePrefs: (() => void) | null = null;
let appStateSub: NativeEventSubscription | null = null;
let commandQueue = Promise.resolve();
let musicInstanceCount = 0;
let ambienceInstanceCount = 0;
let currentScene: AudioScene = 'BOOT';
let foregroundScene: AudioScene = 'BOOT';
const fadeTokens = new WeakMap<Player, number>();

function log(msg: string) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[AUDIO] ${msg}`);
}

function warn(msg: string) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[AUDIO WARNING] ${msg}`);
}

function safe(fn: () => void | Promise<void>) {
  try {
    const r = fn();
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
  } catch { /* audio must never crash gameplay */ }
}

function releasePlayer(p: Player | null) {
  if (!p) return;
  safe(() => p.pause());
  safe(() => p.remove());
}

function fadeVolume(player: Player, from: number, to: number, ms: number, done?: () => void) {
  const seq = (fadeTokens.get(player) ?? 0) + 1;
  fadeTokens.set(player, seq);
  const steps = Math.max(3, Math.round(ms / 40));
  for (let i = 0; i <= steps; i++) {
    setTimeout(() => {
      if (fadeTokens.get(player) !== seq) return;
      const k = i / steps;
      player.volume = from + (to - from) * k;
      if (i === steps) done?.();
    }, Math.round(i * ms / steps));
  }
}

function enqueue(command: () => void | Promise<void>) {
  commandQueue = commandQueue.then(command, command).catch((err) => {
    musicState = 'error';
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[AUDIO] command failed', err);
  });
  return commandQueue;
}

function createMusicPlayer(track: MusicTrack): Player {
  musicInstanceCount += 1;
  if (musicInstanceCount > 1) warn(`active music instances = ${musicInstanceCount}; old instance should be fading out`);
  const p = createAudioPlayer(MUSIC_ASSETS[track]);
  p.loop = true;
  p.volume = 0;
  log(`music loaded: ${track}`);
  return p;
}

function releaseMusicPlayer(p: Player | null) {
  if (!p) return;
  releasePlayer(p);
  musicInstanceCount = Math.max(0, musicInstanceCount - 1);
}

function createAmbiencePlayer(track: AmbienceTrack): Player {
  ambienceInstanceCount += 1;
  const p = createAudioPlayer(AMBIENCE_ASSETS[track]);
  p.loop = true;
  p.volume = 0;
  return p;
}

function releaseAmbiencePlayer(p: Player | null) {
  if (!p) return;
  releasePlayer(p);
  ambienceInstanceCount = Math.max(0, ambienceInstanceCount - 1);
}

function silenceMusic(fadeMs = 160) {
  enqueue(() => {
    const p = musicPlayer;
    musicPlayer = null;
    musicTrack = null;
    if (!p) { musicState = 'idle'; return; }
    musicState = 'paused';
    fadeVolume(p, p.volume ?? BASE_MUSIC_VOLUME, 0, fadeMs, () => releaseMusicPlayer(p));
  });
}

export function initAudioService() {
  if (initialized) return;
  initialized = true;
  safe(() => setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }));
  Object.values(SFX_ASSETS).forEach((src) => safe(() => preload(src)));
  Object.values(MUSIC_ASSETS).forEach((src) => safe(() => preload(src)));
  Object.values(AMBIENCE_ASSETS).forEach((src) => safe(() => preload(src)));
  unsubscribePrefs = subscribeFeedbackPreferences((p) => {
    if (!p.music) {
      silenceMusic(160);
      stopAmbience(160);
    } else {
      if (desiredMusicTrack) playMusic(desiredMusicTrack, 220);
      else if (musicPlayer) musicPlayer.volume = BASE_MUSIC_VOLUME;
    }
  });
  appStateSub = AppState.addEventListener('change', handleAppState);
  log('service initialized');
}

function handleAppState(st: AppStateStatus) {
  appActive = st === 'active';
  safe(() => setIsAudioActiveAsync(appActive));
  if (!appActive) {
    foregroundScene = currentScene === 'BACKGROUND' ? foregroundScene : currentScene;
    currentScene = 'BACKGROUND';
    musicState = 'interrupted';
    log('app backgrounded');
    safe(() => musicPlayer?.pause());
    safe(() => ambiencePlayer?.pause());
  } else if (getFeedbackPreferences().music) {
    log('app foregrounded');
    setAudioScene(foregroundScene, 160);
  }
}

export function setAudioScene(scene: AudioScene, fadeMs = 260) {
  if (scene === currentScene && scene !== 'HOME') return;
  const prev = currentScene;
  currentScene = scene;
  if (scene !== 'BACKGROUND') foregroundScene = scene;
  log(`${prev} -> ${scene}`);
  if (scene === 'BOOT') {
    stopMusic(fadeMs);
    stopAmbience(fadeMs);
    return;
  }
  if (scene === 'HOME') {
    stopAmbience(180);
    playMusic(MusicTrack.MAIN_MENU, fadeMs);
    return;
  }
  if (scene === 'MATCHMAKING') {
    stopAmbience(160);
    stopMusic(Math.max(260, fadeMs));
    return;
  }
  if (scene === 'MATCH_FOUND' || scene === 'COUNTDOWN') {
    stopMusic(scene === 'MATCH_FOUND' ? 220 : 120);
    stopAmbience(120);
    return;
  }
  if (scene === 'MATCH_ACTIVE') {
    stopMusic(120);
    // The current stadium bed is an 8s broadband loop; on phones it reads as
    // hiss/crackle under gameplay. Keep match audio event-driven until we have a
    // cleaner, seamless ambience asset.
    stopAmbience(120);
    return;
  }
  if (scene === 'RESULT') {
    stopMusic(180);
    playAmbience(AmbienceTrack.STADIUM, 220);
  }
}

export function playSFX(event: AudioEvent, opts?: { priority?: number; volume?: number; rate?: number }) {
  const prefs = getFeedbackPreferences();
  if (!prefs.sfx || !appActive) return;
  const now = Date.now();
  const min = MIN_INTERVAL_MS[event] ?? 35;
  if (now - (lastSfxAt.get(event) ?? 0) < min) return;
  const priority = opts?.priority ?? PRIORITY[event] ?? 20;
  if (activeSfx >= 4 && priority < 55) return;
  lastSfxAt.set(event, now);
  if (event === AudioEvent.MATCHMAKING_FOUND && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[AUDIO][MATCH_FOUND] whistle fired');
  }
  safe(() => {
    const player = createAudioPlayer(SFX_ASSETS[event]);
    activeSfx += 1;
    const jitter = UI_VARIATION_EVENTS.has(event) ? (Math.random() - 0.5) : 0;
    const volume = (opts?.volume ?? BASE_SFX_VOLUME) * (UI_VARIATION_EVENTS.has(event) ? 1 + jitter * 0.04 : 1);
    player.volume = Math.max(0, Math.min(1, volume));
    const rate = opts?.rate ?? (UI_VARIATION_EVENTS.has(event) ? 1 + jitter * 0.06 : 1);
    if (rate !== 1) player.setPlaybackRate(rate);
    player.seekTo(0).catch(() => {});
    player.play();
    setTimeout(() => {
      activeSfx = Math.max(0, activeSfx - 1);
      releasePlayer(player);
    }, 2600);
  });
}

export function playMusic(track: MusicTrack, fadeMs = 360) {
  desiredMusicTrack = track;
  if (!getFeedbackPreferences().music || !appActive) return;
  enqueue(() => {
    if (!getFeedbackPreferences().music || !appActive || desiredMusicTrack !== track) return;
    if (musicTrack === track && musicPlayer) {
      const current = musicPlayer;
      if (musicState === 'playing' && current.playing) {
        log(`${track} already active - ignoring duplicate request`);
        return;
      }
      safe(() => current.play());
      musicState = 'playing';
      fadeVolume(current, current.volume ?? 0, BASE_MUSIC_VOLUME, fadeMs);
      log(`playing: ${track}`);
      return;
    }
    musicState = musicPlayer ? 'transitioning' : 'loading';
    const prev = musicPlayer;
    const prevTrack = musicTrack;
    const next = createMusicPlayer(track);
    musicPlayer = next;
    musicTrack = track;
    safe(() => next.play());
    musicState = 'playing';
    if (prev) {
      log(`transition ${prevTrack} -> ${track}`);
      fadeVolume(prev, prev.volume ?? BASE_MUSIC_VOLUME, 0, fadeMs, () => releaseMusicPlayer(prev));
    }
    fadeVolume(next, 0, BASE_MUSIC_VOLUME, fadeMs);
    log(`playing: ${track}`);
  });
}

export function stopMusic(fadeMs = 320) {
  desiredMusicTrack = null;
  enqueue(() => {
    const p = musicPlayer;
    musicPlayer = null;
    musicTrack = null;
    if (!p) { musicState = 'idle'; return; }
    musicState = 'transitioning';
    fadeVolume(p, p.volume ?? BASE_MUSIC_VOLUME, 0, fadeMs, () => {
      releaseMusicPlayer(p);
      if (!musicPlayer) musicState = 'idle';
      log('music stopped');
    });
  });
}

export function playAmbience(track: AmbienceTrack, fadeMs = 320) {
  if (!getFeedbackPreferences().music || !appActive) return;
  if (ambienceTrack === track && ambiencePlayer) return;
  stopAmbience(fadeMs);
  const p = createAmbiencePlayer(track);
  ambiencePlayer = p;
  ambienceTrack = track;
  safe(() => p.play());
  fadeVolume(p, 0, BASE_AMBIENCE_VOLUME, fadeMs);
}

export function stopAmbience(fadeMs = 240) {
  const p = ambiencePlayer;
  ambiencePlayer = null;
  ambienceTrack = null;
  if (!p) return;
  fadeVolume(p, p.volume ?? BASE_AMBIENCE_VOLUME, 0, fadeMs, () => releaseAmbiencePlayer(p));
}

export function duckMusic(ms = 520, level = 0.72) {
  if (!musicPlayer || !getFeedbackPreferences().music) return;
  const p = musicPlayer;
  const from = p.volume ?? BASE_MUSIC_VOLUME;
  fadeVolume(p, from, BASE_MUSIC_VOLUME * level, 90, () => {
    setTimeout(() => { if (musicPlayer === p) fadeVolume(p, p.volume ?? BASE_MUSIC_VOLUME * level, BASE_MUSIC_VOLUME, 220); }, ms);
  });
}

export function boostAmbience(ms = 480) {
  if (!ambiencePlayer || !getFeedbackPreferences().music) return;
  const p = ambiencePlayer;
  fadeVolume(p, p.volume ?? BASE_AMBIENCE_VOLUME, BASE_AMBIENCE_VOLUME * 2.15, 80, () => {
    setTimeout(() => { if (ambiencePlayer === p) fadeVolume(p, p.volume ?? BASE_AMBIENCE_VOLUME * 2.15, BASE_AMBIENCE_VOLUME, 240); }, ms);
  });
}

export function disposeAudioService() {
  unsubscribePrefs?.();
  unsubscribePrefs = null;
  appStateSub?.remove();
  appStateSub = null;
  releaseMusicPlayer(musicPlayer);
  releaseAmbiencePlayer(ambiencePlayer);
  musicPlayer = null;
  ambiencePlayer = null;
  musicTrack = null;
  ambienceTrack = null;
  desiredMusicTrack = null;
  musicState = 'idle';
  initialized = false;
}

export function getAudioDiagnostics() {
  return {
    activeMusicInstances: musicInstanceCount,
    activeAmbienceInstances: ambienceInstanceCount,
    activeSfx,
    loadedSfxCount: Object.keys(SFX_ASSETS).length,
    musicState,
    currentMusic: musicTrack,
    desiredMusic: desiredMusicTrack,
    musicEnabled: getFeedbackPreferences().music,
    sfxEnabled: getFeedbackPreferences().sfx,
    hapticsEnabled: getFeedbackPreferences().haptics,
    currentScene,
    foregroundScene,
  };
}
