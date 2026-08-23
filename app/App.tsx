import { memo, startTransition, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as NativeSplash from 'expo-splash-screen';
import {
  Animated,
  AppState,
  Dimensions,
  Easing,
  Image,
  InteractionManager,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCrossover, type GameState } from './src/useCrossover';
import type { GameMode } from './src/protocol';
import { t, setLanguage } from './src/i18n';

// ── AÇILIŞTAKİ BEYAZ KARE (kullanıcı raporu 2026-08-13) ────────────────────
// Native splash, RN kök görünümü bağlanır bağlanmaz KENDİLİĞİNDEN kapanıyordu;
// React daha tek kare çizmeden kapandığı için arada boş (beyaz) kök görünüyor
// ve oyun "geç açılıyormuş" gibi hissettiriyordu. Bu çağrı, kapanmayı bizim
// kontrolümüze alır: native splash, JS kendi açılış ekranını BOYAYANA kadar
// ekranda kalır (aşağıda hideAsync). Modül kapsamında çağrılır — bundle'ın ilk
// satırlarında, otomatik kapanma penceresinden önce çalışması şart.
// Hata yutulur: native modül yoksa (web) uygulama yine açılmalı.
// TÜMÜ try/catch İÇİNDE: burası modül kapsamı — atılan SENKRON bir hata (ör.
// API adı bir yamada değişmiş, modül tanımsız) tüm paketi düşürür ve OTA ile
// giden bu kod canlı uygulamada 0.1 sn'lik beyazı KALICI beyaz ekrana
// çevirirdi. Promise .catch'i yalnız reddi yakalar, senkron atışı yakalamaz.
try {
  NativeSplash.preventAutoHideAsync().catch(() => {});
  // Native splash is intentionally a plain brand-colour hold. The React intro owns
  // all logo animation, so the handoff must not fade out a duplicate native logo.
  NativeSplash.setOptions?.({ duration: 80, fade: true });
} catch { /* native splash yönetimi yoksa açılış yine de sürmeli */ }

// Marketing-capture mode: DevShotScreen + forced language. NEVER ships true —
// see appstore/upload-screenshots.py for the capture pipeline.
const DEV_SHOT_MODE = false;
const DEV_SHOT_LANG = 'tr';
// Dev-only: force the tutorial (antrenman) flow to inspect its layout. NEVER ships true.
const FORCE_TUTORIAL_DEV = false;
import { BASE_H, uiScaleFor, canvasSizeFor } from './src/layout';
import { setGemTarget } from './src/gemTarget';
import { addNotificationTapListener, getPushPermissionGranted, setBadge } from './src/notifications';
import { APP_BUILD_NUMBER, APP_VERSION, fetchApi } from './src/config';
import {
  DevShotScreen,
  TrophyFlight,
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
  FeedbackCenterModal,
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
  MatchOverBanner,
  LevelUpPopup,
  LevelRoadModal,
  Btn,
  MODE_LABEL,
  POWERS,
  POWER_PRICES,
  PowerArt,
  darken,
  withAlpha,
} from './src/screens';
import { theme, engrave, shadowRow, shadowModal, shadowTabBar } from './src/theme';
import { GemIcon } from './src/GemIcon';
import { installGlobalErrorHandlers, track } from './src/telemetry';
import { dismissActiveInput } from './src/keyboardLifecycle';
import type { ImageSourcePropType } from 'react-native';
import { initAudioService, setAudioScene, type AudioScene } from './src/feedback/AudioService';
import { GameFeedbackEvent } from './src/feedback/events';
import { isRonaldoAnswer, triggerDiamondCollectTick, triggerFeedback } from './src/feedback/GameFeedback';
import { loadFeedbackPreferences } from './src/feedback/preferences';
import {
  evaluateMonetizationOffer,
  hasActiveSocialPack,
  loadMonetizationConfig,
  loadOfferCaps,
  markMatchCompleted,
  markOfferDismissed,
  markPostMatchOfferSeen,
  markPurchaseDeclined,
  markPurchaseSucceeded,
  PROMOTION_TIMING,
  saveOfferCaps,
  setPendingAutoUsePower,
  setPendingDiamondIntent,
  takePendingAutoUsePower,
  type MonetizationOffer,
  type MonetizationRemoteConfig,
  type OfferCaps,
  type OfferEngineContext,
  type PowerId,
} from './src/monetization';
import { setPendingShortfall } from './src/shortfall';
import {
  ENGAGEMENT_CONFIG,
  EngagementPriority,
  closeEngagement,
  createEngagementRuntime,
  enqueueEngagement,
  evaluateFeedbackEngagement,
  evaluateRatingEngagement,
  evaluateSocialPackEngagement,
  engagementLog,
  isActivePlayEligible,
  loadEngagementState,
  recordActiveSeconds,
  recordMatchFinished,
  recordPurchaseSuccess,
  resetEngagementState,
  saveEngagementState,
  takeNextEngagement,
  type EngagementQueueItem,
  type EngagementRuntimeState,
} from './src/engagement';
import { requestNativeReview } from './src/ReviewService';

type GemCelebration =
  | { kind: 'purchase'; amount: number; img?: ImageSourcePropType }
  | { kind: 'arenaReward'; amount: number; arenaName: string };

type MonetizationDiagnostics = {
  appVersion: string;
  buildNumber: number;
  socialPackEntitlement: boolean;
  sessionSocialPackShown: boolean;
  modalQueueLength: number;
  lastMonetizationEvent: string;
  lastSuppressionReason: string;
  updatedAt: string;
};

const INITIAL_MONETIZATION_DIAGNOSTICS: MonetizationDiagnostics = {
  appVersion: APP_VERSION,
  buildNumber: APP_BUILD_NUMBER,
  socialPackEntitlement: false,
  sessionSocialPackShown: false,
  modalQueueLength: 0,
  lastMonetizationEvent: 'init',
  lastSuppressionReason: 'none',
  updatedAt: 'not-yet',
};

function powerCount(profile: GameState['profile'], powerId: PowerId): number {
  if (!profile) return 0;
  if (powerId === 'xp2x') return profile.powerXp2x ?? 0;
  if (powerId === 'shield') return profile.powerShield ?? 0;
  if (powerId === 'streak') return profile.powerStreak ?? 0;
  if (powerId === 'training') return profile.powerTraining ?? 0;
  return profile.powerSocialToken ?? 0;
}

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
// Tuval genişliği (tablette ekranı dolduran geniş tuval — bkz. ScaledRoot).
const SCREEN_W = canvasSizeFor(Dimensions.get('window').width, Dimensions.get('window').height).width;
// Once-per-install push permission prompt marker.
const PUSH_PROMPTED_KEY = '@crossover_push_prompted';

// Where a tapped push notification wants to land. A cold-start tap fires before
// profile/loaded are ready, so the route is stashed in this module ref and
// consumed by an App effect once the app is actually navigable.
type PushRoute = { kind: 'message'; fromId: string } | { kind: 'store' } | { kind: 'reengage' };
const pendingPushRoute: { current: PushRoute | null } = { current: null };
const appSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
// Phases where backgrounding the app forfeits the (PvP) match — the whole
// competitive window from the matchup reveal to the between-rounds result.
const FORFEIT_PHASES = new Set(['matchup', 'countdown', 'pick', 'reveal', 'guess', 'result']);

// HUD gem counter. Memoized + owns the count-anim listener, so the per-frame
// setState during gain animations re-renders ONLY this pill, never the app tree.
// The purple gain sweep is a native-driver scaleX on a left-anchored layer.
const DiamondPill = memo(function DiamondPill({ countAnim, fillAnim, pulseAnim, pillRef, onMeasure, onPress, shownRef }: {
  countAnim: Animated.Value;
  fillAnim: Animated.Value;
  pulseAnim?: Animated.Value;
  pillRef: RefObject<View | null>;
  onMeasure: () => void;
  onPress: () => void;
  // The profile's diamonds land via setValue while the pill is unmounted
  // (splash/loading gates) — seed the display from the last pushed value or
  // the counter reads 0 until the next change. A ref keeps memo() effective.
  shownRef: RefObject<number>;
}) {
  const [count, setCount] = useState(() => shownRef.current ?? 0);
  const pulseScale = pulseAnim?.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.055, 1] }) ?? 1;
  const pulseGlow = pulseAnim?.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.42, 0] }) ?? 0;
  useEffect(() => {
    const id = countAnim.addListener(({ value }) => setCount(Math.max(0, Math.round(value))));
    return () => countAnim.removeListener(id);
  }, [countAnim]);
  return (
    <Pressable ref={pillRef} onLayout={onMeasure} onPress={onPress}>
      {({ pressed }) => (
        <Animated.View style={[s.hudPillShadow, { transform: [{ scale: pulseScale }] }]}>
          <View style={[s.hudPill, { paddingLeft: 20, paddingRight: 5, paddingVertical: 5 }, pressed && s.hudPillPressed]}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999, backgroundColor: theme.gem, opacity: pulseGlow }]} />
            <Animated.View pointerEvents="none" style={[s.diamondFill, { transform: [{ scaleX: fillAnim }] }]} />
            <GemIcon size={20} />
            <Text style={s.diamondText}>{count}</Text>
            <View style={s.diamondPlus}>
              <Ionicons name="add" size={12} color={theme.ink} />
            </View>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
});

// A red count badge riding a tab icon's top-right corner. Only ever rendered for a
// positive count — callers pass null when there is nothing to announce.
// Pasif sayfaların elmas hapına her render'da yeni `() => {}` gitmesin —
// DiamondPill'in memo'sunu sessizce bozan TEK prop buydu.
const NOOP = () => {};

// Perf: inactive pager pages skip re-renders entirely — their last committed tree
// stays on screen and they re-render the moment they become active. Without this,
// EVERY ws message / reducer dispatch re-rendered all four heavy tab screens at
// once, which is what made taps and swipes stutter on device.
// Tembel kurulum: pasif sayfalar İLK kurulumda da boş kalır — maç giriş/çıkışında
// 4 ağır ekran TEK commit'te kuruluyordu (dönüşteki "pat" hissi). Aktif sekme
// aktivasyonla aynı commit'te kurulur; diğerleri etkileşimler bitince warmDelay
// kadar bekleyip KADEMELİ, düşük öncelikli commit'lerde ısınır — kullanıcı daha
// kaydıramadan hazırdırlar. Sayfa sarmalayıcıları (width: SCREEN_W) pager'da
// kaldığı için scroll ofsetleri/piksel düzeni değişmez.
const TabFreeze = memo(
  function TabFreeze({ active, warmDelay = 0, children }: {
    active: boolean;
    warmDelay?: number;
    // Ana (Oyna) yuvası: sekmeden ÇIKARKEN resetHomePhase children'ı değiştirir
    // (Arena/Profil → Home) — o kare atlanırsa donmuş ağaç Arena/Profil kalır ve
    // geri kaydırırken yarım saniye görünür. Bu bayrak deaktivasyon karesini çizdirir.
    freshOnDeactivate?: boolean;
    // KAYDIRMA yolu deaktivasyonu jestin ortasında yapar (onScrollLive) ve phase
    // reset'i onScrollEnd'e kalır — o render prev.active=false ile gelir ve
    // freshOnDeactivate tek başına yakalayamaz (hakem bulgusu). freezeKey
    // (home yuvasında state.phase) değişince karşılaştırıcı dondurmayı DELER:
    // Arena/Profil→Home değişimi pasifken de bir kez commit'lenir.
    freezeKey?: unknown;
    children: ReactNode;
  }) {
    const [everActive, setEverActive] = useState(active);
    if (active && !everActive) setEverActive(true); // aktivasyonla AYNI commit'te kurul (render-phase promote)
    useEffect(() => {
      if (everActive) return; // aktif kuruldu — ısıtma gereksiz
      let clearWarm: (() => void) | undefined;
      const h = InteractionManager.runAfterInteractions(() => {
        const id = setTimeout(() => startTransition(() => setEverActive(true)), warmDelay);
        clearWarm = () => clearTimeout(id);
      });
      return () => { h.cancel(); clearWarm?.(); };
      // everActive tek yönlü (false→true), warmDelay sabit — yalnız kurulumda çalışır
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <>{everActive ? children : null}</>;
  },
  // Skip: hedef durum pasifse — deaktive OLAN sekmenin son render'ı da atlanır
  // (children aynı state'ten türüyor, çıktı birebir aynıydı; oturma karesinde
  // boşa çizilen üçüncü ağır ekrandı). İstisna: freshOnDeactivate (yukarı bkz.).
  (prev, next) => !next.active && !(next.freshOnDeactivate && prev.active) && prev.freezeKey === next.freezeKey,
);

function TabBadge({ count }: { count: number }) {
  return (
    <View pointerEvents="none" style={s.tabBadge}>
      <Text style={s.tabBadgeText} numberOfLines={1}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}

type ComingSoonBadgeHandle = { show: () => void };

// Turnuvalar "yakında" rozeti. KALICI monte: animasyon değeri 0'da yatarken
// opacity 0 + pointerEvents none → piksel olarak yokla birebir aynı. Eski sürüm
// AppRoot state'iyle (setComingSoon) her göster/gizle'de TÜM kök ağacı yeniden
// çizdiriyor ve yay JS sürücüsünde akıyordu; native tek-atım da kurulum/söküm
// yarışından ötürü güvenilmezdi (taze Animated düğümünü aynı karede bağlayıp
// başlatmak). Düğüm bir kez bağlanıp HİÇ sökülmediği için iki yarış da yapısal
// olarak imkânsız — aynı zamanlama/eğriler, native sürücüde, kök render'ı sıfır.
const ComingSoonBadge = memo(function ComingSoonBadge({ handleRef }: { handleRef: RefObject<ComingSoonBadgeHandle | null> }) {
  const a = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null); // göster/gizle yaşam döngüsünün tek sahibi
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useImperativeHandle(handleRef, () => ({
    show() {
      if (timer.current) return; // zaten görünür — tekrar dokunuşlar yok sayılır
      a.setValue(0);
      Animated.spring(a, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(a, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
          timer.current = null;
        });
      }, 2200);
    },
  }), [a]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          opacity: a,
          transform: [
            { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
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
  );
});

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
      onPressIn={() => {
        triggerFeedback(locked ? GameFeedbackEvent.UI_DISABLED : GameFeedbackEvent.UI_NAVIGATION);
        Animated.timing(press, { toValue: 1, duration: 60, useNativeDriver: true }).start();
      }}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: 110, useNativeDriver: true }).start()}
    >
      {/* the mockup's active marker: a green rule along the tab's top edge, over a
          barely-there wash that lifts the active tab off the bar */}
      <Animated.View pointerEvents="none" style={[s.tabActiveWash, { opacity: act }]}>
        <View style={s.tabActiveTopLight} />
      </Animated.View>
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
      onPressIn={() => {
        triggerFeedback(GameFeedbackEvent.UI_NAVIGATION);
        Animated.timing(press, { toValue: 1, duration: 60, useNativeDriver: true }).start();
      }}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: 110, useNativeDriver: true }).start()}
    >
      <Animated.View style={[s.tabInner, { transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) }] }]}>
        <View style={s.playTabSlot}>
          <Animated.View style={[s.playTabBall, { transform: [{ translateY: -18 }, { scale: pop }] }]}>
            <View style={s.playTabBallFace}>
              <View pointerEvents="none" style={s.playTabBallTopLight} />
              <Ionicons name="football" size={28} color={theme.onPrimary} />
            </View>
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

// Sender-side friendly-match banner: non-blocking top strip with a live 30→0
// countdown while the friend decides. Replaces the old full-screen waiting
// modal — the sender keeps using the app ("yukarıda çancık"); at 0 the invite
// is voided on both ends (the server's own 30s timer + this cancel), a decline
// surfaces as the named toast from the reducer.
function OutgoingInviteBanner({ invite, onCancel, offsetY = 0 }: {
  invite: { toId: string; toName: string; expiresAt: number };
  onCancel: () => void;
  offsetY?: number; // pushed below the INCOMING InviteBanner when both are up
}) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-160)).current;
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((invite.expiresAt - Date.now()) / 1000)));
  // Latest cancel without re-running the interval effect (identity changes per render).
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    y.setValue(-160);
    Animated.spring(y, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }).start();
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((invite.expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) { clearInterval(id); cancelRef.current(); }
    }, 250);
    return () => clearInterval(id);
  }, [invite.toId, invite.expiresAt, y]);
  const urgent = secs <= 5;
  return (
    <Animated.View style={[s.topBanner, { top: insets.top + 6 + offsetY, transform: [{ translateY: y }] }]}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.accent }}>
        <Ionicons name="notifications" size={20} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.inviteName} numberOfLines={1}>{invite.toName}</Text>
        <Text style={s.inviteSub} numberOfLines={1}>{t('friends.inviteSent')}</Text>
      </View>
      <Text style={{ color: urgent ? theme.danger : theme.accent, fontFamily: 'Poppins-Black', fontSize: 22, fontVariant: ['tabular-nums'] }}>{secs}</Text>
      <Pressable onPress={onCancel} hitSlop={8} style={({ pressed }) => ({ paddingHorizontal: 4, opacity: pressed ? 0.7 : 1 })}>
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
      <ScaledRoot />
    </SafeAreaProvider>
  );
}

// iPad = "aynı iPhone ekranı, büyük hâli" (kullanıcı kuralı 2026-08-06).
// Arayüz her zaman BASE_W×BASE_H telefon tuvalinde çizilir; tablette tek bir
// transform ile ekrana oturana kadar büyütülür. Böylece kart/yazı/boşluk
// oranları telefondakiyle BİREBİR aynı kalır — iPad'e özel yayılmış düzen yok.
function ScaledRoot() {
  const { width, height } = useWindowDimensions();
  const k = uiScaleFor(width, height);
  if (k === 1) return <AppRoot />;
  // Tuval ekranı TAM doldurur (genişlik canvasSizeFor'dan gelir, yükseklik
  // BASE_H) ve tek transform ile büyütülür: kenarda bant YOK, arka plan/saha
  // kenardan kenara akar; içerik Screen primitive'inde 430pt telefon kolonunda
  // ortalanır — büyük mobil oyunların "arka plan tam ekran, arayüz tasarım
  // alanında" kalıbı.
  const canvas = canvasSizeFor(width, height);
  return (
    // transformOrigin 'top left': varsayılan merkez-ölçek tuvali sola/yukarı
    // kaydırıp üst barı kırpıyordu; sol-üstten büyütünce tuval ekranı birebir
    // doldurur (genişlik = canvasSizeFor, yükseklik = BASE_H, ikisi de ×k).
    <View style={{ flex: 1, backgroundColor: BG_TOP, overflow: 'hidden' }}>
      <View style={{ width: canvas.width, height: canvas.height, transform: [{ scale: k }], transformOrigin: 'top left' }}>
        <AppRoot />
      </View>
    </View>
  );
}

function AppRoot() {
  const insets = useSafeAreaInsets();
  const { state, actions } = useCrossover();
  // Profil isteği nöbetçisi: pencere yalnız SON İSTENEN kullanıcının cevabını
  // gösterir. Eski "son kapatılan" nöbetçisi herhangi bir cevapla düşüyordu —
  // A'ya bak/kapat, B'ye bak: A'nın geç cevabı B'nin kartına A'nın kimliğini
  // yazabiliyor ve arkadaşlık isteği YANLIŞ kişiye gidebiliyordu (hakem bulgusu).
  // Ekranlardan yapılan çağrılar da (Arkadaşlar → Profili Gör) nöbetçiden
  // geçsin diye getUserProfile props katmanında sarılır; actions kimliği sabit
  // olduğundan sarmalayıcı da useMemo ile sabittir.
  const requestedProfileRef = useRef<string | null>(null);
  const actionsForScreens = useMemo(() => {
    const dismissThen = (fn: (...args: any[]) => any) => (...args: any[]) => {
      dismissActiveInput();
      return fn(...args);
    };
    return {
      ...actions,
      openArenas: dismissThen(actions.openArenas),
      closeArenas: dismissThen(actions.closeArenas),
      openProfile: dismissThen(actions.openProfile),
      closeProfile: dismissThen(actions.closeProfile),
      findMatch: dismissThen(actions.findMatch),
      cancelSearch: dismissThen(actions.cancelSearch),
      createRoom: dismissThen(actions.createRoom),
      createSolo: dismissThen(actions.createSolo),
      joinRoom: dismissThen(actions.joinRoom),
      start: dismissThen(actions.start),
      leave: dismissThen(actions.leave),
      playAgain: dismissThen(actions.playAgain),
      findMatchAgain: dismissThen(actions.findMatchAgain),
      respondMatchInvite: dismissThen(actions.respondMatchInvite),
      openChat: dismissThen(actions.openChat),
      closeChat: dismissThen(actions.closeChat),
      getUserProfile: (userId: string) => { dismissActiveInput(); requestedProfileRef.current = userId; actions.getUserProfile(userId); },
    };
  }, [actions]);
  const props = { state, actions: actionsForScreens };
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
  const diamondPulseAnim = useRef(new Animated.Value(0)).current;
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
  const settledTabRef = useRef(2); // focus lifecycle follows committed pages, not mid-drag preview state
  const [splash, setSplash] = useState(true);
  // Native splash handoff: keep the plain native hold until the React intro has
  // actually laid out and fonts are ready. Hiding on fontsReady alone can reveal
  // a background-only frame before the intro's first valid render.
  const nativeSplashHidden = useRef(false);
  const hideNativeSplash = useCallback(() => {
    if (nativeSplashHidden.current) return;
    nativeSplashHidden.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { NativeSplash.hideAsync().catch(() => {}); } catch { /* yut */ }
    }));
  }, []);
  const introFrameReadyRef = useRef(false);
  const markIntroFrameReady = useCallback(() => {
    if (introFrameReadyRef.current) return;
    introFrameReadyRef.current = true;
    hideNativeSplash();
  }, [hideNativeSplash]);
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);
  const [tutorialAccepted, setTutorialAccepted] = useState(false);
  const [loaded, setLoaded] = useState(false); // Clash-Royale-style entry loading (warms logo cache)
  const [storeSection, setStoreSection] = useState<'socialPack' | 'diamonds' | 'top' | null>(null);
  const storeAtDiamondsRef = useRef(false); // re-tap toggle: diamonds ↔ back to top
  const csRef = useRef<ComingSoonBadgeHandle | null>(null); // Turnuvalar — "yakında" rozeti (kalıcı monte, bkz. ComingSoonBadge)
  const [expiredSocialPack, setExpiredSocialPack] = useState(false); // Social Pack expired popup
  const [pushPrompt, setPushPrompt] = useState(false);
  const [overlay, setOverlay] = useState<'leaderboard' | 'matchHistory' | null>(null); // centered popups
  // Liderlik satırından profil: pencere satırın KENDİ verisiyle ANINDA açılır —
  // gösterdiği her alan (ad/avatar/çerçeve/kupa/arena/G-M) LeaderboardEntry'de
  // zaten var. user_profile cevabı gelince aynı alanları üzerine yazar; kullanıcı
  // ağ turu boyunca ölü ekrana bakmaz ("satıra dokununca takılıyor" hissinin kalanı).
  const [entryProfile, setEntryProfile] = useState<GameState['viewProfile']>(null);
  const [gemCelebration, setGemCelebration] = useState<GemCelebration | null>(null);
  // Maç sonrası kupa uçuşu (elmas kutlamasının kupa karşılığı): flight → land.
  const [trophyFlight, setTrophyFlight] = useState<null | { delta: number; after: (() => void) | null }>(null);
  const [trophyLand, setTrophyLand] = useState<{ delta: number; seq: number } | null>(null);
  // Elmas-harcamalı her satın almanın "Tamam"lı onayı (sunucu *_purchased mesajı).
  // Görünürlük ve içerik AYRI tutulur: "Tamam" içeriği null'lasaydı 160ms'lik
  // kapanış animasyonu boyunca metin fallback'e (CO Pass yazısına) düşüyordu.
  const [purchaseAck, setPurchaseAck] = useState<NonNullable<GameState['lastPurchase']> | null>(null);
  const [purchaseAckVisible, setPurchaseAckVisible] = useState(false);
  const [offerCaps, setOfferCaps] = useState<OfferCaps | null>(null);
  const [monetizationConfig, setMonetizationConfig] = useState<MonetizationRemoteConfig | null>(null);
  const [contextualOffer, setContextualOffer] = useState<MonetizationOffer | null>(null);
  const [contextualOfferVisible, setContextualOfferVisible] = useState(false);
  const [engagementState, setEngagementState] = useState<EngagementRuntimeState>(() => createEngagementRuntime());
  const [activeEngagement, setActiveEngagement] = useState<EngagementQueueItem | null>(null);
  const [feedbackPromptVisible, setFeedbackPromptVisible] = useState(false);
  const [feedbackCenterVisible, setFeedbackCenterVisible] = useState(false);
  const [feedbackInitialCategory, setFeedbackInitialCategory] = useState<'bug' | undefined>(undefined);
  const [ratingPromptVisible, setRatingPromptVisible] = useState(false);
  const [monetizationDiagnostics, setMonetizationDiagnostics] = useState<MonetizationDiagnostics>(INITIAL_MONETIZATION_DIAGNOSTICS);
  const pendingOfferCtxRef = useRef<OfferEngineContext | null>(null);
  const socialPackQueuedThisSessionRef = useRef(false);
  const promotionTransitionRef = useRef(false);
  const lastPurchaseSeq = state.lastPurchase?.seq ?? 0;
  const recordMonetizationDiagnostic = useCallback((event: string, patch: Partial<MonetizationDiagnostics> & { reason?: string; data?: Record<string, unknown> } = {}) => {
    const { reason, data, ...diagPatch } = patch;
    setMonetizationDiagnostics((current) => {
      const next: MonetizationDiagnostics = {
        ...current,
        ...diagPatch,
        appVersion: APP_VERSION,
        buildNumber: APP_BUILD_NUMBER,
        lastMonetizationEvent: event,
        lastSuppressionReason: reason ?? diagPatch.lastSuppressionReason ?? current.lastSuppressionReason,
        updatedAt: new Date().toISOString(),
      };
      console.info('[MONETIZATION]', event, { ...next, ...(data ?? {}) });
      return next;
    });
  }, []);
  const updateEngagement = useCallback((updater: (state: EngagementRuntimeState) => EngagementRuntimeState) => {
    setEngagementState((current) => {
      const next = updater(current);
      if (next !== current) saveEngagementState(next).catch(() => {});
      return next;
    });
  }, []);
  // Onay penceresi, satın almanın yapıldığı ekrandaki onay/işlem penceresi
  // kapanmadan AÇILMAZ (iki-modal çakışması ekranı donduruyordu). Sıralamayı
  // artık SafeModal kuyruğu garanti ediyor — buradaki eski 420ms kör bekleme
  // her satın almayı yarım saniye "takılıyormuş" gibi gösteriyordu; kalan
  // küçük pay yalnız aynı karedeki state yığılmasını dağıtmak için.
  useEffect(() => {
    if (!state.lastPurchase) return;
    const p = state.lastPurchase;
    const tm = setTimeout(() => { setPurchaseAck(p); setPurchaseAckVisible(true); }, 60);
    setOfferCaps((caps) => {
      if (!caps) return caps;
      const next = markPurchaseSucceeded(caps);
      saveOfferCaps(next).catch(() => {});
      return next;
    });
    updateEngagement((s) => recordPurchaseSuccess(s, p.kind === 'premiumRoad'));
    if (p.kind === 'power') {
      track('item_purchase_completed', { product: p.id, diamond_balance: state.profile?.diamonds ?? 0 });
      track('postmatch_offer_purchase', { product: p.id, currentDiamonds: state.profile?.diamonds ?? 0, appSessionId });
      const powerId = takePendingAutoUsePower(p.id);
      if (powerId) {
        track('item_used', { product: powerId, source_screen: 'auto_after_purchase' });
        setTimeout(() => actions.usePower(powerId), 120);
      }
    } else if (p.kind === 'emote' || p.kind === 'avatar' || p.kind === 'premiumRoad') {
      track('item_purchase_completed', { product: p.id ?? p.kind, kind: p.kind, diamond_balance: state.profile?.diamonds ?? 0 });
    }
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPurchaseSeq, updateEngagement]);

  useEffect(() => {
    let alive = true;
    loadEngagementState().then((s) => { if (alive) setEngagementState(s); }).catch(() => {});
    Promise.all([
      loadOfferCaps(),
      loadMonetizationConfig(() => fetchApi('/monetization-config', 3500).then((r) => r.json())),
    ])
      .then(([caps, cfg]) => { if (alive) { setOfferCaps(caps); setMonetizationConfig(cfg); } })
      .catch(() => { if (alive) { setOfferCaps({ sessionOffers: 0, lastOfferAt: 0, lastSocialPackOfferAt: 0, offersSeenToday: 0, dayKey: new Date().toISOString().slice(0, 10), seenByOffer: {}, dismissedByOffer: {}, postMatchSeenCount: 0, matchesSincePostMatchOffer: 3, lastPostMatchOfferAt: 0, lastDeclineAt: 0, lastPurchaseAt: 0 }); setMonetizationConfig(null); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setMonetizationDiagnostics((current) => ({
      ...current,
      appVersion: APP_VERSION,
      buildNumber: APP_BUILD_NUMBER,
      socialPackEntitlement: hasActiveSocialPack(state.profile),
      sessionSocialPackShown: socialPackQueuedThisSessionRef.current,
      modalQueueLength: engagementState.queuedEngagements.length,
      updatedAt: new Date().toISOString(),
    }));
  }, [state.profile?.socialPackUntil, engagementState.queuedEngagements.length]);

  const enqueuePromotion = useCallback((item: EngagementQueueItem) => {
    updateEngagement((s) => enqueueEngagement(s, item));
  }, [updateEngagement]);


  const completeTutorialChoice = useCallback((accepted: boolean) => {
    if (accepted) {
      setTutorialAccepted(true);
      return;
    }
    setTutorialAccepted(false);
    setTutorialSeen(true);
    AsyncStorage.setItem('@crossover_tutorial_seen', '1').catch(() => {});
    track('tutorial_prompt_skipped');
  }, []);
  const diamondsShownRef = useRef(0); // last value pushed to the pill (fallback when profile is briefly absent)
  const gainAnimatingRef = useRef(false); // sayaç dönerken tutma efekti araya girmesin
  const prevHadActiveSocialPackRef = useRef<boolean | undefined>(undefined);
  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Black': require('./assets/fonts/Poppins-Black.ttf'),
    'Poppins-ExtraBold': require('./assets/fonts/Poppins-ExtraBold.ttf'),
    'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
  const fontsReady = fontsLoaded || !!fontError; // don't get stuck if a font fails
  const [langKey, setLangKey] = useState(0); // increment to force full remount after language change
  const TABS = TAB_DEFS.map((tab) => ({ ...tab, label: t(tab.labelKey) }));

  const phaseRef = useRef(state.phase);
  useEffect(() => {
    if (phaseRef.current !== state.phase) {
      dismissActiveInput();
      phaseRef.current = state.phase;
    }
  }, [state.phase]);

  useEffect(() => () => {
    if (tabGuardTimer.current) clearTimeout(tabGuardTimer.current);
  }, []);

  const setDiamondDisplayInstant = useCallback((value: number) => {
    diamondCountAnim.stopAnimation();
    diamondCountAnim.setValue(value); // setValue notifies the pill's listener
    diamondsShownRef.current = Math.max(0, Math.round(value));
  }, [diamondCountAnim]);

  const animateDiamondGain = useCallback((from: number, to: number, amount: number, durationOverride?: number) => {
    const safeFrom = Math.max(0, Math.round(from));
    const safeTo = Math.max(0, Math.round(to));
    const duration = durationOverride ?? Math.min(1800, Math.max(850, 450 + Math.round(Math.log10(Math.max(amount, 10)) * 520)));
    diamondCountAnim.stopAnimation();
    diamondFillAnim.stopAnimation();
    diamondCountAnim.setValue(safeFrom);
    diamondFillAnim.setValue(0);
    diamondsShownRef.current = safeTo;
    gainAnimatingRef.current = true;
    setTimeout(() => { gainAnimatingRef.current = false; }, duration + 400);
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

  const pulseDiamondPill = useCallback(() => {
    diamondPulseAnim.stopAnimation();
    diamondPulseAnim.setValue(0);
    Animated.timing(diamondPulseAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => diamondPulseAnim.setValue(0));
  }, [diamondPulseAnim]);

  useEffect(() => {
    installGlobalErrorHandlers();
    initAudioService();
    loadFeedbackPreferences().catch(() => {});
    track('app_start', { appSessionId });
    if (__DEV__) console.log('[APP SESSION] Cold launch detected', { appSessionId });
    // Kick off the AdMob SDK once so rewarded ads can load (no-op in Expo Go).
    initMobileAds?.().catch((e: unknown) => console.warn('AdMob init failed', e));
    // Read saved language
    AsyncStorage.getItem('@crossover_lang').then((v) => {
      if (!v) return;
      if (!DEV_SHOT_MODE) setLanguage(v); // cekim kipinde kayitli dil ezmesin
      setLangKey((k) => k + 1);
    }).catch(() => {});
    AsyncStorage.getItem('@crossover_tutorial_seen')
      .then((v) => setTutorialSeen(v === '1'))
      .catch(() => setTutorialSeen(true));
  }, []);

  useEffect(() => {
    if (!loaded || splash || !state.profile?.usernameSet) {
      setAudioScene('BOOT', 180);
      return;
    }
    let scene: AudioScene = 'HOME';
    if (TAB_PHASES.has(state.phase)) {
      scene = 'HOME';
    } else if (state.phase === 'searching' || state.phase === 'lobby') {
      scene = 'MATCHMAKING';
    } else if (state.phase === 'matchup') {
      scene = 'MATCH_FOUND';
    } else if (state.phase === 'countdown') {
      scene = 'COUNTDOWN';
    } else if (state.phase === 'pick' || state.phase === 'reveal' || state.phase === 'guess') {
      scene = 'MATCH_ACTIVE';
    } else if (state.phase === 'result') {
      scene = 'RESULT';
    } else {
      scene = 'HOME';
    }
    setAudioScene(scene, scene === 'HOME' ? 420 : 260);
  }, [loaded, splash, state.profile?.usernameSet, state.phase]);

  const lastCountdownRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'countdown') { lastCountdownRef.current = null; return; }
    const n = state.countdown ?? 0;
    if (lastCountdownRef.current === n) return;
    lastCountdownRef.current = n;
    if (n === 3) triggerFeedback(GameFeedbackEvent.COUNTDOWN_3);
    else if (n === 2) triggerFeedback(GameFeedbackEvent.COUNTDOWN_2);
    else if (n === 1) triggerFeedback(GameFeedbackEvent.COUNTDOWN_1);
    else if (n <= 0) triggerFeedback(GameFeedbackEvent.MATCH_START);
  }, [state.phase, state.countdown]);

  const lastMatchupRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase !== 'matchup' || !state.room?.code) return;
    if (lastMatchupRoomRef.current === state.room.code) return;
    lastMatchupRoomRef.current = state.room.code;
    triggerFeedback(GameFeedbackEvent.MATCH_FOUND);
  }, [state.phase, state.room?.code]);

  const lastResultRef = useRef<GameState['result'] | null>(null);
  useEffect(() => {
    const r = state.result;
    if (state.phase !== 'result' || !r || lastResultRef.current === r) return;
    lastResultRef.current = r;
    const youId = state.room?.youId;
    if (r.reason === 'timeout') {
      triggerFeedback(GameFeedbackEvent.TIMEOUT);
      return;
    }
    if (!r.correct) {
      triggerFeedback(GameFeedbackEvent.ANSWER_WRONG);
      return;
    }
    const byYou = r.answeredById === youId;
    if (byYou && isRonaldoAnswer(r.guess)) triggerFeedback(GameFeedbackEvent.SPECIAL_PLAYER_RONALDO);
    else triggerFeedback(byYou ? GameFeedbackEvent.ANSWER_CORRECT : GameFeedbackEvent.OPPONENT_CORRECT);
  }, [state.phase, state.result, state.room?.youId]);

  const lastScoreRef = useRef<{ roomCode: string; you: number; opp: number } | null>(null);
  useEffect(() => {
    const room = state.room;
    if (!room || !room.code || state.phase === 'home' || state.phase === 'searching' || state.phase === 'matchup' || state.phase === 'countdown') {
      lastScoreRef.current = room?.code ? { roomCode: room.code, you: 0, opp: 0 } : null;
      return;
    }
    const you = room.players.find((p) => p.id === room.youId)?.score ?? 0;
    const opp = room.players.find((p) => p.id !== room.youId)?.score ?? 0;
    const last = lastScoreRef.current;
    if (!last || last.roomCode !== room.code) {
      lastScoreRef.current = { roomCode: room.code, you, opp };
      return;
    }
    if (you > last.you) triggerFeedback(GameFeedbackEvent.ROUND_WIN);
    else if (opp > last.opp) triggerFeedback(GameFeedbackEvent.ROUND_LOSE);
    lastScoreRef.current = { roomCode: room.code, you, opp };
  }, [state.phase, state.room]);

  const handleGemCelebrationDone = useCallback(() => {
    triggerFeedback(GameFeedbackEvent.DIAMOND_COLLECTION_COMPLETE);
    pulseDiamondPill();
    setGemCelebration(null);
  }, [pulseDiamondPill]);

  const handleGemFlightStart = useCallback((durationMs: number) => {
    const diamonds = state.profile?.diamonds ?? diamondsShownRef.current;
    const amount = gemCelebration?.amount ?? 0;
    animateDiamondGain(Math.max(0, diamonds - amount), diamonds, amount, durationMs);
  }, [state.profile?.diamonds, gemCelebration, animateDiamondGain]);

  const handleGemCollectTick = useCallback((progress: number) => {
    triggerDiamondCollectTick(progress);
  }, []);

  const gemCelebrationFeedbackRef = useRef<typeof gemCelebration>(null);
  useEffect(() => {
    if (!gemCelebration || gemCelebrationFeedbackRef.current === gemCelebration) return;
    gemCelebrationFeedbackRef.current = gemCelebration;
    if (gemCelebration.kind === 'arenaReward') triggerFeedback(GameFeedbackEvent.ARENA_UNLOCK);
    else updateEngagement((s) => recordPurchaseSuccess(s, false));
  }, [gemCelebration, updateEngagement]);

  // ---- Maç sonu kupa popup'ı: MAÇ EKRANINDA DEĞİL, ana menüye dönünce ----
  // Maç biterken veri burada yakalanır (leave sonrası state sıfırlanır, o yüzden
  // kopyalanır); popup yalnız sekme dünyasında (ana menü) çizilir. Arena elmas
  // kutlaması da popup kapatıldıktan SONRA zincirlenir — maç ekranı temiz kalır.
  const [matchOverPopup, setMatchOverPopup] = useState<null | {
    youWon: boolean; youScore: number; oppScore: number; youWrong: number; oppWrong: number;
    winnerName: string | null; trophyDelta: NonNullable<GameState['trophyDelta']>; reason?: 'cheat';
  }>(null);
  const matchOverCaptured = useRef(false);
  const postMatchOfferCapturedRef = useRef<string | null>(null);
  const [levelRoadOpen, setLevelRoadOpen] = useState(false);
  useEffect(() => {
    if (!state.matchOver || !state.trophyDelta) { matchOverCaptured.current = false; return; }
    if (matchOverCaptured.current) return;
    matchOverCaptured.current = true;
    updateEngagement((s) => recordMatchFinished(s));
    const ps = state.room?.players ?? [];
    const youId = state.room?.youId;
    const you = ps.find((p) => p.id === youId);
    const opp = ps.find((p) => p.id !== youId);
    setMatchOverPopup({
      youWon: state.matchWinnerId != null && state.matchWinnerId === youId,
      youScore: you?.score ?? 0,
      oppScore: opp?.score ?? 0,
      youWrong: you?.wrongCount ?? 0,
      oppWrong: opp?.wrongCount ?? 0,
      winnerName: state.matchWinnerName ?? null,
      trophyDelta: state.trophyDelta,
    });
    const offerKey = `${state.room?.code ?? 'match'}:${state.trophyDelta.trophies}:${state.trophyDelta.delta}:${state.matchWinnerId ?? 'draw'}`;
    if (postMatchOfferCapturedRef.current !== offerKey) {
      postMatchOfferCapturedRef.current = offerKey;
      const youWon = state.matchWinnerId != null && state.matchWinnerId === youId;
      pendingOfferCtxRef.current = {
        profile: state.profile,
        trophyDelta: state.trophyDelta.delta,
        shielded: state.trophyDelta.shielded,
        youWon,
        xpGained: state.xpGain?.gained ?? null,
        youScore: you?.score ?? 0,
        oppScore: opp?.score ?? 0,
      };
      if (__DEV__) console.log('[MATCH] Finished source=matchOver', { result: youWon ? 'WIN' : 'LOSS', trophyDelta: state.trophyDelta.delta, youScore: you?.score ?? 0, oppScore: opp?.score ?? 0 });
      setOfferCaps((caps) => {
        if (!caps) return caps;
        const next = markMatchCompleted(caps);
        saveOfferCaps(next).catch(() => {});
        return next;
      });
    }
  }, [state.matchOver, state.trophyDelta, state.room, state.matchWinnerId, state.matchWinnerName, state.profile, state.xpGain?.gained, updateEngagement]);
  const matchOverFeedbackRef = useRef<typeof matchOverPopup>(null);
  useEffect(() => {
    if (!matchOverPopup || matchOverFeedbackRef.current === matchOverPopup) return;
    matchOverFeedbackRef.current = matchOverPopup;
    triggerFeedback(matchOverPopup.winnerName == null ? GameFeedbackEvent.MATCH_DRAW : matchOverPopup.youWon ? GameFeedbackEvent.MATCH_WIN : GameFeedbackEvent.MATCH_LOSE);
  }, [matchOverPopup]);
  // Maç ortasında ÇIKIŞ (forfeit): kupa cezası gelince AYNI kaybetme popup'ını göster
  // (yeşil "Devam et" butonu + düşen kupa miktarı popup'ta).
  const forfeitCaptured = useRef(false);
  useEffect(() => {
    const fl = state.forfeitLoss;
    if (!fl) { forfeitCaptured.current = false; return; }
    if (forfeitCaptured.current) return;
    forfeitCaptured.current = true;
    setMatchOverPopup({
      youWon: false,
      youScore: fl.youScore,
      oppScore: fl.oppScore,
      youWrong: 0,
      oppWrong: 0,
      winnerName: fl.opponentName,
      trophyDelta: { trophies: fl.trophies, delta: fl.delta, arena: fl.arena, arenaReward: 0, shielded: false },
      reason: fl.reason,
    });
  }, [state.forfeitLoss]);
  // Rövanş/yeni maç başlarsa bekleyen popup düşer (bayat maçın popup'ı gösterilmez).
  useEffect(() => {
    if (state.phase === 'countdown' || state.phase === 'matchup' || state.phase === 'pick') { setMatchOverPopup(null); setPendingLevelUp(null); heldArena.current = null; actions.clearForfeitLoss(); }
  }, [state.phase]);
  // ---- Seviye atlama zinciri: kupa popup'ı → seviye popup'ı → arena kutlaması ----
  const [pendingLevelUp, setPendingLevelUp] = useState<null | { toLevel: number; diamonds: number; emoteIds: string[]; powerIds: string[]; hasReward: boolean }>(null);
  const pendingLevelUpRef = useRef(pendingLevelUp);
  pendingLevelUpRef.current = pendingLevelUp;
  const heldArena = useRef<{ amount: number; arenaName: string } | null>(null);
  useEffect(() => {
    const lu = state.xpGain?.leveledUp;
    if (!lu || lu.length === 0) return;
    triggerFeedback(GameFeedbackEvent.LEVEL_UP);
    setPendingLevelUp({
      toLevel: lu[lu.length - 1]!.level,
      diamonds: lu.reduce((sum, l) => sum + l.diamonds, 0),
      emoteIds: lu.map((l) => l.emoteId).filter((e): e is string => Boolean(e)),
      powerIds: lu.map((l) => l.powerId).filter((p): p is string => Boolean(p)),
      // Ödül yalnız ×5 seviyelerinde — arada kalan atlayışlarda "Ödülü Topla" çıkmaz
      hasReward: lu.some((l) => l.diamonds > 0 || Boolean(l.powerId) || l.level % 10 === 0),
    });
  }, [state.xpGain]);
  const releaseHeldArena = useCallback(() => {
    if (heldArena.current) {
      const h = heldArena.current;
      heldArena.current = null;
      setGemCelebration((current) => current ?? { kind: 'arenaReward', amount: h.amount, arenaName: h.arenaName });
    }
  }, []);
  const dismissLevelUp = useCallback(() => {
    // Ödüller artık Seviye Yolu'ndan TOPLANIR — burada elmas uçuşu yok.
    setPendingLevelUp(null);
    releaseHeldArena();
  }, [releaseHeldArena]);

  // Sayaç tutma: yalnız arena/satın alma kutlaması sürerken hap ödül ÖNCESİ
  // değerde bekler — elmaslar hapa ulaşınca sayaç döner.
  useEffect(() => {
    const diamonds = state.profile?.diamonds;
    if (typeof diamonds !== 'number') return;
    if (gainAnimatingRef.current) return; // sayaç dönüşü sürüyor — ezme
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

  const dismissMatchOverPopup = useCallback(() => {
    actions.clearForfeitLoss(); // forfeit popup'ıysa bekleyen kaybı temizle (zaten null ise no-op)
    setMatchOverPopup((cur) => {
      const reward = cur?.trophyDelta.arenaReward ?? 0;
      const arenaName = cur?.trophyDelta.arena?.name;
      // Arena/seviye zinciri KUPA UÇUŞUNDAN sonra: uçuş hafif bir overlay,
      // arena kutlaması ise Modal — aynı anda açılsalar Modal uçuşu örter.
      const chain = () => {
        if (reward > 0 && arenaName) {
          if (pendingLevelUpRef.current) {
            // seviye popup'ı araya girecek — arena kutlaması ONDAN sonra
            heldArena.current = { amount: reward, arenaName };
          } else {
            setGemCelebration((current) => current ?? { kind: 'arenaReward', amount: reward, arenaName });
          }
        }
      };
      const delta = cur?.trophyDelta.delta ?? 0;
      if (delta !== 0) setTrophyFlight((f) => f ?? { delta, after: chain });
      else chain();
      return null;
    });
  }, [actions]);

  const modalBlocked = Boolean(
    matchOverPopup ||
    pendingLevelUp ||
    trophyFlight ||
    gemCelebration ||
    purchaseAckVisible ||
    expiredSocialPack ||
    pushPrompt ||
    levelRoadOpen ||
    overlay ||
    feedbackPromptVisible ||
    feedbackCenterVisible ||
    ratingPromptVisible ||
    Boolean(activeEngagement) ||
    promotionTransitionRef.current
  );

  useEffect(() => {
    if (!isActivePlayEligible(state.phase, modalBlocked)) return;
    const id = setInterval(() => {
      updateEngagement((s) => recordActiveSeconds(s, 5));
      if (__DEV__) engagementLog('activePlaySeconds', { activeSessionSeconds: engagementState.activeSessionSeconds + 5, totalActivePlaySeconds: engagementState.totalActivePlaySeconds + 5 });
    }, 5000);
    return () => clearInterval(id);
  }, [state.phase, modalBlocked, updateEngagement, engagementState.activeSessionSeconds, engagementState.totalActivePlaySeconds]);

  useEffect(() => {
    if (!loaded || splash || state.phase !== 'home' || !state.profile?.usernameSet) {
      if (engagementState.queuedEngagements.length > 0) recordMonetizationDiagnostic('modal_queue_suppressed', { reason: 'home_not_ready', modalQueueLength: engagementState.queuedEngagements.length, data: { loaded, splash, phase: state.phase, usernameSet: Boolean(state.profile?.usernameSet) } });
      return;
    }
    if (modalBlocked || contextualOffer || contextualOfferVisible) {
      if (engagementState.queuedEngagements.length > 0) recordMonetizationDiagnostic('modal_queue_suppressed', { reason: 'another_modal_active', modalQueueLength: engagementState.queuedEngagements.length, data: { modalBlocked, contextualOffer: Boolean(contextualOffer), contextualOfferVisible, activeEngagement: activeEngagement?.kind ?? null } });
      return;
    }
    const { state: nextState, item: next } = takeNextEngagement(engagementState, state.phase, modalBlocked);
    if (!next) {
      recordMonetizationDiagnostic('modal_queue_suppressed', { reason: 'queue_empty_or_not_safe', modalQueueLength: engagementState.queuedEngagements.length, data: { phase: state.phase, modalBlocked } });
      return;
    }
    promotionTransitionRef.current = true;
    setEngagementState(nextState);
    saveEngagementState(nextState).catch(() => {});
    setActiveEngagement(next);
    if (next.kind === 'FEEDBACK_PROMPT') setFeedbackPromptVisible(true);
    else if (next.kind === 'RATING_PROMPT') setRatingPromptVisible(true);
    else if (next.monetizationOffer) {
      setContextualOffer(next.monetizationOffer);
      setContextualOfferVisible(true);
    }
    track('engagement_impression', {
      engagement_id: next.id,
      kind: next.kind,
      source: next.source,
      screen: state.phase,
      appSessionId,
      ...next.metadata,
    });
    recordMonetizationDiagnostic('modal_queue_show', { reason: 'show', modalQueueLength: nextState.queuedEngagements.length, sessionSocialPackShown: socialPackQueuedThisSessionRef.current, socialPackEntitlement: hasActiveSocialPack(state.profile), data: { kind: next.kind, source: next.source, id: next.id } });
    requestAnimationFrame(() => { promotionTransitionRef.current = false; });
  }, [loaded, splash, state.phase, state.profile, state.profile?.usernameSet, modalBlocked, contextualOffer, contextualOfferVisible, engagementState, appSessionId, activeEngagement?.kind, recordMonetizationDiagnostic]);

  useEffect(() => {
    if (!offerCaps || !monetizationConfig) {
      if (pendingOfferCtxRef.current) recordMonetizationDiagnostic('post_match_suppressed', { reason: 'monetization_not_ready', data: { hasOfferCaps: Boolean(offerCaps), hasConfig: Boolean(monetizationConfig) } });
      return;
    }
    if (!pendingOfferCtxRef.current) return;
    if (state.phase !== 'home') {
      recordMonetizationDiagnostic('post_match_suppressed', { reason: 'not_home_yet', data: { phase: state.phase } });
      return;
    }
    if (modalBlocked) {
      recordMonetizationDiagnostic('post_match_suppressed', { reason: 'another_modal_active', data: { phase: state.phase, modalBlocked } });
      return;
    }
    const tm = setTimeout(() => {
      const pending = pendingOfferCtxRef.current;
      if (!pending || !offerCaps || !monetizationConfig) {
        recordMonetizationDiagnostic('post_match_suppressed', { reason: 'pending_context_missing_after_delay', data: { hasPending: Boolean(pending), hasOfferCaps: Boolean(offerCaps), hasConfig: Boolean(monetizationConfig) } });
        return;
      }
      const ctx = { ...pending, profile: state.profile ?? pending.profile };
      pendingOfferCtxRef.current = null;
      if (__DEV__) console.log('[MATCH] Finished', { result: ctx.youWon ? 'WIN' : 'LOSS', trophyDelta: ctx.trophyDelta, youScore: ctx.youScore, oppScore: ctx.oppScore });
      const offer = evaluateMonetizationOffer(ctx, offerCaps, monetizationConfig);
      if (!offer) {
        recordMonetizationDiagnostic('post_match_suppressed', { reason: 'no_eligible_offer_or_capped', data: { result: ctx.youWon ? 'win' : 'loss', trophyDelta: ctx.trophyDelta ?? 0, winStreak: ctx.profile?.winStreak ?? 0, lossStreak: ctx.profile?.lostStreak ?? 0, matchesSincePostMatchOffer: offerCaps.matchesSincePostMatchOffer, lastPostMatchOfferAt: offerCaps.lastPostMatchOfferAt, lastDeclineAt: offerCaps.lastDeclineAt, lastPurchaseAt: offerCaps.lastPurchaseAt } });
        return;
      }
      const nextCaps = markPostMatchOfferSeen(offerCaps, offer.offerId);
      setOfferCaps(nextCaps);
      saveOfferCaps(nextCaps).catch(() => {});
      const metadata = { offerType: offer.offerType, offer_id: offer.offerId, trigger: offer.trigger, product: offer.product, matchResult: ctx.youWon ? 'win' : 'loss', trophyDelta: ctx.trophyDelta ?? 0, winStreak: ctx.profile?.winStreak ?? 0, lossStreak: ctx.profile?.lostStreak ?? 0, currentDiamonds: ctx.profile?.diamonds ?? 0, ...offer.analyticsMetadata };
      track('engagement_eligible', { kind: 'POST_MATCH_OFFER', screen: state.phase, appSessionId, ...metadata });
      recordMonetizationDiagnostic('post_match_candidate', { reason: 'candidate_queued', modalQueueLength: engagementState.queuedEngagements.length + 1, data: metadata });
      enqueuePromotion({ id: `post_match_${offer.offerId}`, kind: 'POST_MATCH_OFFER', priority: EngagementPriority.GAMEPLAY_RESULT, source: offer.trigger, createdAt: Date.now(), monetizationOffer: offer, metadata });
    }, PROMOTION_TIMING.postMatchSettleDelayMs);
    return () => clearTimeout(tm);
  }, [offerCaps, monetizationConfig, state.phase, state.profile, modalBlocked, enqueuePromotion, appSessionId, engagementState.queuedEngagements.length, recordMonetizationDiagnostic]);

  useEffect(() => {
    const entitlement = hasActiveSocialPack(state.profile);
    const homeReady = loaded && !splash && state.phase === 'home' && Boolean(state.profile?.usernameSet);
    const baseData = {
      candidate: Boolean(state.profile?.usernameSet),
      entitlement,
      sessionShown: socialPackQueuedThisSessionRef.current,
      navigationReady: state.phase === 'home',
      homeReady,
      anotherModal: modalBlocked,
      hasConfig: Boolean(monetizationConfig),
      queueLength: engagementState.queuedEngagements.length,
    };
    if (!loaded || splash) {
      recordMonetizationDiagnostic('social_pack_cold_start', { reason: 'app_not_loaded', socialPackEntitlement: entitlement, sessionSocialPackShown: socialPackQueuedThisSessionRef.current, modalQueueLength: engagementState.queuedEngagements.length, data: baseData });
      return;
    }
    if (socialPackQueuedThisSessionRef.current) {
      recordMonetizationDiagnostic('social_pack_cold_start', { reason: 'session_already_shown', socialPackEntitlement: entitlement, sessionSocialPackShown: true, modalQueueLength: engagementState.queuedEngagements.length, data: baseData });
      return;
    }
    if (state.phase !== 'home' || !state.profile?.usernameSet) {
      recordMonetizationDiagnostic('social_pack_cold_start', { reason: 'home_not_ready', socialPackEntitlement: entitlement, sessionSocialPackShown: false, modalQueueLength: engagementState.queuedEngagements.length, data: baseData });
      return;
    }
    if (modalBlocked) {
      recordMonetizationDiagnostic('social_pack_cold_start', { reason: 'another_modal_active', socialPackEntitlement: entitlement, sessionSocialPackShown: false, modalQueueLength: engagementState.queuedEngagements.length, data: baseData });
      return;
    }
    if (entitlement) {
      recordMonetizationDiagnostic('social_pack_cold_start', { reason: 'entitlement_active', socialPackEntitlement: true, sessionSocialPackShown: false, modalQueueLength: engagementState.queuedEngagements.length, data: baseData });
      return;
    }
    const engagement = evaluateSocialPackEngagement(state.profile, engagementState, hasActiveSocialPack(state.profile), ENGAGEMENT_CONFIG);
    if (!engagement) {
      recordMonetizationDiagnostic('social_pack_cold_start', { reason: 'not_candidate', socialPackEntitlement: entitlement, sessionSocialPackShown: false, modalQueueLength: engagementState.queuedEngagements.length, data: baseData });
      return;
    }
    const offer: MonetizationOffer = {
      offerId: `social_pack_cold_start_${engagementState.sessionId}`,
      offerType: 'social_pack',
      trigger: 'social_pack_discovery',
      priority: EngagementPriority.DISCOVERY,
      titleKey: 'socialPack.startupTitle',
      bodyKey: 'socialPack.startupBody',
      ctaKey: 'socialPack.startupCta',
      secondaryKey: 'common.close',
      analyticsMetadata: { appSessionId },
    };
    const metadata = { offer_id: offer.offerId, trigger: offer.trigger, currentDiamonds: state.profile?.diamonds ?? 0, ...offer.analyticsMetadata };
    track('engagement_eligible', { kind: 'SOCIAL_PACK_DISCOVERY', screen: state.phase, appSessionId, ...metadata });
    socialPackQueuedThisSessionRef.current = true;
    recordMonetizationDiagnostic('social_pack_cold_start', { reason: 'show', socialPackEntitlement: false, sessionSocialPackShown: true, modalQueueLength: engagementState.queuedEngagements.length + 1, data: { ...baseData, RESULT: 'SHOW', ...metadata } });
    enqueuePromotion({ ...engagement, monetizationOffer: offer, metadata });
  }, [loaded, splash, monetizationConfig, state.phase, state.profile, modalBlocked, enqueuePromotion, engagementState, appSessionId, recordMonetizationDiagnostic]);

  useEffect(() => {
    if (!loaded || splash || state.phase !== 'home' || !state.profile?.usernameSet || modalBlocked) return;
    const feedback = evaluateFeedbackEngagement(state.profile, engagementState);
    if (feedback) {
      track('engagement_eligible', { kind: feedback.kind, source: feedback.source, activePlaySeconds: engagementState.totalActivePlaySeconds, completedMatches: engagementState.totalMatches, appSessionId });
      enqueuePromotion(feedback);
      return;
    }
    const rating = evaluateRatingEngagement(state.profile, engagementState, Boolean(state.trophyDelta?.arenaReward));
    if (rating) {
      track('rating_prompt_eligible', { source: rating.source, activePlaySeconds: engagementState.totalActivePlaySeconds, completedMatches: engagementState.totalMatches, appSessionId });
      enqueuePromotion(rating);
    }
  }, [loaded, splash, state.phase, state.profile, state.trophyDelta?.arenaReward, modalBlocked, engagementState, enqueuePromotion, appSessionId]);

  const dismissContextualOffer = useCallback(() => {
    const offer = contextualOffer;
    setContextualOfferVisible(false);
    updateEngagement((s) => closeEngagement(s, activeEngagement, true));
    setActiveEngagement(null);
    if (!offer || !offerCaps) return;
    const nextCaps = markPurchaseDeclined(markOfferDismissed(offerCaps, offer.offerId));
    setOfferCaps(nextCaps);
    saveOfferCaps(nextCaps).catch(() => {});
    track('engagement_dismissed', { kind: activeEngagement?.kind, offer_id: offer.offerId, trigger: offer.trigger, product: offer.product, offerType: offer.offerType, screen: state.phase, appSessionId, currentDiamonds: state.profile?.diamonds ?? 0 });
  }, [contextualOffer, offerCaps, state.phase, state.profile?.diamonds, updateEngagement, activeEngagement, appSessionId]);

  // Popup'suz kupa deltaları (hükmen kazanan rakip modalından çıkınca; X'le
  // çekilen kendi kaybını ana menüde görür): delta gelince sakla, ana menüye
  // dönünce uçur. Aynı delta nesnesi bir kez uçar.
  const pendingHomeFlight = useRef<number | null>(null);
  const lastStashedDelta = useRef<GameState['trophyDelta']>(null);
  useEffect(() => {
    const td = state.trophyDelta;
    if (!td || !td.delta || state.matchOver || state.forfeitLoss) return; // normal maç sonu / forfeit popup'ı: kupa uçuşunu popup dismiss'i yapar
    if (lastStashedDelta.current === td) return;
    lastStashedDelta.current = td;
    pendingHomeFlight.current = td.delta;
  }, [state.trophyDelta, state.matchOver]);
  useEffect(() => {
    if (state.phase !== 'home') return;
    const d = pendingHomeFlight.current;
    if (d == null) return;
    pendingHomeFlight.current = null;
    setTrophyFlight((f) => f ?? { delta: d, after: null });
  }, [state.phase, state.trophyDelta]);

  useEffect(() => {
    // Hükmen (rakip ayrıldı) gibi matchOver YAKALANMAYAN durumlarda arena ödülü
    // eskisi gibi anında kutlanır; normal maç sonu ödülü popup kapanışına bağlı.
    if (state.matchOver) return;
    const reward = state.trophyDelta?.arenaReward ?? 0;
    const arenaName = state.trophyDelta?.arena?.name;
    if (!reward || !arenaName) return;
    setGemCelebration((current) => current ?? { kind: 'arenaReward', amount: reward, arenaName });
  }, [state.matchOver, state.trophyDelta?.arenaReward, state.trophyDelta?.arena?.name]);

  // Re-measure the active tab's gem pill (fly-to-gems target) after each tab change —
  // only the active page's bar holds the real ref, and it won't re-layout on its own.
  useEffect(() => {
    const id = requestAnimationFrame(() => measureDiamondPill());
    return () => cancelAnimationFrame(id);
  }, [activeTab, measureDiamondPill]);

  useEffect(() => {
    if (!TAB_PHASES.has(state.phase)) return;
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: activeTab * SCREEN_W, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [state.phase, activeTab, langKey]);

  // Auto-show Social Pack renewal popup when it has expired.
  useEffect(() => {
    const until = state.profile?.socialPackUntil;
    const hasActivePack = !!(until && new Date(until).getTime() > Date.now());
    const hadActivePack = prevHadActiveSocialPackRef.current;
    if (!hadActivePack && hasActivePack) updateEngagement((s) => recordPurchaseSuccess(s, true));
    if (hadActivePack && !hasActivePack) {
      setExpiredSocialPack(true);
    }
    prevHadActiveSocialPackRef.current = hasActivePack;
  }, [state.profile?.socialPackUntil, updateEngagement]);

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
    if (idx !== settledTabRef.current) dismissActiveInput();
    settledTabRef.current = idx;
    // Tab taps jump INSTANTLY (no animated slide) so rapid tapping never flickers the
    // green pill across in-between pages. The guard ignores the stray scroll event the
    // jump fires, and a timer (reset on every tap) re-enables live swipe tracking once
    // the user stops tapping — onMomentumScrollEnd doesn't fire for instant scrolls.
    programmaticScroll.current = true;
    if (tabGuardTimer.current) clearTimeout(tabGuardTimer.current);
    tabGuardTimer.current = setTimeout(() => { programmaticScroll.current = false; tabGuardTimer.current = null; }, 260);
    setActiveTab(idx);
    scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: false });
    storeAtDiamondsRef.current = false; // fresh tab entry → re-tap toggle starts at "diamonds"
    if (idx !== 2) resetHomePhase(); // home lives at index 2 (store=0, collection=1, home=2, friends=3)
  }, [resetHomePhase]);

  const acceptContextualOffer = useCallback(() => {
    const offer = contextualOffer;
    const profile = state.profile;
    if (!offer || !profile) return;
    updateEngagement((s) => closeEngagement(s, activeEngagement, false));
    setActiveEngagement(null);
    if (offer.offerType === 'social_pack') {
      setContextualOfferVisible(false);
      track('engagement_primary_clicked', { kind: activeEngagement?.kind, offer_id: offer.offerId, trigger: offer.trigger, screen: state.phase, appSessionId, currentDiamonds: profile.diamonds, social_token_count: profile.powerSocialToken ?? 0 });
      track('social_pack_paywall_open', { source: offer.trigger, offer_id: offer.offerId, appSessionId });
      track('social_pack_purchase_started', { offer_id: offer.offerId, screen: state.phase, appSessionId });
      setStoreSection('socialPack');
      goToTab(0);
      return;
    }
    if (offer.offerType !== 'power' || !offer.product) return;
    const powerId = offer.product;
    setContextualOfferVisible(false);
    track('engagement_primary_clicked', { kind: activeEngagement?.kind, offer_id: offer.offerId, trigger: offer.trigger, product: powerId, offerType: offer.offerType, screen: state.phase, appSessionId, currentDiamonds: profile.diamonds, trophyDelta: offer.analyticsMetadata?.trophyDelta ?? offer.analyticsMetadata?.trophy_delta });
    if (powerCount(profile, powerId) > 0) {
      actions.usePower(powerId);
      return;
    }
    const required = POWER_PRICES[powerId];
    const current = profile.diamonds ?? 0;
    if (current >= required) {
      if (offer.autoUseAfterPurchase) setPendingAutoUsePower(powerId);
      actions.buyPower(powerId);
      return;
    }
    const missing = required - current;
    track('diamond_insufficient_balance', { source: offer.trigger, offerType: offer.offerType, product: powerId, requiredDiamonds: required, currentDiamonds: current, missingDiamonds: missing, screen: state.phase, appSessionId });
    setPendingDiamondIntent({ source: offer.trigger, product: 'power', powerId, requiredDiamonds: required, currentBalance: current, missingDiamonds: missing, autoUseAfterPurchase: offer.autoUseAfterPurchase });
    setPendingShortfall(missing, { required, current, source: offer.trigger });
    setStoreSection('diamonds');
    goToTab(0);
  }, [contextualOffer, state.profile, actions, goToTab, state.phase, updateEngagement, activeEngagement, appSessionId]);

  const useSocialTokenFromLockedMode = useCallback(() => {
    const rawMode = activeEngagement?.metadata?.mode;
    const mode = typeof rawMode === 'string' ? rawMode : undefined;
    setContextualOfferVisible(false);
    updateEngagement((s) => closeEngagement(s, activeEngagement, false));
    track('engagement_primary_clicked', { kind: activeEngagement?.kind, action: 'use_token', mode, appSessionId, screen: state.phase });
    track('premium_mode_preview_completed', { mode, action: 'use_token' });
    actions.usePower('socialtoken');
    setActiveEngagement(null);
  }, [actions, activeEngagement, appSessionId, state.phase, updateEngagement]);

  const dismissFeedbackPrompt = useCallback(() => {
    setFeedbackPromptVisible(false);
    updateEngagement((s) => closeEngagement(s, activeEngagement, true));
    track('engagement_dismissed', { kind: activeEngagement?.kind, appSessionId, screen: state.phase });
    setActiveEngagement(null);
  }, [activeEngagement, appSessionId, state.phase, updateEngagement]);

  const openFeedbackFromPrompt = useCallback((category?: 'bug') => {
    setFeedbackPromptVisible(false);
    setFeedbackInitialCategory(category);
    setFeedbackCenterVisible(true);
    updateEngagement((s) => closeEngagement(s, activeEngagement, false));
    track('engagement_primary_clicked', { kind: activeEngagement?.kind, category: category ?? 'general', appSessionId, screen: state.phase });
    track('feedback_opened', { source: 'proactive_prompt', category: category ?? 'general', appSessionId });
    setActiveEngagement(null);
  }, [activeEngagement, appSessionId, state.phase, updateEngagement]);

  const dismissRatingPrompt = useCallback(() => {
    setRatingPromptVisible(false);
    updateEngagement((s) => closeEngagement(s, activeEngagement, true));
    track('engagement_dismissed', { kind: activeEngagement?.kind, appSessionId, screen: state.phase });
    setActiveEngagement(null);
  }, [activeEngagement, appSessionId, state.phase, updateEngagement]);

  const requestRatingFromPrompt = useCallback(() => {
    setRatingPromptVisible(false);
    updateEngagement((s) => closeEngagement(s, activeEngagement, false));
    track('engagement_primary_clicked', { kind: activeEngagement?.kind, appSessionId, screen: state.phase });
    track('rating_request_attempted', { source: activeEngagement?.source, appSessionId });
    requestNativeReview().catch(() => {});
    setActiveEngagement(null);
  }, [activeEngagement, appSessionId, state.phase, updateEngagement]);

  const onScrollBeginDrag = useCallback(() => {
    if (tabGuardTimer.current) clearTimeout(tabGuardTimer.current);
    tabGuardTimer.current = null;
    programmaticScroll.current = false; // a real gesture owns the pager from this point
  }, []);

  const onScrollEnd = useCallback((e: any) => {
    if (tabGuardTimer.current) clearTimeout(tabGuardTimer.current);
    tabGuardTimer.current = null;
    programmaticScroll.current = false; // drag settled — resume live updates
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.max(0, Math.min(3, Math.round(x / SCREEN_W)));
    if (idx !== settledTabRef.current) {
      dismissActiveInput();
      settledTabRef.current = idx;
    }
    // startTransition: bu setState KÖKÜ (4 sekme ekranını birden) yeniden
    // çizdirir; acil işaretlenince render, sayfanın oturma karesine denk gelip
    // JS thread'i tıkıyordu — iniş "pat" diye hissediliyordu. Ertelemek native
    // kaydırmayı etkilemez (scrollX native driver'da), yalnız çizimi yumuşatır.
    startTransition(() => {
      setActiveTab(idx);
      if (idx !== 2) resetHomePhase();
    });
  }, [resetHomePhase]);

  // Live tab tracking DURING the swipe so the bottom-nav green marker flips the
  // moment you cross a page's halfway point — not after momentum settles. Skips
  // the stray events fired by programmatic tab-tap jumps; phase reset is left to
  // onScrollEnd so mid-swipe never tears down the home sub-screen.
  const onScrollLive = useCallback((e: any) => {
    if (programmaticScroll.current) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    // Parmak ekrandayken yarı noktayı geçince tetiklenen tam-ağaç render'ı da
    // acil olmaktan çıkarılır — jest sürerken kare düşürmesin (yeşil işaret
    // birkaç ms geç yanar, fark edilmez).
    startTransition(() => {
      setActiveTab((prev) => (prev === idx || idx < 0 || idx > 3 ? prev : idx));
    });
  }, []);

  // Leaderboard / match-history open as centered popups (App-level overlay), not fullscreen.
  const openLeaderboard = useCallback(() => { dismissActiveInput(); actions.openLeaderboard(); setOverlay('leaderboard'); }, [actions]);
  const openMatchHistory = useCallback(() => { dismissActiveInput(); actions.openMatchHistory(); setOverlay('matchHistory'); }, [actions]);
  const openDiamondStore = useCallback(() => { setStoreSection('diamonds'); goToTab(0); }, [goToTab]);
  const enqueueLockedSocialMode = useCallback((mode: GameMode) => {
    const profile = state.profile;
    const metadata = { mode, currentDiamonds: profile?.diamonds ?? 0, social_token_count: profile?.powerSocialToken ?? 0 };
    const offer: MonetizationOffer = {
      offerId: `social_pack_locked_${mode}`,
      offerType: 'social_pack',
      trigger: 'premium_mode_locked',
      priority: EngagementPriority.PLAYER_REQUESTED,
      titleKey: 'friends.socialPackRequired',
      bodyKey: 'socialPack.previewBody',
      ctaKey: 'socialPack.unlockCta',
      secondaryKey: 'common.continue',
      analyticsMetadata: metadata,
    };
    track('engagement_eligible', { kind: 'SOCIAL_PACK_LOCKED_MODE', screen: state.phase, appSessionId, ...metadata });
    enqueuePromotion({ id: `locked_mode_${mode}_${Date.now()}`, kind: 'SOCIAL_PACK_LOCKED_MODE', priority: EngagementPriority.PLAYER_REQUESTED, source: 'premium_mode_locked', createdAt: Date.now(), playerRequested: true, monetizationOffer: offer, metadata });
  }, [appSessionId, enqueuePromotion, state.phase, state.profile]);
  const enqueueDevOffer = useCallback((kind: 'social' | 'loss' | 'win' | 'shield' | 'power') => {
    const profile = state.profile;
    if (!profile) return;
    const metadata = { dev: true, appSessionId, currentDiamonds: profile.diamonds };
    if (kind === 'social') {
      const offer: MonetizationOffer = { offerId: `dev_social_${Date.now()}`, offerType: 'social_pack', trigger: 'social_pack_discovery', priority: EngagementPriority.CRITICAL, titleKey: 'socialPack.startupTitle', bodyKey: 'socialPack.startupBody', ctaKey: 'socialPack.startupCta', secondaryKey: 'common.close', analyticsMetadata: metadata };
      enqueuePromotion({ id: offer.offerId, kind: 'DEV_TEST', priority: EngagementPriority.CRITICAL, source: 'dev_social', createdAt: Date.now(), playerRequested: true, monetizationOffer: offer, metadata });
      return;
    }
    const product = kind === 'shield' ? 'shield' : kind === 'power' ? 'training' : kind === 'win' ? 'xp2x' : 'training';
    const offer: MonetizationOffer = {
      offerId: `dev_${kind}_${Date.now()}`,
      offerType: 'power',
      trigger: kind === 'win' ? 'post_win_xp' : 'post_match_loss',
      priority: EngagementPriority.CRITICAL,
      product,
      titleKey: kind === 'shield' ? 'monetization.shieldLossTitle' : kind === 'win' ? 'monetization.bigWinXpTitle' : 'monetization.closeLossTitle',
      bodyKey: kind === 'shield' ? 'monetization.shieldLossBody' : kind === 'win' ? 'monetization.xpBoostBody' : 'monetization.closeLossBody',
      ctaKey: kind === 'shield' ? 'monetization.buyShieldCta' : kind === 'win' ? 'monetization.buyXpCta' : 'monetization.inspectPowerCta',
      secondaryKey: 'common.continue',
      autoUseAfterPurchase: false,
      analyticsMetadata: metadata,
    };
    enqueuePromotion({ id: offer.offerId, kind: 'DEV_TEST', priority: EngagementPriority.CRITICAL, source: `dev_${kind}`, createdAt: Date.now(), playerRequested: true, monetizationOffer: offer, metadata });
  }, [enqueuePromotion, state.profile]);

  const enqueueDevEngagement = useCallback((kind: 'feedback' | 'rating') => {
    enqueuePromotion({ id: `dev_${kind}_${Date.now()}`, kind: kind === 'feedback' ? 'FEEDBACK_PROMPT' : 'RATING_PROMPT', priority: EngagementPriority.CRITICAL, source: `dev_${kind}`, createdAt: Date.now(), playerRequested: true, metadata: { dev: true, appSessionId } });
  }, [enqueuePromotion, appSessionId]);

  const resetDevEngagement = useCallback(() => {
    resetEngagementState().then((s) => { setEngagementState(s); engagementLog('Reset Engagement State', { sessionId: s.sessionId }); }).catch(() => {});
  }, []);
  // Home's find-friend card → Friends tab, landing focused on the add-friend search.
  // A bumped sequence (not a boolean) so every tap re-triggers the focus effect.
  const [friendsAddSeq, setFriendsAddSeq] = useState(0);
  const goToFriendSearch = useCallback(() => {
    // Tembel kurulum (TabFreeze): sekme bu dokunuşla İLK kez kuruluyor olabilir.
    // Seq artışı kurulum commit'ine denk gelirse FriendsScreen'in ref tohumu
    // (handledAddSeq = useRef(focusAddFriendSeq)) onu "işlenmiş" sayıp odağı
    // yutar — önce sekme (kurulum), artış sonraki karede.
    goToTab(3);
    requestAnimationFrame(() => setFriendsAddSeq((s) => s + 1));
  }, [goToTab]);

  // Bayat user_profile süpürücüsü: cevap SON İSTENEN kullanıcıya ait değilse
  // (kart kapatıldı → ref null, ya da bu arada başka satıra basıldı → ref başka
  // userId) state temizlenir — pencere ne yeniden açılır ne yanlış kimlik
  // gösterir. (Render'daki filtre aynı kareyi zaten gizler; bu efekt süpürür.)
  useEffect(() => {
    if (!state.viewProfile) return;
    if (state.viewProfile.userId !== requestedProfileRef.current) actions.closeUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.viewProfile]);

  // ---- Push notifications --------------------------------------------------
  // Once-per-install permission prompt: ~2s after the user first lands on the
  // home tab (loaded && phase 'home'). The AsyncStorage key marks it shown so
  // it never nags again; declining keeps notifications off until they revisit.
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
        }, 4000);
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

  // ANTI-CHEAT: leaving the app mid-match (PvP) = instant forfeit. iOS often
  // reports app-switch/home gestures as 'inactive' before 'background', so both
  // states are punished during the competitive window. Lobby/searching and
  // finished matches are exempt.
  const forfeitCtxRef = useRef<{ eligible: boolean; forfeit: () => void; fired: boolean }>({ eligible: false, forfeit: () => {}, fired: false });
  const opponentIsBot = state.room?.players.some((p) => p.id !== state.room?.youId && p.isBot) ?? false;
  forfeitCtxRef.current = {
    eligible:
      !!state.room &&
      !state.matchOver &&
      state.isQuickMatch &&
      state.room.players.length === 2 &&
      !opponentIsBot &&
      FORFEIT_PHASES.has(state.phase),
    forfeit: actions.forfeitFromBackground,
    fired: forfeitCtxRef.current.fired,
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') dismissActiveInput();
      if ((st === 'inactive' || st === 'background') && forfeitCtxRef.current.eligible && !forfeitCtxRef.current.fired) {
        forfeitCtxRef.current.fired = true;
        forfeitCtxRef.current.forfeit();
      }
      if (st === 'active') forfeitCtxRef.current.fired = false;
    });
    return () => sub.remove();
  }, []);

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

  // APP-STORE SCREENSHOT HARNESS — flip to true ONLY while capturing marketing
  // shots in the simulator (cycles real screens with mock data); never ship true.
  const DEV_SHOT = DEV_SHOT_MODE;
  if (DEV_SHOT) setLanguage(DEV_SHOT_LANG);
  if (DEV_SHOT) return <View style={{ flex: 1 }}><StatusBar style="light" /><DevShotScreen /></View>;

  // Splash screen: cinematic brand opening; dismisses itself via onDone.
  if (splash || !fontsReady) {
    return (
      // Lacivert zemin: native splash kalktığı anda altta beyaz değil marka
      // rengi bulunsun (devir fontsReady effect'inde yapılır, bkz. yukarısı).
      <View style={{ flex: 1, backgroundColor: BG_TOP }}>
        <StatusBar style="light" />
        <SplashScreen onDone={() => setSplash(false)} fontsReady={fontsReady} onFirstFrameReady={markIntroFrameReady} />
      </View>
    );
  }

  // Login gate: nothing is accessible until the user signs in (Apple/Google).
  // MUST come AFTER all hooks above — an early return before useCallback changes
  // the hook count between renders (Rules of Hooks) and crashes right after login.
  // HARD update gate — the server's /config said this build is below minIosBuild.
  // Nothing else mounts (login included): the ONLY way forward is the App Store.
  // Must stay AFTER all hooks (Rules of Hooks, same as the login gate below).
  if (state.updateRequired) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ScreenBg />
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 26 }}>
          <View style={{ backgroundColor: theme.modalFace, borderRadius: 22, padding: 24, alignItems: 'center', ...shadowModal }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.bg2, borderWidth: 2, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="cloud-download" size={30} color={theme.accent} />
            </View>
            <Text style={{ color: theme.text, fontSize: 19, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginBottom: 6 }}>{t('update.title')}</Text>
            <Text style={{ color: theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', lineHeight: 20, textAlign: 'center', marginBottom: 18 }}>{t('update.body')}</Text>
            <Btn
              big
              label={t('update.cta')}
              icon="arrow-up-circle"
              onPress={() => {
                // itms-apps jumps straight into the App Store app (the OS
                // backgrounds us — "uygulamadan atsın"); https is the fallback.
                Linking.openURL('itms-apps://apps.apple.com/app/id6778542426').catch(() =>
                  Linking.openURL('https://apps.apple.com/app/id6778542426').catch(() => {}),
                );
              }}
            />
          </View>
        </View>
      </View>
    );
  }

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
  if (FORCE_TUTORIAL_DEV || (tutorialSeen === false && tutorialAccepted)) {
    return (
      <TutorialScreen
        onDone={() => {
          setTutorialSeen(true);
          setTutorialAccepted(false);
          AsyncStorage.setItem('@crossover_tutorial_seen', '1').catch(() => {});
          track('tutorial_completed');
        }}
      />
    );
  }

  if (tutorialSeen === false) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}> 
        <StatusBar style="light" />
        <ScreenBg />
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 26 }}>
          <View style={{ backgroundColor: theme.modalFace, borderRadius: 24, padding: 22, alignItems: 'center', ...shadowModal }}>
            <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: theme.bg2, borderWidth: 2, borderColor: theme.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="school" size={31} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text, fontSize: 20, fontFamily: 'Poppins-Black', textAlign: 'center', marginBottom: 8, ...engrave('sm') }}>
              {t('tutorial.promptTitle')}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', lineHeight: 20, textAlign: 'center', marginBottom: 18 }}>
              {t('tutorial.promptBody')}
            </Text>
            <Btn big label={t('tutorial.promptYes')} icon="play" onPress={() => { track('tutorial_prompt_accepted'); completeTutorialChoice(true); }} />
            <Btn label={t('tutorial.promptNo')} kind="ghost" onPress={() => completeTutorialChoice(false)} />
          </View>
        </View>
      </View>
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
        screen = <HomeScreen {...props} overlayBusy={Boolean(matchOverPopup || pendingLevelUp || gemCelebration)} gemCountAnimOverride={diamondCountAnim} gemFillAnimOverride={diamondFillAnim} trophyLand={trophyLand} trophyHold={trophyFlight?.delta ?? null} onOpenLevelRoad={() => setLevelRoadOpen(true)} onLockedSocialMode={enqueueLockedSocialMode} monetizationDiagnostics={monetizationDiagnostics} />;
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
          reason={state.opponentForfeitReason}
          onFindNew={actions.findMatchAgain}
          onGoHome={actions.leave}
          trophyDelta={state.trophyDelta}
          showFindNew={state.isQuickMatch}
        />
      </View>
    );
  }

  // Main menu with tab bar + swipe
  const homeContent = state.phase === 'arenas'
    ? <ArenasScreen {...props} />
    : state.phase === 'profile'
    ? <ProfileScreen {...props} onOpenMatchHistory={openMatchHistory} onOpenLevelRoad={() => setLevelRoadOpen(true)} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} />
    : <HomeScreen {...props} heroAnimsActive={activeTab === 2} overlayBusy={Boolean(matchOverPopup || pendingLevelUp || gemCelebration)} gemCountAnimOverride={diamondCountAnim} gemFillAnimOverride={diamondFillAnim} trophyLand={trophyLand} trophyHold={trophyFlight?.delta ?? null} onOpenLevelRoad={() => setLevelRoadOpen(true)} onLockedSocialMode={enqueueLockedSocialMode} monetizationDiagnostics={monetizationDiagnostics} onLanguageChange={() => {
        dismissActiveInput();
        setOverlay(null);
        setStoreSection(null);
        settledTabRef.current = 2;
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
      <Pressable onPress={() => { dismissActiveInput(); actions.openArenas(); goToTab(2); }}>
        {({ pressed }) => (
          <View style={s.hudPillShadow}>
            <View style={[s.hudPill, { paddingHorizontal: 24, paddingVertical: 8 }, pressed && s.hudPillPressed]}>
              <Ionicons name="trophy" size={18} color={theme.accent} />
              <Text style={s.trophyText}>{state.profile?.trophies ?? 0}</Text>
            </View>
          </View>
        )}
      </Pressable>
      <DiamondPill
        countAnim={diamondCountAnim}
        fillAnim={diamondFillAnim}
        pulseAnim={diamondPulseAnim}
        pillRef={active ? diamondPillRef : dummyPillRef}
        onMeasure={active ? measureDiamondPill : NOOP}
        onPress={openDiamondStore}
        shownRef={diamondsShownRef}
      />
    </View>
  );

  // Liderlikten açılan profil: sunucu cevabı (varsa) satır verisini ezer — değerler
  // aynı olduğundan görsel fark yok. Filtre POZİTİF kimlik ister: cevap ancak
  // SON İSTENEN kullanıcıya aitse gösterilir; bayat/yanlış-kimlik kareleri
  // gizlenir (yukarıdaki süpürme efekti state'i de temizler).
  const serverProfile = state.viewProfile && state.viewProfile.userId === requestedProfileRef.current ? state.viewProfile : null;
  const shownProfile = serverProfile ?? entryProfile;

  return (
    <View key={`app-${langKey}`} style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      {/* Backdrop: calm navy menu weave base on every tab. On the home (Oyna) tab a
          CLEAN green-pitch overlay fades in at the bottom. The old stadium photo's
          blurry floodlit sky and the grainy noise band (the "karıncalı" strip behind
          Hemen Oyna) were cut — bg-home-pitch.png keeps only the tidy pitch: transparent
          above, soft-faded into the navy, no dark scrim. */}
      <ScreenBg variant="menu" />
      {state.phase === 'home' ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {
            opacity: scrollX.interpolate({ inputRange: [SCREEN_W, 2 * SCREEN_W, 3 * SCREEN_W], outputRange: [0, 1, 0], extrapolate: 'clamp' }),
          }]}
        >
          <Image source={require('./assets/bg-home-pitch.png')} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" />
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
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEnd}
        onMomentumScrollEnd={onScrollEnd}
        // Feed the raw offset to scrollX on the native thread (stadium cross-fade).
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true, listener: onScrollLive })}
        scrollEventThrottle={16}
        contentOffset={{ x: 2 * SCREEN_W, y: 0 }}
        onLayout={() => scrollRef.current?.scrollTo({ x: activeTab * SCREEN_W, animated: false })}
        style={{ flex: 1 }}
      >
        {/* Each page is fully self-contained: its own top bar lives INSIDE it and
            slides with it. Home shows its own bar (phase 'home'); on Arenas/Profile
            the shared bar is shown here instead. */}
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {state.profile ? renderResourceBar(activeTab === 0) : null}
          <TabFreeze active={activeTab === 0} warmDelay={400}>
            <StoreScreen {...props} scrollToSection={storeSection} onDiamondCelebration={(c) => setGemCelebration({ kind: 'purchase', amount: c.amount, img: c.img })} />
          </TabFreeze>
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {state.profile ? renderResourceBar(activeTab === 1) : null}
          <TabFreeze active={activeTab === 1} warmDelay={700}>
            <CollectionScreen {...props} />
          </TabFreeze>
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {state.phase !== 'home' && state.profile ? renderResourceBar(activeTab === 2) : null}
          {/* Ana yuva da donar — önceden 4 sayfadan tek çıplak olan buydu ve HER ws
              dispatch'i (mesaj, typing, satın alma onayı, liderlik cevabı) en ağır
              ekranı (HomeScreen) perde arkasında boşa yeniden çizdiriyordu. */}
          <TabFreeze active={activeTab === 2} freshOnDeactivate freezeKey={state.phase} warmDelay={550}>
            {homeContent}
          </TabFreeze>
        </View>
        <View style={{ width: SCREEN_W, flex: 1 }}>
          {state.profile ? renderResourceBar(activeTab === 3) : null}
          <TabFreeze active={activeTab === 3} warmDelay={1000}>
            <FriendsScreen {...props} onGoToStore={(section) => { setStoreSection(section ?? null); goToTab(0); }} onLockedSocialMode={enqueueLockedSocialMode} focusAddFriendSeq={friendsAddSeq} />
          </TabFreeze>
        </View>
      </Animated.ScrollView>

      {/* Bottom Tab Bar */}
      <View style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {TABS.map((tab, idx) => {
          const onPress = () => {
            dismissActiveInput();
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
        <TabButton locked icon="trophy-outline" label={t('tab.tournaments')} onPress={() => { dismissActiveInput(); csRef.current?.show(); }} />
      </View>

      {/* Tournaments → standalone 3D coming-soon lettering, no bubble/background. */}
      <ComingSoonBadge handleRef={csRef} />

      {__DEV__ && state.phase === 'home' ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 12) + 78, gap: 6, alignItems: 'center', zIndex: 30 }} pointerEvents="box-none">
          <Text style={{ color: theme.muted, fontFamily: 'Poppins-ExtraBold', fontSize: 8.5 }}>
            ENG {Math.round(engagementState.activeSessionSeconds)}s q:{engagementState.queuedEngagements.length} active:{activeEngagement?.kind ?? '-'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {(['social', 'loss', 'win', 'shield', 'power'] as const).map((k) => (
            <Pressable key={k} onPress={() => enqueueDevOffer(k)} style={({ pressed }) => ({ backgroundColor: pressed ? theme.surface3 : theme.surface2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, opacity: 0.9 })}>
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 9 }}>{k}</Text>
            </Pressable>
          ))}
          {(['feedback', 'rating'] as const).map((k) => (
            <Pressable key={k} onPress={() => enqueueDevEngagement(k)} style={({ pressed }) => ({ backgroundColor: pressed ? theme.surface3 : theme.surface2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, opacity: 0.9 })}>
              <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 9 }}>{k}</Text>
            </Pressable>
          ))}
          <Pressable onPress={resetDevEngagement} style={({ pressed }) => ({ backgroundColor: pressed ? theme.danger : withAlpha(theme.danger, 0.2), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, opacity: 0.9 })}>
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 9 }}>reset</Text>
          </Pressable>
          </View>
        </View>
      ) : null}

      {state.matchInvite ? (
        <InviteBanner
          invite={state.matchInvite}
          onAccept={() => actions.respondMatchInvite(state.matchInvite!.fromId, true)}
          onReject={() => actions.respondMatchInvite(state.matchInvite!.fromId, false)}
        />
      ) : null}
      {state.outgoingInvite ? (
        <OutgoingInviteBanner
          invite={state.outgoingInvite}
          // Both strips anchor at the same top slot — an incoming invite takes
          // priority (its accept/reject must stay tappable), ours drops below it.
          offsetY={state.matchInvite ? 86 : 0}
          onCancel={() => { if (state.outgoingInvite) actions.cancelMatchInvite(state.outgoingInvite.toId); }}
        />
      ) : null}
      {trophyFlight ? (
        <TrophyFlight
          delta={trophyFlight.delta}
          onDone={() => {
            const f = trophyFlight;
            setTrophyFlight(null);
            setTrophyLand((s) => ({ delta: f.delta, seq: (s?.seq ?? 0) + 1 }));
            f.after?.();
          }}
        />
      ) : null}
      <TopBanner
        banner={state.banner}
        onClose={actions.clearBanner}
        onPress={() => { const b = state.banner; if (!b) return; if (b.kind === 'friend_request') goToTab(3); else if (b.userId) actions.openChat(b.userId); }}
      />

      {/* Centered popups (leaderboard / match history) — open over everything, not fullscreen */}
      {/* DONMA DÜZELTMESİ: profil AYNI ANDA açılmaz — liderlik penceresi önce
          kapanır, profil onun 160ms'lik çıkış animasyonundan SONRA istenir.
          İkisi üst üste binince iOS iki native modalı aynı anda sunmaya çalışıp
          görünmez bir modal bırakıyor ve TÜM dokunuşlar ölüyordu (uygulama
          "donuyor" — ancak kapatıp açınca düzeliyordu). */}
      <LeaderboardModal
        visible={overlay === 'leaderboard'}
        entries={state.leaderboard}
        myUserId={state.profile?.userId}
        onClose={() => setOverlay(null)}
        // Profil isteği HEMEN gider (ağ gecikmesi kapanış animasyonuyla örtüşür);
        // sunum güvenliği kör zamanlayıcıya değil SafeModal kuyruğuna emanet —
        // liderlik penceresi tam kapanmadan profil penceresi sunulMAZ.
        // Pencere satırın kendi verisiyle ANINDA dolar (entryProfile) — ağ turu
        // beklerken ölü ekran kalmaz; cevap gelince aynı alanları üzerine yazar.
        onViewProfile={(userId) => {
          setOverlay(null);
          requestedProfileRef.current = userId; // nöbetçi HER istekte kilitlenir (satır verisi olmasa da)
          const e = state.leaderboard.find((x) => x.userId === userId);
          if (e) {
            setEntryProfile({
              userId: e.userId, displayName: e.displayName, selectedAvatar: e.avatar ?? '',
              trophies: e.trophies, wins: e.wins, losses: e.losses, arena: e.arena,
              avatar: e.avatar, frame: e.frame, isBot: e.isBot,
            });
          }
          actions.getUserProfile(userId);
        }}
      />
      <MatchHistoryModal visible={overlay === 'matchHistory'} history={state.matchHistory} myName={state.profile?.displayName ?? ''} onClose={() => setOverlay(null)} />
      <FriendProfileModal
        profile={shownProfile}
        onClose={() => {
          // Kapanışta nöbetçi boşalır: artık HİÇBİR cevap beklenmiyor — geç gelen
          // user_profile süpürme efektine takılır, pencere yeniden açılamaz.
          requestedProfileRef.current = null;
          setEntryProfile(null);
          actions.closeUserProfile();
        }}
        // Liderlik tablosundan bakılan profil: arkadaş değilse tek dokunuşla istek
        relation={!shownProfile ? undefined
          : shownProfile.isBot ? 'friend'
          : shownProfile.userId === state.profile?.userId ? 'self'
          : state.friends.some((f) => f.userId === shownProfile.userId) ? 'friend'
          : 'none'}
        onAddFriend={() => { if (shownProfile) actions.sendFriendRequest(undefined, shownProfile.displayName); }}
      />

      {/* Kupa kazanma/kaybetme popup'ı — maçtan ÇIKINCA burada, ana menünün üstünde */}
      {matchOverPopup ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 60, backgroundColor: theme.scrim, justifyContent: 'center', paddingHorizontal: 24 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismissMatchOverPopup} />
          <MatchOverBanner
            youWon={matchOverPopup.youWon}
            youScore={matchOverPopup.youScore}
            oppScore={matchOverPopup.oppScore}
            youWrong={matchOverPopup.youWrong}
            oppWrong={matchOverPopup.oppWrong}
            winnerName={matchOverPopup.winnerName}
            trophyDelta={matchOverPopup.trophyDelta}
            reason={matchOverPopup.reason}
            xpGained={state.xpGain?.gained ?? null}
          />
          <View style={{ maxWidth: 320, width: '100%', alignSelf: 'center' }}>
            <Btn big kind="primary" label={t('common.continue')} onPress={dismissMatchOverPopup} />
          </View>
        </View>
      ) : null}

      {/* Seviye atlama — kupa popup'ı kapandıktan sonra */}
      {pendingLevelUp && !matchOverPopup ? (
        <LevelUpPopup
          toLevel={pendingLevelUp.toLevel}
          diamonds={pendingLevelUp.diamonds}
          emoteIds={pendingLevelUp.emoteIds}
          powerIds={pendingLevelUp.powerIds}
          hasReward={pendingLevelUp.hasReward}
          onClose={dismissLevelUp}
          onGoToRoad={() => { setLevelRoadOpen(true); dismissLevelUp(); }}
        />
      ) : null}

      {/* Seviye Yolu — tam ekran ilerleme/ödül haritası; ödüller karta dokunarak toplanır */}
      <LevelRoadModal
        onNeedDiamonds={() => { setLevelRoadOpen(false); setStoreSection('diamonds'); goToTab(0); }}
        visible={levelRoadOpen}
        profile={state.profile}
        onClose={() => setLevelRoadOpen(false)}
        onClaim={(n, track) => actions.claimLevelReward(n, track)}
        onBuyPremium={() => actions.buyPremiumRoad()}
        lastClaim={state.lastClaim}
      />

      {gemCelebration ? (
        <DiamondCelebration
          amount={gemCelebration.amount}
          img={gemCelebration.kind === 'purchase' ? gemCelebration.img : undefined}
          variant={gemCelebration.kind === 'arenaReward' ? 'arenaReward' : 'purchase'}
          arenaName={gemCelebration.kind === 'arenaReward' ? gemCelebration.arenaName : undefined}
          onFlightStart={handleGemFlightStart}
          onCollectTick={handleGemCollectTick}
          onDone={handleGemCelebrationDone}
        />
      ) : null}

      {/* Her elmas-harcamalı satın almanın "Tamam"lı onayı — sunucu *_purchased
          mesajı düşürünce çıkar. Elmas paketleri hariç (DiamondCelebration). */}
        <GameModal visible={purchaseAckVisible} onClose={() => setPurchaseAckVisible(false)} onExited={() => setPurchaseAck(null)} title={t('purchase.doneTitle')} icon="checkmark-circle">
          <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
            {purchaseAck?.kind === 'power' ? t('purchase.powerBody')
              : purchaseAck?.kind === 'emote' ? t('purchase.emoteBody')
              : purchaseAck?.kind === 'avatar' ? t('purchase.avatarBody')
              : purchaseAck?.kind === 'premiumRoad' ? t('purchase.premiumRoadBody')
              : null}
          </Text>
          <Btn big label={t('settings.confirm')} onPress={() => setPurchaseAckVisible(false)} />
        </GameModal>

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

      <GameModal
        visible={contextualOfferVisible}
        onClose={dismissContextualOffer}
        onExited={() => { if (!contextualOfferVisible) setContextualOffer(null); }}
        title={contextualOffer ? t(contextualOffer.titleKey as any) : ''}
        icon={contextualOffer?.offerType === 'social_pack' ? 'people' : contextualOffer?.product ? POWERS[contextualOffer.product].icon : 'flash'}
        coach
      >
        {contextualOffer?.offerType === 'power' && contextualOffer.product ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <PowerArt powerId={contextualOffer.product} size={88} />
            <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
              {t(contextualOffer.bodyKey as any)}
            </Text>
            <Text style={{ color: theme.text, fontSize: 12, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>
              {powerCount(state.profile, contextualOffer.product) > 0 ? t('monetization.inInventory') : t('monetization.powerPrice', { n: String(POWER_PRICES[contextualOffer.product]) })}
            </Text>
            <Btn big kind="accent" icon={POWERS[contextualOffer.product].icon} label={t(contextualOffer.ctaKey as any)} onPress={acceptContextualOffer} />
            <Btn kind="ghost" label={t(contextualOffer.secondaryKey as any)} onPress={dismissContextualOffer} />
          </View>
        ) : contextualOffer?.offerType === 'social_pack' ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: withAlpha(theme.blue, 0.16), borderRadius: 16, padding: 10, borderWidth: 1, borderColor: withAlpha(theme.blue, 0.45) }}>
                <Text style={{ fontSize: 23 }}>🇹🇷</Text>
                <Text style={{ color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>{t('socialPack.countryTeamLabel')}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: withAlpha(theme.purple, 0.16), borderRadius: 16, padding: 10, borderWidth: 1, borderColor: withAlpha(theme.purple, 0.45) }}>
                <Text style={{ fontSize: 24 }}>🔤</Text>
                <Text style={{ color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>{t('socialPack.letterTeamLabel')}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: withAlpha(theme.primary, 0.16), borderRadius: 16, padding: 10, borderWidth: 1, borderColor: withAlpha(theme.primary, 0.45) }}>
                <Text style={{ fontSize: 24 }}>⚽</Text>
                <Text style={{ color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>{t('socialPack.specialModesLabel')}</Text>
              </View>
            </View>
            <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
              {t(contextualOffer.bodyKey as any)}
            </Text>
            {activeEngagement?.kind === 'SOCIAL_PACK_LOCKED_MODE' && (state.profile?.powerSocialToken ?? 0) > 0 ? (
              <Btn big kind="accent" icon="ticket" label={t('socialPack.useTokenCta')} onPress={useSocialTokenFromLockedMode} />
            ) : (
              <Btn big kind="accent" icon="people" label={t(contextualOffer.ctaKey as any)} onPress={acceptContextualOffer} />
            )}
            <Btn kind="ghost" label={t(contextualOffer.secondaryKey as any)} onPress={dismissContextualOffer} />
          </View>
        ) : null}
      </GameModal>

      <GameModal visible={feedbackPromptVisible} onClose={dismissFeedbackPrompt} title="COF’u Birlikte Geliştirelim" icon="chatbubbles">
        <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
          Eklememizi veya değiştirmemizi istediğin bir şey var mı? Fikrini gerçekten merak ediyoruz.
        </Text>
        <Btn big kind="primary" icon="create" label="Görüşümü Yaz" onPress={() => openFeedbackFromPrompt()} />
        <Btn kind="ghost" icon="warning" label="Bir Sorun Bildir" onPress={() => openFeedbackFromPrompt('bug')} />
        <Btn kind="ghost" label="Daha Sonra" onPress={dismissFeedbackPrompt} />
      </GameModal>

      <FeedbackCenterModal
        visible={feedbackCenterVisible}
        playerId={state.profile?.userId ?? null}
        initialCategory={feedbackInitialCategory}
        context={{ source: 'proactive_prompt', phase: state.phase, arenaName: state.profile?.arena?.name, activePlaySeconds: engagementState.totalActivePlaySeconds, totalMatches: engagementState.totalMatches }}
        onClose={() => { setFeedbackCenterVisible(false); setFeedbackInitialCategory(undefined); }}
      />

      <GameModal visible={ratingPromptVisible} onClose={dismissRatingPrompt} title="Maçlar Sarıyor mu?" icon="star">
        <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
          App Store’daki değerlendirmen COF’un daha fazla futbolsevere ulaşmasına yardımcı olur.
        </Text>
        <Btn big kind="primary" icon="star" label="Değerlendir" onPress={requestRatingFromPrompt} />
        <Btn kind="ghost" label="Şimdi Değil" onPress={dismissRatingPrompt} />
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

const TAB_TOP_INSET = 12.5; // s.tabBar paddingTop (12.5, no top border) — indicator still lands on the bar's outer edge

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_TOP }, // navy behind the patterned ScreenBg (no header seam); top inset applied via safe-area
  // The mockup's bar: a flat deep-navy slab with rounded top corners and the
  // content shadowed up off it. NO top hairline/gloss: the light per-side border
  // and the straight 1px gloss strip both read as a stray gray line squared off
  // across the rounded corners (per-side border colors on rounded views are
  // kit-banned; the gloss can't be clipped while the ball needs overflow visible).
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.tabBar,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12.5, // absorbs the removed borderTopWidth (1.5) so TAB_TOP_INSET geometry is unchanged
    // Upward navy shadow — the bar physically sits over the content.
    ...shadowTabBar,
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
  // Active-tab box (Broadcast Prestige): a filled raised tone — NOT a ring. The
  // top green rule (tabIndicator) + green label carry the selection; the wash is
  // a soft lift, its 1px top light reads as the selected surface catching the bar light.
  tabActiveWash: {
    position: 'absolute', top: -TAB_TOP_INSET + 4, left: 6, right: 6, bottom: 5,
    borderRadius: 13,
    backgroundColor: 'rgba(22,178,122,0.16)',
    overflow: 'hidden',
  },
  tabActiveTopLight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: '#FFFFFF', opacity: 0.1,
  },
  tabLock: {
    position: 'absolute', top: -4, right: -8, width: 14, height: 14, borderRadius: 7,
    backgroundColor: theme.accent,
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
    borderWidth: 3, borderColor: theme.tabBar, // cutout ring separating the ball from the bar
    alignItems: 'center', justifyContent: 'center',
    // no overflow:'hidden' here — iOS masksToBounds would clip the ball's own
    // green shadow; the top-light clip lives on playTabBallFace instead.
    shadowColor: theme.primaryDark, shadowOpacity: 0.5, shadowRadius: 9, shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  // Inner clipping circle seated inside the 3px cutout ring (radius 24 − 3 = 21).
  playTabBallFace: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 21, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  playTabBallTopLight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    backgroundColor: '#FFFFFF', opacity: 0.18,
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
    backgroundColor: theme.modalFace, borderRadius: 16, padding: 12,
    borderTopWidth: 2, borderTopColor: theme.primary, // green identity kept as an accent strip, not a frame
    ...shadowModal,
  },
  topBanner: {
    position: 'absolute', left: 10, right: 10, zIndex: 110, // top comes from the safe-area inset
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.modalFace, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12,
    borderTopWidth: 2, borderTopColor: theme.primary,
    ...shadowModal,
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
  // One opaque HUD counter language (Broadcast Prestige): a solid raised pill —
  // surface1 face, 1px top-light, soft navy shadow. No outline ring.
  // Split in two: iOS clips a layer's own shadow when overflow:'hidden' sits on
  // the same node, so hudPillShadow casts and hudPill clips (GamePanel pattern).
  hudPillShadow: {
    backgroundColor: theme.surface1,
    borderRadius: 19,
    ...shadowRow,
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    minWidth: 148, // longer left↔right
    justifyContent: 'center',
    backgroundColor: theme.surface1,
    borderRadius: 19,
    borderTopWidth: 1,
    borderTopColor: theme.topLight, // 1px photon, not a frame
  },
  hudPillPressed: {
    backgroundColor: theme.surface2, // fill brightens
    transform: [{ scale: 0.97 }],
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
