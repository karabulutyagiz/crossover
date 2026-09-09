// UI2 primitifleri — mock'taki yüzey ailesi: koyu lacivert dış kontur, ana renk yüzü,
// dar üst parlama, alt dilim (gölge). Hepsi View katmanı; PNG buton yok, ölçek bağımsız.
import { cloneElement, isValidElement, memo, type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, type DimensionValue, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useButtonMotion } from './useMenuMotion';
import Svg, { Defs, Pattern, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { C, F, fz, LIP, mk, OUTLINE, R, SIDE, SW, FONT_SCALE, MIN_TAP } from './tokens';
import { UI2 } from './assets';
import { IcGem } from './icons-ui';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Damalı royal blue zemin (mock: ~120 px'lik iki tonlu elmaslar) ─────────────
function CheckerBgBase({ style }: { style?: StyleProp<ViewStyle> }) {
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

// ── Sanat yuvası: ÇUKUR lacivert panel + ürünün kimlik renginde YUMUŞAK ışıma.
// Sert renkli çerçeve/dolgu yerine bu kullanılır: kartlar tek dilde kalır, renk yalnız ışıkta hissedilir.
export function ArtWell({ accent, height, radius = mk(18), children, style }: { accent: string; height?: number; radius?: number; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const gid = `well${accent.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <View style={[{ height, borderRadius: radius, backgroundColor: '#071F52', borderWidth: mk(3), borderColor: '#04143A', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="46%" rx="62%" ry="62%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.5} />
            <Stop offset="0.62" stopColor={accent} stopOpacity={0.16} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: mk(4), backgroundColor: '#FFFFFF', opacity: 0.10 }} />
      {children}
    </View>
  );
}

// ── Nadirlik göstergesi: küçük eğik elmaslar (sayı rozeti yerine — vitrin sakin kalır) ──
export function RarityPips({ n, color, size = mk(15) }: { n: number; color: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.42 }}>
      {Array.from({ length: Math.max(1, n) }, (_, i) => (
        <View key={i} style={{ width: size, height: size, backgroundColor: color, borderWidth: 1, borderColor: '#04143A', transform: [{ rotate: '45deg' }] }} />
      ))}
    </View>
  );
}

export const CheckerBg = memo(CheckerBgBase);

// ── Konturlu yazı: 8 yönlü kopya (RN'de stroke yok). Başlıklar/CTA/fiyatlar. ────
function OutlinedTextBase({ children, size, color = C.white, outline = C.ink, width = 2, family = F.title, style, align = 'center', numberOfLines, fit = false, fitWidth }: {
  children: ReactNode; size: number; color?: string; outline?: string; width?: number; family?: string;
  style?: StyleProp<TextStyle>; align?: 'left' | 'center' | 'right'; numberOfLines?: number;
  /** Uzun dillerde sığdır: metnin doğal genişliği / kullanılabilir genişlik oranıyla deterministik punto. */
  fit?: boolean;
  /** Kullanılabilir genişlik dışarıdan ölçüldüyse (içerik boyutlu sarmalayıcıda kendi ölçümü küçülme döngüsü yapar). */
  fitWidth?: number;
}) {
  // fit: NATİVE adjustsFontSizeToFit KULLANILMAZ — 9 kopya farklı ölçek buluyordu (dolgu minik, kontur büyük).
  // Deterministik: görünmez bir ölçüm kopyası metnin doğal genişliğini (taban punto) verir, sarmalayıcı kullanılabilir
  // genişliği verir; punto = taban × (kullanılabilir / doğal). Kopyaların hepsi aynı puntoyu alır.
  // KURAL: fit için ebeveyn belirli bir genişlik vermeli (sütun içinde stretch; satır içinde flex:1'li View'a sar).
  const [availW, setAvailW] = useState(0);
  const [natW, setNatW] = useState(0);
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null;
  const base0 = Math.max(Math.round(size * FONT_SCALE * 2) / 2, 12); // telefon tabanı (tokens.fz ile aynı kural)
  const lines = numberOfLines ?? 1;
  const useW = fitWidth ?? availW;
  const fs = fit && text && useW > 0 && natW > 0
    ? Math.max(9, Math.min(base0, Math.floor(base0 * ((useW - 2 * width - 1) * (lines > 1 ? lines * 0.9 : 1)) / natW * 2) / 2))
    : base0;
  const base: TextStyle = { fontFamily: family, fontSize: fs, color, textAlign: align, includeFontPadding: false };
  const offsets = useMemo(() => {
    const w = width; const o: [number, number][] = [];
    for (const dx of [-w, 0, w]) for (const dy of [-w, 0, w]) if (dx || dy) o.push([dx, dy]);
    return o;
  }, [width]);
  return (
    <View onLayout={fit && fitWidth == null ? (e) => { const w = Math.round(e.nativeEvent.layout.width); if (w !== availW) setAvailW(w); } : undefined}
      style={fit ? { alignSelf: 'stretch', flexShrink: 0, minWidth: 0 } : { alignSelf: align === 'center' ? 'center' : 'stretch', flexShrink: 0 }}>
      {fit && text ? (
        <Text numberOfLines={1} accessible={false} importantForAccessibility="no" pointerEvents="none"
          onTextLayout={(e) => { const w = e.nativeEvent.lines?.[0]?.width ?? 0; if (w > 0 && Math.ceil(w) !== natW) setNatW(Math.ceil(w)); }}
          style={[base, style, { position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0, fontSize: base0, textAlign: 'left' }]}>{children}</Text>
      ) : null}
      {offsets.map(([dx, dy]) => (
        <Text key={`${dx}_${dy}`} numberOfLines={numberOfLines} style={[base, style, { position: 'absolute', left: dx, right: -dx, top: dy, color: outline }]} accessible={false} importantForAccessibility="no">{children}</Text>
      ))}
      <Text numberOfLines={numberOfLines} style={[base, style]}>{children}</Text>
    </View>
  );
}

// Konturlu yazı ETİKET BAŞINA 9 Text düğümü çiziyor; ebeveyn her render'da hepsini yeniden
// kurmasın diye memo (akıcılık paketi 2026-09-08).
export const OutlinedText = memo(OutlinedTextBase);

// ── Plaka: kontur + yüz + üst parlama + alt dilim ───────────────────────────────
export function Plate({ children, face = C.panel, top = C.panelTop, lip = C.panelDark, outline = C.navy, radius = R.plate, style, inner, lipHeight = LIP, outlineWidth = OUTLINE, shrink = false, onInnerLayout }: {
  children?: ReactNode; face?: string; top?: string; lip?: string; outline?: string; radius?: number;
  style?: StyleProp<ViewStyle>; inner?: StyleProp<ViewStyle>; lipHeight?: number; outlineWidth?: number;
  /** Üç katman da ebeveynin maxHeight'ına uysun (RN'de flexShrink varsayılanı 0 → taşar); içindeki ScrollView kaydırır. */ shrink?: boolean;
  /** İç yüzeyin ölçülen genişliği (buton etiketini sığdırmak için). */ onInnerLayout?: (w: number) => void;
}) {
  const ir = Math.max(2, radius - outlineWidth);
  const sh: ViewStyle = shrink ? { flexShrink: 1, minHeight: 0 } : {};
  return (
    <View style={[{ backgroundColor: outline, borderRadius: radius, padding: outlineWidth }, sh, style]}>
      <View style={[{ backgroundColor: lip, borderRadius: ir, paddingBottom: lipHeight }, sh]}>
        <View onLayout={onInnerLayout ? (e) => onInnerLayout(Math.round(e.nativeEvent.layout.width)) : undefined} style={[{ backgroundColor: face, borderRadius: ir, overflow: 'hidden' }, sh, inner]}>
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
export function ChunkyButton({ kind = 'green', label, sub, over, onPress, height = mk(92), size = mk(38), style, icon, gem, disabled, radius = R.button, subSize, compact }: {
  kind?: keyof typeof BTN; label: string; sub?: string; /** küçük üst satır (ör. abonelik süresi) */ over?: string; onPress?: () => void; height?: number; size?: number;
  style?: StyleProp<ViewStyle>; icon?: ImageSourcePropType; gem?: boolean; disabled?: boolean; radius?: number; subSize?: number;
  /** 40 pt dokunma tabanını uygulama — yalnız kartın tamamı zaten dokunulabilirken (görsel buton) */ compact?: boolean;
}) {
  const k = BTN[kind];
  const { press, pressIn, pressOut } = useButtonMotion();
  const iconSrc = gem ? UI2.hud_gem : icon;
  height = compact ? height : Math.max(height, MIN_TAP);
  const ow = Math.min(mk(4), Math.max(0.9, size * 0.085)); // kontur: puntonun ~%8.5'i (11 pt → 0.9, 17 pt → 1.5)
  // Alt dilim ve dış kontur BUTON YÜKSEKLİĞİYLE ORANTILI: sabit LIP/OUTLINE ince butonlarda
  // "altı ayrı renkte kesilmiş" gibi duruyordu (kullanıcı 2026-09-08).
  const [innerW, setInnerW] = useState(0);
  const lipH = Math.max(mk(4), Math.min(LIP, height * 0.10));
  const labelW = innerW > 0 ? Math.max(mk(40), innerW - (gem || icon ? size * 1.05 + mk(8) : 0)) : undefined;
  const outW = Math.max(mk(3.5), Math.min(OUTLINE, height * 0.085));
  return (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={[{ opacity: disabled ? 0.55 : 1, transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) }] }, style]}>
      <Plate face={k.face} top={k.top} lip={k.lip} radius={radius} lipHeight={lipH} outlineWidth={outW}
        inner={{ height: height - outW * 2 - lipH, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: mk(8), paddingHorizontal: mk(12) }}
        onInnerLayout={(w) => { if (w !== innerW) setInnerW(w); }}>
        {/* İkon + fiyat TEK GRUP olarak ortalanır (geniş butonda ikon kenarda yalnız kalmasın).
            Etiket flexShrink ile kesin genişlik alır → fit tek satıra sığdırır. */}
        <View style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
          {over ? <OutlinedText size={size * 0.62} outline={k.textOutline} width={ow * 0.8} numberOfLines={1} fit style={{ marginBottom: -mk(3) }}>{over}</OutlinedText> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: mk(8), alignSelf: 'stretch' }}>
            {iconSrc ? <Image source={iconSrc} style={{ width: size * 1.05, height: size * 1.05 }} resizeMode="contain" /> : null}
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <OutlinedText size={size} outline={k.textOutline} width={ow} numberOfLines={1} fit fitWidth={labelW}>{label}</OutlinedText>
            </View>
          </View>
          {sub ? <OutlinedText size={subSize ?? size * 0.55} outline={k.textOutline} width={ow * 0.8} numberOfLines={1} fit style={{ marginTop: -mk(4) }}>{sub}</OutlinedText> : null}
        </View>
      </Plate>
    </AnimatedPressable>
  );
}

// ── Bölüm başlığı: ikon + konturlu başlık + sağda alt başlık ve ok ─────────────
export function SectionHeader({ icon, title, subtitle, onMore, style }: { icon: ImageSourcePropType | ReactNode; title: string; subtitle?: string; onMore?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', height: mk(96), paddingHorizontal: mk(6) }, style]}>
      <IconSlot icon={icon} width={mk(92)} height={mk(80)} size={mk(78)} />
      <View style={{ marginLeft: mk(10), flex: 1, minWidth: 0 }}>
        <OutlinedText size={mk(54)} width={mk(5)} align="left" numberOfLines={1} fit>{title}</OutlinedText>
      </View>
      {subtitle ? (
        <Pressable onPress={onMore} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), flexShrink: 0, width: '36%', marginLeft: mk(8), justifyContent: 'flex-end' }}>
          <View style={{ width: mk(24), height: 2, backgroundColor: C.textSub, opacity: 0.6 }} />
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(20), letterSpacing: 0.2, flexShrink: 1, textAlign: 'right', lineHeight: fz(23) }}>{subtitle}</Text>
          {onMore ? <Text style={{ color: C.textSub, fontFamily: F.black, fontSize: fz(30), marginTop: -2 }}>›</Text> : null}
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), flexShrink: 1, minWidth: 0 }}>
      <IcGem size={size * 1.1} />
      <View style={{ flexShrink: 1, minWidth: 0 }}><OutlinedText size={size} color={color} width={mk(4)} family={family} numberOfLines={1} fit>{typeof amount === 'number' ? amount.toLocaleString('tr-TR') : amount}</OutlinedText></View>
    </View>
  );
}

export const fmt = (n: number): string => n.toLocaleString('tr-TR');

// ── İkon yuvası: raster görsel (require) ya da vektör düğüm — çağıran ne verirse ──
export function IconSlot({ icon, width, height, size }: { icon: ImageSourcePropType | ReactNode; width: number; height: number; size?: number }) {
  if (isValidElement(icon)) return <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>{size ? cloneElement(icon as ReactElement<{ size?: number }>, { size }) : icon}</View>;
  return <Image source={icon as ImageSourcePropType} style={{ width, height }} resizeMode="contain" />;
}
// ── Banner: opak sanat + üstüne canlı katman (mağaza/arkadaşlar banner'ları) ──
export function BannerImage({ source, ratio, children, width, bare = false }: { source: ImageSourcePropType; ratio: number; children?: ReactNode; width?: number; /** teklif kartının içindeyken kendi çerçevesini çizme (çift çerçeve olmasın) */ bare?: boolean }) {
  const w = width ?? SW - SIDE * 2; const h = w / ratio;
  return (
    <View style={{ width: w, height: h, borderRadius: mk(bare ? 16 : 24), overflow: 'hidden', borderWidth: bare ? 0 : mk(4), borderColor: C.navy }}>
      <Image source={source} style={{ width: w, height: h }} resizeMode="cover" />
      {children}
    </View>
  );
}
// ── Eğik çıkartma — banner'ın köşesinde, taşan kısmı banner kırpar (mock'taki gibi) ──
export function Sticker({ left, top, width, height, rotate, face, border, children }: { left: DimensionValue; top: DimensionValue; width: DimensionValue; height: DimensionValue; rotate: string; face: string; border: string; children: ReactNode }) {
  return (
    <View style={{ position: 'absolute', left, top, width, height, transform: [{ rotate }], backgroundColor: face, borderWidth: mk(4), borderColor: border, borderRadius: mk(10), alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(8) }}>
      {children}
    </View>
  );
}

// ── Uzunluğa göre punto: `latin` Latin karakter (ya da `cjk` CJK karakter) sığıyorsa taban punto, fazlası orantılı küçülür ──
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/;
export function fitSize(base: number, text: string, latin: number, cjk = Math.round(latin * 0.55)): number {
  const n = Array.from(text).length; const cap = CJK.test(text) ? cjk : latin;
  return n <= cap ? base : Math.max(base * 0.5, base * cap / n);
}
