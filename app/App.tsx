import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  Dimensions,
  Easing,
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
import { t, setLanguage } from './src/i18n';
import { setGemTarget } from './src/gemTarget';
import {
  SplashScreen,
  LoadingScreen,
  ScreenBg,
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
  MatchupScreen,
  CountdownScreen,
  PickTeamScreen,
  GuessScreen,
  ResultScreen,
  OpponentForfeitModal,
  LeaderboardModal,
  MatchHistoryModal,
} from './src/screens';
import { theme, engrave } from './src/theme';
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
  invite: { fromId: string; fromName: string; options?: { scope?: { type: string; value?: string }; mode?: string } };
  onAccept: () => void;
  onReject: () => void;
}) {
  // Build scope description for the banner
  let scopeDesc = '';
  const scope = invite.options?.scope;
  if (scope && scope.type !== 'all' && scope.value) {
    scopeDesc = scope.value;
  }
  const mode = invite.options?.mode;
  const modeLabel = mode === 'country-team' ? 'Ülke-Takım' : mode === 'letter-team' ? 'Harf-Takım' : '';

  const subtitle = scopeDesc
    ? t('friends.inviteMsgScope', { scope: scopeDesc })
    : t('friends.inviteMsg');

  return (
    <View style={s.inviteBanner}>
      <Ionicons name="game-controller" size={26} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <Text style={s.inviteName} numberOfLines={1}>{invite.fromName}</Text>
        <Text style={s.inviteSub} numberOfLines={2}>{subtitle}</Text>
        {modeLabel ? <Text style={[s.inviteSub, { color: theme.accent, fontSize: 10, marginTop: 1 }]}>{modeLabel}</Text> : null}
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
  const diamondPillRef = useRef<View>(null); // measured so purchase animations fly gems onto it
  const measureDiamondPill = useCallback(() => {
    diamondPillRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) setGemTarget(x + w / 2, y + h / 2);
    });
  }, []);
  const programmaticScroll = useRef(false); // true right after a tab tap — ignore scroll events
  const tabGuardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState(2); // start on Home (store=0, collection=1, home=2)
  const [splash, setSplash] = useState(true);
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false); // Clash-Royale-style entry loading (warms logo cache)
  const [storeSection, setStoreSection] = useState<'socialPack' | 'diamonds' | null>(null);
  const [comingSoon, setComingSoon] = useState(false); // Turnuvalar — greyed "coming soon"
  const [overlay, setOverlay] = useState<'leaderboard' | 'matchHistory' | null>(null); // centered popups
  const csAnim = useRef(new Animated.Value(0)).current; // coming-soon pop/float
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

  // Pop the "coming soon" badge in, then auto-hide.
  useEffect(() => {
    if (!comingSoon) return;
    csAnim.setValue(0);
    Animated.spring(csAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    const id = setTimeout(() => setComingSoon(false), 1700);
    return () => clearTimeout(id);
  }, [comingSoon, csAnim]);

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

  // Leaderboard / match-history open as centered popups (App-level overlay), not fullscreen.
  const openLeaderboard = useCallback(() => { actions.openLeaderboard(); setOverlay('leaderboard'); }, [actions]);
  const openMatchHistory = useCallback(() => { actions.openMatchHistory(); setOverlay('matchHistory'); }, [actions]);

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
        <ScreenBg />
        <LoginScreen state={state} actions={actions} />
      </View>
    );
  }

  // Signed in but no username yet → one-time username creation, before anything else.
  if (!state.profile.usernameSet) {
    return (
      <View style={s.root}>
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
      <View style={s.root}>
        <StatusBar style="light" />
        <ScreenBg />
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
      <View style={s.root}>
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
        <OpponentForfeitModal
          visible={state.opponentForfeit}
          onFindNew={actions.findMatchAgain}
          onGoHome={actions.leave}
        />
      </View>
    );
  }

  // Main menu with tab bar + swipe
  const homeContent = state.phase === 'arenas'
    ? <ArenasScreen {...props} />
    : state.phase === 'profile'
    ? <ProfileScreen {...props} onOpenMatchHistory={openMatchHistory} />
    : <HomeScreen {...props} onLanguageChange={() => { setLangKey((k) => k + 1); }} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} onOpenLeaderboard={openLeaderboard} onOpenMatchHistory={openMatchHistory} />;

  // Per-tab background: Oyna/home = blue arena backdrop, Mağaza = violet, others = calm navy.
  const bgVariant = (activeTab === 0 ? 'store' : activeTab === 2 && state.phase === 'home' ? 'home' : 'menu') as 'store' | 'home' | 'menu';

  return (
    <View key={`app-${langKey}`} style={s.root}>
      <StatusBar style="light" />
      <ScreenBg variant={bgVariant} />

      {/* Top bar — trophies (left) + gems pill (right) */}
      {state.profile ? (
        <View style={s.resourceBar}>
          <View style={s.trophyPill}>
            <View style={s.glassSheen} pointerEvents="none" />
            <Ionicons name="trophy" size={18} color={theme.accent} />
            <Text style={s.trophyText}>{state.profile.trophies}</Text>
          </View>
          <Pressable ref={diamondPillRef} onLayout={measureDiamondPill} style={s.diamondPill} onPress={() => { setStoreSection('diamonds'); goToTab(0); }}>
            <View style={s.glassSheen} pointerEvents="none" />
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
        onScroll={(e) => {
          if (programmaticScroll.current) return; // tab tap in progress — don't flicker through pages
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          if (idx !== activeTab) setActiveTab(idx);
        }}
        scrollEventThrottle={16}
        contentOffset={{ x: 2 * SCREEN_W, y: 0 }}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <StoreScreen {...props} scrollToSection={storeSection} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          <CollectionScreen {...props} />
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {homeContent}
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
            <Pressable
              key={tab.key}
              style={s.tab}
              onPress={() => {
                if (idx === 2 && activeTab === 2) {
                  // Re-tapping the active Oyna tab opens Arenas (Clash Royale style);
                  // from any other home-slot sub-screen (Profile, Arenas) it returns
                  // to the main home screen instead of staying put.
                  if (state.phase === 'home') { actions.openArenas(); return; }
                  resetHomePhase(); return;
                }
                goToTab(idx);
              }}
            >
              <View style={[s.tabInner, active && s.tabInnerActive]}>
                <Ionicons
                  name={active ? tab.activeIcon : tab.icon}
                  size={active ? 30 : 26}
                  color={active ? theme.primary : theme.muted}
                />
                <Text style={[s.tabLabel, active && s.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {tab.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {/* Tournaments — greyed, coming soon */}
        <Pressable style={s.tab} onPress={() => setComingSoon(true)}>
          <View style={s.tabInner}>
            <Ionicons name="trophy-outline" size={26} color={theme.border} />
            <Text style={[s.tabLabel, { color: theme.border }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('tab.tournaments')}</Text>
          </View>
        </Pressable>
      </View>

      {/* Tournaments → a raised rectangular "coming soon" badge that pops in with a deep shadow */}
      {comingSoon ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '42%', alignItems: 'center' }}>
          <Animated.View
            style={{
              opacity: csAnim,
              transform: [
                { scale: csAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                { translateY: csAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
              ],
            }}
          >
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 11,
              backgroundColor: theme.card, borderRadius: 16,
              paddingVertical: 16, paddingHorizontal: 26,
              borderWidth: 2, borderColor: theme.frameGold,
              borderBottomWidth: 5, borderBottomColor: theme.frameGoldDark,
              borderTopColor: theme.panelTopGloss,
              shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 16 }, elevation: 24,
            }}>
              <Ionicons name="time" size={22} color={theme.accent} />
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 21, letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }}>
                {t('common.comingSoon')}
              </Text>
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

      {/* Centered popups (leaderboard / match history) — open over everything, not fullscreen */}
      <LeaderboardModal visible={overlay === 'leaderboard'} entries={state.leaderboard} onClose={() => setOverlay(null)} />
      <MatchHistoryModal visible={overlay === 'matchHistory'} history={state.matchHistory} myName={state.profile?.displayName ?? ''} onClose={() => setOverlay(null)} />

    </View>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  splashLogo: { width: 120, height: 120, borderRadius: 28 },
  root: { flex: 1, backgroundColor: '#0E2347', paddingTop: 44 }, // navy behind the patterned ScreenBg (no header seam)
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderTopColor: theme.cardLip,
    backgroundColor: theme.bg2,
    paddingBottom: 24,
    paddingTop: 13,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 16, alignSelf: 'stretch' },
  tabInnerActive: {
    backgroundColor: '#0E1838',
    borderWidth: 1,
    borderColor: theme.primary,
    shadowColor: theme.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  tabLabel: { color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' },
  tabLabelActive: { color: theme.primary },
  inviteBanner: {
    position: 'absolute', top: 50, left: 10, right: 10, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 16, padding: 12,
    borderWidth: 2, borderColor: theme.frameGold, borderBottomWidth: 4, borderBottomColor: theme.frameGoldDark,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 16,
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
  glassSheen: {
    // Top-half highlight that fakes light reflecting off curved glass.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  trophyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 148, // longer left↔right
    justifyContent: 'center',
    backgroundColor: 'rgba(228,238,255,0.13)', // true glass — bg pattern shows through
    borderRadius: 19,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)', // bright glass rim
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.95)', // top edge catches the most light
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  trophyText: {
    color: theme.gold,
    fontSize: 15,
    fontFamily: 'Poppins-Black',
    ...engrave('sm'),
  },
  diamondPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 148, // longer left↔right
    justifyContent: 'center',
    backgroundColor: 'rgba(228,238,255,0.13)', // true glass — bg pattern shows through
    borderRadius: 19,
    paddingLeft: 20,
    paddingRight: 5,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)', // bright glass rim
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.95)', // top edge catches the most light
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
    borderTopColor: 'rgba(255,255,255,0.6)',
    borderBottomWidth: 2,
    borderBottomColor: theme.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
