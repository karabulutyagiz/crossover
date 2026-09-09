/** Weighted startup milestones, not a simulated download or a network-speed claim. */
export function openingProgress({ fontsReady, artReady, bootReady, complete, blocked }: {
  fontsReady: boolean; artReady: boolean; bootReady: boolean; complete: boolean; blocked: boolean;
}): number {
  if (complete && fontsReady && artReady && bootReady && !blocked) return 1;
  return Math.min(blocked ? 0.86 : 0.94, 0.12 + (fontsReady ? 0.2 : 0) + (artReady ? 0.32 : 0) + (bootReady ? 0.3 : 0));
}
