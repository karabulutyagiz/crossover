// Shared screen-space position of the top-right diamond counter pill. App.tsx
// measures the real pill (measureInWindow) and stores its centre here, so the
// purchase animation can fly the gems exactly onto the counter instead of an
// approximate corner. `measured` stays false until the first measurement lands.
export const gemTarget = { x: 0, y: 0, measured: false };

export function setGemTarget(x: number, y: number): void {
  gemTarget.x = x;
  gemTarget.y = y;
  gemTarget.measured = true;
}
