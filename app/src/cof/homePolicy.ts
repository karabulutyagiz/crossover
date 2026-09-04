// ══════════════════════════════════════════════════════════════════════════
// COF — ANA EKRAN (Adım 04) YERLEŞİM POLİTİKASI: saf, RN'siz, ölçülebilir.
// Ana ekranın "kaç sütun", "kart ne kadar geniş", "arena çubuğu nerede",
// "logo ne kadar yüksek" kararlarını JSX'ten AYIRIR; böylece 360/390/430 ve
// %120 font ölçeği kuralları ekran görüntüsüne bakmadan test edilebilir.
// Hiçbir sayı burada uydurulmaz: kaynak 01_COF_UI_TOKENS.json'dur.
// ══════════════════════════════════════════════════════════════════════════
import tokens from './01_COF_UI_TOKENS.json';

const S = tokens.spacing;

/** Ana ekranın yatay ekran boşluğu — token (spec 04 §11: 16–20 dp bandı). */
export const HOME_SCREEN_HORIZONTAL = S.screenHorizontal; // 20

/** Spec 04 §4: ekran YUKARIDAN AŞAĞIYA tam olarak bu beş bölgedir. */
export const HOME_ZONES = ['playerHeader', 'gameFocus', 'matchOptions', 'progress', 'daily'] as const;
export type HomeZone = (typeof HOME_ZONES)[number];

/** Spec 04 §5.2: aynı anda en fazla İKİ yardımcı ikon (bildirim + ayar). */
export const HOME_HEADER_MAX_HELPER_ICONS = 2;

/** Spec 04 §5.1: avatarın görsel çapı 52–56 dp bandında. */
export const HOME_AVATAR_DIAMETER = 54;

// ---- Hero / logo ---------------------------------------------------------

/**
 * Spec 04 §6: logo toplam yüksekliği ~112–132 dp bandında kalır. Genişlikle
 * orantılı büyür ama banda KELEPÇELENİR — 430 dp'de logo ekranı yutmaz,
 * 360 dp'de okunmaz hâle gelmez.
 */
export const HOME_HERO_MIN_H = 112;
export const HOME_HERO_MAX_H = 132;
export function homeHeroHeight(screenWidth: number): number {
  const raw = Math.round(screenWidth * 0.32);
  return Math.max(HOME_HERO_MIN_H, Math.min(HOME_HERO_MAX_H, raw));
}

// ---- Maç seçenekleri -----------------------------------------------------

/**
 * Spec 04 §7.2 + §11: Özel Oda ve Bot Maçı normalde yan yana İKİ eşit karttır.
 * `360 dp` VE büyük font ölçeğinde SIKIŞTIRMAK YERİNE alt alta alınır.
 * fontScale, OS yazı ölçeği eşdeğeri (1 = normal, 1.2 = %120).
 */
export const HOME_STACK_BREAKPOINT_W = 360;
export const HOME_STACK_FONT_SCALE = 1.15;
export function homeMatchOptionColumns(screenWidth: number, fontScale = 1): 1 | 2 {
  if (screenWidth <= HOME_STACK_BREAKPOINT_W) return 1;
  if (fontScale >= HOME_STACK_FONT_SCALE) return 1;
  return 2;
}

/** İki sütunlu düzende tek kartın genişliği (kart aralığı token'dan). */
export function homeMatchOptionCardWidth(contentWidth: number, columns: 1 | 2): number {
  if (columns === 1) return contentWidth;
  return (contentWidth - S.cardGap) / 2;
}

// ---- Günlük alan ---------------------------------------------------------

/**
 * Spec 04 §9 iki seçenek sunar: tutarlı yatay karusel VEYA iki sütunlu grid.
 * GRID seçildi. Gerekçe: ana sekmeler YATAY bir pager içinde yaşıyor (Adım 02);
 * ana ekranın içine ikinci bir yatay kaydırıcı koymak Android'de pager ile
 * jest çakışması üretiyor. Grid aynı sonucu jest riski olmadan verir.
 *
 * Eski ana ekran üç kartı tek satıra ZORLUYORDU: kart = (w - 2·8)/3 ≈ 114 dp,
 * iç boşluk düşünce başlığa ~90 dp kalıyor ve "GÜNÜN SO..." diye kırpılıyordu.
 * İki sütunda kart ~169 dp → başlık sığar (spec §14'ün ellipsis yasağı).
 */
export const HOME_DAILY_COLUMNS = 2;
export function homeDailyColumns(screenWidth: number): 1 | 2 {
  return screenWidth < 320 ? 1 : 2;
}
export function homeDailyCardWidth(contentWidth: number, columns: 1 | 2 = HOME_DAILY_COLUMNS): number {
  if (contentWidth <= 0) return 0;
  if (columns === 1) return contentWidth;
  return (contentWidth - S.cardGap) / 2;
}

/** Spec 04 §9: başlık en fazla iki satır, açıklama en fazla iki satır. */
export const HOME_DAILY_TITLE_LINES = 2;
export const HOME_DAILY_BODY_LINES = 2;

// ---- Arena ilerlemesi ----------------------------------------------------

export type HomeArenaProgress = {
  /** Bu arenada kazanılmış kupa (0..span). */
  earned: number;
  /** Arenanın kupa aralığı. */
  span: number;
  /** 0..1 arası dolum. */
  pct: number;
  /** `74 / 200` — spec 04 §8'in açık metni. */
  label: string;
};

/**
 * Spec 04 §8: kupa ilerlemesi AÇIK METİN + çubuk. Veri yoksa uydurulmaz —
 * aralık geçersizse (max <= min) dolu kabul edilir ve etiket toplamı gösterir.
 */
export function homeArenaProgress(trophies: number, min: number, max: number): HomeArenaProgress {
  const span = Math.max(0, max - min);
  const earned = Math.max(0, Math.min(span, trophies - min));
  const pct = span > 0 ? earned / span : 1;
  return { earned, span, pct, label: `${earned} / ${span}` };
}

// ---- Doğrulanabilir sözleşme --------------------------------------------

/** Spec 04 §14: ana ekranda YALNIZ BİR baskın (primary) CTA bulunur. */
export const HOME_PRIMARY_CTA_COUNT = 1;

/** Spec 04 §11: her dokunma hedefi en az bu kadar. */
export const HOME_MIN_TOUCH = tokens.size.minimumTouchTarget;

/** Spec 04 §11: bölüm aralığı 24–32 dp bandı; token `sectionGap` = 28. */
export const HOME_SECTION_GAP = S.sectionGap;

/** Spec 04 §11: kart iç boşluğu 12–16 dp; token `card.contentPadding` = 16. */
export const HOME_CARD_PADDING = tokens.size.card.contentPadding;
