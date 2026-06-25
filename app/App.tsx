import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
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
  FriendProfileModal,
} from './src/screens';
import { theme, engrave } from './src/theme';
import { GemIcon, GEM_COLOR } from './src/GemIcon';

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

const TAB_DEFS: { key: string; labelKey: 'tab.store' | 'tab.collection' | 'tab.game' | 'tab.friends'; icon: IoniconName; activeIcon: IoniconName }[] = [
  { key: 'store', labelKey: 'tab.store', icon: 'storefront-outline', activeIcon: 'storefront' },
  { key: 'collection', labelKey: 'tab.collection', icon: 'albums-outline', activeIcon: 'albums' },
  { key: 'home', labelKey: 'tab.game', icon: 'football-outline', activeIcon: 'football' },
  { key: 'friends', labelKey: 'tab.friends', icon: 'people-outline', activeIcon: 'people' },
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
    <Animated.View style={[s.topBanner, { transform: [{ translateY: y }] }]}>
      <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }} onPress={() => { onClose(); onPress(); }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.primary }}>
          <Ionicons name={isFr ? 'person-add' : 'chatbubble-ellipses'} size={20} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.inviteName} numberOfLines={1}>{banner.name}</Text>
          <Text style={s.inviteSub} numberOfLines={1}>{sub}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={8} style={{ paddingHorizontal: 4 }}>
        <Ionicons name="close" size={18} color={theme.muted} />
      </Pressable>
    </Animated.View>
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
  const [expiredSocialPack, setExpiredSocialPack] = useState(false); // Social Pack expired popup
  const [overlay, setOverlay] = useState<'leaderboard' | 'matchHistory' | null>(null); // centered popups
  const csAnim = useRef(new Animated.Value(0)).current; // coming-soon pop/float
  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Black': require('./assets/fonts/Poppins-Black.ttf'),
    'Poppins-ExtraBold': require('./assets/fonts/Poppins-ExtraBold.ttf'),
    'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
  const fontsReady = fontsLoaded || !!fontError; // don't get stuck if a font fails

  const [langKey, setLangKey] = useState(0); // increment to force full remount after language change
  const TABS = TAB_DEFS.map((tab) => ({ ...tab, label: t(tab.labelKey) }));

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1900);
    // Kick off the AdMob SDK once so rewarded ads can load (no-op in Expo Go).
    initMobileAds?.().catch((e: unknown) => console.warn('AdMob init failed', e));
    // Read saved language
    AsyncStorage.getItem('@crossover_lang').then((v) => { if (v) setLanguage(v); }).catch(() => {});
    AsyncStorage.getItem('@crossover_tutorial_seen')
      .then((v) => setTutorialSeen(v === '1'))
      .catch(() => setTutorialSeen(true));
    return () => clearTimeout(t);
  }, []);

  // Auto-show Social Pack renewal popup when it has expired.
  useEffect(() => {
    const until = state.profile?.socialPackUntil;
    if (until && new Date(until) <= new Date()) {
      setExpiredSocialPack(true);
    }
  }, [state.profile?.socialPackUntil]);

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
        <TopBanner
          banner={state.banner}
          onClose={actions.clearBanner}
          onPress={() => goToTab(3)}
        />
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
    ? <ProfileScreen {...props} onOpenMatchHistory={openMatchHistory} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} />
    : <HomeScreen {...props} onLanguageChange={() => {
        setOverlay(null);
        setStoreSection(null);
        setActiveTab(2);
        setLoaded(false);
        setLangKey((k) => k + 1);
        actions.closeArenas();
      }} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} onOpenLeaderboard={openLeaderboard} onOpenMatchHistory={openMatchHistory} />;

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
            <Image
              source={require('./assets/cokyakinda.png')}
              style={{ width: 288, height: 288 * (818 / 1923) }}
              resizeMode="contain"
            />
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
      <LeaderboardModal visible={overlay === 'leaderboard'} entries={state.leaderboard} friends={state.friends} onClose={() => setOverlay(null)} onViewProfile={(userId) => actions.getUserProfile(userId)} onSendFriendRequest={(userId) => actions.sendFriendRequest(userId.slice(0, 8))} />
      <MatchHistoryModal visible={overlay === 'matchHistory'} history={state.matchHistory} myName={state.profile?.displayName ?? ''} onClose={() => setOverlay(null)} />
      <FriendProfileModal profile={state.viewProfile} onClose={actions.closeUserProfile} />

      {/* Expired Social Pack popup */}
      <Modal visible={expiredSocialPack} transparent animationType="fade" onRequestClose={() => setExpiredSocialPack(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <View style={{ width: '100%', maxWidth: 340, backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.frameGold, overflow: 'hidden' }}>
            {/* Close button top-right */}
            <Pressable onPress={() => setExpiredSocialPack(false)} hitSlop={10} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={theme.muted} />
            </Pressable>
            <View style={{ alignItems: 'center', paddingTop: 28, paddingHorizontal: 20, paddingBottom: 20 }}>
              <Ionicons name="people" size={40} color={theme.accent} />
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 18, marginTop: 12, textAlign: 'center' }}>Sosyal Paket Sona Erdi</Text>
              <Text style={{ color: theme.muted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 8 }}>
                Sosyal paketin süresi doldu. Arkadaşlarınla ülke-takım ve harf-takım modlarında oynamaya devam etmek için paketini yenile.
              </Text>
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>
              <Pressable
                onPress={() => { setExpiredSocialPack(false); setStoreSection('socialPack'); goToTab(0); }}
                style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#C68A0E' }}
              >
                <Text style={{ color: '#06131F', fontFamily: 'Poppins-ExtraBold', fontSize: 15 }}>Devam Et</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
  topBanner: {
    position: 'absolute', top: 50, left: 10, right: 10, zIndex: 110,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.card, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 2, borderColor: theme.primary, borderBottomWidth: 4, borderBottomColor: theme.primaryDark,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 18,
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
