export const BACKGROUND_SESSION_MS = 5 * 60 * 1000;

/** Wall-clock check also works when the OS suspends all JS timers. */
export function backgroundSessionExpired(since: number | null, now = Date.now()): boolean {
  return since !== null && now - since >= BACKGROUND_SESSION_MS;
}
