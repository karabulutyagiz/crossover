// ══════════════════════════════════════════════════════════════════════════
// COF ROOT SHELL — Aşama 02 (2026-09-03), spec: docs/ui/02_COF_ROOT_SHELL_SPEC.md
//
// MİMARİ NOTU (mevcut yapıya en küçük dokunuş):
// Uygulamanın navigasyonu React Navigation DEĞİL; App.tsx içinde yatay bir
// Animated.ScrollView pager'ı (5 sayfa) + `activeTab` indeksi. Bu yüzden alt
// navigasyon her sayfada değil, TEK örnek olarak App kökünde çizilir; sayfa
// başına düşen kabuk (RootScreenShell) üst kaynak alanını, içerik çerçevesini
// ve alt içerik boşluğunu sağlar. Pager DEĞİŞTİRİLMEDİ, route adları aynı.
//
// Kabuklar iş mantığı bilmez, veri çekmez, route kararı üretmez.
// ══════════════════════════════════════════════════════════════════════════
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Animated, Easing, Keyboard, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { cof, cofType } from './theme';
import { CofText, useCofReducedMotion } from './primitives';
import { formatNumber } from './format';
import { cofDetailContentInset as detailInset, cofNavAppearance, cofNavTotalHeight, cofRootContentInset as rootInset } from './navPolicy';
import { triggerFeedback } from '../feedback/GameFeedback';
import { GameFeedbackEvent } from '../feedback/events';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
const C = cof.color;
const S = cof.spacing;
const R = cof.radius;
const B = cof.border;
const Z = cof.size;
const M = cof.motion;
const NAV = Z.bottomNavigation;

// ---- Alt navigasyon iç geometrisi (token'lardan türetilir) --------------------
// Gövde 76 dp. Orta top 22 dp yukarı taşar (top = -22), alt kenarı 42 dp'de
// biter; bu yüzden ETİKET SATIRI 44 dp'de başlar ve BEŞ sekmede de aynı
// hizadadır (spec: "Oyun etiketi diğer inaktif sekmelerle aynı seviyede").
const NAV_ICON_TOP = 14;                       // ikon alanının üst boşluğu
const NAV_LABEL_TOP = 44;                      // tüm etiketler bu hizada
const NAV_RAIL_W = '46%';                      // aktif çizgi genişliği

// ---- İçerik alt boşluğu bağlamı ---------------------------------------------
// TEK kaynak: RootScreenShell 76 + safeArea.bottom + 24 verir, DetailScreenShell
// alt navigasyon çizmediği için safeArea.bottom + 24 verir. Kabuğun dışındaki
// ekranlar (maç ekranları) 0 alır ve davranışları değişmez.
const CofContentInsetContext = createContext<{ bottom: number; inShell: boolean }>({ bottom: 0, inShell: false });

/** Kaydırma kapları için hazır değerler. Ekran kendi alt boşluğunu EKLEMEZ. */
export function useCofContentInset(): { paddingBottom: number; scrollIndicatorInsets: { bottom: number } } {
  const { bottom } = useContext(CofContentInsetContext);
  return useMemo(() => ({ paddingBottom: bottom, scrollIndicatorInsets: { bottom } }), [bottom]);
}
export function useCofContentInsetValue(): number {
  return useContext(CofContentInsetContext).bottom;
}
/** Bu ağaç bir COF kabuğunun içinde mi? Screen eski 22 dp'yi buna göre sıfırlar. */
export function useCofInShell(): boolean {
  return useContext(CofContentInsetContext).inShell;
}

/** Spec formülleri saf politika modülünde (test edilebilir) — burada yeniden dışa aktarılır. */
export { cofRootContentInset, cofDetailContentInset, cofNavTotalHeight, isCofDetailPhase, isCofNavHidden, cofNavAppearance, COF_DETAIL_PHASES } from './navPolicy';

// ---- Klavye görünürlüğü — TEK dinleyici (bileşen başına çoğaltılmaz) ---------
let keyboardVisible = false;
let keyboardSubscribed = false;
const keyboardListeners = new Set<(v: boolean) => void>();
function publishKeyboard(v: boolean): void {
  if (v === keyboardVisible) return;
  keyboardVisible = v;
  keyboardListeners.forEach((fn) => fn(v));
}
function ensureKeyboardSubscription(): void {
  if (keyboardSubscribed) return;
  keyboardSubscribed = true;
  // iOS'ta will* olayları klavyeyle AYNI karede başlar (bar klavyenin altında
  // kalmaz); Android yalnız did* verir.
  const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
  Keyboard.addListener(showEvt, () => publishKeyboard(true));
  Keyboard.addListener(hideEvt, () => publishKeyboard(false));
}
export function useCofKeyboardVisible(): boolean {
  const [v, setV] = useState(keyboardVisible);
  useEffect(() => {
    ensureKeyboardSubscription();
    keyboardListeners.add(setV);
    setV(keyboardVisible);
    return () => { keyboardListeners.delete(setV); };
  }, []);
  return v;
}

// ---- Alt navigasyon ----------------------------------------------------------
export type CofNavItem = {
  key: string;
  label: string;
  icon: IoniconName;
  activeIcon: IoniconName;
  badge?: number | null;
  /** Orta Oyun kontrolü — FAB değil, beş sekmeden biri. */
  center?: boolean;
  accessibilityLabel?: string;
};

export function CofBottomNav({ items, activeKey, onSelect, hidden = false }: {
  items: CofNavItem[];
  activeKey: string;
  onSelect: (key: string, index: number) => void;
  /** Detay sayfası açıkken true — bar hiç çizilmez. */
  hidden?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useCofReducedMotion();
  const keyboard = useCofKeyboardVisible();
  const away = hidden || keyboard;
  const a = useRef(new Animated.Value(away ? 1 : 0)).current;
  const total = cofNavTotalHeight(insets.bottom);
  useEffect(() => {
    const to = away ? 1 : 0;
    if (reduced) { a.setValue(to); return; }
    Animated.timing(a, { toValue: to, duration: M.durationMs.panel, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [away, reduced, a]);
  // Hızlı art arda dokunuşta ikinci geçiş yutulur (çift route push olmaz).
  const lastTapRef = useRef(0);
  const handle = useCallback((key: string, index: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < M.durationMs.fast) return;
    lastTapRef.current = now;
    triggerFeedback(GameFeedbackEvent.UI_TAP);
    onSelect(key, index);
  }, [onSelect]);

  return (
    <Animated.View
      accessibilityRole="tablist"
      // Gizliyken dokunuş almaz; box-none: barın kendi boşluğu altındaki
      // içeriği yutmaz, yalnız sekmeler dokunuş alır.
      pointerEvents={away ? 'none' : 'box-none'}
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: total, paddingBottom: insets.bottom,
        backgroundColor: C.surface.base,
        // TEK ayrım çizgisi: 1 dp stroke.subtle. Ek siyah çizgi/platform border yok.
        borderTopWidth: B.hairline, borderTopColor: C.stroke.subtle,
        flexDirection: 'row',
        // Orta top gövdenin üstüne taşar — kırpılmaz.
        overflow: 'visible',
        // YUKARI yönlü gölge: elevation.card değerleri, işareti ters çevrilmiş.
        shadowColor: cof.elevation('card').shadowColor as string | undefined,
        shadowOpacity: (cof.elevation('card') as { shadowOpacity?: number }).shadowOpacity,
        shadowRadius: (cof.elevation('card') as { shadowRadius?: number }).shadowRadius,
        shadowOffset: { width: 0, height: -4 },
        elevation: (cof.elevation('card') as { elevation?: number }).elevation,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, total + S.contentBottomExtra] }) }],
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      }}
    >
      {items.map((item, index) => (
        <CofNavTab key={item.key} item={item} active={item.key === activeKey} onPress={() => handle(item.key, index)} />
      ))}
    </Animated.View>
  );
}

function CofNavTab({ item, active, onPress }: { item: CofNavItem; active: boolean; onPress: () => void }) {
  const reduced = useCofReducedMotion();
  const press = useRef(new Animated.Value(0)).current;
  const scale = reduced ? 1 : press.interpolate({ inputRange: [0, 1], outputRange: [1, M.press.scale] });
  const count = item.badge && item.badge > 0 ? item.badge : 0;
  // Aktif: brand.primary; inaktif: text.tertiary. Orta kontrol Oyun aktif
  // DEĞİLKEN nötr (surface.strong + text.secondary), yeşil halo YOK.
  const look = cofNavAppearance(active, item.center);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { if (!reduced) Animated.timing(press, { toValue: 1, duration: M.press.downDurationMs, useNativeDriver: true }).start(); }}
      onPressOut={() => { if (!reduced) Animated.timing(press, { toValue: 0, duration: M.press.releaseDurationMs, useNativeDriver: true }).start(); }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count ? `${item.accessibilityLabel ?? item.label}, ${formatNumber(count)}` : (item.accessibilityLabel ?? item.label)}
      style={{ flex: 1, minWidth: Z.minimumTouchTarget, minHeight: Z.minimumTouchTarget, alignItems: 'center' }}
    >
      {/* Aktif yüzey: brand.primaryTint (yalnız renkle değil, çizgi + zeminle) */}
      {active && !item.center ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: S[1], right: S[1], bottom: S[1], borderRadius: R.small, backgroundColor: look.surface ?? 'transparent' }} />
      ) : null}
      {/* 3 dp aktif çizgi — barın üst kenarında */}
      {active ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, width: NAV_RAIL_W, height: NAV.activeRailHeight, borderRadius: NAV.activeRailHeight, backgroundColor: look.rail ?? 'transparent' }} />
      ) : null}

      {item.center ? (
        // Orta Oyun kontrolü: 64 dp, 22 dp YUKARI taşar (yalnız görsel —
        // layout yüksekliğini değiştirmez, içerik ölçümüne girmez).
        <Animated.View
          style={{
            position: 'absolute', top: -NAV.centerRise, alignSelf: 'center',
            width: NAV.centerControl, height: NAV.centerControl, borderRadius: NAV.centerControl / 2,
            backgroundColor: look.centerBackground ?? C.surface.strong,
            borderWidth: B.interactiveOuter, borderColor: C.surface.base,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ scale }],
          }}
        >
          <Ionicons name={active ? item.activeIcon : item.icon} size={Z.icon.navigation} color={look.icon} />
        </Animated.View>
      ) : (
        <Animated.View style={{ marginTop: NAV_ICON_TOP, height: Z.icon.navigation, justifyContent: 'center', transform: [{ scale }] }}>
          <Ionicons name={active ? item.activeIcon : item.icon} size={Z.icon.navigation} color={look.icon} />
          {count ? (
            <View style={{ position: 'absolute', top: -S[1], right: -S[3], minWidth: NAV.labelSize + S[2], height: NAV.labelSize + S[1], borderRadius: R.pill, paddingHorizontal: S[1], backgroundColor: C.semantic.error, alignItems: 'center', justifyContent: 'center' }}>
              <CofText variant="caption" color={C.text.onError} numberOfLines={1} style={{ fontSize: cofType.caption.fontSize, lineHeight: NAV.labelSize + S[1] }}>{count > 99 ? '99+' : formatNumber(count)}</CofText>
            </View>
          ) : null}
        </Animated.View>
      )}

      {/* Etiket: BEŞ sekmede de aynı hizada (orta top dahil) */}
      <CofText
        variant="caption"
        color={look.label}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={cof.minFitScale}
        style={{ position: 'absolute', top: NAV_LABEL_TOP, left: S[0], right: S[0], textAlign: 'center', fontSize: NAV.labelSize }}
      >
        {item.label}
      </CofText>
    </Pressable>
  );
}

// ---- RootScreenShell ---------------------------------------------------------
// Beş ana sekmenin sayfa çerçevesi. Üst safe-area ve ortak arka plan App kökünde
// TEK yerde uygulanır (mevcut mimari); kabuk bunları ÇOĞALTMAZ, yalnız üst
// kaynak alanını ve doğru alt içerik boşluğunu sağlar.
export function RootScreenShell({ header, children, style }: {
  /** Ortak kaynak (kupa/elmas) satırı — beş sekmede aynı üst başlangıç. */
  header?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const inset = rootInset(insets.bottom);
  return (
    <CofContentInsetContext.Provider value={{ bottom: inset, inShell: true }}>
      <View style={[{ flex: 1 }, style]}>
        {header}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </CofContentInsetContext.Provider>
  );
}

// ---- DetailScreenShell -------------------------------------------------------
// Geri butonlu sayfalar (Profil, Ayarlar, Maç Geçmişi, Arenalar, Liderlik).
// Alt navigasyon ÇİZİLMEZ ve bu sayfalarda gizlenir; aynı anda hem geri butonu
// hem ana alt navigasyon gösterilmez.
// NOT: bu sayfalar kendi `ScreenHeader`'larını (geri butonu + başlık) zaten
// çiziyor. Kabuk `onBack` verilmedikçe İKİNCİ bir başlık çizmez — Aşama 02
// "ekran içeriğini yeniden tasarlama" sınırı bunu gerektirir.
export function DetailScreenShell({ title, onBack, header, children, style }: {
  title?: string;
  onBack?: () => void;
  header?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const inset = detailInset(insets.bottom);
  return (
    <CofContentInsetContext.Provider value={{ bottom: inset, inShell: true }}>
      <View style={[{ flex: 1 }, style]}>
        {onBack ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S[2], paddingHorizontal: S.screenHorizontal, minHeight: Z.rootHeader.titleRowHeight }}>
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={title}
              hitSlop={S[2]}
              style={{ width: Z.minimumTouchTarget, height: Z.minimumTouchTarget, borderRadius: R.control, backgroundColor: C.surface.raised, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={Z.icon.medium} color={C.text.primary} />
            </Pressable>
            {title ? <CofText variant="screenTitle" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</CofText> : null}
          </View>
        ) : null}
        {header}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </CofContentInsetContext.Provider>
  );
}
