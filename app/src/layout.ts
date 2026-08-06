// Tablet layout helpers.
//
// The app is authored for a phone (~430pt). An iPad window is 820pt+, and the
// two have very different shapes: 0.695 vs 0.461 aspect. Two approaches were
// tried on device and rejected:
//
//   * a centred phone-width column — the sides still read as dead space;
//   * a uniform scale-up — arithmetically impossible. Scaling to fill the width
//     (1.907x) makes the 932pt design 1777pt tall against a 1180pt screen, a
//     597pt overflow; scaling to fit the height (1.266x) leaves 276pt of side
//     margin. You cannot have both on a differently-shaped screen.
//
// KARAR (2026-08-06, kullanıcı): "iPad'de de iPhone'daki gibi aynısı görünsün,
// sadece büyük ekran olsun." Yani iPad'e ÖZEL bir düzen İSTENMİYOR. Önceki
// yaklaşım (dikeyde space-between ile yayma + tam genişlik) kartların arasını
// açıp telefondan farklı bir ekran üretiyordu — "butonlar arası çok fazla
// boşluk". Artık iPad, telefon düzeninin ORTALANMIŞ ve bir miktar büyütülmüş
// hâli: içerik TABLET_CONTENT_W'lik tek kolona sıkışır, dikey yayma yoktur.
// Kenarlarda kalan alanı zaten uygulamanın kendi arka planı (saha) dolduruyor.
import { useWindowDimensions } from 'react-native';

/** Windows at least this wide are treated as tablet-class. */
const TABLET_MIN_W = 700;

export function useIsTablet(): boolean {
  // Ölçekli tuval sonrası arayüz HER ZAMAN telefon gibi düzenlenir; bu kanca
  // yalnız tablet-özel davranış gerekirse (ör. analitik) kullanılmalı.
  return useWindowDimensions().width >= TABLET_MIN_W;
}

/**
 * Column count for a grid: keeps cells near their phone size instead of letting
 * two of them stretch across an iPad. Pass what the phone uses.
 */
export function useGridColumns(phoneColumns: number): number {
  // Ölçekli tuvalde ızgara HER ZAMAN telefon sütun sayısını kullanır: tuval
  // 430pt geniş, gerçek iPad genişliğine göre sütun eklemek taşmaya yol açar.
  return phoneColumns;
}

// Uygulamanın yazıldığı telefon tuvali. iPad'de arayüz BU boyutta çizilir ve
// tek bir transform ile büyütülür (App.tsx ScaledRoot) — böylece iPad "aynı
// iPhone ekranı, büyük hâli" olur; yeniden akan/yayılan bir tablet düzeni yok.
export const BASE_W = 430;
export const BASE_H = 932;

/** Tablet'te tuvali ekrana oturtan tek ölçek katsayısı (telefonda 1). */
export function uiScaleFor(winW: number, winH: number): number {
  if (winW < TABLET_MIN_W) return 1;
  return Math.min(winW / BASE_W, winH / BASE_H);
}

/**
 * Arayüzün İÇİNDE geçerli mantıksal pencere: tablette ölçeklenmiş tuvalin
 * boyutu (telefon tuvali), telefonda gerçek pencere. Grid/animasyon matematiği
 * bunu kullanmalı — gerçek iPad genişliği kullanılırsa tuvalin dışına taşar.
 */
export function useContentMaxWidth(): number | undefined {
  return undefined; // ölçekli tuvalde kolon sınırına gerek yok
}

/** Live window size — replaces module-load `Dimensions.get('window')` reads. */
export function useWindow(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  // Tablette gerçek pencere DEĞİL, çizim yapılan tuval döner.
  return width >= TABLET_MIN_W ? { width: BASE_W, height: BASE_H } : { width, height };
}
