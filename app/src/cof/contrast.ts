// COF — WCAG kontrast matematiği (saf; React Native ya da başka bağımlılık YOK,
// böylece tokenlarla birlikte tsx altında doğrudan test edilebilir).
// Kaynak: WCAG 2.1 relative luminance + contrast ratio tanımı.

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** '#RRGGBB' → [r,g,b]; geçersizse null. Alfa'lı rgba() desteklenmez (kontrast zemine bağlıdır). */
export function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** İki opak rengin kontrast oranı (1..21). Renk çözümlenemezse 0 döner (= başarısız say). */
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  if (a == null || b == null) return 0;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
