import Svg, { Defs, LinearGradient, Stop, Path, Polygon, G } from 'react-native-svg';

interface Props {
  size?: number;
  /** Override colour (ignored — always uses the premium purple palette) */
  color?: string;
}

/**
 * Premium currency icon — a 3D purple crystal hexagonal gem with a bright
 * rune/diamond facet in the centre. Clash-Royale-style glossy mobile look.
 *
 * Usage:  <GemIcon size={18} />
 */
export function GemIcon({ size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        {/* Main body gradient — deep purple to vivid violet */}
        <LinearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#C084FC" />
          <Stop offset="0.45" stopColor="#9333EA" />
          <Stop offset="1" stopColor="#581C87" />
        </LinearGradient>

        {/* Top facet — lighter, glassy */}
        <LinearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E9D5FF" />
          <Stop offset="1" stopColor="#C084FC" />
        </LinearGradient>

        {/* Left facet — mid-dark */}
        <LinearGradient id="leftGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#A855F7" />
          <Stop offset="1" stopColor="#6B21A8" />
        </LinearGradient>

        {/* Right facet — darkest */}
        <LinearGradient id="rightGrad" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7E22CE" />
          <Stop offset="1" stopColor="#4C1D95" />
        </LinearGradient>

        {/* Centre rune glow */}
        <LinearGradient id="runeGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F5F3FF" />
          <Stop offset="0.5" stopColor="#DDD6FE" />
          <Stop offset="1" stopColor="#C4B5FD" />
        </LinearGradient>

        {/* Glass highlight */}
        <LinearGradient id="shineGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <G>
        {/* ── 3D hexagonal cube body ── */}

        {/* Top face (flat hexagon top) */}
        <Polygon points="32,6 52,18 52,22 32,10 12,22 12,18" fill="url(#topGrad)" />

        {/* Left face */}
        <Polygon points="12,18 32,10 32,46 12,34" fill="url(#leftGrad)" />

        {/* Right face */}
        <Polygon points="52,18 32,10 32,46 52,34" fill="url(#rightGrad)" />

        {/* Bottom edge / shadow */}
        <Polygon points="12,34 32,46 52,34 52,38 32,50 12,38" fill="#3B0764" />

        {/* ── Centre diamond rune ── */}
        <Path
          d="M32,17 L40,28 L32,39 L24,28 Z"
          fill="url(#runeGrad)"
          opacity="0.95"
        />

        {/* Inner facet lines on the rune */}
        <Path d="M32,17 L28,28 L32,39" stroke="#A78BFA" strokeWidth="0.8" fill="none" opacity="0.6" />
        <Path d="M32,17 L36,28 L32,39" stroke="#A78BFA" strokeWidth="0.8" fill="none" opacity="0.6" />
        <Path d="M24,28 L32,24 L40,28" stroke="#A78BFA" strokeWidth="0.6" fill="none" opacity="0.4" />

        {/* ── Glass highlights ── */}

        {/* Top-left shine streak */}
        <Polygon points="14,19 22,14 24,16 16,21" fill="url(#shineGrad)" opacity="0.6" />

        {/* Small sparkle dot top-right */}
        <Path d="M44,15 L45,13 L46,15 L45,17 Z" fill="#FFFFFF" opacity="0.8" />

        {/* Edge highlights */}
        <Path d="M12,18 L32,6 L52,18" stroke="#E9D5FF" strokeWidth="0.7" fill="none" opacity="0.5" />
        <Path d="M12,18 L12,34" stroke="#C084FC" strokeWidth="0.5" fill="none" opacity="0.3" />
        <Path d="M52,18 L52,34" stroke="#7C3AED" strokeWidth="0.5" fill="none" opacity="0.3" />
      </G>
    </Svg>
  );
}

/** The accent colour for gem-related text, borders, etc. */
export const GEM_COLOR = '#A855F7';
