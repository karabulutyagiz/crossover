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
  AccessibilityInfo, Animated, Easing, Pressable, Text, TextInput, View,
  type LayoutChangeEvent, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cof, cofType, cofTypeIsUppercase, COF_LIP_COLOR, type CofTypeVariant } from './theme';
import { BADGE_SURFACE, BUTTON_SURFACE, badgeForeground, buttonForeground, buttonGeometry, cofInputAppearance, cofTabAppearance, COF_INPUT_HEIGHT, CONTROL_BORDER_COLOR, DIGIT_CELL_RATIO, labelFitPolicy, LABEL_MIN_FIT_SCALE, touchSlopFor, type CofBadgeVariant, type CofButtonSize, type CofButtonVariant, type CofInputState } from './policy';
import { formatNumber } from './format';
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
// Ön plan rengi ve ikincil sınır TOKEN SÖZLEŞMESİNDEN gelir (policy.ts):
// parlak yüzeyde koyu lacivert metin, açık metin yalnız 4.5:1 doğrulanmışsa.
const BUTTON: Record<CofButtonVariant, { face: string; pressedFace?: string; lip: string | null; text: string; stroke?: string; highlight?: string }> = {
  primary:   { face: BUTTON_SURFACE.primary,   pressedFace: C.brand.primaryPressed, lip: C.brand.primaryShadow, text: buttonForeground('primary'),   highlight: C.brand.primaryHighlight },
  // İkincil kontrol sınırı stroke.control (#7089C5) — dekoratif kart sınırları
  // stroke.subtle/default'ta KALIR (spec 1.0.1: kart sınırları parlatılmaz).
  secondary: { face: BUTTON_SURFACE.secondary,                                      lip: COF_LIP_COLOR,        text: buttonForeground('secondary'), stroke: CONTROL_BORDER_COLOR },
  reward:    { face: BUTTON_SURFACE.reward,                                         lip: C.reward.goldShadow,  text: buttonForeground('reward'),    highlight: C.reward.goldHighlight },
  ghost:     { face: 'transparent',                                                 lip: null,                 text: buttonForeground('ghost') },
  danger:    { face: BUTTON_SURFACE.danger,                                         lip: COF_LIP_COLOR,        text: buttonForeground('danger') },
};



export function CofButton({
  label, onPress, variant = 'primary', size, icon, disabled = false, locked = false, loading = false, fullWidth = true,
  allowTwoLines = false, accessibilityLabel, accessibilityHint, style,
}: {
  label: string; onPress: () => void; variant?: CofButtonVariant; size?: CofButtonSize; icon?: IoniconName;
  /** Uzun ikincil aksiyon için belgelenmiş iki satırlı düzen (ana CTA'da yok sayılır). */
  allowTwoLines?: boolean;
  disabled?: boolean;
  /** Kilitli: içerik henüz açılmadı (kilit ikonu). Devre dışı ≠ kilitli (spec). */
  locked?: boolean;
  loading?: boolean; fullWidth?: boolean;
  accessibilityLabel?: string; accessibilityHint?: string; style?: StyleProp<ViewStyle>;
}) {
  const sz: CofButtonSize = size ?? (variant === 'primary' ? 'primary' : 'secondary');
  const geom = buttonGeometry(sz, variant, { loading, disabled, locked, fullWidth, icon: Boolean(icon) });
  const h = geom.height;
  const off = disabled || locked;
  const inert = off || loading;
  const spec = BUTTON[variant];
  // Devre dışı: okunur kalır (token yüzeyi + token metni), kenarlıkla ayrışır.
  const text = off ? C.text.disabled : spec.text;
  // Dudak HER ZAMAN yer ayırır (yükseklik sabit); rengi duruma göre değişir.
  const extrusion = geom.extrusion;
  const lipColor = spec.lip ? (off ? C.stroke.strong : spec.lip) : null;
  const { v, scale, pressed, onPressIn, onPressOut, reduced } = useCofPress(inert);
  const sink = reduced || inert || !extrusion ? 0 : v.interpolate({ inputRange: [0, 1], outputRange: [0, extrusion] });
  const labelStyle: TextStyle = sz === 'compact' ? cofType.body : cofType.button;
  const fit = labelFitPolicy(sz, allowTwoLines);
  // 44 dp: compact 42 → hitSlop ile tamamlanır (hitSlop ebeveyn sınırını aşabilir).
  const slop = touchSlopFor(h);
  // SABİT GEOMETRİ: loading/locked ikonu sonradan eklenince genişlik değişmesin.
  // fullWidth butonda genişliği ebeveyn verir; fullWidth OLMAYAN butonda ön slot
  // HER DURUMDA ayrılır, böylece normal↔loading geçişi hiçbir şeyi kaydırmaz.
  const leadingIcon: IoniconName | null = locked ? 'lock-closed' : loading ? 'time-outline' : icon ?? null;
  const reserveLeading = geom.reserveLeading;
  const leadingSize = sz === 'compact' ? Z.icon.small : Z.icon.medium;
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
        {/* Kilitli ≠ devre dışı: kilit ikonu YALNIZ locked'da. Loading'de saat.
            Slot boşken bile yer tutar (yukarıdaki reserveLeading) → zıplama yok. */}
        {reserveLeading ? (
          <View style={{ width: leadingSize, height: leadingSize, alignItems: 'center', justifyContent: 'center' }}>
            {leadingIcon ? <Ionicons name={leadingIcon} size={leadingSize} color={text} /> : null}
          </View>
        ) : null}
        {/* Canlı metin: PNG'ye gömülmez. Sığdırma politikası v1.0.1:
            ana CTA küçülmez ve tek satırdır (metin/düzen sığmak ZORUNDA);
            ikincil/kompakt en fazla 0.90'a küçülür ya da iki satıra iner. */}
        <Text
          {...fit}
          onTextLayout={__DEV__ ? (e) => {
            // Geliştirmede sessiz kırpılmayı yakala: "kopya sığmalı" kuralı
            // ancak görünürse işe yarar. Sürümde hiçbir maliyeti yok.
            const lines = e.nativeEvent.lines;
            const last = lines[lines.length - 1];
            if (lines.length > (fit.numberOfLines ?? 1) || (last && typeof last.text === 'string' && last.text.includes('\u2026'))) {
              console.warn(`[COF] Buton etiketi sığmadı ve kırpıldı: "${label}" (${sz}). Kopyayı kısalt, tam genişlik kullan ya da allowTwoLines ver.`);
            }
          } : undefined}
          style={[labelStyle, { color: text, flexShrink: 1, textAlign: 'center' }]}
        >
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
  const selectedLook = cofTabAppearance('selected');
  return (
    <View accessibilityRole="tablist" onLayout={onLayout} style={[{ flexDirection: 'row', backgroundColor: C.surface.sunken, borderRadius: R.control, padding: pad, borderWidth: B.hairline, borderColor: C.stroke.subtle }, style]}>
      {width > 0 && found >= 0 ? (
        // Seçili gösterge KAYAR (tüm kontrol yanıp sönmez). Görünüm spec 5.3:
        // brand.primaryTint zemin + brand.primary kenarlık; metin de primary.
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: pad, bottom: pad, left: pad, width: segW, borderRadius: R.small, backgroundColor: selectedLook.surface ?? C.brand.primaryTint, borderWidth: B.selected, borderColor: selectedLook.border ?? C.brand.primary, transform: [{ translateX: x }] }} />
      ) : null}
      {tabs.map((tb) => {
        const sel = tb.key === active;
        const dis = Boolean(tb.disabled);
        const look = cofTabAppearance(sel ? 'selected' : dis ? 'disabled' : 'inactive');
        const color = look.text;
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
            style={{ flex: 1, minHeight: Z.minimumTouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S[1], paddingHorizontal: S[1], borderRadius: R.small, backgroundColor: dis ? (look.surface ?? 'transparent') : 'transparent' }}
          >
            {/* İkon yalnız verilmişse çizilir (seçilince ikon ENJEKTE EDİLMEZ:
                etiket her seçimde yeniden akardı). Kilitli sekmede kilit. */}
            {/* İkinci işaret zorunlu: seçili sekme renkle YETİNMEZ — ikon (yoksa
                onay ikonu) + tint zemin + kenarlık birlikte anlatır. */}
            {dis ? <Ionicons name="lock-closed" size={Z.icon.small} color={color} {...DECORATIVE} />
              : tb.icon ? <Ionicons name={tb.icon} size={Z.icon.small} color={color} {...DECORATIVE} />
              : sel ? <Ionicons name="checkmark-circle" size={Z.icon.small} color={color} {...DECORATIVE} /> : null}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={LABEL_MIN_FIT_SCALE} style={[cofType.caption, { color, flexShrink: 1 }]}>{tb.label}</Text>
            {count ? <CofBadge variant="count" count={count} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- CofBadge ---------------------------------------------------------------------
// Rozet ön planı: parlak dolu yüzeyde OTOMATİK BEYAZ YOK — her varyant kendi
// text.on* tokenını kullanır (policy.ts doğrular).
const BADGE: Record<CofBadgeVariant, { bg: string; fg: string; icon?: IoniconName }> = {
  quantity:     { bg: BADGE_SURFACE.quantity,     fg: badgeForeground('quantity') },
  count:        { bg: BADGE_SURFACE.count,        fg: badgeForeground('count') },
  notification: { bg: BADGE_SURFACE.notification, fg: badgeForeground('notification') },
  new:          { bg: BADGE_SURFACE.new,          fg: badgeForeground('new'),     icon: 'sparkles' },
  owned:        { bg: BADGE_SURFACE.owned,        fg: badgeForeground('owned'),   icon: 'checkmark-circle' },
  active:       { bg: BADGE_SURFACE.active,       fg: badgeForeground('active'),  icon: 'radio-button-on' },
  rarity:       { bg: BADGE_SURFACE.rarity,       fg: badgeForeground('rarity'),  icon: 'diamond' },
  premium:      { bg: BADGE_SURFACE.premium,      fg: badgeForeground('premium'), icon: 'diamond' },
  info:         { bg: BADGE_SURFACE.info,         fg: badgeForeground('info'),    icon: 'information-circle' },
  error:        { bg: BADGE_SURFACE.error,        fg: badgeForeground('error'),   icon: 'close-circle' },
  streak:       { bg: BADGE_SURFACE.streak,       fg: badgeForeground('streak'),  icon: 'flame' },
  reward:       { bg: BADGE_SURFACE.reward,       fg: badgeForeground('reward'),  icon: 'trophy' },
  success:      { bg: BADGE_SURFACE.success,      fg: badgeForeground('success'), icon: 'checkmark-circle' },
  warning:      { bg: BADGE_SURFACE.warning,      fg: badgeForeground('warning'), icon: 'alert-circle' },
};

// Sayı taşıyan türler: değer yerel biçimde yazılır ve rozet sayı olmadan çizilmez.
const NUMERIC_BADGES = new Set<CofBadgeVariant>(['quantity', 'count', 'notification']);
export function CofBadge({ variant = 'info', label, count, icon, accessibilityLabel, style }: {
  variant?: CofBadgeVariant; label?: string; count?: number; icon?: IoniconName | null; accessibilityLabel?: string; style?: StyleProp<ViewStyle>;
}) {
  const b = BADGE[variant];
  const text = NUMERIC_BADGES.has(variant) ? (count != null && count > 99 ? '99+' : formatNumber(count ?? 0)) : label ?? '';
  const ic = icon === null ? undefined : icon ?? b.icon;
  if (NUMERIC_BADGES.has(variant) && (count == null || count <= 0)) return null;
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

// ---- CofNumber — yerinde değişen sayaçlar için SABİT GENİŞLİKLİ kapsayıcı ----
// Paketteki Poppins'te gerçek tabular rakam YOK (ölçüldü: tnum özelliği yok,
// rakam genişlikleri 387..691/1000 em). Token numberBehavior bunu böyle beyan
// eder ve çözümü tarif eder: yalnız DEĞİŞİRKEN genişlik sıçratan sayaçlar sabit
// genişlikli hücre kullanır; durağan sayılar orantılı kalır (varsayılan).
// Hücre genişliği = yazı boyu × en geniş rakam oranı (policy.DIGIT_CELL_RATIO).
export function CofNumber({ value, variant = 'numberLarge', tone = 'primary', color, stableWidth = false, style, accessibilityLabel }: {
  value: number | string;
  variant?: CofTypeVariant;
  tone?: CofTextTone;
  color?: string;
  /** true: her rakam sabit genişlikli hücreye oturur (canlı sayaç). */
  stableWidth?: boolean;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const text = typeof value === 'number' ? formatNumber(value) : value;
  if (!stableWidth) return <CofText variant={variant} tone={tone} color={color} style={style}>{text}</CofText>;
  const size = (cofType[variant].fontSize as number | undefined) ?? 0;
  const family = (cofType[variant].fontFamily === cof.font.COFDisplay ? 'COFDisplay' : 'COFUI') as 'COFDisplay' | 'COFUI';
  const cell = Math.ceil(size * DIGIT_CELL_RATIO[family]);
  return (
    // Ekran okuyucu sayıyı BÜTÜN olarak okur, rakam rakam değil.
    <View accessible accessibilityLabel={accessibilityLabel ?? text} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {Array.from(text).map((ch, i) => (
        <CofText key={`${i}-${ch}`} variant={variant} tone={tone} color={color} style={[style, /[0-9]/.test(ch) ? { width: cell, textAlign: 'center' } : null]}>{ch}</CofText>
      ))}
    </View>
  );
}

// ---- CofInput — tek metin girişi sözleşmesi (Adım 03, spec 5.5) --------------
// Durumlar: default / focused / filled / error / disabled. Focus YALNIZ renkle
// değil kenarlık kalınlığıyla da görünür. Hata satırı için yer ÖNCEDEN ayrılır
// (helperSpace) → hata belirince yerleşim zıplamaz. Klavye tipi, submit
// davranışı, otomatik düzeltme ve tüm callback'ler ÇAĞIRANDAN geçer; bu bileşen
// hiçbir iş mantığı içermez.
export function CofInput({
  value, onChangeText, label, placeholder, helperText, errorText, disabled = false,
  size = 'default', leadingIcon, trailingIcon, onTrailingIconPress, trailingIconLabel,
  reserveHelperSpace = true, style, inputStyle, testID, accessibilityLabel, ...rest
}: Omit<TextInputProps, 'style' | 'editable' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  /** Doluysa alan `error` durumuna geçer ve metin hata renginde yazılır. */
  errorText?: string | null;
  disabled?: boolean;
  size?: keyof typeof COF_INPUT_HEIGHT;
  leadingIcon?: IoniconName;
  trailingIcon?: IoniconName;
  onTrailingIconPress?: () => void;
  trailingIconLabel?: string;
  /** Hata/yardım satırı için yer her zaman ayrılsın mı (zıplama önleme). */
  reserveHelperSpace?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const state: CofInputState = disabled ? 'disabled' : errorText ? 'error' : focused ? 'focused' : value ? 'filled' : 'default';
  const look = cofInputAppearance(state);
  const h = COF_INPUT_HEIGHT[size];
  const help = errorText ?? helperText ?? '';
  return (
    <View style={[{ alignSelf: 'stretch', gap: S[1] }, style]}>
      {label ? <CofText variant="caption" color={look.label}>{label}</CofText> : null}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: S[2],
          height: h, minHeight: Z.minimumTouchTarget,
          paddingHorizontal: S[4],
          borderRadius: R.control,
          backgroundColor: look.surface,
          borderWidth: look.borderWidth, borderColor: look.border,
        }}
      >
        {leadingIcon ? <Ionicons name={leadingIcon} size={Z.icon.medium} color={look.label} {...DECORATIVE} /> : null}
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={look.placeholder}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled }}
          style={[cofType.body, { flex: 1, color: look.text, paddingVertical: 0 }, inputStyle]}
        />
        {trailingIcon ? (
          onTrailingIconPress
            ? <CofIconButton icon={trailingIcon} onPress={onTrailingIconPress} accessibilityLabel={trailingIconLabel ?? ''} color={look.label} disabled={disabled} />
            : <Ionicons name={trailingIcon} size={Z.icon.medium} color={look.label} {...DECORATIVE} />
        ) : null}
      </View>
      {/* Yardım/hata satırı: yer ÖNCEDEN ayrılır, metin gelince hiçbir şey kaymaz. */}
      {help || reserveHelperSpace ? (
        <View style={{ minHeight: cofType.caption.lineHeight as number }}>
          {help ? (
            <CofText
              variant="caption"
              color={look.help}
              accessibilityLiveRegion={errorText ? 'polite' : 'none'}
            >
              {help}
            </CofText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ---- CofIconButton — ikon kontrolü, hedef HER ZAMAN ≥ 44 dp ------------------
// İkon çizimi küçük kalabilir; kapsayıcı + hitSlop hedefi tamamlar. Etiketsiz
// ikon kontrolü erişilebilir DEĞİLDİR: accessibilityLabel zorunludur.
export function CofIconButton({
  icon, onPress, accessibilityLabel, size = Z.icon.medium, color, disabled = false, style,
}: {
  icon: IoniconName;
  onPress: () => void;
  /** Ekran okuyucu etiketi — ikon-only kontrolde zorunlu. */
  accessibilityLabel: string;
  size?: number;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { scale, onPressIn, onPressOut } = useCofPress(disabled);
  const box = Math.max(Z.minimumTouchTarget, size + S[4]);
  const slop = touchSlopFor(box);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={slop ? { top: slop, bottom: slop, left: slop, right: slop } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={icon} size={size} color={disabled ? C.text.disabled : color ?? C.text.primary} />
      </Animated.View>
    </Pressable>
  );
}
