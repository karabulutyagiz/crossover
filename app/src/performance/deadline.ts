/** Wall-clock countdown, independent of render frequency and device refresh rate. */
export function deadlineSnapshot(deadline: number | null | undefined, now: number) {
  const remainingMs = deadline != null && Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  return {
    remainingMs, seconds,
    nextSecondMs: remainingMs > 0 ? Math.max(1, remainingMs - (seconds - 1) * 1000 + 1) : null,
  };
}
