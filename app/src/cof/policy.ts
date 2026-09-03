// ══════════════════════════════════════════════════════════════════════════
// COF — token SÖZLEŞMESİNİN saf (RN'siz) uygulaması: buton/rozet ön plan rengi,
// etiket sığdırma politikası, rakam genişliği. Yalnız token JSON'u + kontrast
// matematiği okur, hiçbir şey uydurmaz; bu yüzden tsx altında test edilebilir.
// Sürüm 1.0.1 sözleşmesi: parlak yüzeylerde KOYU lacivert metin; açık metin
// yalnız 4.5:1 DOĞRULANMIŞSA. Doğrulama burada çalışma anında yapılır —
// eşleşme elle yazılmaz, ölçülür.
// ══════════════════════════════════════════════════════════════════════════
import tokens from './01_COF_UI_TOKENS.json';
import { contrastRatio } from './contrast';

const C = tokens.color;
const MIN_BODY = tokens.accessibility.minimumBodyContrast;

export type CofButtonVariant = 'primary' | 'secondary' | 'reward' | 'ghost' | 'danger';
export type CofBadgeVariant = 'count' | 'new' | 'reward' | 'premium' | 'info' | 'success' | 'warning' | 'error' | 'streak';

/** 'text.onPrimary' → '#091630'. Token dosyası tek kaynak; kod yol adını taşır. */
export function resolveColorToken(path: string): string | null {
  const parts = path.split('.');
  let node: unknown = C;
  for (const p of parts) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[p];
  }
  return typeof node === 'string' ? node : null;
}

/** Kontrast DOĞRULAMASININ yapıldığı gerçek yüzeyler. */
export const BUTTON_SURFACE: Record<CofButtonVariant, string> = {
  primary: C.brand.primary,
  secondary: C.surface.strong,
  reward: C.reward.gold,
  ghost: C.background.canvas, // yüzeysiz varyant → ekran zemini
  danger: C.semantic.error,
};

export const BADGE_SURFACE: Record<CofBadgeVariant, string> = {
  count: C.semantic.error,
  new: C.semantic.error,
  reward: C.reward.gold,
  premium: C.premium.gem,
  info: C.semantic.info,
  success: C.semantic.success,
  warning: C.semantic.warning,
  error: C.semantic.error,
  streak: C.semantic.streak,
};

// Token dosyasında beyan edilen eşleşme 4.5:1'i tutmazsa düşülecek SEMANTİK
// on-renk. (danger: v1.0.1 haritası text.onSecondary diyor ama #F8FAFF/#FF5D72
// yalnız 2.85:1 — dosyanın kendi tabanının altında; text.onError ile 6.04:1.)
const ON_COLOR_FALLBACK: Record<CofButtonVariant, string> = {
  primary: 'text.onPrimary',
  secondary: 'text.onSecondary',
  reward: 'text.onGold',
  ghost: 'text.primary',
  danger: 'text.onError',
};

const BADGE_ON_COLOR: Record<CofBadgeVariant, string> = {
  count: 'text.onError',
  new: 'text.onError',
  reward: 'text.onGold',
  premium: 'text.onPremium',
  info: 'text.onInfo',
  success: 'text.onSuccess',
  warning: 'text.onWarning',
  error: 'text.onError',
  streak: 'text.onStreak',
};

function pickAccessible(surface: string, preferredPath: string | undefined, fallbackPath: string): { color: string; ratio: number; usedFallback: boolean } {
  const preferred = preferredPath ? resolveColorToken(preferredPath) : null;
  if (preferred) {
    const ratio = contrastRatio(preferred, surface);
    if (ratio >= MIN_BODY) return { color: preferred, ratio, usedFallback: false };
  }
  const fb = resolveColorToken(fallbackPath) ?? C.text.primary;
  return { color: fb, ratio: contrastRatio(fb, surface), usedFallback: true };
}

const DECLARED_BUTTON_FG = tokens.component.button.foregroundByVariant as Partial<Record<CofButtonVariant, string>>;

/** Buton metin rengi — token haritası + 4.5:1 doğrulaması. */
export function buttonForeground(variant: CofButtonVariant): string {
  return pickAccessible(BUTTON_SURFACE[variant], DECLARED_BUTTON_FG[variant], ON_COLOR_FALLBACK[variant]).color;
}
export function buttonForegroundDetail(variant: CofButtonVariant) {
  return { surface: BUTTON_SURFACE[variant], declared: DECLARED_BUTTON_FG[variant] ?? null, ...pickAccessible(BUTTON_SURFACE[variant], DECLARED_BUTTON_FG[variant], ON_COLOR_FALLBACK[variant]) };
}

/** Rozet metin/ikon rengi — dolu semantik yüzeyde otomatik beyaz YOK. */
export function badgeForeground(variant: CofBadgeVariant): string {
  return pickAccessible(BADGE_SURFACE[variant], BADGE_ON_COLOR[variant], BADGE_ON_COLOR[variant]).color;
}
export function badgeForegroundDetail(variant: CofBadgeVariant) {
  return { surface: BADGE_SURFACE[variant], ...pickAccessible(BADGE_SURFACE[variant], BADGE_ON_COLOR[variant], BADGE_ON_COLOR[variant]) };
}

/** Açık ikincil kontrol sınırı (dekoratif kart sınırları BUNU kullanmaz). */
export const CONTROL_BORDER_COLOR: string = resolveColorToken(tokens.component.button.secondaryBorder) ?? C.stroke.default;

// ---- Etiket sığdırma politikası (v1.0.1) ------------------------------------
// Ana CTA: küçültme YOK, tek satır, tanımlı boy — sığmayan metin kopyayla ya da
// düzenle çözülür (geliştirmede uyarı basılır). Uzun ikincil aksiyon: kompakt
// stil ya da belgelenmiş iki satır; son çare otomatik küçültme TABANI 0.90.
export const LABEL_MIN_FIT_SCALE = 0.9;
export type CofButtonSize = 'primary' | 'secondary' | 'compact';
export function labelFitPolicy(size: CofButtonSize, allowTwoLines = false): { numberOfLines: number; adjustsFontSizeToFit: boolean; minimumFontScale?: number } {
  if (size === 'primary') return { numberOfLines: 1, adjustsFontSizeToFit: false };
  return { numberOfLines: allowTwoLines ? 2 : 1, adjustsFontSizeToFit: !allowTwoLines, ...(allowTwoLines ? null : { minimumFontScale: LABEL_MIN_FIT_SCALE }) };
}

// ---- Rakam genişliği (sabit genişlikli sayaç kapsayıcısı) --------------------
// ÖLÇÜM (hmtx/head tablolarından, 2026-09-03): paketteki Poppins dosyalarında
// `tnum` OpenType özelliği YOK ve rakam genişlikleri farklı (ExtraBold 387..691,
// SemiBold 362..661 / 1000 em). Bu yüzden token numberBehavior.currentFontSupport
// false; yerinde değişen sayaçlar için hücre genişliği EN GENİŞ rakamdan türetilir.
export const DIGIT_CELL_RATIO: Record<'COFDisplay' | 'COFUI', number> = {
  COFDisplay: 0.691, // Poppins-ExtraBold '4' = 691/1000 em
  COFUI: 0.661,      // Poppins-SemiBold  '4' = 661/1000 em
};
export const NUMBER_BEHAVIOR = tokens.typography.numberBehavior;
