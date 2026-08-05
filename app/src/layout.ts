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
// What the device screenshots actually showed: horizontally the flex layout
// already fills an iPad fine. The real problems are per-screen — grids stretch
// two huge cells across the width instead of fitting more, and some screens pack
// their content at the top and leave the lower third empty. So the fix is
// responsive per screen, driven by these helpers, not one global transform.
import { useWindowDimensions } from 'react-native';

/** Windows at least this wide are treated as tablet-class. */
const TABLET_MIN_W = 700;

export function useIsTablet(): boolean {
  return useWindowDimensions().width >= TABLET_MIN_W;
}

/**
 * Column count for a grid: keeps cells near their phone size instead of letting
 * two of them stretch across an iPad. Pass what the phone uses.
 */
export function useGridColumns(phoneColumns: number): number {
  const { width } = useWindowDimensions();
  if (width < TABLET_MIN_W) return phoneColumns;
  // Roughly how many phone-widths fit, so cells keep their intended size.
  return Math.max(phoneColumns, Math.round(phoneColumns * (width / 430)));
}

/** Live window size — replaces module-load `Dimensions.get('window')` reads. */
export function useWindow(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  return { width, height };
}
