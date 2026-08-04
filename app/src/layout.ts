// Responsive layout for phone + iPad.
//
// The app is designed phone-first. On an iPad the window is ~1024–1366pt wide,
// so a layout tuned for ~390pt stretches: rows spread out, cards drift apart and
// the screen reads as mostly empty. Rather than re-flowing every screen for a
// wide canvas, the content is held to a phone-width column and centred, with the
// background art filling the whole window behind it.
//
// Everything here is hook-based on purpose: the previous code captured
// `Dimensions.get('window')` once at module load, which is wrong the moment the
// iPad rotates or enters Split View — the layout kept the width it happened to
// boot with.
import { useWindowDimensions } from 'react-native';

/** Widest the content column is ever allowed to get. Roughly a large phone. */
export const CONTENT_MAX_W = 480;

/** Anything at least this wide is treated as a tablet-class window. */
const TABLET_MIN_W = 700;

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= TABLET_MIN_W;
}

/**
 * Width the content column should occupy: the full window on a phone, a capped
 * centred column on a tablet. Use with `alignSelf: 'center'`.
 */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, CONTENT_MAX_W);
}

/**
 * Style for any full-bleed container that should hold its children to the
 * content column. `width: '100%'` keeps phones untouched; maxWidth only bites
 * once the window is wider than the column.
 */
export function useContentColumn(): { width: '100%'; maxWidth: number; alignSelf: 'center' } {
  return { width: '100%', maxWidth: CONTENT_MAX_W, alignSelf: 'center' };
}

/** Live window size — replaces the module-load `Dimensions.get('window')` reads. */
export function useWindow(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  return { width, height };
}
