import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '../app/node_modules/@expo/vector-icons';
import { useFonts } from '../app/node_modules/expo-font';
import AsyncStorage from '../app/node_modules/@react-native-async-storage/async-storage';
import Svg, { Defs, LinearGradient as SvgGradient, Line, RadialGradient, Rect, Stop } from '../app/node_modules/react-native-svg';
import { useCrossover } from '../app/src/useCrossover';
import { setLanguage, t } from '../app/src/i18n';
import {
  TutorialScreen,
  LoginScreen,
  UsernameScreen,
  ArenasScreen,
  ProfileScreen,
  SearchingScreen,
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
} from '../app/src/screens';
import { theme, engrave } from '../app/src/theme';
import { GemIcon } from '../app/src/GemIcon';
import { installGlobalErrorHandlers, track } from '../app/src/telemetry';

const HOME_PHASES = new Set(['home', 'arenas', 'profile']);

function UnifiedBg() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.unifiedBgBase} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="webappShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.05} />
            <Stop offset="0.18" stopColor="#ffffff" stopOpacity={0.02} />
            <Stop offset="0.82" stopColor="#0A1841" stopOpacity={0.02} />
            <Stop offset="1" stopColor="#0A1841" stopOpacity={0.08} />
          </SvgGradient>
        </Defs>

        {Array.from({ length: 70 }).map((_, i) => {
          const offset = -1800 + i * 120;
          return (
            <Line
              key={`diag-a-${i}`}
              x1={offset}
              y1="0"
              x2={offset + 2600}
              y2="2600"
              stroke="rgba(255,255,255,0.075)"
              strokeWidth="2"
            />
          );
        })}

        {Array.from({ length: 70 }).map((_, i) => {
          const offset = -800 + i * 120;
          return (
            <Line
              key={`diag-b-${i}`}
              x1={offset}
              y1="2600"
              x2={offset + 2600}
              y2="0"
              stroke="rgba(255,255,255,0.045)"
              strokeWidth="2"
            />
          );
        })}

        <Rect x="0" y="0" width="100%" height="100%" fill="url(#webappShade)" />
      </Svg>
    </View>
  );
}

function HomeStadiumGlow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="stadiumGlow" cx="50%" cy="42%" rx="24%" ry="16%">
            <Stop offset="0" stopColor="#A8C6FF" stopOpacity={0.16} />
            <Stop offset="0.42" stopColor="#7EA9FF" stopOpacity={0.08} />
            <Stop offset="0.72" stopColor="#4C73C8" stopOpacity={0.03} />
            <Stop offset="1" stopColor="#4C73C8" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#stadiumGlow)" />
      </Svg>
    </View>
  );
}

function WebLoadingScreen({ pct }: { pct: number }) {
  return (
    <View style={styles.loadingWrap}>
      <View style={styles.loadingHeader}>
        <View style={styles.loadingLogoShell}>
          <Image source={require('../app/assets/splash-icon.png')} style={styles.loadingLogo} resizeMode="contain" />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={styles.loadingTitle}>CROSSOVER</Text>
      </View>

      <View style={styles.loadingDock}>
        <View style={styles.loadingBarTrack}>
          <View style={[styles.loadingBarFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.loadingPct}>{pct}%</Text>
      </View>
    </View>
  );
}

const ARENAS = [
  { name: 'GOAT', min: 5000, img: require('../app/assets/arenas/goat.png') },
  { name: 'Dünya Klasmanı', min: 3500, img: require('../app/assets/arenas/dunya.png') },
  { name: 'Efsaneler Arenası', min: 2000, img: require('../app/assets/arenas/efsaneler.png') },
  { name: 'Şampiyonlar Ligi', min: 1000, img: require('../app/assets/arenas/sampiyonlar.png') },
  { name: 'Profesyonel Lig', min: 500, img: require('../app/assets/arenas/profesyonel.png') },
  { name: 'Amatör Lig', min: 200, img: require('../app/assets/arenas/amator.png') },
  { name: 'Mahalle Sahası', min: 0, img: require('../app/assets/arenas/mahalle.png') },
] as const;

function SimpleBtn({ label, onPress, kind = 'primary' }: { label: string; onPress: () => void; kind?: 'primary' | 'blue' | 'accent' | 'ghost' }) {
  return (
    <Pressable onPress={onPress} style={[styles.homeBtn, kind === 'blue' && styles.homeBtnBlue, kind === 'accent' && styles.homeBtnAccent, kind === 'ghost' && styles.homeBtnGhost]}>
      <Text style={[styles.homeBtnText, kind === 'ghost' && styles.homeBtnTextGhost]}>{label}</Text>
    </Pressable>
  );
}

function WebHomeScreen({ state, actions }: { state: ReturnType<typeof useCrossover>['state']; actions: ReturnType<typeof useCrossover>['actions'] }) {
  const [roomCode, setRoomCode] = useState('');
  const arenaAsset = useMemo(() => {
    const trophies = state.profile?.trophies ?? 0;
    return ARENAS.find((arena) => trophies >= arena.min) ?? ARENAS[ARENAS.length - 1];
  }, [state.profile?.trophies]);

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeTopRow}>
        <Pressable onPress={actions.openProfile} style={styles.profileChip}>
          <Text style={styles.profileChipText}>{state.profile?.displayName ?? ''}</Text>
        </Pressable>
      </View>

      <View style={styles.homeCenter}>
        <Text style={styles.homeLogo}>CROSSOVER</Text>
        <Pressable onPress={actions.openArenas} style={styles.stadiumTapTarget}>
          <Image source={arenaAsset.img} style={styles.stadiumImage} resizeMode="contain" />
        </Pressable>
        <View style={styles.arenaPlate}>
          <Text style={styles.arenaPlateText}>{state.profile?.arena?.name ?? arenaAsset.name}</Text>
          <Text style={styles.arenaPlateScore}>{state.profile?.trophies ?? 0}</Text>
        </View>
      </View>

      <View style={styles.homeButtons}>
        <View style={styles.homeButtonRow}>
          <View style={styles.homeButtonHalf}>
            <SimpleBtn label={t('home.quickMatch')} onPress={() => actions.findMatch({ mode: 'team-team' })} />
          </View>
          <View style={styles.homeButtonHalf}>
            <SimpleBtn label={t('home.createRoom')} onPress={() => actions.createRoom(state.profile?.displayName ?? 'Oyuncu', { mode: 'team-team' })} kind="blue" />
          </View>
        </View>
        <SimpleBtn label={t('home.solo')} onPress={() => actions.createSolo(state.profile?.displayName ?? 'Oyuncu', { mode: 'team-team', difficulty: 'medium' })} kind="accent" />
        <View style={styles.joinRoomRow}>
          <TextInput
            value={roomCode}
            onChangeText={(value) => setRoomCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder={t('home.codePlaceholder')}
            placeholderTextColor={theme.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={styles.joinRoomInput}
            onSubmitEditing={() => {
              if (roomCode.length === 6) actions.joinRoom(roomCode, state.profile?.displayName ?? 'Oyuncu');
            }}
          />
          <Pressable
            onPress={() => actions.joinRoom(roomCode, state.profile?.displayName ?? 'Oyuncu')}
            disabled={roomCode.length !== 6}
            style={[styles.joinRoomBtn, roomCode.length !== 6 && styles.joinRoomBtnDisabled]}
          >
            <Text style={styles.joinRoomBtnText}>{t('home.joinRoom')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function WebSplashScreen() {
  return (
    <View style={styles.splashRoot}>
      <View style={styles.splashStage}>
        <Image
          source={require('../app/assets/splash-icon.png')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

export default function App() {
  const { state, actions } = useCrossover();
  const props = { state, actions };
  const [splash, setSplash] = useState(true);
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingPct, setLoadingPct] = useState(0);
  const [overlay, setOverlay] = useState<'leaderboard' | 'matchHistory' | null>(null);
  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Black': require('../app/assets/fonts/Poppins-Black.ttf'),
    'Poppins-ExtraBold': require('../app/assets/fonts/Poppins-ExtraBold.ttf'),
    'Poppins-SemiBold': require('../app/assets/fonts/Poppins-SemiBold.ttf'),
  });
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    installGlobalErrorHandlers();
    track('webapp_start');
    const timer = setTimeout(() => setSplash(false), 1900);
    AsyncStorage.getItem('@crossover_lang').then((value) => {
      if (value) setLanguage(value);
    }).catch(() => {});
    AsyncStorage.getItem('@crossover_tutorial_seen')
      .then((value) => setTutorialSeen(value === '1'))
      .catch(() => setTutorialSeen(true));
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loaded) return;
    let done = false;
    const id = setInterval(() => {
      setLoadingPct((current) => {
        const next = Math.min(100, current + 4);
        if (next >= 100 && !done) {
          done = true;
          setTimeout(() => setLoaded(true), 280);
        }
        return next;
      });
    }, 80);
    return () => clearInterval(id);
  }, [loaded]);

  const openLeaderboard = () => {
    actions.openLeaderboard();
    setOverlay('leaderboard');
  };

  const openMatchHistory = () => {
    actions.openMatchHistory();
    setOverlay('matchHistory');
  };

  if (splash || !fontsReady) {
    return <WebSplashScreen />;
  }

  if (!state.profile) {
    return (
      <View style={styles.root}>
        <UnifiedBg />
        <View style={styles.stage}>
          <LoginScreen state={state} actions={actions} />
        </View>
      </View>
    );
  }

  if (!state.profile.usernameSet) {
    return (
      <View style={styles.root}>
        <UnifiedBg />
        <View style={styles.stage}>
          <UsernameScreen state={state} actions={actions} />
        </View>
      </View>
    );
  }

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

  if (!loaded) {
    return (
      <View style={styles.root}>
        <UnifiedBg />
        <View style={styles.stage}>
          <WebLoadingScreen pct={loadingPct} />
        </View>
      </View>
    );
  }

  if (!HOME_PHASES.has(state.phase)) {
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
        screen = <WebHomeScreen {...props} />;
        break;
    }

    return (
      <View style={styles.root}>
        <UnifiedBg />
        <View style={styles.stage}>
          {screen}
          <OpponentForfeitModal
            visible={state.opponentForfeit}
            onFindNew={actions.findMatchAgain}
            onGoHome={actions.leave}
          />
        </View>
      </View>
    );
  }

  const homeContent = state.phase === 'arenas'
    ? <ArenasScreen {...props} />
    : state.phase === 'profile'
      ? <ProfileScreen {...props} onOpenMatchHistory={openMatchHistory} />
      : <WebHomeScreen {...props} />;

  return (
    <View style={styles.root}>
      <UnifiedBg />
      {state.phase === 'home' ? <HomeStadiumGlow /> : null}

      <View style={styles.stage}>
        <View style={styles.resourceBar}>
          <View style={styles.trophyPill}>
            <View style={styles.glassSheen} pointerEvents="none" />
            <Ionicons name="trophy" size={18} color={theme.accent} />
            <Text style={styles.trophyText}>{state.profile.trophies}</Text>
          </View>
          <Pressable style={styles.diamondPill}>
            <View style={styles.glassSheen} pointerEvents="none" />
            <GemIcon size={20} />
            <Text style={styles.diamondText}>{state.profile.diamonds}</Text>
          </Pressable>
        </View>

        <View style={styles.content}>{homeContent}</View>
      </View>

      <LeaderboardModal
        visible={overlay === 'leaderboard'}
        entries={state.leaderboard}
        onClose={() => setOverlay(null)}
        onViewProfile={(userId) => actions.getUserProfile(userId)}
      />
      <MatchHistoryModal
        visible={overlay === 'matchHistory'}
        history={state.matchHistory}
        myName={state.profile?.displayName ?? ''}
        onClose={() => setOverlay(null)}
      />
      <FriendProfileModal profile={state.viewProfile} onClose={actions.closeUserProfile} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E2347',
  },
  splashRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  stage: {
    flex: 1,
    paddingTop: 44,
  },
  unifiedBgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#203D8B',
  },
  splashStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 340,
    height: 340,
  },
  content: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingHeader: {
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 24,
  },
  loadingLogoShell: {
    width: 112,
    height: 112,
    borderRadius: 28,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.primary,
    borderBottomWidth: 5,
    borderBottomColor: theme.primaryDark,
  },
  loadingLogo: {
    width: 84,
    height: 84,
  },
  loadingTitle: {
    color: theme.text,
    fontSize: 32,
    fontFamily: 'Poppins-Black',
    letterSpacing: 1.5,
    textAlign: 'center',
    alignSelf: 'stretch',
    includeFontPadding: false,
    marginTop: 14,
  },
  loadingDock: {
    position: 'absolute',
    left: 32,
    right: 32,
    bottom: 64,
    alignItems: 'center',
    gap: 10,
  },
  loadingBarTrack: {
    width: '100%',
    height: 16,
    borderRadius: 10,
    backgroundColor: theme.cardLip,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  loadingBarFill: {
    height: '100%',
    borderRadius: 10,
    backgroundColor: theme.primary,
  },
  loadingPct: {
    color: theme.primary,
    fontSize: 13,
    fontFamily: 'Poppins-ExtraBold',
  },
  resourceBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  glassSheen: {
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
    minWidth: 148,
    justifyContent: 'center',
    backgroundColor: 'rgba(228,238,255,0.13)',
    borderRadius: 19,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.95)',
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
    minWidth: 148,
    justifyContent: 'center',
    backgroundColor: 'rgba(228,238,255,0.13)',
    borderRadius: 19,
    paddingLeft: 20,
    paddingRight: 20,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.95)',
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
  homeScreen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  homeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  profileChip: {
    backgroundColor: theme.card,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 3,
    borderBottomColor: theme.cardLip,
  },
  profileChipText: {
    color: theme.text,
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 13,
  },
  homeCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeLogo: {
    color: theme.primary,
    fontSize: 28,
    fontFamily: 'Poppins-Black',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  stadiumTapTarget: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stadiumImage: {
    width: 330,
    height: 282,
  },
  arenaPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#8B4513AA',
    marginTop: 2,
  },
  arenaPlateText: {
    color: theme.text,
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 15,
  },
  arenaPlateScore: {
    color: theme.gold,
    fontFamily: 'Poppins-Black',
    fontSize: 15,
  },
  homeButtons: {
    gap: 12,
    paddingBottom: 18,
  },
  joinRoomRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  joinRoomInput: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1.5,
    borderColor: theme.border,
    borderBottomWidth: 3,
    borderBottomColor: theme.cardLip,
    color: theme.text,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: 'Poppins-ExtraBold',
    letterSpacing: 1,
  },
  joinRoomBtn: {
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5FB8FF',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.3)',
    borderBottomWidth: 4,
    borderBottomColor: '#1E6FD4',
  },
  joinRoomBtnDisabled: {
    opacity: 0.45,
  },
  joinRoomBtnText: {
    color: '#06131F',
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 14,
  },
  homeButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  homeButtonHalf: {
    flex: 1,
  },
  homeBtn: {
    minHeight: 66,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3DF29A',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.3)',
    borderBottomWidth: 4,
    borderBottomColor: '#0E8C53',
  },
  homeBtnBlue: {
    backgroundColor: '#5FB8FF',
    borderBottomColor: '#1E6FD4',
  },
  homeBtnAccent: {
    backgroundColor: '#FFD968',
    borderBottomColor: '#C68A0E',
  },
  homeBtnGhost: {
    backgroundColor: theme.card,
    borderWidth: 1.5,
    borderColor: theme.border,
    borderBottomWidth: 3,
    borderBottomColor: theme.cardLip,
  },
  homeBtnText: {
    color: '#06131F',
    fontFamily: 'Poppins-ExtraBold',
    fontSize: 15,
  },
  homeBtnTextGhost: {
    color: theme.text,
  },
});
