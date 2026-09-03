// ══════════════════════════════════════════════════════════════════════════
// COF UI FOUNDATION — tipli tema adaptörü (Aşama 01, 2026-09-02)
// Kaynak gerçeklik: ./01_COF_UI_TOKENS.json (semantik, makine-okunur).
// O dosya kullanıcının verdiği KANONİK dosyadır; bu adaptör onu değiştirmez,
// yalnız React Native'in anladığı nesnelere çevirir. Yeni renk/ölçü/süre
// TANIMLANMAZ; token'dan türetilen tek tük değer aşağıda GEREKÇESİYLE
// belgelenir (spec: "gerekli optik düzeltme belgelenir").
// Eski `src/theme.ts` (Broadcast Prestige) aşamalı geçiş boyunca AYNEN durur;
// yeni COF primitifleri yalnız bu dosyayı okur. iOS ve Android aynı kaynağı
// kullanır — platform kolu yalnız gölge→elevation çevirisindedir ve gölge
// RENGİ iki platformda da token'dan gelir.
// ══════════════════════════════════════════════════════════════════════════
import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import tokens from './01_COF_UI_TOKENS.json';
import { LABEL_MIN_FIT_SCALE as LABEL_MIN_FIT_SCALE_VALUE, CONTROL_BORDER_COLOR, NUMBER_BEHAVIOR } from './policy';

export type CofTokens = typeof tokens;
export const cofTokens: CofTokens = tokens;

// ---- Yazı tipi eşlemesi -----------------------------------------------------
// Projede yüklü dosyalar (App.tsx useFonts): Poppins-Black, Poppins-ExtraBold,
// Poppins-SemiBold. Token ağırlıkları [500, 600, 700, 800]:
//   800 → Poppins-ExtraBold   700 → Poppins-ExtraBold (Bold dosyası yok; en yakın)
//   600 → Poppins-SemiBold    500 → Poppins-SemiBold  (Medium dosyası yok; en yakın)
// COFDisplay = Poppins-ExtraBold, COFUI = Poppins-SemiBold — ikisi de aynı aile
// (Poppins) → "en fazla 2 aile" kuralı sağlanır. Yeni font İNDİRİLMEZ.
export const COF_FONT_FILES = {
  COFDisplay: 'Poppins-ExtraBold',
  COFUI: 'Poppins-SemiBold',
} as const;
export type CofFontWeight = 500 | 600 | 700 | 800;
export function cofFontFamily(weight: CofFontWeight): string {
  return weight >= 700 ? COF_FONT_FILES.COFDisplay : COF_FONT_FILES.COFUI;
}

// ---- Renk ------------------------------------------------------------------
export const cofColor = tokens.color;

// ---- Ölçüler ---------------------------------------------------------------
export const cofSpacing = tokens.spacing;
export const cofRadius = tokens.radius;
export const cofBorder = tokens.border;
export const cofSize = tokens.size;
export const cofMotion = tokens.motion;

// ---- ETİKET SIĞDIRMA (v1.0.1 sözleşmesi) ------------------------------------
// Ana CTA küçültülmez ve tek satırda kalır; uzun ikincil aksiyon kompakt stil ya
// da iki satır kullanır; genel otomatik küçültme TABANI 0.90'ın altına inemez.
// Kural motoru saf `policy.ts` içinde (test edilebilir); burada yalnız yeniden
// dışa aktarılır — Aşama 01'in COF_MIN_FIT_SCALE adı geriye uyum için korunur.
export { LABEL_MIN_FIT_SCALE, labelFitPolicy } from './policy';
export const COF_MIN_FIT_SCALE = LABEL_MIN_FIT_SCALE_VALUE;
// Buton "dudağı" (extrusion) gölge değil KATI renktir: token elevation.button
// blur 0 / opacity 1 / offsetY 5 ile tam olarak bunu tarif eder, rengi de orada.
export const COF_LIP_COLOR = tokens.elevation.button.color;

// ---- Tipografi → RN TextStyle -----------------------------------------------
// NOT: `transform: uppercase` STİLE KONMAZ. RN'in native textTransform'u iOS'ta
// yerelleştirilmemiş uppercaseString kullanır → Türkçe "i" harfi "I" olur
// ("KOLEKSIYON"), Android'de cihaz yereline göre değişir. Doğru büyütme
// CofText içinde JS ile (cofUpper) yapılır; ikisi de aynı çıktıyı verir.
export type CofTypeVariant = keyof typeof tokens.typography.styles;
type TypeToken = { size: number; lineHeight: number; weight: number; letterSpacing: number; transform?: string; tabularNumbers?: boolean };

export function cofTypeStyle(variant: CofTypeVariant): TextStyle {
  const tk = tokens.typography.styles[variant] as TypeToken;
  const style: TextStyle = {
    fontFamily: cofFontFamily(tk.weight as CofFontWeight),
    fontSize: tk.size,
    lineHeight: tk.lineHeight,
    letterSpacing: tk.letterSpacing,
  };
  // tabularNumbers: v1.0.1'de HİÇBİR stilde açık değil (numberBehavior.
  // currentFontSupport=false). Paketteki Poppins dosyalarında `tnum` OpenType
  // özelliği ÖLÇÜMLE yok ve rakam genişlikleri farklı, dolayısıyla gerçek
  // tabular rakam VAAT EDİLMEZ. Yerinde değişen sayaçlar CofNumber'ın sabit
  // genişlikli hücresini kullanır (bkz. policy.DIGIT_CELL_RATIO). Bayrak ileride
  // tnum'lu bir font gelirse diye eşlenmeye devam eder.
  if (tk.tabularNumbers) style.fontVariant = ['tabular-nums'];
  return style;
}
export const cofType: Record<CofTypeVariant, TextStyle> = Object.fromEntries(
  (Object.keys(tokens.typography.styles) as CofTypeVariant[]).map((k) => [k, cofTypeStyle(k)]),
) as Record<CofTypeVariant, TextStyle>;

/** Bu tipografi varyantı metni BÜYÜK harfe çevirmeli mi (token: transform). */
export function cofTypeIsUppercase(variant: CofTypeVariant): boolean {
  return (tokens.typography.styles[variant] as TypeToken).transform === 'uppercase';
}

// ---- Derinlik → RN gölge / Android elevation ---------------------------------
// iOS: shadow*; Android: elevation + shadowColor (API 28+ elevation gölgesini
// renklendirir) → iki platformda da token rengi kullanılır, siyah kaymaz.
export type CofElevation = keyof typeof tokens.elevation;
export function cofElevation(level: CofElevation): ViewStyle {
  const e = tokens.elevation[level] as { color?: string; offsetY: number; blur: number; opacity: number; androidElevation?: number };
  if (level === 'flat' || e.opacity === 0) return {};
  const color = e.color ?? cofColor.background.canvasDeep;
  return Platform.select<ViewStyle>({
    android: { elevation: e.androidElevation ?? 0, shadowColor: color },
    default: {
      shadowColor: color,
      shadowOpacity: e.opacity,
      shadowRadius: e.blur,
      shadowOffset: { width: 0, height: e.offsetY },
    },
  })!;
}

// ---- Alt navigasyon içerik boşluğu (spec: bar + safe-area + 24 dp) ------------
export function cofScrollBottomPadding(safeAreaBottom: number): number {
  return cofSize.bottomNavigation.barHeightExcludingSafeArea + safeAreaBottom + cofSpacing.contentBottomExtra;
}

// ---- Tek nesne ---------------------------------------------------------------
export const cof = {
  color: cofColor,
  spacing: cofSpacing,
  radius: cofRadius,
  border: cofBorder,
  size: cofSize,
  motion: cofMotion,
  type: cofType,
  font: COF_FONT_FILES,
  lipColor: COF_LIP_COLOR,
  controlBorder: CONTROL_BORDER_COLOR,   // açık ikincil kontrol sınırı (stroke.control)
  numberBehavior: NUMBER_BEHAVIOR,       // tabular yok → sabit genişlikli kapsayıcı
  minFitScale: COF_MIN_FIT_SCALE,
  elevation: cofElevation,
  scrollBottomPadding: cofScrollBottomPadding,
} as const;
export default cof;
