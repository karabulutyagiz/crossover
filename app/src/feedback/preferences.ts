import AsyncStorage from '@react-native-async-storage/async-storage';

export type FeedbackPreferences = {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
};

export const FEEDBACK_PREFS_KEY = '@crossover_feedback_prefs';
export const DEFAULT_FEEDBACK_PREFS: FeedbackPreferences = { music: true, sfx: true, haptics: true };

let prefs: FeedbackPreferences = DEFAULT_FEEDBACK_PREFS;
const listeners = new Set<(next: FeedbackPreferences) => void>();

function sanitize(raw: unknown): FeedbackPreferences {
  const obj = raw && typeof raw === 'object' ? raw as Partial<FeedbackPreferences> : {};
  return {
    music: typeof obj.music === 'boolean' ? obj.music : true,
    sfx: typeof obj.sfx === 'boolean' ? obj.sfx : true,
    haptics: typeof obj.haptics === 'boolean' ? obj.haptics : true,
  };
}

export function getFeedbackPreferences(): FeedbackPreferences {
  return prefs;
}

export function subscribeFeedbackPreferences(listener: (next: FeedbackPreferences) => void): () => void {
  listeners.add(listener);
  listener(prefs);
  return () => listeners.delete(listener);
}

export async function loadFeedbackPreferences(): Promise<FeedbackPreferences> {
  try {
    const saved = await AsyncStorage.getItem(FEEDBACK_PREFS_KEY);
    prefs = saved ? sanitize(JSON.parse(saved)) : DEFAULT_FEEDBACK_PREFS;
  } catch {
    prefs = DEFAULT_FEEDBACK_PREFS;
  }
  listeners.forEach((l) => l(prefs));
  return prefs;
}

export async function setFeedbackPreference<K extends keyof FeedbackPreferences>(key: K, value: FeedbackPreferences[K]): Promise<void> {
  prefs = { ...prefs, [key]: value };
  listeners.forEach((l) => l(prefs));
  try { await AsyncStorage.setItem(FEEDBACK_PREFS_KEY, JSON.stringify(prefs)); } catch { /* persistence is best-effort */ }
}
