import { AppState, type AppStateStatus } from 'react-native';
import { createAudioPlayer, preload, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { AMBIENCE_ASSETS, MUSIC_ASSETS, SFX_ASSETS } from './audioAssets';
import { AmbienceTrack, AudioEvent, MusicTrack } from './events';
import { getFeedbackPreferences, subscribeFeedbackPreferences } from './preferences';

type Player = ReturnType<typeof createAudioPlayer>;

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
  [AudioEvent.UI_ERROR]: 40,
  [AudioEvent.UI_CONFIRM]: 30,
  [AudioEvent.UI_OPEN]: 25,
  [AudioEvent.UI_CLOSE]: 25,
  [AudioEvent.UI_BACK]: 24,
  [AudioEvent.UI_TOGGLE_ON]: 22,
  [AudioEvent.UI_TOGGLE_OFF]: 22,
  [AudioEvent.UI_TAB_SWITCH]: 21,
  [AudioEvent.UI_TAP]: 20,
  [AudioEvent.SCORE_GAIN]: 45,
  [AudioEvent.SCORE_LOSE]: 42,
  [AudioEvent.DRAW]: 55,
};

const MIN_INTERVAL_MS: Partial<Record<AudioEvent, number>> = {
  [AudioEvent.UI_TAP]: 70,
  [AudioEvent.UI_TAB_SWITCH]: 90,
  [AudioEvent.ANSWER_SUBMIT]: 180,
  [AudioEvent.TIMER_WARNING]: 700,
  [AudioEvent.TIMER_CRITICAL]: 700,
};

const BASE_SFX_VOLUME = 0.78;
const BASE_MUSIC_VOLUME = 0.34;
const BASE_AMBIENCE_VOLUME = 0.13;

let initialized = false;
let appActive = true;
let lastSfxAt = new Map<AudioEvent, number>();
let activeSfx = 0;
let musicPlayer: Player | null = null;
let musicTrack: MusicTrack | null = null;
let ambiencePlayer: Player | null = null;
let ambienceTrack: AmbienceTrack | null = null;
let fadeSeq = 0;
let unsubscribePrefs: (() => void) | null = null;

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
  const seq = ++fadeSeq;
  const steps = Math.max(3, Math.round(ms / 40));
  for (let i = 0; i <= steps; i++) {
    setTimeout(() => {
      if (seq !== fadeSeq) return;
      const k = i / steps;
      player.volume = from + (to - from) * k;
      if (i === steps) done?.();
    }, Math.round(i * ms / steps));
  }
}

export function initAudioService() {
  if (initialized) return;
  initialized = true;
  safe(() => setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }));
  Object.values(SFX_ASSETS).forEach((src) => safe(() => preload(src)));
  unsubscribePrefs = subscribeFeedbackPreferences((p) => {
    if (!p.music) {
      stopMusic(160);
      stopAmbience(160);
    } else if (musicPlayer) {
      musicPlayer.volume = BASE_MUSIC_VOLUME;
    }
  });
  AppState.addEventListener('change', handleAppState);
}

function handleAppState(st: AppStateStatus) {
  appActive = st === 'active';
  safe(() => setIsAudioActiveAsync(appActive));
  if (!appActive) {
    safe(() => musicPlayer?.pause());
    safe(() => ambiencePlayer?.pause());
  } else if (getFeedbackPreferences().music) {
    safe(() => musicPlayer?.play());
    safe(() => ambiencePlayer?.play());
  }
}

export function playSFX(event: AudioEvent, opts?: { priority?: number; volume?: number; rate?: number }) {
  const prefs = getFeedbackPreferences();
  if (!prefs.sfx || !appActive) return;
  const now = Date.now();
  const min = MIN_INTERVAL_MS[event] ?? 35;
  if (now - (lastSfxAt.get(event) ?? 0) < min) return;
  const priority = opts?.priority ?? PRIORITY[event] ?? 20;
  if (activeSfx >= 5 && priority < 60) return;
  lastSfxAt.set(event, now);
  safe(() => {
    const player = createAudioPlayer(SFX_ASSETS[event]);
    activeSfx += 1;
    player.volume = Math.max(0, Math.min(1, opts?.volume ?? BASE_SFX_VOLUME));
    if (opts?.rate) player.setPlaybackRate(opts.rate);
    player.seekTo(0).catch(() => {});
    player.play();
    setTimeout(() => {
      activeSfx = Math.max(0, activeSfx - 1);
      releasePlayer(player);
    }, 2600);
  });
}

export function playMusic(track: MusicTrack, fadeMs = 360) {
  if (!getFeedbackPreferences().music || !appActive) return;
  if (musicTrack === track && musicPlayer) {
    const current = musicPlayer;
    safe(() => current.play());
    fadeVolume(current, current.volume ?? 0, BASE_MUSIC_VOLUME, fadeMs);
    return;
  }
  const prev = musicPlayer;
  if (prev) fadeVolume(prev, prev.volume ?? BASE_MUSIC_VOLUME, 0, fadeMs, () => releasePlayer(prev));
  const next = createAudioPlayer(MUSIC_ASSETS[track]);
  next.loop = true;
  next.volume = 0;
  musicPlayer = next;
  musicTrack = track;
  safe(() => next.play());
  fadeVolume(next, 0, BASE_MUSIC_VOLUME, fadeMs);
}

export function stopMusic(fadeMs = 320) {
  const p = musicPlayer;
  musicPlayer = null;
  musicTrack = null;
  if (!p) return;
  fadeVolume(p, p.volume ?? BASE_MUSIC_VOLUME, 0, fadeMs, () => releasePlayer(p));
}

export function playAmbience(track: AmbienceTrack, fadeMs = 320) {
  if (!getFeedbackPreferences().music || !appActive) return;
  if (ambienceTrack === track && ambiencePlayer) return;
  stopAmbience(fadeMs);
  const p = createAudioPlayer(AMBIENCE_ASSETS[track]);
  p.loop = true;
  p.volume = 0;
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
  fadeVolume(p, p.volume ?? BASE_AMBIENCE_VOLUME, 0, fadeMs, () => releasePlayer(p));
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
  releasePlayer(musicPlayer);
  releasePlayer(ambiencePlayer);
  musicPlayer = null;
  ambiencePlayer = null;
  initialized = false;
}
