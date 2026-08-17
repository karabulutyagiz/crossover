import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HapticEvent } from './events';
import { getFeedbackPreferences } from './preferences';

const MIN_INTERVAL: Record<HapticEvent, number> = {
  [HapticEvent.LIGHT]: 70,
  [HapticEvent.MEDIUM]: 110,
  [HapticEvent.SUCCESS]: 180,
  [HapticEvent.WARNING]: 260,
  [HapticEvent.ERROR]: 220,
  [HapticEvent.HEAVY]: 320,
  [HapticEvent.SPECIAL]: 450,
};

let lastAny = 0;
const lastByEvent = new Map<HapticEvent, number>();

function run(fn: () => Promise<void>) {
  try { fn().catch(() => {}); } catch { /* haptics must never crash gameplay */ }
}

export function playHaptic(event: HapticEvent) {
  if (!getFeedbackPreferences().haptics) return;
  const now = Date.now();
  if (now - lastAny < 45) return;
  if (now - (lastByEvent.get(event) ?? 0) < MIN_INTERVAL[event]) return;
  lastAny = now;
  lastByEvent.set(event, now);
  if (Platform.OS === 'android') {
    const A = Haptics.AndroidHaptics;
    const androidType = event === HapticEvent.SUCCESS ? A.Confirm
      : event === HapticEvent.ERROR ? A.Reject
      : event === HapticEvent.WARNING ? A.Clock_Tick
      : event === HapticEvent.HEAVY || event === HapticEvent.SPECIAL ? A.Long_Press
      : event === HapticEvent.MEDIUM ? A.Context_Click
      : A.Segment_Tick;
    run(() => Haptics.performAndroidHapticsAsync(androidType));
    return;
  }
  if (event === HapticEvent.SUCCESS) run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  else if (event === HapticEvent.ERROR) run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  else if (event === HapticEvent.WARNING) run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  else if (event === HapticEvent.HEAVY || event === HapticEvent.SPECIAL) run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  else if (event === HapticEvent.MEDIUM) run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  else run(() => Haptics.selectionAsync());
}
