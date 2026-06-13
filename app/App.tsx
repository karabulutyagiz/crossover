import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCrossover } from './src/useCrossover';
import { t, setLanguage } from './src/i18n';
import {
  SplashScreen,
  LoadingScreen,
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
  LobbyScreen,
  CountdownScreen,
  PickTeamScreen,
  GuessScreen,
  ResultScreen,
} from './src/screens';
import { theme } from './src/theme';
import { GemIcon, GEM_COLOR } from './src/GemIcon';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
const { width: SCREEN_W } = Dimensions.get('window');

const TABS: { key: string; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { key: 'store', label: t('tab.store'), icon: 'storefront-outline', activeIcon: 'storefront' },
  { key: 'collection', label: t('tab.collection'), icon: 'albums-outline', activeIcon: 'albums' },
  { key: 'home', label: t('tab.game'), icon: 'football-outline', activeIcon: 'football' },
  { key: 'friends', label: t('tab.friends'), icon: 'people-outline', activeIcon: 'people' },
];

// Phases that show the main tab bar (non-game screens)
const TAB_PHASES = new Set(['home', 'arenas', 'leaderboard', 'matchHistory', 'profile']);

// Top notification banner for an incoming friend match invite. Stays until
// the user accepts or rejects; rendered over every screen.
function InviteBanner({
  invite,
  onAccept,
  onReject,
}: {
  invite: { fromId: string; fromName: string };
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <View style={s.inviteBanner}>
      <Ionicons name="game-controller" size={26} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <Text style={s.inviteName} numberOfLines={1}>{invite.fromName}</Text>
        <Text style={s.inviteSub}>Seni dostluk maçına davet etti</Text>
      </View>
      <Pressable onPress={onAccept} style={[s.inviteBtn, { backgroundColor: theme.primary }]} hitSlop={6}>
        <Ionicons name="checkmark" size={20} color="#06131F" />
      </Pressable>
      <Pressable onPress={onReject} style={[s.inviteBtn, { backgroundColor: theme.danger }]} hitSlop={6}>
        <Ionicons name="close" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

export default function App() {
  const { state, actions } = useCrossover();
  const props = { state, actions };
  const scrollRef = useRef<ScrollView>(null);
  const [activeTab, setActiveTab] = useState(2); // start on Home (store=0, collection=1, home=2)
  const [splash, setSplash] = useState(true);
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false); // Clash-Royale-style entry loading (warms logo cache)
  const [storeSection, setStoreSection] = useState<'socialPack' | 'diamonds' | null>(null);
  const [comingSoon, setComingSoon] = useState(false); // Turnuvalar — greyed "coming soon"
  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Black': require('./assets/fonts/Poppins-Black.ttf'),
    'Poppins-ExtraBold': require('./assets/fonts/Poppins-ExtraBold.ttf'),
    'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
  const fontsReady = fontsLoaded || !!fontError; // don't get stuck if a font fails

  const [langKey, setLangKey] = useState(0); // increment to force full remount after language change

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1900);
    // Read saved language
    AsyncStorage.getItem('@crossover_lang').then((v) => { if (v) setLanguage(v); }).catch(() => {});
    AsyncStorage.getItem('@crossover_tutorial_seen')
      .then((v) => setTutorialSeen(v === '1'))
      .catch(() => setTutorialSeen(true));
    return () => clearTimeout(t);
  }, []);

  // When switching away from the home tab, reset sub-screens (arenas, leaderboard, matchHistory) to home
  const resetHomePhase = useCallback(() => {
    const p = state.phase;
    if (p === 'arenas' || p === 'leaderboard' || p === 'matchHistory') {
      actions.closeArenas(); // all three close* actions do the same: _phase → home
    }
  }, [state.phase, actions]);

  const goToTab = useCallback((idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
    setActiveTab(idx);
    if (idx !== 2) resetHomePhase(); // home lives at index 2 (store=0, collection=1, home=2, friends=3)
  }, [resetHomePhase]);

  const onScrollEnd = useCallback((e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_W);
    setActiveTab(idx);
    if (idx !== 2) resetHomePhase();
  }, [resetHomePhase]);

  // Swipe (any horizontal direction) to dismiss a sub-screen back to home, with
  // an animated slide/fade transition (no abrupt "refresh" jump). Keep the latest
  // action in a ref so the once-created PanResponder never goes stale.
  const slide = useRef(new Animated.Value(0)).current; // -1 entering-from-left · 0 idle · 1 leaving-right
  const backActionRef = useRef<() => void>(() => {});
  backActionRef.current = () => {
    Animated.timing(slide, { toValue: 1, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      actions.closeArenas(); // phase → home (content swaps to HomeScreen)
      slide.setValue(-1);
      Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
  };
  const slotTx = slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [-SCREEN_W * 0.28, 0, SCREEN_W * 0.28] });
  const slotOpacity = slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] });
  const backSwipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 26 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderRelease: (_e, g) => { if (Math.abs(g.dx) > 55) backActionRef.current(); },
    }),
  ).current;

  // Splash screen: show COF logo on launch.
  if (splash || !fontsReady) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <SplashScreen />
      </View>
    );
  }

  // Login gate: nothing is accessible until the user signs in (Apple/Google).
  // MUST come AFTER all hooks above — an early return before useCallback changes
  // the hook count between renders (Rules of Hooks) and crashes right after login.
  if (!state.profile) {
    return (
      <View style={s.root}>
        <StatusBar style="light" />
        <LoginScreen state={state} actions={actions} />
      </View>
    );
  }

  // Signed in but no username yet → one-time username creation, before anything else.
  if (!state.profile.usernameSet) {
    return (
      <View style={s.root}>
        <StatusBar style="light" />
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
      <View style={s.root}>
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
      <View style={s.root}>
        <StatusBar style="light" />
        {screen}
        {state.matchInvite ? (
          <InviteBanner
            invite={state.matchInvite}
            onAccept={() => actions.respondMatchInvite(state.matchInvite!.fromId, true)}
            onReject={() => actions.respondMatchInvite(state.matchInvite!.fromId, false)}
          />
        ) : null}
      </View>
    );
  }

  // Main menu with tab bar + swipe
  const homeContent = state.phase === 'arenas'
    ? <ArenasScreen {...props} />
    : state.phase === 'leaderboard'
    ? <LeaderboardScreen {...props} />
    : state.phase === 'matchHistory'
    ? <MatchHistoryScreen {...props} />
    : state.phase === 'profile'
    ? <ProfileScreen {...props} />
    : <HomeScreen {...props} onLanguageChange={() => { setLoaded(false); setLangKey((k) => k + 1); }} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} />;
  // A sub-screen is open in the home slot → swipe dismisses it (pager paging off).
  const subScreen = state.phase !== 'home' && TAB_PHASES.has(state.phase);

  return (
    <View key={`app-${langKey}`} style={s.root}>
      <StatusBar style="light" />

      {/* Top bar — trophies (left) + gems pill (right) */}
      {state.profile ? (
        <View style={s.resourceBar}>
          <View style={s.trophyPill}>
            <Ionicons name="trophy" size={18} color={theme.accent} />
            <Text style={s.trophyText}>{state.profile.trophies}</Text>
          </View>
          <Pressable style={s.diamondPill} onPress={() => { setStoreSection('diamonds'); goToTab(0); }}>
            <GemIcon size={20} />
            <Text style={s.diamondText}>{state.profile.diamonds}</Text>
            <View style={s.diamondPlus}>
              <Ionicons name="add" size={12} color="#fff" />
            </View>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        contentOffset={{ x: 2 * SCREEN_W, y: 0 }}
        scrollEnabled={!subScreen}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <StoreScreen {...props} scrollToSection={storeSection} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <CollectionScreen {...props} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }} {...(subScreen ? backSwipe.panHandlers : {})}>
          <Animated.View style={{ flex: 1, opacity: slotOpacity, transform: [{ translateX: slotTx }] }}>
            {homeContent}
          </Animated.View>
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <FriendsScreen {...props} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} />
        </View>
      </ScrollView>

      {/* Bottom Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map((tab, idx) => {
          const active = idx === activeTab;
          return (
            <Pressable key={tab.key} style={s.tab} onPress={() => goToTab(idx)}>
              <View style={[s.tabInner, active && s.tabInnerActive]}>
                <Ionicons
                  name={active ? tab.activeIcon : tab.icon}
                  size={active ? 25 : 22}
                  color={active ? theme.primary : theme.muted}
                />
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>
                  {tab.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {/* Tournaments — greyed, coming soon */}
        <Pressable style={s.tab} onPress={() => setComingSoon(true)}>
          <View style={s.tabInner}>
            <Ionicons name="trophy-outline" size={22} color={theme.border} />
            <Text style={[s.tabLabel, { color: theme.border }]}>Turnuvalar</Text>
          </View>
        </Pressable>
      </View>

      <Modal visible={comingSoon} transparent animationType="fade" onRequestClose={() => setComingSoon(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(6,10,28,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 }} onPress={() => setComingSoon(false)}>
          <View style={{ backgroundColor: theme.card, borderRadius: 18, borderWidth: 1.5, borderColor: theme.border, paddingVertical: 26, paddingHorizontal: 30, alignItems: 'center', gap: 8 }}>
            <Ionicons name="trophy" size={40} color={theme.accent} />
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 19 }}>Turnuvalar</Text>
            <Text style={{ color: theme.muted, fontSize: 13.5, fontWeight: '600' }}>Çok yakında!</Text>
          </View>
        </Pressable>
      </Modal>

      {state.matchInvite ? (
        <InviteBanner
          invite={state.matchInvite}
          onAccept={() => actions.respondMatchInvite(state.matchInvite!.fromId, true)}
          onReject={() => actions.respondMatchInvite(state.matchInvite!.fromId, false)}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  splashLogo: { width: 120, height: 120, borderRadius: 28 },
  root: { flex: 1, backgroundColor: theme.bg, paddingTop: 44 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.card,
    paddingBottom: 20,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 18, borderRadius: 16 },
  tabInnerActive: { backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  tabLabel: { color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold' },
  tabLabelActive: { color: theme.primary },
  inviteBanner: {
    position: 'absolute', top: 50, left: 10, right: 10, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 16, padding: 12,
    borderWidth: 1.5, borderColor: theme.primary,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 14,
  },
  inviteName: { color: theme.text, fontWeight: '800', fontSize: 15 },
  inviteSub: { color: theme.muted, fontSize: 11.5 },
  inviteBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  resourceBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18, // moved down — was sitting too high under the notch
    paddingBottom: 8,
  },
  trophyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 96, // longer frame (Clash-Royale-style)
    justifyContent: 'center',
    backgroundColor: '#151C30',
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#3A4570',
  },
  trophyText: {
    color: '#F5C518',
    fontSize: 15,
    fontWeight: '900',
  },
  diamondPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 96, // longer frame to match the trophy pill
    backgroundColor: '#151C30',
    borderRadius: 15,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#3A4570',
  },
  diamondText: {
    color: '#C084FC',
    fontSize: 15,
    fontWeight: '800',
  },
  diamondPlus: {
    backgroundColor: '#3DDC84',
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
