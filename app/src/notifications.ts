// Push notifications — fully guarded so Expo Go NEVER crashes.
//
// Remote push does not work in Expo Go (SDK 53+ removed it), so every
// expo-notifications call here is wrapped: the module is required in try/catch
// (same pattern as react-native-iap in screens.tsx) and every function
// silently no-ops / returns null when the module or capability is missing.
// The real target is EAS/TestFlight builds, where everything below is live.
//
// Push payload data shapes handled on tap (mirrors the server):
//   { kind: 'message', fromId: string }  → open chat with fromId
//   { kind: 'reengage' }                 → just open the app (home)
//   { kind: 'store' }                    → open the store tab
import { Platform } from 'react-native';

// Guarded requires — Expo Go ships these JS modules, but keep the IAP-style
// guard so a missing/failing native binding can never take the app down.
let Notifications: any = null;
try { Notifications = require('expo-notifications'); } catch { Notifications = null; }

let Constants: any = null;
try { Constants = require('expo-constants').default; } catch { Constants = null; }

let Device: any = null;
try { Device = require('expo-device'); } catch { Device = null; }

/** True when running inside the Expo Go client (remote push unavailable). */
export function isExpoGo(): boolean {
  return Constants?.executionEnvironment === 'storeClient';
}

// Foreground behavior: in-app banners (TopBanner/InviteBanner) already cover
// alerts, so suppress the system banner + sound and only keep the badge fresh.
try {
  Notifications?.setNotificationHandler?.({
    handleNotification: async () => ({
      shouldShowAlert: false, // legacy name (pre-SDK 53 API)
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
} catch { /* Expo Go / module unavailable — nothing to configure */ }

// Android 8+ requires a channel before any notification can show. The Expo
// push service targets 'default' unless a message names another channel.
async function ensureAndroidChannel(): Promise<void> {
  if (!Notifications || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance?.MAX ?? 5,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#27E58B',
    });
  } catch { /* Expo Go — channel APIs unavailable */ }
}

/** True if notification permission is already granted (no prompt shown). */
export async function getPushPermissionGranted(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const p = await Notifications.getPermissionsAsync();
    return !!p?.granted;
  } catch {
    return false;
  }
}

/**
 * Ask for notification permission. iOS prompts for alert+badge+sound;
 * Android 13+ POST_NOTIFICATIONS is handled by expo-notifications itself.
 * Resolves false (never throws) when denied or unavailable (Expo Go errors).
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    await ensureAndroidChannel();
    const existing = await Notifications.getPermissionsAsync();
    if (existing?.granted) return true;
    const res = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return !!res?.granted;
  } catch {
    return false;
  }
}

/**
 * Expo push token for this install, or null in Expo Go / on simulators /
 * on any error. Uses the EAS projectId from app.json extra.eas.projectId.
 */
export async function getPushToken(): Promise<string | null> {
  if (!Notifications || isExpoGo()) return null;
  try {
    // Simulators/emulators never get a real push token — don't even try.
    if (Device && Device.isDevice === false) return null;
    const projectId: string | undefined =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return null;
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    return typeof res?.data === 'string' && res.data ? res.data : null;
  } catch {
    return null;
  }
}

/** Set the app icon badge count (unread messages + pending friend requests). */
export function setBadge(count: number): void {
  if (!Notifications) return;
  try {
    Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)))?.catch?.(() => {});
  } catch { /* Expo Go — badge unavailable */ }
}

/**
 * Listen for notification taps. Covers both warm taps
 * (addNotificationResponseReceivedListener) and the cold-start tap that
 * launched the app (getLastNotificationResponseAsync), deduped by the
 * notification identifier so a launch tap never fires the callback twice.
 * Returns an unsubscribe function.
 */
export function addNotificationTapListener(cb: (data: any) => void): () => void {
  if (!Notifications) return () => {};
  let lastHandledId: string | null = null;
  const handle = (response: any) => {
    const id: string | null = response?.notification?.request?.identifier ?? null;
    if (id != null && id === lastHandledId) return;
    lastHandledId = id;
    const data = response?.notification?.request?.content?.data;
    if (data) cb(data);
  };
  let sub: { remove?: () => void } | null = null;
  try {
    sub = Notifications.addNotificationResponseReceivedListener(handle);
    // Cold start: the tap that launched the app arrives as the "last response".
    Notifications.getLastNotificationResponseAsync?.()
      ?.then?.((response: any) => { if (response) handle(response); })
      ?.catch?.(() => {});
  } catch { /* Expo Go — tap routing only matters in real builds */ }
  return () => { try { sub?.remove?.(); } catch { /* already gone */ } };
}
