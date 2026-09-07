// UI2 primitifleri — mock'taki yüzey ailesi: koyu lacivert dış kontur, ana renk yüzü,
// dar üst parlama, alt dilim (gölge). Hepsi View katmanı; PNG buton yok, ölçek bağımsız.
import { type ReactNode, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Polygon, Rect } from 'react-native-svg';
import { C, F, LIP, OUTLINE, R, mk } from './tokens';
import { UI2 } from './assets';

// ── Damalı royal blue zemin (mock: ~120 px'lik iki tonlu elmaslar) ─────────────
export function CheckerBg({ style }: { style?: StyleProp<ViewStyle> }) {
  const s = mk(120);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bgA }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="ui2checker" patternUnits="userSpaceOnUse" width={s} height={s}>
            <Rect width={s} height={s} fill={C.bgA} />
            <Polygon points={`${s / 2},0 ${s},${s / 2} ${s / 2},${s} 0,${s / 2}`} fill={C.bgB} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ui2checker)" />
      </Svg>
    </View>
  );
}

// ── Konturlu yazı: 8 yönlü kopya (RN'de stroke yok). Başlıklar/CTA/fiyatlar. ────
export function OutlinedText({ children, size, color = C.white, outline = C.ink, width = 2, family = F.title, style, align = 'center', numberOfLines }: {
  children: ReactNode; size: number; color?: string; outline?: string; width?: number; family?: string;
  style?: StyleProp<TextStyle>; align?: 'left' | 'center' | 'right'; numberOfLines?: number;
}) {
  const base: TextStyle = { fontFamily: family, fontSize: size, color, textAlign: align, includeFontPadding: false };
  const offsets = useMemo(() => {
    const w = width; const o: [number, number][] = [];
    for (const dx of [-w, 0, w]) for (const dy of [-w, 0, w]) if (dx || dy) o.push([dx, dy]);
    return o;
  }, [width]);
  return (
    <View style={{ alignSelf: align === 'center' ? 'center' : 'stretch', flexShrink: 0 }}>
      {offsets.map(([dx, dy]) => (
        <Text key={`${dx}_${dy}`} numberOfLines={numberOfLines} style={[base, style, { position: 'absolute', left: dx, right: -dx, top: dy, color: outline }]} accessible={false} importantForAccessibility="no">{children}</Text>
      ))}
      <Text numberOfLines={numberOfLines} style={[base, style]}>{children}</Text>
    </View>
  );
}

// ── Plaka: kontur + yüz + üst parlama + alt dilim ───────────────────────────────
export function Plate({ children, face = C.panel, top = C.panelTop, lip = C.panelDark, outline = C.navy, radius = R.plate, style, inner, lipHeight = LIP, outlineWidth = OUTLINE }: {
  children?: ReactNode; face?: string; top?: string; lip?: string; outline?: string; radius?: number;
  style?: StyleProp<ViewStyle>; inner?: StyleProp<ViewStyle>; lipHeight?: number; outlineWidth?: number;
}) {
  const ir = Math.max(2, radius - outlineWidth);
  return (
    <View style={[{ backgroundColor: outline, borderRadius: radius, padding: outlineWidth }, style]}>
      <View style={{ backgroundColor: lip, borderRadius: ir, paddingBottom: lipHeight }}>
        <View style={[{ backgroundColor: face, borderRadius: ir, overflow: 'hidden' }, inner]}>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: mk(7), backgroundColor: top, opacity: 0.85 }} />
          {children}
        </View>
      </View>
    </View>
  );
}

// ── Tombul buton: yeşil (fiyat/katıl), altın (CTA), mavi (izle), gri (pasif) ───
const BTN: Record<'green' | 'gold' | 'blue' | 'gray' | 'red', { face: string; top: string; lip: string; textOutline: string }> = {
  green: { face: C.green, top: C.greenLight, lip: C.greenDark, textOutline: '#0E5A1C' },
  gold: { face: C.gold, top: C.goldLight, lip: C.goldDark, textOutline: C.ink },
  blue: { face: C.blue, top: '#7DB8FF', lip: C.blueDark, textOutline: C.ink },
  gray: { face: C.gray, top: '#C4CDE3', lip: C.grayDark, textOutline: '#2E3A57' },
  red: { face: C.red, top: '#FF8FA3', lip: C.redDark, textOutline: '#5A0A18' },
};
export function ChunkyButton({ kind = 'green', label, sub, onPress, height = mk(92), size = mk(38), style, icon, gem, disabled, radius = R.button, subSize }: {
  kind?: keyof typeof BTN; label: string; sub?: string; onPress?: () => void; height?: number; size?: number;
  style?: StyleProp<ViewStyle>; icon?: ImageSourcePropType; gem?: boolean; disabled?: boolean; radius?: number; subSize?: number;
}) {
  const k = BTN[kind];
  const iconSrc = gem ? UI2.hud_gem : icon;
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [{ opacity: disabled ? 0.55 : 1, transform: [{ translateY: pressed ? 2 : 0 }] }, style]}>
      <Plate face={k.face} top={k.top} lip={k.lip} radius={radius} inner={{ height: height - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: mk(10), paddingHorizontal: mk(18) }}>
        {iconSrc ? <Image source={iconSrc} style={{ width: size * 1.05, height: size * 1.05 }} resizeMode="contain" /> : null}
        <View style={{ alignItems: 'center' }}>
          <OutlinedText size={size} outline={k.textOutline} width={mk(4)}>{label}</OutlinedText>
          {sub ? <OutlinedText size={subSize ?? size * 0.55} outline={k.textOutline} width={mk(3)} style={{ marginTop: -mk(4) }}>{sub}</OutlinedText> : null}
        </View>
      </Plate>
    </Pressable>
  );
}

// ── Bölüm başlığı: ikon + konturlu başlık + sağda alt başlık ve ok ─────────────
export function SectionHeader({ icon, title, subtitle, onMore, style }: { icon: ImageSourcePropType; title: string; subtitle?: string; onMore?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', height: mk(96), paddingHorizontal: mk(6) }, style]}>
      <Image source={icon} style={{ width: mk(92), height: mk(80) }} resizeMode="contain" />
      <View style={{ marginLeft: mk(10) }}>
        <OutlinedText size={mk(54)} width={mk(5)} align="left">{title}</OutlinedText>
      </View>
      <View style={{ flex: 1 }} />
      {subtitle ? (
        <Pressable onPress={onMore} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: mk(10), flexShrink: 1, minWidth: 0, marginLeft: mk(8) }}>
          <View style={{ width: mk(30), height: 2, backgroundColor: C.textSub, opacity: 0.6 }} />
          <Text numberOfLines={2} style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(18), letterSpacing: 0.2, flexShrink: 1, textAlign: 'right', lineHeight: mk(21) }}>{subtitle}</Text>
          {onMore ? <Text style={{ color: C.textSub, fontFamily: F.black, fontSize: mk(30), marginTop: -2 }}>›</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Kırmızı/altın kurdele rozeti ("EN POPÜLER", "ÖZEL TEKLİF", "EN AVANTAJLI") ──
export function Ribbon({ label, color = C.red, style, size = mk(19) }: { label: string; color?: string; style?: StyleProp<ViewStyle>; size?: number }) {
  return (
    <View style={[{ backgroundColor: color, borderRadius: mk(8), borderWidth: mk(4), borderColor: C.navy, paddingHorizontal: mk(14), paddingVertical: mk(3) }, style]}>
      <OutlinedText size={size} width={1.2} outline={C.navyDeep}>{label}</OutlinedText>
    </View>
  );
}

// ── İlerleme çubuğu (XP cyan / kupa altın) ─────────────────────────────────────
export function Bar({ value, max, color = C.cyan, track = '#062B75', height = mk(24), style, radius }: { value: number; max: number; color?: string; track?: string; height?: number; style?: StyleProp<ViewStyle>; radius?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = radius ?? height / 2;
  return (
    <View style={[{ height, borderRadius: r, backgroundColor: track, borderWidth: mk(3), borderColor: C.navy, overflow: 'hidden' }, style]}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: r }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '45%', backgroundColor: '#FFFFFF', opacity: 0.35, borderRadius: r }} />
      </View>
    </View>
  );
}

// ── Elmas ikonu + sayı (canlı metin) ────────────────────────────────────────────
export function GemAmount({ amount, size = mk(34), color = C.white, family = F.title }: { amount: number | string; size?: number; color?: string; family?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8) }}>
      <Image source={UI2.hud_gem} style={{ width: size * 1.1, height: size * 1.1 }} resizeMode="contain" />
      <OutlinedText size={size} color={color} width={mk(4)} family={family}>{typeof amount === 'number' ? amount.toLocaleString('tr-TR') : amount}</OutlinedText>
    </View>
  );
}

export const fmt = (n: number): string => n.toLocaleString('tr-TR');
