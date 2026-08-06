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

// Ana ekran kupa rozetinin (RailBadge) ekran-uzayı merkezi — maç sonrası kupa
// uçuşunun hedefi. HomeScreen ölçer; uçuş başlamadan taze ölçüm istenebilir.
export const trophyTarget = { x: 0, y: 0, measured: false };

export function setTrophyTarget(x: number, y: number): void {
  trophyTarget.x = x;
  trophyTarget.y = y;
  trophyTarget.measured = true;
}

let trophyRemeasureFn: (() => void) | null = null;
export function setTrophyRemeasure(fn: (() => void) | null): void {
  trophyRemeasureFn = fn;
}
export function remeasureTrophyTarget(): void {
  trophyRemeasureFn?.();
}
