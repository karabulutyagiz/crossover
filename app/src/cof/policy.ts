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
// Adım 03 semantik rozet türleri. 'count'/'reward'/'success'/'warning' Adım 01.1'den
// geriye uyum için AYNEN korunur ('count' = bildirim sayacı, kırmızı).
// YENİ: 'quantity' nötr envanter sayısı, 'notification' açık adıyla bildirim.
export type CofBadgeVariant =
  | 'quantity' | 'count' | 'notification' | 'new' | 'owned' | 'active'
  | 'rarity' | 'premium' | 'info' | 'error' | 'streak'
  | 'reward' | 'success' | 'warning';

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
  quantity: C.surface.strong,      // nötr adet (envanter sayısı) — semantik renk harcanmaz
  count: C.semantic.error,         // GERİYE UYUM: Adım 01.1'den beri bildirim sayacı
  notification: C.semantic.error,  // dikkat çeken okunmamış sayacı
  new: C.semantic.error,
  owned: C.semantic.success,
  active: C.brand.primary,
  rarity: C.premium.gem,
  premium: C.premium.gem,
  info: C.semantic.info,
  error: C.semantic.error,
  streak: C.semantic.streak,
  reward: C.reward.gold,
  success: C.semantic.success,
  warning: C.semantic.warning,
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
  quantity: 'text.onSecondary',    // surface.strong üstünde açık metin (10.81:1)
  count: 'text.onError',           // GERİYE UYUM: kırmızı bildirim sayacı
  notification: 'text.onError',
  new: 'text.onError',
  owned: 'text.onSuccess',
  active: 'text.onPrimary',
  rarity: 'text.onPremium',
  premium: 'text.onPremium',
  info: 'text.onInfo',
  error: 'text.onError',
  streak: 'text.onStreak',
  reward: 'text.onGold',
  success: 'text.onSuccess',
  warning: 'text.onWarning',
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

// ---- CofInput durum sözleşmesi (saf; test edilebilir) ------------------------
export type CofInputState = 'default' | 'focused' | 'filled' | 'error' | 'disabled';
export type CofInputAppearance = {
  surface: string;
  border: string;
  borderWidth: number;
  text: string;
  placeholder: string;
  label: string;
  /** Yardımcı/hata satırı rengi. */
  help: string;
};

/**
 * Focus YALNIZ renkle anlatılmaz: kenarlık KALINLIĞI da değişir (1.5 → 2 dp).
 * Error hem semantik renk hem yardımcı metinle görünür. Disabled okunur kalır.
 */
export function cofInputAppearance(state: CofInputState): CofInputAppearance {
  switch (state) {
    case 'focused':
      return { surface: C.surface.sunken, border: C.stroke.focus, borderWidth: tokens.border.selected, text: C.text.primary, placeholder: C.text.tertiary, label: C.brand.primary, help: C.text.secondary };
    case 'filled':
      return { surface: C.surface.sunken, border: C.stroke.control, borderWidth: tokens.border.default, text: C.text.primary, placeholder: C.text.tertiary, label: C.text.secondary, help: C.text.secondary };
    case 'error':
      return { surface: C.surface.sunken, border: C.semantic.error, borderWidth: tokens.border.selected, text: C.text.primary, placeholder: C.text.tertiary, label: C.semantic.error, help: C.semantic.error };
    case 'disabled':
      return { surface: C.surface.disabled, border: C.stroke.subtle, borderWidth: tokens.border.hairline, text: C.text.disabled, placeholder: C.text.disabled, label: C.text.disabled, help: C.text.disabled };
    default:
      return { surface: C.surface.sunken, border: C.stroke.default, borderWidth: tokens.border.default, text: C.text.primary, placeholder: C.text.tertiary, label: C.text.secondary, help: C.text.secondary };
  }
}

/** Girişin görsel yüksekliği: bağlama göre 48-52 dp (spec 5.5). */
export const COF_INPUT_HEIGHT = { compact: 48, default: 52 } as const;

// ---- Segmented tab görünümü (spec 5.3) ---------------------------------------
export type CofTabState = 'selected' | 'inactive' | 'disabled';
export function cofTabAppearance(state: CofTabState): { surface: string | null; border: string | null; text: string; showsSecondCue: boolean } {
  if (state === 'selected') return { surface: C.brand.primaryTint, border: C.brand.primary, text: C.brand.primary, showsSecondCue: true };
  if (state === 'disabled') return { surface: C.surface.disabled, border: C.stroke.subtle, text: C.text.disabled, showsSecondCue: true };
  return { surface: null, border: null, text: C.text.secondary, showsSecondCue: false };
}

// ---- Dokunma hedefi ----------------------------------------------------------
export const MIN_TOUCH = tokens.size.minimumTouchTarget;
/** Görsel boyu küçük bir kontrolü 44 dp'ye tamamlayan hitSlop payı. */
export function touchSlopFor(visualSize: number): number {
  return Math.max(0, Math.ceil((MIN_TOUCH - visualSize) / 2));
}

// ---- Buton geometrisi (saf; "loading/disabled'da zıplama yok" testi buna bakar) ----
export const BUTTON_HEIGHT: Record<CofButtonSize, number> = {
  primary: tokens.size.button.primaryHeight,
  secondary: tokens.size.button.secondaryHeight,
  compact: tokens.size.button.compactHeight,
};
/** Ekstrüzyon YALNIZ dudağı olan varyantlarda; ghost'ta yok. */
export function buttonExtrusion(variant: CofButtonVariant): number {
  return variant === 'ghost' ? 0 : tokens.size.button.extrusion;
}
export function buttonGeometry(size: CofButtonSize, variant: CofButtonVariant, opts?: { loading?: boolean; disabled?: boolean; locked?: boolean; fullWidth?: boolean; icon?: boolean }) {
  const height = BUTTON_HEIGHT[size];
  const extrusion = buttonExtrusion(variant);
  const fullWidth = opts?.fullWidth ?? true;
  const hasIcon = Boolean(opts?.icon);
  // Dudak HER durumda yer ayırır; ön ikon slotu fullWidth olmayan butonda her
  // zaman ayrılır → normal ↔ loading ↔ disabled geçişleri ölçüyü değiştirmez.
  return {
    height,
    extrusion,
    totalHeight: height + extrusion,
    reserveLeading: hasIcon || Boolean(opts?.loading) || Boolean(opts?.locked) || !fullWidth,
    touchTarget: Math.max(tokens.size.minimumTouchTarget, height + touchSlopFor(height) * 2),
  };
}

// ---- Kart varyantının İKİNCİ işareti (yalnız renk yasak) ---------------------
export type CofSurfaceVariantName = 'base' | 'interactive' | 'selected' | 'reward' | 'premium' | 'disabled';
export function surfaceSecondCue(variant: CofSurfaceVariantName): { icon: string | null; label: boolean } {
  if (variant === 'selected') return { icon: 'checkmark-circle', label: true };
  if (variant === 'disabled') return { icon: 'lock-closed', label: false };
  return { icon: null, label: false };
}
