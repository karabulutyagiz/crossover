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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCrossover } from './src/useCrossover';
import { t } from './src/i18n';
import {
  SplashScreen,
  IntroScreen,
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
  FriendsScreen,
  LobbyScreen,
  CountdownScreen,
  PickTeamScreen,
  GuessScreen,
  ResultScreen,
} from './src/screens';
import { theme } from './src/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
const { width: SCREEN_W } = Dimensions.get('window');

const TABS: { key: string; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { key: 'store', label: t('tab.store'), icon: 'diamond-outline', activeIcon: 'diamond' },
  { key: 'home', label: t('tab.game'), icon: 'football-outline', activeIcon: 'football' },
  { key: 'friends', label: t('tab.friends'), icon: 'people-outline', activeIcon: 'people' },
];

// Phases that show the main tab bar (non-game screens)
const TAB_PHASES = new Set(['home', 'arenas', 'leaderboard', 'matchHistory', 'profile']);

export default function App() {
  const { state, actions } = useCrossover();
  const props = { state, actions };
  const scrollRef = useRef<ScrollView>(null);
  const [activeTab, setActiveTab] = useState(1); // start on Home (index 1)
  const [splash, setSplash] = useState(true);
  const [introSeen, setIntroSeen] = useState<boolean | null>(null); // null = still loading
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1900);
    AsyncStorage.getItem('@crossover_intro_seen')
      .then((v) => setIntroSeen(v === '1'))
      .catch(() => setIntroSeen(true));
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

  // Splash screen: show COF logo on launch (also while we read the intro flag).
  if (splash || introSeen === null) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <SplashScreen />
      </View>
    );
  }

  // First launch: swipeable intro / onboarding. Shown once.
  if (introSeen === false) {
    return (
      <IntroScreen
        onDone={() => {
          setIntroSeen(true);
          AsyncStorage.setItem('@crossover_intro_seen', '1').catch(() => {});
        }}
      />
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

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        contentOffset={{ x: SCREEN_W, y: 0 }}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <StoreScreen {...props} />
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
              <Ionicons
                name={active ? tab.activeIcon : tab.icon}
                size={22}
                color={active ? theme.primary : theme.muted}
              />
              <Text style={[s.tabLabel, active && { color: theme.primary }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabLabel: { color: theme.muted, fontSize: 10, fontWeight: '600' },
});
