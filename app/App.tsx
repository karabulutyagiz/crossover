import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Dimensions,
  Image,
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
import { t } from './src/i18n';
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
  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Black': require('./assets/fonts/Poppins-Black.ttf'),
    'Poppins-ExtraBold': require('./assets/fonts/Poppins-ExtraBold.ttf'),
    'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
  const fontsReady = fontsLoaded || !!fontError; // don't get stuck if a font fails

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1900);
    AsyncStorage.getItem('@crossover_tutorial_seen')
      .then((v) => setTutorialSeen(v === '1'))
      .catch(() => setTutorialSeen(true));
    return () => clearTimeout(t);
  }, []);

  const goToTab = useCallback((idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
    setActiveTab(idx);
  }, []);

  const onScrollEnd = useCallback((e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_W);
    setActiveTab(idx);
  }, []);

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
    : <HomeScreen {...props} />;

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Top bar — trophies (left, standalone) + diamonds pill (right) */}
      {state.profile ? (
        <View style={s.resourceBar}>
          <View style={s.trophyGroup}>
            <Ionicons name="trophy" size={16} color={theme.accent} />
            <Text style={s.trophyText}>{state.profile.trophies}</Text>
          </View>
          <Pressable style={s.diamondPill} onPress={() => goToTab(0)}>
            <GemIcon size={16} />
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
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <StoreScreen {...props} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <CollectionScreen {...props} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {homeContent}
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <FriendsScreen {...props} />
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
      </View>

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
    paddingBottom: 4,
  },
  trophyGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trophyText: {
    color: '#F5C518',
    fontSize: 14,
    fontWeight: '900',
  },
  diamondPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#151C30',
    borderRadius: 14,
    paddingLeft: 8,
    paddingRight: 2,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#26304A',
  },
  diamondText: {
    color: '#C084FC',
    fontSize: 13,
    fontWeight: '800',
  },
  diamondPlus: {
    backgroundColor: '#3DDC84',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
