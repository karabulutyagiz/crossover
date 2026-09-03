// ══════════════════════════════════════════════════════════════════════════
// COF UI FOUNDATION — paylaşılan primitifler (Aşama 01, 2026-09-02)
// Kural: renk/ölçü/süre YALNIZ ./theme (token) üzerinden; burada ham hex, ham
// dp ya da ham ms YOK. Eski Btn/GamePanel/SegmentedTabs (screens.tsx) aşamalı
// geçiş boyunca aynen durur; bunlar YANINA gelir, yerine geçmez.
// Erişilebilirlik: her kontrolde rol + durum; seçili durum renk + konum/ikon;
// devre dışı kontrol okunur kalır ve "seçili değil" sekmeye benzemez; dokunma
// alanı ≥ 44 dp; basma tepkisi transform/opacity + renk (yerleşim ASLA kaymaz);
// reduced motion'da hareket kapanır, renk tepkisi kalır.
// ══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Pressable, Text, View,
  type LayoutChangeEvent, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cof, cofType, cofTypeIsUppercase, COF_LIP_COLOR, COF_MIN_FIT_SCALE, type CofTypeVariant } from './theme';
import { cofUpper } from './format';
import { t } from '../i18n';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
const C = cof.color;
const S = cof.spacing;
const R = cof.radius;
const B = cof.border;
const Z = cof.size;
const M = cof.motion;

// Süsleme amaçlı ikon/rozet: ekran okuyucu ağacından çıkarılır (etiket ana
// kontrolde). iOS ve Android'in ayrı bayrakları olduğu için ikisi birlikte.
const DECORATIVE = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

// ---- Reduced motion — UYGULAMA GENELİNDE TEK abonelik -------------------------
// Her buton/kart kendi AccessibilityInfo çağrısını yapsaydı ekran başına onlarca
// köprü çağrısı + dinleyici olurdu. Modül düzeyinde tek kaynak, bileşenler abone.
let reducedMotionValue = false;
let reducedMotionSubscribed = false;
const reducedMotionListeners = new Set<(v: boolean) => void>();
function publishReducedMotion(v: boolean): void {
  const next = Boolean(v);
  if (next === reducedMotionValue) return;
  reducedMotionValue = next;
  reducedMotionListeners.forEach((fn) => fn(next));
}
function ensureReducedMotionSubscription(): void {
  if (reducedMotionSubscribed) return;
  reducedMotionSubscribed = true;
  AccessibilityInfo.isReduceMotionEnabled().then(publishReducedMotion).catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', publishReducedMotion);
}
export function useCofReducedMotion(): boolean {
  const [v, setV] = useState(reducedMotionValue);
  useEffect(() => {
    ensureReducedMotionSubscription();
    reducedMotionListeners.add(setV);
    setV(reducedMotionValue);
    return () => { reducedMotionListeners.delete(setV); };
  }, []);
  return v;
}

// ---- Basma tepkisi (token: press.scale / downDurationMs / releaseDurationMs) ----
// Hareket (ölçek/çökme) + renk (pressed yüz) birlikte. Reduced motion açıkken
// hareket kapanır, renk tepkisi kalır — geri bildirim asla tamamen kaybolmaz.
function useCofPress(inert: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);
  const reduced = useCofReducedMotion();
  const onPressIn = useCallback(() => {
    if (inert) return;
    setPressed(true);
    Animated.timing(v, { toValue: 1, duration: M.press.downDurationMs, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v, inert]);
  const onPressOut = useCallback(() => {
    setPressed(false);
    Animated.timing(v, { toValue: 0, duration: M.press.releaseDurationMs, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  const scale = reduced || inert ? 1 : v.interpolate({ inputRange: [0, 1], outputRange: [1, M.press.scale] });
  return { v, scale, pressed, onPressIn, onPressOut, reduced };
}

// ---- CofText ---------------------------------------------------------------------
// Token'ında `transform: uppercase` olan varyantlar JS ile (yerel-duyarlı)
// büyütülür; native textTransform Türkçe "i"yi bozduğu için KULLANILMAZ.
export type CofTextTone = keyof typeof C.text;
export function CofText({ variant = 'body', tone = 'primary', color, style, children, ...rest }: TextProps & {
  variant?: CofTypeVariant; tone?: CofTextTone; color?: string; style?: StyleProp<TextStyle>; children?: ReactNode;
}) {
  const content = cofTypeIsUppercase(variant) && typeof children === 'string' ? cofUpper(children) : children;
  return (
    <Text {...rest} style={[cofType[variant], { color: color ?? C.text[tone] }, style]}>
      {content}
    </Text>
  );
}

// ---- CofSurface / CofCard ----------------------------------------------------------
// Gölge ile `overflow: 'hidden'` AYNI düğümde olamaz: iOS'ta maske gölgeyi yer.
// Dış sarmalayıcı gölge + yarıçap + kenarlık taşır, iç gövde kırpar.
export type CofSurfaceVariant = 'base' | 'interactive' | 'selected' | 'reward' | 'premium' | 'disabled';
const SURFACE: Record<CofSurfaceVariant, { face: string; stroke: string; strokeWidth: number; wash?: string; badgeColor?: string; badgeIcon?: IoniconName }> = {
  base:        { face: C.surface.base,     stroke: C.stroke.subtle,  strokeWidth: B.hairline },
  // Etkileşimli kart bilgi kartından SINIRLA da ayrılır (spec): interactiveOuter.
  interactive: { face: C.surface.raised,   stroke: C.stroke.default, strokeWidth: B.interactiveOuter },
  selected:    { face: C.surface.strong,   stroke: C.stroke.focus,   strokeWidth: B.selected, badgeColor: C.brand.primary, badgeIcon: 'checkmark-circle' },
  reward:      { face: C.surface.raised,   stroke: C.reward.gold,    strokeWidth: B.default, wash: C.reward.goldTint },
  premium:     { face: C.surface.raised,   stroke: C.premium.gem,    strokeWidth: B.default, wash: C.premium.gemTint },
  disabled:    { face: C.surface.disabled, stroke: C.stroke.subtle,  strokeWidth: B.hairline, badgeColor: C.text.disabled, badgeIcon: 'lock-closed' },
};

export function CofSurface({
  variant = 'base', onPress, selectedLabel, padding = Z.card.contentPadding, radius = 'card', minHeight,
  accessibilityLabel, style, children,
}: {
  variant?: CofSurfaceVariant;
  onPress?: () => void;               // verilirse yüzey etkileşimlidir (rol: button)
  selectedLabel?: string;             // 'selected' rozet metni; varsayılan t('cof.selected')
  padding?: number; radius?: 'card' | 'cardLarge'; minHeight?: number;
  accessibilityLabel?: string; style?: StyleProp<ViewStyle>; children?: ReactNode;
}) {
  const v = SURFACE[variant];
  const inert = variant === 'disabled' || !onPress;
  const { scale, onPressIn, onPressOut } = useCofPress(inert);
  const r = R[radius];
  const body = (
    <Animated.View
      style={[
        { backgroundColor: v.face, borderRadius: r, borderWidth: v.strokeWidth, borderColor: v.stroke, transform: [{ scale }] },
        cof.elevation('card'),
        style,
      ]}
    >
      {/* Kırpma İÇERİDE: dış düğümdeki gölge iOS'ta korunur. */}
      <View style={{ borderRadius: r - v.strokeWidth, overflow: 'hidden', padding, minHeight: minHeight ?? Z.card.minimumHeight }}>
        {v.wash ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: v.wash }} /> : null}
        {children}
        {v.badgeIcon ? (
          // Seçili/kilitli: renk + ikon (+ etiket) — yalnız renk asla.
          <View pointerEvents="none" {...DECORATIVE} style={{ position: 'absolute', top: S[2], right: S[2], flexDirection: 'row', alignItems: 'center', gap: S[1], backgroundColor: v.face, borderRadius: R.pill, paddingHorizontal: S[2], paddingVertical: S[1] }}>
            <Ionicons name={v.badgeIcon} size={Z.icon.small} color={v.badgeColor} />
            {variant === 'selected' ? <CofText variant="caption" color={v.badgeColor}>{cofUpper(selectedLabel ?? t('cof.selected'))}</CofText> : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
  if (!onPress) {
    // Etiket verilmişse düğüm ERİŞİLEBİLİR olarak işaretlenir; aksi halde
    // VoiceOver/TalkBack accessibilityLabel'ı yok sayardı.
    return (
      <View
        accessible={accessibilityLabel ? true : undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={variant === 'disabled' ? { disabled: true } : undefined}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: variant === 'selected', disabled: variant === 'disabled' }}
      style={{ minHeight: Z.minimumTouchTarget }}
    >
      {body}
    </Pressable>
  );
}
export const CofCard = CofSurface;

// ---- CofButton --------------------------------------------------------------------
// Geometri SABİT: dudak (extrusion) her durumda yer ayırır — loading/disabled
// açılıp kapandığında altındaki içerik zıplamaz. Basınca yüz dudağın üstüne iner.
export type CofButtonVariant = 'primary' | 'secondary' | 'reward' | 'ghost' | 'danger';
export type CofButtonSize = 'primary' | 'secondary' | 'compact';
const BUTTON: Record<CofButtonVariant, { face: string; pressedFace?: string; lip: string | null; text: string; stroke?: string; highlight?: string }> = {
  // Dudak rengi token'ın kendi "extrusion" tanımından (elevation.button.color),
  // marka gölgesi ise primary'nin kendi koyu tonundan gelir.
  primary:   { face: C.brand.primary, pressedFace: C.brand.primaryPressed, lip: C.brand.primaryShadow, text: C.text.onPrimary, highlight: C.brand.primaryHighlight },
  secondary: { face: C.surface.strong,                                     lip: COF_LIP_COLOR,        text: C.text.primary,   stroke: C.stroke.default },
  reward:    { face: C.reward.gold,                                        lip: C.reward.goldShadow,  text: C.text.onGold,    highlight: C.reward.goldHighlight },
  ghost:     { face: 'transparent',                                        lip: null,                 text: C.text.secondary },
  danger:    { face: C.semantic.error,                                     lip: COF_LIP_COLOR,        text: C.text.onPrimary },
};
const BUTTON_HEIGHT: Record<CofButtonSize, number> = { primary: Z.button.primaryHeight, secondary: Z.button.secondaryHeight, compact: Z.button.compactHeight };

export function CofButton({
  label, onPress, variant = 'primary', size, icon, disabled = false, locked = false, loading = false, fullWidth = true,
  accessibilityLabel, accessibilityHint, style,
}: {
  label: string; onPress: () => void; variant?: CofButtonVariant; size?: CofButtonSize; icon?: IoniconName;
  disabled?: boolean;
  /** Kilitli: içerik henüz açılmadı (kilit ikonu). Devre dışı ≠ kilitli (spec). */
  locked?: boolean;
  loading?: boolean; fullWidth?: boolean;
  accessibilityLabel?: string; accessibilityHint?: string; style?: StyleProp<ViewStyle>;
}) {
  const sz: CofButtonSize = size ?? (variant === 'primary' ? 'primary' : 'secondary');
  const h = BUTTON_HEIGHT[sz];
  const off = disabled || locked;
  const inert = off || loading;
  const spec = BUTTON[variant];
  // Devre dışı: okunur kalır (token yüzeyi + token metni), kenarlıkla ayrışır.
  const text = off ? C.text.disabled : spec.text;
  // Dudak HER ZAMAN yer ayırır (yükseklik sabit); rengi duruma göre değişir.
  const extrusion = spec.lip ? Z.button.extrusion : 0;
  const lipColor = spec.lip ? (off ? C.stroke.strong : spec.lip) : null;
  const { v, scale, pressed, onPressIn, onPressOut, reduced } = useCofPress(inert);
  const sink = reduced || inert || !extrusion ? 0 : v.interpolate({ inputRange: [0, 1], outputRange: [0, extrusion] });
  const labelStyle: TextStyle = sz === 'compact' ? cofType.body : cofType.button;
  // 44 dp: compact 42 → hitSlop ile tamamlanır (hitSlop ebeveyn sınırını aşabilir).
  const slop = Math.max(0, Math.ceil((Z.minimumTouchTarget - h) / 2));
  const liveFace = off ? C.surface.disabled : pressed && spec.pressedFace ? spec.pressedFace : spec.face;
  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={inert}
      hitSlop={slop ? { top: slop, bottom: slop } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: loading }}
      style={[{ height: h + extrusion, minWidth: fullWidth ? undefined : Z.minimumTouchTarget, alignSelf: fullWidth ? 'stretch' : 'flex-start' }, style]}
    >
      {lipColor ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: extrusion, height: h, borderRadius: R.control, backgroundColor: lipColor }} /> : null}
      <Animated.View
        style={{
          height: h, borderRadius: R.control, backgroundColor: liveFace,
          borderWidth: spec.stroke || off ? B.interactiveOuter : 0, borderColor: off ? C.stroke.subtle : spec.stroke,
          paddingHorizontal: Z.button.horizontalPadding,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Z.button.iconGap,
          transform: [{ translateY: sink }, { scale }],
        }}
      >
        {spec.highlight && !off ? <View pointerEvents="none" {...DECORATIVE} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: B.hairline, backgroundColor: spec.highlight, borderTopLeftRadius: R.control, borderTopRightRadius: R.control }} /> : null}
        {/* Kilitli ≠ devre dışı: kilit ikonu YALNIZ locked'da. Loading'de saat. */}
        {locked ? <Ionicons name="lock-closed" size={Z.icon.small} color={text} />
          : loading ? <Ionicons name="time-outline" size={sz === 'compact' ? Z.icon.small : Z.icon.medium} color={text} />
          : icon ? <Ionicons name={icon} size={sz === 'compact' ? Z.icon.small : Z.icon.medium} color={text} /> : null}
        {/* Canlı metin: PNG'ye gömülmez. Üç nokta yasak → uzun Türkçe etiket
            belgelenmiş alt ölçekle (COF_MIN_FIT_SCALE) küçülerek sığar. */}
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={COF_MIN_FIT_SCALE} style={[labelStyle, { color: text, flexShrink: 1, textAlign: 'center' }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ---- CofSectionHeader -----------------------------------------------------------------
export function CofSectionHeader({ label, icon, action, style }: {
  label: string; icon?: IoniconName; action?: { label: string; onPress: () => void; accessibilityLabel?: string }; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessibilityRole="header" style={[{ flexDirection: 'row', alignItems: 'center', gap: S[2], minHeight: Z.minimumTouchTarget, marginBottom: S.cardGap }, style]}>
      {icon ? <Ionicons name={icon} size={Z.icon.small} color={C.reward.gold} {...DECORATIVE} /> : null}
      <CofText variant="sectionTitle" tone="secondary" style={{ flexShrink: 1 }}>{label}</CofText>
      <View style={{ flex: 1, height: B.hairline, backgroundColor: C.stroke.subtle }} />
      {action ? <CofButton variant="ghost" size="compact" fullWidth={false} label={action.label} onPress={action.onPress} accessibilityLabel={action.accessibilityLabel} /> : null}
    </View>
  );
}

// ---- CofSegmentedTabs -------------------------------------------------------------
// Tek seçili sekme yapısı: kayan gösterge (translateX — tüm kontrol yanıp
// sönmez) + seçili sekmede zemin/konum farkı + accessibilityState.selected.
// Devre dışı sekme kilitle ayrışır; seçili olmayan sekme TIKLANABİLİR görünür.
export function CofSegmentedTabs<K extends string>({ tabs, active, onChange, style }: {
  tabs: { key: K; label: string; icon?: IoniconName; badge?: number; disabled?: boolean; accessibilityLabel?: string }[];
  active: K; onChange: (key: K) => void; style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const reduced = useCofReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  const laidOut = useRef(false);
  const pad = S[1];
  const n = Math.max(1, tabs.length);
  // onLayout genişliği KENARLIĞI da içerir; iç yerleşim kenarlık+padding'den
  // sonra başlar — gösterge aksi halde son sekmeye doğru kayardı.
  const inner = Math.max(0, width - (B.hairline * 2) - pad * 2);
  const segW = inner / n;
  const found = tabs.findIndex((tb) => tb.key === active);
  const idx = found >= 0 ? found : 0;
  useEffect(() => {
    if (!width) return;
    const to = idx * segW;
    // İlk yerleşimde gösterge YERİNDE belirir; 0'dan kayarak gelmez.
    if (!laidOut.current || reduced) { laidOut.current = true; x.setValue(to); return; }
    Animated.timing(x, { toValue: to, duration: M.durationMs.base, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [idx, segW, width, x, reduced]);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  return (
    <View accessibilityRole="tablist" onLayout={onLayout} style={[{ flexDirection: 'row', backgroundColor: C.surface.sunken, borderRadius: R.control, padding: pad, borderWidth: B.hairline, borderColor: C.stroke.subtle }, style]}>
      {width > 0 && found >= 0 ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: pad, bottom: pad, left: pad, width: segW, borderRadius: R.small, backgroundColor: C.brand.primary, transform: [{ translateX: x }] }} />
      ) : null}
      {tabs.map((tb) => {
        const sel = tb.key === active;
        const dis = Boolean(tb.disabled);
        const color = sel ? C.text.onPrimary : dis ? C.text.disabled : C.text.secondary;
        const count = tb.badge && tb.badge > 0 ? tb.badge : 0;
        return (
          <Pressable
            key={tb.key}
            onPress={dis || sel ? undefined : () => onChange(tb.key)}
            disabled={dis}
            accessibilityRole="tab"
            // Rozet sayısı etikete katılır: aksi halde ekran okuyucu görmezdi.
            accessibilityLabel={count ? `${tb.accessibilityLabel ?? tb.label}, ${count}` : (tb.accessibilityLabel ?? tb.label)}
            accessibilityState={{ selected: sel, disabled: dis }}
            style={{ flex: 1, minHeight: Z.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S[1], paddingHorizontal: S[1] }}
          >
            {/* İkon yalnız verilmişse çizilir (seçilince ikon ENJEKTE EDİLMEZ:
                etiket her seçimde yeniden akardı). Kilitli sekmede kilit. */}
            {dis ? <Ionicons name="lock-closed" size={Z.icon.small} color={color} {...DECORATIVE} />
              : tb.icon ? <Ionicons name={tb.icon} size={Z.icon.small} color={color} {...DECORATIVE} /> : null}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={COF_MIN_FIT_SCALE} style={[cofType.caption, { color, flexShrink: 1 }]}>{tb.label}</Text>
            {count ? <CofBadge variant="count" count={count} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- CofBadge ---------------------------------------------------------------------
export type CofBadgeVariant = 'count' | 'new' | 'reward' | 'premium' | 'info' | 'success' | 'warning' | 'error';
const BADGE: Record<CofBadgeVariant, { bg: string; fg: string; icon?: IoniconName }> = {
  count:   { bg: C.semantic.error,   fg: C.text.onPrimary },
  new:     { bg: C.semantic.error,   fg: C.text.onPrimary, icon: 'sparkles' },
  reward:  { bg: C.reward.gold,      fg: C.text.onGold,    icon: 'trophy' },
  premium: { bg: C.premium.gem,      fg: C.text.onPrimary, icon: 'diamond' },
  info:    { bg: C.semantic.info,    fg: C.text.onPrimary, icon: 'information-circle' },
  success: { bg: C.semantic.success, fg: C.text.inverse,   icon: 'checkmark-circle' },
  warning: { bg: C.semantic.warning, fg: C.text.inverse,   icon: 'alert-circle' },
  error:   { bg: C.semantic.error,   fg: C.text.onPrimary, icon: 'close-circle' },
};
export function CofBadge({ variant = 'info', label, count, icon, accessibilityLabel, style }: {
  variant?: CofBadgeVariant; label?: string; count?: number; icon?: IoniconName | null; accessibilityLabel?: string; style?: StyleProp<ViewStyle>;
}) {
  const b = BADGE[variant];
  const text = variant === 'count' ? (count != null && count > 99 ? '99+' : String(count ?? 0)) : label ?? '';
  const ic = icon === null ? undefined : icon ?? b.icon;
  if (variant === 'count' && (count == null || count <= 0)) return null;
  return (
    <View
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? undefined : 'no-hide-descendants'}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: S[1], backgroundColor: b.bg, borderRadius: R.pill, minWidth: Z.icon.medium, height: Z.icon.medium, paddingHorizontal: S[2], justifyContent: 'center' }, style]}
    >
      {ic ? <Ionicons name={ic} size={Z.icon.small} color={b.fg} /> : null}
      {text ? <CofText variant="caption" color={b.fg} numberOfLines={1}>{text}</CofText> : null}
    </View>
  );
}
