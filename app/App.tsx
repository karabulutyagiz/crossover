import { memo, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  AppState,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCrossover } from './src/useCrossover';
import { t, setLanguage } from './src/i18n';
import { setGemTarget } from './src/gemTarget';
import { addNotificationTapListener, getPushPermissionGranted, setBadge } from './src/notifications';
import {
  SplashScreen,
  LoadingScreen,
  ScreenBg,
  BG_TOP,
  TutorialScreen,
  LoginScreen,
  UsernameScreen,
  HomeScreen,
  ArenasScreen,
  ProfileScreen,
  LeaderboardScreen,
  MatchHistoryScreen,
  SearchingScreen,
  StoreScreen,
  CollectionScreen,
  FriendsScreen,
  DiamondCelebration,
  LobbyScreen,
  MatchupScreen,
  CountdownScreen,
  PickTeamScreen,
  GuessScreen,
  ResultScreen,
  OpponentForfeitModal,
  LeaderboardModal,
  MatchHistoryModal,
  FriendProfileModal,
  GameModal,
  Btn,
  MODE_LABEL,
  darken,
  withAlpha,
} from './src/screens';
import { theme, engrave } from './src/theme';
import { GemIcon } from './src/GemIcon';
import { installGlobalErrorHandlers, track } from './src/telemetry';
import type { ImageSourcePropType } from 'react-native';

type GemCelebration =
  | { kind: 'purchase'; amount: number; img?: ImageSourcePropType }
  | { kind: 'arenaReward'; amount: number; arenaName: string };

// AdMob must be initialized once at startup or no ad (incl. rewarded) will ever
// load. Native module — absent in Expo Go, so require it guarded.
let initMobileAds: (() => Promise<unknown>) | null = null;
try {
  const ads = require('react-native-google-mobile-ads');
  const mobileAds = ads.default;
  initMobileAds = () => mobileAds().initialize();
} catch {
  // native module unavailable (Expo Go) — ads disabled gracefully
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];
const { width: SCREEN_W } = Dimensions.get('window');
// Once-per-install push permission prompt marker.
const PUSH_PROMPTED_KEY = '@crossover_push_prompted';

// Where a tapped push notification wants to land. A cold-start tap fires before
// profile/loaded are ready, so the route is stashed in this module ref and
// consumed by an App effect once the app is actually navigable.
type PushRoute = { kind: 'message'; fromId: string } | { kind: 'store' } | { kind: 'reengage' };
const pendingPushRoute: { current: PushRoute | null } = { current: null };

function parsePushRoute(data: any): PushRoute | null {
  if (data?.kind === 'message' && typeof data.fromId === 'string' && data.fromId) {
    return { kind: 'message', fromId: data.fromId };
  }
  if (data?.kind === 'store') return { kind: 'store' };
  if (data?.kind === 'reengage') return { kind: 'reengage' };
  return null;
}

const TAB_DEFS: { key: string; labelKey: 'tab.store' | 'tab.collection' | 'tab.game' | 'tab.friends'; icon: IoniconName; activeIcon: IoniconName }[] = [
  { key: 'store', labelKey: 'tab.store', icon: 'storefront-outline', activeIcon: 'storefront' },
  { key: 'collection', labelKey: 'tab.collection', icon: 'albums-outline', activeIcon: 'albums' },
  { key: 'home', labelKey: 'tab.game', icon: 'football-outline', activeIcon: 'football' },
  { key: 'friends', labelKey: 'tab.friends', icon: 'people-outline', activeIcon: 'people' },
];

// Phases that show the main tab bar (non-game screens)
const TAB_PHASES = new Set(['home', 'arenas', 'leaderboard', 'matchHistory', 'profile']);

// HUD gem counter. Memoized + owns the count-anim listener, so the per-frame
// setState during gain animations re-renders ONLY this pill, never the app tree.
// The purple gain sweep is a native-driver scaleX on a left-anchored layer.
const DiamondPill = memo(function DiamondPill({ countAnim, fillAnim, pillRef, onMeasure, onPress, shownRef }: {
  countAnim: Animated.Value;
  fillAnim: Animated.Value;
  pillRef: RefObject<View | null>;
  onMeasure: () => void;
  onPress: () => void;
  // The profile's diamonds land via setValue while the pill is unmounted
  // (splash/loading gates) — seed the display from the last pushed value or
  // the counter reads 0 until the next change. A ref keeps memo() effective.
  shownRef: RefObject<number>;
}) {
  const [count, setCount] = useState(() => shownRef.current ?? 0);
  useEffect(() => {
    const id = countAnim.addListener(({ value }) => setCount(Math.max(0, Math.round(value))));
    return () => countAnim.removeListener(id);
  }, [countAnim]);
  return (
    <Pressable ref={pillRef} onLayout={onMeasure} onPress={onPress}>
      {({ pressed }) => (
        <View style={[s.hudPill, { paddingLeft: 20, paddingRight: 5, paddingVertical: 5 }, pressed && s.hudPillPressed]}>
          <Animated.View pointerEvents="none" style={[s.diamondFill, { transform: [{ scaleX: fillAnim }] }]} />
          <GemIcon size={20} />
          <Text style={s.diamondText}>{count}</Text>
          <View style={s.diamondPlus}>
            <Ionicons name="add" size={12} color={theme.ink} />
          </View>
        </View>
      )}
    </Pressable>
  );
});

// A red count badge riding a tab icon's top-right corner. Only ever rendered for a
// positive count — callers pass null when there is nothing to announce.
function TabBadge({ count }: { count: number }) {
  return (
    <View pointerEvents="none" style={s.tabBadge}>
      <Text style={s.tabBadgeText} numberOfLines={1}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}

// One tab, per the mockup: a green indicator LINE across the top edge of the active
// tab (not a pill), green icon + label when active, muted periwinkle otherwise. The
// icon spring-pops on activation and the whole tab has the standard 2px press-lip.
// `locked` renders the muted "coming soon" treatment with a gold lock mini-badge.
function TabButton({ active = false, locked = false, icon, activeIcon, label, onPress, badge }: {
  active?: boolean; locked?: boolean; icon: IoniconName; activeIcon?: IoniconName; label: string;
  onPress: () => void; badge?: number | null;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const act = useRef(new Animated.Value(active ? 1 : 0)).current;
  const iconPop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(act, { toValue: active ? 1 : 0, duration: 180, useNativeDriver: true }).start();
    if (active) {
      iconPop.setValue(0.8);
      Animated.spring(iconPop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
  }, [active, act, iconPop]);
  const color = locked ? theme.muted : active ? theme.primary : theme.muted;
  return (
    <Pressable
      style={s.tab}
      onPress={onPress}
      onPressIn={() => Animated.timing(press, { toValue: 1, duration: 60, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: 110, useNativeDriver: true }).start()}
    >
      {/* the mockup's active marker: a green rule along the tab's top edge, over a
          barely-there wash that lifts the active tab off the bar */}
      <Animated.View pointerEvents="none" style={[s.tabActiveWash, { opacity: act }]} />
      <Animated.View pointerEvents="none" style={[s.tabIndicator, { opacity: act, transform: [{ scaleX: act }] }]} />
      <Animated.View style={[s.tabInner, { opacity: locked ? 0.4 : 1, transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) }] }]}>
        <Animated.View style={{ transform: [{ scale: iconPop }] }}>
          <Ionicons name={active && activeIcon ? activeIcon : icon} size={26} color={color} />
          {locked ? (
            <View style={s.tabLock}>
              <Ionicons name="lock-closed" size={9} color={theme.ink} />
            </View>
          ) : null}
          {badge != null ? <TabBadge count={badge} /> : null}
        </Animated.View>
        <Text style={[s.tabLabel, active && s.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// The centre "Oyna" tab: a raised green ball that breaks above the bar's top edge,
// the way the mockup's does. Same press-lip physics as its flat siblings.
function PlayTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const press = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    pop.setValue(0.82);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [active, pop]);
  return (
    <Pressable
      style={s.tab}
      onPress={onPress}
      onPressIn={() => Animated.timing(press, { toValue: 1, duration: 60, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: 110, useNativeDriver: true }).start()}
    >
      <Animated.View style={[s.tabInner, { transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) }] }]}>
        <View style={s.playTabSlot}>
          <Animated.View style={[s.playTabBall, { transform: [{ translateY: -18 }, { scale: pop }] }]}>
            <Ionicons name="football" size={28} color={theme.ink} />
          </Animated.View>
        </View>
        <Text style={[s.tabLabel, active && s.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// Mini chunky circle button (lip + 2px depress) for the invite banner actions.
function InviteAction({ icon, face, lip, fg, onPress }: {
  icon: IoniconName; face: string; lip: string; fg: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      {({ pressed }) => (
        <View style={{ backgroundColor: lip, borderRadius: 21, paddingBottom: 2 }}>
          <View
            style={{
              width: 38, height: 38, borderRadius: 19, backgroundColor: face,
              borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.30)',
              alignItems: 'center', justifyContent: 'center',
              transform: [{ translateY: pressed ? 2 : 0 }],
            }}
          >
            <Ionicons name={icon} size={20} color={fg} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

// Top notification banner for an incoming friend match invite. Springs in like
// TopBanner, animates out before resolving; stays until accepted or rejected.
function InviteBanner({
  invite,
  onAccept,
  onReject,
}: {
  invite: { fromId: string; fromName: string; options?: { scope?: { type: string; value?: string }; mode?: string } };
  onAccept: () => void;
  onReject: () => void;
}) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-160)).current;
  const leavingRef = useRef(false); // one response per invite — block ✓/✕ races during the exit
  useEffect(() => {
    y.setValue(-160);
    leavingRef.current = false;
    Animated.spring(y, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, [invite.fromId, y]);
  const leave = (done: () => void) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    Animated.timing(y, { toValue: -160, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) done();
    });
  };
  // Build scope description for the banner
  let scopeDesc = '';
  const scope = invite.options?.scope;
  if (scope && scope.type !== 'all' && scope.value) {
    scopeDesc = scope.value;
  }
  const mode = invite.options?.mode;
  const modeLabel = mode === 'country-team' || mode === 'letter-team' || mode === 'team-team' || mode === 'player-player'
    ? MODE_LABEL(mode)
    : '';

  const subtitle = scopeDesc
    ? t('friends.inviteMsgScope', { scope: scopeDesc })
    : t('friends.inviteMsg');

  return (
    <Animated.View style={[s.inviteBanner, { top: insets.top + 6, transform: [{ translateY: y }] }]}>
      <Ionicons name="game-controller" size={26} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <Text style={s.inviteName} numberOfLines={1}>{invite.fromName}</Text>
        <Text style={s.inviteSub} numberOfLines={2}>{subtitle}</Text>
        {modeLabel ? <Text style={[s.inviteSub, { color: theme.accent, fontSize: 10, marginTop: 1 }]}>{modeLabel}</Text> : null}
      </View>
      <InviteAction icon="checkmark" face={theme.primary} lip={theme.primaryDark} fg={theme.ink} onPress={() => leave(onAccept)} />
      <InviteAction icon="close" face={theme.danger} lip={theme.dangerDark} fg={theme.text} onPress={() => leave(onReject)} />
    </Animated.View>
  );
}

// Transient top banner: slides down on a new friend request / message, auto-hides
// after a few seconds. Tapping it jumps to the relevant screen.
function TopBanner({
  banner,
  onPress,
  onClose,
}: {
  banner: { id: number; kind: 'friend_request' | 'message'; name: string; body?: string; userId?: string } | null;
  onPress: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-160)).current;
  const id = banner?.id;
  useEffect(() => {
    if (id == null) return;
    y.setValue(-160);
    Animated.spring(y, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }).start();
    const tm = setTimeout(() => {
      Animated.timing(y, { toValue: -160, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onClose());
    }, 4200);
    return () => clearTimeout(tm);
  }, [id]);
  if (!banner) return null;
  const isFr = banner.kind === 'friend_request';
  const sub = isFr ? t('notif.friendRequest') : (banner.body || t('notif.newMessage'));
  return (
    <Animated.View style={[s.topBanner, { top: insets.top + 6, transform: [{ translateY: y }] }]}>
      <Pressable style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, transform: [{ translateY: pressed ? 1 : 0 }], opacity: pressed ? 0.85 : 1 })} onPress={() => { onClose(); onPress(); }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.primary }}>
          <Ionicons name={isFr ? 'person-add' : 'chatbubble-ellipses'} size={20} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.inviteName} numberOfLines={1}>{banner.name}</Text>
          <Text style={s.inviteSub} numberOfLines={1}>{sub}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => ({ paddingHorizontal: 4, transform: [{ translateY: pressed ? 1 : 0 }], opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="close" size={18} color={theme.muted} />
      </Pressable>
    </Animated.View>
  );
}

// Safe-area context must wrap everything that calls useSafeAreaInsets (screens,
// banners, tab bar) — the provider lives in the default export, the app in AppRoot.
export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}

function AppRoot() {
  const insets = useSafeAreaInsets();
  const { state, actions } = useCrossover();
  const props = { state, actions };
  const scrollRef = useRef<ScrollView>(null);
  // Native-driven pager offset — powers ONLY the stadium-photo cross-fade on the
  // Oyna tab (the green pitch the home look rests on). Driven by Animated.event
  // with useNativeDriver, so no JS work happens per scroll frame.
  const scrollX = useRef(new Animated.Value(2 * SCREEN_W)).current;
  // Off-screen pages' gem pills get this throwaway ref, so only the ACTIVE page's
  // pill holds the real measured ref (the fly-to-gems target).
  const dummyPillRef = useRef<View | null>(null);
  const diamondPillRef = useRef<View>(null); // measured so purchase animations fly gems onto it
  const diamondCountAnim = useRef(new Animated.Value(0)).current;
  const diamondFillAnim = useRef(new Animated.Value(0)).current;
  const measureDiamondPill = useCallback(() => {
    diamondPillRef.current?.measureInWindow((x, y, w, h) => {
      // Aim for the inner body of the pill so flying gems visibly reach the
      // counter itself before the fill/count animation takes over.
      if (w > 0 && h > 0) setGemTarget(x + w * 0.52, y + h * 0.52);
    });
  }, []);
  const programmaticScroll = useRef(false); // true right after a tab tap — ignore scroll events
  const tabGuardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState(2); // start on Home (store=0, collection=1, home=2)
  const [splash, setSplash] = useState(true);
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false); // Clash-Royale-style entry loading (warms logo cache)
  const [storeSection, setStoreSection] = useState<'socialPack' | 'diamonds' | 'top' | null>(null);
  const storeAtDiamondsRef = useRef(false); // re-tap toggle: diamonds ↔ back to top
  const [comingSoon, setComingSoon] = useState(false); // Turnuvalar — greyed "coming soon"
  const [expiredSocialPack, setExpiredSocialPack] = useState(false); // Social Pack expired popup
  const [overlay, setOverlay] = useState<'leaderboard' | 'matchHistory' | null>(null); // centered popups
  const [gemCelebration, setGemCelebration] = useState<GemCelebration | null>(null);
  const diamondsShownRef = useRef(0); // last value pushed to the pill (fallback when profile is briefly absent)
  const csAnim = useRef(new Animated.Value(0)).current; // coming-soon pop/float
  const csTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // owns the coming-soon show/hide lifecycle
  const prevHadActiveSocialPackRef = useRef<boolean | undefined>(undefined);
  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Black': require('./assets/fonts/Poppins-Black.ttf'),
    'Poppins-ExtraBold': require('./assets/fonts/Poppins-ExtraBold.ttf'),
    'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
  const fontsReady = fontsLoaded || !!fontError; // don't get stuck if a font fails

  const [langKey, setLangKey] = useState(0); // increment to force full remount after language change
  const TABS = TAB_DEFS.map((tab) => ({ ...tab, label: t(tab.labelKey) }));

  const setDiamondDisplayInstant = useCallback((value: number) => {
    diamondCountAnim.stopAnimation();
    diamondCountAnim.setValue(value); // setValue notifies the pill's listener
    diamondsShownRef.current = Math.max(0, Math.round(value));
  }, [diamondCountAnim]);

  const animateDiamondGain = useCallback((from: number, to: number, amount: number) => {
    const safeFrom = Math.max(0, Math.round(from));
    const safeTo = Math.max(0, Math.round(to));
    const duration = Math.min(1800, Math.max(850, 450 + Math.round(Math.log10(Math.max(amount, 10)) * 520)));
    diamondCountAnim.stopAnimation();
    diamondFillAnim.stopAnimation();
    diamondCountAnim.setValue(safeFrom);
    diamondFillAnim.setValue(0);
    diamondsShownRef.current = safeTo;
    Animated.parallel([
      // Count drives a text via listener — necessarily JS-driven.
      Animated.timing(diamondCountAnim, {
        toValue: safeTo,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      // Fill sweep is transform-only (scaleX) — native driver.
      Animated.sequence([
        Animated.timing(diamondFillAnim, {
          toValue: 1,
          duration: Math.max(360, duration - 90),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(diamondFillAnim, {
          toValue: 0,
          duration: 230,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [diamondCountAnim, diamondFillAnim]);

  useEffect(() => {
    installGlobalErrorHandlers();
    track('app_start');
    // Kick off the AdMob SDK once so rewarded ads can load (no-op in Expo Go).
    initMobileAds?.().catch((e: unknown) => console.warn('AdMob init failed', e));
    // Read saved language
    AsyncStorage.getItem('@crossover_lang').then((v) => {
      if (!v) return;
      setLanguage(v);
      setLangKey((k) => k + 1);
    }).catch(() => {});
    AsyncStorage.getItem('@crossover_tutorial_seen')
      .then((v) => setTutorialSeen(v === '1'))
      .catch(() => setTutorialSeen(true));
  }, []);

  useEffect(() => {
    const diamonds = state.profile?.diamonds;
    if (typeof diamonds !== 'number') return;
    if (gemCelebration) {
      const before = Math.max(0, diamonds - gemCelebration.amount);
      setDiamondDisplayInstant(before);
      diamondFillAnim.stopAnimation();
      diamondFillAnim.setValue(0);
      requestAnimationFrame(() => requestAnimationFrame(measureDiamondPill));
      return;
    }
    setDiamondDisplayInstant(diamonds);
  }, [state.profile?.diamonds, gemCelebration, setDiamondDisplayInstant, diamondFillAnim, measureDiamondPill]);

  const handleGemCelebrationDone = useCallback(() => {
    const diamonds = state.profile?.diamonds ?? diamondsShownRef.current;
    const amount = gemCelebration?.amount ?? 0;
    setGemCelebration(null);
    animateDiamondGain(Math.max(0, diamonds - amount), diamonds, amount);
  }, [state.profile?.diamonds, gemCelebration, animateDiamondGain]);

  useEffect(() => {
    const reward = state.trophyDelta?.arenaReward ?? 0;
    const arenaName = state.trophyDelta?.arena?.name;
    if (!reward || !arenaName) return;
    setGemCelebration((current) => current ?? { kind: 'arenaReward', amount: reward, arenaName });
  }, [state.trophyDelta?.arenaReward, state.trophyDelta?.arena?.name]);

  // Re-measure the active tab's gem pill (fly-to-gems target) after each tab change —
  // only the active page's bar holds the real ref, and it won't re-layout on its own.
  useEffect(() => {
    const id = requestAnimationFrame(() => measureDiamondPill());
    return () => cancelAnimationFrame(id);
  }, [activeTab, measureDiamondPill]);

  // Auto-show Social Pack renewal popup when it has expired.
  useEffect(() => {
    const until = state.profile?.socialPackUntil;
    const hasActivePack = !!(until && new Date(until).getTime() > Date.now());
    const hadActivePack = prevHadActiveSocialPackRef.current;
    if (hadActivePack && !hasActivePack) {
      setExpiredSocialPack(true);
    }
    prevHadActiveSocialPackRef.current = hasActivePack;
  }, [state.profile?.socialPackUntil]);

  useEffect(() => {
    const until = state.profile?.socialPackUntil;
    if (!until) return;
    const expiresAt = new Date(until).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    const id = setTimeout(() => {
      prevHadActiveSocialPackRef.current = false;
      setExpiredSocialPack(true);
    }, expiresAt - Date.now() + 80);
    return () => clearTimeout(id);
  }, [state.profile?.socialPackUntil]);

  // Show the "coming soon" badge: pop in, hold, animate out, unmount. The timer ref
  // owns the whole lifecycle so a re-tap while it's visible is ignored and the hide
  // always fires (the old effect-driven version could get stuck visible). JS driver —
  // the native one-shot proved flaky here.
  const showComingSoon = useCallback(() => {
    if (csTimer.current) return; // already showing — ignore repeat taps
    setComingSoon(true);
    csAnim.setValue(0);
    Animated.spring(csAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: false }).start();
    csTimer.current = setTimeout(() => {
      Animated.timing(csAnim, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(() => {
        csTimer.current = null;
        setComingSoon(false);
      });
    }, 2200);
  }, [csAnim]);
  useEffect(() => () => { if (csTimer.current) clearTimeout(csTimer.current); }, []);

  // When switching away from the home tab, reset any home-slot sub-screen
  // (arenas, leaderboard, matchHistory, profile) back to the main home screen —
  // so swiping to Collection/Friends and back never leaves Profile open.
  const resetHomePhase = useCallback(() => {
    const p = state.phase;
    if (p === 'arenas' || p === 'leaderboard' || p === 'matchHistory' || p === 'profile') {
      actions.closeArenas(); // all close* actions do the same: _phase → home
    }
  }, [state.phase, actions]);

  const goToTab = useCallback((idx: number) => {
    // Tab taps jump INSTANTLY (no animated slide) so rapid tapping never flickers the
    // green pill across in-between pages. The guard ignores the stray scroll event the
    // jump fires, and a timer (reset on every tap) re-enables live swipe tracking once
    // the user stops tapping — onMomentumScrollEnd doesn't fire for instant scrolls.
    programmaticScroll.current = true;
    if (tabGuardTimer.current) clearTimeout(tabGuardTimer.current);
    tabGuardTimer.current = setTimeout(() => { programmaticScroll.current = false; }, 260);
    setActiveTab(idx);
    scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: false });
    storeAtDiamondsRef.current = false; // fresh tab entry → re-tap toggle starts at "diamonds"
    if (idx !== 2) resetHomePhase(); // home lives at index 2 (store=0, collection=1, home=2, friends=3)
  }, [resetHomePhase]);

  const onScrollEnd = useCallback((e: any) => {
    if (tabGuardTimer.current) clearTimeout(tabGuardTimer.current);
    programmaticScroll.current = false; // drag settled — resume live updates
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_W);
    setActiveTab(idx);
    if (idx !== 2) resetHomePhase();
  }, [resetHomePhase]);

  // Live tab tracking DURING the swipe so the bottom-nav green marker flips the
  // moment you cross a page's halfway point — not after momentum settles. Skips
  // the stray events fired by programmatic tab-tap jumps; phase reset is left to
  // onScrollEnd so mid-swipe never tears down the home sub-screen.
  const onScrollLive = useCallback((e: any) => {
    if (programmaticScroll.current) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveTab((prev) => (prev === idx || idx < 0 || idx > 3 ? prev : idx));
  }, []);

  // Leaderboard / match-history open as centered popups (App-level overlay), not fullscreen.
  const openLeaderboard = useCallback(() => { actions.openLeaderboard(); setOverlay('leaderboard'); }, [actions]);
  const openMatchHistory = useCallback(() => { actions.openMatchHistory(); setOverlay('matchHistory'); }, [actions]);
  const openDiamondStore = useCallback(() => { setStoreSection('diamonds'); goToTab(0); }, [goToTab]);
  // Home's find-friend card → Friends tab, landing focused on the add-friend search.
  // A bumped sequence (not a boolean) so every tap re-triggers the focus effect.
  const [friendsAddSeq, setFriendsAddSeq] = useState(0);
  const goToFriendSearch = useCallback(() => { setFriendsAddSeq((s) => s + 1); goToTab(3); }, [goToTab]);

  // ---- Push notifications --------------------------------------------------
  // Once-per-install permission prompt: ~2s after the user first lands on the
  // home tab (loaded && phase 'home'). The AsyncStorage key marks it shown so
  // it never nags again; declining keeps notifications off until they revisit.
  const [pushPrompt, setPushPrompt] = useState(false);
  const pushPromptChecked = useRef(false); // one arm per launch
  useEffect(() => {
    if (!loaded || state.phase !== 'home' || !state.profile || pushPromptChecked.current) return;
    pushPromptChecked.current = true;
    AsyncStorage.getItem(PUSH_PROMPTED_KEY)
      .then((v) => {
        if (v) return;
        // AppRoot stays mounted for the app's lifetime — a stray late setState is harmless.
        setTimeout(() => {
          setPushPrompt(true);
          AsyncStorage.setItem(PUSH_PROMPTED_KEY, '1').catch(() => {});
        }, 2000);
      })
      .catch(() => {});
  }, [loaded, state.phase, state.profile]);

  // Silent re-register on later launches: if permission is already granted,
  // refresh + resend the token so server-side tokens never go stale. Guarded —
  // in Expo Go getPushPermissionGranted/getPushToken resolve false/null.
  const pushRegisteredRef = useRef(false); // once per launch
  useEffect(() => {
    if (!loaded || !state.profile || pushRegisteredRef.current) return;
    pushRegisteredRef.current = true;
    getPushPermissionGranted()
      .then((granted) => { if (granted) actions.registerPush(); })
      .catch(() => {});
  }, [loaded, state.profile, actions]);

  // Badge sync: unread messages + pending friend requests. Recomputed on every
  // state change and re-pushed when the app returns to the foreground; clears
  // naturally when the counts hit 0.
  const badgeTotal =
    state.conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0) + state.friendRequests.length;
  useEffect(() => {
    setBadge(badgeTotal);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setBadge(badgeTotal); });
    return () => sub.remove();
  }, [badgeTotal]);

  // Tap routing: every tap (warm or cold-start) stashes its route in the module
  // ref and bumps a counter; the consuming effect below navigates once the app
  // is ready (loaded + profile), which also covers taps that launched the app.
  const [pushRouteSeq, setPushRouteSeq] = useState(0);
  useEffect(() => {
    const unsubscribe = addNotificationTapListener((data) => {
      const route = parsePushRoute(data);
      if (!route) return;
      pendingPushRoute.current = route;
      setPushRouteSeq((n) => n + 1);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    const route = pendingPushRoute.current;
    if (!route || !loaded || !state.profile) return;
    pendingPushRoute.current = null;
    if (route.kind === 'message') {
      goToTab(3); // friends tab
      actions.openChat(route.fromId);
    } else if (route.kind === 'store') {
      goToTab(0);
    }
    // 'reengage' → just open the app (home); nothing to navigate.
  }, [pushRouteSeq, loaded, state.profile, goToTab, actions]);

  // Splash screen: cinematic brand opening; dismisses itself via onDone.
  if (splash || !fontsReady) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <SplashScreen onDone={() => setSplash(false)} fontsReady={fontsReady} />
      </View>
    );
  }

  // Login gate: nothing is accessible until the user signs in (Apple/Google).
  // MUST come AFTER all hooks above — an early return before useCallback changes
  // the hook count between renders (Rules of Hooks) and crashes right after login.
  if (!state.profile) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ScreenBg />
        <LoginScreen state={state} actions={actions} />
      </View>
    );
  }

  // Signed in but no username yet → one-time username creation, before anything else.
  if (!state.profile.usernameSet) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ScreenBg />
        <UsernameScreen state={state} actions={actions} />
      </View>
    );
  }

  // First-time interactive tutorial (after sign-in + username, before the game).
  if (tutorialSeen === false) {
    return (
      <TutorialScreen
        onDone={() => {
          setTutorialSeen(true);
          AsyncStorage.setItem('@crossover_tutorial_seen', '1').catch(() => {});
        }}
      />
    );
  }

  // Entry loading bar (once per launch) — fills to 100% while popular club
  // crests are prefetched, so the team picker has logos ready immediately.
  if (!loaded) {
    return (
      // Full-bleed like the splash gate — LoadingScreen paints its own backdrop;
      // s.root's paddingTop:44 would inset it and show a seam at the status bar.
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <LoadingScreen state={state} actions={actions} onReady={() => setLoaded(true)} />
      </View>
    );
  }

  const showTabs = TAB_PHASES.has(state.phase);

  // Game screens (no tab bar)
  if (!showTabs) {
    let screen: ReactNode;
    switch (state.phase) {
      case 'searching':
        screen = <SearchingScreen {...props} />;
        break;
      case 'lobby':
        screen = <LobbyScreen {...props} />;
        break;
      case 'matchup':
        screen = <MatchupScreen {...props} />;
        break;
      case 'countdown':
        screen = <CountdownScreen {...props} />;
        break;
      case 'pick':
        screen = <PickTeamScreen {...props} />;
        break;
      case 'reveal':
      case 'guess':
        screen = <GuessScreen {...props} />;
        break;
      case 'result':
        screen = <ResultScreen {...props} />;
        break;
      default:
        screen = <HomeScreen {...props} />;
    }
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ScreenBg variant="match" />
        {screen}
        {state.matchInvite ? (
          <InviteBanner
            invite={state.matchInvite}
            onAccept={() => actions.respondMatchInvite(state.matchInvite!.fromId, true)}
            onReject={() => actions.respondMatchInvite(state.matchInvite!.fromId, false)}
          />
        ) : null}
        <TopBanner
          banner={state.banner}
          onClose={actions.clearBanner}
          onPress={() => goToTab(3)}
        />
        <OpponentForfeitModal
          visible={state.opponentForfeit}
          onFindNew={actions.findMatchAgain}
          onGoHome={actions.leave}
          trophyDelta={state.trophyDelta}
        />
      </View>
    );
  }

  // Main menu with tab bar + swipe
  const homeContent = state.phase === 'arenas'
    ? <ArenasScreen {...props} />
    : state.phase === 'profile'
    ? <ProfileScreen {...props} onOpenMatchHistory={openMatchHistory} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} />
    : <HomeScreen {...props} onLanguageChange={() => {
        setOverlay(null);
        setStoreSection(null);
        setActiveTab(2);
        setLoaded(false);
        setLangKey((k) => k + 1);
        actions.closeArenas();
      }} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} onOpenLeaderboard={openLeaderboard} onOpenMatchHistory={openMatchHistory} onGoToFriends={goToFriendSearch} />;

  // Shared top bar (trophies + gems), rendered INSIDE each tab page that needs it —
  // exactly like Home carries its own bar. Nothing lives outside the pager to toggle,
  // fade or resize, so a swipe is one seamless slide: no pop, no gap, no vertical jump.
  const renderResourceBar = (active: boolean) => (
    <View style={s.resourceBar}>
      <Pressable onPress={() => { actions.openArenas(); goToTab(2); }}>
        {({ pressed }) => (
          <View style={[s.hudPill, { paddingHorizontal: 24, paddingVertical: 8 }, pressed && s.hudPillPressed]}>
            <Ionicons name="trophy" size={18} color={theme.accent} />
            <Text style={s.trophyText}>{state.profile?.trophies ?? 0}</Text>
          </View>
        )}
      </Pressable>
      <DiamondPill
        countAnim={diamondCountAnim}
        fillAnim={diamondFillAnim}
        pillRef={active ? diamondPillRef : dummyPillRef}
        onMeasure={active ? measureDiamondPill : () => {}}
        onPress={openDiamondStore}
        shownRef={diamondsShownRef}
      />
    </View>
  );

  return (
    <View key={`app-${langKey}`} style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      {/* Backdrop: the calm menu weave is the always-present base; the night-stadium
          photo (the green pitch) cross-fades OVER it on the Oyna tab, driven by the
          pager's native scroll offset — so a swipe fades the pitch in/out on the
          native thread and never blanks or reloads the background. Only rendered on
          the home phase; Arenas/Profile keep the flat menu backdrop. */}
      <ScreenBg variant="menu" />
      {state.phase === 'home' ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {
            opacity: scrollX.interpolate({ inputRange: [SCREEN_W, 2 * SCREEN_W, 3 * SCREEN_W], outputRange: [0, 1, 0], extrapolate: 'clamp' }),
          }]}
        >
          <ScreenBg variant="stadium" />
        </Animated.View>
      ) : null}

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        // Lock to one axis per gesture (no vertical drift while swiping sideways).
        directionalLockEnabled
        // "always" so the pager never capture-steals the first tap / blurs a
        // descendant TextInput. Per-tab ScrollViews use "handled".
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        // Feed the raw offset to scrollX on the native thread (stadium cross-fade).
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true, listener: onScrollLive })}
        scrollEventThrottle={16}
        contentOffset={{ x: 2 * SCREEN_W, y: 0 }}
        style={{ flex: 1 }}
      >
        {/* Each page is fully self-contained: its own top bar lives INSIDE it and
            slides with it. Home shows its own bar (phase 'home'); on Arenas/Profile
            the shared bar is shown here instead. */}
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {state.profile ? renderResourceBar(activeTab === 0) : null}
          <StoreScreen {...props} scrollToSection={storeSection} onDiamondCelebration={(c) => setGemCelebration({ kind: 'purchase', amount: c.amount, img: c.img })} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {state.profile ? renderResourceBar(activeTab === 1) : null}
          <CollectionScreen {...props} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {state.phase !== 'home' && state.profile ? renderResourceBar(activeTab === 2) : null}
          {homeContent}
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {state.profile ? renderResourceBar(activeTab === 3) : null}
          <FriendsScreen {...props} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} focusAddFriendSeq={friendsAddSeq} />
        </View>
      </Animated.ScrollView>

      {/* Bottom Tab Bar */}
      <View style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* 1px top gloss just under the cardLip edge — the bar is a raised surface. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: theme.panelTopGloss }} />
        {TABS.map((tab, idx) => {
          const onPress = () => {
            if (idx === 2 && activeTab === 2) {
              // Re-tapping the active Oyna tab opens Arenas (Clash Royale style);
              // from any other home-slot sub-screen (Profile, Arenas) it returns
              // to the main home screen instead of staying put.
              if (state.phase === 'home') { actions.openArenas(); return; }
              resetHomePhase(); return;
            }
            if (idx === 0 && activeTab === 0) {
              // Re-tapping the active Store tab TOGGLES (Clash Royale style):
              // first re-tap scrolls to the diamond packs, the next one back to
              // the top. null→value retriggers the scroll effect even for repeat
              // targets; the trailing reset un-parks it for later gem-pill jumps.
              const target = storeAtDiamondsRef.current ? 'top' : 'diamonds';
              storeAtDiamondsRef.current = !storeAtDiamondsRef.current;
              setStoreSection(null);
              setTimeout(() => setStoreSection(target), 30);
              setTimeout(() => setStoreSection(null), 900);
              return;
            }
            goToTab(idx);
          };
          // The mockup's centre tab is a raised ball, not a flat icon.
          if (idx === 2) return <PlayTab key={tab.key} active={activeTab === 2} label={t(tab.labelKey)} onPress={onPress} />;
          return (
            <TabButton
              key={tab.key}
              active={idx === activeTab}
              icon={tab.icon}
              activeIcon={tab.activeIcon}
              label={t(tab.labelKey)}
              // Friends is the only tab with an honest badge source: unread messages +
              // pending requests, and it clears itself. (The mockup also badges
              // Collection, but every un-owned emote there is grant-only — that badge
              // could never be cleared, so it is deliberately not rendered.)
              badge={tab.key === 'friends' ? (badgeTotal || null) : null}
              onPress={onPress}
            />
          );
        })}
        {/* Tournaments — locked, coming soon */}
        <TabButton locked icon="trophy-outline" label={t('tab.tournaments')} onPress={showComingSoon} />
      </View>

      {/* Tournaments → standalone 3D coming-soon lettering, no bubble/background. */}
      {comingSoon ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              opacity: csAnim,
              transform: [
                { scale: csAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                { translateY: csAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
              ],
            }}
          >
            <View style={s.comingSoonWrap}>
              <Text style={s.comingSoonTextBack}>{t('common.comingSoon').toUpperCase()}</Text>
              <Text style={s.comingSoonTextMid}>{t('common.comingSoon').toUpperCase()}</Text>
              <Text style={s.comingSoonTextFront}>{t('common.comingSoon').toUpperCase()}</Text>
            </View>
          </Animated.View>
        </View>
      ) : null}

      {state.matchInvite ? (
        <InviteBanner
          invite={state.matchInvite}
          onAccept={() => actions.respondMatchInvite(state.matchInvite!.fromId, true)}
          onReject={() => actions.respondMatchInvite(state.matchInvite!.fromId, false)}
        />
      ) : null}
      <TopBanner
        banner={state.banner}
        onClose={actions.clearBanner}
        onPress={() => { const b = state.banner; if (!b) return; if (b.kind === 'friend_request') goToTab(3); else if (b.userId) actions.openChat(b.userId); }}
      />

      {/* Centered popups (leaderboard / match history) — open over everything, not fullscreen */}
      <LeaderboardModal visible={overlay === 'leaderboard'} entries={state.leaderboard} onClose={() => setOverlay(null)} onViewProfile={(userId) => actions.getUserProfile(userId)} />
      <MatchHistoryModal visible={overlay === 'matchHistory'} history={state.matchHistory} myName={state.profile?.displayName ?? ''} onClose={() => setOverlay(null)} />
      <FriendProfileModal profile={state.viewProfile} onClose={actions.closeUserProfile} />

      {gemCelebration ? (
        <DiamondCelebration
          amount={gemCelebration.amount}
          img={gemCelebration.kind === 'purchase' ? gemCelebration.img : undefined}
          variant={gemCelebration.kind === 'arenaReward' ? 'arenaReward' : 'purchase'}
          arenaName={gemCelebration.kind === 'arenaReward' ? gemCelebration.arenaName : undefined}
          onDone={handleGemCelebrationDone}
        />
      ) : null}

      {/* Expired Social Pack popup */}
      <GameModal
        visible={expiredSocialPack}
        onClose={() => setExpiredSocialPack(false)}
        title={t('socialPack.expiredTitle')}
        icon="people"
      >
        <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
          {t('socialPack.expiredBody')}
        </Text>
        <Btn
          big
          kind="accent"
          icon="people"
          label={t('common.continue')}
          onPress={() => { setExpiredSocialPack(false); setStoreSection('socialPack'); goToTab(0); }}
        />
      </GameModal>

      {/* Push permission prompt — once per install, coach-framed. */}
      <GameModal
        visible={pushPrompt}
        onClose={() => setPushPrompt(false)}
        title={t('push.promptTitle')}
        icon="notifications"
        coach
      >
        <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
          {t('push.promptBody')}
        </Text>
        <Btn
          big
          icon="notifications"
          label={t('push.enable')}
          onPress={() => { setPushPrompt(false); actions.registerPush(); }}
        />
        <Btn kind="ghost" label={t('push.later')} onPress={() => setPushPrompt(false)} />
      </GameModal>

    </View>
  );
}

const TAB_TOP_INSET = 12.5; // s.tabBar borderTopWidth (1.5) + paddingTop (11)

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_TOP }, // navy behind the patterned ScreenBg (no header seam); top inset applied via safe-area
  // The mockup's bar: a flat deep-navy slab with rounded top corners, its own
  // hairline top edge, and the content shadowed up off it.
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.tabBar,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 11,
    // Upward shadow — the bar physically sits over the content.
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -5 },
    elevation: 10,
    // The centre ball breaks above the bar; let it.
    overflow: 'visible',
  },
  tab: { flex: 1, alignItems: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, paddingHorizontal: 4, alignSelf: 'stretch' },
  // Active marker (mockup): a green rule across the tab's TOP edge, plus a faint
  // wash under it. Replaces the old opaque pill behind the icon.
  // TAB_TOP_INSET is how far s.tab's box starts below the bar's outer top edge:
  // borderTopWidth 1.5 + paddingTop 11. Both markers are pulled up by it so they land ON
  // the edge, the way the mockup draws them.
  tabIndicator: {
    position: 'absolute', top: -TAB_TOP_INSET, left: '14%', right: '14%',
    height: 3.5, borderRadius: 2, backgroundColor: theme.primary,
  },
  // Active-tab box: a clearly-defined green-tinted rounded rectangle with a border
  // (was a near-invisible 0.045 white wash) so the selected tab reads at a glance.
  tabActiveWash: {
    position: 'absolute', top: -TAB_TOP_INSET + 4, left: 6, right: 6, bottom: 5,
    borderRadius: 13,
    backgroundColor: 'rgba(22,178,122,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(22,178,122,0.55)',
  },
  tabLock: {
    position: 'absolute', top: -4, right: -8, width: 14, height: 14, borderRadius: 7,
    backgroundColor: theme.accent, borderBottomWidth: 1.5, borderBottomColor: theme.accentDark,
    alignItems: 'center', justifyContent: 'center',
  },
  tabBadge: {
    position: 'absolute', top: -6, right: -13,
    minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: theme.badgeRed,
    borderWidth: 2, borderColor: theme.tabBar,
    alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] },
  // Centre "Oyna" ball. The slot is only as tall as a normal tab icon so the label keeps
  // the same baseline as its siblings; the ball itself is absolutely placed and lifted by
  // a transform (which costs no layout) so it breaks above the bar's top edge.
  playTabSlot: { width: 48, height: 26, alignItems: 'center' },
  playTabBall: {
    position: 'absolute', bottom: 0,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: theme.primary,
    borderWidth: 3, borderColor: theme.tabBar,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tabLabel: { color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' },
  tabLabelActive: { color: theme.primary },
  comingSoonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    minWidth: 290,
  },
  comingSoonTextBack: {
    position: 'absolute',
    color: darken(theme.accentDark),
    fontSize: 34,
    fontFamily: 'Poppins-Black',
    letterSpacing: 1.6,
    textAlign: 'center',
    transform: [{ translateX: 0 }, { translateY: 9 }],
    opacity: 0.95,
  },
  comingSoonTextMid: {
    position: 'absolute',
    color: theme.accentDark,
    fontSize: 34,
    fontFamily: 'Poppins-Black',
    letterSpacing: 1.6,
    textAlign: 'center',
    transform: [{ translateX: 0 }, { translateY: 4 }],
  },
  comingSoonTextFront: {
    color: theme.gold,
    fontSize: 34,
    fontFamily: 'Poppins-Black',
    letterSpacing: 1.6,
    textAlign: 'center',
    ...engrave('lg'),
  },
  inviteBanner: {
    position: 'absolute', left: 10, right: 10, zIndex: 100, // top comes from the safe-area inset
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 16, padding: 12,
    borderWidth: 2, borderColor: theme.primary, borderBottomWidth: 4, borderBottomColor: theme.primaryDark,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 16,
  },
  topBanner: {
    position: 'absolute', left: 10, right: 10, zIndex: 110, // top comes from the safe-area inset
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.card, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 2, borderColor: theme.primary, borderBottomWidth: 4, borderBottomColor: theme.primaryDark,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 18,
  },
  inviteName: { color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 15, ...engrave('sm') },
  inviteSub: { color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold' },
  resourceBar: {
    // In-flow at the top of each tab page (like Home's own bar) — no absolute, no
    // toggle: it slides with the page and never resizes the pager or leaves a gap.
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18, // moved down — was sitting too high under the notch
    paddingBottom: 8,
  },
  // One opaque HUD counter language (spec §14 — no glass): recessed panelInnerFill
  // trough, dark top edge = sunken, bright content sits inside it.
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    minWidth: 148, // longer left↔right
    justifyContent: 'center',
    backgroundColor: theme.panelInnerFill,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: theme.border, // tek parça halka — üstte kesik yok
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  hudPillPressed: {
    backgroundColor: theme.bg2, // fill brightens
    transform: [{ translateY: 1 }],
  },
  trophyText: {
    color: theme.gold,
    fontSize: 15,
    fontFamily: 'Poppins-Black',
    ...engrave('sm'),
  },
  // Left-anchored gain sweep: full-width layer scaled from 0 via scaleX (native driver).
  diamondFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    transformOrigin: 'left',
    backgroundColor: withAlpha(theme.gem, 0.24),
  },
  diamondText: {
    color: theme.gemText,
    fontSize: 15,
    fontFamily: 'Poppins-ExtraBold',
    ...engrave('sm'),
  },
  diamondPlus: {
    backgroundColor: theme.primary,
    borderRadius: 11,
    width: 22,
    height: 22,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.30)',
    borderBottomWidth: 2,
    borderBottomColor: theme.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
