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

// Ana ekran profil hapındaki XP çubuğunun ekran-uzayı merkezi. ProfilePill
// ölçer; maç sonrası XP küreleri tam çubuğun üstüne süzülür.
export const xpTarget = { x: 0, y: 0, measured: false };

export function setXpTarget(x: number, y: number): void {
  xpTarget.x = x;
  xpTarget.y = y;
  xpTarget.measured = true;
}

// Küre yağmuru başlamadan hemen önce taze ölçüm: ilk onLayout ölçümü sekme
// kaydırması/yeniden mount yüzünden bayatlamış olabilir. ProfilePill kaydeder.
let xpRemeasureFn: (() => void) | null = null;
export function setXpRemeasure(fn: (() => void) | null): void {
  xpRemeasureFn = fn;
}
export function remeasureXpTarget(): void {
  xpRemeasureFn?.();
}
