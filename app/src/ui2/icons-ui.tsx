// UI2 arayüz ikonları — mock'tan kesilmiş raster yerine VEKTÖR (zemin artığı yok, her ölçekte keskin).
// Dil: 64×64 viewBox, koyu lacivert kontur (3.2), doygun düz renk, üstte beyaz parlama, altta koyu ton.
import { memo } from 'react';
import type { ReactNode } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import { C } from './tokens';

type P = { size?: number; color?: string };
const OUT = C.navy; const SW = 3.2;
const pts = (a: number[][]) => a.map(([x, y]) => `${x},${y}`).join(' ');
function starPts(cx: number, cy: number, R: number, r: number, n = 5): string {
  const o: number[][] = [];
  for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n; const rr = i % 2 === 0 ? R : r; o.push([+(cx + rr * Math.cos(a)).toFixed(2), +(cy + rr * Math.sin(a)).toFixed(2)]); }
  return pts(o);
}
function gearPts(cx: number, cy: number, R: number, r: number, teeth = 8): string {
  const o: number[][] = []; const step = Math.PI / teeth;
  for (let i = 0; i < teeth * 2; i++) { const a0 = i * step - Math.PI / 2; const rr = i % 2 === 0 ? R : r; const w = step * 0.42;
    o.push([+(cx + rr * Math.cos(a0 - w)).toFixed(2), +(cy + rr * Math.sin(a0 - w)).toFixed(2)]); o.push([+(cx + rr * Math.cos(a0 + w)).toFixed(2), +(cy + rr * Math.sin(a0 + w)).toFixed(2)]); }
  return pts(o);
}
const Gloss = ({ cx, cy, rx, ry, o = 0.32 }: { cx: number; cy: number; rx: number; ry: number; o?: number }) => <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#FFFFFF" opacity={o} />;
const Box = ({ size, children }: { size: number; children: ReactNode }) => <Svg width={size} height={size} viewBox="0 0 64 64">{children}</Svg>;

// ── Alt gezinti / başlık ikonları ──────────────────────────────────────────────
function IcNavStoreBase({ size = 40 }: P) {
  return <Box size={size}>
    <Rect x="10" y="26" width="44" height="30" rx="5" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} />
    <Rect x="16" y="34" width="12" height="10" rx="2" fill="#0A46B4" stroke={OUT} strokeWidth={2} />
    <Rect x="36" y="34" width="12" height="22" rx="2" fill="#FFD21A" stroke={OUT} strokeWidth={2} />
    <Path d="M6 26 L10 10 H54 L58 26 Z" fill="#FF3352" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Path d="M19.5 10 L17 26 H27 L28.5 10 Z M37 10 L36 26 H46 L44.5 10 Z" fill="#FFFFFF" />
    {[10, 22, 34, 46].map((x, i) => <Circle key={x} cx={x + 4} cy="26" r="5" fill={i % 2 ? '#FFFFFF' : '#FF3352'} stroke={OUT} strokeWidth={2} />)}
    <Gloss cx={22} cy={14} rx={8} ry={2} />
  </Box>;
}
function IcNavCollectionBase({ size = 40 }: P) {
  return <Box size={size}>
    <G rotation="-16" origin="32,40"><Rect x="15" y="14" width="24" height="34" rx="4" fill="#FF3352" stroke={OUT} strokeWidth={SW} /></G>
    <G rotation="14" origin="32,40"><Rect x="25" y="14" width="24" height="34" rx="4" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} /></G>
    <Rect x="20" y="16" width="24" height="34" rx="4" fill="#FFD21A" stroke={OUT} strokeWidth={SW} />
    <Rect x="25" y="22" width="14" height="10" rx="2" fill="#FFF3B0" stroke={OUT} strokeWidth={1.5} />
    <Gloss cx={30} cy={19} rx={8} ry={1.6} />
  </Box>;
}
function IcNavPlayBase({ size = 40 }: P) {
  const pent = (cx: number, cy: number, r: number) => starPts(cx, cy, r, r, 5);
  return <Box size={size}>
    <Defs><ClipPath id="ball"><Circle cx="32" cy="32" r="23" /></ClipPath></Defs>
    <Circle cx="32" cy="32" r="24" fill="#FFFFFF" stroke={OUT} strokeWidth={SW} />
    <G clipPath="url(#ball)">
      <Polygon points={pent(32, 31, 7.5)} fill={OUT} />
      {[[32, 9], [11, 24], [53, 24], [19, 51], [45, 51]].map(([x, y]) => <Polygon key={`${x}${y}`} points={pent(x, y, 7)} fill={OUT} />)}
      {[[32, 9], [11, 24], [53, 24], [19, 51], [45, 51]].map(([x, y]) => <Line key={`l${x}${y}`} x1="32" y1="31" x2={x} y2={y} stroke={OUT} strokeWidth={2.2} />)}
    </G>
    <Gloss cx={24} cy={18} rx={7} ry={4} />
  </Box>;
}
function IcNavFriendsBase({ size = 40 }: P) {
  return <Box size={size}>
    <Circle cx="43" cy="20" r="9" fill="#25D93C" stroke={OUT} strokeWidth={SW} />
    <Path d="M28 56 V44 C28 36 34 32 43 32 C52 32 58 36 58 44 V56 Z" fill="#25D93C" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Circle cx="23" cy="24" r="10" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} />
    <Path d="M6 58 V47 C6 38 13 34 23 34 C33 34 40 38 40 47 V58 Z" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Gloss cx={20} cy={19} rx={4} ry={2.5} /><Gloss cx={40} cy={16} rx={3.5} ry={2} />
  </Box>;
}
function IcTrophyBase({ size = 40 }: P) {
  return <Box size={size}>
    <Path d="M15 16 C4 16 3 34 16 36 M49 16 C60 16 61 34 48 36" fill="none" stroke={OUT} strokeWidth={10} strokeLinecap="round" />
    <Path d="M15 16 C4 16 3 34 16 36 M49 16 C60 16 61 34 48 36" fill="none" stroke="#FFB000" strokeWidth={5.5} strokeLinecap="round" />
    <Path d="M14 6 H50 V22 C50 35 42 44 32 44 C22 44 14 35 14 22 Z" fill="#FFD21A" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Path d="M14 6 H50 V12 H14 Z" fill="#FFE86B" />
    <Rect x="27" y="43" width="10" height="8" fill="#E0A800" stroke={OUT} strokeWidth={2.4} />
    <Path d="M17 51 H47 C49 51 50 52 50 54 V58 H14 V54 C14 52 15 51 17 51 Z" fill="#FFB000" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Polygon points={starPts(32, 25, 6.5, 2.8)} fill="#FFF3B0" stroke={OUT} strokeWidth={1.4} />
    <Gloss cx={22} cy={18} rx={3.2} ry={8} o={0.45} />
  </Box>;
}
// ── HUD ────────────────────────────────────────────────────────────────────────
function IcGemBase({ size = 40 }: P) {
  return <Box size={size}>
    <Polygon points="10,24 20,10 44,10 54,24 32,56" fill="#B23CFF" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Polygon points="20,10 32,24 10,24" fill="#D68BFF" /><Polygon points="32,24 44,10 54,24" fill="#8E1FE0" />
    <Polygon points="20,10 44,10 32,24" fill="#C46BFF" /><Polygon points="10,24 32,24 32,56" fill="#A029F5" /><Polygon points="32,24 54,24 32,56" fill="#7A16C9" />
    <Polygon points="10,24 20,10 44,10 54,24 32,56" fill="none" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Gloss cx={25} cy={15} rx={5} ry={2} o={0.55} />
  </Box>;
}
function IcPlusBase({ size = 40 }: P) {
  return <Box size={size}>
    <Circle cx="32" cy="32" r="26" fill="#25D93C" stroke={OUT} strokeWidth={SW} />
    <Path d="M32 16 V48 M16 32 H48" stroke={OUT} strokeWidth={13} strokeLinecap="round" /><Path d="M32 16 V48 M16 32 H48" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" />
    <Gloss cx={24} cy={17} rx={8} ry={3} />
  </Box>;
}
function IcGearBase({ size = 40, color = '#3D8BFF' }: P) {
  return <Box size={size}>
    <Polygon points={gearPts(32, 32, 28, 21, 8)} fill={color} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Circle cx="32" cy="32" r="9" fill={OUT} /><Circle cx="32" cy="32" r="5" fill="#0A46B4" />
    <Path d="M18 22 A17 17 0 0 1 32 15" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" opacity={0.5} fill="none" />
  </Box>;
}
// ── Bölüm başlığı ikonları ─────────────────────────────────────────────────────
function IcGems3Base({ size = 40 }: P) {
  const gem = (x: number, y: number, s: number, key: string) => <G key={key} transform={`translate(${x},${y}) scale(${s})`}>
    <Polygon points="10,24 20,10 44,10 54,24 32,56" fill="#B23CFF" stroke={OUT} strokeWidth={SW / s} strokeLinejoin="round" />
    <Polygon points="20,10 32,24 10,24" fill="#D68BFF" /><Polygon points="32,24 44,10 54,24" fill="#8E1FE0" /><Polygon points="10,24 32,24 32,56" fill="#A029F5" /><Polygon points="32,24 54,24 32,56" fill="#7A16C9" />
    <Polygon points="10,24 20,10 44,10 54,24 32,56" fill="none" stroke={OUT} strokeWidth={SW / s} strokeLinejoin="round" />
  </G>;
  return <Box size={size}>{gem(0, 14, 0.55, 'a')}{gem(30, 14, 0.55, 'b')}{gem(11, 4, 0.66, 'c')}</Box>;
}
function IcBoltBase({ size = 40 }: P) {
  return <Box size={size}><Polygon points="36,4 12,36 30,36 26,60 52,26 34,26" fill="#FFD21A" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" /><Polygon points="36,4 12,36 26,36" fill="#FFF3B0" opacity={0.6} /></Box>;
}
function IcStarBase({ size = 40, color = '#FFD21A' }: P) {
  return <Box size={size}><Polygon points={starPts(32, 33, 28, 13)} fill={color} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" /><Polygon points={starPts(32, 33, 28, 13)} fill="none" /><Gloss cx={26} cy={22} rx={5} ry={3} o={0.45} /></Box>;
}
function IcFaceBase({ size = 40 }: P) {
  return <Box size={size}>
    <Circle cx="32" cy="34" r="23" fill="#FFCB9A" stroke={OUT} strokeWidth={SW} />
    <Path d="M10 30 C10 14 22 8 32 8 C42 8 54 14 54 30 C50 22 44 20 38 22 C32 24 26 22 22 26 C18 30 14 30 10 30 Z" fill="#7A3B11" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Circle cx="24" cy="33" r="3" fill={OUT} /><Circle cx="40" cy="33" r="3" fill={OUT} />
    <Path d="M20 42 C24 52 40 52 44 42" fill="#FFFFFF" stroke={OUT} strokeWidth={2.6} strokeLinejoin="round" />
    <Circle cx="17" cy="42" r="3.5" fill="#FF8DA1" opacity={0.7} /><Circle cx="47" cy="42" r="3.5" fill="#FF8DA1" opacity={0.7} />
  </Box>;
}
function IcGiftBase({ size = 40 }: P) {
  return <Box size={size}>
    <Rect x="10" y="28" width="44" height="28" rx="4" fill="#FF3352" stroke={OUT} strokeWidth={SW} />
    <Rect x="6" y="18" width="52" height="12" rx="3" fill="#FF5C78" stroke={OUT} strokeWidth={SW} />
    <Rect x="27" y="18" width="10" height="38" fill="#FFD21A" stroke={OUT} strokeWidth={2} />
    <Path d="M32 18 C26 18 18 14 20 8 C23 4 30 10 32 18 C34 10 41 4 44 8 C46 14 38 18 32 18 Z" fill="#FFD21A" stroke={OUT} strokeWidth={2.6} strokeLinejoin="round" />
    <Gloss cx={16} cy={22} rx={5} ry={1.6} />
  </Box>;
}
function IcCalendarBase({ size = 40 }: P) {
  return <Box size={size}>
    <Rect x="8" y="12" width="48" height="46" rx="6" fill="#FFFFFF" stroke={OUT} strokeWidth={SW} />
    <Path d="M8 18 C8 14 11 12 14 12 H50 C53 12 56 14 56 18 V26 H8 Z" fill="#FF3352" stroke={OUT} strokeWidth={SW} />
    <Rect x="18" y="6" width="6" height="12" rx="3" fill="#0B255F" /><Rect x="40" y="6" width="6" height="12" rx="3" fill="#0B255F" />
    {[16, 29, 42].map((x) => [32, 44].map((y) => <Rect key={`${x}${y}`} x={x} y={y} width="8" height="7" rx="1.5" fill={y === 44 && x === 42 ? '#25D93C' : '#2F7BFF'} />))}
  </Box>;
}
function IcSuggestBase({ size = 40 }: P) {
  return <Box size={size}>
    <Circle cx="24" cy="20" r="10" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} />
    <Path d="M6 56 V45 C6 36 13 32 24 32 C31 32 36 34 39 38 L32 52 V56 Z" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Circle cx="44" cy="42" r="10" fill="#FFFFFF" stroke={OUT} strokeWidth={SW} /><Circle cx="44" cy="42" r="6" fill="#8CE0FF" />
    <Line x1="51" y1="49" x2="59" y2="57" stroke={OUT} strokeWidth={6} strokeLinecap="round" /><Line x1="51" y1="49" x2="59" y2="57" stroke="#FFD21A" strokeWidth={3} strokeLinecap="round" />
  </Box>;
}
// ── Kart ikonları (Arkadaşlar / Turnuvalar) ───────────────────────────────────
function IcAddFriendBase({ size = 40 }: P) {
  return <Box size={size}>
    <Circle cx="28" cy="20" r="11" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} />
    <Path d="M8 58 V47 C8 37 16 33 28 33 C36 33 42 35 46 39 L40 58 Z" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Circle cx="48" cy="48" r="11" fill="#25D93C" stroke={OUT} strokeWidth={SW} /><Path d="M48 41 V55 M41 48 H55" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
    <Gloss cx={24} cy={15} rx={4} ry={2.5} />
  </Box>;
}
function IcInviteCodeBase({ size = 40 }: P) {
  return <Box size={size}>
    <Path d="M6 20 H58 V30 A5 5 0 0 0 58 40 V50 H6 V40 A5 5 0 0 0 6 30 Z" fill="#FFD21A" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Line x1="22" y1="22" x2="22" y2="48" stroke={OUT} strokeWidth={2} strokeDasharray="3 3" />
    <Rect x="28" y="28" width="22" height="4" rx="2" fill={OUT} /><Rect x="28" y="36" width="14" height="4" rx="2" fill={OUT} />
    <Circle cx="14" cy="35" r="4" fill="#FF3352" stroke={OUT} strokeWidth={1.6} />
    <Gloss cx={20} cy={24} rx={10} ry={1.6} />
  </Box>;
}
function IcRequestsBase({ size = 40 }: P) {
  return <Box size={size}>
    <Rect x="6" y="18" width="48" height="34" rx="5" fill="#FFFFFF" stroke={OUT} strokeWidth={SW} />
    <Path d="M6 22 L30 40 L54 22" fill="none" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Path d="M8 20 L30 36 L52 20" fill="#8CE0FF" opacity={0.6} />
    <Circle cx="50" cy="16" r="10" fill="#FF3352" stroke={OUT} strokeWidth={SW} /><Path d="M50 11 V21 M46 16 H54" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
  </Box>;
}
function IcDailyBase({ size = 40 }: P) {
  return <Box size={size}>
    <G transform="translate(4,-2) scale(0.9)"><Path d="M17 8 H47 V26 C47 37 40 44 32 44 C24 44 17 37 17 26 Z" fill="#FFD21A" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" /><Rect x="27" y="43" width="10" height="8" fill="#E0A800" stroke={OUT} strokeWidth={2.4} /><Rect x="18" y="50" width="28" height="8" rx="2.5" fill="#FFB000" stroke={OUT} strokeWidth={SW} /></G>
    <Circle cx="16" cy="48" r="11" fill="#FFFFFF" stroke={OUT} strokeWidth={SW} /><Polygon points={starPts(16, 47, 4, 4)} fill={OUT} /><Path d="M8 43 L12 48 M24 43 L20 48 M16 59 L16 53" stroke={OUT} strokeWidth={2} />
  </Box>;
}
function IcLeagueBase({ size = 40 }: P) {
  return <Box size={size}>
    <Path d="M10 8 H54 V34 C54 48 42 56 32 60 C22 56 10 48 10 34 Z" fill="#FFD21A" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Path d="M16 13 H48 V33 C48 43 39 50 32 53 C25 50 16 43 16 33 Z" fill="#0A46B4" stroke={OUT} strokeWidth={2} strokeLinejoin="round" />
    <G transform="translate(18,14) scale(0.44)"><Path d="M17 8 H47 V26 C47 37 40 44 32 44 C24 44 17 37 17 26 Z" fill="#FFD21A" stroke={OUT} strokeWidth={5} strokeLinejoin="round" /><Rect x="27" y="43" width="10" height="8" fill="#E0A800" /><Rect x="18" y="50" width="28" height="8" rx="2.5" fill="#FFB000" stroke={OUT} strokeWidth={5} /></G>
  </Box>;
}
function IcRewardsBase({ size = 40 }: P) {
  return <Box size={size}>
    <G transform="translate(-4,2) scale(0.85)"><Rect x="10" y="28" width="44" height="28" rx="4" fill="#FF3352" stroke={OUT} strokeWidth={SW} /><Rect x="6" y="18" width="52" height="12" rx="3" fill="#FF5C78" stroke={OUT} strokeWidth={SW} /><Rect x="27" y="18" width="10" height="38" fill="#FFD21A" stroke={OUT} strokeWidth={2} /><Path d="M32 18 C26 18 18 14 20 8 C23 4 30 10 32 18 C34 10 41 4 44 8 C46 14 38 18 32 18 Z" fill="#FFD21A" stroke={OUT} strokeWidth={2.6} strokeLinejoin="round" /></G>
    <G transform="translate(34,30) scale(0.5)"><Polygon points="10,24 20,10 44,10 54,24 32,56" fill="#B23CFF" stroke={OUT} strokeWidth={6} strokeLinejoin="round" /><Polygon points="20,10 32,24 10,24" fill="#D68BFF" /><Polygon points="32,24 44,10 54,24" fill="#8E1FE0" /></G>
  </Box>;
}
function IcClockBase({ size = 40 }: P) {
  return <Box size={size}>
    <Circle cx="32" cy="34" r="24" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} /><Circle cx="32" cy="34" r="17" fill="#FFFFFF" stroke={OUT} strokeWidth={2.4} />
    <Path d="M32 22 V34 L41 40" fill="none" stroke={OUT} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /><Circle cx="32" cy="34" r="2.4" fill={OUT} />
    <Rect x="26" y="4" width="12" height="7" rx="2" fill="#FFD21A" stroke={OUT} strokeWidth={2} /><Gloss cx={24} cy={19} rx={6} ry={2.5} />
  </Box>;
}
function IcClipboardBase({ size = 40 }: P) {
  return <Box size={size}>
    <Rect x="12" y="12" width="40" height="46" rx="5" fill="#FFFFFF" stroke={OUT} strokeWidth={SW} />
    <Rect x="22" y="6" width="20" height="12" rx="3" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} />
    <Rect x="19" y="26" width="26" height="4" rx="2" fill="#8CE0FF" /><Rect x="19" y="36" width="18" height="4" rx="2" fill="#8CE0FF" />
    <Path d="M22 46 L30 53 L44 38" fill="none" stroke={OUT} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" /><Path d="M22 46 L30 53 L44 38" fill="none" stroke="#25D93C" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
  </Box>;
}
function IcDailyQuestionBase({ size = 40 }: P) {
  return <Box size={size}>
    <Rect x="10" y="12" width="44" height="44" rx="10" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} />
    <Rect x="10" y="12" width="44" height="12" rx="6" fill="#8CE0FF" stroke={OUT} strokeWidth={SW} />
    <Path d="M24 33 a8 8 0 1 1 8 8 v4" fill="none" stroke={OUT} strokeWidth={9} strokeLinecap="round" />
    <Path d="M24 33 a8 8 0 1 1 8 8 v4" fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
    <Circle cx="32" cy="50" r="3.6" fill="#FFFFFF" stroke={OUT} strokeWidth={2.5} />
  </Box>;
}
function IcChatBase({ size = 40 }: P) {
  return <Box size={size}>
    <Path d="M8 18 a8 8 0 0 1 8-8 h32 a8 8 0 0 1 8 8 v20 a8 8 0 0 1-8 8 H30 l-12 10 v-10 h-2 a8 8 0 0 1-8-8 Z" fill="#2F7BFF" stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Circle cx="22" cy="28" r="3.6" fill="#FFFFFF" /><Circle cx="32" cy="28" r="3.6" fill="#FFFFFF" /><Circle cx="42" cy="28" r="3.6" fill="#FFFFFF" />
  </Box>;
}
function IcCheckBadgeBase({ size = 40 }: P) {
  return <Box size={size}><Circle cx="32" cy="32" r="26" fill="#25D93C" stroke={OUT} strokeWidth={SW} /><Path d="M18 33 L28 43 L46 23" fill="none" stroke={OUT} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" /><Path d="M18 33 L28 43 L46 23" fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /><Gloss cx={24} cy={17} rx={8} ry={3} /></Box>;
}
function IcArrowRightBase({ size = 40, color = '#8CE0FF' }: P) {
  return <Box size={size}><Path d="M14 22 H34 V10 L56 32 L34 54 V42 H14 Z" fill={color} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" /><Gloss cx={26} cy={26} rx={8} ry={1.8} /></Box>;
}
function IcChevronGoldBase({ size = 40, color = '#FFB000' }: P) {
  return <Box size={size}><Path d="M22 10 L46 32 L22 54" fill="none" stroke={OUT} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" /><Path d="M22 10 L46 32 L22 54" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" /></Box>;
}
function IcCrownBigBase({ size = 40, color = '#FFD21A', base = '#E0A800' }: P & { base?: string }) {
  return <Box size={size}>
    <Path d="M8 50 L8 18 L22 30 L32 10 L42 30 L56 18 L56 50 Z" fill={color} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />
    <Rect x="8" y="44" width="48" height="10" rx="2.5" fill={base} stroke={OUT} strokeWidth={SW} />
    <Circle cx="8" cy="18" r="4" fill={color} stroke={OUT} strokeWidth={2.4} /><Circle cx="56" cy="18" r="4" fill={color} stroke={OUT} strokeWidth={2.4} /><Circle cx="32" cy="10" r="4.5" fill={color} stroke={OUT} strokeWidth={2.4} />
    <Circle cx="32" cy="38" r="3.5" fill="#FF3352" stroke={OUT} strokeWidth={1.6} /><Gloss cx={20} cy={36} rx={4} ry={6} o={0.25} />
  </Box>;
}

// İkonlar birkaç SVG düğümü çiziyor; ebeveyn her render'da hepsini yeniden kurmasın diye memo (akıcılık paketi 2026-09-08).
export const IcNavStore = memo(IcNavStoreBase);
export const IcNavCollection = memo(IcNavCollectionBase);
export const IcNavPlay = memo(IcNavPlayBase);
export const IcNavFriends = memo(IcNavFriendsBase);
export const IcTrophy = memo(IcTrophyBase);
export const IcGem = memo(IcGemBase);
export const IcPlus = memo(IcPlusBase);
export const IcGear = memo(IcGearBase);
export const IcGems3 = memo(IcGems3Base);
export const IcBolt = memo(IcBoltBase);
export const IcStar = memo(IcStarBase);
export const IcFace = memo(IcFaceBase);
export const IcGift = memo(IcGiftBase);
export const IcCalendar = memo(IcCalendarBase);
export const IcSuggest = memo(IcSuggestBase);
export const IcAddFriend = memo(IcAddFriendBase);
export const IcInviteCode = memo(IcInviteCodeBase);
export const IcRequests = memo(IcRequestsBase);
export const IcDaily = memo(IcDailyBase);
export const IcLeague = memo(IcLeagueBase);
export const IcRewards = memo(IcRewardsBase);
export const IcClock = memo(IcClockBase);
export const IcClipboard = memo(IcClipboardBase);
export const IcDailyQuestion = memo(IcDailyQuestionBase);
export const IcChat = memo(IcChatBase);
export const IcCheckBadge = memo(IcCheckBadgeBase);
export const IcArrowRight = memo(IcArrowRightBase);
export const IcChevronGold = memo(IcChevronGoldBase);
export const IcCrownBig = memo(IcCrownBigBase);
