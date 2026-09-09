import { memo } from 'react';
// UI2 vektör ikonları — mock'tan kesmek yerine çizildi (zemin artığı yok, ölçek bağımsız).
// Dil: koyu lacivert kontur, düz doygun renk, hafif üst parlama. Hepsi react-native-svg.
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { C } from './tokens';

type P = { size?: number; color?: string };
const OUT = C.navy; const SW = 2.4;

function IcMusicBase({ size = 28, color = '#FFFFFF' }: P) {
  return <Svg width={size} height={size} viewBox="-2 -2 36 36"><Path d="M12 24 V6 L26 3 V22" stroke={OUT} strokeWidth={SW + 2} strokeLinecap="round" strokeLinejoin="round" fill="none" /><Path d="M12 24 V6 L26 3 V22" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none" /><Circle cx="8.5" cy="24" r="5" fill={color} stroke={OUT} strokeWidth={SW} /><Circle cx="22.5" cy="21.5" r="5" fill={color} stroke={OUT} strokeWidth={SW} /></Svg>;
}
function IcSoundBase({ size = 28, color = '#FFFFFF' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Path d="M4 12 H10 L17 6 V26 L10 20 H4 Z" fill={color} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" /><Path d="M21 11 Q25 16 21 21 M24 7 Q30 16 24 25" stroke={OUT} strokeWidth={SW + 2} strokeLinecap="round" fill="none" /><Path d="M21 11 Q25 16 21 21 M24 7 Q30 16 24 25" stroke={color} strokeWidth={SW} strokeLinecap="round" fill="none" /></Svg>;
}
function IcVibrateBase({ size = 28, color = '#FFFFFF' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Rect x="10" y="4" width="12" height="24" rx="3" fill={color} stroke={OUT} strokeWidth={SW} /><Path d="M5 11 V21 M27 11 V21 M2 13 V19 M30 13 V19" stroke={OUT} strokeWidth={SW + 2} strokeLinecap="round" /><Path d="M5 11 V21 M27 11 V21 M2 13 V19 M30 13 V19" stroke={color} strokeWidth={SW} strokeLinecap="round" /></Svg>;
}
function IcBellBase({ size = 28, color = '#FFD21A' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Path d="M16 4 C10 4 8 8 8 13 V19 L5 23 H27 L24 19 V13 C24 8 22 4 16 4 Z" fill={color} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" /><Path d="M12 25 A4 4 0 0 0 20 25" fill={OUT} /><Rect x="15" y="2" width="2" height="3" fill={OUT} /></Svg>;
}
function IcGlobeBase({ size = 28, color = '#FFFFFF' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Circle cx="16" cy="16" r="12" fill={color} stroke={OUT} strokeWidth={SW} /><Path d="M4 16 H28 M16 4 C11 9 11 23 16 28 M16 4 C21 9 21 23 16 28 M7 9 H25 M7 23 H25" stroke={OUT} strokeWidth={SW - 0.6} fill="none" /></Svg>;
}
function IcExitBase({ size = 28, color = '#FFFFFF' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Path d="M6 5 H18 V11 H15 V8 H9 V24 H15 V21 H18 V27 H6 Z" fill={color} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" /><Path d="M14 16 H27 M22 11 L27 16 L22 21" stroke={OUT} strokeWidth={SW + 2} strokeLinecap="round" strokeLinejoin="round" fill="none" /><Path d="M14 16 H27 M22 11 L27 16 L22 21" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
}
function IcCopyBase({ size = 28, color = '#FFFFFF' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Rect x="6" y="9" width="15" height="18" rx="3" fill={color} stroke={OUT} strokeWidth={SW} /><Rect x="11" y="4" width="15" height="18" rx="3" fill={color} stroke={OUT} strokeWidth={SW} /></Svg>;
}
function IcShareBase({ size = 28, color = '#FFFFFF' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Circle cx="24" cy="7" r="4" fill={color} stroke={OUT} strokeWidth={SW} /><Circle cx="8" cy="16" r="4" fill={color} stroke={OUT} strokeWidth={SW} /><Circle cx="24" cy="25" r="4" fill={color} stroke={OUT} strokeWidth={SW} /><Path d="M11 14 L21 9 M11 18 L21 23" stroke={OUT} strokeWidth={SW + 1} /></Svg>;
}
function IcCheckBase({ size = 28, color = '#25D93C' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Circle cx="16" cy="16" r="13" fill={color} stroke={OUT} strokeWidth={SW} /><Path d="M9 16 L14 21 L23 11" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
}
function IcPlusBase({ size = 28, color = '#25D93C' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Rect x="3" y="3" width="26" height="26" rx="7" fill={color} stroke={OUT} strokeWidth={SW} /><Path d="M16 9 V23 M9 16 H23" stroke="#FFFFFF" strokeWidth={4.5} strokeLinecap="round" /></Svg>;
}
function IcChevronBase({ size = 28, color = '#FFFFFF', dir = 'down' }: P & { dir?: 'down' | 'right' | 'left' | 'up' }) {
  const rot = dir === 'down' ? 0 : dir === 'left' ? 90 : dir === 'up' ? 180 : -90;
  return <Svg width={size} height={size} viewBox="0 0 32 32"><G rotation={rot} origin="16,16"><Path d="M8 12 L16 20 L24 12" stroke={OUT} strokeWidth={SW + 3} strokeLinecap="round" strokeLinejoin="round" fill="none" /><Path d="M8 12 L16 20 L24 12" stroke={color} strokeWidth={SW + 1} strokeLinecap="round" strokeLinejoin="round" fill="none" /></G></Svg>;
}
function IcLockBase({ size = 28, color = '#FFD21A' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Path d="M9 14 V10 A7 7 0 0 1 23 10 V14" stroke={OUT} strokeWidth={SW + 2} fill="none" /><Path d="M9 14 V10 A7 7 0 0 1 23 10 V14" stroke="#C9CDD8" strokeWidth={SW} fill="none" /><Rect x="6" y="13" width="20" height="15" rx="3" fill={color} stroke={OUT} strokeWidth={SW} /><Circle cx="16" cy="20" r="2.2" fill={OUT} /></Svg>;
}
function IcCloseBase({ size = 28 }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Path d="M9 9 L23 23 M23 9 L9 23" stroke="#7A0A1E" strokeWidth={7} strokeLinecap="round" /><Path d="M9 9 L23 23 M23 9 L9 23" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" /></Svg>;
}
// ── Oyun modu ikonları (mod seçici kartları) ──
function Shield({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return <Path d={`M${x} ${y} h${s} v${s * 0.62} q0 ${s * 0.35} -${s / 2} ${s * 0.55} q-${s / 2} -${s * 0.2} -${s / 2} -${s * 0.55} z`} fill={fill} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" />;
}
function IcModeTeamTeamBase({ size = 64 }: P) {
  return <Svg width={size} height={size} viewBox="0 0 64 64"><Shield x={6} y={10} s={24} fill="#1E7BFF" /><Shield x={34} y={10} s={24} fill="#FF3352" /><Circle cx="32" cy="46" r="9" fill={C.gold} stroke={OUT} strokeWidth={SW} /><SvgText x="32" y="50.5" fontSize="11" fontWeight="900" fill={OUT} textAnchor="middle">VS</SvgText></Svg>;
}
function IcModeCountryTeamBase({ size = 64 }: P) {
  return <Svg width={size} height={size} viewBox="0 0 64 64"><Rect x="6" y="10" width="26" height="18" rx="3" fill="#E30A17" stroke={OUT} strokeWidth={SW} /><Circle cx="16" cy="19" r="5" fill="#FFFFFF" /><Circle cx="18" cy="19" r="4" fill="#E30A17" /><Polygon points="24,15 25.5,18 28.5,18 26,20 27,23 24,21.3 21,23 22,20 19.5,18 22.5,18" fill="#FFFFFF" /><Rect x="6" y="28" width="3" height="26" fill={OUT} /><Shield x={34} y={24} s={24} fill="#1E7BFF" /></Svg>;
}
function IcModeLetterTeamBase({ size = 64 }: P) {
  return <Svg width={size} height={size} viewBox="0 0 64 64"><Rect x="6" y="12" width="26" height="26" rx="6" fill={C.gold} stroke={OUT} strokeWidth={SW} /><SvgText x="19" y="33" fontSize="20" fontWeight="900" fill={OUT} textAnchor="middle">A</SvgText><Shield x={34} y={26} s={24} fill="#1E7BFF" /></Svg>;
}
function IcModeXoxBase({ size = 64 }: P) {
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => [c, r]));
  return <Svg width={size} height={size} viewBox="0 0 64 64">{cells.map(([c, r], i) => <Rect key={i} x={7 + c * 17} y={7 + r * 17} width="15" height="15" rx="3" fill={(c + r) % 2 ? '#1E7BFF' : '#25D93C'} stroke={OUT} strokeWidth={SW} />)}<Circle cx="32" cy="32" r="5" fill="#FFFFFF" stroke={OUT} strokeWidth={2} /></Svg>;
}
function IcModeCozKazanBase({ size = 64 }: P) {
  const L = ['K', 'A', 'Z'];
  return <Svg width={size} height={size} viewBox="0 0 64 64">{L.map((ch, i) => <G key={ch} rotation={i === 1 ? -8 : i === 2 ? 10 : -4} origin={`${14 + i * 18},32`}><Rect x={5 + i * 18} y={22} width="18" height="20" rx="4" fill={i === 1 ? C.gold : '#FFFFFF'} stroke={OUT} strokeWidth={SW} /><SvgText x={14 + i * 18} y="37" fontSize="14" fontWeight="900" fill={OUT} textAnchor="middle">{ch}</SvgText></G>)}<SvgText x="32" y="16" fontSize="12" fontWeight="900" fill="#FFFFFF" textAnchor="middle">?</SvgText></Svg>;
}
function IcModeGuessWhoBase({ size = 64 }: P) {
  return <Svg width={size} height={size} viewBox="0 0 64 64"><Circle cx="32" cy="24" r="13" fill="#F4C7A1" stroke={OUT} strokeWidth={SW} /><Path d="M19 22 Q32 6 45 22 Q40 15 32 15 Q24 15 19 22 Z" fill="#3B2A1A" stroke={OUT} strokeWidth={2} /><Path d="M12 56 Q32 34 52 56 Z" fill="#1E7BFF" stroke={OUT} strokeWidth={SW} /><Circle cx="47" cy="44" r="10" fill={C.gold} stroke={OUT} strokeWidth={SW} /><SvgText x="47" y="49" fontSize="14" fontWeight="900" fill={OUT} textAnchor="middle">?</SvgText></Svg>;
}
function IcModeBotBase({ size = 64 }: P) {
  return <Svg width={size} height={size} viewBox="0 0 64 64"><Line x1="32" y1="6" x2="32" y2="14" stroke={OUT} strokeWidth={SW + 1} /><Circle cx="32" cy="6" r="3" fill="#FF3352" stroke={OUT} strokeWidth={2} /><Rect x="12" y="14" width="40" height="30" rx="9" fill="#FFFFFF" stroke={OUT} strokeWidth={SW} /><Rect x="18" y="20" width="28" height="14" rx="6" fill="#1E7BFF" stroke={OUT} strokeWidth={2} /><Circle cx="26" cy="27" r="3" fill="#FFFFFF" /><Circle cx="38" cy="27" r="3" fill="#FFFFFF" /><Path d="M25 39 Q32 43 39 39" stroke={OUT} strokeWidth={2.5} strokeLinecap="round" fill="none" /><Rect x="20" y="44" width="24" height="12" rx="4" fill="#1E7BFF" stroke={OUT} strokeWidth={SW} /></Svg>;
}

// ── Banner ikonları (Sosyal Paket / Kozmetik) ──
function IcNoAdsBase({ size = 28 }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Circle cx="16" cy="16" r="13" fill="#E8443A" stroke={OUT} strokeWidth={SW} /><SvgText x="16" y="20" fontSize="9.5" fontWeight="900" fill="#FFFFFF" textAnchor="middle" fontFamily="Helvetica">ADS</SvgText><Line x1="6.5" y1="25.5" x2="25.5" y2="6.5" stroke={OUT} strokeWidth={SW + 2.6} strokeLinecap="round" /><Line x1="6.5" y1="25.5" x2="25.5" y2="6.5" stroke="#FFFFFF" strokeWidth={SW} strokeLinecap="round" /></Svg>;
}
function IcCrownBase({ size = 28, color = '#FFD21A' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 32 32"><Path d="M4 25 L4 10 L11 16 L16 5 L21 16 L28 10 L28 25 Z" fill={color} stroke={OUT} strokeWidth={SW} strokeLinejoin="round" /><Rect x="4" y="22" width="24" height="5" rx="1.5" fill="#E0A800" stroke={OUT} strokeWidth={SW} /><Circle cx="16" cy="5.5" r="2.2" fill="#FFF3B0" stroke={OUT} strokeWidth={1.6} /></Svg>;
}

// İkonlar birkaç SVG düğümü çiziyor; ebeveyn her render'da hepsini yeniden kurmasın diye memo (akıcılık paketi 2026-09-08).
export const IcMusic = memo(IcMusicBase);
export const IcSound = memo(IcSoundBase);
export const IcVibrate = memo(IcVibrateBase);
export const IcBell = memo(IcBellBase);
export const IcGlobe = memo(IcGlobeBase);
export const IcExit = memo(IcExitBase);
export const IcCopy = memo(IcCopyBase);
export const IcShare = memo(IcShareBase);
export const IcCheck = memo(IcCheckBase);
export const IcPlus = memo(IcPlusBase);
export const IcChevron = memo(IcChevronBase);
export const IcLock = memo(IcLockBase);
export const IcClose = memo(IcCloseBase);
export const IcModeTeamTeam = memo(IcModeTeamTeamBase);
export const IcModeCountryTeam = memo(IcModeCountryTeamBase);
export const IcModeLetterTeam = memo(IcModeLetterTeamBase);
export const IcModeXox = memo(IcModeXoxBase);
export const IcModeCozKazan = memo(IcModeCozKazanBase);
export const IcModeGuessWho = memo(IcModeGuessWhoBase);
export const IcModeBot = memo(IcModeBotBase);
export const IcNoAds = memo(IcNoAdsBase);
export const IcCrown = memo(IcCrownBase);
