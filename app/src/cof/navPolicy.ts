// ══════════════════════════════════════════════════════════════════════════
// COF ALT NAVİGASYON POLİTİKASI — saf (React Native importu YOK), test edilebilir.
// Aşama 02 spec'inin sayısal ve durum kuralları burada tek yerde yaşar:
// içerik alt boşluğu formülü, hangi fazda navigasyon gizlenir, hangi sekme
// hangi renkleri alır. shell.tsx ve App.tsx buradan okur; test doğrudan koşar.
// ══════════════════════════════════════════════════════════════════════════
import tokens from './01_COF_UI_TOKENS.json';

const C = tokens.color;
const NAV = tokens.size.bottomNavigation;
const EXTRA = tokens.spacing.contentBottomExtra;

/** Kök ekran kaydırıcısının alt boşluğu: 76 + safeArea.bottom + 24 (spec). */
export function cofRootContentInset(safeAreaBottom: number): number {
  return NAV.barHeightExcludingSafeArea + Math.max(0, safeAreaBottom) + EXTRA;
}
/** Detay ekranında alt navigasyon YOK → yalnız safeArea + 24. */
export function cofDetailContentInset(safeAreaBottom: number): number {
  return Math.max(0, safeAreaBottom) + EXTRA;
}
/** Barın gerçek toplam yüksekliği (gövde + safe area). Orta topun 22 dp taşması
 *  yalnız görseldir; bu yüksekliğe ve içerik ölçüsüne GİRMEZ. */
export function cofNavTotalHeight(safeAreaBottom: number): number {
  return NAV.barHeightExcludingSafeArea + Math.max(0, safeAreaBottom);
}

// ---- Detay (geri butonlu) sayfalar: alt navigasyon gizlenir -------------------
// Mevcut route/faz adları KORUNDU; yalnız görünürlük politikası eklendi.
export const COF_DETAIL_PHASES: ReadonlySet<string> = new Set(['arenas', 'leaderboard', 'matchHistory', 'profile']);
export function isCofDetailPhase(phase: string): boolean {
  return COF_DETAIL_PHASES.has(phase);
}
/** Bar gizlensin mi: detay sayfası ya da klavye açık. */
export function isCofNavHidden(phase: string, keyboardVisible: boolean): boolean {
  return isCofDetailPhase(phase) || keyboardVisible;
}

// ---- Sekme görünümü ----------------------------------------------------------
export type CofNavAppearance = {
  icon: string;
  label: string;
  /** Aktif olmayan sekmede yüzey yok (null). */
  surface: string | null;
  /** 3 dp aktif çizgi. */
  rail: string | null;
  /** Orta kontrolün zemini (yalnız center için). */
  centerBackground: string | null;
};

/**
 * Tek kural: aktif hedef brand.primary, inaktif text.tertiary. Orta Oyun
 * kontrolü Oyun aktif DEĞİLKEN nötrdür (surface.strong + text.secondary) —
 * yeşil kalıp iki sekmenin aynı anda aktif görünmesi yasak.
 */
export function cofNavAppearance(active: boolean, center = false): CofNavAppearance {
  if (center) {
    return {
      icon: active ? C.text.onPrimary : C.text.secondary,
      label: active ? C.brand.primary : C.text.tertiary,
      surface: null,                       // orta kontrolde tint yüzeyi yok
      rail: active ? C.brand.primary : null,
      centerBackground: active ? C.brand.primary : C.surface.strong,
    };
  }
  return {
    icon: active ? C.brand.primary : C.text.tertiary,
    label: active ? C.brand.primary : C.text.tertiary,
    surface: active ? C.brand.primaryTint : null,
    rail: active ? C.brand.primary : null,
    centerBackground: null,
  };
}

/** Beş hedefin sırası — mevcut TAB_DEFS ile birebir, değiştirilmedi. */
export const COF_NAV_ORDER = ['store', 'collection', 'home', 'friends', 'tournaments'] as const;
export type CofNavKey = typeof COF_NAV_ORDER[number];
export const COF_NAV_CENTER_KEY: CofNavKey = 'home';

/** Verilen aktif anahtara göre beş hedefin durumu — "yalnız biri aktif" garantisi. */
export function cofNavStates(activeKey: string): { key: CofNavKey; active: boolean; center: boolean; appearance: CofNavAppearance }[] {
  return COF_NAV_ORDER.map((key) => {
    const center = key === COF_NAV_CENTER_KEY;
    const active = key === activeKey;
    return { key, active, center, appearance: cofNavAppearance(active, center) };
  });
}

// ---- Adım 03 kapısı: kök ekranlarda TAM 24 dp dinlenme boşluğu ----------------
// Screen sarmalayıcısının eski `paddingBottom: 22` değeri kaydırma görünümünün
// DIŞINDA duruyor; kabuk insetiyle birlikte kök sekmelerde 46 dp'lik bir
// dinlenme boşluğu bırakıyordu. Kabuk İÇİNDE bu 22 sıfırlanır (tek hesap),
// kabuk DIŞINDA (maç, soru, sonuç, oyun içi ekranlar) aynen korunur.
export const LEGACY_SCREEN_BOTTOM_PAD = 22;

/** Screen sarmalayıcısının alt boşluğu. Kabuk içindeyse 0 — hesap tek yerde. */
export function screenBottomPadding(inShell: boolean): number {
  return inShell ? 0 : LEGACY_SCREEN_BOTTOM_PAD;
}

/** Kök sekmede son içeriğin alt navigasyonla arasında kalan gerçek boşluk. */
export function cofRootRestingSpace(safeAreaBottom: number): number {
  return cofRootContentInset(safeAreaBottom) - cofNavTotalHeight(safeAreaBottom) + screenBottomPadding(true);
}

/** Detay sayfasında (alt navigasyon yok) alt dinlenme boşluğu. */
export function cofDetailRestingSpace(safeAreaBottom: number): number {
  return cofDetailContentInset(safeAreaBottom) - Math.max(0, safeAreaBottom) + screenBottomPadding(true);
}
