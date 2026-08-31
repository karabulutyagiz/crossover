import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from 'react';
import {
  FlatList,
  Image,
  type ImageSourcePropType,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  type ModalProps,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Animated, AppState, Easing, PanResponder, Platform, Dimensions, Linking, LayoutAnimation, Share } from 'react-native';
import { State } from 'react-native-gesture-handler/lib/commonjs/State';
import { PanGestureHandler } from 'react-native-gesture-handler/lib/commonjs/handlers/PanGestureHandler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { theme, engrave, shadowSoft, shadowRow, shadowRaised, shadowModal, shadowTabBar } from './theme';
import { t, currentLang, setLanguage, LANGUAGES } from './i18n';
import type { MessageKey } from './i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './config';
import { submitPlayerFeedback, type PlayerFeedbackCategory } from './feedbackSubmit';
import { GemIcon, GEM_COLOR } from './GemIcon';
import { whenModalSlotFree } from './modalTraffic';
import { dismissActiveInput } from './keyboardLifecycle';
import { gemTarget, setGemTarget, xpTarget, setXpTarget, setXpRemeasure, remeasureXpTarget, trophyTarget, setTrophyTarget, setTrophyRemeasure, remeasureTrophyTarget } from './gemTarget';
import { Avatar } from './Avatar';
import { useIsTablet, useWindow, useContentMaxWidth, canvasSizeFor } from './layout';
import { setPendingShortfall, takePendingShortfall, takePendingShortfallReason } from './shortfall';
import { getMonetizationConfig, setPendingAutoUsePower, takePendingDiamondIntent, type DiamondIntent } from './monetization';
import Svg, { Rect, Circle, Line, Polygon, Path, G, Ellipse, ClipPath, Defs, LinearGradient as SvgGradient, RadialGradient, Stop } from 'react-native-svg';

WebBrowser.maybeCompleteAuthSession();
import type { GameState, FriendInfo, LeaderboardEntry } from './useCrossover';
import { initialState } from './useCrossover';
import type { BlockedUserView, ClubRef, CosmeticLoadoutView, CosmeticType, DailyCareerStateView, DailyCrossoverStateView, DailyQuestsView, SeasonStateView, Difficulty, GameMode, GameOptions, MatchHistoryView, PlayerRef, ProfileView, PublicProfile, RoomView, Scope, ScopeOption, SpellInfo, StoreCatalogItem } from './protocol';
import {
  EmoteCallout,
  EmoteSticker,
  EmoteWarmup,
  emotePhrase,
  PREMIUM_EMOTES,
  ANIM_EMOTES,
  FACE_EMOTES,
  availableEmotes,
  loadoutEmotes,
  emoteWeeks,
  LATEST_WEEK,
  getEmote,
  ownsEmote,
} from './emotes';
import type { EmoteMeta } from './emotes';
import { AvatarBadge, avatarMeta, avatarPrice, ownsAvatar } from './avatars';
import { FRAME_ART as FRAME_ART_MAP, FRAME_SCALE, FrameOverlay, goatStageLabel } from './frames';
import { DEFAULT_BALL_ID, DEFAULT_MATCH_BACKGROUND_ID, RARITY_COLOR, cosmeticDisplayName, cosmeticVisual, isEquippedCosmetic, nameEffectColors, ownsStoreCosmetic, profileLoadout, resolveMatchBackground } from './cosmetics';
import { EffectSceneFX, NameEffectFX } from './cosmeticFx';
import { NATIONALITIES } from './nationalities';
import { captureError, track } from './telemetry';
import { GameFeedbackEvent, HapticEvent } from './feedback/events';
import { playHaptic } from './feedback/HapticsService';
import { stopSplashStinger } from './feedback/AudioService';
import { triggerFeedback } from './feedback/GameFeedback';
import { useFeedbackPreferences } from './feedback/useFeedbackPreferences';
// react-native-iap v15 (StoreKit2) — native module, absent in Expo Go. Wrap the require
// in try/catch so the app still loads in Expo Go (Store shows "coming soon"); the real
// module is present in dev/prod builds. v15 is the version compatible with RN's prebuilt-
// dependencies model (v13 needs the old standalone RCT-Folly pod → won't build on RN 0.83+).
let useIAP: any = () => ({ connected: false, products: [], subscriptions: [], requestPurchase: () => {}, fetchProducts: () => Promise.resolve([]) });
let getTransactionJwsIOS: any = (_pid?: string) => Promise.resolve(null);
let getAvailablePurchases: any = () => Promise.resolve([]);
let iapFinishTransaction: any = () => Promise.resolve();
type Purchase = any;
try {
  const iap = require('react-native-iap');
  useIAP = iap.useIAP;
  // StoreKit2: validate the per-transaction JWS (legacy getReceiptIOS is empty post-purchase in v15).
  getTransactionJwsIOS = iap.getTransactionJwsIOS;
  getAvailablePurchases = iap.getAvailablePurchases;
  iapFinishTransaction = iap.finishTransaction;
} catch {
  // native module unavailable (Expo Go) — IAP disabled gracefully
}

let NetInfoModule: any = null;
try { NetInfoModule = require('@react-native-community/netinfo').default; } catch { NetInfoModule = null; }

type Actions = {
  register: (name: string, gameCenterId?: string) => void;
  guestLogin: () => void;
  // Davet ödülü
  redeemReferral: (code: string) => void;
  // Günün Crossover'ı
  getDailyCrossover: () => void;
  getDailyCareer: () => void;
  getDailyQuests: () => void;
  getSeason: () => void;
  reportFreeze: (kind: 'jank' | 'dirty_exit', screen: string, stalledMs: number) => void;
  claimQuest: (questId: string) => void;
  clearQuestClaimed: () => void;
  guessDailyCareer: (text: string) => void;
  clearDailyCareerReward: () => void;
  startDailyCrossover: () => void;
  guessDailyCrossover: (text: string) => void;
  clearDailyCxReward: () => void;
  authWith: (provider: 'apple' | 'google' | 'facebook', token: string, name?: string) => void;
  setUsername: (username: string) => void;
  changeName: (newName: string) => void;
  markXpSeen: () => void;
  markTrophySeen: () => void;
  openArenas: () => void;
  closeArenas: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  openLeaderboard: () => void;
  closeLeaderboard: () => void;
  openMatchHistory: () => void;
  closeMatchHistory: () => void;
  findMatch: (options?: GameOptions) => void;
  cancelSearch: () => void;
  createRoom: (name: string, options?: GameOptions) => void;
  createSolo: (name: string, options?: GameOptions) => void;
  joinRoom: (code: string, name: string) => void;
  start: () => void;
  pickTeam: (clubId: number) => void;
  pickCountry: (country: string) => void;
  pickLetter: (letter: string) => void;
  searchClubs: (q: string) => void;
  searchPlayers: (q: string) => void;
  pickPlayer: (playerId: number) => void;
  submitGuess: (text: string) => void;
  pass: () => void;
  ready: () => void;
  playAgain: () => void;
  acceptRematch: () => void;
  declineRematch: () => void;
  sendEmote: (emoteId: string) => void;
  clearEmote: (playerId: string) => void;
  buyEmote: (emoteId: string) => void;
  equipEmotes: (emoteIds: string[]) => void;
  buyAvatar: (avatarId: string) => void;
  loadStoreCatalog: () => void;
  buyCosmetic: (itemId: string) => void;
  equipCosmetic: (cosmeticType: 'frame' | 'name_effect' | 'match_background' | 'ball' | 'intro' | 'victory_effect' | 'answer_effect', itemId: string | null) => void;
  setAvatar: (avatar: string | null) => void;
  setFrame: (frameId: string | null) => void; // profil çerçevesi tak/kaldır
  claimLevelReward: (level: number, track?: 'free' | 'premium') => void; // Seviye Yolu kartından ödül topla
  buyPremiumRoad: () => void; // Premium Yol'u 1000 elmasla aç
  buyPower: (powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken') => void; // mağazadan güç satın al
  // ---- Maç içi Özel Güçler ----
  useSpecialPower: (powerId: string) => void;       // maçta etkinleştir (requestId'yi aksiyon üretir)
  equipSpecialPower: (powerId: string | null) => void; // maça hangi güçle çıkılacağını seç
  markCollectionSeen: (tab: 'emotes' | 'cosmetics' | 'powers') => void; // kırmızı 1 rozetini söndür
  ackSupportMessage: (id: string) => void; // destek popup'ı okundu
  openTournaments: () => void;
  closeTournaments: () => void;
  listTournaments: () => void;
  getLeague: () => void;
  joinTournament: (id: string) => void;
  leaveTournament: (id: string) => void;
  getTournament: (id: string) => void;
  tournamentReady: (matchId: string) => void;
  clearTournamentOver: () => void;
  clearTournamentReady: () => void;
  buySpecialPower: (powerId: string, qty?: number) => void; // mağazadan elmasla al
  clearStreakReward: () => void;
  xoxSubmit: (cell: number, text: string) => void;
  cozkazanSubmit: (text: string) => void;
  cozkazanHint: () => void;
  usePower: (powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken') => void; // envanterdeki tek kullanımlık gücü etkinleştir
  loadMyStats: () => void; // profil istatistiklerini iste (my_stats yanıtı)
  verifyPurchase: (receipt: string, opts?: { productId?: string; isSubscription?: boolean }) => Promise<void>;
  grantAdReward: () => Promise<number>;
  loadFriends: () => void;
  sendFriendRequest: (targetCode?: string, targetUsername?: string) => void;
  respondFriendRequest: (requestId: string, accept: boolean) => void;
  removeFriend: (friendId: string) => void;
  searchUsers: (query: string) => void;
  inviteFriendMatch: (friendId: string, friendName: string, options?: GameOptions) => void;
  respondMatchInvite: (fromId: string, accept: boolean) => void;
  cancelMatchInvite: (toId: string) => void;
  getUserProfile: (userId: string) => void;
  closeUserProfile: () => void;
  clearNotice: () => void;
  clearFriendNotice: () => void;
  dismissMatchInvite: () => void;
  findMatchAgain: () => void;
  loadConversations: () => void;
  openChat: (userId: string) => void;
  closeChat: () => void;
  sendMessage: (toUserId: string, body: string) => void;
  markRead: (fromUserId: string) => void;
  // ---- User-generated-content safety (App Store guideline 1.2) ----
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  listBlocked: () => void;
  reportContent: (userId: string, reason: string, messageId?: string) => void;
  deleteMessage: (messageId: string) => void;
  acceptTerms: () => void;
  typingStart: (toUserId: string) => void;
  typingStop: (toUserId: string) => void;
  leave: () => void;
  logout: () => Promise<void>;
  deleteAccount: () => void;
};

interface Props {
  state: GameState;
  actions: Actions;
  onGoToStore?: (section?: 'socialPack' | 'diamonds') => void;
  onDiamondCelebration?: (celebration: { amount: number; img?: ImageSourcePropType }) => void;
  tutorial?: boolean; // running inside the guided simulation → no emotes, no keyboard autofocus
  onLanguageChange?: () => void;
  onOpenLeaderboard?: () => void; // open the centered leaderboard popup (App-level overlay)
  onOpenMatchHistory?: () => void; // open the centered match-history popup (App-level overlay)
  onOpenLevelRoad?: () => void; // Seviye Yolu tam ekranını aç (App-level modal)
  onLockedSocialMode?: (mode: GameMode) => void; // Social Pack-gated mode tapped; App-level engagement owns the upsell
  overlayBusy?: boolean; // App-katmanı popup zinciri sürüyor mu (XP yağmuru bekler)
  // App'in tutmalı/dönüşlü elmas sayacı — verilirse ana ekran hapı bunu izler
  // (ödül uçuşu sırasında sayaç ödül ÖNCESİ değerde tutulur, iniş sonrası döner)
  gemCountAnimOverride?: Animated.Value;
  // Maç sonrası kupa kutlaması: uçuş bitince sayaç from→to döner (seq artar);
  // uçuş beklerken rozet ESKİ değeri gösterir (trophyHold = delta).
  trophyLand?: { delta: number; seq: number } | null;
  trophyHold?: number | null;
  gemFillAnimOverride?: Animated.Value;
  onGoToFriends?: () => void; // page the tab ScrollView across to the Friends tab
  focusAddFriendSeq?: number; // bumped by App when Home's find-friend card is tapped → Friends focuses its add-friend input
  monetizationDiagnostics?: Record<string, string | number | boolean | null | undefined>;
  // Home sekmesi pager'da GÖRÜNÜR mü — dekoratif sonsuz döngüler (hero konfetisi)
  // sekme ekran dışındayken durdurulur (#8). TabFreeze'in freshOnDeactivate'i
  // sayesinde deaktivasyon karesi bu prop'un false halini ağaca taşır.
  heroAnimsActive?: boolean;
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type PanGestureHandlerStateChangeEvent = { nativeEvent: { state: number; translationX: number; velocityX: number; absoluteY: number } };

// Map a trophy arena to a vector icon (emojis don't render on every device).
function arenaIcon(arena: { minTrophies: number }): IoniconName {
  const t = arena.minTrophies;
  if (t >= 5000) return 'flame';
  if (t >= 3500) return 'trophy';
  if (t >= 2000) return 'ribbon';
  if (t >= 1000) return 'medal';
  if (t >= 500) return 'shield';
  if (t >= 200) return 'shield-half';
  return 'shield-outline';
}

// ============================================================================
// CROSSOVER UI KIT — shared primitives (drop-in replacement)
// Replaces the "---- shared primitives ----" section of app/src/screens.tsx
// (the current block from BTN_FACE through ScreenHeader, ~lines 168–381).
// Relies ONLY on imports already present at the top of screens.tsx:
//   useCallback/useEffect/useRef/useState, type ComponentProps/ReactNode,
//   Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View,
//   Ionicons, Svg + gradient primitives, theme, engrave.
// IoniconName (line ~154) stays where it is.
// Backward compatible: Btn / Chip / GamePanel / GameModal / RankBadge /
// ScreenHeader keep their names and prop contracts; darken() keeps its
// signature. New: lighten, withAlpha, usePressLip, GameSpinner, GameInput,
// GameRow, Ribbon, SectionHeader, EmptyState.
// ============================================================================

// ---- color math ------------------------------------------------------------
// Darken a hex color (for tinted frame bottom-edges). KEEP SIGNATURE — used app-wide.
export function darken(hex: string, amt = 0.34): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Lighten a hex color (top-gloss "hi" stops of button ramps).
function lighten(hex: string, amt = 0.3): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amt);
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt);
  const b = Math.round((n & 255) + (255 - (n & 255)) * amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Translucent version of a hex token. Replaces the banned `color + '55'` pattern.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ---- press physics ----------------------------------------------------------
// THE press standard: 60ms depress in / 110ms release out, native driver.
const PRESS_IN_MS = 60;
const PRESS_OUT_MS = 110;
function usePressLip(depth = 2, feedback?: GameFeedbackEvent | null) {
  const press = useRef(new Animated.Value(0)).current;
  const ty = press.interpolate({ inputRange: [0, 1], outputRange: [0, depth] });
  // A tiny scale-down alongside the lip. The lip alone (a 2px shift) is too subtle
  // to register as feedback; the scale makes every press read as instant.
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.965] });
  const onIn = useCallback(() => {
    if (feedback) triggerFeedback(feedback);
    Animated.timing(press, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start();
  }, [feedback, press]);
  const onOut = useCallback(() => {
    Animated.timing(press, { toValue: 0, duration: PRESS_OUT_MS, useNativeDriver: true }).start();
  }, [press]);
  return { press, ty, scale, onIn, onOut };
}

// Spring press-scale for tile/cell touchables (sticker cells, crest taps).
function usePressScale(to = 0.92, feedback?: GameFeedbackEvent | null) {
  const v = useRef(new Animated.Value(1)).current;
  const onIn = useCallback(() => {
    if (feedback) triggerFeedback(feedback);
    Animated.spring(v, { toValue: to, friction: 5, tension: 300, useNativeDriver: true }).start();
  }, [feedback, v, to]);
  const onOut = useCallback(() => {
    Animated.spring(v, { toValue: 1, friction: 5, tension: 300, useNativeDriver: true }).start();
  }, [v]);
  return { scale: v, onIn, onOut };
}

// ---- GameSpinner ------------------------------------------------------------
// Branded loader: rotating football, 900ms linear loop. Replaces every
// ActivityIndicator. Use color={theme.ink} for the sm variant inside bright faces.
function GameSpinner({ size = 'sm', color = theme.primary }: { size?: 'sm' | 'lg'; color?: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const px = size === 'lg' ? 34 : 18;
  return (
    <Animated.View
      style={{
        width: px + 6, height: px + 6, alignItems: 'center', justifyContent: 'center',
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
      }}
    >
      <Ionicons
        name="football"
        size={px}
        color={color}
        style={{ textShadowColor: theme.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}
      />
    </Animated.View>
  );
}

// ---- PulseRing — the CountdownScreen-dialect hero wait -----------------------
// A beveled ring (top-lit face / dark lip, panelInk base, static soft glow)
// that gently scale-pulses around its subject. Reserved for hero waiting
// moments (searching, opponent picking) per spec §9.
function PulseRing({ size = 120, color = theme.primary, children }: { size?: number; color?: string; children: ReactNode }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const inner = size - 26;
  return (
    <Animated.View
      style={{
        width: size, height: size, borderRadius: size / 2,
        // UNIFORM border color all the way around — per-side (top-light/bottom-dark)
        // colors make iOS render a rounded border as 4 segments with visible seams at
        // the diagonals, so the green ring looked "cut". One color = one continuous ring.
        borderWidth: 4, borderColor: color,
        backgroundColor: theme.panelInk, alignItems: 'center', justifyContent: 'center',
        shadowColor: color, shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 12,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) }],
      }}
    >
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: theme.card, borderWidth: 2, borderColor: withAlpha(color, 0.33), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {children}
      </View>
    </Animated.View>
  );
}

// ---- Btn 3.0 — BROADCAST PRESTIGE ------------------------------------------
// One filled tone face per variant: subtle vertical shade + 1px top light +
// integrated darker bottom slice + colored (variant-dark) soft shadow. NO glass
// dome, NO dark ink outline, NO chunky lip. Label is DARK-ON-FACE (premium),
// except danger (white on red, convention). Press = scale + shadow-collapse + dim.
let _btnSeq = 0;
// `flame` comes from the powers branch (the Sosyal Paket Jetonu power uses it);
// it is expressed in the Broadcast Prestige language here, NOT the old lip ramp.
type BtnKind = 'primary' | 'ghost' | 'accent' | 'blue' | 'danger' | 'purple' | 'flame';
// face color + shadow ink + dark on-face text per variant.
// ---- Kaplamalı (asset) düğme derileri ----
// Kaynak: satın alınan "glossy buttons" seti. Sayfadaki düğmelerin üstünde
// İngilizce yazı BASILI olduğu için yalnız GÖVDE kullanılıyor: sol kapak +
// kelime arasından alınan yazısız orta dilim + sağ kapak birleştirilip 9-dilim
// (capInsets) hâline getirildi — böylece her genişlikte köşeler/eğim bozulmaz,
// yazıyı biz basıyoruz (Türkçe + kendi tipografimiz).
const BTN_SKINS = {
  green:  { src: require('../assets/btn/btn-green.png'),  caps: { top: 17, left: 16, bottom: 17, right: 18 } },
  orange: { src: require('../assets/btn/btn-orange.png'), caps: { top: 17, left: 17, bottom: 17, right: 18 } },
  blue:   { src: require('../assets/btn/btn-blue.png'),   caps: { top: 17, left: 16, bottom: 17, right: 18 } },
} as const;
type BtnSkinName = keyof typeof BTN_SKINS;
// Hangi düğme türü hangi deriyi kullanır. Listede olmayanlar (danger, purple,
// flame) vektör görünümünde kalır — sette o renkler yok, uydurmak yerine
// mevcut dil korunuyor.
const BTN_SKIN_FOR: Partial<Record<BtnKind, BtnSkinName>> = {
  primary: 'green',
  accent: 'orange',
  blue: 'blue',
  ghost: 'blue',
};
// Basılı yazının orijinalindeki gibi: koyu gövde + açık dış hat (okunurluk).
const SKIN_LABEL_COLOR = '#3A1B08';
const SKIN_LABEL_SHADOW = { textShadowColor: 'rgba(255,255,255,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.5 } as const;

const BTN_FACE: Record<Exclude<BtnKind, 'ghost'>, { face: string; sh: string; on: string }> = {
  primary: { face: theme.primary, sh: theme.primaryDark, on: theme.onPrimary },
  accent: { face: theme.accent, sh: theme.accentDark, on: theme.onAccent },
  blue: { face: theme.blue, sh: theme.blueDark, on: theme.onBlue },
  purple: { face: theme.purple, sh: theme.purpleDark, on: theme.onPurple },
  flame: { face: theme.flame, sh: theme.flameDark, on: theme.onFlame },
  danger: { face: theme.danger, sh: theme.dangerDark, on: '#FFFFFF' },
};

export function Btn({
  label,
  onPress,
  kind = 'primary',
  disabled,
  icon,
  big,
  compact,
  loading,
  tint,
  badge,
  gem,
  feedback,
}: {
  label: string;
  onPress: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  icon?: IoniconName;
  big?: boolean;
  compact?: boolean; // NEW: dense variant for price pills / inline CTAs
  loading?: boolean; // NEW: GameSpinner replaces icon, press inert, no layout change
  tint?: string;     // NEW: ghost-only ring/fill tint (e.g. theme.danger for a danger ghost)
  badge?: string;    // NEW: fixed-width tabular-nums ink pill beside the label (countdowns)
  gem?: boolean;     // NEW: gem-price button — the crystal logo sits before the label ("💎 300")
  feedback?: GameFeedbackEvent;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const btnGid = useRef(`btn${_btnSeq++}`).current;
  const ghost = kind === 'ghost';
  const fv = BTN_FACE[(kind as Exclude<BtnKind, 'ghost'>)] ?? BTN_FACE.primary;
  const inert = Boolean(disabled || loading);
  const ghostTint = tint ?? theme.primary;
  const skinName = BTN_SKIN_FOR[kind];
  const skin = skinName ? BTN_SKINS[skinName] : undefined;
  const skinH = big ? 60 : compact ? 44 : 52;
  // Disabled = tone shift to surface1 at FULL geometry (no layout jump).
  const face = disabled ? theme.surface1 : fv.face;
  // Prestige: DARK-on-face label (danger keeps white). Ghost/disabled → text/muted.
  // Kaplamalı gövdede yazı, setin orijinalindeki gibi koyu + açık dış hatlı.
  const fg = disabled ? theme.muted : skin ? SKIN_LABEL_COLOR : ghost ? (tint ?? theme.text) : fv.on;
  const radius = big ? 14 : compact ? 10 : 12;
  // Press = scale + shadow-collapse + slight dim (no chunky translate).
  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.972] });
  const pressDim = press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.10] });
  const padV = big ? 16 : compact ? 9 : 13;
  const font = big ? 17 : compact ? 13 : 15;
  const iconSz = big ? 23 : compact ? 15 : 19;
  const emboss = skin ? SKIN_LABEL_SHADOW : {}; // kaplamada açık dış hat, düz yüzde kabartma yok
  void icon; // decorative icons intentionally not rendered inside buttons
  // Exception: `gem` — a PRICE button must show what currency it charges, so the
  // crystal logo (the same GemIcon as the HUD counter) sits right before the number.
  const content = (
    <>
      {loading ? (
        <View style={{ marginRight: compact ? 6 : 8 }}>
          <GameSpinner size="sm" color={fg} />
        </View>
      ) : null}
      {!loading && gem ? (
        <View style={{ marginRight: compact ? 5 : 7 }}>
          <GemIcon size={iconSz} />
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{ color: fg, fontSize: font, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.3, flexShrink: 1, ...emboss }}
      >
        {label}
      </Text>
      {badge != null ? (
        <View style={{ marginLeft: 8, minWidth: 34, alignItems: 'center', borderRadius: 9, backgroundColor: withAlpha(theme.ink, 0.3), paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: compact ? 11 : 12, fontVariant: ['tabular-nums'] }}>{badge}</Text>
        </View>
      ) : null}
    </>
  );
  const feedbackEvent = feedback ?? (kind === 'danger' ? GameFeedbackEvent.UI_DESTRUCTIVE : gem ? GameFeedbackEvent.UI_PURCHASE : kind === 'ghost' ? GameFeedbackEvent.UI_SECONDARY : big ? GameFeedbackEvent.UI_PRIMARY : GameFeedbackEvent.UI_TAP);
  return (
    <Pressable
      disabled={inert}
      onPressIn={() => {
        if (!inert) triggerFeedback(feedbackEvent);
        Animated.timing(press, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start();
      }}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: PRESS_OUT_MS, useNativeDriver: true }).start()}
      onPress={inert ? undefined : onPress}
      style={{ marginVertical: 6, borderRadius: radius }}
    >
      {skin && !inert ? (
        // Kaplamalı gövde: 9-dilim asset (capInsets) + kendi yazımız.
        // Yükseklik sabit tutulur ki dikey kapaklar (üst kavis + alt dudak)
        // ezilmesin; genişlik esner, orta dilim yatayda uzar.
        <Animated.View style={{ transform: [{ scale: pressScale }], height: skinH, justifyContent: 'center' }}>
          <Image
            source={skin.src}
            resizeMode="stretch"
            capInsets={skin.caps}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: undefined, height: undefined }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 8 }}>
            {content}
          </View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#04091A', opacity: pressDim, borderRadius: radius }]} />
        </Animated.View>
      ) : ghost ? (
        // Ghost: the ONE sanctioned thin outline (1.5px tint), transparent body.
        <Animated.View
          style={{
            transform: [{ scale: pressScale }],
            borderRadius: radius,
            borderWidth: 1.5,
            borderColor: disabled ? withAlpha(theme.border, 0.6) : withAlpha(ghostTint, 0.9),
            paddingVertical: big ? 14 : compact ? 7 : 11,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: ghostTint, opacity: press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }) }]} />
          {content}
        </Animated.View>
      ) : (
        // Prestige face: filled tone + subtle vertical shade, 1px top light, 2px
        // integrated bottom slice, colored (variant-dark) soft shadow that
        // collapses on press. No glass dome, no ink outline, no chunky lip.
        // iOS clips a layer's own shadow when overflow:'hidden' sits on the same
        // node → GamePanel split: outer casts the shadow, inner face clips.
        <Animated.View
          style={{
            transform: [{ scale: pressScale }],
            backgroundColor: face,
            borderRadius: radius,
            ...(disabled
              ? null
              : { shadowColor: fv.sh, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 }),
          }}
        >
          <View
            style={{
              backgroundColor: face,
              borderRadius: radius,
              paddingVertical: padV,
              paddingHorizontal: 18,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              ...(disabled ? { borderWidth: 1, borderColor: withAlpha(theme.border, 0.6) } : null),
            }}
          >
            {!disabled ? (
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgGradient id={btnGid} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={lighten(face, 0.1)} />
                    <Stop offset="1" stopColor={darken(face, 0.13)} />
                  </SvgGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#${btnGid})`} />
              </Svg>
            ) : null}
            {!disabled ? (
              <>
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: '#FFFFFF', opacity: 0.16 }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: darken(face, 0.4), opacity: 0.85 }} />
              </>
            ) : null}
            {content}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#04091A', opacity: pressDim }]} />
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

// ---- Chip 2.0 ---------------------------------------------------------------
// Mini-bevel option chip with real press physics. `active` = selected state.
function Chip({ icon, label, onPress, active = false }: { icon: IoniconName; label: string; onPress: () => void; active?: boolean }) {
  // Prestige chip: tone-ladder selection (surface2 → surface3), no ring. Active
  // reads from a filled lighter face + primary label + a 2.5px bottom focus bar.
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        // iOS clips a layer's own shadow under overflow:'hidden' → GamePanel
        // split: outer carries shadowRow, inner face carries the clip + strips.
        <View
          style={{
            backgroundColor: active ? theme.surface3 : theme.surface2,
            borderRadius: 12,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            ...shadowRow,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              backgroundColor: active ? theme.surface3 : theme.surface2,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 6,
              overflow: 'hidden',
            }}
          >
            {/* 1px top light + integrated bottom slice — depth without a frame */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: active ? 0.16 : 0.08 }} />
            {active ? <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, backgroundColor: theme.primary }} /> : null}
            <Ionicons name={icon} size={14} color={active ? theme.primary : theme.textSub} />
            <Text numberOfLines={1} style={{ color: active ? theme.text : theme.textSub, fontSize: 11, fontFamily: 'Poppins-ExtraBold', flexShrink: 1 }}>
              {label}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ---- Game design kit: framed panel + centered pop-in modal + rank badge ----
let _gpSeq = 0;
// Reusable framed surface (THE panel): outer frame ring → beveled face
// (+ optional top-lit gloss for hero panels) → optional left accent stripe.
// UNCHANGED — this is the reference surface every card/row is rebuilt on.
function GamePanel({ children, hero = false, tint, accentStripe, compact = false, style, bodyStyle }: {
  children: ReactNode; hero?: boolean; tint?: string; accentStripe?: string; compact?: boolean; style?: any; bodyStyle?: any;
}) {
  const gid = useRef(`gp${_gpSeq++}`).current;
  const r = compact ? 14 : 18;
  // Prestige surface: depth from the tone ladder + a 1px top photon + an
  // integrated bottom slice + a soft NAVY shadow — never a drawn ink frame.
  const face = hero ? theme.surface3 : theme.surface2;
  const sh = hero ? shadowRaised : compact ? shadowRow : shadowSoft;
  const stripe = accentStripe ?? tint;
  return (
    // Düğmelerle AYNI anatomi: koyu dış kontur → yüz. Paneller eskiden konturusuz
    // düz yüzeylerdi; parlak/kalın düğmelerin yanında şekil dili tutmuyordu.
    <View style={[{ backgroundColor: theme.shadowInk, borderRadius: r + 3, padding: 2.5, ...sh }, style]}>
      <View style={[{ backgroundColor: face, borderRadius: r, overflow: 'hidden', padding: 12 }, bodyStyle]}>
        {hero ? (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lighten(face, 0.08)} />
                <Stop offset="1" stopColor={darken(face, 0.1)} />
              </SvgGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gid})`} />
          </Svg>
        ) : null}
        {/* 1px top light + 2px integrated bottom slice */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: '#FFFFFF', opacity: hero ? 0.16 : 0.08 }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.3 }} />
        {stripe ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: stripe }} /> : null}
        {children}
      </View>
    </View>
  );
}

// ---- GameModal — THE dialog. Native Alert.alert is banned for game flows. ----
// Spring pop-in + 160ms animated exit (scale/fade, scrim fades with it) +
// pressed close gem. Keeps the Modal mounted during the exit animation.
// ---- SafeModal — TÜM native pencerelerin tek kapısı ----
// iOS'ta AYNI SEVİYEDEKİ iki modalı aynı anda sunmak UIKit'in sunum zincirini
// kilitler: ekranda görünmez bir modal kalır, tüm dokunuşlar ölür ("uygulama
// donuyor", çökme kaydı yok). Burada sunum modalTraffic slotundan geçer; slot
// doluysa pencere SIRAYA girer ve öndeki kapanınca açılır.
//
// İÇ İÇE pencereler MUAF: bir modalın kendi ağacındaki modal (ör. Seviye
// Yolu'nun içindeki onay penceresi) iOS'ta yasal bir zincirdir — onu da
// sıraya alsaydık asla açılamaz, özellik ölürdü. Derinlik context ile taşınır.
const ModalDepthCtx = createContext(0);

function SafeModal({ visible = true, children, onRequestClose, ...rest }: ModalProps) {
  const depth = useContext(ModalDepthCtx);
  const nested = depth > 0;
  // TABLETTE TAŞMA DÜZELTMESİ: modal içeriği, ölçekli tuvalin (ScaledRoot)
  // transform'unu miras alır ama düzenini GERÇEK pencere genişliğine (ör.
  // 1032pt) göre kurar; sonra 1.48x büyüyünce ekranın dışına taşar ve
  // kenarlardan kesilir. İçeriği tuval ölçüsüne kilitleyip ortalıyoruz —
  // ölçekten sonra ekranı tam doldurur.
  const win = useWindowDimensions();
  const canvas = canvasSizeFor(win.width, win.height);
  const needsCanvasBox = canvas.width !== win.width;
  const [present, setPresent] = useState(false);
  // Kapanış türü trafik kapısına bildirilir: "none" pencereler (çoğunluk)
  // anında kapanır → sıradaki pencere 340ms değil ~100ms sonra açılır.
  const animatedDismiss = rest.animationType === 'slide' || rest.animationType === 'fade';
  const wasVisibleRef = useRef(false);
  useLayoutEffect(() => {
    if (visible || wasVisibleRef.current) dismissActiveInput();
    wasVisibleRef.current = visible;
  }, [visible]);
  const handleRequestClose = useCallback<NonNullable<ModalProps['onRequestClose']>>((event) => {
    dismissActiveInput();
    onRequestClose?.(event);
  }, [onRequestClose]);
  // useLayoutEffect (2026-08-10): pasif effect'le bu kapı HER pencereye boyadan
  // önce +1 boş commit ekliyordu (ilk commit <Modal visible={false}> = native'de
  // hiçbir şey). Layout effect'te setPresent aynı kare içinde senkron flush
  // edilir → sunum isteği dokunulan karede çıkar. Kuyruk anlamı DEĞİŞMEZ:
  // gövde bire bir aynı — slot boşsa whenModalSlotFree geri çağırmayı zaten
  // senkron çalıştırır, doluysa geri çağırma yine sonradan (zamanlayıcıdan)
  // gelir ve iptal fonksiyonu aynen cleanup olarak döner.
  useLayoutEffect(() => {
    if (!visible) { setPresent(false); return undefined; }
    if (nested) { setPresent(true); return undefined; }
    return whenModalSlotFree(() => setPresent(true), animatedDismiss);
  }, [visible, nested, animatedDismiss]);
  return (
    <Modal {...rest} visible={present} onRequestClose={handleRequestClose}>
      <ModalDepthCtx.Provider value={depth + 1}>
        {needsCanvasBox ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: canvas.width, height: canvas.height }}>{children}</View>
          </View>
        ) : children}
      </ModalDepthCtx.Provider>
    </Modal>
  );
}

export function GameModal({ visible, onClose, onExited, onShown, title, icon, danger = false, coach = false, dismissible = true, children }: {
  // onShown: native sunum GERÇEKTEN tamamlandığında (RN Modal onShow) çağrılır.
  // "Bu pencere sunulduktan SONRA sunulmalı" el sıkışmaları (ör. StoreKit
  // sayfası) kör zamanlayıcı yerine bu olaya bağlanır — modalTraffic pencereyi
  // sıraya alsa bile olay sunumdan önce asla gelmez.
  // dismissible=false: zorunlu pencere — çarpı yok, karartmaya dokunmak ve
  // Android geri tuşu kapatmaz. Tek çıkış içerideki eylem düğmesidir (ör. "Al").
  visible: boolean; onClose: () => void; onExited?: () => void; onShown?: () => void; title?: string; icon?: IoniconName; danger?: boolean; coach?: boolean; dismissible?: boolean; children: ReactNode;
}) {
  const a = useRef(new Animated.Value(0)).current;
  // Karartma KARTTAN AYRI koşar (büyük-stüdyo kalıbı, araştırma 2026-08-11):
  // backdrop ~140ms'de biter, kart 0.92→1 ölçekle ~200ms kuyruksuz ease-out
  // (cubic-bezier(0.22,1,0.36,1)) oturur. Eski yayın ~450ms kuyruğu karartmayı
  // kart yerleştikten SONRA da koyulaştırıyordu — "arkasında bir şey açılıyor
  // gibi kararıyor" hissinin kökü buydu.
  const scrim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;
  // Kimliği sabit sarmalayıcı: Modal'a her render'da yeni onShow gitmesin.
  const handleShow = useCallback(() => { onShownRef.current?.(); }, []);
  const handleClose = useCallback(() => {
    if (!dismissible) return; // zorunlu pencere: karartma/geri tuşu yutulur
    dismissActiveInput();
    onClose();
  }, [dismissible, onClose]);
  const wasVisibleRef = useRef(false);
  useLayoutEffect(() => {
    if (visible || wasVisibleRef.current) dismissActiveInput();
    wasVisibleRef.current = visible;
  }, [visible]);
  // Sunum sırası SafeModal'da (modalTraffic) — burada yalnız animasyon durumu.
  // useLayoutEffect (2026-08-10): pasif gate sunumdan önce 2 boş commit yiyordu
  // (visible → null → mounted → Modal visible=false → present) ve giriş o görünmez
  // commit'lerde başlıyordu. Senkron flush ile mount + SafeModal sunum isteği +
  // girişin başlangıcı aynı kare paketinde: ilk kare = ilk görünen kare.
  // Çıkış effect'i pasif KALIR — kapanış animasyonu boya sonrası başlayabilir.
  useLayoutEffect(() => {
    if (!visible) return;
    setMounted(true);
    Animated.timing(a, { toValue: 1, duration: 200, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
    Animated.timing(scrim, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [visible, a, scrim]);
  useEffect(() => {
    if (visible) return;
    Animated.timing(scrim, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(a, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        onExitedRef.current?.(); // exit animation done — safe to hand off (no timer chains)
      }
    });
  }, [visible, a, scrim]);
  if (!mounted) return null;
  const clamped = a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  // Pencere dili artık DÜĞMELERLE aynı aileden (satın alınan glossy set):
  // kalın koyu kontur + iç açık pah + üst parlaklık + sıcak alt dudak. Eskiden
  // pencereler ince-hairline "yayın grafiği" dilindeydi, düğmeler kalın oyuncak
  // dilinde — ikisi bir arada yamalı duruyordu ("ne alaka bu buton bu UI").
  const strip = danger ? theme.danger : coach ? theme.primary : theme.accent;
  // Düğme setinden ölçülen tonlar: dış kontur #79380C sınıfı koyu kahve-siyah,
  // alt dudak sıcak turuncu (#AF773C), üst kenar açık.
  const FRAME = '#0B1428';
  const LIP = darken(strip, 0.35);
  return (
    <SafeModal visible transparent animationType="none" onRequestClose={handleClose} onShow={handleShow}>
      {/* Karartma KENDİ değeriyle (scrim) sürülür: 140ms'de oturur ve kartın
          hareketinden bağımsızdır. Kartın opacity'sine bağlıyken karartma da
          kartın uzun kuyruğunu izliyordu — "arkasında bir şey açılıyor gibi
          kararıyor" hissinin kaynağı buydu. */}
      <Animated.View style={{ flex: 1, backgroundColor: theme.scrim, opacity: scrim }}>
        {/* Klavye açılınca ortalanmış kart kalan alana göre YUKARI kalkar —
            içindeki input'lu pencerelerde (Günün Crossover'ı, geri bildirim)
            GÖNDER butonu klavyenin altında kalmasın (rapor 2026-08-27). */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        {/* Inert the instant `visible` flips false — the 160ms exit must not be
            hit-testable (double-tapped confirms re-fired actions, e.g. double gem charges) */}
        <Pressable pointerEvents={visible ? 'auto' : 'none'} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }} onPress={dismissible ? () => { triggerFeedback(GameFeedbackEvent.UI_CLOSE); handleClose(); } : undefined}>
          <Animated.View
            pointerEvents={visible ? 'auto' : 'none'}
            style={{
              width: '100%', maxWidth: 360,
              // 0.92→1: büyük-stüdyo kalıbı. Eski 0.82 + yay, kartı uzaktan
              // fırlatıp yerine oturtuyordu; kısa ölçek + kuyruksuz eğri
              // "yerinde beliriyor" hissi verir (araştırma 2026-08-11).
              transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
              opacity: clamped,
              // DÜĞME ANATOMİSİ (üç katman): koyu dış kontur → sıcak pah → yüz.
              // Düğmelerde kontur her yanı sarar ve altta kalınlaşır; pencereler
              // eskiden ince hairline'dı, bu yüzden yan yana yamalı duruyordu.
              backgroundColor: FRAME, borderRadius: 28, padding: 3.5, paddingBottom: 6,
              ...shadowModal,
            }}
          >
            <View style={{ backgroundColor: LIP, borderRadius: 24, padding: 2.5, paddingBottom: 4 }}>
            {/* clip (mood band + corners) lives HERE, not on the shadow-casting
                face above — iOS masksToBounds would kill the modal drop shadow */}
            <Pressable onPress={() => {}} style={{ backgroundColor: theme.modalFace, borderRadius: 21, overflow: 'hidden' }}>
              {!danger ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: '#FFFFFF', opacity: 0.16, zIndex: 6 }} /> : null}
              {title ? (
                <View style={{ backgroundColor: strip, paddingLeft: 18, paddingRight: dismissible ? 54 : 18, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden' }}>
                  <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: '#FFFFFF', opacity: 0.34 }} />
                  <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, backgroundColor: darken(strip, 0.42) }} />
                  {icon ? <Ionicons name={icon} size={17} color={SKIN_LABEL_COLOR} /> : null}
                  <Text numberOfLines={1} style={{ color: SKIN_LABEL_COLOR, fontFamily: 'Poppins-ExtraBold', fontSize: 15, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 1, ...SKIN_LABEL_SHADOW }}>{title}</Text>
                </View>
              ) : null}
              <View style={{ padding: 20, paddingTop: title ? 16 : 20, gap: 12 }}>{children}</View>
              {dismissible ? (
              <Pressable
                onPress={handleClose}
                onPressIn={() => triggerFeedback(GameFeedbackEvent.UI_CLOSE)}
                hitSlop={8}
                style={({ pressed }) => ({
                  position: 'absolute', top: title ? 7 : 12, right: 12, width: 32, height: 32, borderRadius: 16,
                  backgroundColor: title ? darken(strip, 0.3) : theme.well,
                  borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.3)',
                  alignItems: 'center', justifyContent: 'center', zIndex: 5,
                  transform: [{ scale: pressed ? 0.9 : 1 }],
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Ionicons name="close" size={16} color={title ? SKIN_LABEL_COLOR : theme.textSub} />
              </Pressable>
              ) : null}
            </Pressable>
            </View>
          </Animated.View>
        </Pressable>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeModal>
  );
}

// ---- RankBadge ---------------------------------------------------------------
function RankBadge({ rank, size = 28 }: { rank: number; size?: number }) {
  if (rank <= 3) {
    const c = [theme.gold, theme.silver, theme.bronze][rank - 1]!;
    return (
      // Glow rides the outer wrapper — overflow:'hidden' on the face (needed to
      // clip the strips) kills a layer's own shadow on iOS. Top-light + bottom
      // slice replace the per-side borders, which seam at the diagonals on a circle.
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, shadowColor: c, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 5 }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: '#FFFFFF', opacity: 0.16 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: darken(c) }} />
          <Text style={{ color: theme.ink, fontFamily: 'Poppins-Black', fontSize: size * 0.46 }}>{rank}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ color: theme.muted, fontFamily: 'Poppins-ExtraBold', fontSize: size * 0.42 }}>{rank}</Text>
    </View>
  );
}

// ---- ScreenHeader — now with a live back button ------------------------------
function ScreenHeader({ title, onBack, icon, right }: {
  title: string; onBack?: () => void; icon?: IoniconName; right?: ReactNode;
}) {
  return (
    <View style={{ alignSelf: 'stretch', marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: theme.surface1 }}>
      {onBack ? (
        <Pressable
          onPress={() => { dismissActiveInput(); onBack(); }}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 13,
            backgroundColor: theme.surface2,
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            transform: [{ scale: pressed ? 0.94 : 1 }],
            ...shadowRow,
          })}
        >
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
      ) : <View style={{ width: 40 }} />}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        {icon ? <Ionicons name={icon} size={18} color={theme.accent} /> : null}
        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 18, letterSpacing: 0.5, textTransform: 'uppercase', ...engrave('lg') }}>{title}</Text>
      </View>
      {right ?? <View style={{ width: 40 }} />}
      </View>
      {/* integrated hairline base — a light-catching edge, not an ink frame */}
      <View pointerEvents="none" style={{ height: 1, backgroundColor: theme.shadowInk, opacity: 0.35 }} />
      <View pointerEvents="none" style={{ height: 1, backgroundColor: '#FFFFFF', opacity: 0.04 }} />
    </View>
  );
}

// ---- GameInput — THE text input (recessed well + animated focus halo) --------
// Replaces styles.searchBox / modalSearchBox / friendInput. Forward-compatible
// with all TextInput props; `icon` renders a leading glyph inside the well;
// `inputRef` reaches the underlying TextInput (imperative focus flows).
type TextInputEventHandler = (event: any) => void;

function useInputFocusLifecycle(onFocus?: TextInputEventHandler, onBlur?: TextInputEventHandler) {
  const focusedRef = useRef(false);
  useEffect(() => () => {
    if (focusedRef.current) dismissActiveInput();
  }, []);
  const handleFocus = useCallback((e: any) => {
    focusedRef.current = true;
    onFocus?.(e);
  }, [onFocus]);
  const handleBlur = useCallback((e: any) => {
    focusedRef.current = false;
    onBlur?.(e);
  }, [onBlur]);
  return useMemo(() => ({ onFocus: handleFocus, onBlur: handleBlur }), [handleFocus, handleBlur]);
}

function GameInput({ icon, error = false, containerStyle, style, onFocus, onBlur, inputRef, ...rest }: TextInputProps & {
  icon?: IoniconName; error?: boolean; containerStyle?: any; inputRef?: Ref<TextInput>;
}) {
  const [focused, setFocused] = useState(false);
  const focusLifecycle = useInputFocusLifecycle(
    (e) => { triggerFeedback(GameFeedbackEvent.UI_TAP); setFocused(true); onFocus?.(e); },
    (e) => { setFocused(false); onBlur?.(e); },
  );
  const tick = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(tick, { toValue: focused ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [focused, tick]);
  const accent = error ? theme.danger : theme.focusBar;
  // Prestige input: a recessed well (darkest tone) that reads sunken from an
  // inner top-shadow. Focus = a left accent tick + a whisper wash — NO ring, NO
  // outer glow halo. Error keeps the same language in danger red.
  return (
    <View style={[{ marginVertical: 6 }, containerStyle]}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: theme.well, // recessed inner well
          borderRadius: 14, overflow: 'hidden',
          paddingHorizontal: 14,
        }}
      >
        {/* inner top shadow — sells the recess without a drawn frame */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
        {/* focus/error wash + left accent tick */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: error ? withAlpha(theme.danger, 0.08) : theme.selectWash, opacity: error ? 1 : tick }]} />
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent, opacity: error ? 1 : tick }} />
        {icon ? <Ionicons name={icon} size={16} color={focused || error ? accent : theme.muted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          ref={inputRef}
          placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
          rejectResponderTermination={false}
          {...rest}
          onFocus={focusLifecycle.onFocus}
          onBlur={focusLifecycle.onBlur}
          style={[{ flex: 1, color: theme.text, paddingVertical: 13, fontSize: 14, fontFamily: 'Poppins-SemiBold' }, style]}
        />
      </View>
    </View>
  );
}

// ---- GameRow — THE beveled list row -------------------------------------------
// Raised row bevel + leading icon gem + optional chevron/selected/locked states
// + 2px press-lip physics. Replaces clubRow / modalRow / menu rows / lbRow etc.
function GameRow({ icon, iconColor = theme.accent, leading, label, sublabel, right, chevron = false, onPress, selected = false, locked = false, tint, style, children }: {
  icon?: IoniconName; iconColor?: string; leading?: ReactNode; label: string; sublabel?: string; right?: ReactNode; chevron?: boolean;
  onPress?: () => void; selected?: boolean; locked?: boolean; tint?: string; style?: any; children?: ReactNode;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] });
  const dim = press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.06] });
  const onIn = useCallback(() => {
    triggerFeedback(locked ? GameFeedbackEvent.UI_DISABLED : GameFeedbackEvent.UI_CARD);
    Animated.timing(press, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start();
  }, [locked, press]);
  const onOut = useCallback(() => Animated.timing(press, { toValue: 0, duration: PRESS_OUT_MS, useNativeDriver: true }).start(), [press]);
  const check = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (selected) Animated.spring(check, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    else Animated.timing(check, { toValue: 0, duration: 120, useNativeDriver: true }).start();
  }, [selected, check]);
  const face = selected ? theme.surface3 : theme.surface2;
  const fgLabel = locked ? theme.muted : theme.text;
  const body = (
    // iOS clips a layer's own shadow under overflow:'hidden' → GamePanel split:
    // outer carries shadowRow (+ caller style), inner face carries the clip.
    <Animated.View
      style={[{
        transform: [{ scale }],
        backgroundColor: face, borderRadius: 14, marginVertical: 4,
        ...shadowRow,
      }, style]}
    >
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 11,
          backgroundColor: face, borderRadius: 14, overflow: 'hidden',
          paddingVertical: 12, paddingHorizontal: 12,
        }}
      >
      {/* prestige depth: top light + integrated bottom slice (no ring) */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: selected ? 0.14 : 0.07 }} />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.selectWash }]} /> : null}
      {selected ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3.5, backgroundColor: theme.primary }} /> : tint ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3.5, backgroundColor: tint }} /> : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#04091A', opacity: dim }]} />
        {leading || icon ? (
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.well, alignItems: 'center', justifyContent: 'center' }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.05, borderTopLeftRadius: 11, borderTopRightRadius: 11 }} />
            {leading ?? <Ionicons name={icon!} size={18} color={locked ? theme.muted : iconColor} />}
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: fgLabel, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{label}</Text>
          {sublabel ? <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', marginTop: 1 }}>{sublabel}</Text> : null}
          {children}
        </View>
        {locked ? (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="lock-closed" size={12} color={theme.onAccent} />
          </View>
        ) : selected ? (
          <Animated.View style={{ transform: [{ scale: check }] }}>
            <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
          </Animated.View>
        ) : (
          right ?? (chevron ? <Ionicons name="chevron-forward" size={16} color={theme.muted} /> : null)
        )}
      </View>
    </Animated.View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
      {body}
    </Pressable>
  );
}

// ---- Ribbon — beveled badge (POPULAR / NEW / ACTIVE / WON / +12) --------------
function Ribbon({ label, color = theme.accent, icon, style }: { label: string; color?: string; icon?: IoniconName; style?: any }) {
  const fg = color === theme.danger ? theme.text : theme.ink;
  return (
    // Btn 3.0 recipe: colored glow rides the outer wrapper (overflow:'hidden'
    // clips a layer's own shadow on iOS); top-light + integrated bottom slice
    // replace the per-side borders, which seam mid-arc on rounded corners.
    <View style={[{ alignSelf: 'flex-start', backgroundColor: color, borderRadius: 8, shadowColor: color, shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4 }, style]}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 3,
          backgroundColor: color, borderRadius: 8, paddingHorizontal: 8,
          paddingTop: 4, paddingBottom: 5, // old paddingVertical 3 + removed 1px/2px borders — same footprint
          overflow: 'hidden',
        }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.16 }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: darken(color, 0.4), opacity: 0.85 }} />
        {icon ? <Ionicons name={icon} size={10} color={fg} /> : null}
        <Text style={{ color: fg, fontSize: 9.5, fontFamily: 'Poppins-Black', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
      </View>
    </View>
  );
}

// ---- SectionHeader — one section-label voice for every screen ------------------
function SectionHeader({ label, icon, color = theme.muted, style }: { label: string; icon?: IoniconName; color?: string; style?: any }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 6 }, style]}>
      {icon ? <Ionicons name={icon} size={13} color={color === theme.muted ? theme.accent : color} /> : null}
      <Text style={{ color, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 2, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.hairline }} />
    </View>
  );
}

// ---- EmptyState — crafted emptiness (icon gem + title + hint + optional CTA) ---
function EmptyState({ icon, title, hint, cta, style }: { icon: IoniconName; title: string; hint?: string; cta?: ReactNode; style?: any }) {
  return (
    <View style={[{ alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 18 }, style]}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.well, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
        <Ionicons name={icon} size={28} color={theme.muted} />
      </View>
      <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') }}>{title}</Text>
      {hint ? <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 18 }}>{hint}</Text> : null}
      {cta ?? null}
    </View>
  );
}

// Subtle football-pitch lines behind every screen for a stadium feel.

// Clean, inviting background — a soft sky-like vertical gradient (lighter at top)
// with two faint warm/cool glows. Replaces the old football-pitch pattern.
// Full-screen patterned background (navy, Clash-Royale-like): deep-blue gradient
// + a faint diagonal stripe pattern + soft glows. Sits behind every screen.
// Tuval boyutu: tablette gerçek pencere değil, ölçeklenen telefon tuvali
// (App.tsx ScaledRoot) — animasyon/ızgara matematiği bunun içinde kalmalı.
// Ölçekli tuvalin ölçüsü — bileşen içi Dimensions okumaları bunu kullanır.
function canvasSize(): { width: number; height: number } {
  const { width, height } = Dimensions.get('window');
  return canvasSizeFor(width, height);
}

const SCREEN_W = canvasSize().width;
const SCREEN_H = canvasSize().height;
export const BG_TOP = '#0E2347'; // navy shown behind the bg image (frame before load / root)
export type BgVariant = 'home' | 'stadium' | 'store' | 'menu' | 'match';
const BG_HOME = require('../assets/bg-home.png');   // royal-blue arena backdrop (legacy home)
// Faint ball watermark for the hero Play button (mockup's green face).
const BALL_WATERMARK = require('../assets/ball-card-white.png');
// XOX kupa ekseni görselleri — gerçek kupa fotoğrafları (kullanıcının Kupa.jpeg'i,
// 2026-08-30): CL=Şampiyonlar Ligi, WC=Dünya Kupası, EL=Avrupa/UEFA Kupası. Şeffaf zemin.
const TROPHY_IMG: Record<string, number> = {
  CL: require('../assets/trophies/cl.png'),
  WC: require('../assets/trophies/wc.png'),
  EL: require('../assets/trophies/el.png'),
  BDOR: require('../assets/trophies/bdor.png'), // Ballon d'Or (2026-08-30)
};
// XOX birleşik logo (combo) görselleri — iki takımın birleşik arması (2026-08-30).
// Hücre = İKİ takımda DA oynamış oyuncu. Şeffaf zemin.
const COMBO_IMG: Record<string, number> = {
  BARCA_REAL: require('../assets/combos/barca_real.png'),
  BAYERN_DORTMUND: require('../assets/combos/bayern_dortmund.png'),
  CITY_UNITED: require('../assets/combos/city_united.png'),
};
// Hero Play button face, sampled from the mockup.
const HERO_PLAY_MID = '#198C65';
const HERO_PLAY_LIP = '#073E2D';   // deeper than the face's #0B5B42 foot
const BG_STORE = require('../assets/bg-store.png');  // violet gem-shop backdrop (Mağaza)
const BG_MENU = require('../assets/bg-menu.png');    // calm navy backdrop (collection/friends/sub-screens)
// Night-stadium photograph behind HOME v4 — the one asset the whole home look rests
// on. Swap this file to re-dress the screen; nothing else references it.
const BG_STADIUM = require('../assets/bg-stadium.jpg');
const BG_VARIANT = { home: BG_HOME, stadium: BG_STADIUM, store: BG_STORE, menu: BG_MENU } as const;
// Per-screen background. 'match' = flat solid colour (no pattern).
//
// Two shade recipes. The painted variants (home/store/menu) already bake their own
// vignette + weave, so they need only a whisper of top/bottom shade. 'stadium' is a
// PHOTOGRAPH with its own highlights, so it gets a much heavier scrim over the two
// bands the chrome sits in — that is what keeps the HUD and tab bar legible no
// matter which photo is dropped in.
export function ScreenBg({ variant = 'menu' }: { variant?: BgVariant }) {
  if (variant === 'match') {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />;
  }
  const photo = variant === 'stadium';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Explicit width/height — NOT bare absoluteFill. With only inset-based bounds
          the image ignores resizeMode and paints at its intrinsic point size anchored
          top-left (a source with no @2x/@3x suffix is treated as 1x, so bg-stadium.jpg
          is 1080×2400 POINTS). The painted backdrops are near-uniform so this never
          showed; a photograph makes it obvious — only its top third would be on screen. */}
      <Image source={BG_VARIANT[variant]} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" />
      <Svg width="100%" height="100%">
        <Defs>
          <SvgGradient id="bgshade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#04060F" stopOpacity={0.32} />
            <Stop offset="0.22" stopColor="#04060F" stopOpacity={0.04} />
            <Stop offset="0.80" stopColor="#04060F" stopOpacity={0.02} />
            <Stop offset="1" stopColor="#04060F" stopOpacity={0.08} />
          </SvgGradient>
          <SvgGradient id="bgphoto" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#06101F" stopOpacity={0.78} />
            <Stop offset="0.13" stopColor="#06101F" stopOpacity={0.34} />
            <Stop offset="0.42" stopColor="#06101F" stopOpacity={0.14} />
            <Stop offset="0.72" stopColor="#06101F" stopOpacity={0.18} />
            <Stop offset="0.90" stopColor="#06101F" stopOpacity={0.38} />
            <Stop offset="1" stopColor="#06101F" stopOpacity={0.76} />
          </SvgGradient>
          <SvgGradient id="bgstripe" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.038} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.012} />
          </SvgGradient>
        </Defs>
        {/* Baturalp'in diyagonal ince çizgileri (origin/main) — bgshade/bgphoto üstünü örter */}
        {Array.from({ length: 30 }).map((_, i) => {
          const x = -SCREEN_W + i * 72;
          return (
            <Line
              key={`stripe-${i}`}
              x1={x}
              y1={0}
              x2={x + SCREEN_H * 1.25}
              y2={SCREEN_H}
              stroke="url(#bgstripe)"
              strokeWidth={1.2}
            />
          );
        })}
        <Rect x="0" y="0" width="100%" height="100%" fill={photo ? 'url(#bgphoto)' : 'url(#bgshade)'} />
      </Svg>
    </View>
  );
}

function Screen({ children, scroll, bg, pad, contentCenter = true, fillTablet = false, lockWhenFits = false, lockScroll = false, header, keyboardShouldPersistTaps = 'handled', scrollRef }: { children: ReactNode; scroll?: boolean; noPitch?: boolean; bg?: ReactNode; pad?: number; contentCenter?: boolean; fillTablet?: boolean; lockWhenFits?: boolean; lockScroll?: boolean; header?: ReactNode; keyboardShouldPersistTaps?: ComponentProps<typeof ScrollView>['keyboardShouldPersistTaps']; scrollRef?: Ref<ScrollView> }) {
  // iPad = telefon düzeninin ORTALANMIŞ hâli (kullanıcı kuralı, layout.ts).
  // `fillTablet` (dikey yayma) BİLEREK devre dışı: kartların arasını açıp
  // telefondan farklı bir ekran üretiyordu. Prop imzada kalıyor — çağrı yerleri
  // dokunulmadan kaldı ve ileride tekrar istenirse tek yerden açılır.
  void fillTablet;
  const isTablet = useIsTablet();
  const maxW = useContentMaxWidth();
  // lockWhenFits: measured, not assumed — scrolling turns off only when the
  // content genuinely fits the viewport, so small phones keep scrolling.
  const [vpH, setVpH] = useState(0);
  const [contentH, setContentH] = useState(0);
  useEffect(() => () => dismissActiveInput(), []);
  // Keyboard-aware by default so inputs/buttons never get covered by the keyboard.
  return (
    <KeyboardAvoidingView
      style={[styles.screen, !contentCenter && { justifyContent: 'flex-start' }, pad !== undefined && { padding: pad }]}
      // Scroll screens let the ScrollView's `automaticallyAdjustKeyboardInsets` do the
      // work (it insets AND scrolls the focused input above the keyboard); only fixed
      // (non-scroll) screens need the KAV to pad. Running both double-shifts the layout
      // and was pushing the submit button under the keyboard ("gönderme kısmı gidiyor").
      behavior={Platform.OS === 'ios' && !scroll ? 'padding' : undefined}
      // No keyboardVerticalOffset: the KAV measures its own frame in ABSOLUTE window
      // coordinates, so the app root's safe-area top padding is already reflected there.
      // Adding insets.top double-counted it — over-padding by the notch height and
      // leaving a dead band above the keyboard that hid the lower rows (the bottom teams
      // in the picker showed as a grey gap the keyboard "ate").
      keyboardVerticalOffset={0}
    >
      {/* Optional fixed backdrop BEHIND the scroll content (covers the app's default
          ScreenBg). Rendered outside the ScrollView so it never scrolls. */}
      {bg ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>{bg}</View> : null}
      {/* Keyboard dismiss: a backdrop Pressable BEHIND the content. It never wraps the
          children (so no layout shift) and sits under the ScrollViews (so it never
          intercepts scroll); tapping empty background area still dismisses. Scroll-area
          taps are handled by each ScrollView's keyboardShouldPersistTaps="handled". */}
      <Pressable style={StyleSheet.absoluteFill} onPress={dismissActiveInput} accessible={false} />
      {/* Sabit başlık (opsiyonel): ScrollView'ın DIŞINDA, üstünde çizilir. Böylece
          içindeki üst bar KAYDIRILMAZ ve içeriğin scroll bütçesine EKLENMEZ; ayrıca
          takılı çerçevenin tacı/ödül habercisi ScrollView üst-kenarına kırpılmadan
          KAV padding'i + güvenli-alan boşluğuna yukarı taşabilir (bkz. HomeScreen). */}
      {header ? (maxW ? <View style={{ width: '100%', maxWidth: maxW, alignSelf: 'center' }}>{header}</View> : header) : null}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          onLayout={(e) => setVpH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_w, h) => setContentH(h)}
          scrollEnabled={!lockScroll && (!lockWhenFits || contentH > vpH + 2)}
          bounces={!lockScroll}
          alwaysBounceVertical={!lockScroll}
          overScrollMode={lockScroll ? 'never' : 'auto'}
          // ANDROID İÇ KAYDIRMA (oyuncu raporu 2026-08-29: "Android'de mağaza
          // HİÇ kaymıyor, koleksiyona atıyor"): sekmeler yatay bir pager'ın
          // içinde yaşıyor ve o pager'ın eksen kilidi (directionalLockEnabled)
          // YALNIZ iOS'ta çalışıyor. Android'de dikey sürükleme yatay pager'a
          // kaçıyordu; nestedScrollEnabled iç dikey kaydırıcıya öncelik verir.
          nestedScrollEnabled
          contentContainerStyle={{ flexGrow: 1, justifyContent: contentCenter ? 'center' : 'flex-start' }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
        >
          {maxW ? <View style={{ width: '100%', maxWidth: maxW, alignSelf: 'center' }}>{children}</View> : children}
        </ScrollView>
      ) : (
        maxW ? <View style={{ flex: 1, width: '100%', maxWidth: maxW, alignSelf: 'center' }}>{children}</View> : children
      )}
    </KeyboardAvoidingView>
  );
}

// ---- Swipeable intro / onboarding (shown on first launch) ----

const INTRO_SLIDES: { icon: IoniconName; color: string; titleKey: MessageKey | null; descKey: MessageKey }[] = [
  { icon: 'football', color: theme.primary, titleKey: null, descKey: 'intro.slide1.desc' }, // hero slide = the real brand block
  { icon: 'flash', color: theme.accent, titleKey: 'intro.slide2.title', descKey: 'intro.slide2.desc' },
  { icon: 'trophy', color: theme.gold, titleKey: 'intro.slide3.title', descKey: 'intro.slide3.desc' },
];

// Beveled onboarding skip chip — card face on a cardLip lip, chevron glyph,
// press physics. ONE recipe shared by IntroScreen and TutorialScreen.
function SkipChip({ onPress, style }: { onPress: () => void; style?: any }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={style}>
      {({ pressed }) => (
        // iOS clips a layer's own shadow under overflow:'hidden' → GamePanel
        // split: outer carries shadowRow, inner face carries the clip.
        <View style={{ backgroundColor: theme.surface2, borderRadius: 12, transform: [{ scale: pressed ? 0.97 : 1 }], ...shadowRow }}>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: theme.surface2,
              borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7,
              borderTopWidth: 1, borderTopColor: theme.topLight,
              overflow: 'hidden',
            }}
          >
            {pressed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#04091A', opacity: 0.1 }]} /> : null}
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12, ...engrave('sm') }}>{t('common.skip')}</Text>
            <Ionicons name="chevron-forward" size={12} color={theme.muted} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const INTRO_TILE = 150;
function IntroSlide({ slide, index, active, scrollX }: { slide: (typeof INTRO_SLIDES)[number]; index: number; active: boolean; scrollX: Animated.Value }) {
  const inputRange = [(index - 1) * SCREEN_W, index * SCREEN_W, (index + 1) * SCREEN_W];
  const scale = scrollX.interpolate({ inputRange, outputRange: [0.55, 1, 0.55], extrapolate: 'clamp' });
  const opacity = scrollX.interpolate({ inputRange, outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' });
  return (
    <View style={{ width: SCREEN_W, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
      <Animated.View style={{ transform: [{ scale }], opacity, alignItems: 'center' }}>
        {slide.titleKey === null ? (
          <>
            {/* Slide 1 hero — the REAL brand mark + the splash wordmark voice */}
            <BrandMark size={INTRO_TILE} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, marginBottom: 18 }}>
              {SLAM_WORD.split('').map((ch, i) => (
                <Text key={i} style={{ color: theme.text, fontSize: Math.min(30, SCREEN_W * 0.076), letterSpacing: 3, marginHorizontal: 2, includeFontPadding: false, fontFamily: 'Poppins-Black', ...engrave('lg') }}>{ch}</Text>
              ))}
            </View>
          </>
        ) : (
          <>
            {/* Slides 2–3 — badge tile in the Broadcast Prestige idiom: panelInk
                face + uniform slide-color ring + 1px top-light + integrated bottom
                slice; navy shadow rides the outer wrapper because overflow:'hidden'
                (needed for the strips + ShineSweep) clips a layer's own shadow on
                iOS. One-shot ShineSweep when the page gains focus. */}
            <View style={{ backgroundColor: theme.panelInk, borderRadius: INTRO_TILE * 0.24, marginBottom: 26, shadowColor: theme.shadowInk, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
              <View
                style={{
                  width: INTRO_TILE, height: INTRO_TILE, borderRadius: INTRO_TILE * 0.24,
                  backgroundColor: theme.panelInk,
                  borderWidth: 2, borderColor: slide.color,
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}
              >
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.16 }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: darken(slide.color) }} />
                <Ionicons name={slide.icon} size={72} color={slide.color} />
                {active ? <ShineSweep width={INTRO_TILE} height={INTRO_TILE} delay={260} duration={700} opacity={0.3} band={0.3} /> : null}
              </View>
            </View>
            <Text style={{ color: theme.text, fontSize: 26, fontFamily: 'Poppins-Black', letterSpacing: 1, textAlign: 'center', marginBottom: 12, ...engrave('lg') }}>{t(slide.titleKey)}</Text>
          </>
        )}
        <Text style={{ color: theme.muted, fontSize: 15, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 23 }}>{t(slide.descKey)}</Text>
      </Animated.View>
    </View>
  );
}

export function IntroScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const scRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const last = INTRO_SLIDES.length - 1;
  const next = () => {
    if (page < last) scRef.current?.scrollTo({ x: (page + 1) * SCREEN_W, animated: true });
    else onDone();
  };
  return (
    // Same painted stage as splash → login, so first launch reads as one scene.
    <OpeningBackdrop>
      <View style={{ flex: 1, alignSelf: 'stretch' }}>
        {/* ONE soft per-slide tint glow, crossfaded continuously by scrollX (§14 —
            the three layers overlap in place; only ~one is ever lit). */}
        {INTRO_SLIDES.map((s, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute', top: '14%', alignSelf: 'center',
              width: SCREEN_W * 1.3, height: SCREEN_W * 1.3, borderRadius: SCREEN_W * 0.65,
              backgroundColor: s.color,
              opacity: scrollX.interpolate({
                inputRange: [(i - 1) * SCREEN_W, i * SCREEN_W, (i + 1) * SCREEN_W],
                outputRange: [0, 0.11, 0],
                extrapolate: 'clamp',
              }),
            }}
          />
        ))}
        <SkipChip onPress={onDone} style={{ position: 'absolute', top: insets.top + 8, right: 22, zIndex: 10 }} />
        <Animated.ScrollView
          ref={scRef as never}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
            listener: (e: { nativeEvent: { contentOffset: { x: number } } }) =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)),
          })}
          style={{ flex: 1 }}
        >
          {INTRO_SLIDES.map((s, i) => (
            <IntroSlide key={i} slide={s} index={i} active={i === page} scrollX={scrollX} />
          ))}
        </Animated.ScrollView>
        {/* Page dots — continuous width/color morph driven straight off scrollX
            (scaleX on a left-and-right-centered pill; no state snap). */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
          {INTRO_SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * SCREEN_W, i * SCREEN_W, (i + 1) * SCREEN_W];
            return (
              <View key={i} style={{ width: 24, height: 8, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: theme.border }} />
                <Animated.View
                  style={{
                    width: 24, height: 8, borderRadius: 4, backgroundColor: theme.primary,
                    opacity: scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' }),
                    transform: [{ scaleX: scrollX.interpolate({ inputRange, outputRange: [0.34, 1, 0.34], extrapolate: 'clamp' }) }],
                  }}
                />
              </View>
            );
          })}
        </View>
        <View style={{ paddingHorizontal: 28, paddingBottom: Math.max(insets.bottom, 24) + 10 }}>
          <Btn label={page === last ? t('common.start') : t('common.next')} icon={page === last ? 'rocket' : 'arrow-forward'} kind="primary" big onPress={next} />
        </View>
      </View>
    </OpeningBackdrop>
  );
}

// ---- Animated branded splash ----
// The REAL brand mark — the shipped app icon (black tile, white+green interlocked
// rings), rounded-masked. Never rebuild the logo as synthetic SVG (spec §14);
// the `glow` prop is retained for call-site compatibility but ignored.
// giriş.jpeg mockup'ından çıkarılan şeffaf logo işareti (balonlar + yıldırım +
// konfeti). Plaka/zemin YOK — işaret doğrudan sahne arka planının üstünde durur.
// (Kullanıcı onayı: koyu plakalı amblem reddedildi — "arkasında siyah olmayacak".)
const LOGO_MARK = require('../assets/logo-mark.png');
const LOGO_MARK_AR = 267 / 328; // kaynak png en-boy oranı
function BrandMark({ size = 104 }: { size?: number; glow?: boolean }) {
  return (
    <Image
      source={LOGO_MARK}
      style={{ width: size, height: size * LOGO_MARK_AR }}
      resizeMode="contain"
    />
  );
}

// The opening stage = the SAME painted arena backdrop every other screen uses.
// One hero art reused everywhere is what real studios ship; synthetic
// gradient/blob scenes are banned (spec §14).
function OpeningBackdrop({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: BG_TOP, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <ScreenBg />
      {children}
    </View>
  );
}

// One-shot or looping diagonal light sweep. Absolutely fills its parent (which
// must be overflow:'hidden'); pass the parent's numeric width/height.
let _shineSeq = 0;
function ShineSweep({ width, height, delay = 0, duration = 650, loop = false, loopGap = 1400, opacity = 0.45, band = 0.3, tint = '#FFFFFF' }: {
  width: number; height: number; delay?: number; duration?: number; loop?: boolean; loopGap?: number; opacity?: number; band?: number; tint?: string;
}) {
  const gid = useRef(`shine${_shineSeq++}`).current;
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = loop
      ? Animated.loop(Animated.sequence([
          Animated.delay(delay),
          Animated.timing(x, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(loopGap),
        ]))
      : Animated.sequence([
          Animated.delay(delay),
          Animated.timing(x, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]);
    anim.start();
    return () => anim.stop();
  }, []);
  const bandW = Math.max(26, width * band);
  const bandH = height * 2.2;
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-bandW * 1.6, width + bandW * 0.6] });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', top: -height * 0.6, width: bandW, height: bandH, opacity, transform: [{ translateX }, { rotate: '18deg' }] }}>
        <Svg width={bandW} height={bandH}>
          <Defs>
            <SvgGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={tint} stopOpacity="0" />
              <Stop offset="0.5" stopColor={tint} stopOpacity="1" />
              <Stop offset="1" stopColor={tint} stopOpacity="0" />
            </SvgGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gid})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

// ---- "MATCHUP" opening: the emblem's two halves rush in from opposite edges —
// blue bubble from the LEFT, red bubble from the RIGHT — and COLLIDE at centre,
// assembling the mark (the split runs through the bolt, so the lightning
// completes on impact: they've been "matched"). Pop, shake, ring, sparks; then
// CROSSOVER stamps in letter-by-letter and a gold shine sweeps the wordmark.
// The loading screen then raises its bottom kit under this same composition.
// Native driver only; a fixed timer fires onDone so the splash never blocks.
const SLAM_TOTAL_MS = 2500;
const SLAM_WORD = 'CROSSOVER';
// Dev/StrictMode yeniden mount'unda stinger'ın İKİ KEZ çalmasını engeller;
// soğuk açılışta modül tazelendiği için her gerçek açılışta bir kez çalar.
let splashIntroStartedOnce = false;

// Studio byline under the wordmark — rendered on every screen that shows the
// CROSSOVER lockup (splash / loading / login) so the brand block never changes
// between scenes.
const BRAND_BYLINE = 'BY Games';
function BrandByline({ style, ready = true }: { style?: object; ready?: boolean }) {
  // FOUT guard (same as the wordmark): before Poppins loads, render a
  // weight-matched SYSTEM font so "BY Games" never flashes from a thin fallback
  // and then snaps to ExtraBold. Once fonts are ready, use the real face.
  return (
    <Text style={[{ color: theme.muted, fontSize: 12.5, letterSpacing: 5, fontFamily: ready ? 'Poppins-ExtraBold' : undefined, fontWeight: ready ? undefined : '800', marginTop: 7, includeFontPadding: false, ...engrave('sm') }, style]}>
      {BRAND_BYLINE}
    </Text>
  );
}
// giriş.jpeg oranları: geniş harf aralıklı, daha ufak beyaz logotip + büyük işaret
const SLAM_FONT = Math.min(30, SCREEN_W * 0.074);
const SLAM_WM_W = Math.min(SCREEN_W * 0.88, 380);
const SLAM_BADGE = Math.min(SCREEN_W * 0.46, 188);
const SLAM_BADGE_H = SLAM_BADGE * LOGO_MARK_AR;
// Impact sparks: angle (deg, -90 = straight up), distance, size, color.
// Restraint per spec §14: a handful of debris kicks, not a firework.
const SLAM_SPARKS: { a: number; d: number; s: number; c: string }[] = [
  { a: -64, d: 104, s: 5, c: theme.text },
  { a: -116, d: 108, s: 5, c: theme.text },
  { a: -8, d: 142, s: 7, c: theme.accent },
  { a: -172, d: 142, s: 7, c: theme.primary },
  { a: 22, d: 98, s: 4, c: theme.text },
  { a: 158, d: 98, s: 4, c: theme.text },
  { a: -90, d: 148, s: 4, c: theme.text },
];

export function SplashScreen({ onDone, fontsReady = true, onFirstFrameReady }: { onDone?: () => void; fontsReady?: boolean; onFirstFrameReady?: () => void }) {
  const veil = useRef(new Animated.Value(1)).current;      // navy cover → fades out
  const fly = useRef(new Animated.Value(0)).current;       // both halves rush in 0→1 (contact)
  const impact = useRef(new Animated.Value(0)).current;    // horizontal squeeze & recover
  const shake = useRef(new Animated.Value(0)).current;     // stage shake
  const ring1 = useRef(new Animated.Value(0)).current;     // mint impact ring
  const burst = useRef(new Animated.Value(0)).current;     // spark burst + core flash
  const letters = useRef(SLAM_WORD.split('').map(() => new Animated.Value(0))).current;
  const fired = useRef(false);
  // The exit timer must call the LATEST onDone, not the mount-time closure.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onFirstFrameReadyRef = useRef(onFirstFrameReady);
  onFirstFrameReadyRef.current = onFirstFrameReady;
  const firstFrameSent = useRef(false);
  const laidOut = useRef(false);
  const sendFirstFrameReady = useCallback(() => {
    if (firstFrameSent.current || !fontsReady || !laidOut.current) return;
    firstFrameSent.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => onFirstFrameReadyRef.current?.()));
  }, [fontsReady]);
  const handleFirstLayout = useCallback(() => {
    laidOut.current = true;
    sendFirstFrameReady();
  }, [sendFirstFrameReady]);
  useEffect(() => { sendFirstFrameReady(); }, [sendFirstFrameReady]);

  useEffect(() => {
    const anim = Animated.sequence([
      // 0–640ms: lights up; the two halves accelerate in from opposite edges
      Animated.parallel([
        Animated.timing(veil, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(120),
          Animated.timing(fly, { toValue: 1, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      // 640ms: IMPACT — the halves meet, the bolt completes: squeeze, shake,
      // ring, sparks; letters stamp in from 980ms
      Animated.parallel([
        Animated.timing(impact, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(shake, { toValue: 1, duration: 300, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(ring1, { toValue: 1, duration: 430, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(340),
          Animated.stagger(55, letters.map((v) =>
            Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(3)), useNativeDriver: true }),
          )),
        ]),
      ]),
    ]);
    anim.start();
    // COF_Premium_Logo_Sting_5s: 5 saniyelik stinger BİLEREK tam çalar — splash
    // 2.5sn'de biter, sesin kuyruğu yükleme ekranının üstünde doğal olarak sürer.
    // Görsel kurguya DOKUNULMAZ (143/144'teki intro birebir korunur).
    if (!splashIntroStartedOnce) {
      splashIntroStartedOnce = true;
      triggerFeedback(GameFeedbackEvent.SPLASH_ELECTRIC_IMPACT);
    }
    // Arka plana düşerse stinger susar (dönüşte çift ses binmez).
    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'background') stopSplashStinger();
    });
    // Hard, network-independent exit: the animation is scenery, the timer is the contract.
    const tm = setTimeout(() => {
      if (!fired.current) { fired.current = true; onDoneRef.current?.(); }
    }, SLAM_TOTAL_MS);
    return () => { clearTimeout(tm); appSub.remove(); anim.stop(); };
  }, []);

  // Each half slides on X only (straight left/right, per the matchup metaphor);
  // a slight lean straightens out exactly at contact so the seam lands clean.
  const leftTX = fly.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_W * 0.72, 0] });
  const rightTX = fly.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_W * 0.72, 0] });
  const leftRot = fly.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '0deg'] });
  const rightRot = fly.interpolate({ inputRange: [0, 1], outputRange: ['10deg', '0deg'] });
  // Horizontal collision physics on the ASSEMBLED mark: squeezed from the sides,
  // it compresses in X / bulges in Y, then springs back.
  const squeezeX = impact.interpolate({ inputRange: [0, 0.22, 0.55, 1], outputRange: [1, 0.9, 1.05, 1] });
  const squeezeY = impact.interpolate({ inputRange: [0, 0.22, 0.55, 1], outputRange: [1, 1.08, 0.97, 1] });
  const shakeTX = shake.interpolate({ inputRange: [0, 0.25, 0.55, 0.8, 1], outputRange: [0, -4, 3, -2, 0] });
  const shakeTY = shake.interpolate({ inputRange: [0, 0.18, 0.42, 0.66, 0.85, 1], outputRange: [0, 7, -5, 3, -1, 0] });
  const HALF_W = SLAM_BADGE / 2;
  return (
    <View style={{ flex: 1, backgroundColor: BG_TOP }} onLayout={handleFirstLayout}>
    <OpeningBackdrop>
      <Animated.View style={{ alignItems: 'center', transform: [{ translateX: shakeTX }, { translateY: shakeTY }] }}>
        {/* badge (two clipped halves that assemble at centre) + impact FX */}
        <View style={{ width: SLAM_BADGE * 1.4, height: SLAM_BADGE_H + 26, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={{ flexDirection: 'row', transform: [{ scaleX: squeezeX }, { scaleY: squeezeY }] }}>
            {/* LEFT half — the blue bubble (+ the bolt's left edge), in from the left */}
            <Animated.View style={{ width: HALF_W, height: SLAM_BADGE_H, overflow: 'hidden', transform: [{ translateX: leftTX }, { rotate: leftRot }] }}>
              <Image source={LOGO_MARK} style={{ position: 'absolute', left: 0, top: 0, width: SLAM_BADGE, height: SLAM_BADGE_H }} resizeMode="contain" />
            </Animated.View>
            {/* RIGHT half — the red bubble (+ the bolt's right edge), in from the right */}
            <Animated.View style={{ width: HALF_W, height: SLAM_BADGE_H, overflow: 'hidden', transform: [{ translateX: rightTX }, { rotate: rightRot }] }}>
              <Image source={LOGO_MARK} style={{ position: 'absolute', left: -HALF_W, top: 0, width: SLAM_BADGE, height: SLAM_BADGE_H }} resizeMode="contain" />
            </Animated.View>
          </Animated.View>
          {/* impact anchor (zero-size, centered on the seam — the collision point) */}
          <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
            {/* white-hot core flash right where the bolt completes */}
            <Animated.View style={{ position: 'absolute', left: -34, top: -34, width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFFFF', opacity: burst.interpolate({ inputRange: [0, 0.08, 0.4, 1], outputRange: [0, 0.6, 0, 0], extrapolate: 'clamp' }), transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.7] }) }] }} />
            <Animated.View style={{ position: 'absolute', left: -70, top: -70, width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: theme.primary, opacity: ring1.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.85, 0], extrapolate: 'clamp' }), transform: [{ scale: ring1.interpolate({ inputRange: [0, 1], outputRange: [0.35, 2.4] }) }] }} />
            {SLAM_SPARKS.map((p, i) => {
              const rad = (p.a * Math.PI) / 180;
              const dx = Math.cos(rad) * p.d;
              const dy = Math.sin(rad) * p.d;
              return (
                <Animated.View
                  key={i}
                  style={{
                    position: 'absolute', left: -p.s / 2, top: -p.s / 2, width: p.s, height: p.s, borderRadius: p.s / 2, backgroundColor: p.c,
                    opacity: burst.interpolate({ inputRange: [0, 0.1, 0.65, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
                    transform: [
                      { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                      { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
                      { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }) },
                    ],
                  }}
                />
              );
            })}
          </View>
        </View>

        {/* wordmark: letters stamp in, then a gold shine sweeps across */}
        <View style={{ width: SLAM_WM_W, alignItems: 'center', marginTop: 22 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            {SLAM_WORD.split('').map((ch, i) => (
              <Animated.Text
                key={i}
                style={{
                  color: theme.text, fontSize: SLAM_FONT, letterSpacing: 3, marginHorizontal: 2, includeFontPadding: false,
                  fontFamily: fontsReady ? 'Poppins-Black' : undefined, fontWeight: fontsReady ? undefined : '900',
                  ...engrave('lg'),
                  opacity: letters[i]!.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
                  transform: [
                    { translateY: letters[i]!.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                    { scale: letters[i]!.interpolate({ inputRange: [0, 1], outputRange: [1.7, 1] }) },
                  ],
                }}
              >
                {ch}
              </Animated.Text>
            ))}
          </View>
          <ShineSweep width={SLAM_WM_W} height={SLAM_FONT * 1.4} delay={1900} duration={620} tint={theme.accent} opacity={0.3} band={0.24} />
          {/* byline fades in with the last stamped letter — but stays hidden until
              fonts are ready so "BY Games" never appears in a fallback face first */}
          <Animated.View style={{ opacity: fontsReady ? letters[letters.length - 1]! : 0 }}>
            <BrandByline ready={fontsReady} />
          </Animated.View>
        </View>
      </Animated.View>
      {/* fade-from-navy veil (on top of everything) — mockup zemininde siyah yok */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, opacity: veil }]} />
    </OpeningBackdrop>
    </View>
  );
}

// ---- Loading screen (Clash-Royale-style bar) shown on entry; warms the logo cache ----
// Same stage as the splash (OpeningBackdrop + BrandMark + wordmark) so
// splash → login → loading reads as one continuous scene. The brand block
// renders already in place — the splash just showed the same composition, so
// re-fading it in would read as a double-take; only the bottom kit animates up.
const LOADING_TIPS: MessageKey[] = ['loading.tip1', 'loading.tip2', 'loading.tip3', 'loading.tip4'];
const LOAD_BAR_H = 24;
const LOAD_BAR_W = SCREEN_W - 48;      // bottom block spans 24px side margins
const LOAD_BAR_INNER = LOAD_BAR_W - 4; // minus the well's 2px padding per side — there is no frame border; -8 left the slab 4px short of the track at 100%
export function LoadingScreen({ state, actions, onReady }: Props & { onReady: () => void }) {
  const [pct, setPct] = useState(0);
  const done = useRef(false);
  const prefetched = useRef(false);
  const tipKey = useRef(LOADING_TIPS[Math.floor((state.profile?.trophies ?? 0) % LOADING_TIPS.length)] ?? LOADING_TIPS[0]!).current;
  const kit = useRef(new Animated.Value(0)).current;   // bottom kit (tip card + bar) entrance
  const float = useRef(new Animated.Value(0)).current; // idle badge bob
  const fill = useRef(new Animated.Value(0)).current;  // native-driver slab glide toward pct
  const blink = useRef(new Animated.Value(0)).current; // full-bar white punctuation at 100%

  // Pull the popular clubs so their crests warm the image cache before pick time.
  useEffect(() => { actions.searchClubs(''); }, []);
  useEffect(() => {
    if (prefetched.current) return;
    const urls = state.clubResults.map((c) => c.logoUrl).filter(Boolean) as string[];
    if (urls.length) {
      prefetched.current = true;
      urls.forEach((u) => { Image.prefetch(u).catch(() => {}); });
    }
  }, [state.clubResults]);

  // Fill the bar 0→100 over ~2.5s (100ms x 25 tik — istek: 0.5sn daha yavas,
  // intro stinger'in kuyrugu sayac bitmeden tamamlanir); at 100% blink, enter home.
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        const next = Math.min(100, p + 4);
        if (next >= 100 && !done.current) {
          done.current = true;
          Animated.sequence([
            Animated.timing(blink, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(blink, { toValue: 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ]).start();
          setTimeout(onReady, 320);
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Glide the fill slab toward the current % — a native-driver translateX so the
  // bar moves smoothly BETWEEN the 80ms ticks instead of stepping 4% at a time.
  useEffect(() => {
    Animated.timing(fill, { toValue: pct / 100, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [pct]);

  useEffect(() => {
    Animated.timing(kit, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <OpeningBackdrop>
      {/* brand block — pixel-identical to the splash's final frame (same badge box,
          per-letter wordmark, underline and margins) so the cut is invisible.
          justifyContent + marginTop MUST match the splash ('center' / 22): a
          mismatch here made the emblem visibly jump ~15px at the hard cut. */}
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: SLAM_BADGE * 1.4, height: SLAM_BADGE_H + 26, alignItems: 'center', justifyContent: 'center' }}>
          {/* mockup'ta zemin gölgesi yok */}
          <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -3, 0] }) }] }}>
            <BrandMark size={SLAM_BADGE} />
          </Animated.View>
        </View>
        <View style={{ width: SLAM_WM_W, alignItems: 'center', marginTop: 22 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            {SLAM_WORD.split('').map((ch, i) => (
              <Text key={i} style={{ color: theme.text, fontSize: SLAM_FONT, letterSpacing: 3, marginHorizontal: 2, includeFontPadding: false, fontFamily: 'Poppins-Black', ...engrave('lg') }}>{ch}</Text>
            ))}
          </View>
          <BrandByline />
        </View>
      </View>

      {/* bottom: CR-style tip card + beveled glossy progress bar */}
      <Animated.View style={{ position: 'absolute', left: 24, right: 24, bottom: 56, gap: 14, opacity: kit, transform: [{ translateY: kit.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <GamePanel compact bodyStyle={{ padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.well, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="bulb" size={18} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.accent, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1.4 }}>{t('loading.tipLabel')}</Text>
              <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', lineHeight: 17, marginTop: 2 }}>{t(tipKey)}</Text>
            </View>
          </View>
        </GamePanel>

        <View style={{ height: LOAD_BAR_H, borderRadius: 13, backgroundColor: theme.well, padding: 2, justifyContent: 'center' }}>
          <View style={{ flex: 1, borderRadius: 10, backgroundColor: theme.well, overflow: 'hidden' }}>
            {/* glossy mint fill slab (full width, slid in from the left on the native
                driver): top gloss + dark lip + hot leading cap + looping shine */}
            <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: LOAD_BAR_INNER, borderRadius: 10, backgroundColor: theme.primary, overflow: 'hidden', transform: [{ translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-LOAD_BAR_INNER, 0] }) }] }}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '46%', backgroundColor: 'rgba(255,255,255,0.32)', borderTopLeftRadius: 10, borderTopRightRadius: 10 }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: theme.primaryDark, opacity: 0.85 }} />
              <View style={{ position: 'absolute', top: 2, bottom: 2, right: 2, width: 6, borderRadius: 3, backgroundColor: lighten(theme.primary, 0.55), opacity: 0.9 }} />
              <ShineSweep width={LOAD_BAR_INNER} height={LOAD_BAR_H - 8} loop delay={350} duration={900} loopGap={900} opacity={0.35} band={0.22} />
            </Animated.View>
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: blink.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) }]} />
          </View>
          <Text style={{ position: 'absolute', alignSelf: 'center', color: theme.text, fontSize: 12, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.5, ...engrave('sm') }}>{pct}%</Text>
        </View>
      </Animated.View>
    </OpeningBackdrop>
  );
}

// ---- Interactive first-time tutorial (101 Plus-style guided simulation) ----
const TUT_TEAMS = ['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor', 'Real Madrid', 'Barcelona'];

// Real club crests (Transfermarkt CDN) so the simulation looks like the real game.
const TM = (id: number) => `https://tmssl.akamaized.net/images/wappen/head/${id}.png`;
// Fake data driving the real match screens during the tutorial.
const TUT_CLUBS: ClubRef[] = [
  { id: 141, name: 'Galatasaray', logoUrl: TM(141) },
  { id: 36, name: 'Fenerbahçe', logoUrl: TM(36) },
  { id: 114, name: 'Beşiktaş', logoUrl: TM(114) },
  { id: 418, name: 'Real Madrid', logoUrl: TM(418) },
  { id: 131, name: 'Barcelona', logoUrl: TM(131) },
  { id: 449, name: 'Trabzonspor', logoUrl: TM(449) },
];
const TUT_A: ClubRef = { id: 141, name: 'Galatasaray', logoUrl: TM(141) };
const TUT_B: ClubRef = { id: 418, name: 'Real Madrid', logoUrl: TM(418) };
// Wesley Sneijder's career — shown on the tutorial result screen.
const TUT_CAREER = [
  { clubId: 610, clubName: 'Ajax', logoUrl: TM(610), startYear: 2002, endYear: 2007 },
  { clubId: 418, clubName: 'Real Madrid', logoUrl: TM(418), startYear: 2007, endYear: 2009 },
  { clubId: 46, clubName: 'Inter', logoUrl: TM(46), startYear: 2009, endYear: 2013 },
  { clubId: 141, clubName: 'Galatasaray', logoUrl: TM(141), startYear: 2013, endYear: 2017 },
  { clubId: 417, clubName: 'Nice', logoUrl: TM(417), startYear: 2017, endYear: 2018 },
];
const TUT_SPELL_A = [TUT_CAREER[3]!]; // Galatasaray
const TUT_SPELL_B = [TUT_CAREER[1]!]; // Real Madrid
const TUT_PROFILE = {
  userId: 'you', displayName: 'Sen', trophies: 0, diamonds: 0, wins: 0, losses: 0,
  selectedAvatar: 'pp7', ownedAvatars: [],
  ownedEmotes: [], equippedEmotes: [], usernameSet: true, socialPackUntil: null,
  arena: { name: 'Mahalle Sahası', icon: '🏟️', minTrophies: 0 }, avatar: 'pp7',
  xp: 0, level: 1, selectedFrame: null, claimedLevels: [],
};

// Centered coach gate — the GameModal "coach" vocabulary as an in-screen overlay:
// panelInk outer ring, mint frame (danger after a wrong guess) with a darkened
// bottom bevel, card face on a cardLip lip, and a mint mini-banner carrying the
// step label. theme.scrim fades in 180ms alongside the card spring; closing
// animates out (no frame-cut unmounts, spec §11).
function CoachGate({ visible, wrong, stepLabel, body, cta, ctaIcon, onPress }: {
  visible: boolean; wrong: boolean; stepLabel: string; body: string; cta: string; ctaIcon: IoniconName; onPress: () => void;
}) {
  const a = useRef(new Animated.Value(0)).current;     // card spring
  const scrim = useRef(new Animated.Value(0)).current; // 180ms scrim fade
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
        Animated.timing(scrim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(a, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(scrim, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible, a, scrim]);
  if (!mounted && !visible) return null;
  // Corporate-clean coach card: flat dark surface, hairline border, small caps
  // step label, one flat CTA. (The old gold-banner + mascot-circle + chunky-lip
  // treatment read as toylike — user feedback.)
  const accent = wrong ? theme.danger : theme.primary;
  const ctaFg = wrong ? theme.text : theme.ink;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, {
        backgroundColor: theme.scrim,
        opacity: scrim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, zIndex: 30,
      }]}
    >
      <Animated.View
        style={{
          width: '100%',
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          backgroundColor: theme.modalFace, borderRadius: 18, borderTopWidth: 1, borderTopColor: theme.topLight,
          paddingVertical: 24, paddingHorizontal: 22, alignItems: 'center',
          ...shadowModal,
        }}
      >
        <Text style={{ color: accent, fontFamily: 'Poppins-ExtraBold', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>{stepLabel}</Text>
        <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-SemiBold', lineHeight: 23, textAlign: 'center', marginBottom: 18 }}>{body}</Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({ alignSelf: 'stretch', height: 50, borderRadius: 12, backgroundColor: accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.88 : 1 })}
        >
          <Text style={{ color: ctaFg, fontSize: 16, fontFamily: 'Poppins-ExtraBold' }}>{cta}</Text>
          <Ionicons name={ctaIcon} size={18} color={ctaFg} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// Slim top interaction hint — beveled primary-ring chip that slides down + fades
// in over 200ms when the gate closes, and fades out when it reopens.
function TutorialHint({ visible, text }: { visible: boolean; text: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(a, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } else {
      Animated.timing(a, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible, a]);
  if ((!mounted && !visible) || !text) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        // Anchored to the BOTTOM: the compact pick/guess tops left no clear band
        // up there — at top:96 the bubble sat on the player bar + title row.
        // The lower third is empty in both tutorial steps, so it floats there.
        position: 'absolute', bottom: 96, left: 16, right: 16, alignItems: 'center',
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      <View style={{ backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.primary, paddingVertical: 10, paddingHorizontal: 16, maxWidth: '100%' }}>
        <Text style={{ color: theme.text, fontSize: 13.5, lineHeight: 20, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{text}</Text>
      </View>
    </Animated.View>
  );
}

// One-shot celebration burst behind the tutorial's final CTA — six mint/gold
// debris kicks (≤7 particles, celebration moment only — spec §14).
const TUT_SPARKS: { a: number; d: number; s: number; c: string }[] = [
  { a: -30, d: 70, s: 5, c: theme.primary },
  { a: -80, d: 84, s: 6, c: theme.accent },
  { a: -130, d: 68, s: 5, c: theme.primary },
  { a: -55, d: 98, s: 4, c: theme.text },
  { a: -105, d: 94, s: 4, c: theme.accent },
  { a: -152, d: 84, s: 4, c: theme.text },
];
function CelebrationSparks() {
  const burst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(burst, { toValue: 1, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [burst]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', bottom: 44, width: 0, height: 0 }}>
      {TUT_SPARKS.map((p, i) => {
        const rad = (p.a * Math.PI) / 180;
        const dx = Math.cos(rad) * p.d;
        const dy = Math.sin(rad) * p.d;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: -p.s / 2, top: -p.s / 2, width: p.s, height: p.s, borderRadius: p.s / 2, backgroundColor: p.c,
              opacity: burst.interpolate({ inputRange: [0, 0.1, 0.65, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
                { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// Guided first-time tutorial that drives the REAL match screens (PickTeam → Guess
// → Result) with scripted fake data, plus a coach overlay + skip. Step advances
// when the player does the real action (pick a team, submit a guess).
// ---- DEV ONLY: App Store screenshot harness -----------------------------------
// Cycles the REAL match/social screens with the tutorial's mock data (real club
// crests) so clean marketing screenshots can be captured in the simulator without
// tap automation. Enabled by the DEV_SHOT flag in App.tsx; never ships enabled.
// Screenshot data is FICTIONAL on purpose: App Review rejected v1.0 under 4.1
// (copycats) citing "Galatasaray–Real Madrid / Wesley Sneijder" in metadata.
// Store screenshots must never show real clubs/players again — the in-app
// tutorial keeps real crests (in-app content was not cited), but DevShot feeds
// the marketing captures, so it uses the approved fictional set.
const SHOT_CLUBS: ClubRef[] = [
  { id: 9001, name: 'Zirve SK', logoUrl: null },
  { id: 9002, name: 'Liman SK', logoUrl: null },
  { id: 9003, name: 'Vadi SK', logoUrl: null },
  { id: 9004, name: 'Nehir SK', logoUrl: null },
  { id: 9005, name: 'Kuzey SK', logoUrl: null },
  { id: 9006, name: 'Orman SK', logoUrl: null },
];
const SHOT_TEAM_A: ClubRef = SHOT_CLUBS[0]!;
const SHOT_TEAM_B: ClubRef = SHOT_CLUBS[1]!;
const SHOT_CAREER = [
  { clubId: 9003, clubName: 'Vadi SK', logoUrl: null, startYear: 2014, endYear: 2017 },
  { clubId: 9002, clubName: 'Liman SK', logoUrl: null, startYear: 2017, endYear: 2020 },
  { clubId: 9001, clubName: 'Zirve SK', logoUrl: null, startYear: 2020, endYear: 2024 },
  { clubId: 9005, clubName: 'Kuzey SK', logoUrl: null, startYear: 2024, endYear: null },
];
const SHOT_SPELL_A = [SHOT_CAREER[2]!]; // Zirve SK
const SHOT_SPELL_B = [SHOT_CAREER[1]!]; // Liman SK
const SHOT_PLAYER = 'Onur Demir';

const SHOT_PROFILE = {
  ...TUT_PROFILE, displayName: 'Yağız', trophies: 340, diamonds: 1250, wins: 27, losses: 9,
};
const SHOT_FRIENDS = [
  { userId: 'f1', displayName: 'Emre', selectedAvatar: 'pp3', avatar: 'pp3', trophies: 512, arena: { name: 'Şehir Stadı', icon: '🏟️', minTrophies: 400 }, online: true },
  { userId: 'f2', displayName: 'Kerem', selectedAvatar: 'pp12', avatar: 'pp12', trophies: 385, arena: { name: 'Kasaba Arenası', icon: '🏟️', minTrophies: 200 }, online: true },
  { userId: 'f3', displayName: 'Deniz', selectedAvatar: 'pp5', avatar: 'pp5', trophies: 260, arena: { name: 'Kasaba Arenası', icon: '🏟️', minTrophies: 200 }, online: false },
  { userId: 'f4', displayName: 'Mert', selectedAvatar: 'pp18', avatar: 'pp18', trophies: 745, arena: { name: 'Millî Stadyum', icon: '🏟️', minTrophies: 600 }, online: true },
];
export function DevShotScreen() {
  const [ix, setIx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIx((i) => (i + 1) % 5), 6000);
    return () => clearInterval(id);
  }, []);
  const kind = (['pick', 'guess', 'result', 'friends', 'arenas'] as const)[ix]!;
  const insets = useSafeAreaInsets();
  const future = Date.now() + 23_000; // sayaç ekranda ~20sn gibi doğal görünsün (3600 değil)
  const room = {
    code: '', status: (kind === 'pick' ? 'pick' : kind === 'guess' ? 'guess' : 'result') as RoomView['status'],
    youId: 'you',
    players: [
      { id: 'you', name: 'Yağız', score: 1, wrongCount: 0, isHost: true, connected: true },
      { id: 'opp', name: 'Kerem', score: 1, wrongCount: 0, isHost: false, connected: true },
    ],
  } as RoomView;
  const st: GameState = {
    ...initialState,
    connected: true,
    profile: SHOT_PROFILE as GameState['profile'],
    room,
    phase: kind === 'pick' ? 'pick' : kind === 'guess' ? 'guess' : 'result',
    pickRole: 'team', picked: false, pickEndsAt: future, guessEndsAt: future,
    clubResults: SHOT_CLUBS,
    teams: { teamA: SHOT_TEAM_A, teamB: SHOT_TEAM_B },
    revealMode: 'team-team', matchOver: false,
    friends: SHOT_FRIENDS as GameState['friends'],
    result: kind === 'result'
      ? {
          correct: true, reason: 'both', autocorrected: false,
          answeredById: 'you', answeredByName: 'Yağız', guess: SHOT_PLAYER,
          teamA: SHOT_TEAM_A, teamB: SHOT_TEAM_B,
          matchedPlayerName: SHOT_PLAYER, matchedPlayerImageUrl: null,
          spellsA: SHOT_SPELL_A, spellsB: SHOT_SPELL_B, allClubs: SHOT_CAREER,
          commonPlayers: [{ name: SHOT_PLAYER, imageUrl: null }],
        }
      : null,
  };
  const acts = new Proxy({}, { get: () => () => {} }) as unknown as Actions;
  const matchLike = kind === 'pick' || kind === 'guess' || kind === 'result';
  return (
    // Capture pipeline: +84 reserves a band for Expo Go's Tools bubble, and the
    // background is SOLID navy (no ScreenBg crosshatch) on purpose — post-
    // processing erases the bubble and cuts the band out seamlessly, which a
    // patterned background would make impossible without visible seams.
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top + 84 }}>
      {kind === 'pick' ? <PickTeamScreen state={st} actions={acts} tutorial />
        : kind === 'guess' ? <GuessScreen state={st} actions={acts} tutorial prefill={SHOT_PLAYER} />
        : kind === 'result' ? <ResultScreen state={st} actions={acts} tutorial />
        : kind === 'friends' ? <FriendsScreen state={st} actions={acts} />
        : <ArenasScreen state={st} actions={acts} />}
    </View>
  );
}

export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0); // 0 pick · 1 guess · 2 result
  const [wrong, setWrong] = useState(false); // typed a wrong guess in the sim
  const [gateOpen, setGateOpen] = useState(true); // centered coach card blocks interaction until "Devam Et"
  const [celebSize, setCelebSize] = useState({ w: 0, h: 0 }); // final-card dims for the one-shot ShineSweep
  const insets = useSafeAreaInsets();
  const bubble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    bubble.setValue(0);
    Animated.spring(bubble, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }).start();
  }, [step, wrong, gateOpen]);

  // Sane practice countdown — 9_999_999 rendered as a nonsense "9986" in the
  // pick/guess timer pill. Nothing depends on it expiring (actions are no-ops).
  const future = Date.now() + 95_000;
  const room = {
    code: '', status: (step === 0 ? 'pick' : step === 1 ? 'guess' : 'result') as RoomView['status'],
    youId: 'you',
    players: [
      { id: 'you', name: 'Sen', score: step >= 2 ? 1 : 0, wrongCount: 0, isHost: true, connected: true },
      { id: 'opp', name: 'Rakip', score: 0, wrongCount: 0, isHost: false, connected: true },
    ],
  } as RoomView;

  const fakeState: GameState = {
    ...initialState,
    connected: true,
    profile: TUT_PROFILE as GameState['profile'],
    room,
    phase: step === 0 ? 'pick' : step === 1 ? 'guess' : 'result',
    pickRole: 'team',
    picked: false,
    pickEndsAt: future,
    guessEndsAt: future,
    clubResults: [TUT_A], // tutorial team-select shows ONLY Galatasaray ("Galatasaray'a dokun")
    teams: { teamA: TUT_A, teamB: TUT_B },
    revealMode: 'team-team',
    matchOver: false,
    result: step >= 2
      ? {
          correct: true, reason: 'both', autocorrected: false,
          answeredById: 'you', answeredByName: 'Sen', guess: 'Wesley Sneijder',
          teamA: TUT_A, teamB: TUT_B,
          matchedPlayerName: 'Wesley Sneijder', matchedPlayerImageUrl: null,
          spellsA: TUT_SPELL_A, spellsB: TUT_SPELL_B, allClubs: TUT_CAREER,
          commonPlayers: [{ name: 'Wesley Sneijder', imageUrl: null }],
        }
      : null,
  };

  // Real actions are replaced with no-ops; the key ones advance the simulation.
  // After each real action we re-open the centered coach gate for the next step.
  const fakeActions = useMemo(
    () =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'pickTeam') return () => { setWrong(false); setStep(1); setGateOpen(true); };
            if (prop === 'submitGuess')
              return (text: string) => {
                const ok = String(text ?? '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü]/g, '').includes('sneijder');
                if (ok) { setWrong(false); setStep(2); setGateOpen(true); }
                else { setWrong(true); setGateOpen(true); }
              };
            if (prop === 'leave' || prop === 'playAgain' || prop === 'acceptRematch' || prop === 'ready') return onDone;
            return () => {};
          },
        },
      ) as unknown as Actions,
    [onDone],
  );

  // Per step: the centered coach text (shown until "Devam Et"), the slim top
  // hint (shown while interacting), and the gate button label.
  const STEPS = [
    {
        gate: t('tutorial.step1Gate'),
        hint: t('tutorial.step1Hint'),
        cta: t('common.continue'),
    },
    {
        gate: wrong ? t('tutorial.step2WrongGate') : t('tutorial.step2Gate'),
      hint: t('tutorial.step2Hint'),
      cta: t('common.continue'),
    },
    {
      gate: t('tutorial.step3Gate'),
      hint: '',
      cta: t('common.start'),
    },
  ];
  const cur = STEPS[Math.min(step, STEPS.length - 1)]!;

  const screen =
    step === 0 ? <PickTeamScreen state={fakeState} actions={fakeActions} tutorial />
    : step === 1 ? <GuessScreen state={fakeState} actions={fakeActions} tutorial />
    : <ResultScreen state={fakeState} actions={fakeActions} tutorial />;

  const onGate = () => { if (step >= 2) onDone(); else setGateOpen(false); };

  return (
    // paddingTop: the tutorial mounts full-bleed (App skips the padded root), so
    // without the safe-area inset the inner match screens' top row (exit button +
    // player bar) rendered under the notch — "üstte kalıyor görünmüyor".
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      {screen}

      {/* Slim top hint while the player is interacting (gate closed) */}
      <TutorialHint visible={!gateOpen && !!cur.hint} text={cur.hint} />

      {/* Result step: keep the win + career fully visible, celebration card at the
          bottom — same corporate-clean card voice as CoachGate (no sparks/shine). */}
      {step >= 2 ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: Math.max(insets.bottom, 16) }}>
          <Animated.View style={{ transform: [{ scale: bubble }], opacity: bubble }}>
            <View style={{ backgroundColor: theme.modalFace, borderRadius: 18, borderTopWidth: 1, borderTopColor: theme.topLight, padding: 22, alignItems: 'center', ...shadowModal }}>
              <Text style={{ color: theme.text, fontSize: 14.5, fontFamily: 'Poppins-SemiBold', lineHeight: 22, textAlign: 'center', marginBottom: 16 }}>{cur.gate}</Text>
              <Pressable
                onPress={onGate}
                style={({ pressed }) => ({ alignSelf: 'stretch', height: 50, borderRadius: 12, backgroundColor: theme.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.88 : 1 })}
              >
                <Text style={{ color: theme.ink, fontSize: 16, fontFamily: 'Poppins-ExtraBold' }}>{cur.cta}</Text>
                <Ionicons name="arrow-forward" size={18} color={theme.ink} />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : (
        /* Pick/Guess step: centered coach gate — blocks interaction until "Devam Et" */
        <CoachGate
          visible={gateOpen}
          wrong={wrong}
          stepLabel={t('tutorial.coachStep', { step: step + 1 })}
          body={cur.gate}
          cta={cur.cta}
          ctaIcon="arrow-forward"
          onPress={onGate}
        />
      )}

      {/* Skip — always reachable, on top (same beveled mini-chip as IntroScreen) */}
      <SkipChip onPress={onDone} style={{ position: 'absolute', top: insets.top + 8, right: 16, zIndex: 40 }} />
    </View>
  );
}

// ---- Emotes (Clash-Royale-style in-match reactions) ----

// One emote pop: springs in, holds, fades out. Re-mounted (via `key={n}`) on
// every new emote so the same sticker can replay.
function TransientCallout({ emoteId, onDone }: { emoteId: string; onDone?: () => void }) {
  const a = useRef(new Animated.Value(0)).current; // entrance 0→1
  const bob = useRef(new Animated.Value(0)).current; // idle bob while held
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setGone(false);
    a.setValue(0);
    bob.setValue(0);
    // Punchy bounce-in (overshoot), then a gentle living bob, then pop out.
    Animated.spring(a, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    const tm = setTimeout(() => {
      loop.stop();
      Animated.timing(a, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => { if (finished) { setGone(true); onDone?.(); } },
      );
    }, 3000);
    return () => { clearTimeout(tm); loop.stop(); };
  }, [a, bob, emoteId]);
  if (gone) return null;
  const scale = a.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.3, 1.14, 1] });
  const rot = a.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-11deg', '5deg', '0deg'] });
  const by = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  const op = a.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });
  return (
    <Animated.View pointerEvents="none" style={{ opacity: op, transform: [{ scale }, { rotate: rot }, { translateY: by }] }}>
      <EmoteCallout id={emoteId} />
    </Animated.View>
  );
}

// Floating emote button + picker sheet + the opponent/self callouts. Drop into
// any in-match screen; positions itself absolutely over the screen.
// ---- EmoteCoin — the one beveled emote button (match HUD strip + floating FAB) ----
// Gold coin: accentDark lip under the accent face, white top gloss, 2px press
// depress, theme.ink glyph.
function EmoteCoin({ onPress, size = 52, style }: { onPress: () => void; size?: number; style?: any }) {
  const { ty, onIn, onOut } = usePressLip(2);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} hitSlop={6} style={style}>
      <View style={{ backgroundColor: theme.accentDark, borderRadius: size / 2, paddingBottom: 3, shadowColor: theme.shadowInk, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
        <Animated.View
          style={{
            transform: [{ translateY: ty }],
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: theme.accent,
            alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}
        >
          {/* top-light overlay, not a borderTop — per-side border colors seam at the diagonals on a circle */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: '#FFFFFF', opacity: 0.16 }} />
          <Ionicons name="chatbubble-ellipses" size={Math.round(size * 0.46)} color={theme.ink} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

// Sticker cell in the emote sheet — spring press-scale 0.92 (spec §11).
function EmoteStickerCell({ emote, onPress }: { emote: EmoteMeta; onPress: () => void }) {
  const { scale, onIn, onOut } = usePressScale(0.92, GameFeedbackEvent.UI_CARD);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ alignItems: 'center', width: 72 }}>
      <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
        <View style={{
          width: 70, height: 70, borderRadius: emote.kind === 'lottie' ? 14 : 35, backgroundColor: theme.bg,
          borderWidth: 2.5, borderColor: emote.color, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <EmoteSticker id={emote.id} size={56} />
        </View>
        <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', marginTop: 5, textAlign: 'center' }} numberOfLines={1}>{emotePhrase(emote)}</Text>
      </Animated.View>
    </Pressable>
  );
}

function EmoteLayer({ state, actions, fab = 'top-right', hideFab, externalOpen, onOpenChange }: Props & { fab?: 'bottom-right' | 'top-right'; hideFab?: boolean; externalOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = (v: boolean) => { setInternalOpen(v); onOpenChange?.(v); };
  const insets = useSafeAreaInsets();
  // Bottom sheet: spring translateY entry + 180ms animated exit (spec §7 — no
  // animationType='slide'; the Modal stays mounted during the exit animation).
  const sheetA = useRef(new Animated.Value(0)).current;
  const [sheetMounted, setSheetMounted] = useState(false);
  useEffect(() => {
    if (open) {
      setSheetMounted(true);
      Animated.spring(sheetA, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start();
    } else {
      Animated.timing(sheetA, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setSheetMounted(false);
      });
    }
  }, [open, sheetA]);
  const room = state.room;
  const youId = room?.youId;
  const oppId = room?.players.find((p) => p.id !== youId)?.id;
  const mine = youId ? state.emotes[youId] : undefined;
  const theirs = oppId ? state.emotes[oppId] : undefined;
  const allEmotes = loadoutEmotes(state.profile);
  const textEmotes = allEmotes.filter((e) => e.kind === 'text');   // quick-chat messages
  const stickerEmotes = allEmotes.filter((e) => e.kind !== 'text'); // the 4 faces + equipped visual
  // Track which emote seq numbers have finished so they don't re-appear.
  // When a NEW emote arrives (higher n), it's shown; when animation ends, n is dismissed.
  const dismissedOpp = useRef(-1);
  const dismissedMine = useRef(-1);
  const showTheirs = theirs && theirs.n > dismissedOpp.current;
  const showMine = mine && mine.n > dismissedMine.current;


  return (
    <>
      <View pointerEvents="none" style={styles.emoteTop}>
        {showTheirs ? <TransientCallout key={`opp-${theirs.n}`} emoteId={theirs.emoteId} onDone={() => { dismissedOpp.current = theirs.n; if (oppId) actions.clearEmote(oppId); }} /> : null}
      </View>
      <View pointerEvents="none" style={styles.emoteBottom}>
        {showMine ? <TransientCallout key={`you-${mine.n}`} emoteId={mine.emoteId} onDone={() => { dismissedMine.current = mine.n; if (youId) actions.clearEmote(youId); }} /> : null}
      </View>

      {!hideFab ? (
        <EmoteCoin
          size={52}
          onPress={() => setOpen(true)}
          style={[{ position: 'absolute', zIndex: 40 }, fab === 'top-right' ? styles.emoteFabTop : styles.emoteFabBottom]}
        />
      ) : null}

      <SafeModal visible={open || sheetMounted} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Animated.View style={[styles.emoteSheetBackdrop, { opacity: sheetA.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <Animated.View style={{ transform: [{ translateY: sheetA.interpolate({ inputRange: [0, 1], outputRange: [440, 0] }) }] }}>
            {/* Prestige bottom-sheet: surface1 edge → modalFace body, depth from a
                1px top-light + the soft navy shadow (no drawn gold frame) */}
            <View style={{ backgroundColor: theme.surface1, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 3, ...shadowModal }}>
              <View
                style={{
                  backgroundColor: theme.modalFace, borderTopLeftRadius: 26, borderTopRightRadius: 26,
                  borderTopWidth: 1, borderTopColor: theme.topLight,
                  paddingTop: 10, paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 16) + 12,
                }}
              >
                <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: theme.hairline, alignSelf: 'center', marginBottom: 16 }} />

                {/* Quick-chat text messages (no emoji — just text, Clash-Royale style) */}
                <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1.5, marginBottom: 9, marginLeft: 2 }}>{t('emote.quickChat')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                  {textEmotes.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => { actions.sendEmote(e.id); setOpen(false); }}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.surface2,
                        borderRadius: 22, paddingVertical: 11, paddingHorizontal: 16,
                        borderTopWidth: 1, borderTopColor: theme.topLight,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                        ...shadowRow,
                      })}
                    >
                      <Ionicons name="chatbubble-ellipses" size={14} color={theme.primary} />
                      <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 13.5 }}>{emotePhrase(e)}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Character emotes (smiling / crying / angry / OK) + any equipped visual emotes */}
                <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1.5, marginBottom: 10, marginLeft: 2 }}>{t('emote.faces')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
                  {stickerEmotes.map((e) => (
                    <EmoteStickerCell key={e.id} emote={e} onPress={() => { actions.sendEmote(e.id); setOpen(false); }} />
                  ))}
                </View>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </SafeModal>
    </>
  );
}

const BADGE_COLORS = ['#E63946', '#457B9D', '#2A9D8F', '#E9C46A', '#F4A261', '#A06CD5', '#06D6A0', '#EF476F'];
function badgeColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length]!;
}
function initial(name: string): string {
  const m = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').trim();
  return (m.charAt(0) || '#').toUpperCase();
}
function yearsText(s: SpellInfo): string {
  if (!s.startYear && !s.endYear) return '';
  return `${s.startYear ?? '?'}–${s.endYear ?? ''}`.replace(/–$/, '+');
}

function ClubBadge({ name, size = 36, logoUrl }: { name: string; size?: number; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.text,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <CachedImage uri={logoUrl} style={{ width: size * 0.78, height: size * 0.78 }} contentFit="contain" />
      </View>
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: badgeColor(name),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: size * 0.4 }}>{initial(name)}</Text>
    </View>
  );
}

function CareerRow({ spell, highlight }: { spell: SpellInfo; highlight?: boolean }) {
  return (
    <View style={[styles.careerRow, highlight && styles.careerRowHi]}>
      <ClubBadge name={spell.clubName} size={32} logoUrl={spell.logoUrl} />
      <Text style={styles.careerClub} numberOfLines={1}>
        {spell.clubName}
      </Text>
      <Text style={styles.careerYears}>{yearsText(spell)}</Text>
      {highlight ? (
        <Ionicons name="checkmark-circle" size={18} color={theme.primary} style={{ marginLeft: 6 }} />
      ) : null}
    </View>
  );
}

// ---- Home ----
function DIFF_LABEL(d: Difficulty): string {
  return { easy: t('difficulty.easy'), medium: t('difficulty.medium'), hard: t('difficulty.hard') }[d];
}

function isNetworkErrorMessage(message?: string | null): boolean {
  if (!message) return false;
  return message === t('error.connect') || message === t('error.disconnected') || message === t('login.noInternet');
}

// Inline (non-network) error banner — danger-tinted compact panel with an
// alert icon gem; fades/slides in over 200ms. Shared by Home/Login/Username.
function ErrorBanner({ message, style }: { message: string; style?: any }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [message, a]);
  return (
    <Animated.View style={[{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }], marginVertical: 8 }, style]}>
      <GamePanel compact tint={theme.danger} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: theme.cardLip, borderWidth: 1.5, borderColor: theme.dangerDark, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="alert-circle" size={16} color={theme.danger} />
        </View>
        <Text style={{ flex: 1, color: theme.text, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', lineHeight: 17 }}>{message}</Text>
      </GamePanel>
    </Animated.View>
  );
}

// Offline status banner — opaque kit surface (danger-tinted GamePanel), pinned
// above the bottom edge. Presence is the message: entrance/exit animate, the
// container never blinks; only the icon dips on a slow ≥1800ms cycle.
function NetworkErrorBeacon({ visible }: { visible: boolean }) {
  const a = useRef(new Animated.Value(0)).current; // 200ms enter / 160ms exit
  const dip = useRef(new Animated.Value(1)).current; // slow icon presence dip
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(dip, { toValue: 0.55, duration: 900, useNativeDriver: true }),
          Animated.timing(dip, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    Animated.timing(a, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return undefined;
  }, [a, dip, visible]);
  if (!mounted && !visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', bottom: 30, alignSelf: 'center', maxWidth: 320,
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      <GamePanel compact tint={theme.danger}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.cardLip, borderWidth: 1.5, borderColor: theme.dangerDark, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ opacity: dip }}>
              <Ionicons name="cloud-offline" size={18} color={theme.danger} />
            </Animated.View>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: theme.text, fontSize: 12.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('network.offlineTitle')}</Text>
            <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', marginTop: 1 }}>{t('network.offlineHint')}</Text>
          </View>
        </View>
      </GamePanel>
    </Animated.View>
  );
}

export function MODE_LABEL(m: GameMode): string {
  return { 'team-team': t('mode.teamTeam'), 'country-team': t('mode.countryTeam'), 'letter-team': t('mode.letterTeam'), 'player-player': t('mode.playerPlayer'), xox: t('mode.xox'), cozkazan: t('mode.cozkazan') }[m];
}

function normalizeCountryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function countryFlagFor(value?: string | null): string | null {
  if (!value) return null;
  const key = normalizeCountryKey(value);
  const hit = NATIONALITIES.find((n) =>
    normalizeCountryKey(n.value) === key || normalizeCountryKey(n.displayName) === key,
  );
  return hit?.flag ?? null;
}

function MatchHistoryLeadBadge({
  mode,
  country,
  letter,
  teamA,
  teamALogo,
  size = 18,
}: {
  mode: GameMode;
  country?: string | null;
  letter?: string | null;
  teamA: string;
  teamALogo?: string | null;
  size?: number;
}) {
  if (mode === 'country-team') {
    const flag = countryFlagFor(country ?? teamA);
    if (flag) return <Text style={{ fontSize: size - 2 }}>{flag}</Text>;
  }
  if (mode === 'letter-team' && letter) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.ink, fontSize: Math.max(10, size - 7), fontFamily: 'Poppins-Black' }}>{letter}</Text>
      </View>
    );
  }
  return <ClubLogo uri={teamALogo ?? null} name={teamA} size={size} />;
}
const MODE_ICON: Record<GameMode, IoniconName> = {
  'team-team': 'football',
  'country-team': 'flag',
  'letter-team': 'text',
  'player-player': 'people',
  xox: 'grid',
  cozkazan: 'shuffle',
};

// Transfermarkt competition code → league display name. The server's /scopes
// endpoint sends leagues as raw TM codes (the clubs.league column: TR1, GB1…)
// with no displayName, so we map them here on the client (also fixes codes
// already cached in AsyncStorage). Codes verified against live /scopes data;
// unknown codes fall back to the raw value.
const LEAGUE_DISPLAY: Record<string, string> = {
  TR1: 'Süper Lig',
  GB1: 'Premier League',
  ES1: 'LaLiga',
  IT1: 'Serie A',
  L1: 'Bundesliga',
  FR1: 'Ligue 1',
  NL1: 'Eredivisie',
  PO1: 'Liga Portugal',
};

function scopeLabel(scope: Scope): string {
  return scope.type === 'all' ? t('scope.all') : (LEAGUE_DISPLAY[scope.value] ?? scope.value);
}

// Bot-dialog pages (difficulty home + mode/scope pickers) — ONE mounted GameModal
// pages between these with a 200ms ModalPager slide (spec §7).
type BotPage = 'bot' | 'mode' | 'scopeType' | 'league' | 'country';
const BOT_BANNER: Record<BotPage, { title: () => string; icon: IoniconName }> = {
  bot: { title: () => t('home.solo'), icon: 'game-controller' },
  mode: { title: () => t('mode.select'), icon: 'game-controller' },
  scopeType: { title: () => t('friends.scopeTitle'), icon: 'filter' },
  league: { title: () => t('scope.pickLeague'), icon: 'trophy' },
  country: { title: () => t('scope.pickCountry'), icon: 'flag' },
};

// Login gate: shown until the user signs in. No guest play — the app is locked
// behind Apple/Google (Facebook coming soon) sign-in.
// Clean, corporate sign-in buttons — flat & minimal (no chunky game lip), the
// way real auth stacks look. Apple: solid black field, white  logo + localized
// title (HIG). Google: white field, hairline border, blue "G" + gray title
// (Google's brand spec). The mandated brand hex are a sanctioned exception to the
// no-raw-hex rule; the actual sign-in still runs natively.
function AuthBtn({ onPress, disabled, bg, border, fg, icon, iconColor, label }: {
  onPress: () => void; disabled?: boolean; bg: string; border?: string; fg: string;
  icon: IoniconName; iconColor: string; label: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => ({ marginVertical: 6, opacity: disabled ? 0.5 : pressed ? 0.88 : 1 })}>
      <View style={{ backgroundColor: bg, borderRadius: 12, height: 52, borderWidth: border ? 1 : 0, borderColor: border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
        <Ionicons name={icon} size={20} color={iconColor} style={{ marginRight: 9, marginTop: icon === 'logo-apple' ? -2 : 0 }} />
        <Text numberOfLines={1} style={{ color: fg, fontSize: 16, fontFamily: 'Poppins-SemiBold' }}>{label}</Text>
      </View>
    </Pressable>
  );
}
function AppleSignInBtn({ onPress, label }: { onPress: () => void; label?: string }) {
  return <AuthBtn onPress={onPress} bg="#000000" fg="#FFFFFF" icon="logo-apple" iconColor="#FFFFFF" label={label ?? t('login.apple')} />;
}
function GoogleSignInBtn({ onPress, disabled, label }: { onPress: () => void; disabled?: boolean; label?: string }) {
  // ANDROID KAPISI (2026-08-29): Android OAuth istemcisi tanımlı değilken buton
  // GÖSTERİLMEZ. Aksi halde oyuncu "erişim engellendi / 400 invalid_request"
  // hatasına çarpıyordu (web istemcisi custom scheme kabul etmiyor). Kimlik
  // config'e yazılınca buton kendiliğinden geri gelir.
  if (Platform.OS === 'android' && !GOOGLE_ANDROID_CLIENT_ID) return null;
  return <AuthBtn onPress={onPress} disabled={disabled} bg="#FFFFFF" border="#DADCE0" fg="#3C4043" icon="logo-google" iconColor="#4285F4" label={label ?? t('login.google')} />;
}

// ---- GuestGateModal — misafir kapısı ----
// Misafir bir kullanıcı arkadaş eklemeyi denediğinde açılır: "kayıt olman
// gerekli" mesajı + gerçek Apple/Google giriş akışları. authWith mevcut misafir
// hesabın kimliğini ipucu olarak yollar → sunucu sağlayıcıyı AYNI hesaba bağlar,
// ilerleme (kupa/elmas/ifadeler) aynen korunur.
function GuestGateModal({ visible, onClose, actions }: { visible: boolean; onClose: () => void; actions: Actions }) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token ?? response.authentication?.idToken;
      if (idToken) actions.authWith('google', idToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);
  const signInApple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (cred.identityToken) {
        const given = cred.fullName?.givenName ?? '';
        const family = cred.fullName?.familyName ?? '';
        const name = `${given} ${family}`.trim() || undefined;
        actions.authWith('apple', cred.identityToken, name);
      }
    } catch {
      /* kullanıcı Apple sayfasını kapattı */
    }
  };
  return (
    <GameModal visible={visible} onClose={onClose} title={t('friends.guestGateTitle')} icon="person-add">
      <Text style={{ color: theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20, marginBottom: 12 }}>
        {t('friends.guestGateBody')}
      </Text>
      {Platform.OS === 'ios' ? (
        <AppleSignInBtn label={t('friends.guestGateApple')} onPress={() => void signInApple()} />
      ) : null}
      <GoogleSignInBtn label={t('friends.guestGateGoogle')} onPress={() => void promptAsync()} disabled={!request} />
    </GameModal>
  );
}

export function LoginScreen({ state, actions }: Props) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [hasInternet, setHasInternet] = useState(true);
  const [showOfflinePulse, setShowOfflinePulse] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const intro = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);
  useEffect(() => {
    if (!NetInfoModule) return;
    NetInfoModule.fetch().then((s: any) => setHasInternet(Boolean(s?.isConnected && s?.isInternetReachable !== false))).catch(() => {});
    const unsub = NetInfoModule.addEventListener?.((s: any) => {
      setHasInternet(Boolean(s?.isConnected && s?.isInternetReachable !== false));
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!showOfflinePulse) return;
    const id = setTimeout(() => setShowOfflinePulse(false), 1500);
    return () => clearTimeout(id);
  }, [showOfflinePulse]);

  useEffect(() => {
    Animated.spring(intro, { toValue: 1, friction: 7, tension: 68, useNativeDriver: true }).start();
  }, [intro]);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token ?? response.authentication?.idToken;
      if (idToken) actions.authWith('google', idToken);
    }
  }, [response]);

  const signInApple = async () => {
    setAuthErr(null);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (cred.identityToken) {
        const given = cred.fullName?.givenName ?? '';
        const family = cred.fullName?.familyName ?? '';
        const name = `${given} ${family}`.trim() || undefined;
        actions.authWith('apple', cred.identityToken, name);
      } else {
        setAuthErr(t('error.appleSignIn'));
      }
    } catch (e: any) {
      // ERR_REQUEST_CANCELED = the user dismissed the sheet — stay silent. Any
      // OTHER error is a real failure the reviewer needs to see, not swallow.
      const code = e?.code ?? '';
      if (code !== 'ERR_REQUEST_CANCELED' && code !== 'ERR_CANCELED') {
        setAuthErr(t('error.appleSignIn'));
      }
    }
  };

  const heroScale = intro.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const heroY = intro.interpolate({ inputRange: [0, 1], outputRange: [34, 0] });

  return (
    <Screen>
      {/* A stage, not a form: the splash's exact brand block carries straight
          through, and the auth actions rise beneath it. No cards inside cards. */}
      <View style={{ flex: 1, paddingHorizontal: 4 }}>
        <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: intro, transform: [{ translateY: heroY }, { scale: heroScale }] }}>
          <BrandMark size={SLAM_BADGE} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 26 }}>
            {SLAM_WORD.split('').map((ch, i) => (
              <Text key={i} style={{ color: theme.text, fontSize: SLAM_FONT, letterSpacing: 3, marginHorizontal: 2, includeFontPadding: false, fontFamily: 'Poppins-Black', ...engrave('lg') }}>{ch}</Text>
            ))}
          </View>
          <BrandByline />
        </Animated.View>

        <Animated.View style={{ paddingBottom: 16, opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
          <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 18, marginBottom: 8 }}>{t('login.hint')}</Text>
          {/* Never GATE login on NetInfo: its reachability probe returns false on
              some review/restricted networks even when the internet works, which
              would make these buttons silently do nothing. Always attempt — the
              connection layer (with its 15s watchdog) surfaces a real error if it
              genuinely fails. We only flash the offline beacon as a fast hint. */}
          {Platform.OS === 'ios' && appleAvailable ? (
            <AppleSignInBtn onPress={() => { if (!hasInternet) setShowOfflinePulse(true); void signInApple(); }} />
          ) : null}
          <GoogleSignInBtn onPress={() => { if (!hasInternet) setShowOfflinePulse(true); void promptAsync(); }} disabled={!request} />
          {(state.error || authErr) ? <ErrorBanner message={state.error || authErr!} /> : null}
          <Pressable onPress={() => { if (!hasInternet) setShowOfflinePulse(true); actions.guestLogin(); }} style={({ pressed }) => ({ marginTop: 6, paddingVertical: 12, opacity: pressed ? 0.55 : 1 })}>
            <Text style={{ color: theme.muted, fontSize: 15, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{t('login.guest')}</Text>
          </Pressable>
          {/* Guideline 1.2 requires users to AGREE to terms that spell out the
              zero-tolerance rule, and 3.1.2(c) requires the links to work. Both
              are satisfied here, on the screen every sign-in path passes through. */}
          <Text style={{ color: theme.muted, fontSize: 10.5, lineHeight: 15, fontFamily: 'Poppins-SemiBold', textAlign: 'center', paddingHorizontal: 12, marginTop: 2 }}>
            {t('terms.agree')}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6 }}>
            <Pressable onPress={() => openLink(INFO_LINKS.terms)} hitSlop={8}>
              <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', textDecorationLine: 'underline' }}>{t('store.termsLink')}</Text>
            </Pressable>
            <Pressable onPress={() => openLink(INFO_LINKS.privacy)} hitSlop={8}>
              <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', textDecorationLine: 'underline' }}>{t('store.privacyLink')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>

      <NetworkErrorBeacon visible={!hasInternet || showOfflinePulse || isNetworkErrorMessage(state.error)} />
    </Screen>
  );
}

// One-time unique username pick, shown after sign-in before anything else.
// Kullanıcı adı düzeltmesi — sunucudaki normalizeUsername ile AYNI kurallar
// (2026-08-29). Oyuncu "Muhammed Taha Aksoy" yazarken kutuda anında
// "Muhammed_Taha_Aksoy" görür; boşluk yüzünden hata almaz.
const USERNAME_MIN_LEN = 4;
const USERNAME_MAX_LEN = 20;
function normalizeUsernameInput(raw: string): string {
  return raw
    .replace(/[\s.\-]+/g, '_')
    .replace(/[^A-Za-z0-9_çğıöşüÇĞİÖŞÜ]/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, USERNAME_MAX_LEN);
}
function usernameLooksValid(name: string): boolean {
  const n = name.replace(/^_+|_+$/g, '');
  if (n.length < USERNAME_MIN_LEN || n.length > USERNAME_MAX_LEN) return false;
  if (!/^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]+$/.test(n)) return false;
  if (/^\d+$/.test(n)) return false;
  if (!/[aeıioöuüAEIİOÖUÜ]/.test(n)) return false;   // sesli harf şartı
  if (/(.)\1{2,}/.test(n)) return false;             // "aaaa" gibi tekrarlar
  return true;
}

export function UsernameScreen({ state, actions }: Props) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const intro = useRef(new Animated.Value(0)).current;
  // Kenar alt çizgileri yalnız GÖNDERİRKEN kırpılır: kullanıcı "ali_" yazarken
  // araya harf ekleyebilsin diye yazım sırasında silinmez.
  const trimmed = name.replace(/^_+|_+$/g, '');
  const valid = usernameLooksValid(name);
  useEffect(() => {
    Animated.spring(intro, { toValue: 1, friction: 7, tension: 72, useNativeDriver: true }).start();
  }, [intro]);
  useEffect(() => {
    if (!state.error) return;
    submittingRef.current = false;
    setSubmitting(false);
  }, [state.error]);
  const submitUsername = useCallback(() => {
    if (!valid || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    dismissActiveInput();
    actions.setUsername(trimmed);
  }, [actions, trimmed, valid]);
  return (
    <Screen>
      <Animated.View style={{ flex: 1, justifyContent: 'center', transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }], opacity: intro }}>
        <GamePanel hero tint={valid ? theme.primary : theme.frameGold} bodyStyle={{ gap: 14, padding: 22 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ width: 78, height: 78, borderRadius: 24, backgroundColor: theme.well, borderTopWidth: 2, borderTopColor: valid ? theme.primary : theme.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.35 }} />
              <Ionicons name="person" size={38} color={valid ? theme.primary : theme.accent} />
            </View>
            <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: 24, textAlign: 'center', ...engrave('lg') }}>{t('username.title')}</Text>
            <Text style={{ color: theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>{t('username.subtitle')}</Text>
          </View>
          <GameInput
            placeholder={t('username.placeholder')}
            value={name}
            onChangeText={(v) => setName(normalizeUsernameInput(v))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={USERNAME_MAX_LEN}
            error={!valid && trimmed.length > 0}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitUsername}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
            <Ionicons name={valid ? 'checkmark-circle' : 'information-circle'} size={15} color={valid ? theme.primary : theme.muted} />
            <Text style={{ color: valid ? theme.primary : theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>{t('username.rules')}</Text>
          </View>
          <Btn
            label={t('username.create')}
            icon="checkmark"
            kind="primary"
            onPress={submitUsername}
            disabled={!valid || submitting}
            loading={submitting}
            big
          />
          {!isNetworkErrorMessage(state.error) && state.error ? <ErrorBanner message={state.error} style={{ marginVertical: 0 }} /> : null}
        </GamePanel>
      </Animated.View>
      <NetworkErrorBeacon visible={isNetworkErrorMessage(state.error)} />

      {/* Emote ön ısıtması — maç DIŞINDA ve SIRALI (2026-08-29). Geri sayımdan
          buraya taşındı: orada altı animasyon birden çözülüyor ve donma
          bildiriliyordu. Ana ekran sakin; ısınma bitince katman kaybolur. */}
      <EmoteWarmup />
    </Screen>
  );
}

function arenaColor(name: string): string {
  return ARENA_DATA.find((a) => a.name === name)?.color ?? theme.primary;
}

// The home console's dominant action — one oversized primary button with a
// periodic shine pass. Same Btn anatomy (ink outline → lip → top-lit face).
// memo: HomeScreen'in her render'ında (tuş vuruşu, popup açılışı, ws dispatch)
// bu ağır primitifler boşa yeniden çizilmesin — tüm props ilkel/sabit kimlikli.
const HeroPlayBtn = memo(function HeroPlayBtn({ label, onPress, height = 64 }: { label: string; onPress: () => void; height?: number }) {
  const press = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  const ty = press.interpolate({ inputRange: [0, 1], outputRange: [0, 4] });
  const skin = BTN_SKINS.green;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { triggerFeedback(GameFeedbackEvent.UI_PLAY); Animated.timing(press, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start(); }}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: PRESS_OUT_MS, useNativeDriver: true }).start()}
      style={{ marginVertical: 4 }}
    >
      {/* Gövde artık satın alınan "glossy" setinin 9-dilim yeşil düğmesi
          (BTN_SKINS). Ölçülmüş SVG degrade + ayrı dudak katmanı kaldırıldı:
          asset zaten kendi kavisini, parlaklığını ve alt dudağını taşıyor.
          Korunanlar: hafif basma çökmesi, top filigranı ve eğik etiket. */}
      <Animated.View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ transform: [{ translateY: ty }], height, justifyContent: 'center' }}
      >
        <Image
          source={skin.src}
          resizeMode="stretch"
          capInsets={skin.caps}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: undefined, height: undefined }}
        />
        <View pointerEvents="none" style={{ position: 'absolute', right: -10, top: -6, width: 92, height: 92, opacity: 0.13 }}>
          <Image source={BALL_WATERMARK} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
        {w > 0 ? <ShineSweep width={w} height={height} loop delay={1600} duration={800} loopGap={3600} opacity={0.18} band={0.2} /> : null}
        {/* Etiket: setin basılı yazısı gibi koyu gövde + açık dış hat; eğim
            transform ile (Poppins burada italik kesim taşımıyor). */}
        <Text
          numberOfLines={1}
          style={{
            color: SKIN_LABEL_COLOR, fontSize: Math.round(height * 0.36), fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.8,
            textAlign: 'center', transform: [{ skewX: '-9deg' }], ...SKIN_LABEL_SHADOW,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

// External info links. These MUST all resolve: they used to point at the parked
// crossover.gg placeholder domain, and App Store review cited the dead Terms /
// privacy links under guideline 3.1.2(c). Every entry here is a live page on
// crossoverfootball.com — verify before changing one.
const INFO_LINKS = {
  help: 'https://crossoverfootball.com/destek/',
  privacy: 'https://crossoverfootball.com/gizlilik/',
  parents: 'https://crossoverfootball.com/ebeveyn/',
  terms: 'https://crossoverfootball.com/kosullar/',
  founders: 'https://crossoverfootball.com/',
};
const openLink = (url: string) => { Linking.openURL(url).catch(() => {}); };

// Shared chip style for the external-link rows. Module scope, not local to
// SettingsPanel: the Store's subscription disclosure (guideline 3.1.2c) renders
// the same Terms / privacy chips.
const linkChip = (pressed: boolean) => ({
  flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7,
  paddingVertical: 11, paddingHorizontal: 11, borderRadius: 12,
  backgroundColor: pressed ? theme.well : theme.surface2,
  borderTopWidth: 1 as const, borderTopColor: theme.topLight,
  transform: [{ scale: pressed ? 0.98 : 1 }],
  ...shadowRow,
});
const linkTxt = { color: theme.text, fontSize: 12, fontFamily: 'Poppins-SemiBold', flex: 1 };

// Shown IN the app (guideline 1.2: "provide contact information in the app
// itself, giving users the ability to report inappropriate activity").
const SUPPORT_EMAIL = 'info@crossoverfootball.com';

const FEEDBACK_CATEGORIES: { id: PlayerFeedbackCategory; icon: IoniconName; title: string; body: string }[] = [
  { id: 'suggestion', icon: 'bulb', title: 'Öneri', body: 'Oyuna ekleyelim dediğin fikirler.' },
  { id: 'bug', icon: 'warning', title: 'Sorun Bildir', body: 'Çalışmayan veya garip görünen bir şey.' },
  { id: 'gameplay', icon: 'game-controller', title: 'Oyun Deneyimi', body: 'Modlar, denge, botlar veya maç hissi.' },
  { id: 'purchase', icon: 'diamond', title: 'Satın Alma', body: 'Elmas veya Social Pack ile ilgili destek.' },
  { id: 'general', icon: 'heart', title: 'Genel Görüş', body: 'Aklındaki başka her şey.' },
];

export function FeedbackCenterModal({ visible, playerId, context, initialCategory, onClose }: {
  visible: boolean;
  playerId?: string | null;
  context?: Record<string, unknown>;
  initialCategory?: PlayerFeedbackCategory;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<PlayerFeedbackCategory | null>(initialCategory ?? null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setCategory(initialCategory ?? null);
    setMessage('');
    setSending(false);
    setSent(false);
    setError(null);
  }, [visible, initialCategory]);
  const selected = FEEDBACK_CATEGORIES.find((c) => c.id === category) ?? null;
  const canSend = Boolean(category && message.trim().length >= 4 && message.length <= 1200 && !sending);
  const send = () => {
    if (!category || !canSend) return;
    // ÖNCE klavye kapanır (kullanıcı raporu 2026-08-27: Gönder'e basınca çökme —
    // klavye açıkken KeyboardAvoidingView dalından 'sent' görünümüne geçiş iOS'ta
    // native modal içinde input aksesuar görünümünü sahipsiz bırakıyordu).
    dismissActiveInput();
    setSending(true);
    setError(null);
    submitPlayerFeedback({ category, message, playerId, context })
      .then(() => {
        track('feedback_submitted', { category, source: typeof context?.source === 'string' ? context.source : 'unknown', message_length: message.trim().length });
        triggerFeedback(GameFeedbackEvent.PURCHASE_CONFIRMED);
        // Görünüm değişimi bir frame sonraya: klavye kapanış animasyonu tamamlanmadan
        // input ağacı sökülmesin.
        requestAnimationFrame(() => setSent(true));
      })
      .catch(() => setError('Gönderilemedi. Bağlantını kontrol edip tekrar deneyebilirsin.'))
      .finally(() => setSending(false));
  };
  return (
    <GameModal visible={visible} onClose={onClose} title={sent ? 'Teşekkürler!' : 'Görüş & Destek'} icon={sent ? 'checkmark-circle' : 'chatbubbles'}>
      {sent ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: withAlpha(theme.primary, 0.18), alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.primary }}>
            <Ionicons name="checkmark" size={34} color={theme.primary} />
          </View>
          <Text style={{ color: theme.text, fontSize: 17, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>Geri bildirimin bize ulaştı.</Text>
          <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>COF’u birlikte daha iyi hale getiriyoruz.</Text>
          <Btn big label="Tamam" onPress={onClose} />
        </View>
      ) : !category ? (
        <View style={{ gap: 9 }}>
          <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginBottom: 2 }}>Eklememizi, düzeltmemizi veya değiştirmemizi istediğin bir şey var mı?</Text>
          {FEEDBACK_CATEGORIES.map((c) => (
            <GameRow key={c.id} icon={c.icon} iconColor={theme.primary} label={c.title} sublabel={c.body} chevron onPress={() => { triggerFeedback(GameFeedbackEvent.UI_TAP); setCategory(c.id); }} />
          ))}
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ gap: 10 }}>
            <Pressable onPress={() => setCategory(null)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 8 })}>
              <Ionicons name="chevron-back" size={17} color={theme.primary} />
              <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>{selected?.title}</Text>
            </Pressable>
            <TextInput
              value={message}
              onChangeText={(v) => { setMessage(v.slice(0, 1200)); if (error) setError(null); }}
              multiline
              placeholder="Bize neyi anlatmak istersin?"
              placeholderTextColor={theme.muted}
              textAlignVertical="top"
              style={{ minHeight: 140, maxHeight: 220, color: theme.text, backgroundColor: theme.well, borderRadius: 16, borderWidth: 1.5, borderColor: error ? theme.danger : theme.border, padding: 12, fontFamily: 'Poppins-SemiBold', fontSize: 14, lineHeight: 20 }}
            />
            <Text style={{ color: message.length > 1180 ? theme.danger : theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 11, textAlign: 'right' }}>{message.length}/1200</Text>
            {error ? <Text style={{ color: theme.danger, fontFamily: 'Poppins-SemiBold', fontSize: 12.5, textAlign: 'center' }}>{error}</Text> : null}
            <Btn big label={sending ? 'Gönderiliyor...' : 'Gönder'} disabled={!canSend} onPress={send} />
          </View>
        </KeyboardAvoidingView>
      )}
    </GameModal>
  );
}

// ---- Settings Panel (inside hamburger menu) ----
function SettingsPanel({ onLanguageChange, diamonds, playerId, arenaName, monetizationDiagnostics, canChangeName, onChangeName, onNeedDiamonds, onLogout, onDeleteAccount, blocked, onListBlocked, onUnblock }: {
  onLanguageChange: () => void;
  diamonds: number;
  playerId?: string | null;
  arenaName?: string | null;
  monetizationDiagnostics?: Record<string, string | number | boolean | null | undefined>;
  // Yalnız Apple/Google hesapları ad değiştirebilir — misafirlerde bölüm HİÇ çizilmez.
  canChangeName: boolean;
  onChangeName: (name: string) => void;
  onNeedDiamonds: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  // Guideline 1.2 — the blocked list has to be reviewable and reversible.
  blocked: BlockedUserView[];
  onListBlocked: () => void;
  onUnblock: (userId: string) => void;
}) {
  const [langPicker, setLangPicker] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const activeLang = currentLang();
  const activeName = LANGUAGES.find((l) => l.code === activeLang)?.name ?? activeLang;
  const { prefs: feedbackPrefs, setPreference: setFeedbackPreference } = useFeedbackPreferences();

  const feedbackToggle = (key: 'music' | 'sfx' | 'haptics', label: string, icon: IoniconName) => {
    const enabled = feedbackPrefs[key];
    return (
      <Pressable
        onPress={() => {
          const next = !enabled;
          triggerFeedback(next ? GameFeedbackEvent.UI_TOGGLE_ON : GameFeedbackEvent.UI_TOGGLE_OFF);
          setFeedbackPreference(key, next).catch(() => {});
        }}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: theme.surface2, borderRadius: 14, borderTopWidth: 1, borderTopColor: theme.topLight,
          paddingVertical: 11, paddingHorizontal: 12, marginTop: 8,
          transform: [{ translateY: pressed ? 2 : 0 }],
          ...shadowRow,
        })}
      >
        <Ionicons name={icon} size={18} color={enabled ? theme.primary : theme.muted} />
        <Text style={{ flex: 1, color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold' }}>{label}</Text>
        <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: enabled ? withAlpha(theme.primary, 0.28) : theme.well, borderWidth: 1.5, borderColor: enabled ? theme.primary : theme.border, padding: 3, alignItems: enabled ? 'flex-end' : 'flex-start' }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: enabled ? theme.primary : theme.muted }} />
        </View>
      </Pressable>
    );
  };

  const doChangeLang = (code: string) => {
    setLanguage(code);
    AsyncStorage.setItem('@crossover_lang', code).catch(() => {});
    setLangPicker(false);
    onLanguageChange();
  };

  return (
    <View style={{ paddingBottom: 4 }}>
      <SectionHeader label={t('settings.language')} icon="language" style={{ marginTop: 2 }} />
      <GameRow
        icon="language"
        label={activeName}
        right={<Ionicons name="chevron-down" size={16} color={theme.muted} />}
        onPress={() => setLangPicker(true)}
      />

      <SectionHeader label={t('settings.feedback')} icon="volume-high" style={{ marginTop: 18 }} />
      {feedbackToggle('music', t('settings.music'), 'musical-notes')}
      {feedbackToggle('sfx', t('settings.sfx'), 'volume-medium')}
      {feedbackToggle('haptics', t('settings.haptics'), 'phone-portrait')}

      <SectionHeader label="Görüş, Öneri ve Destek" icon="chatbubbles" style={{ marginTop: 18 }} />
      <GameRow
        icon="chatbubbles"
        iconColor={theme.primary}
        label="Görüş & Destek"
        right={<Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>Yaz</Text>}
        chevron
        onPress={() => setFeedbackOpen(true)}
      />
      <GameRow
        icon="pulse"
        iconColor={theme.accent}
        label="Monetization Diagnostics"
        right={<Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>Durum</Text>}
        chevron
        onPress={() => setDiagnosticsOpen(true)}
      />
      {__DEV__ ? (
        <GamePanel compact style={{ marginTop: 10 }} bodyStyle={{ padding: 10 }}>
          <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1, marginBottom: 6 }}>FEEDBACK TEST</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([
              ['UI Tap', GameFeedbackEvent.UI_TAP],
              ['Correct', GameFeedbackEvent.ANSWER_CORRECT],
              ['Wrong', GameFeedbackEvent.ANSWER_WRONG],
              ['Timer', GameFeedbackEvent.TIMER_CRITICAL],
              ['Countdown', GameFeedbackEvent.COUNTDOWN_1],
              ['Match Found', GameFeedbackEvent.MATCH_FOUND],
              ['Victory', GameFeedbackEvent.MATCH_WIN],
              ['Defeat', GameFeedbackEvent.MATCH_LOSE],
              ['Trophy', GameFeedbackEvent.TROPHY_GAIN],
              ['Level Up', GameFeedbackEvent.LEVEL_UP],
              ['Arena', GameFeedbackEvent.ARENA_UNLOCK],
              ['Ronaldo', GameFeedbackEvent.SPECIAL_PLAYER_RONALDO],
            ] as const).map(([label, event]) => (
              <Pressable key={event} onPress={() => triggerFeedback(event)} style={({ pressed }) => ({ backgroundColor: pressed ? theme.surface3 : theme.surface2, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, borderTopWidth: 1, borderTopColor: theme.topLight })}>
                <Text style={{ color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold' }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </GamePanel>
      ) : null}

      {/* Ad Değiştir (1000 elmas) — YALNIZ Apple/Google hesapları; misafirde bölüm yok */}
      {canChangeName ? (
        <>
          <SectionHeader label={t('settings.name')} icon="create" />
          <GameRow
            icon="create"
            label={t('settings.changeName')}
            right={(
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.cardLip, borderRadius: 9, borderWidth: 1, borderColor: theme.accentDark, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: theme.accent, fontFamily: 'Poppins-ExtraBold', fontSize: 12, fontVariant: ['tabular-nums'], ...engrave('sm') }}>1000</Text>
                <GemIcon size={13} />
              </View>
            )}
            onPress={() => { if (diamonds < 1000) { recordShortfall(1000 - diamonds); onNeedDiamonds(); } else setRenameOpen(true); }}
          />

          <ChangeNameModal
            visible={renameOpen}
            diamonds={diamonds}
            onClose={() => setRenameOpen(false)}
            onConfirm={(newName) => { onChangeName(newName); setRenameOpen(false); }}
          />
        </>
      ) : null}

      {/* ── Yardım & Bilgiler — framed link chips ── */}
      <SectionHeader label={t('settings.help')} icon="help-circle" style={{ marginTop: 18 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={({ pressed }) => [linkChip(pressed), { flex: 1 }]} onPress={() => openLink(INFO_LINKS.help)}>
          <Ionicons name="help-circle-outline" size={15} color={theme.muted} />
          <Text style={linkTxt} numberOfLines={1}>{t('settings.help')}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [linkChip(pressed), { flex: 1 }]} onPress={() => openLink(INFO_LINKS.privacy)}>
          <Ionicons name="shield-checkmark-outline" size={15} color={theme.muted} />
          <Text style={linkTxt} numberOfLines={1}>{t('settings.privacy')}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Pressable style={({ pressed }) => [linkChip(pressed), { flex: 1 }]} onPress={() => openLink(INFO_LINKS.parents)}>
          <Ionicons name="people-outline" size={15} color={theme.muted} />
          <Text style={linkTxt} numberOfLines={1}>{t('settings.parents')}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [linkChip(pressed), { flex: 1 }]} onPress={() => openLink(INFO_LINKS.terms)}>
          <Ionicons name="document-text-outline" size={15} color={theme.muted} />
          <Text style={linkTxt} numberOfLines={1}>{t('settings.terms')}</Text>
        </Pressable>
      </View>
      <Pressable style={({ pressed }) => [linkChip(pressed), { marginTop: 8, justifyContent: 'center' }]} onPress={() => openLink(INFO_LINKS.founders)}>
        <Ionicons name="star-outline" size={15} color={theme.accent} />
        <Text style={[linkTxt, { flex: 0, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.5 }]}>{t('settings.founders')}</Text>
      </Pressable>

      {/* ---- Guideline 1.2: safety controls, reachable without leaving the app ---- */}
      <View style={{ height: 1, backgroundColor: theme.hairline, marginTop: 18, marginBottom: 8 }} />
      <GameRow
        icon="ban"
        iconColor={theme.muted}
        label={t('mod.blockedUsers')}
        right={blocked.length ? <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>{blocked.length}</Text> : undefined}
        chevron
        onPress={() => { onListBlocked(); setBlockedOpen(true); }}
      />
      <GameRow
        icon="flag"
        iconColor={theme.muted}
        label={t('mod.contactTitle')}
        chevron
        onPress={() => setContactOpen(true)}
      />

      <View style={{ height: 1, backgroundColor: theme.hairline, marginTop: 18, marginBottom: 8 }} />
      <GameRow
        icon="log-out"
        iconColor={theme.danger}
        label={t('profile.logout')}
        chevron
        onPress={() => setLogoutConfirm(true)}
      />

      <GameModal visible={logoutConfirm} onClose={() => setLogoutConfirm(false)} title={t('profile.logoutTitle')} icon="log-out" danger>
        <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
          {t('profile.logoutConfirm')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Btn label={t('settings.cancel')} kind="ghost" onPress={() => setLogoutConfirm(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label={t('profile.logout')} kind="danger" icon="log-out" onPress={() => { setLogoutConfirm(false); onLogout(); }} />
          </View>
        </View>
      </GameModal>

      {/* Hesabı Sil — App Store 5.1.1(v): hesap oluşturan uygulamalar uygulama
          içinden kalıcı hesap silme sunmak zorunda. Yıkıcı → çift onaylı. */}
      <View style={{ height: 1, backgroundColor: theme.hairline, marginTop: 8, marginBottom: 8 }} />
      <GameRow
        icon="trash"
        iconColor={theme.danger}
        label={t('profile.deleteAccount')}
        chevron
        onPress={() => setDeleteConfirm(true)}
      />

      <GameModal visible={deleteConfirm} onClose={() => setDeleteConfirm(false)} title={t('profile.deleteAccountTitle')} icon="trash" danger>
        <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
          {t('profile.deleteAccountConfirm')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Btn label={t('settings.cancel')} kind="ghost" onPress={() => setDeleteConfirm(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label={t('profile.deleteAccountConfirmBtn')} kind="danger" icon="trash" onPress={() => { setDeleteConfirm(false); onDeleteAccount(); }} />
          </View>
        </View>
      </GameModal>

      <FeedbackCenterModal
        visible={feedbackOpen}
        playerId={playerId}
        context={{ source: 'settings', arenaName, diamonds }}
        onClose={() => setFeedbackOpen(false)}
      />

      <GameModal visible={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} title="Monetization Diagnostics" icon="pulse">
        <View style={{ gap: 8 }}>
          {Object.entries(monetizationDiagnostics ?? {}).map(([key, value]) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: theme.well, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
              <Text style={{ flex: 1, color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold' }}>{key}</Text>
              <Text selectable style={{ flex: 1, color: theme.text, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'right' }} numberOfLines={3}>{String(value)}</Text>
            </View>
          ))}
        </View>
      </GameModal>

      {/* Blocked users — reviewable and reversible (guideline 1.2). */}
      <PopupCard visible={blockedOpen} title={t('mod.blockedUsers')} icon="ban" onClose={() => setBlockedOpen(false)}>
        <ScrollView style={{ maxHeight: 430 }} contentContainerStyle={{ padding: 12 }} showsVerticalScrollIndicator={false}>
          {blocked.length === 0 ? (
            <EmptyState icon="ban" title={t('mod.noBlocked')} />
          ) : blocked.map((b) => (
            <GameRow
              key={b.userId}
              icon="person"
              label={b.displayName}
              right={(
                <Pressable onPress={() => onUnblock(b.userId)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ color: theme.primary, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>{t('mod.unblock')}</Text>
                </Pressable>
              )}
            />
          ))}
        </ScrollView>
      </PopupCard>

      {/* In-app contact for reporting inappropriate activity — Apple requires the
          developer's contact to be inside the app, not only on the website. */}
      <GameModal visible={contactOpen} onClose={() => setContactOpen(false)} title={t('mod.contactTitle')} icon="flag">
        <Text style={{ color: theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19 }}>
          {t('mod.contactBody')}
        </Text>
        <Text selectable style={{ color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>
          {SUPPORT_EMAIL}
        </Text>
        <Btn big icon="mail" label={t('mod.contactAction')} onPress={() => openLink(`mailto:${SUPPORT_EMAIL}?subject=Crossover%20-%20Report`)} />
      </GameModal>

      {/* Language picker — GameRow rows (cardLip bevel + press physics + spring
          check); doChangeLang applies immediately, no confirm step. */}
      <PopupCard visible={langPicker} title={t('settings.language')} icon="language" onClose={() => setLangPicker(false)}>
        <ScrollView style={{ maxHeight: 430 }} contentContainerStyle={{ padding: 12 }} showsVerticalScrollIndicator={false}>
          {LANGUAGES.map((lang) => (
            <GameRow
              key={lang.code}
              label={lang.name}
              selected={lang.code === activeLang}
              onPress={() => {
                if (lang.code === activeLang) { setLangPicker(false); return; }
                doChangeLang(lang.code); // apply immediately (the confirm modal sat behind the picker → unselectable)
              }}
            />
          ))}
        </ScrollView>
      </PopupCard>
    </View>
  );
}

const PROFILE_MODE_ORDER: GameMode[] = ['team-team', 'country-team', 'letter-team', 'player-player'];
function modeStatFor(stats: { mode: string; wins: number; losses: number }[] | undefined | null, mode: GameMode): { wins: number; losses: number } {
  const s = stats?.find((m) => m.mode === mode);
  return { wins: s?.wins ?? 0, losses: s?.losses ?? 0 };
}

function ModeStatChip({ mode, wins, losses }: { mode: GameMode; wins: number; losses: number }) {
  const total = wins + losses;
  const pct = total ? Math.round((wins / total) * 100) : 0;
  const c = mode === 'team-team' ? theme.primary : mode === 'country-team' ? theme.blue : mode === 'letter-team' ? theme.accent : theme.purple;
  return (
    <GamePanel compact accentStripe={c} style={{ flex: 1 }} bodyStyle={{ paddingVertical: 9, paddingHorizontal: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <Ionicons name={MODE_ICON[mode]} size={13} color={c} />
        <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{MODE_LABEL(mode)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={{ color: c, fontSize: 16, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{wins}G</Text>
        <Text style={{ color: theme.danger, fontSize: 16, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{losses}M</Text>
      </View>
      <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold' }}>%{pct}</Text>
    </GamePanel>
  );
}

function ModeStatsGrid({ stats }: { stats?: { mode: string; wins: number; losses: number }[] | null }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PROFILE_MODE_ORDER.slice(0, 2).map((mode) => <ModeStatChip key={mode} mode={mode} {...modeStatFor(stats, mode)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PROFILE_MODE_ORDER.slice(2).map((mode) => <ModeStatChip key={mode} mode={mode} {...modeStatFor(stats, mode)} />)}
      </View>
    </View>
  );
}

// Centered "letter" popup shell — gold-framed card, title + top-right X, scrollable
// body. Everything that used to open fullscreen (leaderboard, match history) now uses
// this so it pops in the middle of the screen instead of taking it over.
function PopupCard({ visible, title, icon, onClose, children }: {
  visible: boolean; title: string; icon: IoniconName; onClose: () => void; children: ReactNode;
}) {
  // Kart 200ms kuyruksuz eğriyle (0.92→1) oturur; karartma AYRI değerle 140ms'de
  // biter — GameModal ile aynı dil (bkz. oradaki gerekçe, 2026-08-11).
  // centered cards never use animationType='fade'/'slide' (spec §7).
  const a = useRef(new Animated.Value(0)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  // Sunum sırası SafeModal'da (modalTraffic) — burada yalnız animasyon durumu.
  // useLayoutEffect (2026-08-10): GameModal'daki gerekçenin aynısı — pasif gate
  // sunum öncesi boş commit'ler ekliyor, giriş görünmez karelerde başlıyordu.
  // Senkron flush ile girişin ilk karesi = ilk görünen kare. Çıkış pasif kalır.
  useLayoutEffect(() => {
    if (!visible) return;
    setMounted(true);
    Animated.timing(a, { toValue: 1, duration: 200, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
    Animated.timing(scrim, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [visible, a, scrim]);
  useEffect(() => {
    if (visible) return;
    Animated.timing(scrim, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(a, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, a, scrim]);
  if (!mounted) return null;
  const clamped = a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <SafeModal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 18 }}>
        {/* Backdrop catches outside taps. It is a SIBLING of the card (not a parent),
            so it never swallows the inner ScrollView's scroll gestures. */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim, opacity: scrim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        {/* "Broadcast Premium" pencere dili (kullanıcı onaylı yön, 2026-07-30):
            TEK temiz kart yüzeyi + 3px üst aksan şeridi + sol aksan çubuklu
            başlık + sessiz dairesel X. Düğme anatomisinin (altın pah + renkli
            başlık bandı) pencereye taşınmış hâli kullanıcıya "şablon işi"
            okundu — 2026-08-10'da geri alındı. `icon` prop'u API uyumu için
            duruyor; bu dilde çizilmiyor. */}
        <Animated.View style={{ opacity: clamped, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }], backgroundColor: theme.modalFace, borderRadius: 22, borderWidth: 1, borderColor: theme.hairline, overflow: 'hidden', maxHeight: '80%', ...shadowModal }}>
          <View pointerEvents="none" style={{ height: 3, backgroundColor: theme.accent }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 11 }}>
            <View style={{ width: 4, height: 17, borderRadius: 2, backgroundColor: theme.accent }} />
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 16, flex: 1 }} numberOfLines={1}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 30, height: 30, borderRadius: 15,
                backgroundColor: theme.surface2,
                alignItems: 'center', justifyContent: 'center',
                transform: [{ scale: pressed ? 0.9 : 1 }],
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Ionicons name="close" size={15} color={theme.muted} />
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: theme.hairline, marginHorizontal: 16 }} />
          {children}
        </Animated.View>
      </View>
    </SafeModal>
  );
}

// ---- News / announcements feed (opened from the Home bell icon) ----
// Static for now; swap NEWS for a server `/news` fetch later without touching the UI
// or the bell wiring. Newest item first — its id drives the unread pip.
// Etiketli, ISO tarihli haber modeli. "Etiket yok + nokta ayraçlı mutlak tarih"
// ikilisi, akışı editoryal değil ÜRETİLMİŞ gösteren en belirgin izlerdendi.
type NewsItem = { id: string; tag: string; date: string; title: string; body: string; icon: any; tint: string };
// Boş tutulur: buraya yalnız GERÇEK, editör elinden çıkmış duyurular girer
// (kullanıcı kararı 2026-08-10 — lansman dolgu metinleri kaldırıldı). Akış
// boşken NewsModal EmptyState gösterir, zil noktası hiç yanmaz.
const NEWS: NewsItem[] = [
  {
    id: 'cozkazan-launch-2026-09-01',
    tag: 'YENİ MOD',
    date: '2026-09-01',
    title: 'Çöz Kazan yayında!',
    body: 'Karışık harflerle verilen futbolcuyu ilk çözen kazanır! 7 tur, canlı yarış — takıldığın harfi elmasla açabilirsin. Diğer Modlar ve Bot Maçı bölümlerinden oynanır; Sosyal Paket gerektirir.',
    icon: 'shuffle',
    tint: '#16B27A',
  },
  {
    id: 'xox-launch-2026-08-27',
    tag: 'YENİ MOD',
    date: '2026-08-27',
    title: 'Futbol XOX yayında!',
    body: 'İki takımda da forma giymiş futbolcuları bilerek 3×3 tahtada hücre kap — üçü yan yana getiren maçı alır. Diğer Modlar bölümünden oynayabilirsin; Sosyal Paketle arkadaşlarına da meydan oku.',
    icon: 'grid',
    tint: '#7C5CFF',
  },
];
export const LATEST_NEWS_ID = NEWS[0]?.id ?? '';
export const NEWS_READ_KEY = '@crossover_news_read';

// Göreli zaman — mutlak "20.07.2026" yerine. Bir haftadan eskiler kısa mutlak.
function relDate(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return t('time.today');
  if (days === 1) return t('time.yesterday');
  if (days < 7) return t('time.daysAgo', { n: String(days) });
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Kategori çipi — her gerçek oyun haberinin taşıdığı editoryal işaret.
function NewsTag({ label, tint }: { label: string; tint: string }) {
  return (
    <View style={{ backgroundColor: tint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5, overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.3 }} />
      <Text style={{ color: SKIN_LABEL_COLOR, fontFamily: 'Poppins-Black', fontSize: 9, letterSpacing: 0.8 }}>{label}</Text>
    </View>
  );
}

// Bölüm başlığı: etiket + sağa doğru incelen çizgi (kenara DAYANMAZ).
function SectionLabel({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 2 }}>
      <Text style={{ color: theme.muted, fontFamily: 'Poppins-Black', fontSize: 11, letterSpacing: 1.2 }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.hairline }} />
      <View style={{ width: 28 }} />
    </View>
  );
}

// Tek haber satırı. Eski hâlindeki 38pt "renkli çerçeveli ikon kutucuğu" şablon
// izinin ta kendisiydi: artık çerçevesiz, tint'in %18 alfasıyla dolu 64pt disk.
// Metin sütunu her satırda aynı x'te (12+64+12=88) başlar → başlıklar hizalanır.
function NewsRow({ item, unread }: { item: NewsItem; unread: boolean }) {
  return (
    <View style={{ backgroundColor: theme.surface2, borderRadius: 16, overflow: 'hidden', ...shadowRow }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.07 }} />
      {unread ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: item.tint }} /> : null}
      <View style={{ flexDirection: 'row', padding: 12, gap: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: withAlpha(item.tint, 0.18), alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={item.icon} size={30} color={item.tint} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <NewsTag label={item.tag} tint={item.tint} />
            {unread ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: item.tint }} /> : null}
            <View style={{ flex: 1 }} />
            <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{relDate(item.date)}</Text>
          </View>
          <Text numberOfLines={1} style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 15 }}>{item.title}</Text>
          <Text numberOfLines={2} style={{ color: theme.textSub, fontFamily: 'Poppins-SemiBold', fontSize: 13, lineHeight: 19 }}>{item.body}</Text>
        </View>
      </View>
    </View>
  );
}

export function NewsModal({ visible, onClose, seenIds }: { visible: boolean; onClose: () => void; seenIds?: string[] }) {
  const seen = new Set(seenIds ?? []);
  const items = [...NEWS].sort((a, b) => (a.date < b.date ? 1 : -1));
  const fresh = items.filter((i) => !seen.has(i.id));
  const older = items.filter((i) => seen.has(i.id));
  return (
    <PopupCard visible={visible} title={t('home.news')} icon="megaphone" onClose={onClose}>
      {/* PopupCard's scrim is a SIBLING (not a parent) of the card, so — unlike
          GameModal — it doesn't swallow this ScrollView's vertical drag. */}
      <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 18, gap: 10 }}>
        {items.length === 0 ? (
          <EmptyState icon="megaphone" title={t('news.empty')} hint={t('news.emptyHint')} />
        ) : (
          <>
            {fresh.length > 0 && older.length > 0 ? <SectionLabel label={t('news.new')} /> : null}
            {fresh.map((item) => <NewsRow key={item.id} item={item} unread />)}
            {older.length > 0 && fresh.length > 0 ? <SectionLabel label={t('news.earlier')} /> : null}
            {older.map((item) => <NewsRow key={item.id} item={item} unread={false} />)}
          </>
        )}
      </ScrollView>
    </PopupCard>
  );
}

function MyLeaderboardRank({ rank }: { rank?: number }) {
  if (!rank) return null;
  return (
    <View style={{ marginHorizontal: 14, marginTop: 2, marginBottom: 10, borderRadius: 14, backgroundColor: theme.well, borderWidth: 1, borderColor: theme.hairline, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Ionicons name="podium" size={13} color={theme.accent} />
      <Text style={{ color: theme.text, fontSize: 12, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{t('leaderboard.myRank', { rank: `#${rank}` })}</Text>
    </View>
  );
}

export function LeaderboardModal({ visible, entries, myUserId, onClose, onViewProfile }: {
  visible: boolean;
  entries: GameState['leaderboard'];
  myUserId?: string | null;
  onClose: () => void;
  onViewProfile?: (userId: string) => void;
}) {
  // Loading ≠ empty: shimmer skeletons during the fetch window, then a crafted
  // EmptyState if the board is genuinely empty (spec §9).
  const graceOver = useLoadGrace(visible && entries.length === 0);
  // onViewProfile App'in her render'ında yeni kapanış — latest-ref ile sabitlenir
  // ki memo(LeaderboardRow) tutsun (satır başına taze closure memo'yu bozuyordu,
  // pano açıkken her dispatch 50 satırı yeniden çiziyordu). Tanımsızsa undefined
  // geçilir → satırlar bugünkü gibi devre dışı kalır.
  const vpRef = useRef(onViewProfile);
  vpRef.current = onViewProfile;
  const onView = useCallback((id: string) => vpRef.current?.(id), []);
  const myRank = entries.find((e) => e.userId === myUserId)?.rank;
  return (
    <PopupCard visible={visible} title={t('menu.leaderboard')} icon="podium" onClose={onClose}>
      {/* FlatList (2026-08-10): düz ScrollView 50 satırı (~750 view) popup yayı
          çalışırken TEK commit'te basıyordu; görünür alan ~6 satır. Aynı
          maxHeight/padding — pikseller aynı, ekran dışı satırlar tembel basar.
          removeClippedSubviews kapalı: RankBadge parıltı gölgesi kırpılmasın. */}
      <FlatList
        data={entries}
        style={{ maxHeight: 460 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10 }}
        showsVerticalScrollIndicator={false}
        keyExtractor={(e) => String(e.rank)}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={false}
        ListEmptyComponent={graceOver ? <LeaderboardEmpty onPlay={onClose} /> : <SkeletonRows rows={4} />}
        renderItem={({ item }) => <LeaderboardRow entry={item} onView={onViewProfile ? onView : undefined} />}
      />
      <MyLeaderboardRank rank={myRank} />
    </PopupCard>
  );
}

export function MatchHistoryModal({ visible, history, myName, onClose }: { visible: boolean; history: GameState['matchHistory']; myName: string; onClose: () => void }) {
  return (
    <PopupCard visible={visible} title={t('menu.matchHistory')} icon="time" onClose={onClose}>
      {/* FlatList (2026-08-10): geçmiş SINIRSIZ (sunucu sorgusunda LIMIT yok) —
          düz ScrollView her maçı popup yayı sırasında tek commit'te basıyordu,
          açılış hesap yaşlandıkça ağırlaşıyordu. Aynı maxHeight/padding;
          removeClippedSubviews kapalı ki kart gölgeleri kenarda kırpılmasın. */}
      <FlatList
        data={history}
        style={{ maxHeight: 500 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
        showsVerticalScrollIndicator={false}
        keyExtractor={(m) => m.id}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={false}
        ListEmptyComponent={<EmptyState icon="time" title={t('matchHistory.empty')} hint={t('matchHistory.emptyHint')} />}
        renderItem={({ item }) => <MatchHistoryCard match={item} myName={myName} />}
      />
    </PopupCard>
  );
}

// ============================================================================
// HOME v4 — rebuilt from scratch against the "cof. yeni home" mockup.
//
// Layout, top → bottom (proportions taken off the reference JPEG):
//   1. TOP BAR   profile pill (avatar · tier · name · progress) + gem pill, then
//                a row of three raised round buttons (pack / bell / settings)
//   2. HERO      two balls + the CROSSOVER wordmark over the stadium, with a
//                right-hand counter rail (trophies, wins)
//   3. CTA       one oversized green "Hemen Oyna"
//   4. GRID      amber art cards on the left, navy panels on the right
//   5. CAROUSEL  three paged cards + dots
//
// The palette is sampled from the mockup itself and lives in theme.ts
// (primary/amber/clubYellow/navyChip/navyWell/badgeRed).
//
// Where the mockup shows a stat this game has no field for, the SLOT is kept and
// filled with the real equivalent rather than a fake number:
//   coin "3,583" → diamonds (the game's only currency)
//   level "10" / xp bar "9" → arena tier (1–7) + trophy climb to the next arena
//   "35.6k" card counter → wins
// ============================================================================

// The stadium photograph is NOT painted here — it is a ScreenBg variant
// ('stadium', see BG_STADIUM above) chosen by the app shell for the home tab. That
// way the photo runs edge to edge, under the status bar and behind the tab bar,
// instead of being boxed into this screen's padded frame.

// Flat vector art already in the bundle, reused as card fields.
const EMOTE_ART = {
  pitch: require('../assets/emotes/pitch.webp'),
  kick: require('../assets/emotes/kick.webp'),
  squad: require('../assets/emotes/squad.webp'),
  worldcup: require('../assets/emotes/worldcup.webp'),
};

// ---- hero -----------------------------------------------------------------

// Realistic soccer ball: a shaded sphere (radial gradient → 3D roundness), the
// classic truncated-icosahedron pattern (one centre pentagon, five rim pentagons
// clipped by the ball edge, seams between them) and a glossy top-left highlight.
const BALL_R = 44;
const BALL_ANGLES = [-90, -18, 54, 126, 198]; // centre-pentagon vertices
const BALL_RIM_ANGLES = [-54, 18, 90, 162, 234]; // rim pentagons sit on the edge midpoints
const ballPt = (deg: number, rad: number): [number, number] => [
  50 + rad * Math.cos((deg * Math.PI) / 180),
  50 + rad * Math.sin((deg * Math.PI) / 180),
];
const polyStr = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
// A pentagon of radius `r` centred at (angle, dist) from the ball centre, oriented
// so one FLAT edge faces back toward the centre (base = inward − 36°). Placed past
// the rim and clipped, each reads as a clean pentagon cap — not an inward spike.
const pentAround = (angleDeg: number, dist: number, r: number): [number, number][] => {
  const [ox, oy] = ballPt(angleDeg, dist);
  return [0, 1, 2, 3, 4].map((k) => {
    const a = ((angleDeg + 144 + k * 72) * Math.PI) / 180;
    return [ox + r * Math.cos(a), oy + r * Math.sin(a)] as [number, number];
  });
};

let ballSeq = 0;
function Ball({ size, face, faceDark, ink }: { size: number; face: string; faceDark: string; ink: string }) {
  const uid = useMemo(() => `ball${ballSeq++}`, []);
  const centre = BALL_ANGLES.map((a) => ballPt(a, 15));
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${uid}g`} cx="36%" cy="30%" r="72%">
          <Stop offset="0" stopColor={lighten(face, 0.5)} />
          <Stop offset="0.55" stopColor={face} />
          <Stop offset="1" stopColor={faceDark} />
        </RadialGradient>
        <ClipPath id={`${uid}c`}>
          <Circle cx="50" cy="50" r={BALL_R} />
        </ClipPath>
      </Defs>
      <Circle cx="50" cy="50" r={BALL_R} fill={`url(#${uid}g)`} stroke={ink} strokeWidth={2.5} />
      <G clipPath={`url(#${uid}c)`}>
        {/* seams: centre-pentagon vertex → rim (thin, they trace the hexagon borders) */}
        {BALL_ANGLES.map((a, i) => {
          const [x2, y2] = ballPt(a, BALL_R);
          return <Line key={`s${a}`} x1={centre[i]![0]} y1={centre[i]![1]} x2={x2} y2={y2} stroke={ink} strokeWidth={1.6} strokeLinecap="round" />;
        })}
        {/* five rim pentagons — pushed past the edge so only a clean cap shows */}
        {BALL_RIM_ANGLES.map((a) => (
          <Polygon key={`r${a}`} points={polyStr(pentAround(a, 50, 16))} fill={ink} />
        ))}
        {/* centre pentagon */}
        <Polygon points={polyStr(centre)} fill={ink} />
      </G>
      {/* glossy highlight */}
      <Ellipse cx="37" cy="31" rx="15" ry="10" fill="#FFFFFF" opacity={0.28} />
    </Svg>
  );
}

// The complete hero unit (two balls + CROSSOVER 3D lettering) lifted WHOLE from
// the Top.jpeg mockup with feathered edges — used by the home hero so it matches
// the mockup pixel-for-pixel. Source 708×320.
const HERO_ART = require('../assets/hero-crossover.png');
// (Individual hero-ball cutouts, kept for the legacy BrandBalls pair below.)
const HERO_BALL_WHITE = require('../assets/ball-hero-white.png');
const HERO_BALL_BLUE = require('../assets/ball-hero-blue.png');
function BrandBalls({ size }: { size: number }) {
  const white = size * 0.70;
  const blue = size * 0.64;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
      <Image source={HERO_BALL_WHITE} style={{ width: white, height: white }} resizeMode="contain" />
      <Image source={HERO_BALL_BLUE} style={{ width: blue, height: blue, marginLeft: size * 0.17 }} resizeMode="contain" />
    </View>
  );
}

// "Mücadele Modu" card art: the brand's two balls CHARGING at each other —
// speed streaks trailing, the matchup screen's gold VS coin at the collision
// point. Head-to-head rivalry told entirely in the game's own dialects (the
// hero's Ball + the matchup VsBadge), so the card reads competitive yet
// unmistakably Crossover. Speed streak = a rounded bar trailing the mover.
// "Mücadele Modu" card art — the mockup's own duel, lifted from Top.jpeg as
// three feathered patches (white ball + fire trail, blue ball + icy streaks,
// the gold 3D VS) and laid out at the mockup's measured positions, so the card
// reads exactly like the photo. Patch sizes map the mockup card (462w) onto the
// app card (~170w, scale ≈0.368) with the balls kept perfectly round.
const CARD_DUEL_WHITE = require('../assets/card-duel-white.png');
const CARD_DUEL_BLUE = require('../assets/card-duel-blue.png');
const CARD_DUEL_VS = require('../assets/card-duel-vs.png');
function RivalryArt() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={CARD_DUEL_WHITE} style={{ position: 'absolute', left: 0, top: 25, width: 74, height: 66 }} resizeMode="contain" />
      <Image source={CARD_DUEL_BLUE} style={{ position: 'absolute', right: 0, top: 26, width: 66, height: 65 }} resizeMode="contain" />
      <Image source={CARD_DUEL_VS} style={{ position: 'absolute', alignSelf: 'center', top: 36, width: 38, height: 39 }} resizeMode="contain" />
    </View>
  );
}

// "CROSSOVER" set in Poppins-Black renders 6.75× its fontSize wide — measured off a
// device screenshot, not guessed. The hero sizes itself from this so the mark keeps the
// mockup's ~59%-of-width presence while always clearing the counter rail on its right.
const WORDMARK_ASPECT = 6.754;
const RAIL_CLEARANCE = 50; // rail badge + breathing room, reserved on BOTH sides to stay centred
function wordmarkSize(availW: number): number {
  return Math.min(availW * 0.60, availW - 2 * RAIL_CLEARANCE) / WORDMARK_ASPECT;
}

// RN <Text> has no stroke, so the mockup's outlined 3D wordmark is faked: eight
// navy copies ringed around the glyphs make the outline, a few stacked below make
// the extrude, and the white face sits on top. Cheap enough for one hero title.
const OUTLINE_RING = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

function Wordmark({ size, color = '#FFFFFF', outline = '#0B2145', width = 3, depth = 6 }: {
  size: number; color?: string; outline?: string; width?: number; depth?: number;
}) {
  const base = { fontSize: size, fontFamily: 'Poppins-Black', letterSpacing: size * 0.015, includeFontPadding: false } as const;
  const layer = (key: string, dx: number, dy: number, c: string) => (
    <Text key={key} style={[base, { color: c, position: 'absolute', left: dx, top: dy }]} numberOfLines={1}>CROSSOVER</Text>
  );
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: depth }, (_, i) => layer(`d${i}`, 0, i + 1.5, darken(outline, 0.4)))}
      {OUTLINE_RING.map(([dx, dy]) => layer(`o${dx}${dy}`, dx * width, dy * width, outline))}
      <Text style={[base, { color }]} numberOfLines={1}>CROSSOVER</Text>
    </View>
  );
}

// Falling confetti behind the wordmark: little paper shards (ribbons + squares,
// no lightning/energy symbols) that rain straight down, spinning and swaying, then
// loop from the top. Decorative only — never intercepts touches.
const CONFETTI_COLORS = ['#3EC98A', '#3B82F6', '#F5B331', '#EC5B8C', '#9B6BFF', '#F4F7FC'];
const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 0.6180339 + 0.09) % 1, // golden-ratio scatter → even spread, no clumping
  c: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
  w: 4.5 + (i % 3), // ribbon width
  h: i % 4 === 0 ? 4.5 + (i % 3) : 9 + (i % 3) * 1.5, // some squares, most ribbons
  dur: 2600 + ((i * 173) % 1800), // varied fall speed
  delay: (i * 411) % 2600, // stagger so they're spread down the column at any instant
  spins: 1 + (i % 3),
  sway: 6 + (i % 4) * 4,
  round: i % 5 === 0,
}));

// One shard: falls top→bottom on a linear loop (resets off-screen, so seamless),
// spinning as it goes and swaying left/right. Native driver — no per-frame JS.
function ConfettiPiece({ p, w, h, visible }: { p: (typeof CONFETTI)[number]; w: number; h: number; visible: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Görünmezken döngü çalışmaz ve parça klips kutusunun ÜSTÜNE park eder
    // (setValue(0) → translateY -20; overflow:hidden gizler). setValue'suz
    // durdurmak parçayı düşüşün ortasında donmuş bırakıyordu — ekran kayarken
    // yarı görünür kalırdı. Dönüşte başlangıç yolu aynen yeniden koşar
    // (uygulama açılışındaki stagger dolumuyla birebir aynı görünüm).
    if (!visible) { t.setValue(0); return undefined; }
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: p.dur, easing: Easing.linear, useNativeDriver: true }),
    );
    const start = setTimeout(() => loop.start(), p.delay);
    return () => { clearTimeout(start); loop.stop(); };
  }, [visible, t, p.dur, p.delay]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-20, h + 20] });
  const translateX = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, p.sway, 0, -p.sway, 0] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * p.spins}deg`] });
  return (
    <Animated.View style={{ position: 'absolute', left: p.x * w, top: 0, transform: [{ translateY }, { translateX }, { rotate }] }}>
      <View style={{ width: p.w, height: p.h, borderRadius: p.round ? p.w / 2 : 1.5, backgroundColor: p.c }} />
    </Animated.View>
  );
}

// memo: w/h yerleşimden sonra sabittir — 18 ConfettiPiece ağacı HomeScreen'in
// her render'ında yeniden uzlaştırılmasın (döngüler zaten native tarafta akar).
const HeroConfetti = memo(function HeroConfetti({ w, h, visible = true }: { w: number; h: number; visible?: boolean }) {
  if (w <= 0 || h <= 0) return null;
  return (
    // overflow hidden is load-bearing: while a piece waits out its stagger delay
    // it PARKS at translateY -20 (just above the box). Unclipped, all 18 pieces
    // sat visibly frozen in a row above the hero ("konfeti yukarıda takılı");
    // clipped, they only exist while falling through the box and the loop's
    // top-reset happens off-screen, so entry/exit/loop all read seamless.
    // width: w (not absoluteFill): the clip box must end where the piece field ends,
    // so sway/rotation can never carry a piece under the hero's right badge rail.
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w, overflow: 'hidden' }}>
      {CONFETTI.map((p, i) => <ConfettiPiece key={i} p={p} w={w} h={h} visible={visible} />)}
    </View>
  );
});

// A floating counter beside the hero: round art badge with its value on a dark
// caption chip clipped to the badge's bottom edge.
// memo: sayaç animasyonu render'ı atlar (countAnim listener'ı iç state'i sürer),
// bu yüzden rozet yalnız value/onPress kimliği değişince yeniden çizilmeli.
const RailBadge = memo(function RailBadge({ icon, iconColor, ringColor, value, onPress, countAnim, fillAnim, innerRef }: {
  // value verilmezse rozet SAYISIZ çizilir (ör. liderlik tablosu rozeti)
  icon: IoniconName; iconColor: string; ringColor: string; value?: string; onPress: () => void;
  countAnim?: Animated.Value; fillAnim?: Animated.Value; innerRef?: Ref<View>;
}) {
  const { scale, onIn, onOut } = usePressScale(0.92, GameFeedbackEvent.UI_CARD);
  // When a count animation is supplied (trophy reward), the number ticks from it.
  const [animVal, setAnimVal] = useState(value);
  useEffect(() => {
    if (!countAnim) return;
    const id = countAnim.addListener(({ value: v }) => setAnimVal(String(Math.max(0, Math.round(v)))));
    return () => countAnim.removeListener(id);
  }, [countAnim]);
  const shown = countAnim ? animVal : value;
  return (
    <Pressable ref={innerRef} onPress={onPress} onPressIn={onIn} onPressOut={onOut} hitSlop={6}>
      <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
        <View style={{
          width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
          backgroundColor: withAlpha(ringColor, 0.28),
          borderWidth: 2.5, borderColor: ringColor,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
        }}>
          {fillAnim ? (
            <Animated.View
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%', backgroundColor: withAlpha(theme.gold, 0.55), transformOrigin: 'bottom', transform: [{ scaleY: fillAnim }] }}
            />
          ) : null}
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        {shown != null ? (
          <View style={{
            marginTop: -8,
            backgroundColor: '#0A1428', borderRadius: 9,
            borderWidth: 1.5, borderColor: withAlpha(ringColor, 0.6),
            paddingHorizontal: 7, paddingVertical: 1.5,
          }}>
            <Text style={{ color: theme.text, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{shown}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
});

// ---- top bar --------------------------------------------------------------

// Raised round button — the mockup's pack / bell / gear trio.
const RoundIconBtn = memo(function RoundIconBtn({ icon, onPress, dot = false, tint = theme.text }: {
  icon: IoniconName; onPress: () => void; dot?: boolean; tint?: string;
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2, GameFeedbackEvent.UI_TAP);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} hitSlop={4}>
      <View style={{ backgroundColor: darken(theme.navyChip, 0.5), borderRadius: 18, paddingBottom: 2.5 }}>
        <Animated.View style={{
          transform: [{ translateY: ty }, { scale }],
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: theme.navyChip,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={icon} size={18} color={tint} />
        </Animated.View>
      </View>
      {dot ? (
        <View style={{ position: 'absolute', top: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: theme.badgeRed, borderWidth: 2, borderColor: darken(theme.navyChip, 0.5) }} />
      ) : null}
    </Pressable>
  );
});

// Profile pill: avatar (tier-ringed, tier-badged) · name · progress trough.
// The mockup's "level" is this game's ARENA TIER (1–7, Mahalle→GOAT) and its XP
// bar is the trophy climb toward the next arena — real numbers in the mockup's slots.
// Ödül habercisi — Seviye Yolu'nda toplanacak ödül varken ProfilePill'in
// köşesinde nabız gibi atan altın hediye rozeti (sayaçlı). Kırmızı nokta değil:
// ışıyan, sallanan, davet eden bir "ödülün var!" mührü.
function ClaimHerald({ count }: { count: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 640, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 640, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(900),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const tilt = a.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-8deg', '0deg', '8deg'] });
  return (
    <Animated.View style={{
      transform: [{ scale }],
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: theme.gold, borderRadius: 999,
      paddingHorizontal: 7, paddingVertical: 2.5,
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
    }}>
      <Animated.View style={{ transform: [{ rotate: tilt }] }}>
        <Ionicons name="gift" size={11} color={theme.ink} />
      </Animated.View>
      <Text style={{ color: theme.ink, fontSize: 10, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{count}</Text>
    </Animated.View>
  );
}

// memo: XP çubuğu fillAnim (sabit kimlikli Animated.Value) üzerinden native
// akar; hap yalnız isim/seviye/pct gibi ilkel props değişince yeniden çizilir.
const ProfilePill = memo(function ProfilePill({ name, avatarId, tier, pct, color, onPress, fillAnim, frameId, claimBadge, boosted }: {
  name: string; avatarId?: string | null; tier: number; pct: number; color: string; onPress: () => void;
  // Verilirse çubuk bu 0..1 animasyon değeriyle dolar (XP küre yağmuru sırasında)
  fillAnim?: Animated.Value;
  frameId?: string | null; // takılı profil çerçevesi
  claimBadge?: number; // toplanmamış Seviye Yolu ödülü sayısı (0 = rozet yok)
  boosted?: boolean; // 2x XP jetonu penceresi aktif — çubuğun ucunda altın "2x"
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2, GameFeedbackEvent.UI_TAP);
  const barRef = useRef<View>(null);
  const measureBar = useCallback(() => {
    // XP kürelerinin hedefi: çubuğun ekran-uzayı merkezi
    barRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0) setXpTarget(x + w / 2, y + h / 2);
    });
  }, []);
  useEffect(() => {
    // yağmur başlarken taze ölçüm alınabilsin
    setXpRemeasure(measureBar);
    return () => setXpRemeasure(null);
  }, [measureBar]);
  return (
    // Çerçeve TAM boyutta çizilir (avatar küçülmez) — süslü halka avatarın etrafına
    // taşar, tamamen görünür. Eski "hapı 14px sağa it" band-aid'i KALDIRILDI: o hile
    // flex:1 hapı zaten dolu satırda büyütüp sağdaki buton dizisini iterek ayar
    // butonunu ekran kenarında kesiyordu. Artık hap sabit → butonlar çerçeveli/
    // çerçevesiz birebir aynı yerde, hiçbiri kesilmez; çerçevenin sol yayı da yaslı
    // konumda ekran içinde kalır (kesilmez).
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ flex: 1, minWidth: 108 }}>
      {/* Radii are exact, not clamped: face is 41pt tall (34 avatar + 2x3.5 pad) so a
          shared radius 24 clamps differently on face (20.5) vs wrapper (21.75) and the
          lighter face corner pokes past the lip as a light arc. Nested-radius rule:
          wrapper top = face radius (0 top inset), wrapper bottom = face + 2.5 lip. */}
      <View style={{ backgroundColor: darken(theme.card, 0.5), borderTopLeftRadius: 20.5, borderTopRightRadius: 20.5, borderBottomLeftRadius: 23, borderBottomRightRadius: 23, paddingBottom: 2.5 }}>
        <Animated.View style={{
          transform: [{ translateY: ty }, { scale }],
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: theme.card, borderRadius: 20.5,
          paddingVertical: 3.5, paddingLeft: 3.5, paddingRight: 10,
        }}>
          <View>
            <AvatarBadge avatarId={avatarId} size={34} ringColor={color} frameId={frameId} />
            <View style={{
              position: 'absolute', right: -3, bottom: -2,
              minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 2.5,
              backgroundColor: color, borderWidth: 2, borderColor: darken(theme.card, 0.45),
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: theme.ink, fontSize: 10, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{tier}</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12, ...engrave('sm') }} numberOfLines={1}>{name}</Text>
            <View ref={barRef} collapsable={false} onLayout={measureBar} style={{ height: 8, borderRadius: 4, backgroundColor: theme.navyWell, justifyContent: 'center', overflow: 'hidden' }}>
              {fillAnim ? (
                <Animated.View style={{ width: fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), height: '100%', borderRadius: 4, backgroundColor: color }} />
              ) : (
                <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
              )}
            </View>
            {boosted ? (
              <View style={{ position: 'absolute', right: -3, bottom: -5, flexDirection: 'row', alignItems: 'center', gap: 1.5, backgroundColor: theme.gold, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1.5, borderWidth: 1.5, borderColor: darken(theme.card, 0.45) }}>
                <Ionicons name="flash" size={8} color={theme.ink} />
                <Text style={{ color: theme.ink, fontSize: 8.5, fontFamily: 'Poppins-Black' }}>2x</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
        {claimBadge ? (
          <View style={{ position: 'absolute', right: -5, top: -7 }}>
            <ClaimHerald count={claimBadge} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

// Currency pill — the mockup's coin capsule. This game has exactly one currency
// (diamonds), so the coin slot carries the gem and the capsule's green "+" goes
// straight to the diamond aisle of the store.
// memo: RailBadge ile aynı sözleşme — sayaç listener'la içeriden akar, hap
// yalnız count/onPress kimliği değişince yeniden çizilir (toLocaleString dahil).
const GemPill = memo(function GemPill({ count, onPress, countAnim, fillAnim, innerRef }: {
  count: number; onPress: () => void;
  countAnim?: Animated.Value; fillAnim?: Animated.Value; innerRef?: Ref<View>;
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2, GameFeedbackEvent.UI_PURCHASE);
  // When an external count animation is supplied (arena/purchase reward), the
  // displayed number ticks from that value; otherwise it just shows `count`.
  const [animCount, setAnimCount] = useState(count);
  useEffect(() => {
    if (!countAnim) return;
    const id = countAnim.addListener(({ value }) => setAnimCount(Math.max(0, Math.round(value))));
    return () => countAnim.removeListener(id);
  }, [countAnim]);
  const shown = countAnim ? animCount : count;
  return (
    <Pressable ref={innerRef} onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
      {/* Same radius-clamp fix as ProfilePill: face is 30pt tall (23 plus-button +
          2x3.5 pad) → face 15, wrapper top 15, wrapper bottom 15 + 2.5 lip = 17.5. */}
      <View style={{ backgroundColor: darken(theme.card, 0.5), borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 17.5, borderBottomRightRadius: 17.5, paddingBottom: 2.5 }}>
        <Animated.View style={{
          transform: [{ translateY: ty }, { scale }],
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: theme.card, borderRadius: 15,
          paddingVertical: 3.5, paddingLeft: 7, paddingRight: 3.5,
        }}>
          {/* Gem-kazanım dolgusu AYRI bir overflow:hidden sarmalayıcıda kırpılır
              (yuvarlak hapa otursun). Yüzden overflow:'hidden' KALDIRILDI — çünkü o,
              sağdaki "+" butonunun alt kısmını hapın yuvarlak köşesine kırpıyordu
              (kullanıcı bulgusu: "artı butonunun en altında ufak kesik"). */}
          {fillAnim ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, borderRadius: 15, overflow: 'hidden' }}>
              <Animated.View
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, right: 0,
                  backgroundColor: withAlpha(GEM_COLOR, 0.34),
                  transformOrigin: 'left', transform: [{ scaleX: fillAnim }],
                }}
              />
            </View>
          ) : null}
          <GemIcon size={17} />
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12, fontVariant: ['tabular-nums'], maxWidth: 62, ...engrave('sm') }} numberOfLines={1}>
            {shown.toLocaleString(currentLang() === 'tr' ? 'tr-TR' : 'en-US')}
          </Text>
          <View style={{
            width: 23, height: 23, borderRadius: 12,
            backgroundColor: theme.primary, borderBottomWidth: 2, borderBottomColor: theme.primaryDark,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="add" size={14} color={theme.ink} />
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
});

// ---- cards ----------------------------------------------------------------

// The mockup's bright art cards: an art field up top, a dark caption band across
// the bottom carrying the title. `art` is drawn into the field and may overhang it.
// memo: kartın SVG radial yüzü pahalı — `art`/`grade` sabit kimlikli verildiği
// sürece (modül sabiti ya da useMemo) kart, ekran render'larını komple atlar.
const ArtCard = memo(function ArtCard({ title, tint, art, height, onPress, grade, strip, arrow = false, pillBar }: {
  title: string; tint: string; art?: ReactNode; height: number; onPress: () => void;
  // Mockup faces are a DIAGONAL ramp (light at the top-left, deep at the
  // bottom-right), not a flat fill — measured off COF ANA EKRAN.jpeg. Opt-in per
  // card so the pitch card (Mahalle Sahası) keeps its photographic face.
  // Measured off the mockup as a BRIGHTNESS MAP, not guessed: each row is
  // brightest at its centre and every row dims going down (top-centre 345 →
  // bottom 137 in RGB sum). That is a radial glow anchored near the top edge,
  // not the linear ramp this used to draw — which is why the faces still read
  // "flat" after the first pass. `from` is the glow core, `to` the outer field.
  grade?: { from: string; to: string; mid?: string };
  // The label band is the card's own deep tone in the mockup, not near-black.
  strip?: string;
  // Mockup puts a round → button at the band's right end.
  arrow?: boolean;
  // Mockup's INSET pill footer (Sosyal Paket "AKTİF", Seviye Yolu): a rounded
  // bar floated inside the card with margins, label left + outlined round →
  // inside it. Replaces the full-width strip when set.
  pillBar?: { fill: string };
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2, GameFeedbackEvent.UI_CARD);
  const gradId = useRef(`artGrad${++_btnSeq}`).current;
  // The round → only fits once the card is wide enough. On a phone these tiles
  // are ~126pt and the arrow pushed the label into an ellipsis ("Sosyal…"), so
  // it appears from tablet-ish widths up — where the mockup's proportions hold.
  const [cardW, setCardW] = useState(0);
  const showArrow = arrow && cardW >= 150;
  // The 3pt seat under the face must be the DARKEST rung of the card's ladder.
  // It used to be darken(tint, 0.55) computed off the FLAT tint, which on strip/
  // graded cards came out LIGHTER than what actually touches it — the footer
  // strip (#5E3C12 under Mücadele's #3A2109) or the radial's deep outer field
  // (#463073 under Sosyal Paket's #251A63) — so a pale band + mismatched arcs
  // showed under the footer. Pixel-verified on the user's screenshot. Seat the
  // lip off the darkest visible bottom element instead; cards with neither (the
  // photographic Mahalle Sahası face) keep the old tone byte-identical.
  const lipFill = strip ? darken(strip, 0.3) : grade ? darken(grade.to, 0.3) : darken(tint, 0.55);
  const floatingPill = Boolean(pillBar);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ flex: 1 }}>
      <View style={{ backgroundColor: floatingPill ? 'transparent' : lipFill, borderRadius: 20, paddingBottom: floatingPill ? 0 : 3, shadowOpacity: 0, elevation: 0 }}>
        <Animated.View
          onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
          style={{
            transform: [{ translateY: ty }, { scale }], height, overflow: 'hidden',
            // Nested radii must follow the geometry or the outer lip's darker fill
            // bleeds around the corners as a thin arc — THAT is the "not seated"
            // edge, not the highlight. The wrapper is radius 20 and insets this
            // view by 3 at the BOTTOM only, so the top corners must match 20
            // exactly and only the bottom pair shrinks by the inset.
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            borderBottomLeftRadius: floatingPill ? 20 : 17, borderBottomRightRadius: floatingPill ? 20 : 17,
            backgroundColor: tint,
            // NO separate top border. A white-alpha rim over a coloured face reads as a
            // GREY hairline, and because a border is stroked independently of the fill
            // it never quite meets the rounded corners — which is what kept looking
            // "not seated" no matter how thin it got. The highlight is now part of the
            // surface itself (first stop of the gradient below), so there is no seam.
          }}>
          {grade ? (
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient id={gradId} cx="50%" cy="6%" r="118%">
                  <Stop offset="0" stopColor={grade.from} />
                  <Stop offset="0.52" stopColor={grade.mid ?? grade.from} />
                  <Stop offset="1" stopColor={grade.to} />
                </RadialGradient>
              </Defs>
              {/* NO top-highlight strip. Every attempt at one (white border, thin
                  border, in-fill hairline) reads on device as a foreign line across
                  the card top — measured #7C5FC6 over a #5B37B8 body on the user's
                  own screenshot. The radial face carries its own light; nothing else. */}
              <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
              {/* Faint swoosh arcs the mockup sweeps across the lower-left. */}
              <Path d="M -6 78 Q 34 58 92 66" stroke="rgba(255,255,255,0.10)" strokeWidth="1.6" fill="none" />
              <Path d="M -6 90 Q 40 68 104 78" stroke="rgba(255,255,255,0.07)" strokeWidth="1.4" fill="none" />
            </Svg>
          ) : null}
          <View style={StyleSheet.absoluteFill}>{art}</View>
          {pillBar ? (
            <View style={{
              position: 'absolute', left: 8, right: 8, bottom: 8, height: 34,
              borderRadius: 17, backgroundColor: pillBar.fill,
              paddingLeft: 10, paddingRight: 5,
              flexDirection: 'row', alignItems: 'center', gap: 4,
            }}>
              <Text style={{ flex: 1, color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{title}</Text>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.34)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="arrow-forward" size={11} color="rgba(255,255,255,0.9)" />
              </View>
            </View>
          ) : (
          <View style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            backgroundColor: strip ?? withAlpha(darken(tint, 0.66), 0.94),
            paddingHorizontal: 11, paddingVertical: 7,
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }}>
            <Text style={{ flex: 1, color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} numberOfLines={1}>{title}</Text>
            {showArrow ? (
              <View style={{
                width: 24, height: 24, borderRadius: 12,
                borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.34)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="arrow-forward" size={13} color="rgba(255,255,255,0.9)" />
              </View>
            ) : null}
          </View>
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
});

// The faded tilted card-stack watermark bleeding off the mockup's navy panels.
function GhostStack({ icon }: { icon: IoniconName }) {
  const plate = (extra: object) => (
    <View style={[{
      position: 'absolute', width: 58, height: 68, borderRadius: 10,
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.05)',
    }, extra]} />
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: -12, top: -8, width: 92, height: 88 }}>
      {plate({ right: 24, top: 12, transform: [{ rotate: '-12deg' }] })}
      {plate({ right: 13, top: 6, transform: [{ rotate: '-6deg' }] })}
      <View style={{
        position: 'absolute', right: 2, top: 2, width: 58, height: 68, borderRadius: 10,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={icon} size={28} color="rgba(255,255,255,0.30)" />
      </View>
    </View>
  );
}

// The mockup's navy panels: title row up top, ghost stack in the corner, free
// content below. Pressable only when `onPress` is given (the Özel Mod panel owns
// its own inner controls instead).
// memo: children inline verildiğinde bail edemez (eleman kimliği taze) ama
// diğer HUD primitifleriyle aynı sözleşmeyi taşısın diye yine sarılır.
const GhostPanel = memo(function GhostPanel({ title, icon, ghost, height, onPress, children, locked = false, tone }: {
  title: string; icon?: IoniconName; ghost: IoniconName; height: number;
  onPress?: () => void; children?: ReactNode; locked?: boolean;
  // `tone`: give the panel its own colour face (a tone ladder over it) instead
  // of the default flat surface2 — the mockup tints Bot Maçı green.
  tone?: string;
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2, onPress ? GameFeedbackEvent.UI_CARD : null);
  const gradId = useRef(`ghostGrad${++_btnSeq}`).current;
  const body = (
    // The wrapper must carry the SAME face as the panel, otherwise a toned panel
    // shows the old surface2 through the corner arc.
    <View style={{ backgroundColor: tone ?? theme.surface2, borderRadius: 20, shadowOpacity: 0, elevation: 0 }}>
      <Animated.View style={{
        // Flush with the wrapper on every side → identical radius, no bleed.
        transform: onPress ? [{ translateY: ty }, { scale }] : [], height, borderRadius: 20, overflow: 'hidden',
        backgroundColor: tone ?? theme.surface2, padding: 11,
        // Same reasoning as ArtCard: no white-alpha rim. The highlight is drawn as
        // part of the face (below), tinted from the surface so it never reads grey.
      }}>
        {tone ? (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lighten(tone, 0.16)} />
                <Stop offset="0.55" stopColor={tone} />
                <Stop offset="1" stopColor={darken(tone, 0.34)} />
              </SvgGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
          </Svg>
        ) : null}
        <GhostStack icon={ghost} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {icon ? <Ionicons name={icon} size={17} color={theme.muted} /> : null}
          <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} numberOfLines={1}>{title}</Text>
          {locked ? <Ionicons name="lock-closed" size={13} color={theme.accent} /> : null}
        </View>
        {children}
      </Animated.View>
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }}>{body}</View>;
  return <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ flex: 1 }}>{body}</Pressable>;
});

// ---- the screen -----------------------------------------------------------

// Modes listed in the "Mücadele Modu" (Challenge Mode) picker. Only the two
// Social-Pack-gated modes appear here (server: isSocialPackMode, ws/server.ts).
// team-team is deliberately NOT listed — it stays the free default of "Hemen
// Oyna" / bot / friend-invite, just not a selectable "challenge" mode. player-player
// is implemented server-side (rooms/room.ts) but has no UI entry point.
const CAROUSEL_GAP = 8;
// Below this width the one-row top bar cannot seat all three round buttons without
// starving the profile pill, so the pack shortcut (duplicated in the Store tab) steps out.
const TOPBAR_ROOMY_W = 360;
const HOME_SCREEN_PAD = 16;
const HOME_TAB_BAR_BASE_H = 66;
const HOME_HEADER_ROW_H = 46;
const HOME_DESIGN_BODY_MIN_H = 407;
const HOME_DESIGN_BODY_RANGE_H = 204;
// Room codes are always exactly this long — server/src/rooms/manager.ts:5 (CODE_LEN).
const ROOM_CODE_LEN = 6;
const HOME_MODES: GameMode[] = ['cozkazan', 'xox', 'country-team', 'letter-team'];
const PACK_MODES: GameMode[] = ['country-team', 'letter-team', 'xox', 'cozkazan'];

// "Mücadele Modu" kartının yüzü hiçbir props/state okumaz (tema + modül-scope
// RivalryArt + sabit renkler) — her HomeScreen render'ında (tuş vuruşu, popup
// açılışı, ws dispatch) SVG radial + 3 görselli ağacı yeniden kurmamak için
// modül sabiti. Sabit eleman/nesne kimliği ayrıca memo(ArtCard)'ın bu kartı
// komple atlamasını sağlar ("amberGlow" id'si zaten sabit ve tekil).
const MODES_CARD_GRADE = { from: '#D9973B', mid: '#B7762A', to: '#6B3A0D' };
const MODES_CARD_ART = (
  <View style={StyleSheet.absoluteFill}>
    {/* a faint sun glow so the amber face isn't flat, then the ball-duel
        scene — two brand balls clashing under the gold VS coin */}
    {/* The glow used to live in a 120pt-tall box whose bottom edge cut the
        radial gradient mid-fade, leaving a hard horizontal seam across
        the card above the balls ("top tam oturmamış gibi"). Filling the
        whole card and letting the gradient reach zero well inside it
        removes the edge entirely. */}
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="amberGlow" cx="50%" cy="22%" r="78%">
            <Stop offset="0" stopColor={lighten(theme.amber, 0.4)} stopOpacity={0.9} />
            <Stop offset="0.62" stopColor={lighten(theme.amber, 0.12)} stopOpacity={0.28} />
            <Stop offset="1" stopColor={theme.amber} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#amberGlow)" />
      </Svg>
    </View>
    <RivalryArt />
  </View>
);
// Carousel kartlarının degrade/pill sabitleri — inline nesne literal'i her
// render'da yeni kimlik üretip memo(ArtCard)'ı sessizce boşa çıkarır.
const SOCIAL_CARD_GRADE = { from: '#6236C1', mid: '#4A2A9E', to: '#251A63' };
const SOCIAL_CARD_PILL = { fill: '#1E1856' };
const ROAD_CARD_GRADE = { from: '#1466BE', mid: '#064B92', to: '#01234A' };
const ROAD_CARD_PILL = { fill: '#051E3C' };

// ---- Günün Crossover'ı — Wordle döngüsü: herkese aynı günlük soru -----------
// Sunucu-otoriter: hak sayısı, süre ve ödül sunucuda; burada yalnız arayüz.
function dailyCxShareText(cx: DailyCrossoverStateView): string {
  const r = cx.result;
  const squares = r?.correct ? '🟥'.repeat(Math.max(0, r.guesses - 1)) + '🟩' : '🟥🟥🟥';
  const line = r?.correct
    ? `${squares} ${(r.durationMs / 1000).toFixed(1)} sn'de bildim! ⚽`
    : `${squares} bilemedim 😅`;
  const isScramble = cx.kind === 'scramble';
  const title = isScramble ? `Günün Bulmacası #${cx.day}` : `Günün Crossover'ı #${cx.day}`;
  const subtitle = isScramble
    ? '🔀 Karışık harfler'
    : `${cx.teamA?.name ?? ''} × ${cx.teamB?.name ?? ''}`;
  return `${title}\n${subtitle}\n${line}\nSıra sende 👉 https://crossoverfootball.com/indir`;
}

function dailyCareerShareText(c: DailyCareerStateView): string {
  // Wordle kartı: kaç ipucuyla bildiğini gösterir — az kare = iyi skor.
  const used = Math.max(1, c.revealed);
  const squares = c.correct ? '🟨'.repeat(Math.max(0, used - 1)) + '🟩' : '🟥'.repeat(c.maxGuesses);
  return `Günün Kariyeri #${c.day}\n${squares}\n${c.correct ? `${used} kulüpte bildim! ⚽` : 'bilemedim 😅'}\nSıra sende 👉 https://crossoverfootball.com/indir`;
}

function DailyQuestsModal({ visible, quests, claimedXp, onClaim, onClose }: {
  visible: boolean;
  quests: DailyQuestsView | null;
  claimedXp: number;
  onClaim: (questId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (claimedXp > 0) triggerFeedback(GameFeedbackEvent.UI_PURCHASE);
  }, [claimedXp]);
  const list = quests?.quests ?? [];
  const doneCount = list.filter((q) => q.claimed).length;
  return (
    <GameModal visible={visible} onClose={onClose} title={t('quest.title')} icon="checkbox">
      {!quests ? (
        <Text style={[styles.muted, { textAlign: 'center' }]}>{t('store.loading')}</Text>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 16 }}>
            {t('quest.subtitle', { n: String(doneCount), total: String(list.length) })}
          </Text>
          {list.map((q) => {
            const pct = q.target > 0 ? Math.min(1, q.progress / q.target) : 0;
            return (
              <GamePanel key={q.id} compact accentStripe={q.claimed ? theme.muted : q.done ? theme.primary : theme.gold} bodyStyle={{ padding: 11, gap: 7 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons
                    name={q.claimed ? 'checkmark-circle' : q.done ? 'gift' : 'ellipse-outline'}
                    size={18}
                    color={q.claimed ? theme.muted : q.done ? theme.primary : theme.gold}
                  />
                  <Text style={{ flex: 1, color: q.claimed ? theme.muted : theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold' }}>
                    {t(q.titleKey as MessageKey, { n: String(q.target) })}
                  </Text>
                  <Text style={{ color: theme.gold, fontSize: 11.5, fontFamily: 'Poppins-Black' }}>+{q.xp} XP</Text>
                </View>
                {/* İlerleme çubuğu — sayıyı da yazar ki "ne kadar kaldı" net olsun */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: theme.well, overflow: 'hidden' }}>
                    <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: q.claimed ? theme.muted : q.done ? theme.primary : theme.gold }} />
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{q.progress}/{q.target}</Text>
                </View>
                {q.done && !q.claimed ? (
                  <Btn compact kind="accent" icon="gift" label={t('quest.claim')} feedback={GameFeedbackEvent.UI_PURCHASE} onPress={() => onClaim(q.id)} />
                ) : null}
              </GamePanel>
            );
          })}
          <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 14 }}>
            {t('quest.footer')}
          </Text>
        </View>
      )}
    </GameModal>
  );
}

function DailyCareerModal({ visible, career, reward, onGuess, onClose }: {
  visible: boolean;
  career: DailyCareerStateView | null;
  reward: number;
  onGuess: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { setSending(false); }, [career?.attemptsUsed, career?.played]);
  const done = !!career?.played;
  useEffect(() => {
    if (!visible || !done) return;
    triggerFeedback(career?.correct ? GameFeedbackEvent.ANSWER_CORRECT : GameFeedbackEvent.ANSWER_WRONG);
  }, [visible, done, career?.correct]);
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending || done) return;
    setSending(true);
    setText('');
    track('daily_career_guess', { day: career?.day, attempt: (career?.attemptsUsed ?? 0) + 1 });
    onGuess(trimmed);
  };
  const share = async () => {
    if (!career) return;
    track('daily_career_shared', { day: career.day, correct: career.correct });
    try { await Share.share({ message: dailyCareerShareText(career) }); } catch { /* vazgeçti */ }
  };
  const attemptsLeft = career ? Math.max(0, career.maxGuesses - career.attemptsUsed) : 0;
  return (
    <GameModal visible={visible} onClose={onClose} title={`GÜNÜN KARİYERİ ${career ? `#${career.day}` : ''}`} icon="footsteps">
      {!career ? (
        <Text style={[styles.muted, { textAlign: 'center' }]}>{t('store.loading')}</Text>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 17 }}>
            {done ? (career.correct ? t('career.doneWin', { n: String(reward || career.reward) }) : t('career.doneLose'))
              : t('career.hint', { n: String(attemptsLeft) })}
          </Text>

          {/* Kariyer basamakları — açılmayanlar kilitli kutu */}
          <View style={{ gap: 6 }}>
            {career.steps.map((st) => (
              <View
                key={st.order}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: st.revealed ? theme.surface2 : theme.well,
                  borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
                  borderWidth: 1.5, borderColor: st.revealed ? withAlpha(theme.gold, 0.5) : theme.border,
                }}
              >
                <Text style={{ width: 18, color: theme.muted, fontSize: 11, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{st.order}</Text>
                {st.revealed ? (
                  <>
                    <ClubBadge name={st.clubName} size={26} logoUrl={st.clubLogo ?? undefined} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12.5, fontFamily: 'Poppins-ExtraBold' }}>{st.clubName}</Text>
                      <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{st.years}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color={theme.muted} />
                    <Text style={{ flex: 1, color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>{t('career.locked')}</Text>
                  </>
                )}
              </View>
            ))}
          </View>

          {/* Cevap alanı ya da sonuç */}
          {!done ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={submit}
                placeholder={t('career.placeholder')}
                placeholderTextColor={theme.muted}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="send"
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
              />
              <Btn compact kind="accent" icon="send" label="" loading={sending} onPress={submit} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: 8 }}>
              {career.answer?.imageUrl ? (
                <CachedImage uri={career.answer.imageUrl} style={styles.playerPhoto} contentFit="cover" />
              ) : null}
              <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-Black', textAlign: 'center' }}>{career.answer?.name ?? ''}</Text>
              <Btn big kind="accent" icon="share-social" label={t('career.share')} onPress={share} />
            </View>
          )}
        </View>
      )}
    </GameModal>
  );
}

function DailyCrossoverModal({ visible, cx, wrong, reward, onGuess, onClose }: {
  visible: boolean;
  cx: DailyCrossoverStateView | null;
  wrong: { guess: string; suggestion: string | null; attemptsLeft: number; seq: number } | null;
  reward: number;
  onGuess: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Sunucu cevabı (yanlış ya da bitiş) gelince gönderim kilidi açılır.
  useEffect(() => { setSending(false); }, [wrong?.seq, cx?.played, cx?.attemptsUsed]);
  const done = !!cx?.played;
  const res = cx?.result ?? null;
  useEffect(() => {
    if (!visible || !done) return;
    triggerFeedback(res?.correct ? GameFeedbackEvent.ANSWER_CORRECT : GameFeedbackEvent.ANSWER_WRONG);
  }, [visible, done, res?.correct]);
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending || done) return;
    setSending(true);
    setText('');
    track('daily_cx_guess', { day: cx?.day, attempt: (cx?.attemptsUsed ?? 0) + 1 });
    onGuess(trimmed);
  };
  const share = async () => {
    if (!cx) return;
    track('daily_cx_shared', { day: cx.day, correct: res?.correct ?? null });
    try { await Share.share({ message: dailyCxShareText(cx) }); } catch { /* kullanıcı vazgeçti */ }
  };
  const attemptsLeft = cx ? Math.max(0, cx.maxGuesses - cx.attemptsUsed) : 0;
  const isScramble = cx?.kind === 'scramble';
  const scrambleWords = cx?.scramble?.letters ?? [];
  const scrTile = scrambleTileSize(scrambleWords, 320, 44);
  return (
    <GameModal visible={visible} onClose={onClose} title={`${isScramble ? "GÜNÜN BULMACASI" : "GÜNÜN CROSSOVER'I"} ${cx ? `#${cx.day}` : ''}`} icon="calendar">
      {!cx ? (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}><GameSpinner /></View>
      ) : (
        <View style={{ gap: 12 }}>
          {isScramble ? (
            /* Karışık harfler — Çöz Kazan dili (premium kutucuklar, saydam değil) */
            <View style={{ alignItems: 'center', paddingVertical: 6 }}>
              <ScrambleTiles words={scrambleWords} tileSize={scrTile} />
            </View>
          ) : (
            /* İki kulüp — maçtaki reveal dili */
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <View style={{ alignItems: 'center', gap: 6, flex: 1 }}>
                <ClubBadge name={cx.teamA?.name ?? '?'} size={58} logoUrl={cx.teamA?.logoUrl ?? null} />
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5, textAlign: 'center' }} numberOfLines={2}>{cx.teamA?.name ?? ''}</Text>
              </View>
              <Text style={{ color: theme.muted, fontFamily: 'Poppins-Black', fontSize: 18 }}>×</Text>
              <View style={{ alignItems: 'center', gap: 6, flex: 1 }}>
                <ClubBadge name={cx.teamB?.name ?? '?'} size={58} logoUrl={cx.teamB?.logoUrl ?? null} />
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5, textAlign: 'center' }} numberOfLines={2}>{cx.teamB?.name ?? ''}</Text>
              </View>
            </View>
          )}

          {done ? (
            <View style={{ alignItems: 'center', gap: 8 }}>
              {res?.correct ? (
                <>
                  <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 15 }}>Bildin! {res.playerName ?? ''} ✓</Text>
                  <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 12.5 }}>
                    {(res.durationMs / 1000).toFixed(1)} sn · {res.guesses}. denemede{reward > 0 ? ` · +${reward} 💎` : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ color: theme.danger, fontFamily: 'Poppins-ExtraBold', fontSize: 14.5 }}>Bugünkü kaçtı — yarın yenisi!</Text>
                  {res?.commonPlayers?.length ? (
                    <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 12.5, textAlign: 'center' }}>
                      {isScramble ? 'Cevap' : 'Cevaplar'}: {res.commonPlayers.slice(0, isScramble ? 1 : 3).map((p) => p.name).join(', ')}
                    </Text>
                  ) : null}
                </>
              )}
              {cx.streak > 0 ? (
                <Text style={{ color: theme.gold, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5 }}>🔥 {cx.streak} günlük seri</Text>
              ) : null}
              <Btn big kind="primary" icon="share-social" label="PAYLAŞ" feedback={GameFeedbackEvent.UI_CONFIRM} onPress={() => { void share(); }} />
              <Btn kind="ghost" label="KAPAT" onPress={onClose} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 12.5, textAlign: 'center' }}>
                {isScramble
                  ? `Karışık harfleri çöz — futbolcuyu bul, ${cx.reward} 💎`
                  : `İkisinde de oynamış futbolcuyu yaz — doğru bilene ${cx.reward} 💎`}
              </Text>
              {/* Hak noktaları */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                {Array.from({ length: cx.maxGuesses }, (_, i) => (
                  <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i < cx.attemptsUsed ? theme.danger : withAlpha(theme.primary, 0.85) }} />
                ))}
              </View>
              {wrong ? (
                <Text style={{ color: theme.danger, fontFamily: 'Poppins-SemiBold', fontSize: 12, textAlign: 'center' }}>
                  "{wrong.guess}" olmadı{wrong.suggestion ? ` — ${wrong.suggestion} mi demek istedin?` : ''} · {wrong.attemptsLeft} hak kaldı
                </Text>
              ) : null}
              <GameInput
                icon="football"
                placeholder="Futbolcu adı yaz…"
                value={text}
                onChangeText={setText}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="send"
                onSubmitEditing={submit}
              />
              <Btn big kind="primary" icon="paper-plane" label="GÖNDER" loading={sending} disabled={!text.trim() || attemptsLeft <= 0} feedback={GameFeedbackEvent.ANSWER_SUBMIT} onPress={submit} />
            </View>
          )}
        </View>
      )}
    </GameModal>
  );
}

export function HomeScreen({ actions, state, onLanguageChange, onGoToStore, onOpenLeaderboard, onOpenMatchHistory, onGoToFriends, onOpenLevelRoad, onLockedSocialMode, overlayBusy, gemCountAnimOverride, gemFillAnimOverride, trophyLand, trophyHold, monetizationDiagnostics, heroAnimsActive = true }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [scope, setScope] = useState<Scope>({ type: 'all' });
  const [mode, setMode] = useState<GameMode>('team-team');
  const [botPage, setBotPage] = useState<{ key: BotPage; dir: 1 | -1 }>({ key: 'bot', dir: 1 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSub, setMenuSub] = useState<'settings' | null>(null);
  const [botOpen, setBotOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);

  const [lockedModePreview, setLockedModePreview] = useState<GameMode | null>(null);
  // iOS presents ONE native <SafeModal> at a time; open the upsell only AFTER the
  // modes modal's native dismissal finishes (via GameModal onExited), else the two
  // overlap and the app FREEZES (dead touches + scroll). Same race the avatar
  // picker guards against (see insufficientOnExit).
  const socialUpsellOnExit = useRef(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsUnread, setNewsUnread] = useState(false);
  // Günün Crossover'ı — kart carousel'de; oynanmadıysa nokta yanar.
  const [dailyCxOpen, setDailyCxOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const win = useWindow();
  // Show the bell's red pip until the user has opened the feed at the latest item.
  useEffect(() => {
    AsyncStorage.getItem(NEWS_READ_KEY).then((v) => setNewsUnread(NEWS.length > 0 && v !== LATEST_NEWS_ID)).catch(() => {});
  }, []);
  // Günün Crossover'ı durumu: girişte + gün dönümünde tazelenir (resetAt geçince
  // kart eski günü göstermesin diye pencere odaklanınca yeniden çekilir).
  useEffect(() => {
    if (!state.profile?.userId) return;
    const stale = !state.dailyCx || new Date(state.dailyCx.resetAt).getTime() <= Date.now();
    if (stale) actions.getDailyCrossover();
  }, [actions, state.profile?.userId, state.dailyCx]);
  const openDailyCx = useCallback(() => {
    triggerFeedback(GameFeedbackEvent.UI_CARD);
    // start idempotent: süre sayacı sunucuda İLK açılışta başlar; oynanmışsa no-op.
    actions.startDailyCrossover();
    track('daily_cx_open', { day: state.dailyCx?.day, played: state.dailyCx?.played ?? false });
    setDailyCxOpen(true);
  }, [actions, state.dailyCx?.day, state.dailyCx?.played]);
  const closeDailyCx = useCallback(() => {
    setDailyCxOpen(false);
    actions.clearDailyCxReward();
  }, [actions]);
  // Günün Kariyeri (2026-08-29) — Crossover'la aynı tazeleme kuralı.
  const [dailyCareerOpen, setDailyCareerOpen] = useState(false);
  useEffect(() => {
    if (!state.profile?.userId) return;
    const stale = !state.dailyCareer || new Date(state.dailyCareer.resetAt).getTime() <= Date.now();
    if (stale) actions.getDailyCareer();
  }, [actions, state.profile?.userId, state.dailyCareer]);
  const openDailyCareer = useCallback(() => {
    triggerFeedback(GameFeedbackEvent.UI_CARD);
    track('daily_career_open', { day: state.dailyCareer?.day, played: state.dailyCareer?.played ?? false });
    setDailyCareerOpen(true);
  }, [state.dailyCareer?.day, state.dailyCareer?.played]);
  const closeDailyCareer = useCallback(() => {
    setDailyCareerOpen(false);
    actions.clearDailyCareerReward();
  }, [actions]);
  // Günlük Görevler (2026-08-29): girişte ve gün dönümünde tazelenir.
  const [questsOpen, setQuestsOpen] = useState(false);
  useEffect(() => {
    if (!state.profile?.userId) return;
    const stale = !state.dailyQuests || new Date(state.dailyQuests.resetAt).getTime() <= Date.now();
    if (stale) actions.getDailyQuests();
  }, [actions, state.profile?.userId, state.dailyQuests]);
  const openQuests = useCallback(() => {
    triggerFeedback(GameFeedbackEvent.UI_CARD);
    actions.getDailyQuests(); // maçlardan gelen ilerlemeyi tazele
    track('quests_open');
    setQuestsOpen(true);
  }, [actions]);
  const closeQuests = useCallback(() => {
    setQuestsOpen(false);
    actions.clearQuestClaimed();
  }, [actions]);
  // Toplanmayı bekleyen ödül var mı — ana ekran kartındaki uyarı noktası.
  const questsReady = (state.dailyQuests?.quests ?? []).some((q) => q.done && !q.claimed);
  const [joinCode, setJoinCode] = useState('');
  const roomCodeInputFocus = useInputFocusLifecycle();
  const [hero, setHero] = useState({ w: 0, h: 0 });
  const [railW, setRailW] = useState(0);

  const opts: GameOptions = { scope, mode };
  const profile = state.profile;
  const hasPack = !!(profile?.socialPackUntil && new Date(profile.socialPackUntil) > new Date());
  const playerName = profile?.displayName ?? t('home.namePlaceholder');
  const trophies = profile?.trophies ?? 0;
  const frameTopPad = profile?.selectedFrame
    ? Math.ceil(34 * ((FRAME_SCALE[profile.selectedFrame] ?? 3.15) * 0.9 - 1) / 2) + 10
    : 0;
  const claimTopPad = unclaimedLevelCount(profile) > 0 ? 18 : 0;
  const homeTopPad = Math.max(8, frameTopPad, claimTopPad);
  const tabReserveH = HOME_TAB_BAR_BASE_H + Math.max(insets.bottom, 12);
  const homeViewportH = Math.max(0, win.height - insets.top - tabReserveH);
  const bodyBudgetH = Math.max(0, homeViewportH - HOME_SCREEN_PAD * 2 - homeTopPad - HOME_HEADER_ROW_H);
  const homeScale = Math.max(0.18, Math.min(1, (bodyBudgetH - HOME_DESIGN_BODY_MIN_H) / HOME_DESIGN_BODY_RANGE_H));
  const myLeaderboardEntry = state.leaderboard.find((e) => e.userId === profile?.userId);
  const myRank = myLeaderboardEntry?.rank;
  const leaderboardRankFetchKeyRef = useRef<string | null>(null);
  const heroBoxH = Math.round(88 + 46 * homeScale);
  const playH = Math.round(48 + 16 * homeScale);
  const primaryCardH = Math.round(112 + 28 * homeScale);
  const secondaryCardH = Math.round(72 + 22 * homeScale);
  const carouselCardH = Math.round(82 + 38 * homeScale);
  const gapSm = Math.round(2 + 4 * homeScale);
  const gapMd = Math.round(5 + 5 * homeScale);

  // HUD counters: the gem pill and trophy badge are driven by these anim values
  // (RailBadge/GemPill read them via listener), kept in lock-step with the profile.
  // Real reward animations (match win / arena reward) run at the App level.
  const gemCountAnimLocal = useRef(new Animated.Value(profile?.diamonds ?? 0)).current;
  const gemFillAnimLocal = useRef(new Animated.Value(0)).current;
  // App tutmalı sayacını verdiyse tek kaynak odur (ödül uçuşu/tutma/dönüş orada)
  const gemCountAnim = gemCountAnimOverride ?? gemCountAnimLocal;
  const gemFillAnim = gemFillAnimOverride ?? gemFillAnimLocal;
  const gemPillRef = useRef<View>(null);
  useEffect(() => {
    if (gemCountAnimOverride) return; // App zaten profile senkron tutuyor
    gemCountAnimLocal.setValue(profile?.diamonds ?? 0);
  }, [profile?.diamonds, gemCountAnimLocal, gemCountAnimOverride]);
  const trophyCountAnim = useRef(new Animated.Value(profile?.trophies ?? 0)).current;
  const trophyFillAnim = useRef(new Animated.Value(0)).current;
  const trophyBadgeRef = useRef<View>(null);
  useEffect(() => {
    // Uçuş beklerken/sürerken rozet ESKİ değeri tutar; kupalar konunca
    // land-effect sayacı döndürür (elmas hapindaki tutma kuralının aynısı).
    if (trophyHold != null && trophyHold !== 0) {
      trophyCountAnim.stopAnimation();
      trophyCountAnim.setValue(Math.max(0, (profile?.trophies ?? 0) - trophyHold));
      return;
    }
    trophyCountAnim.setValue(profile?.trophies ?? 0);
  }, [profile?.trophies, trophyCountAnim, trophyHold]);

  // Kupa rozeti = uçuşun hedefi (elmas hapının setGemTarget kalıbı).
  const measureTrophyBadge = useCallback(() => {
    (trophyBadgeRef.current as View | null)?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) setTrophyTarget(x + w / 2, y + h * 0.42);
    });
  }, []);
  useEffect(() => {
    setTrophyRemeasure(measureTrophyBadge);
    const id = requestAnimationFrame(measureTrophyBadge);
    return () => { cancelAnimationFrame(id); setTrophyRemeasure(null); };
  }, [measureTrophyBadge]);

  // Kupalar rozete kondu → sayaç from→to + altın dolum süpürmesi.
  const lastTrophyLandSeq = useRef(0);
  useEffect(() => {
    if (!trophyLand || trophyLand.seq === lastTrophyLandSeq.current) return;
    lastTrophyLandSeq.current = trophyLand.seq;
    const to = profile?.trophies ?? 0;
    const from = Math.max(0, to - trophyLand.delta);
    trophyCountAnim.stopAnimation();
    trophyCountAnim.setValue(from);
    Animated.timing(trophyCountAnim, { toValue: to, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    trophyFillAnim.stopAnimation();
    trophyFillAnim.setValue(0);
    Animated.sequence([
      Animated.timing(trophyFillAnim, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(trophyFillAnim, { toValue: 0, duration: 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trophyLand?.seq]);

  // Arena tier drives the mockup's "level" slots. ARENA_DATA runs highest→lowest,
  // so the human-facing tier number counts up from the bottom (Mahalle = 1).
  // ARENA_DATA runs highest→lowest and GOAT is capped at max: 99999, but the server ladder
  // (server/src/game/rank.ts getArena) has no upper bound — so a miss ABOVE the table must
  // clamp to the top tier; only a miss below it falls to the bottom.
  const tIdx = ARENA_DATA.findIndex((a) => trophies >= a.min && trophies <= a.max);
  const curIdx = tIdx !== -1 ? tIdx : trophies >= (ARENA_DATA[0]?.min ?? 0) ? 0 : ARENA_DATA.length - 1;
  const curTier = ARENA_DATA[curIdx]!;
  const nextTier = curIdx > 0 ? ARENA_DATA[curIdx - 1] : null;
  const tierNo = ARENA_DATA.length - curIdx;
  const arenaPct = nextTier ? Math.min(1, Math.max(0, (trophies - curTier.min) / (nextTier.min - curTier.min))) : 1;
  const arenaC = arenaColor(profile?.arena.name ?? '');
  // Profil hapı: köşe rozeti = SEVİYE, ince çubuk = XP ilerlemesi (kademe renkli)
  const lvl = profile?.level ?? 1;
  const lvlColor = levelTier(lvl)?.c ?? theme.primary;
  const xpPct = lvl >= LEVEL_CAP ? 1 : Math.max(0, Math.min(1, (profile?.xp ?? 0) / xpForNextLevel(lvl)));
  // ---- XP küre yağmuru: maç sonrası kazanılan XP çubuğa akar, çubuk eş zamanlı dolar ----
  const xpBarAnim = useRef(new Animated.Value(xpPct)).current;
  const xpFlownRef = useRef<GameState['xpGain']>(null);
  const [xpFly, setXpFly] = useState<number | null>(null);
  const xpFlyPlanRef = useRef<{ fromPct: number; toPct: number; landed: number; count: number } | null>(null);
  const onXpOrbLand = useCallback(() => {
    const plan = xpFlyPlanRef.current;
    if (!plan) return;
    plan.landed = Math.min(plan.count, plan.landed + 1);
    const target = plan.fromPct + (plan.toPct - plan.fromPct) * (plan.landed / plan.count);
    Animated.timing(xpBarAnim, { toValue: target, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [xpBarAnim]);
  useEffect(() => {
    // animasyon akmıyorken çubuk gerçek değeri izler
    if (xpFly == null) xpBarAnim.setValue(xpPct);
  }, [xpPct, xpFly, xpBarAnim]);
  useEffect(() => {
    const g = state.xpGain;
    if (!g || g.gained <= 0 || overlayBusy) return;      // popup zinciri bitmeden akmaz
    if (xpFlownRef.current === g) return;                // aynı kazanım bir kez akar
    if (!xpTarget.measured) return;
    xpFlownRef.current = g;
    const need = xpForNextLevel(g.level);
    const fromPct = g.leveledUp.length > 0 ? 0 : Math.max(0, (g.xp - g.gained) / need);
    const toPct = g.level >= LEVEL_CAP ? 1 : Math.max(0, Math.min(1, g.xp / need));
    xpBarAnim.setValue(fromPct);
    // Çubuk yalnız GERÇEK küre inişleriyle dolar (onOrbLand): her iniş bir
    // adım — küre değmeden kıpırdamaz, küreler bittiğinde tam hedefte biter.
    xpFlyPlanRef.current = { fromPct, toPct, landed: 0, count: xpOrbTiming(g.gained).count };
    // ilk onLayout ölçümü bayatlamış olabilir — taze ölçüm alınıp bir kare sonra uçuş
    // başlar (cleanup YOK: dep titremesi yağmuru iptal etmesin, guard zaten tekil)
    remeasureXpTarget();
    setTimeout(() => setXpFly(g.gained), 50);
  }, [state.xpGain, overlayBusy, xpBarAnim]);

  // The bell's red pip. Both counts are pushed live mid-session, but they are only
  // FETCHED by the Friends screen — without this a cold home would never show a pip.
  const pending = state.friendRequests.length + (state.totalUnread ?? 0);

  // BOTH fetches are needed: loadFriends() brings the requests, loadConversations() brings
  // the unread counts. Without the second, the message half of the pip stays dark until the
  // user visits Friends — which is exactly the trip the pip exists to prompt.
  useEffect(() => {
    actions.loadFriends();
    actions.loadConversations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const uid = profile?.userId;
    if (!uid) { leaderboardRankFetchKeyRef.current = null; return; }
    const trophiesKey = profile?.trophies ?? 0;
    const fetchKey = `${uid}:${trophiesKey}`;
    if (myLeaderboardEntry?.trophies === trophiesKey) {
      leaderboardRankFetchKeyRef.current = fetchKey;
      return;
    }
    if (leaderboardRankFetchKeyRef.current === fetchKey) return;
    leaderboardRankFetchKeyRef.current = fetchKey;
    actions.openLeaderboard();
  }, [profile?.userId, profile?.trophies, myLeaderboardEntry?.trophies]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMode = useCallback((m: GameMode) => {
    dismissActiveInput();
    if (PACK_MODES.includes(m) && !hasPack) {
      setLockedModePreview(m);
      socialUpsellOnExit.current = true; // hand off AFTER modes modal dismisses (onExited)
      setModesOpen(false);
      track('premium_mode_locked_clicked', { mode: m, social_token_count: profile?.powerSocialToken ?? 0 });
      track('premium_mode_preview_viewed', { mode: m, social_token_count: profile?.powerSocialToken ?? 0 });
      return;
    }
    setModesOpen(false);
    actions.findMatch({ mode: m });
  }, [actions, hasPack, onLockedSocialMode]);

  // ---- Sabit kimlikli onPress'ler: memo'lu HUD primitifleri (ProfilePill /
  // GemPill / RailBadge / RoundIconBtn / ArtCard / HeroPlayBtn) ancak props
  // kimliği sabitse bail edebilir. App'ten gelen yönlendirme callback'leri ve
  // `actions` her App render'ında tazelenebildiğinden en-son-değer ref kalıbı:
  // sarmalayıcının kimliği sabit, basış anında DAİMA güncel fonksiyon çağrılır
  // (bayat closure sınıfı hatası bilerek imkânsız kılınır). ----
  const navRef = useRef({ actions, onGoToStore, onOpenMatchHistory, onOpenLeaderboard, onOpenLevelRoad });
  navRef.current = { actions, onGoToStore, onOpenMatchHistory, onOpenLeaderboard, onOpenLevelRoad };
  const openProfile = useCallback(() => { dismissActiveInput(); navRef.current.actions.openProfile(); }, []);
  const openArenas = useCallback(() => { dismissActiveInput(); navRef.current.actions.openArenas(); }, []);
  const startQuickMatch = useCallback(() => { dismissActiveInput(); navRef.current.actions.findMatch({ mode: 'team-team' }); }, []);
  const openStoreDiamonds = useCallback(() => { dismissActiveInput(); navRef.current.onGoToStore?.('diamonds'); }, []);
  const openStoreSocial = useCallback(() => { dismissActiveInput(); navRef.current.onGoToStore?.('socialPack'); }, []);
  const openHistory = useCallback(() => { dismissActiveInput(); navRef.current.onOpenMatchHistory?.(); }, []);
  const openBoard = useCallback(() => { dismissActiveInput(); navRef.current.onOpenLeaderboard?.(); }, []);
  const openRoad = useCallback(() => { dismissActiveInput(); navRef.current.onOpenLevelRoad?.(); }, []);
  // setState setter'ları zaten sabit — [] deps güvenli.
  const openMenu = useCallback(() => { dismissActiveInput(); setMenuOpen(true); }, []);
  const openModes = useCallback(() => { dismissActiveInput(); setModesOpen(true); }, []);
  const openBot = useCallback(() => { dismissActiveInput(); setBotPage({ key: 'bot', dir: 1 }); setBotOpen(true); }, []);
  // Zil ve "Yenilikler" kartı aynı davranışı paylaşır (feed açılır, pip söner).
  const openNews = useCallback(() => { dismissActiveInput(); setNewsOpen(true); setNewsUnread(false); AsyncStorage.setItem(NEWS_READ_KEY, LATEST_NEWS_ID).catch(() => {}); }, []);

  // Three across, as the mockup — the row is (3 cards + 2 gaps) wide.
  const cardW = railW > 0 ? (railW - 2 * CAROUSEL_GAP) / 3 : 0;
  const codeReady = joinCode.length === ROOM_CODE_LEN;

  // Kart sanatları: inline eleman her render'da yeni kimlik alır ve
  // memo(ArtCard)'ı boşa çıkarırdı. Arena sanatı yalnız kupa sayısının
  // fonksiyonu (curTier/nextTier/arenaPct hepsi trophies'ten türer); carousel
  // sanatları tamamen statik — t() çıktıları dil değişiminde App'in langKey
  // remount'u ile tazelendiğinden [] deps güvenli.
  const arenaArt = useMemo(() => (
    <View style={StyleSheet.absoluteFill}>
      {/* Arena render fills the frame as a horizontal strip. The isometric stadium
          is diamond-shaped, so its PNG has transparent top corners; the render is
          scaled up past the box so the stadium body covers them instead of leaving
          the card colour showing through. Clipped by the box's overflow:hidden. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 30, overflow: 'hidden' }}>
        <Image source={curTier.img} resizeMode="cover" style={{ width: '100%', height: '100%', transform: [{ scale: 1.5 }, { translateY: 6 }] }} />
      </View>
      <View style={{ position: 'absolute', right: 12, top: 7, flexDirection: 'row', gap: 2 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <Ionicons key={i} name="star" size={12} color={i < Math.ceil(arenaPct * 3) ? theme.gold : 'rgba(255,255,255,0.22)'} />
        ))}
      </View>
      {nextTier ? (
        <View style={{ position: 'absolute', left: 11, top: 9, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }} numberOfLines={1}>{`${trophies}/${nextTier.min}`}</Text>
          <Ionicons name="trophy" size={11} color={theme.accent} />
        </View>
      ) : (
        <Text style={{ position: 'absolute', left: 11, top: 9, color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} numberOfLines={1}>{t('home.topArena')}</Text>
      )}
    </View>
  ), [trophies, curTier, nextTier, arenaPct]);
  const socialArt = useMemo(() => (
    <View style={StyleSheet.absoluteFill}>
      {/* Mockup placement: players sit right-of-centre, feet on the pill. */}
      <Image source={EMOTE_ART.squad} resizeMode="contain" style={{ position: 'absolute', right: 0, bottom: 44, width: '68%', height: '58%' }} />
      <Text style={{ position: 'absolute', left: 11, top: 10, color: theme.text, fontSize: 11, fontFamily: 'Poppins-SemiBold', width: '58%', ...engrave('sm') }} numberOfLines={3}>
        {t('home.socialPackShort')}
      </Text>
    </View>
  ), []);
  const roadArt = useMemo(() => (
    <View style={StyleSheet.absoluteFill}>
      {/* Mockup placement: the medal floats right-of-centre, above the pill. */}
      <Image source={XP_STAR} resizeMode="contain" style={{ position: 'absolute', right: 0, top: '14%', width: '54%', height: '58%' }} />
      <Text style={{ position: 'absolute', left: 11, top: 10, color: theme.text, fontSize: 11, fontFamily: 'Poppins-SemiBold', width: '58%', ...engrave('sm') }} numberOfLines={3}>
        {t('home.levelRoadHint')}
      </Text>
    </View>
  ), []);

  return (
    <Screen
      pad={HOME_SCREEN_PAD} contentCenter={false} fillTablet
      // ── 1. TOP BAR ── fixed lobby header. It reserves the full visual overhang
      // of the selected frame / gift herald, so no decorative pixel can bleed back
      // into the device safe area while the body still compacts below it.
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: homeTopPad, minHeight: homeTopPad + HOME_HEADER_ROW_H, overflow: 'visible' }}>
          <ProfilePill
            name={playerName}
            avatarId={profile?.avatar ?? profile?.selectedAvatar}
            tier={lvl}
            pct={xpPct}
            color={lvlColor}
            fillAnim={xpBarAnim}
            frameId={profile?.selectedFrame}
            onPress={openProfile}
            claimBadge={unclaimedLevelCount(profile)}
            boosted={Boolean(profile?.xpBoostUntil && new Date(profile.xpBoostUntil).getTime() > Date.now())}
          />
          <GemPill count={profile?.diamonds ?? 0} onPress={openStoreDiamonds} countAnim={gemCountAnim} fillAnim={gemFillAnim} innerRef={gemPillRef} />
          {win.width >= TOPBAR_ROOMY_W ? (
            <RoundIconBtn icon="time" onPress={openHistory} />
          ) : null}
          <RoundIconBtn icon="notifications" dot={newsUnread} onPress={openNews} />
          <RoundIconBtn icon="settings-sharp" onPress={openMenu} />
        </View>
      }
    >
      {/* XP küre yağmuru (maç sonrası) */}
      {xpFly != null ? (
        <XpOrbFly gained={xpFly} target={{ x: xpTarget.x, y: xpTarget.y }} onOrbLand={onXpOrbLand} onDone={() => { xpFlyPlanRef.current = null; setXpFly(null); actions.markXpSeen(); }} />
      ) : null}

      {/* ── 2. HERO ── */}
      <View
        onLayout={(e) => setHero({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        // minHeight must clear the absolutely-positioned rail: top(2) + 2 badges (44 circle
        // + 14.5 chip overlap) + 12 gap = 131. Anything less and the rail spills onto the CTA.
        style={{ alignItems: 'center', justifyContent: 'center', marginTop: gapSm, marginBottom: 0, minHeight: heroBoxH }}
      >
        {/* w excludes the right badge rail (44px RailBadge circles at right:0 + 12px
            margin): pieces falling BEHIND the translucent badge faces read as artifacts —
            a white ribbon as a gray slab over the trophy cup, a purple piece as a notch
            poking out of the ring's right edge. */}
        <HeroConfetti w={Math.max(0, hero.w - 56)} h={hero.h} visible={heroAnimsActive} />
        {/* The hero unit — the two balls + the CROSSOVER lettering lifted WHOLE
            from the Top.jpeg mockup as one image (feathered edges melt into the
            night sky), so it is pixel-for-pixel the photo composition. */}
        <Image
          source={HERO_ART}
          style={{ width: win.width * (0.55 + 0.102 * homeScale), height: win.width * (0.55 + 0.102 * homeScale) * (320 / 708) }}
          resizeMode="contain"
        />
        <View style={{ position: 'absolute', right: 0, top: 2, gap: 12 }}>
          <RailBadge icon="trophy" iconColor={theme.gold} ringColor={theme.purple} value={String(trophies)} onPress={openArenas} countAnim={trophyCountAnim} fillAnim={trophyFillAnim} innerRef={trophyBadgeRef} />
          <RailBadge icon="podium" iconColor={theme.accent} ringColor={theme.accentDark} value={myRank ? `#${myRank}` : '—'} onPress={openBoard} />
        </View>
      </View>

      {!isNetworkErrorMessage(state.error) && state.error ? <ErrorBanner message={state.error} /> : null}

      {/* ── 3. CTA ── */}
      <View>
        {/* Galibiyet serisi — 2+ üst üste dereceli galibiyette CTA'nın üstünde alevli rozet */}
        {(profile?.winStreak ?? 0) >= 2 ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: -13, left: 0, right: 0, alignItems: 'center', zIndex: 5 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: theme.flame, borderRadius: 999,
              borderWidth: 2, borderColor: lighten(theme.flame, 0.3),
              paddingHorizontal: 11, paddingVertical: 3.5,
              shadowColor: theme.flame, shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 10,
            }}>
              <Ionicons name="flame" size={13} color="#FFF3D6" />
              <Text style={{ color: '#FFF9EC', fontSize: 11.5, fontFamily: 'Poppins-Black', letterSpacing: 0.6, ...engrave('sm') }}>
                {t('streak.chip', { n: String(profile?.winStreak ?? 0) }).toLocaleUpperCase(currentLang())}
              </Text>
            </View>
          </View>
        ) : null}
        <HeroPlayBtn label={t('home.quickMatch')} onPress={startQuickMatch} height={playH} />
      </View>

      {/* ── 4. GRID ── */}
      <View style={{ flexDirection: 'row', gap: gapMd, marginTop: gapSm }}>
        <View style={{ flex: 1 }}>
          <ArtCard
            title={t('home.modesTitle')}
            tint={theme.amber}
            grade={MODES_CARD_GRADE}
            strip="#3A2109"
            arrow
            height={primaryCardH}
            onPress={openModes}
            art={MODES_CARD_ART}
          />
          {/* Kalıcı YENİ kurdelesi (kullanıcı kararı 2026-08-28: '1' yerine
              kartın sağ üstünde YENİ yazsın — açınca kaybolmaz). */}
          <View pointerEvents="none" style={{ position: 'absolute', top: -7, right: -5, zIndex: 10 }}>
            <Ribbon label={t('store.badgeNew')} color={theme.danger} />
          </View>
        </View>
        {/* Özel Mod — the private-room flow. createRoom/joinRoom have existed in
            useCrossover (797/826) with a working LobbyScreen, but nothing in the UI
            had called them; this panel is their entry point. */}
        <GhostPanel title={t('home.specialMode')} ghost="key" height={primaryCardH}>
          <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', marginTop: 9 }} numberOfLines={1}>{t('home.roomCodeLabel')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
            <TextInput
              value={joinCode}
              onChangeText={(v) => setJoinCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN))}
              onSubmitEditing={() => { if (codeReady) { dismissActiveInput(); actions.joinRoom(joinCode, playerName); setJoinCode(''); } }}
              placeholder={t('home.codePlaceholder')}
              placeholderTextColor={withAlpha(theme.muted, 0.5)}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              rejectResponderTermination={false}
              {...roomCodeInputFocus}
              onFocus={(e) => { triggerFeedback(GameFeedbackEvent.UI_TAP); roomCodeInputFocus.onFocus(e); }}
              style={{
                flex: 1, height: 34, borderRadius: 11, backgroundColor: theme.well,
                borderTopWidth: 2, borderTopColor: theme.shadowInk,
                color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5, letterSpacing: 1.2,
                paddingHorizontal: 8, textAlign: 'center',
              }}
            />
            <Pressable
              disabled={!codeReady}
              onPressIn={() => { if (codeReady) triggerFeedback(GameFeedbackEvent.UI_PRIMARY); }}
              onPress={() => { dismissActiveInput(); actions.joinRoom(joinCode, playerName); setJoinCode(''); }}
              style={({ pressed }) => ({
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: codeReady ? theme.primary : theme.navyWell,
                borderBottomWidth: 2, borderBottomColor: codeReady ? theme.primaryDark : theme.panelInk,
                alignItems: 'center', justifyContent: 'center',
                transform: [{ translateY: pressed ? 2 : 0 }],
              })}
            >
              <Ionicons name="arrow-forward" size={16} color={codeReady ? theme.ink : theme.muted} />
            </Pressable>
          </View>
          <Pressable
            onPressIn={() => triggerFeedback(GameFeedbackEvent.UI_CARD)}
            onPress={() => { dismissActiveInput(); actions.createRoom(playerName, opts); }}
            style={({ pressed }) => ({
              marginTop: 8, height: 32, borderRadius: 11,
              backgroundColor: withAlpha(theme.blue, 0.22),
              borderWidth: 1.5, borderColor: withAlpha(theme.blue, 0.6),
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
              transform: [{ translateY: pressed ? 2 : 0 }],
            })}
          >
            <Ionicons name="add-circle" size={14} color={theme.blue} />
            <Text style={{ color: theme.text, fontSize: 11, fontFamily: 'Poppins-ExtraBold' }} numberOfLines={1}>{t('home.createRoom')}</Text>
          </Pressable>
        </GhostPanel>
      </View>

      <View style={{ flexDirection: 'row', gap: gapMd, marginTop: gapSm, alignItems: 'flex-end' }}>
        <ArtCard
          title={arenaLabel(profile?.arena.name ?? '') + (profile?.arena.name === 'GOAT' ? goatStageLabel(profile?.trophies) : '')}
          tint={theme.card}
          height={secondaryCardH}
          onPress={openArenas}
          art={arenaArt}
        />
        <GhostPanel
          title={t('home.solo')}
          icon="people"
          ghost="game-controller"
          height={secondaryCardH}
          tone={darken(theme.primary, 0.74)}
          onPress={openBot}
        >
          <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', marginTop: 6 }} numberOfLines={2}>{t('home.soloShort')}</Text>
        </GhostPanel>
      </View>

      {/* ── 5. CAROUSEL ── */}
      {/* marginBottom clears the tab bar's raised centre ball, which breaks ~18pt above
          the bar and would otherwise sit on this strip's captions. */}
      <View onLayout={(e) => setRailW(e.nativeEvent.layout.width)} style={{ marginTop: gapSm, marginBottom: Math.max(3, Math.round(8 * homeScale)) }}>
        {cardW > 0 ? (
          <View style={{ flexDirection: 'row', gap: CAROUSEL_GAP }}>
            <View style={{ width: cardW }}>
              <ArtCard
                title={hasPack ? t('store.badgeActive') : t('store.socialPackTitle')}
                tint={theme.purple}
                grade={SOCIAL_CARD_GRADE}
                pillBar={SOCIAL_CARD_PILL}
                height={carouselCardH}
                onPress={openStoreSocial}
                art={socialArt}
              />
            </View>
            <View style={{ width: cardW }}>
              {/* Seviye Yolu kartı (eskiden müsabaka geçmişi kartıydı — geçmiş artık
                  yalnız Profil ekranından erişiliyor; bu carousel slotu artık
                  seviye ilerlemesini gösteriyor ve Seviye Yolu'nu açıyor). */}
              <ArtCard
                title={t('level.roadTitle')}
                tint={theme.blue}
                grade={ROAD_CARD_GRADE}
                pillBar={ROAD_CARD_PILL}
                height={carouselCardH}
                onPress={openRoad}
                art={roadArt}
              />
            </View>
            {/* Günün Crossover'ı — bu slot eskiden haber kartıydı; duyurular üst
                bardaki zilden aynı NewsModal'a zaten açılıyor (yedeklilik kalktı). */}
            <View style={{ width: cardW }}>
              <GhostPanel
                title={'GÜNÜN SORUSU'}
                icon="calendar"
                ghost="football"
                height={carouselCardH}
                tone={darken(theme.gold, 0.72)}
                onPress={openDailyCx}
              >
                {state.dailyCx && !state.dailyCx.played ? (
                  <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.danger }} />
                ) : null}
                <Text style={{ color: theme.muted, fontSize: 11.5, lineHeight: 17, fontFamily: 'Poppins-SemiBold', marginTop: 9 }} numberOfLines={3}>
                  {state.dailyCx?.played
                    ? (state.dailyCx.result?.correct ? `✓ Bildin!${state.dailyCx.streak > 0 ? ` 🔥 ${state.dailyCx.streak} gün` : ''}` : 'Yarın yenisi!')
                    : `#${state.dailyCx?.day ?? '…'} · bilene ${state.dailyCx?.reward ?? 10} 💎`}
                </Text>
              </GhostPanel>
            </View>
            {/* Günün Kariyeri — ikinci günlük içerik (paylaşım döngüsü) */}
            <View style={{ width: cardW }}>
              <GhostPanel
                title={'GÜNÜN KARİYERİ'}
                icon="footsteps"
                ghost="football"
                height={carouselCardH}
                tone={darken(theme.purple, 0.72)}
                onPress={openDailyCareer}
              >
                {state.dailyCareer && !state.dailyCareer.played ? (
                  <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.danger }} />
                ) : null}
                <Text style={{ color: theme.muted, fontSize: 11.5, lineHeight: 17, fontFamily: 'Poppins-SemiBold', marginTop: 9 }} numberOfLines={3}>
                  {state.dailyCareer?.played
                    ? (state.dailyCareer.correct ? t('career.cardWin') : t('career.cardDone'))
                    : t('career.cardIdle', { n: String(state.dailyCareer?.day ?? '…'), r: String(state.dailyCareer?.reward ?? 10) })}
                </Text>
              </GhostPanel>
            </View>
            {/* Günlük Görevler — günlük döngünün tutkalı */}
            <View style={{ width: cardW }}>
              <GhostPanel
                title={'GÜNLÜK GÖREVLER'}
                icon="checkbox"
                ghost="football"
                height={carouselCardH}
                tone={darken(theme.primary, 0.72)}
                onPress={openQuests}
              >
                {questsReady ? (
                  <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.danger }} />
                ) : null}
                <Text style={{ color: theme.muted, fontSize: 11.5, lineHeight: 17, fontFamily: 'Poppins-SemiBold', marginTop: 9 }} numberOfLines={3}>
                  {state.dailyQuests
                    ? t('quest.card', {
                        n: String((state.dailyQuests.quests ?? []).filter((q) => q.claimed).length),
                        total: String((state.dailyQuests.quests ?? []).length),
                      })
                    : t('store.loading')}
                </Text>
              </GhostPanel>
            </View>
          </View>
        ) : null}
      </View>

      <NetworkErrorBeacon visible={isNetworkErrorMessage(state.error)} />

      {/* ── Günün Crossover'ı ── */}
      <DailyCrossoverModal
        visible={dailyCxOpen}
        cx={state.dailyCx}
        wrong={state.dailyCxWrong}
        reward={state.dailyCxReward}
        onGuess={actions.guessDailyCrossover}
        onClose={closeDailyCx}
      />

      {/* ── Günlük Görevler ── */}
      <DailyQuestsModal
        visible={questsOpen}
        quests={state.dailyQuests}
        claimedXp={state.questClaimedXp}
        onClaim={actions.claimQuest}
        onClose={closeQuests}
      />

      {/* ── Günün Kariyeri ── */}
      <DailyCareerModal
        visible={dailyCareerOpen}
        career={state.dailyCareer}
        reward={state.dailyCareerReward}
        onGuess={actions.guessDailyCareer}
        onClose={closeDailyCareer}
      />

      {/* ── Mode picker ── */}
      <GameModal visible={modesOpen} onClose={() => setModesOpen(false)} onExited={() => { if (socialUpsellOnExit.current) { socialUpsellOnExit.current = false; if (lockedModePreview) onLockedSocialMode?.(lockedModePreview); setLockedModePreview(null); } }} title={t('home.modesTitle').toLocaleUpperCase(currentLang())} icon="football">
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 6 }]}>{t('home.specialModeBody')}</Text>
        {HOME_MODES.map((m) => {
          const locked = PACK_MODES.includes(m) && !hasPack;
          const c = m === 'team-team' ? theme.primary : m === 'xox' ? theme.gold : m === 'player-player' ? theme.accent : m === 'country-team' ? theme.blue : theme.purple;
          return (
            <GameRow
              key={m}
              icon={MODE_ICON[m]}
              iconColor={c}
              tint={locked ? undefined : c}
              label={MODE_LABEL(m)}
              locked={locked}
              sublabel={locked ? t('socialPack.lockedBadge') : undefined}
              // XOX yeni geldi (2026-08-27): kart rozetindeki '1' girişte söner,
              // satırdaki YENİ kurdelesi bir süre kalır — sonraki modda taşınır.
              right={m === 'xox' ? <Ribbon label={t('store.badgeNew')} color={theme.danger} /> : undefined}
              chevron={!locked}
              onPress={() => startMode(m)}
            />
          );
        })}
      </GameModal>

      {/* ── Settings (gear opens the settings CONTENT directly — no hub list;
             leaderboard lives on the hero podium badge, match history on its
             own home card — user decision) ── */}
      <GameModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('settings.title').toLocaleUpperCase(currentLang())}
        icon="settings"
      >
        <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <SettingsPanel
            onLanguageChange={() => { setMenuOpen(false); onLanguageChange?.(); }}
            diamonds={profile?.diamonds ?? 0}
            playerId={profile?.userId ?? null}
            arenaName={profile?.arena?.name ?? null}
            monetizationDiagnostics={monetizationDiagnostics}
            canChangeName={state.authProvider === 'apple' || state.authProvider === 'google'}
            onChangeName={(newName) => actions.changeName(newName)}
            onNeedDiamonds={() => { setMenuOpen(false); onGoToStore?.('diamonds'); }}
            onLogout={() => { setMenuOpen(false); void actions.logout(); }}
            onDeleteAccount={() => { setMenuOpen(false); actions.deleteAccount(); }}
            blocked={state.blockedUsers}
            onListBlocked={() => actions.listBlocked()}
            onUnblock={(userId) => actions.unblockUser(userId)}
          />
          {/* Ad değiştirme vb. sunucu hataları ("Bu kullanıcı adı zaten dolu")
              pencere İÇİNDE görünsün — ana ekrandaki bant modalın altında kalıyor */}
          {!isNetworkErrorMessage(state.error) && state.error ? <ErrorBanner message={state.error} /> : null}
        </ScrollView>
      </GameModal>

      {/* ── Bot match — difficulty home + mode/scope pages inside ONE modal ── */}
      <GameModal
        visible={botOpen}
        onClose={() => setBotOpen(false)}
        onExited={() => { if (socialUpsellOnExit.current) { socialUpsellOnExit.current = false; if (lockedModePreview) onLockedSocialMode?.(lockedModePreview); setLockedModePreview(null); } }}
        title={BOT_BANNER[botPage.key].title().toLocaleUpperCase(currentLang())}
        icon={BOT_BANNER[botPage.key].icon}
      >
        <ModalPager pageKey={botPage.key} dir={botPage.dir}>
          {botPage.key === 'bot' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <Chip icon={MODE_ICON[mode]} label={MODE_LABEL(mode)} onPress={() => setBotPage({ key: 'mode', dir: 1 })} />
                <Chip icon="globe-outline" label={scopeLabel(scope)} onPress={() => setBotPage({ key: 'scopeType', dir: 1 })} />
              </View>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => {
                const c = d === 'easy' ? theme.primary : d === 'medium' ? theme.accent : theme.danger;
                return (
                  <GameRow
                    key={d}
                    icon={d === 'easy' ? 'happy' : d === 'medium' ? 'flash' : 'skull'}
                    iconColor={c}
                    label={DIFF_LABEL(d)}
                    selected={difficulty === d}
                    onPress={() => {
                      // Güvenlik ağı: seçili mod kilitliyse (paket yok) createSolo yapma,
                      // server hatası yerine upsell'e devret.
                      if (PACK_MODES.includes(mode) && !hasPack) { setLockedModePreview(mode); socialUpsellOnExit.current = true; setBotOpen(false); return; }
                      setDifficulty(d); setBotOpen(false); actions.createSolo(playerName, { ...opts, difficulty: d });
                    }}
                  />
                );
              })}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 2 }}>
                <Ionicons name="information-circle" size={14} color={theme.muted} />
                <Text style={{ flex: 1, color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>{t('level.botXpCapInfo')}</Text>
              </View>
            </>
          ) : botPage.key === 'mode' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <ModalBackBtn onPress={() => setBotPage({ key: 'bot', dir: -1 })} />
              </View>
              {(['team-team', 'cozkazan', 'xox', 'country-team', 'letter-team'] as GameMode[]).map((m) => {
                // Bota karşı da paket kilidi: yalnız team-team serbest; diğer modlar
                // (cozkazan dahil, 2026-09-01) Sosyal Paket ister. Kilitliyse seçtirmeyip
                // modalı kapatıp upsell'e devret.
                const locked = PACK_MODES.includes(m) && !hasPack;
                return (
                  <GameRow
                    key={m}
                    icon={MODE_ICON[m]}
                    label={MODE_LABEL(m)}
                    selected={mode === m}
                    locked={locked}
                    sublabel={locked ? t('socialPack.lockedBadge') : undefined}
                    chevron={!locked}
                    onPress={() => {
                      if (locked) { setLockedModePreview(m); socialUpsellOnExit.current = true; setBotOpen(false); return; }
                      setMode(m); setBotPage({ key: 'bot', dir: -1 });
                    }}
                  />
                );
              })}
            </>
          ) : botPage.key === 'scopeType' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <ModalBackBtn onPress={() => setBotPage({ key: 'bot', dir: -1 })} />
              </View>
              <GameRow icon="earth" iconColor={theme.primary} label={t('scope.all')} selected={scope.type === 'all'} onPress={() => { setScope({ type: 'all' }); setBotPage({ key: 'bot', dir: -1 }); }} />
              <GameRow icon="trophy" label={t('scope.pickLeague')} chevron onPress={() => setBotPage({ key: 'league', dir: 1 })} />
              <GameRow icon="flag" iconColor={theme.blue} label={t('scope.pickCountry')} chevron onPress={() => setBotPage({ key: 'country', dir: 1 })} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <ModalBackBtn onPress={() => setBotPage({ key: 'scopeType', dir: -1 })} />
              </View>
              <ScopeListPage
                key={botPage.key}
                kind={botPage.key}
                scopes={state.scopes}
                onPick={(s) => { setScope(s); setBotPage({ key: 'bot', dir: -1 }); }}
              />
            </>
          )}
        </ModalPager>
      </GameModal>

      <NewsModal visible={newsOpen} onClose={() => setNewsOpen(false)} />

    </Screen>
  );
}

// Searchable league/country scope list — one page shared by the bot dialog (home)
// and the friendly-match dialog (friends). Skeletons while scopes load; crafted
// EmptyState for no results. Key it by `kind` so the search resets per page.
// Perf: sunucu TÜM lig/ülkeleri LİMİTSİZ yollar — eski düz map + ScrollView,
// onlarca beveled satırı + arma görselini modal sayfa kaymasıyla AYNI frame'de
// mount ediyordu ve her tuş vuruşu hepsini yeniden reconcile ediyordu. FlatList
// yalnız görünür satırları mount eder; satırlar memo'lu ScopeRow olduğundan tuş
// vuruşları onları atlar.
const scopeOptionLabel = (o: { value: string; displayName?: string }) => o.displayName ?? LEAGUE_DISPLAY[o.value] ?? o.value;
const scopeCountChip = (count: number) => (
  <View style={{ backgroundColor: theme.cardLip, borderRadius: 8, borderWidth: 1, borderColor: theme.accentDark, paddingHorizontal: 7, paddingVertical: 2 }}>
    <Text style={{ color: theme.accent, fontSize: 10, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{count}</Text>
  </View>
);
type ScopeRowItem = { o: ScopeOption; label: string; lower: string };
const scopeKeyExtractor = (x: ScopeRowItem) => x.o.value;
const ScopeRow = memo(function ScopeRow({ kind, value, label, logoUrl, count, onPickScope }: {
  kind: 'league' | 'country';
  value: string;
  label: string;
  logoUrl?: string | null;
  count: number;
  onPickScope: (kind: 'league' | 'country', value: string) => void;
}) {
  return (
    <GameRow
      leading={
        kind === 'league' && logoUrl ? (
          <CachedImage uri={logoUrl} style={{ width: 24, height: 24 }} contentFit="contain" />
        ) : kind === 'country' && logoUrl ? (
          <Text style={{ fontSize: 18 }}>{logoUrl}</Text>
        ) : (
          <Ionicons name={kind === 'league' ? 'trophy' : 'flag'} size={18} color={theme.muted} />
        )
      }
      label={label}
      right={scopeCountChip(count)}
      onPress={() => onPickScope(kind, value)}
    />
  );
});
function ScopeListPage({ kind, scopes, onPick }: {
  kind: 'league' | 'country';
  scopes: GameState['scopes'];
  onPick: (s: Scope) => void;
}) {
  const allList = kind === 'league' ? scopes?.leagues ?? [] : scopes?.countries ?? [];
  const [search, setSearch] = useState('');
  // Etiketler bir kez normalize edilir (allList değişmedikçe) — eskiden her tuş
  // vuruşu tüm liste için optionLabel().toLowerCase()'i yeniden koşturuyordu.
  const indexed = useMemo(
    () => allList.map((o) => { const label = scopeOptionLabel(o); return { o, label, lower: label.toLowerCase() }; }),
    [allList],
  );
  // Eski davranışla birebir: sorgu TRİMLENMEDEN normalize edilir, filtre yalnız
  // trim'li hali doluysa uygulanır.
  const q = search.trim() ? search.toLowerCase() : '';
  const filtered = useMemo(() => (q ? indexed.filter((x) => x.lower.includes(q)) : indexed), [indexed, q]);
  // onPick iki çağrı yerinde de inline closure — ref üzerinden sabitlenir ki
  // memo'lu ScopeRow'lar parent her render olduğunda boşuna yeniden çizilmesin.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onPickScope = useCallback((k: 'league' | 'country', value: string) => onPickRef.current({ type: k, value }), []);
  // autoFocus klavye istemini liste mount'u + ModalPager'ın 200ms kaymasıyla
  // aynı frame'e bindiriyordu — focus 2 frame sonraya ertelenir: algılanmaz ama
  // sayfa kayması akıcı kalır.
  const searchRef = useRef<TextInput>(null);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => searchRef.current?.focus()); });
    return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
  }, []);
  const renderItem = useCallback(({ item }: { item: ScopeRowItem }) => (
    <ScopeRow kind={kind} value={item.o.value} label={item.label} logoUrl={item.o.logoUrl} count={item.o.count} onPickScope={onPickScope} />
  ), [kind, onPickScope]);
  return (
    <>
      <GameInput
        icon="search"
        placeholder={kind === 'league' ? t('scope.searchLeague') : t('scope.searchCountry')}
        value={search}
        onChangeText={setSearch}
        inputRef={searchRef}
      />
      <FlatList
        style={{ maxHeight: 320 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        data={filtered}
        keyExtractor={scopeKeyExtractor}
        renderItem={renderItem}
        initialNumToRender={10}
        windowSize={5}
        ListEmptyComponent={allList.length === 0 ? (
          // Loading skeleton — never confused with "empty".
          <SkeletonRows rows={3} />
        ) : (
          <EmptyState icon="search" title={t('common.noResults')} />
        )}
      />
    </>
  );
}

// ---- Lobby ----
// Çıkış onayı ÜÇ tonda konuşur (kullanıcı kuralı, 2026-08-10): dereceli maçta
// kupa cezası AÇIKÇA yazar; dostluk maçında yalnız hükmen (kupa yok — "kupa
// kaybedersin" yazmak yalan olurdu); bot/lobi gibi bedelsiz yerlerde yalnız
// "emin misin?" sorulur.
function LeaveConfirmModal({ visible, kind = 'ranked', onCancel, onConfirm }: {
  visible: boolean; kind?: 'ranked' | 'forfeit' | 'plain'; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <GameModal visible={visible} onClose={onCancel} title={t('leave.bannerTitle')} icon="warning" danger>
      <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') }}>
        {t('leave.confirmTitle')}
      </Text>
      {kind !== 'plain' ? (
        <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19 }}>
          {t(kind === 'ranked' ? 'leave.confirmBody' : 'leave.confirmBodyForfeit')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch', marginTop: 2, borderTopWidth: 0, borderBottomWidth: 0 }}>
        <Pressable onPress={onCancel} onPressIn={() => triggerFeedback(GameFeedbackEvent.UI_NEGATIVE)} style={({ pressed }) => ({ flex: 1, height: 50, borderRadius: 16, borderWidth: 0, backgroundColor: pressed ? withAlpha(theme.text, 0.08) : withAlpha(theme.text, 0.04), alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.985 : 1 }] })}>
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14, ...engrave('sm') }}>{t('leave.cancel')}</Text>
        </Pressable>
        <Pressable onPress={onConfirm} onPressIn={() => triggerFeedback(GameFeedbackEvent.UI_DESTRUCTIVE)} style={({ pressed }) => ({ flex: 1.12, height: 50, borderRadius: 16, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0, elevation: 0, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
          <Text style={{ color: '#fff', fontFamily: 'Poppins-Black', fontSize: 14, letterSpacing: 0.2, ...engrave('sm') }}>{t('leave.confirm')}</Text>
        </Pressable>
      </View>
    </GameModal>
  );
}

export function OpponentForfeitModal({ visible, reason, onFindNew, onGoHome, trophyDelta, showFindNew = true }: { visible: boolean; reason?: 'cheat' | null; onFindNew: () => void; onGoHome: () => void; trophyDelta?: { delta: number; trophies: number } | null; showFindNew?: boolean }) {
  const cheat = reason === 'cheat';
  return (
    <GameModal visible={visible} onClose={onGoHome} title={t(cheat ? 'opponent.cheatBannerTitle' : 'opponent.bannerTitle')} icon={cheat ? 'shield-checkmark' : 'exit'}>
      {/* Exit icon in a beveled medallion (card face + accent ring + soft gold glow) */}
      <View
        style={{
          alignSelf: 'center', width: 64, height: 64, borderRadius: 32,
          // CONTINUOUS rim (VsBadge rule): per-side colors seam at the diagonals
          // on a circle. One uniform ring; depth comes from the gold glow below.
          backgroundColor: theme.card, borderWidth: 2, borderColor: theme.accent,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: theme.accent, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6,
        }}
      >
        <Ionicons name={cheat ? 'shield-checkmark' : 'exit-outline'} size={30} color={theme.accent} />
      </View>
      <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19 }}>
        {t(cheat ? 'opponent.cheatTitle' : 'opponent.leftTitle')}
      </Text>
      {/* Forfeit is always a win for whoever stays → show the trophies gained (chip
          shows +delta and the new total), mirroring the match-over screen. */}
      {trophyDelta && trophyDelta.delta ? (
        <View style={{ alignItems: 'center' }}>
          <TrophyDeltaChip delta={trophyDelta.delta} trophies={trophyDelta.trophies} />
        </View>
      ) : null}
      {showFindNew ? <Btn label={t('opponent.findNew')} icon="flash" onPress={onFindNew} /> : null}
      <Btn label={t('opponent.goHome')} kind="ghost" icon="home" onPress={onGoHome} />
    </GameModal>
  );
}

export function LobbyScreen({ state, actions }: Props) {
  const room = state.room!;
  const you = room.players.find((p) => p.id === room.youId);
  const canStart = !!you?.isHost && room.players.length === 2;
  const hasBot = room.players.some((p) => p.name === 'Bot');
  const hideCode = hasBot || state.isQuickMatch;
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const needConfirm = !hasBot && room.players.length === 2;
  return (
    <Screen scroll>
      <GamePanel hero tint={theme.frameGold} bodyStyle={{ alignItems: 'center', paddingVertical: 18 }}>
        {!hideCode ? (
          <>
            <Text style={styles.label}>{t('lobby.code')}</Text>
            <Text style={[styles.code, engrave('lg')]}>{room.code}</Text>
            <Text style={styles.muted}>{t('lobby.shareCode')}</Text>
          </>
        ) : hasBot ? (
          <>
            <Ionicons name="game-controller" size={44} color={theme.accent} />
            <Text style={styles.h1}>{t('lobby.botMatch')}</Text>
          </>
        ) : (
          <>
            <Ionicons name="flash" size={44} color={theme.primary} style={{ alignSelf: 'center' }} />
            <Text style={styles.h1}>{t('home.quickMatch')}</Text>
          </>
        )}
      </GamePanel>
      <View style={{ height: 14 }} />
      {room.players.map((p) => (
        <GamePanel key={p.id} compact accentStripe={p.isHost ? theme.accent : theme.primary} style={{ marginBottom: 8 }} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 14 }}>
          <Avatar avatar={p.id === room.youId ? (p.avatar ?? state.profile?.avatar) : p.avatar} name={p.name} size={32} ring={p.isHost ? theme.accent : theme.primary} iconColor={p.isHost ? theme.accent : theme.muted} iconSize={18} frameId={p.id === room.youId ? (p.frame ?? state.profile?.selectedFrame) : p.frame} />
          <CosmeticName name={`${p.name}${p.id === room.youId ? t('lobby.youSuffix') : ''}`} effectId={p.id === room.youId ? state.profile?.equippedNameEffectId : p.cosmetics?.nameEffectId} style={styles.lobbyName} />
        </GamePanel>
      ))}
      <View style={{ height: 18 }} />
      {room.players.length < 2 ? (
        <View style={styles.lobbyWaitChip}>
          <GameSpinner />
          <Text style={[styles.muted, { flexShrink: 1 }]}>{t('lobby.waiting')}</Text>
        </View>
      ) : canStart ? (
        <Btn label={t('lobby.start')} icon="play" onPress={actions.start} />
      ) : (
        <View style={styles.lobbyWaitChip}>
          <GameSpinner />
          <Text style={[styles.muted, { flexShrink: 1 }]}>{t('lobby.waitHost')}</Text>
        </View>
      )}
      <View style={{ height: 16 }} />
      <Btn label={t('result.leave')} kind="ghost" icon="close" onPress={() => needConfirm ? setShowLeaveConfirm(true) : actions.leave()} />
      {/* Lobi maç DEĞİL: ayrılmanın bedeli yok — yalnız "emin misin?" sorulur. */}
      <LeaveConfirmModal visible={showLeaveConfirm} kind="plain" onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
    </Screen>
  );
}

// ---- VsBadge — THE gold VS coin (one dialect for matchup + guess reveal) ----
// Top-lit gloss, 4px accentDark lip, gold glow, engraved Poppins-Black label.
function VsBadge({ size = 48 }: { size?: number }) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: theme.accent,
        alignItems: 'center', justifyContent: 'center',
        // CONTINUOUS rim: top-only + bottom-only borders leave the left/right of a
        // circle border-less, so the coin's edge looked "cut". One uniform border
        // wraps the whole coin; depth comes from the gold glow shadow.
        borderWidth: 2, borderColor: theme.accentDark,
        shadowColor: theme.accent, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8,
      }}
    >
      <Text style={{ color: theme.ink, fontFamily: 'Poppins-Black', fontSize: Math.round(size * 0.31), ...engrave('sm') }}>{t('common.vs')}</Text>
    </View>
  );
}

// ---- Matchup (pre-match player reveal) ----
export function MatchupScreen({ state }: Props) {
  const room = state.room;
  const you = room?.players.find((p) => p.id === room.youId);
  const opp = room?.players.find((p) => p.id !== room.youId);

  // Entrance animation: slide + scale + fade in
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }).start();
  }, [anim]);

  const oppSlide = anim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] });
  const youSlide = anim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const vsScale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  const oppColor = opp?.arena ? arenaColor(opp.arena.name) : theme.muted;
  const youColor = you?.arena ? arenaColor(you.arena.name) : theme.primary;
  const matchBg = <MatchCosmeticBackdrop backgroundId={matchBackgroundIdForState(state)} />;

  const renderPlayer = (p: typeof you, color: string, slideY: Animated.AnimatedInterpolation<number>, fallbackAvatar?: string | null, fallbackFrame?: string | null) => (
    <Animated.View style={{ transform: [{ translateY: slideY }], opacity: anim, alignSelf: 'stretch' }}>
      {/* Alt kenar da tint rengi (eskiden darken(tint) koyu kalıp "kesik" görünüyordu) —
           çerçeve isim kutusunun etrafını TAM sarar; derinlik gölgeden gelir. */}
      <GamePanel compact tint={color} style={{ borderBottomColor: color }} bodyStyle={{ alignItems: 'center', gap: 6, paddingVertical: 14 }}>
        <IntroEffectOverlay effectId={p?.cosmetics?.introId ?? (p?.id === room?.youId ? state.profile?.equippedIntroId : null)} accent={color} />
        <Avatar avatar={p?.avatar ?? fallbackAvatar} name={p?.name} size={64} ring={color} ringWidth={3} bg={theme.card} iconColor={color} iconSize={30} frameId={p?.frame ?? fallbackFrame} trophies={p?.trophies} />
        <CosmeticName name={p?.name ?? '?'} effectId={p?.cosmetics?.nameEffectId ?? (p?.id === room?.youId ? state.profile?.equippedNameEffectId : null)} style={{ color: theme.text, fontSize: 18, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="trophy" size={15} color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: 14, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{p?.trophies ?? 0}</Text>
          </View>
          {p?.level ? <LevelBadge level={p.level} size={22} /> : null}
        </View>
        {p?.arena ? (
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: theme.panelInnerFill, borderRadius: 12,
              borderWidth: 1.5, borderColor: color, borderBottomColor: darken(color),
              paddingHorizontal: 8, paddingVertical: 3,
            }}
          >
            {/* Arena Ionicon (kit rule: vector icons in wells, never emoji) */}
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.bg, borderWidth: 1, borderColor: withAlpha(color, 0.4), alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={arenaIcon(p.arena)} size={11} color={color} />
            </View>
            <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>{arenaLabel(p.arena.name)}</Text>
          </View>
        ) : null}
      </GamePanel>
    </Animated.View>
  );

  return (
    <Screen bg={matchBg}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Text style={{ color: theme.accent, fontSize: 14, fontFamily: 'Poppins-ExtraBold', letterSpacing: 3, textTransform: 'uppercase', ...engrave('lg') }}>{t('matchup.title')}</Text>
        {renderPlayer(opp, oppColor, oppSlide)}
        <Animated.View style={{ transform: [{ scale: vsScale }], alignItems: 'center', gap: 4 }}>
          <VsBadge size={50} />
          <MatchBall ballId={localBallIdForState(state)} size={42} />
        </Animated.View>
        {renderPlayer(you, youColor, youSlide, state.profile?.avatar, state.profile?.selectedFrame)}
      </View>
    </Screen>
  );
}

// ---- MatchExitButton — the one leave-match affordance (ScreenHeader-back recipe) ----
// 40px beveled card square with a danger-tinted close glyph + press depress.
function MatchExitButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => triggerFeedback(GameFeedbackEvent.UI_CLOSE)}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: 14,
        backgroundColor: pressed ? theme.surface1 : theme.surface2,
        borderTopWidth: 1, borderTopColor: theme.topLight,
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateY: pressed ? 2 : 0 }],
        ...shadowRow,
      })}
    >
      <Ionicons name="close" size={20} color={theme.danger} />
    </Pressable>
  );
}

// ---- PlayerBar — the persistent in-match HUD (Clash-style opponent presence) ----
// One slim GamePanel-compact strip: opponent avatar + name + trophies, the
// running match score in a recessed well, and your beveled emote coin.
function PlayerBar({ state, onEmotePress }: { state: GameState; onEmotePress?: () => void }) {
  const room = state.room;
  const you = room?.players.find((p) => p.id === room.youId);
  const opp = room?.players.find((p) => p.id !== room.youId);
  if (!room || !opp) return null;
  const color = opp.arena ? arenaColor(opp.arena.name) : theme.muted;
  const ballId = you?.cosmetics?.ballId ?? state.profile?.equippedBallId ?? DEFAULT_BALL_ID;
  return (
    <GamePanel compact style={{ flex: 1, borderBottomColor: theme.border }} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5, paddingHorizontal: 10 }}>
      <Avatar avatar={opp.avatar} name={opp.name} size={30} ring={color} ringWidth={2} iconColor={color} iconSize={15} frameId={opp.frame} trophies={opp.trophies} />
      <View style={{ flex: 1 }}>
        <CosmeticName name={opp.name} effectId={opp.cosmetics?.nameEffectId} style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="trophy" size={10} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 10, fontFamily: 'Poppins-SemiBold', letterSpacing: 0.5, fontVariant: ['tabular-nums'] }}>{opp.trophies ?? 0}</Text>
        </View>
      </View>
      <MatchBall ballId={ballId} size={30} />
      {/* Running score — recessed well; your side leads in mint */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.well, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 2 }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
        <Text style={{ color: theme.primary, fontSize: 15, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{you?.score ?? 0}</Text>
        <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold' }}>-</Text>
        <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{opp.score ?? 0}</Text>
      </View>
      {onEmotePress ? <EmoteCoin size={34} onPress={onEmotePress} /> : null}
    </GamePanel>
  );
}

// ---- Countdown ----
export function CountdownScreen({ state }: Props) {
  // Sayı PAYLAŞILAN endsAt'ten hesaplanır (2026-08-28): iki istemci de aynı
  // mutlak ana sayar — geç geçen taraf da doğru rakamı görür. endsAt yoksa
  // (eski sunucu) sunucunun gönderdiği n'e düşülür.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state.countdownEndsAt == null) return;
    const id = setInterval(() => setTick((v) => v + 1), 200);
    return () => clearInterval(id);
  }, [state.countdownEndsAt]);
  const n = state.countdownEndsAt != null
    ? Math.max(0, Math.ceil((state.countdownEndsAt - Date.now()) / 1000))
    : (state.countdown ?? 0);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
  }, [n, a]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] });
  return (
    <Screen bg={<MatchCosmeticBackdrop backgroundId={matchBackgroundIdForState(state)} />}>
      {/* EMOTE ISITMASI BURADAN KALDIRILDI (2026-08-29): 6 animasyonlu WebP'yi
          (~1,8 MB) aynı anda çözüyordu ve oyuncular "maç içinde, genelde 3-2-1'de
          donuyor" diye bildirdi. Isıtma artık SIRALI ve maç DIŞINDA (ana ekran)
          çalışıyor — geri sayım maçın en kritik anı, burada ağır iş yapılmaz. */}
      <View style={styles.center}>
        {/* Halka TAMAMEN yeşil kaplar: alt kenar da theme.primary (eskiden primaryDark
            koyu arka planda "kesik" görünüyordu). Üstte yalnız ince bir parlaklık kalır. */}
        <View style={{ width: 172, height: 172, borderRadius: 86, borderWidth: 5, borderColor: theme.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panelInk, shadowColor: theme.primary, shadowOpacity: 0.65, shadowRadius: 28, shadowOffset: { width: 0, height: 0 }, elevation: 18 }}>
          <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: theme.card, borderWidth: 2, borderColor: withAlpha(theme.primary, 0.33), alignItems: 'center', justifyContent: 'center' }}>
            <Animated.Text style={{ color: theme.text, fontSize: n > 0 ? 88 : 50, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], transform: [{ scale }], opacity: a, ...engrave('lg') }}>
              {n > 0 ? n : 'GO!'}
            </Animated.Text>
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <MatchBall ballId={localBallIdForState(state)} size={54} />
        </View>
        <Text style={{ color: theme.muted, marginTop: 20, fontFamily: 'Poppins-ExtraBold', fontSize: 14, letterSpacing: 1 }}>{t('getReady')}</Text>
      </View>
    </Screen>
  );
}

// ---- Pick (team / country / letter) ----

const PICK_LETTERS = 'ABCDEFGHIJKLMNOPRSTUVYZ'.split('');

// ---- Shared match timer — THE recessed countdown trough (pick + guess) ----
// panelInnerFill well with a sunken cardLip top edge, Poppins-Black tabular
// digits + engrave, flips to danger with a scale-pulse loop when urgent.
function MatchTimer({ endsAt, urgentAt = 5, fallbackSecs, style }: {
  endsAt: number | null; urgentAt?: number; fallbackSecs?: number; style?: any;
}) {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) { setSecs(null); return; }
    const tick = () => setSecs(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  const shown = secs ?? fallbackSecs ?? null;
  const urgent = endsAt != null && secs !== null && secs <= urgentAt;
  const lastShownRef = useRef<number | null>(null);
  useEffect(() => {
    if (endsAt == null || secs == null || secs === lastShownRef.current) return;
    lastShownRef.current = secs;
    if (secs <= 0) return;
    if (secs <= 2) triggerFeedback(GameFeedbackEvent.TIMER_CRITICAL);
    else if (secs <= 5) triggerFeedback(GameFeedbackEvent.TIMER_WARNING);
  }, [endsAt, secs]);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!urgent) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [urgent, pulse]);
  if (shown === null) return null;
  const color = urgent ? theme.danger : theme.accent;
  return (
    <Animated.View
      style={[{
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
        backgroundColor: theme.well, borderRadius: 14, overflow: 'hidden',
        paddingVertical: 4, paddingHorizontal: 14,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) }],
      }, style]}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
      <Ionicons name="time-outline" size={16} color={color} />
      <Text style={{ color, fontSize: 22, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{shown}</Text>
    </Animated.View>
  );
}

function PickTimer({ pickEndsAt, style }: { pickEndsAt: number | null; style?: any }) {
  return <MatchTimer endsAt={pickEndsAt} urgentAt={3} fallbackSecs={10} style={style ?? { marginTop: 6 }} />;
}

// What the local player chose this round — kept as UI state so the waiting
// screen can render the pick large (the server only echoes `picked: true`).
type LastPick =
  | { kind: 'team'; label: string; logoUrl: string | null }
  | { kind: 'player'; label: string; imageUrl: string | null }
  | { kind: 'country'; label: string; flag: string }
  | { kind: 'letter'; label: string };

// Turkish-insensitive search: normalize İ→i, Ş→s, Ü→u, Ö→o, Ç→c, Ğ→g, ı→i.
// Module scope + önceden normalize edilmiş NAT_INDEX: eskiden ülke seçicide her
// tuş vuruşu 83 ülke × displayName+value için bu 7 zincirli regex'i yeniden
// koşturuyordu — 10 sn'lik pick sayacı işlerken. Bir kez hesaplanır.
const trLower = (s: string) =>
  s.replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/[ŞşŞ]/g, 's').replace(/[ÜüÜ]/g, 'u').replace(/[ÖöÖ]/g, 'o')
    .replace(/[ÇçÇ]/g, 'c').replace(/[ĞğĞ]/g, 'g').toLowerCase();
const NAT_INDEX = NATIONALITIES.map((n) => ({ n, d: trLower(n.displayName), v: trLower(n.value) }));

export function PickTeamScreen({ state, actions, tutorial }: Props) {
  const [q, setQ] = useState('');
  const [countryQ, setCountryQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const role = state.pickRole ?? 'team';
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [lastPick, setLastPick] = useState<LastPick | null>(null);
  // Çarpı HER maçta sorar (kullanıcı kuralı 2026-08-10): botta yalnız "emin
  // misin", derecelide kupa uyarısı, dostlukta kupasız hükmen metni.
  const leaveKind = state.isQuickMatch ? ('ranked' as const) : ('forfeit' as const);
  const handleLeave = () => tutorial ? actions.leave() : setShowLeaveConfirm(true);
  const matchBg = <MatchCosmeticBackdrop backgroundId={matchBackgroundIdForState(state)} />;

  const onChange = (text: string) => {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    // Search on every keystroke (incl. empty → popular teams), so the logo grid
    // filters live and is never empty.
    timer.current = setTimeout(() => actions.searchClubs(text.trim()), 140);
  };

  // Fill the team grid with popular teams as soon as the team picker opens.
  useEffect(() => {
    if (role === 'team') actions.searchClubs('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // A new pick phase (picked flips back to false) invalidates last round's pick.
  useEffect(() => {
    if (!state.picked) setLastPick(null);
  }, [state.picked]);

  // Sarkan debounce: ekran unmount olduktan sonra timer patlayıp searchClubs/
  // searchPlayers göndermesin.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Tuş vuruşu (setQ/setCountryQ) koca ekranı yeniden çizer; grid/satır
  // elemanları burada memo'lanır ki sonuçlar değişmedikçe AYNI element
  // referansları dönsün — React kimliği değişmeyen elementin alt ağacını
  // olduğu gibi atlar, klavye açıkken yalnız TextInput reconcile edilir.
  // (Closure'lar actions/setLastPick'i sonuçların son değiştiği render'dan
  // yakalar: setLastPick sabit bir setState, pick* yalnız send'i sarar — pick
  // fazı ortasında kimlikleri değişse de davranışları değişmez.)
  // NOT: Hook'lar aşağıdaki erken return'lerden ÖNCE koşmak zorunda (rules of
  // hooks) — rolü olmayan listeler boş dizidir, maliyeti yok.
  const clubCells = useMemo(() => {
    return state.clubResults.map((c: ClubRef) => {
      // Already picked in THIS match: dimmed, unpressable, lock badge. (Feature
      // from the powers branch, restyled into Broadcast Prestige — no #000
      // shadow and no 2px frame, which the redesign retired.)
      const used = state.usedClubIds.includes(c.id);
      return (
        <Pressable
          key={c.id}
          disabled={used}
          onPress={() => { setLastPick({ kind: 'team', label: c.name, logoUrl: c.logoUrl ?? null }); actions.pickTeam(c.id); }}
          style={({ pressed }) => ({
            width: '31.5%' as const, alignItems: 'center' as const, gap: 7,
            backgroundColor: theme.surface2, borderRadius: 14,
            borderTopWidth: 1, borderTopColor: theme.topLight,
              paddingVertical: 12, paddingHorizontal: 4,
            opacity: used ? 0.38 : 1,
            ...shadowRow,
            transform: [{ translateY: used ? 0 : pressed ? 2 : 0 }],
          })}
        >
          <ClubBadge name={c.name} size={46} logoUrl={c.logoUrl} />
          <Text style={{ color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }} numberOfLines={2}>
            {c.name}
          </Text>
          {used ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.panelInk, borderTopWidth: 1, borderTopColor: theme.topLight, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="lock-closed" size={11} color={theme.muted} />
            </View>
          ) : null}
        </Pressable>
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.clubResults, state.usedClubIds]);

  const playerRows = useMemo(() => {
    return state.playerResults.map((p: PlayerRef) => (
      <GameRow
        key={p.id}
        leading={
          p.imageUrl ? (
            <CachedImage uri={p.imageUrl} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
          ) : (
            <Ionicons name="person" size={18} color={theme.muted} />
          )
        }
        label={p.name}
        chevron
        onPress={() => { setLastPick({ kind: 'player', label: p.name, imageUrl: p.imageUrl ?? null }); actions.pickPlayer(p.id); }}
      />
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playerResults]);

  // Ülke listesi: sabit NAT_INDEX üzerinden filtre — sorgu render başına BİR
  // kez normalize edilir. usedCountries dizisinin kimliği değil DEĞERİ dep'tir;
  // reducer diziyi yeniden kursa bile memo boşa düşmez.
  const usedCountriesKey = state.usedCountries.join('|');
  const countryRows = useMemo(() => {
    const nq = trLower(countryQ);
    const list = countryQ.trim() ? NAT_INDEX.filter((x) => x.d.includes(nq) || x.v.includes(nq)) : NAT_INDEX;
    return list.map(({ n }) => {
      // Bu maçta seçilmiş ülke: karart + tıklanamaz + "seçildi" rozeti
      const used = state.usedCountries.includes(n.value.trim().toLowerCase());
      return (
        <GameRow
          key={n.value}
          leading={<Text style={{ fontSize: 18 }}>{n.flag}</Text>}
          label={n.displayName}
          chevron={!used}
          style={used ? { opacity: 0.4 } : undefined}
          right={used ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.panelInnerFill, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Ionicons name="checkmark-done" size={12} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-ExtraBold' }}>{t('pick.used').toLocaleUpperCase(currentLang())}</Text>
            </View>
          ) : undefined}
          onPress={used ? undefined : () => { setLastPick({ kind: 'country', label: n.displayName, flag: n.flag }); actions.pickCountry(n.value); }}
        />
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryQ, usedCountriesKey]);

  // Top chrome shared by every pick state: exit button + opponent HUD, then a
  // SINGLE compact row (title left, timer right). The old stacked h1 + timer
  // pill pushed the search field ~90pt down — "pick'te üstte çok boşluk"; the
  // guess screen's dense top (bar → content immediately) is the reference.
  const header = (title: string) => (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 0, gap: 10, marginBottom: 12 }}>
        <MatchExitButton onPress={handleLeave} />
        <PlayerBar state={state} onEmotePress={tutorial ? undefined : () => setEmoteOpen(true)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={[styles.h1, { marginVertical: 0, textAlign: 'left' }]}>{title}</Text>
        <PickTimer pickEndsAt={state.pickEndsAt} style={{ marginTop: 0 }} />
      </View>
    </>
  );
  const emoteLayer = !tutorial ? (
    <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} />
  ) : null;
  const leaveModal = (
    <LeaveConfirmModal visible={showLeaveConfirm} kind={leaveKind} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
  );

  if (state.picked) {
    return (
      <Screen bg={matchBg}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 0, gap: 10, marginBottom: 12 }}>
          <MatchExitButton onPress={handleLeave} />
          <PlayerBar state={state} onEmotePress={tutorial ? undefined : () => setEmoteOpen(true)} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <GamePanel hero bodyStyle={{ alignItems: 'center', gap: 12, paddingVertical: 26 }}>
            <PulseRing size={116}>
              {lastPick?.kind === 'team' && lastPick.logoUrl ? (
                <ClubBadge name={lastPick.label} size={62} logoUrl={lastPick.logoUrl} />
              ) : lastPick?.kind === 'player' && lastPick.imageUrl ? (
                <CachedImage uri={lastPick.imageUrl} style={{ width: 62, height: 62, borderRadius: 31 }} contentFit="cover" />
              ) : lastPick?.kind === 'country' ? (
                <Text style={{ fontSize: 44 }}>{lastPick.flag}</Text>
              ) : lastPick?.kind === 'letter' ? (
                <Text style={{ color: theme.accent, fontSize: 42, fontFamily: 'Poppins-Black', ...engrave('lg') }}>{lastPick.label}</Text>
              ) : lastPick ? (
                <ClubBadge name={lastPick.label} size={62} />
              ) : (
                <Ionicons name="checkmark" size={42} color={theme.primary} />
              )}
            </PulseRing>
            {lastPick && lastPick.kind !== 'letter' ? (
              <Text numberOfLines={2} style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') }}>
                {lastPick.label}
              </Text>
            ) : null}
            <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{t('pick.picked')}</Text>
            <PickTimer pickEndsAt={state.pickEndsAt} />
          </GamePanel>
        </View>
        {leaveModal}
        {emoteLayer}
      </Screen>
    );
  }

  // ---- Player picker ----
  if (role === 'player') {
    const onPlayerChange = (text: string) => {
      setQ(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => actions.searchPlayers(text.trim()), 140);
    };
    return (
      <Screen bg={matchBg}>
        {header(t('pick.titlePlayer'))}
        <GameInput
          icon="search"
          placeholder={t('pick.searchPlayer')}
          value={q}
          onChangeText={onPlayerChange}
          autoFocus={!tutorial}
        />
        <ScrollView style={{ alignSelf: 'stretch', flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
          {playerRows}
          {state.playerResults.length === 0 && q.trim() ? (
            <EmptyState icon="search" title={t('common.noResults')} style={{ paddingVertical: 16 }} />
          ) : null}
        </ScrollView>
        {leaveModal}
        {emoteLayer}
      </Screen>
    );
  }

  // ---- Letter picker ----
  if (role === 'letter') {
    return (
      // contentCenter={false}: the letter grid is shorter than the viewport, so the
      // Screen default (justifyContent center) floated the whole block down and
      // left a big gap above the header — every pick state is top-anchored.
      <Screen contentCenter={false} bg={matchBg}>
        {header(t('pick.titleLetter'))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {PICK_LETTERS.map((l) => (
            <Pressable
              key={l}
              style={({ pressed }) => ({
                width: 48, height: 48, borderRadius: 12,
                backgroundColor: theme.surface2,
                borderTopWidth: 1, borderTopColor: theme.topLight,
                    alignItems: 'center', justifyContent: 'center',
                ...shadowRow,
                transform: [{ translateY: pressed ? 2 : 0 }],
              })}
              onPress={() => { setLastPick({ kind: 'letter', label: l }); actions.pickLetter(l); }}
            >
              <Text style={{ color: theme.text, fontSize: 20, fontFamily: 'Poppins-Black', ...engrave('sm') }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        {leaveModal}
        {emoteLayer}
      </Screen>
    );
  }

  // ---- Country picker ----
  if (role === 'country') {
    return (
      <Screen bg={matchBg}>
        {header(t('pick.titleCountry'))}
        <GameInput
          icon="search"
          placeholder={t('pick.searchCountry')}
          value={countryQ}
          onChangeText={setCountryQ}
          autoFocus={!tutorial}
        />
        <ScrollView style={{ alignSelf: 'stretch', flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
          {countryRows}
          {countryRows.length === 0 && countryQ.trim() ? (
            <EmptyState icon="search" title={t('common.noResults')} style={{ paddingVertical: 16 }} />
          ) : null}
        </ScrollView>
        {leaveModal}
        {emoteLayer}
      </Screen>
    );
  }

  // ---- Team picker (default) ----
  return (
    <Screen bg={matchBg}>
      {header(t('pick.title'))}
      <GameInput
        icon="search"
        placeholder={t('pick.search')}
        value={q}
        onChangeText={onChange}
        autoFocus={!tutorial}
      />
      <ScrollView
        style={{ alignSelf: 'stretch', flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8, paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {clubCells}
        {state.clubResults.length === 0 && q.trim() ? (
          <EmptyState icon="search" title={t('common.noResults')} style={{ width: '100%', paddingVertical: 16 }} />
        ) : null}
      </ScrollView>
      {leaveModal}
      {emoteLayer}
    </Screen>
  );
}

// ---- Reveal + Guess ----
// Locked / passed turn states — framed status panel with a 200ms fade+scale
// entry and a one-shot icon pulse on arrival.
function GuessStatusPanel({ icon, iconColor, stripe, text }: { icon: IoniconName; iconColor: string; stripe: string; text: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(140),
      Animated.timing(pulse, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [a, pulse]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }], alignSelf: 'stretch', marginTop: 10 }}>
      <GamePanel compact accentStripe={stripe} bodyStyle={{ alignItems: 'center', gap: 8, paddingVertical: 18 }}>
        <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }] }}>
          <Ionicons name={icon} size={28} color={iconColor} />
        </Animated.View>
        <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') }}>{text}</Text>
      </GamePanel>
    </Animated.View>
  );
}

// Tahmin input'unun state'i BURADA yaşar: her tuş vuruşu yalnız bu küçük alt
// ağacı yeniden çizer — koca GuessScreen (takım kartları, MatchTimer, emote
// katmanı, PlayerBar) WS state değişmeden reconcile edilmez; hızlı yazan biri
// sayaç işlerken saniyede ~10 tam ekran render'ı ödemesin. textRef taslağı
// unmount/remount boyunca korur: wrongopen akışında rakip cevap kilidi alıp
// yanılınca input geri gelir — eski ekran-kökü state'iyle birebir aynı davranış.
// İlk-geçerli-cevap-kazanır kuralı ve kilit davranışı DEĞİŞMEZ: youAnswered/
// editable/disabled mantığı ve submit çağrıları aynen buradadır.
function GuessControls({ placeholder, youAnswered, tutorial, onSubmit, onPass, textRef }: {
  placeholder: string;
  youAnswered: boolean;
  tutorial?: boolean;
  onSubmit: (guess: string) => void;
  onPass: () => void;
  textRef: { current: string };
}) {
  const [text, setTextState] = useState(textRef.current);
  const setText = (v: string) => { textRef.current = v; setTextState(v); };
  const submit = () => {
    const guess = textRef.current.trim();
    if (!guess || youAnswered) return;
    dismissActiveInput();
    onSubmit(guess);
  };
  return (
    <>
      <GameInput
        placeholder={placeholder}
        value={text}
        onChangeText={setText}
        autoFocus={!tutorial}
        editable={!youAnswered && !tutorial}
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <Btn
        label={t('guess.send')}
        icon="send"
        feedback={GameFeedbackEvent.ANSWER_SUBMIT}
        onPress={submit}
        disabled={!text.trim() || youAnswered}
      />
      <View style={{ height: 8 }} />
      <Btn
        label={t('guess.pass')}
        kind="ghost"
        icon="play-skip-forward"
        onPress={onPass}
        disabled={youAnswered}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAÇ İÇİ ÖZEL GÜÇLER — istemci görünüm katmanı.
// Kaynak-of-truth SUNUCU: buradaki her durum special_power_state/activated
// olaylarından türetilir; istemci hiçbir süreyi/etkileri kendisi üretmez.
// ANA KURAL (değişmez): maç başına 1 manuel özel güç — envanter kaç olursa olsun.
// ═══════════════════════════════════════════════════════════════════════════
export type SpecialPowerIdView = 'freeze' | 'reveal' | 'skip' | 'extratime' | 'secondchance';
export const SPECIAL_POWER_LIST: SpecialPowerIdView[] = ['freeze', 'reveal', 'skip', 'extratime', 'secondchance'];
export const SPECIAL_POWERS: Record<SpecialPowerIdView, { icon: IoniconName; color: string; nameKey: MessageKey; descKey: MessageKey; rarity: 'common' | 'rare' | 'epic' | 'legendary' }> = {
  freeze: { icon: 'snow', color: theme.blue, nameKey: 'sp.freeze.name', descKey: 'sp.freeze.desc', rarity: 'epic' },
  reveal: { icon: 'bulb', color: theme.gold, nameKey: 'sp.reveal.name', descKey: 'sp.reveal.desc', rarity: 'legendary' },
  skip: { icon: 'play-skip-forward', color: theme.purple, nameKey: 'sp.skip.name', descKey: 'sp.skip.desc', rarity: 'epic' },
  extratime: { icon: 'time', color: theme.primary, nameKey: 'sp.extratime.name', descKey: 'sp.extratime.desc', rarity: 'common' },
  secondchance: { icon: 'heart-circle', color: theme.flame, nameKey: 'sp.secondchance.name', descKey: 'sp.secondchance.desc', rarity: 'rare' },
};
// Kullanıcının ÇİZDİRDİĞİ güç ikonları (2026-08-27 Downloads teslimi) — 5/5 TAM.
// Yeni güç eklenirse çizimi gelene dek SpecialPowerBadge Ionicons medalyonuna
// düşer (asset kuralıyla uyumlu: bunlar satılan ürünün KENDİSİ değil rozeti).
const SP_ART: Partial<Record<SpecialPowerIdView, number>> = {
  skip: require('../assets/powers/sp-skip.png'),
  extratime: require('../assets/powers/sp-extratime.png'),
  secondchance: require('../assets/powers/sp-secondchance.png'),
  freeze: require('../assets/powers/sp-freeze.png'),
  reveal: require('../assets/powers/sp-reveal.png'),
};

/** Özel güç rozeti: çizilmiş sanat varsa O (dokunulmamış), yoksa renkli
 * Ionicons medalyonu. Tüm güç yüzeyleri (HUD çipi, mağaza satırı, onay
 * penceresi, duyuru bandrolü) BUNU kullanır — tek kimlik. */
function SpecialPowerBadge({ id, size, dead = false }: { id: SpecialPowerIdView; size: number; dead?: boolean }) {
  const art = SP_ART[id];
  const meta = SPECIAL_POWERS[id];
  if (art != null) {
    return <Image source={art} style={{ width: size, height: size, opacity: dead ? 0.35 : 1 }} resizeMode="contain" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.29, backgroundColor: withAlpha(meta.color, dead ? 0.08 : 0.16), borderWidth: Math.max(1.5, size * 0.03), borderColor: withAlpha(meta.color, dead ? 0.3 : 0.55), alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={meta.icon} size={Math.round(size * 0.5)} color={dead ? theme.muted : meta.color} />
    </View>
  );
}

// Fiyatlar normalde store_catalog.specialPowers'tan gelir (sunucu config'i);
// katalog henüz yüklenmediyse bu ayna kullanılır (sunucu varsayılanlarıyla eş).
export const SPECIAL_POWER_PRICE_FALLBACK: Record<SpecialPowerIdView, number> = { freeze: 400, reveal: 600, skip: 350, extratime: 200, secondchance: 300 };
export function spInventoryCount(profile: ProfileView | null | undefined, id: SpecialPowerIdView): number {
  if (!profile) return 0;
  return id === 'freeze' ? (profile.spFreeze ?? 0)
    : id === 'reveal' ? (profile.spReveal ?? 0)
    : id === 'skip' ? (profile.spSkip ?? 0)
    : id === 'extratime' ? (profile.spExtratime ?? 0)
    : (profile.spSecondchance ?? 0);
}
// Sunucudaki STREAK_MILESTONES'un GÖRÜNÜM aynası (ödülü sunucu verir; bu tablo
// yalnız "sıradaki hedef" metnini çizer).
export const STREAK_MILESTONES_VIEW: { streak: number; diamonds?: number; powerId?: SpecialPowerIdView }[] = [
  // SERİ ÖDÜLÜ TAMAMEN KAPALI (kullanıcı kararı 2026-08-29): sunucu tablosuyla
  // birlikte boşaltıldı — maç sonunda ne ödül rozeti ne "sıradaki hedef" çıkar.
];

/** Maç ekranı güç çipleri (en fazla 3 slot): çip başına iki-dokunuş onayı
 * (yanlışlıkla harcama olmasın), KULLANILDI çip gri/kilitli. Toplam tavan
 * sunucuda — burası yalnız arayüz. */
function SpecialPowerHud({ state, actions }: Props) {
  const sp = state.specialPower;
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);
  if (!sp?.enabled || !sp.slots.length) return null;
  const totalLeft = sp.maxPerMatch - sp.usedTotal;
  const onPress = (powerId: string, used: boolean) => {
    if (used || sp.pending || totalLeft <= 0) { triggerFeedback(GameFeedbackEvent.UI_DISABLED); return; }
    if (armedId !== powerId) {
      setArmedId(powerId);
      triggerFeedback(GameFeedbackEvent.UI_TAP);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmedId(null), 2600);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmedId(null);
    actions.useSpecialPower(powerId);
  };
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {sp.slots.slice(0, 3).map((sl) => {
        const meta = SPECIAL_POWERS[sl.powerId as SpecialPowerIdView];
        if (!meta) return null;
        const dead = sl.used || totalLeft <= 0;
        const armed = armedId === sl.powerId;
        return (
          <Pressable key={sl.powerId} onPress={() => onPress(sl.powerId, sl.used)} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: dead ? theme.well : withAlpha(meta.color, 0.16), borderRadius: 999, paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1.5, borderColor: dead ? theme.border : withAlpha(meta.color, armed ? 1 : 0.6) }}>
              {SP_ART[sl.powerId as SpecialPowerIdView] != null
                ? <Image source={SP_ART[sl.powerId as SpecialPowerIdView]!} style={{ width: 22, height: 22, opacity: dead ? 0.4 : 1 }} resizeMode="contain" />
                : <Ionicons name={meta.icon} size={15} color={dead ? theme.muted : meta.color} />}
              {armed && !dead ? (
                <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: 9.5 }}>{t('sp.confirmTap')}</Text>
              ) : !dead && sl.qty > 0 ? (
                <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: 9.5 }}>×{sl.qty}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** ❄ SEN dondun: giriş yerine buz paneli + geri sayım. Yalnız gameplay girişi
 * kilitli — uygulama/soket/sayaç akmaya devam eder (kural sunucuda da var). */
function FrozenPanel({ until }: { until: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 200);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  return (
    <View style={{ alignItems: 'center', gap: 5, backgroundColor: withAlpha(theme.blue, 0.13), borderRadius: 18, borderWidth: 1.5, borderColor: withAlpha(theme.blue, 0.55), paddingVertical: 16, marginTop: 6 }}>
      <Ionicons name="snow" size={32} color={theme.blue} />
      <Text style={{ color: theme.blue, fontFamily: 'Poppins-Black', fontSize: 15, letterSpacing: 0.8 }}>{t('sp.frozenTitle')}</Text>
      <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: 28, fontVariant: ['tabular-nums'] }}>{secs}</Text>
      <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 11.5 }}>{t('sp.frozenHint')}</Text>
    </View>
  );
}

/** 💡 Reveal cevabı — yalnız kullanan görür; yazıp göndermek oyuncuya kalır
 * (network yarışı ve yazma temposu bozulmaz). */
function RevealChip({ name }: { name: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'center', backgroundColor: withAlpha(theme.gold, 0.15), borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5, borderColor: withAlpha(theme.gold, 0.6), marginBottom: 8 }}>
      <Ionicons name="bulb" size={18} color={theme.gold} />
      <View>
        <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: 14.5 }}>{name}</Text>
        <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 10.5 }}>{t('sp.revealHint')}</Text>
      </View>
    </View>
  );
}

/** Güç sunum katmanı: etkinleştirme/ikinci-şans/ret olaylarını KISA (≈1sn),
 * oyunu durdurmayan bir bandroll ile iki tarafta da duyurur — hiçbir güç sessiz
 * gerçekleşmez (spec §41, §78). Oyun durumu bu animasyonu asla beklemez. */
function SpecialPowerOverlays({ state }: { state: GameState }) {
  const [visible, setVisible] = useState<null | { title: string; sub?: string; icon: IoniconName; color: string; spId?: SpecialPowerIdView }>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const show = (v: { title: string; sub?: string; icon: IoniconName; color: string; spId?: SpecialPowerIdView }, holdMs = 850) => {
    setVisible(v);
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, friction: 6, tension: 130, useNativeDriver: true }),
      Animated.delay(holdMs),
      Animated.timing(anim, { toValue: 0, duration: 170, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setVisible(null); });
  };

  const ev = state.spEvent;
  const evSeq = useRef(0);
  useEffect(() => {
    if (!ev || ev.seq === evSeq.current) return;
    evSeq.current = ev.seq;
    const meta = SPECIAL_POWERS[ev.powerId as SpecialPowerIdView];
    if (!meta) return;
    const secs = String(Math.round((state.specialPower?.config.extraTimeMs ?? 7000) / 1000));
    const title = ev.powerId === 'extratime' && ev.mine
      ? t('sp.you.extratime', { s: secs })
      : t(`${ev.mine ? 'sp.you.' : 'sp.opp.'}${ev.powerId}` as MessageKey);
    track(ev.mine ? 'special_power_used_client' : 'opponent_power_received', { power_id: ev.powerId });
    if (ev.mine) {
      triggerFeedback(
        ev.powerId === 'freeze' ? GameFeedbackEvent.SP_FREEZE
          : ev.powerId === 'reveal' ? GameFeedbackEvent.SP_REVEAL
          : ev.powerId === 'skip' ? GameFeedbackEvent.SP_SKIP
          : ev.powerId === 'extratime' ? GameFeedbackEvent.SP_EXTRATIME
          : GameFeedbackEvent.SP_SECONDCHANCE,
      );
    } else {
      triggerFeedback(ev.powerId === 'freeze' ? GameFeedbackEvent.SP_FROZEN_HIT : GameFeedbackEvent.SP_OPPONENT);
    }
    show({ title, sub: t(meta.nameKey), icon: meta.icon, color: meta.color, spId: ev.powerId as SpecialPowerIdView });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.seq]);

  const sc = state.spSecondChance;
  const scSeq = useRef(0);
  useEffect(() => {
    if (!sc || sc.seq === scSeq.current) return;
    scSeq.current = sc.seq;
    triggerFeedback(GameFeedbackEvent.SP_SC_TRIGGERED);
    show({ title: sc.mine ? t('sp.scTriggeredYou') : t('sp.scTriggeredOpp'), icon: 'heart-circle', color: theme.flame }, 1100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc?.seq]);

  const den = state.spDenied;
  const denSeq = useRef(0);
  useEffect(() => {
    if (!den || den.seq === denSeq.current) return;
    denSeq.current = den.seq;
    triggerFeedback(GameFeedbackEvent.UI_ERROR);
    show({ title: t(`sp.denied.${den.reason}` as MessageKey), icon: 'close-circle', color: theme.danger }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [den?.seq]);

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', zIndex: 80 }]}>
      <Animated.View style={{ opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }], alignItems: 'center', gap: 7, backgroundColor: withAlpha('#0B1838', 0.9), borderRadius: 22, paddingHorizontal: 26, paddingVertical: 17, borderWidth: 2, borderColor: withAlpha(visible.color, 0.6), maxWidth: 300 }}>
        {visible.spId && SP_ART[visible.spId] != null
          ? <Image source={SP_ART[visible.spId]!} style={{ width: 64, height: 64 }} resizeMode="contain" />
          : <Ionicons name={visible.icon} size={42} color={visible.color} />}
        <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: 16, textAlign: 'center', letterSpacing: 0.5 }}>{visible.title}</Text>
        {visible.sub ? <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 11.5 }}>{visible.sub}</Text> : null}
      </Animated.View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FUTBOL XOX EKRANI — sunucu-otoriter tahtanın görünümü. İstemci hiçbir kural
// yürütmez: hücre sahipliği, sıra, süre ve sonuç xox_state/xox_over'dan gelir.
// ═══════════════════════════════════════════════════════════════════════════
const XOX_LINES_VIEW = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function XoxHeaderChip({ club, size }: { club: ClubRef; size: number }) {
  const badge = Math.min(40, size * 0.52);
  // Kupa / Ballon d'Or: gerçek GÖRSEL, YAZISIZ (kullanıcı isteği 2026-08-30).
  if (club.kind === 'trophy' || club.kind === 'bdor') {
    const img = club.kind === 'bdor' ? TROPHY_IMG.BDOR! : (TROPHY_IMG[club.trophy ?? 'CL'] ?? TROPHY_IMG.CL!);
    return (
      <View style={{ width: size, alignItems: 'center', justifyContent: 'flex-end', height: badge + 13 }}>
        <Image source={img} style={{ width: size * 0.66, height: badge + 12 }} resizeMode="contain" />
      </View>
    );
  }
  // Birleşik logo (combo): iki takımın birleşik arması, YAZISIZ (2026-08-30).
  if (club.kind === 'combo') {
    const img = COMBO_IMG[club.combo ?? ''];
    if (img) return (
      <View style={{ width: size, alignItems: 'center', justifyContent: 'flex-end', height: badge + 13 }}>
        <Image source={img} style={{ width: badge + 10, height: badge + 10 }} resizeMode="contain" />
      </View>
    );
  }
  // Mevki: BÜYÜK harf, net okunur, taşmaz (isteğe göre sığdırılır).
  if (club.kind === 'position') {
    return (
      <View style={{ width: size, alignItems: 'center', justifyContent: 'center', height: badge + 13, paddingHorizontal: 1 }}>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 12, lineHeight: 13, fontFamily: 'Poppins-Black', color: theme.gold, textAlign: 'center', maxWidth: size }}>{club.name}</Text>
      </View>
    );
  }
  return (
    <View style={{ width: size, alignItems: 'center', gap: 2 }}>
      {/* Özel eksen: ülke→bayrak, TD→yuvarlak foto, lig→logo (2026-08-30). */}
      {club.kind === 'country'
        ? <Text style={{ fontSize: Math.round(badge * 0.86), lineHeight: Math.round(badge * 1.02), textAlign: 'center' }}>{club.flag ?? '🏳️'}</Text>
        : club.kind === 'manager'
          ? <PlayerPhoto uri={club.logoUrl} size={badge} />
          : <ClubBadge name={club.name} size={badge} logoUrl={club.logoUrl} />}
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 9, fontFamily: 'Poppins-ExtraBold', maxWidth: size }}>{club.name}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TURNUVALAR (2026-08-28) — lobi listesi + Kafa Topu/CR tarzı eleme ağacı.
// Sunucu otoritesi: liste ve ağaç tournaments_list/tournament_state'ten gelir;
// kutucuklar + dirsek çizgileri kit dilinde (chunky, cam/parlama yok).
// ═══════════════════════════════════════════════════════════════════════════
const TOUR_BOX_W = 128;
const TOUR_BOX_H = 58;

function TourPlayerRow({ name, isWinner, isYou, decided }: { name: string | null; isWinner: boolean; isYou: boolean; decided: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: TOUR_BOX_H / 2 - 1, backgroundColor: isWinner ? withAlpha(theme.primary, 0.2) : 'transparent' }}>
      {isWinner ? <Ionicons name="checkmark-circle" size={11} color={theme.primary} /> : <View style={{ width: 11 }} />}
      <Text numberOfLines={1} style={{ flex: 1, color: name == null ? theme.muted : decided && !isWinner ? withAlpha(theme.text, 0.45) : isYou ? theme.accent : theme.text, fontSize: 10.5, fontFamily: isYou ? 'Poppins-Black' : 'Poppins-ExtraBold' }}>
        {name ?? '—'}
      </Text>
    </View>
  );
}

function TourMatchBox({ m, youId }: { m: { aId: string | null; aName: string | null; bId: string | null; bName: string | null; winnerId: string | null; status: string }; youId: string | null }) {
  const decided = m.winnerId != null;
  return (
    <View style={{ width: TOUR_BOX_W, height: TOUR_BOX_H, backgroundColor: theme.surface2, borderRadius: 12, borderWidth: 1.5, borderColor: m.status === 'playing' ? theme.gold : decided ? withAlpha(theme.primary, 0.5) : theme.border, overflow: 'hidden' }}>
      <TourPlayerRow name={m.aName} isWinner={decided && m.winnerId === m.aId} isYou={youId != null && m.aId === youId} decided={decided} />
      <View style={{ height: 1.5, backgroundColor: theme.border }} />
      <TourPlayerRow name={m.bName} isWinner={decided && m.winnerId === m.bId} isYou={youId != null && m.bId === youId} decided={decided} />
      {m.status === 'playing' ? (
        <View pointerEvents="none" style={{ position: 'absolute', right: 4, top: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: theme.gold }} />
      ) : null}
    </View>
  );
}

// ── HAFTALIK LİG (2026-08-29) ──────────────────────────────────────────────
// Turnuvalar sekmesinin ikinci görünümü. Lig AYRI EŞLEŞME İSTEMEZ: oyuncu
// normal maçlarını oynar, kazandığı kupalar burada puan olur. Ödül yalnız
// prestij (küme + rozet) — bu yüzden ekranda elmas/güç vaadi YOKTUR.
const LEAGUE_TIER_META: { key: MessageKey; color: string; icon: IoniconName }[] = [
  { key: 'league.tier.bronze', color: theme.bronze, icon: 'shield' },
  { key: 'league.tier.silver', color: theme.silver, icon: 'shield' },
  { key: 'league.tier.gold', color: theme.gold, icon: 'shield-half' },
  { key: 'league.tier.diamond', color: theme.blue, icon: 'diamond' },
  { key: 'league.tier.champion', color: theme.purple, icon: 'trophy' },
];

function leagueCountdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return t('league.endingNow');
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return t('league.endsInDays', { d: String(days), h: String(hours) });
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return t('league.endsInHours', { h: String(hours), m: String(minutes) });
}

function LeagueView({ state, actions }: Props) {
  const league = state.league;
  useEffect(() => { actions.getLeague(); }, []);
  // Saatlik geri sayım metni canlı kalsın (tablo yeniden çekilmez — ucuz tick).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!league) return <EmptyState icon="podium" title={t('store.loading')} />;
  const meta = LEAGUE_TIER_META[league.tier] ?? LEAGUE_TIER_META[0]!;
  const last = league.lastResult;
  const lastMoved = last ? last.tierAfter - last.tierBefore : 0;

  return (
    <View style={{ gap: 10 }}>
      {/* Küme başlığı + haftanın kalan süresi */}
      <GamePanel compact accentStripe={meta.color} bodyStyle={{ padding: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.well, borderWidth: 2.5, borderColor: meta.color, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={meta.icon} size={24} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontFamily: 'Poppins-Black', ...engrave('sm') }}>{t(meta.key)}</Text>
            <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold' }}>{leagueCountdown(league.endsAt)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: meta.color, fontSize: 20, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{league.yourRank}.</Text>
            <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>{t('league.points', { n: String(league.yourPoints) })}</Text>
          </View>
        </View>
        <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', lineHeight: 15 }}>{t('league.howItWorks', { n: String(league.promoteCount), d: String(league.demoteCount) })}</Text>
      </GamePanel>

      {/* Geçen haftanın sonucu — yalnız yükselme/düşme olduysa göster */}
      {last && lastMoved !== 0 ? (
        <GamePanel compact accentStripe={lastMoved > 0 ? theme.primary : theme.danger} bodyStyle={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={lastMoved > 0 ? 'arrow-up-circle' : 'arrow-down-circle'} size={20} color={lastMoved > 0 ? theme.primary : theme.danger} />
          <Text style={{ flex: 1, color: theme.text, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>
            {lastMoved > 0
              ? t('league.promoted', { rank: String(last.rank), tier: t(LEAGUE_TIER_META[last.tierAfter]?.key ?? 'league.tier.bronze') })
              : t('league.demoted', { rank: String(last.rank), tier: t(LEAGUE_TIER_META[last.tierAfter]?.key ?? 'league.tier.bronze') })}
          </Text>
        </GamePanel>
      ) : null}

      {/* Sıralama tablosu — terfi/düşme bölgeleri renkli şeritle ayrılır */}
      <GamePanel compact bodyStyle={{ padding: 0, overflow: 'hidden' }}>
        {league.rows.map((row, i) => {
          const zoneColor = row.zone === 'promote' ? theme.primary : row.zone === 'demote' ? theme.danger : 'transparent';
          const firstOfDemote = row.zone === 'demote' && league.rows[i - 1]?.zone !== 'demote';
          return (
            <View key={`${row.rank}-${row.name}`}>
              {/* Düşme hattı: "bu çizginin altı küme düşer" */}
              {firstOfDemote ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: withAlpha(theme.danger, 0.14) }}>
                  <Ionicons name="arrow-down" size={11} color={theme.danger} />
                  <Text style={{ color: theme.danger, fontSize: 9.5, fontFamily: 'Poppins-Black', letterSpacing: 0.5 }}>{t('league.demoteLine')}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: row.isYou ? withAlpha(theme.accent, 0.16) : 'transparent', borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.border }}>
                <View style={{ width: 3, height: 26, borderRadius: 2, backgroundColor: zoneColor }} />
                <Text style={{ width: 22, color: row.isYou ? theme.text : theme.muted, fontSize: 12, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], textAlign: 'right' }}>{row.rank}</Text>
                <Avatar avatar={row.avatar} name={row.name} size={26} ring={row.isYou ? theme.accent : theme.border} iconColor={theme.muted} iconSize={14} />
                <Text numberOfLines={1} style={{ flex: 1, color: row.isYou ? theme.text : theme.muted, fontSize: 12.5, fontFamily: row.isYou ? 'Poppins-Black' : 'Poppins-SemiBold' }}>{row.name}</Text>
                <Text style={{ color: row.isYou ? theme.accent : theme.muted, fontSize: 12, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>{row.points}</Text>
              </View>
              {/* Terfi hattı: "bu çizginin üstü yükselir" */}
              {row.zone === 'promote' && league.rows[i + 1]?.zone !== 'promote' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: withAlpha(theme.primary, 0.14) }}>
                  <Ionicons name="arrow-up" size={11} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 9.5, fontFamily: 'Poppins-Black', letterSpacing: 0.5 }}>{t('league.promoteLine')}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </GamePanel>
      <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 14, marginBottom: 6 }}>{t('league.footer')}</Text>
    </View>
  );
}

/** Turnuvalar/Lig geçişi — iki görünüm tek sekmede yaşar (nav bar 5 buton kalır). */
function LeagueTabBar({ tab, onChange }: { tab: 'tour' | 'league'; onChange: (t: 'tour' | 'league') => void }) {
  const item = (key: 'tour' | 'league', label: string, icon: IoniconName) => {
    const active = tab === key;
    return (
      <Pressable
        key={key}
        onPress={() => { triggerFeedback(GameFeedbackEvent.UI_TAP); onChange(key); }}
        style={({ pressed }) => ({
          flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          paddingVertical: 9, borderRadius: 12,
          backgroundColor: active ? theme.surface2 : theme.well,
          borderWidth: 2, borderColor: active ? theme.gold : theme.border,
          transform: [{ translateY: pressed ? 1 : 0 }],
        })}
      >
        <Ionicons name={icon} size={15} color={active ? theme.gold : theme.muted} />
        <Text style={{ color: active ? theme.text : theme.muted, fontSize: 12, fontFamily: 'Poppins-Black', letterSpacing: 0.3 }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
      {item('tour', t('tour.tabTournaments'), 'trophy')}
      {item('league', t('league.tab'), 'podium')}
    </View>
  );
}

export function TournamentsScreen({ state, actions }: Props) {
  const youId = state.profile?.userId ?? null;
  const list = state.tournaments;
  const tour = state.tournament;
  const [tab, setTab] = useState<'tour' | 'league'>('tour');
  useEffect(() => { actions.listTournaments(); }, []);
  // Üyesi olduğum turnuvanın ağacını otomatik aç/yenile.
  useEffect(() => {
    const mine = list?.find((it) => it.youJoined && it.status !== 'finished') ?? list?.find((it) => it.youJoined);
    if (mine && (!tour || tour.id !== mine.id)) actions.getTournament(mine.id);
  }, [list]);
  const rounds = tour && tour.matches.length ? Math.max(...tour.matches.map((m) => m.round)) : 0;
  const roundLabel = (r: number): string => {
    const fromEnd = rounds - r; // 0 = final, 1 = yarı, 2+ = çeyrek
    return fromEnd === 0 ? t('tour.round.3') : fromEnd === 1 ? t('tour.round.2') : t('tour.round.1');
  };
  return (
    <Screen scroll contentCenter={false}>
      {/* Sekme sayfası: geri oku YOK (nav bar zaten altta). Başlık turnuva adı ya da genel. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 6 }}>
        <Ionicons name={tab === 'league' ? 'podium' : 'trophy'} size={20} color={theme.gold} />
        <Text style={{ color: theme.text, fontSize: 19, fontFamily: 'Poppins-Black', letterSpacing: 0.5, ...engrave('lg') }}>{tab === 'league' ? t('league.title') : tour && tour.status !== 'finished' ? tour.name : t('tour.title')}</Text>
      </View>

      <LeagueTabBar tab={tab} onChange={setTab} />

      {tab === 'league' ? <LeagueView state={state} actions={actions} /> : null}

      {/* ── Lobi listesi (ağaç açık değilken ya da turnuva bitmişken) ── */}
      {tab !== 'tour' ? null : (!tour || tour.status === 'finished') ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          {!list ? (
            <EmptyState icon="trophy" title={t('store.loading')} />
          ) : list.length === 0 ? (
            <EmptyState icon="trophy" title={t('tour.empty')} />
          ) : list.map((it) => (
            <GamePanel key={it.id} compact accentStripe={it.status === 'live' ? theme.gold : it.status === 'registration' ? theme.primary : theme.muted} bodyStyle={{ padding: 12, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontFamily: 'Poppins-Black', ...engrave('sm') }}>{it.name}</Text>
                <Ribbon label={t(('tour.' + it.status) as MessageKey)} color={it.status === 'live' ? theme.gold : it.status === 'registration' ? theme.primary : theme.muted} />
              </View>
              <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold' }}>{t('tour.joined', { n: String(it.joined), size: String(it.size) })} · {t('tour.prize', { p1: String(it.prizeFirst), p2: String(it.prizeSecond) })}</Text>
              <Text style={{ color: it.entryFee > 0 ? theme.accent : theme.primary, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold' }}>{it.entryFee > 0 ? t('tour.entryFee', { fee: String(it.entryFee) }) : t('tour.freeEntry')}</Text>
              {it.status === 'finished' && it.winnerName ? (
                <Text style={{ color: theme.gold, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>{t('tour.champion', { name: it.winnerName })}</Text>
              ) : null}
              {it.status === 'registration' ? (
                it.youJoined ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ flex: 1, color: theme.primary, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>✓ {t('tour.waiting')}</Text>
                    <Btn compact kind="ghost" label={t('tour.leave')} onPress={() => actions.leaveTournament(it.id)} />
                  </View>
                ) : (
                  <Btn big kind="accent" icon="trophy" gem={it.entryFee > 0} label={it.entryFee > 0 ? t('tour.joinFee', { fee: String(it.entryFee) }) : t('tour.join')} feedback={GameFeedbackEvent.UI_PLAY} onPress={() => actions.joinTournament(it.id)} />
                )
              ) : it.status === 'live' && it.youJoined ? (
                <Btn compact kind="blue" icon="git-network" label={t('tour.bracket')} onPress={() => actions.getTournament(it.id)} />
              ) : null}
            </GamePanel>
          ))}
        </View>
      ) : null}

      {/* ── Eleme ağacı ── */}
      {tour && tour.matches.length > 0 ? (
        <View style={{ marginTop: 14 }}>
          <SectionHeader label={t('tour.bracket')} icon="git-network" />
          {tour.winnerName ? (
            <View style={{ alignSelf: 'center', backgroundColor: withAlpha(theme.gold, 0.16), borderRadius: 999, borderWidth: 1.5, borderColor: withAlpha(theme.gold, 0.6), paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10 }}>
              <Text style={{ color: theme.gold, fontSize: 13, fontFamily: 'Poppins-Black' }}>🏆 {t('tour.champion', { name: tour.winnerName })}</Text>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6, paddingRight: 16 }}>
            {Array.from({ length: rounds }, (_, ri) => ri + 1).map((r) => {
              const ms = tour.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
              // Kutu aralığı üstel büyür: her tur, önceki turun iki kutusunun
              // ORTASINA hizalanır (klasik bracket geometrisi).
              const gapBase = 14;
              const stride = (TOUR_BOX_H + gapBase) * Math.pow(2, r - 1);
              const offset = (stride - TOUR_BOX_H) / 2;
              return (
                <View key={r} style={{ marginRight: 26 }}>
                  <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-Black', letterSpacing: 1, textAlign: 'center', marginBottom: 8 }}>{roundLabel(r)}</Text>
                  <View>
                    {ms.map((m, i) => (
                      <View key={m.id} style={{ marginTop: i === 0 ? offset : stride - TOUR_BOX_H }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TourMatchBox m={m} youId={youId} />
                          {r < rounds ? (
                            <>
                              {/* yatay kol + dikey dirsek: kazanan üst tura akar */}
                              <View pointerEvents="none" style={{ width: 13, height: 2, backgroundColor: withAlpha(theme.border, 0.9) }} />
                              <View pointerEvents="none" style={{ position: 'absolute', left: TOUR_BOX_W + 11, width: 2, height: stride / 2 + 2, backgroundColor: withAlpha(theme.border, 0.9), top: i % 2 === 0 ? TOUR_BOX_H / 2 - 1 : undefined, bottom: i % 2 === 1 ? TOUR_BOX_H / 2 - 1 : undefined }} />
                            </>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginTop: 8 }}>{t('tour.prize', { p1: String(tour.prizeFirst), p2: String(tour.prizeSecond) })}</Text>
        </View>
      ) : null}
      <View style={{ height: 24 }} />
    </Screen>
  );
}

export function XoxScreen({ state, actions }: Props) {
  const xox = state.xox;
  const room = state.room;
  const youId = room?.youId ?? '';
  const opp = room?.players.find((p) => p.id !== youId);
  const over = state.xoxOver;
  const [selCell, setSelCell] = useState<number | null>(null);
  const guessRef = useRef('');
  const [guessText, setGuessText] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [showEmpties, setShowEmpties] = useState(false); // "Kalan boş kutucukları gör" basıldı mı
  const [, setTick] = useState(0);
  const win = useWindow();
  // SABİT EKRAN (kullanıcı kararı 2026-08-27): XOX kaydırılmaz. Tahta, orta
  // bölgenin ÖLÇÜLMÜŞ boyuna göre ölçeklenir — küçük telefonda, cevap paneli
  // açılınca ve klavye yükselince (KAV padding bölgeyi daraltır) hücreler
  // otomatik küçülür; Gönder butonu hep klavyenin üstünde, tahta hep tam.
  const [boardBox, setBoardBox] = useState({ w: 0, h: 0 });
  // Kazanan çizginin ÜSTÜNÜ ÇİZME efekti: altın bar soldan sağa büyüyerek
  // 3 hücrenin üzerinden geçer (kullanıcı isteği 2026-08-27).
  const strikeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (over?.line) {
      strikeAnim.setValue(0);
      Animated.timing(strikeAnim, { toValue: 1, duration: 480, delay: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [over?.line, strikeAnim]);
  // Sunucu sayacı: 500ms tikle yeniden çiz (yalnız aktif maçta).
  useEffect(() => {
    if (over) return undefined;
    const id = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(id);
  }, [over]);
  // Sıra/ani-ölüm değişince seçim sıfırlanır; sunum sesleri lastAction'dan.
  const lastSeq = useRef<string>('');
  useEffect(() => {
    if (!xox) return;
    const key = `${xox.turnNumber}:${xox.suddenDeath}`;
    if (key !== lastSeq.current) {
      lastSeq.current = key;
      setSelCell(xox.suddenDeath && xox.suddenCell != null ? xox.suddenCell : null);
      guessRef.current = '';
      setGuessText('');
    }
  }, [xox?.turnNumber, xox?.suddenDeath]);
  const laSeq = useRef<string>('');
  useEffect(() => {
    const la = xox?.lastAction;
    if (!la) return;
    const key = `${xox!.turnNumber}:${la.kind}:${la.byId}:${la.cell ?? -1}`;
    if (key === laSeq.current) return;
    laSeq.current = key;
    if (la.kind === 'claim') triggerFeedback(la.byId === youId ? GameFeedbackEvent.ANSWER_CORRECT : GameFeedbackEvent.OPPONENT_CORRECT);
    else if (la.kind === 'wrong') triggerFeedback(la.byId === youId ? GameFeedbackEvent.ANSWER_WRONG : GameFeedbackEvent.NOTIFICATION);
  }, [xox?.lastAction, xox?.turnNumber, youId]);
  // Maç sonu sesi
  const overPlayed = useRef(false);
  useEffect(() => {
    if (!over || overPlayed.current) return;
    overPlayed.current = true;
    triggerFeedback(over.winnerId === youId ? GameFeedbackEvent.MATCH_WIN : over.winnerId == null ? GameFeedbackEvent.MATCH_DRAW : GameFeedbackEvent.MATCH_LOSE);
  }, [over, youId]);
  useEffect(() => { if (!over) { overPlayed.current = false; setShowEmpties(false); } }, [over]);

  if (!xox || !room) return <Screen><Text style={styles.muted}>{t('store.loading')}</Text></Screen>;

  const myTurn = !over && !xox.suddenDeath && xox.turnId === youId;
  const canAnswer = myTurn || (!over && xox.suddenDeath && xox.suddenCell != null);
  const secs = Math.max(0, Math.ceil((xox.turnEndsAt - Date.now()) / 1000));
  const headerW = 58;
  // Sabit maliyetler: container padding 6×2 + satır içi 3 gap×6 = 30 (genişlik);
  // sütun başlığı ~54 + dikey 3 gap + padding = 84 (yükseklik). Hücre iki
  // kısıttan KÜÇÜĞÜNE göre seçilir; ilk ölçüm gelene dek pencere genişliği
  // kullanılır (tek karelik yer tutucu).
  // Tahtanın dış çerçevesi (RN border-box: içe doğru yer kaplar) + çerçevenin
  // ekran kenarına yapışmaması için sol/sağ nefes payı. İkisi de genişlik
  // hesabına katılır ki sağ/sol kenar KIRPILMASIN, çizgi tam kapansın.
  const boardBorder = 2;
  const boardMargin = 4;
  const gridMaxW = Math.min((boardBox.w || win.width - 32), 430);
  // Yatay sabit maliyet: padding 6×2=12 + satır-içi 3 gap×6=18 + çerçeve 2×boardBorder + kenar 2×boardMargin.
  const widthCell = Math.floor((gridMaxW - headerW - 30 - boardBorder * 2 - boardMargin * 2) / 3);
  // SABİT TAHTA (kullanıcı isteği 2026-08-28): yükseklik bütçesi, cevap paneli/klavye
  // açılınca DARALAN ölçülen alandan (boardBox.h) DEĞİL, SABİT ekran yüksekliğinden
  // türetilir → hücre seçip cevap yazarken tahta KÜÇÜLMEZ/BÜYÜMEZ, her zaman aynı.
  // Bütçe, klavye + cevap paneli açıkken de sığacak şekilde ekranın ~%40'ı ayrılır.
  const heightCell = Math.floor((win.height * 0.34 - 84 - boardBorder * 2) / 3);
  const cellSize = Math.max(40, Math.min(widthCell, heightCell, 122));
  const gridW = headerW + cellSize * 3 + 30 + boardBorder * 2; // padding+gap+çerçeve; floor artığı sızmasın
  const winLine = over?.line ?? null;
  const submit = () => {
    const text = guessRef.current.trim();
    if (!text || selCell == null) return;
    dismissActiveInput();
    actions.xoxSubmit(selCell, text);
    guessRef.current = '';
    setGuessText('');
  };
  const la = xox.lastAction;
  const laText = la
    ? la.kind === 'claim' ? t('xox.claim', { name: la.byName, player: la.playerName ?? '' })
      : la.kind === 'wrong' ? t('xox.wrong', { name: la.byName })
      : t('xox.timeout')
    : null;
  const leaveKind = state.isQuickMatch ? ('ranked' as const) : ('forfeit' as const);

  // "Kalan boş kutucukları gör": maç bitince BOŞ hücrelere gelecek en popüler
  // ortak oyuncular (sunucudan). Yalnız tuşa basılınca (showEmpties) doldurulur.
  const revealByCell = new Map<number, { playerName: string; playerImageUrl: string | null }>();
  if (over && showEmpties) for (const r of over.emptyReveal ?? []) revealByCell.set(r.cell, r);

  const cellView = (i: number) => {
    const c = xox.cells[i]!;
    const mine = c.owner === youId;
    const isSel = selCell === i;
    const golden = xox.suddenDeath && xox.suddenCell === i;
    const inLine = winLine?.includes(i) ?? false;
    const open = c.owner == null;
    const tappable = !over && open && (myTurn || golden);
    const rv = open ? revealByCell.get(i) : undefined; // boş hücreye açılacak "kim gelirdi"
    const face = c.owner == null
      ? (golden ? withAlpha(theme.gold, 0.22) : theme.well)
      : mine ? withAlpha(theme.primary, 0.26) : withAlpha(theme.danger, 0.24);
    const border = inLine ? theme.gold : isSel ? theme.accent : golden ? theme.gold : c.owner == null ? theme.border : mine ? withAlpha(theme.primary, 0.8) : withAlpha(theme.danger, 0.8);
    return (
      <Pressable
        key={i}
        disabled={!tappable}
        onPress={() => { triggerFeedback(GameFeedbackEvent.UI_CARD); setSelCell(i); }}
        style={({ pressed }) => ({
          width: cellSize, height: cellSize, borderRadius: 14,
          backgroundColor: face, borderWidth: isSel || inLine || golden ? 2.5 : 1.5, borderColor: border,
          alignItems: 'center', justifyContent: 'center', padding: 4,
          opacity: pressed ? 0.85 : rv ? 0.72 : 1, // açılan "kim gelirdi" hücreleri sönük
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      >
        {c.owner == null ? (
          rv ? (
            <>
              {/* Boş kaldı — buraya gelecek EN POPÜLER ortak oyuncu (sönük). */}
              <PlayerPhoto uri={rv.playerImageUrl} size={Math.round(cellSize * 0.42)} />
              <Text numberOfLines={2} style={{ color: theme.muted, fontSize: 8, fontFamily: 'Poppins-Bold', textAlign: 'center', lineHeight: 10, marginTop: 2 }}>{rv.playerName}</Text>
            </>
          )
          : golden ? <Ionicons name="flash" size={26} color={theme.gold} />
          : tappable ? <Ionicons name="add" size={22} color={withAlpha(theme.text, 0.35)} /> : null
        ) : (
          <>
            {/* Doğru bilinen futbolcunun FOTOSU + altında adı (istek 2026-08-27);
                X/O aidiyeti köşe mini-rozetine taşındı. */}
            <PlayerPhoto uri={c.playerImageUrl} size={Math.round(cellSize * 0.46)} />
            <Text numberOfLines={2} style={{ color: theme.text, fontSize: 8.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', lineHeight: 11, marginTop: 2 }}>{c.playerName}</Text>
            <View style={{ position: 'absolute', left: 4, top: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: mine ? withAlpha(theme.primary, 0.24) : withAlpha(theme.danger, 0.24), alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={mine ? 'close' : 'ellipse-outline'} size={11} color={mine ? theme.primary : theme.danger} />
            </View>
          </>
        )}
      </Pressable>
    );
  };

  return (
    <Screen contentCenter={false} bg={<MatchCosmeticBackdrop backgroundId={matchBackgroundIdForState(state)} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <MatchExitButton onPress={() => (state.matchOver ? actions.leave() : setShowLeaveConfirm(true))} />
        <PlayerBar state={state} onEmotePress={() => setEmoteOpen(true)} />
      </View>

      {/* Sıra bandı + sayaç */}
      {!over ? (
        <View style={{ alignItems: 'center', gap: 3, marginBottom: 8 }}>
          {xox.suddenDeath ? (
            <>
              <Text style={{ color: theme.gold, fontSize: 17, fontFamily: 'Poppins-Black', letterSpacing: 1, ...engrave('sm') }}>⚡ {t('xox.suddenTitle')}</Text>
              <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold' }}>{t('xox.suddenBody')}</Text>
            </>
          ) : (
            <Text style={{ color: myTurn ? theme.primary : theme.muted, fontSize: 16, fontFamily: 'Poppins-Black', letterSpacing: 0.8, ...engrave('sm') }}>
              {myTurn ? t('xox.yourTurn') : t('xox.oppTurn', { name: opp?.name ?? '' })}
            </Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: secs <= 5 ? theme.danger : theme.text, fontSize: 19, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{secs}</Text>
            <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold' }}>{t('xox.turnOf', { n: String(Math.min(xox.turnNumber, xox.turnCap)), cap: String(xox.turnCap) })}</Text>
          </View>
        </View>
      ) : null}

      {/* Tahta — esnek orta bölge: kalan alanı ölçer, tahta ona sığar */}
      <View style={{ flex: 1, minHeight: 0, justifyContent: 'flex-start' }} onLayout={(e) => { const { width: bw, height: bh } = e.nativeEvent.layout; setBoardBox((prev) => (Math.abs(prev.w - bw) > 1 || Math.abs(prev.h - bh) > 1 ? { w: bw, h: bh } : prev)); }}>
      <View style={{ alignSelf: 'center', width: gridW, marginHorizontal: boardMargin, backgroundColor: withAlpha(theme.surface2, 0.85), borderRadius: 20, borderWidth: boardBorder, borderColor: withAlpha(theme.primary, 0.45), padding: 6, gap: 6, shadowColor: theme.primary, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
          <View style={{ width: headerW }} />
          {/* key=index: özel eksenlerin id'si 0 (sentinel) → id ile çakışır. */}
          {xox.cols.map((c, ci) => <XoxHeaderChip key={ci} club={c} size={cellSize} />)}
        </View>
        <View style={{ gap: 6 }}>
          {[0, 1, 2].map((r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={{ width: headerW, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                {/* Özel: ülke→bayrak, TD→foto, kupa/BDOR→görsel, combo→birleşik logo, mevki→BÜYÜK harf, lig→logo. */}
                {xox.rows[r]!.kind === 'trophy' || xox.rows[r]!.kind === 'bdor' ? (
                  <Image source={xox.rows[r]!.kind === 'bdor' ? TROPHY_IMG.BDOR! : (TROPHY_IMG[xox.rows[r]!.trophy ?? 'CL'] ?? TROPHY_IMG.CL!)} style={{ width: headerW * 0.9, height: 48 }} resizeMode="contain" />
                ) : xox.rows[r]!.kind === 'combo' ? (
                  <Image source={COMBO_IMG[xox.rows[r]!.combo ?? 'BARCA_REAL'] ?? COMBO_IMG.BARCA_REAL!} style={{ width: 46, height: 46 }} resizeMode="contain" />
                ) : xox.rows[r]!.kind === 'position' ? (
                  <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 12, lineHeight: 13, fontFamily: 'Poppins-Black', color: theme.gold, textAlign: 'center', maxWidth: headerW }}>{xox.rows[r]!.name}</Text>
                ) : (
                  <>
                    {xox.rows[r]!.kind === 'country'
                      ? <Text style={{ fontSize: 30, lineHeight: 34, textAlign: 'center' }}>{xox.rows[r]!.flag ?? '🏳️'}</Text>
                      : xox.rows[r]!.kind === 'manager'
                        ? <PlayerPhoto uri={xox.rows[r]!.logoUrl} size={34} />
                        : <ClubBadge name={xox.rows[r]!.name} size={34} logoUrl={xox.rows[r]!.logoUrl} />}
                    <Text numberOfLines={2} style={{ color: theme.text, fontSize: 8, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>{xox.rows[r]!.name}</Text>
                  </>
                )}
              </View>
              {[0, 1, 2].map((c) => cellView(r * 3 + c))}
            </View>
          ))}
          {winLine ? (() => {
            // Hücre merkezi (satır bölgesi koordinatında): x = başlık + boşluk +
            // sütun*(hücre+6) + hücre/2; y = satır*(hücre+6) + hücre/2.
            const cx = (i: number) => headerW + 6 + (i % 3) * (cellSize + 6) + cellSize / 2;
            const cy = (i: number) => Math.floor(i / 3) * (cellSize + 6) + cellSize / 2;
            const x1 = cx(winLine[0]!), y1 = cy(winLine[0]!), x2 = cx(winLine[2]!), y2 = cy(winLine[2]!);
            const len = Math.hypot(x2 - x1, y2 - y1) + cellSize * 0.55;
            const ang = Math.atan2(y2 - y1, x2 - x1);
            return (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute', left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - 4,
                  width: len, height: 8, borderRadius: 4, backgroundColor: theme.gold,
                  shadowColor: theme.gold, shadowOpacity: 0.85, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 8,
                  transform: [{ rotate: `${ang}rad` }, { scaleX: strikeAnim }],
                }}
              />
            );
          })() : null}
        </View>
      </View>
      {/* Son aksiyon satırı ("... yanlış bildi" vb.) — tablonun HEMEN altında
          (istek 2026-08-28): esnek tahta bölgesinin İÇİNDE, board'dan hemen sonra
          render edilir. Böylece flex:1 bölgesi onu ekranın en dibine itmez; mesaj
          tahtanın hemen altında görünür, board yerinden oynamaz (flex-start). */}
      {laText && !over ? (
        <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginTop: 8 }}>{laText}</Text>
      ) : null}
      </View>

      {/* Cevap paneli */}
      {!over && canAnswer && selCell != null && xox.cells[selCell]!.owner == null ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>
            {xox.rows[Math.floor(selCell / 3)]!.name}  ×  {xox.cols[selCell % 3]!.name}
          </Text>
          <GameInput
            placeholder={t('guess.placeholder')}
            value={guessText}
            onChangeText={(v: string) => { guessRef.current = v; setGuessText(v); }}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Btn label={t('guess.send')} icon="send" feedback={GameFeedbackEvent.ANSWER_SUBMIT} onPress={submit} disabled={!guessText.trim()} />
        </View>
      ) : !over && myTurn ? (
        <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginTop: 10 }}>{t('xox.pickCellHint')}</Text>
      ) : null}

      {/* Maç sonu paneli */}
      {over ? (
        <View style={{ alignItems: 'center', gap: 10, marginTop: 14 }}>
          <Text style={{ color: over.winnerId === youId ? theme.primary : over.winnerId == null ? theme.gold : theme.danger, fontSize: 26, fontFamily: 'Poppins-Black', letterSpacing: 1, ...engrave('lg') }}>
            {over.winnerId === youId ? t('xox.youWon') : over.winnerId == null ? t('xox.draw') : t('xox.youLost')}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold' }}>
            {t(`xox.reason.${over.reason}` as MessageKey)}
          </Text>
          {/* Kalan boş kutucukları gör — basınca boş hücrelere en popüler ortak oyuncu açılır */}
          {over.emptyReveal && over.emptyReveal.length > 0 ? (
            showEmpties ? (
              <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{t('xox.revealEmptyHint')}</Text>
            ) : (
              <Btn label={t('xox.revealEmpty')} kind="ghost" icon="eye" feedback={GameFeedbackEvent.UI_CARD} onPress={() => setShowEmpties(true)} />
            )
          ) : null}
          {state.rematchState === 'incoming' ? (
            <>
              <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold' }}>{t('result.rematchIncoming', { name: state.rematchByName ?? '' })}</Text>
              <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
                <View style={{ flex: 1 }}><Btn label={t('result.accept')} kind="accent" icon="checkmark-circle" onPress={actions.acceptRematch} /></View>
                <View style={{ flex: 1 }}><Btn label={t('result.decline')} kind="ghost" icon="close" onPress={actions.declineRematch} /></View>
              </View>
            </>
          ) : state.rematchState === 'waiting' ? (
            <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>{t('result.rematchWaiting')}</Text>
          ) : (
            <Btn big label={t('result.playAgain')} kind="accent" icon="refresh" feedback={GameFeedbackEvent.UI_PLAY} onPress={actions.playAgain} />
          )}
          <Btn label={t('result.leave')} kind="ghost" icon="home" onPress={actions.leave} />
        </View>
      ) : null}

      <View style={{ height: 8 }} />
      <LeaveConfirmModal visible={showLeaveConfirm} kind={leaveKind} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
      <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} />
    </Screen>
  );
}

// ── GERÇEK futbol sahası çizgileri (TÜM maç ekranlarının ortak arka planı) ────
// Kullanıcı isteği (2026-08-31): tüm modlarda + geri sayımda arka plandaki "kötü
// çizgiler" gerçek saha çizgileri olsun — SADECE çizgiler; renk/gradient/hiçbir şey
// değişmez. Dikey (portre) saha; viewBox 0 0 100 190. Renk çağırandan gelir
// (`look.line` korunur), böylece her kozmetik arka planın kendi çizgi rengi kalır.
function PitchMarkings({ color, strokeWidth = 0.6 }: { color: string; strokeWidth?: number }) {
  return (
    <>
      <G stroke={color} strokeWidth={strokeWidth} fill="none">
        <Rect x="10" y="9" width="80" height="172" rx="1.2" />
        <Line x1="10" y1="95" x2="90" y2="95" />
        <Circle cx="50" cy="95" r="13" />
        {/* üst ceza + kale sahası, penaltı yayı */}
        <Rect x="28" y="9" width="44" height="24" />
        <Rect x="39" y="9" width="22" height="9" />
        <Path d="M 39.75 33 A 13 13 0 0 0 60.25 33" />
        {/* alt ceza + kale sahası, penaltı yayı */}
        <Rect x="28" y="157" width="44" height="24" />
        <Rect x="39" y="172" width="22" height="9" />
        <Path d="M 39.75 157 A 13 13 0 0 1 60.25 157" />
        {/* köşe yayları */}
        <Path d="M 12.2 9 A 2.2 2.2 0 0 1 10 11.2" />
        <Path d="M 90 11.2 A 2.2 2.2 0 0 1 87.8 9" />
        <Path d="M 10 178.8 A 2.2 2.2 0 0 1 12.2 181" />
        <Path d="M 87.8 181 A 2.2 2.2 0 0 1 90 178.8" />
      </G>
      <Circle cx="50" cy="95" r="1" fill={color} />
      <Circle cx="50" cy="25" r="1" fill={color} />
      <Circle cx="50" cy="165" r="1" fill={color} />
    </>
  );
}

/** Şeffaf arka plan üstüne saha çizgileri — mevcut gradient Svg'sinin ÜSTÜNE binen ayrı katman. */
function PitchLines({ color, strokeWidth = 0.6 }: { color: string; strokeWidth?: number }) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox="0 0 100 190" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <PitchMarkings color={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

// ── ÇÖZ KAZAN — gerçek futbol sahası arka planı (gece maçı, premium) ──────────
// Kullanıcı isteği (2026-08-31): "gerçekten bir futbol sahası çizgileri olsun".
// Dikey (portre) saha: kale çizgileri üst/alt, orta saha ortada. Koyu çim +
// biçme şeritleri + projektör parıltısı + vinyet; beyaz çizgiler doğru geometride.
function CozKazanPitch() {
  const insets = useSafeAreaInsets();
  const bleed = { position: 'absolute' as const, left: 0, right: 0, top: -insets.top, bottom: -insets.bottom };
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const L = 'rgba(233,240,255,0.52)';   // saha çizgisi
  const stripes = Array.from({ length: 10 }, (_, i) => 9 + i * 17.4); // biçme şeritleri y başları
  return (
    <View pointerEvents="none" style={bleed}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox="0 0 100 190" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <SvgGradient id="cozGrass" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#123B26" />
            <Stop offset="0.5" stopColor="#0E3320" />
            <Stop offset="1" stopColor="#081E13" />
          </SvgGradient>
          <RadialGradient id="cozFlood" cx="50%" cy="4%" rx="70%" ry="46%">
            <Stop offset="0" stopColor="#EAF7EE" stopOpacity="0.20" />
            <Stop offset="1" stopColor="#EAF7EE" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="cozVignette" cx="50%" cy="46%" rx="75%" ry="62%">
            <Stop offset="0.52" stopColor="#03100A" stopOpacity="0" />
            <Stop offset="1" stopColor="#020B07" stopOpacity="0.82" />
          </RadialGradient>
        </Defs>
        {/* çim + biçme şeritleri */}
        <Rect x="0" y="0" width="100" height="190" fill="url(#cozGrass)" />
        {stripes.map((y, i) => (
          <Rect key={i} x="0" y={y} width="100" height="8.7" fill={i % 2 === 0 ? '#FFFFFF' : '#02110A'} opacity={i % 2 === 0 ? 0.028 : 0.10} />
        ))}
        {/* ── saha işaretleri (ortak geometri) ── */}
        <PitchMarkings color={L} strokeWidth={0.6} />
        {/* projektör + vinyet */}
        <Rect x="0" y="0" width="100" height="190" fill="url(#cozFlood)" />
        <Rect x="0" y="0" width="100" height="190" fill="url(#cozVignette)" />
      </Svg>
      {/* çok yavaş projektör nefesi — sahne canlı hissi */}
      <Animated.View style={{ position: 'absolute', left: -40, right: -40, top: -insets.top, height: SCREEN_H * 0.42, backgroundColor: 'rgba(150,220,180,0.10)', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.16] }) }} />
    </View>
  );
}

// Premium fiziksel harf kutucuğu — SAYDAM DEĞİL (kullanıcı isteği 2026-08-31):
// fildişi cam yüz + koyu lacivert harf + 3B alt dudak + parıltı + gölge.
function LetterTile({ ch, size }: { ch: string; size: number }) {
  const r = Math.max(6, Math.round(size * 0.2));
  const lip = Math.max(2, Math.round(size * 0.09));
  return (
    <View style={{ width: size, height: size + lip, borderRadius: r + 1.5, backgroundColor: '#9AA6C0', shadowColor: '#040A18', shadowOpacity: 0.5, shadowRadius: 7, shadowOffset: { width: 0, height: 5 }, elevation: 6 }}>
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: '#EEF2FB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* üst cam parıltısı */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.5, backgroundColor: 'rgba(255,255,255,0.85)' }} />
        {/* alt hafif gölge (hacim) */}
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: size * 0.34, backgroundColor: 'rgba(120,135,175,0.18)' }} />
        <Text style={{ color: '#0C1E44', fontSize: Math.round(size * 0.54), fontFamily: 'Poppins-Black', includeFontPadding: false, textAlign: 'center', marginTop: -size * 0.015 }}>{ch}</Text>
      </View>
    </View>
  );
}

// Karışık harfler — her kelime kendi satırında, ipucu vermeden (premium kutucuklar).
function ScrambleTiles({ words, tileSize }: { words: string[]; tileSize: number }) {
  const gap = Math.max(4, Math.round(tileSize * 0.16));
  return (
    <View style={{ alignItems: 'center', gap: Math.max(8, Math.round(tileSize * 0.3)) }}>
      {words.map((word, wi) => (
        <View key={wi} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap }}>
          {[...word].map((ch, ci) => <LetterTile key={ci} ch={ch} size={tileSize} />)}
        </View>
      ))}
    </View>
  );
}

/** Kelime dizisine göre kutucuk boyutu — en uzun kelime ekrana sığsın (gap dahil). */
function scrambleTileSize(words: string[], winWidth: number, cap = 52): number {
  const maxLen = Math.max(1, ...words.map((w) => [...w].length));
  return Math.max(24, Math.min(cap, Math.floor((winWidth - 44) / (Math.min(maxLen, 9) * 1.17))));
}

const COZ_HINT_COST = 5; // "harf alma" — sunucudaki COZ_HINT_COST ile aynı

/** Cevap kutucuğu: boş (çerçeve), yazılmış (fildişi) ya da ipucu-açık (altın, kilitli). */
function AnswerBox({ ch, hint, size }: { ch: string; hint: boolean; size: number }) {
  const r = Math.max(5, Math.round(size * 0.2));
  if (!ch) {
    return <View style={{ width: size, height: size, borderRadius: r, borderWidth: 2, borderColor: 'rgba(255,255,255,0.26)', backgroundColor: 'rgba(6,14,30,0.4)' }} />;
  }
  const face = hint ? '#FFE7A0' : '#EEF2FB';
  const ink = hint ? '#5A3D00' : '#0C1E44';
  const lip = hint ? '#C79A2E' : '#9AA6C0';
  const drop = Math.max(2, Math.round(size * 0.08));
  return (
    <View style={{ width: size, height: size + drop, borderRadius: r + 1.5, backgroundColor: lip, shadowColor: '#040A18', shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 5 }}>
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: face, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.5, backgroundColor: 'rgba(255,255,255,0.7)' }} />
        <Text style={{ color: ink, fontSize: Math.round(size * 0.54), fontFamily: 'Poppins-Black', includeFontPadding: false }}>{ch}</Text>
      </View>
    </View>
  );
}

/** "Harf Al" baloncuğu — yuvarlak, parlayan, dikkat çeken premium güç orbu.
 * Kullanıcı isteği (2026-08-31): "insanların ona ihtiyacı olduğunu düşündürsün".
 * Sürekli nabız + altın hale + kıvılcım → gözden kaçmaz, cazip. */
function CozHintBubble({ cost, disabled, onPress }: { cost: number; disabled: boolean; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (disabled) { pulse.stopAnimation(); spark.stopAnimation(); return undefined; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const s = Animated.loop(Animated.sequence([
      Animated.timing(spark, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(400),
    ]));
    a.start(); s.start();
    return () => { a.stop(); s.stop(); };
  }, [disabled, pulse, spark]);
  const D = 50;
  return (
    <Pressable onPress={() => { if (!disabled) { triggerFeedback(GameFeedbackEvent.UI_CARD); onPress(); } }} disabled={disabled} style={{ alignItems: 'center' }}>
      {/* parlayan hale */}
      {!disabled ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', width: D + 30, height: D + 30, borderRadius: (D + 30) / 2, top: -15, backgroundColor: withAlpha(theme.gold, 0.4), opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.6] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.18] }) }] }} />
      ) : null}
      {/* orb */}
      <Animated.View style={{ width: D, height: D, borderRadius: D / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? 'rgba(120,110,60,0.32)' : theme.gold, borderWidth: 2.5, borderColor: disabled ? 'rgba(255,255,255,0.14)' : '#FFF3C0', transform: [{ scale: disabled ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }], shadowColor: theme.gold, shadowOpacity: disabled ? 0 : 0.75, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 9 }}>
        <Ionicons name="bulb" size={22} color={disabled ? theme.muted : theme.onAccent} />
        {/* kıvılcım */}
        {!disabled ? (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 6, right: 8, opacity: spark.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }), transform: [{ scale: spark.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }) }] }}>
            <Ionicons name="sparkles" size={13} color="#FFFFFF" />
          </Animated.View>
        ) : null}
      </Animated.View>
      {/* maliyet rozeti */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: -9, backgroundColor: '#0B1838', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1.5, borderColor: disabled ? 'rgba(255,255,255,0.14)' : '#FFF3C0' }}>
        <Text style={{ color: disabled ? theme.muted : theme.gold, fontFamily: 'Poppins-Black', fontSize: 12 }}>{cost}</Text>
        <GemIcon size={11} />
      </View>
      <Text style={{ color: disabled ? theme.muted : theme.gold, fontFamily: 'Poppins-ExtraBold', fontSize: 10.5, marginTop: 3, letterSpacing: 0.3, ...engrave('sm') }}>{t('coz.hintBtn')}</Text>
    </Pressable>
  );
}

const COZ_ROUND_SECS = 20; // sunucu COZ_ROUND_MS ile aynı (halka görsel dolgusu için)

/** Dairesel geri sayım halkası — premium, 5sn altında kırmızı. */
function CozTimer({ secs }: { secs: number }) {
  const size = 56, sw = 4.5, r = (size - sw) / 2, C = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, secs / COZ_ROUND_SECS));
  const danger = secs <= 5;
  const col = danger ? theme.danger : theme.primary;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: '-90deg' }] }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={sw} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - frac)} />
        </Svg>
      </View>
      <Text style={{ color: danger ? theme.danger : theme.text, fontSize: 21, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{secs}</Text>
    </View>
  );
}

/** Skor rozeti — kendi (emerald) / rakip (nötr), koyu cam panel. */
function CozScoreChip({ name, score, mine }: { name: string; score: number; mine?: boolean }) {
  const tint = mine ? theme.primary : theme.textSub;
  return (
    <View style={{ flex: 1, maxWidth: 150, alignItems: 'center', backgroundColor: 'rgba(6,14,30,0.55)', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: mine ? withAlpha(theme.primary, 0.5) : 'rgba(255,255,255,0.10)', ...shadowSoft }}>
      <Text numberOfLines={1} style={{ color: tint, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold', maxWidth: 130 }}>{name}</Text>
      <Text style={{ color: mine ? theme.primary : theme.text, fontSize: 26, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{score}</Text>
    </View>
  );
}

// ── ÇÖZ KAZAN ekranı — karışık harfli oyuncuyu ilk bilen kazanır (yarış) ──────
export function CozKazanScreen({ state, actions }: Props) {
  const c = state.cozkazan;
  const room = state.room;
  const youId = room?.youId ?? '';
  const opp = room?.players.find((p) => p.id !== youId);
  const over = state.cozkazanOver;
  const guessRef = useRef('');
  const [guessText, setGuessText] = useState('');           // kutulara YAZILAN harfler (ipucu hariç)
  const [hintMap, setHintMap] = useState<Record<number, string>>({}); // flat poz → açılan doğru harf
  const [hintErr, setHintErr] = useState<string | null>(null);
  const answerInputRef = useRef<TextInput>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [, setTick] = useState(0);
  const win = useWindow();

  useEffect(() => { if (over) return undefined; const id = setInterval(() => setTick((v) => v + 1), 300); return () => clearInterval(id); }, [over]);
  // Yeni turda giriş + ipuçları temizlenir
  const lastRound = useRef(-1);
  useEffect(() => {
    if (!c) return;
    if (c.round !== lastRound.current) { lastRound.current = c.round; guessRef.current = ''; setGuessText(''); setHintMap({}); setHintErr(null); }
  }, [c?.round]);
  // "Harf alma" sonucu geldiğinde doğru harfi doğru kutuya yerleştir (tur uyuşuyorsa)
  const hintSeq = useRef(0);
  useEffect(() => {
    const h = state.cozHint;
    if (!h || h.seq === hintSeq.current) return;
    hintSeq.current = h.seq;
    if (c && h.round === c.round) { setHintMap((m) => ({ ...m, [h.position]: h.letter })); triggerFeedback(GameFeedbackEvent.UI_CONFIRM); }
  }, [state.cozHint, c?.round]);
  // Harf alma hatası (yetersiz elmas / şu an olmaz) — kısa uyarı
  const hintErrSeq = useRef(0);
  useEffect(() => {
    const e = state.cozHintError;
    if (!e || e.seq === hintErrSeq.current) return;
    hintErrSeq.current = e.seq;
    setHintErr(e.reason === 'insufficient' ? t('coz.hintInsufficient') : t('coz.hintUnavailable'));
    const id = setTimeout(() => setHintErr(null), 2600);
    return () => clearTimeout(id);
  }, [state.cozHintError]);
  // Tur açılışında (reveal) ses/haptik
  const revealSeq = useRef('');
  useEffect(() => {
    const rv = c?.reveal; if (!rv || !c) return;
    const key = String(c.round);
    if (key === revealSeq.current) return;
    revealSeq.current = key;
    if (rv.solvedById) triggerFeedback(rv.solvedById === youId ? GameFeedbackEvent.ANSWER_CORRECT : GameFeedbackEvent.OPPONENT_CORRECT);
    else triggerFeedback(GameFeedbackEvent.NOTIFICATION);
  }, [c?.reveal, c?.round, youId]);
  const overPlayed = useRef(false);
  useEffect(() => {
    if (!over || overPlayed.current) return;
    overPlayed.current = true;
    triggerFeedback(over.winnerId === youId ? GameFeedbackEvent.MATCH_WIN : over.winnerId == null ? GameFeedbackEvent.MATCH_DRAW : GameFeedbackEvent.MATCH_LOSE);
  }, [over, youId]);
  useEffect(() => { if (!over) overPlayed.current = false; }, [over]);

  if (!c || !room) return <Screen><Text style={styles.muted}>{t('store.loading')}</Text></Screen>;

  const now = Date.now();
  const myLock = c.locks.find((l) => l.id === youId);
  const lockedSecs = myLock ? Math.max(0, Math.ceil((myLock.until - now) / 1000)) : 0;
  const locked = lockedSecs > 0;
  const secs = Math.max(0, Math.ceil((c.roundEndsAt - now) / 1000));
  const reveal = c.reveal;
  const inReveal = !!reveal;
  const isSudden = c.round > c.totalRounds;
  const myScore = c.scores.find((s) => s.id === youId)?.score ?? 0;
  const oppScore = c.scores.find((s) => s.id === opp?.id)?.score ?? 0;
  const leaveKind = state.isQuickMatch ? ('ranked' as const) : ('forfeit' as const);
  const tileSize = scrambleTileSize(c.scrambled, win.width, 54);
  const boxSize = Math.min(tileSize, 46);

  // ── Cevap kutucukları: kelime uzunlukları scrambled ile aynı; yazılan harfler
  // ipucu-OLMAYAN kutuları soldan sağa doldurur, ipuçları kendi pozisyonunda sabit.
  const wordLens = c.scrambled.map((w) => [...w].length);
  const totalSlots = wordLens.reduce((a, b) => a + b, 0);
  const hintCount = Object.keys(hintMap).length;
  const typedCap = Math.max(0, totalSlots - hintCount);
  const boxContents: { letter: string; hint: boolean }[] = (() => {
    const typedChars = [...guessText];
    let cursor = 0;
    const out: { letter: string; hint: boolean }[] = [];
    for (let pos = 0; pos < totalSlots; pos++) {
      if (hintMap[pos] !== undefined) out.push({ letter: hintMap[pos]!, hint: true });
      else { out.push({ letter: typedChars[cursor] ?? '', hint: false }); cursor++; }
    }
    return out;
  })();
  const allFilled = totalSlots > 0 && boxContents.every((b) => b.letter !== '');
  const diamonds = state.profile?.diamonds ?? 0;
  const allHinted = hintCount >= totalSlots;
  const hintDisabled = !!over || inReveal || allHinted || diamonds < COZ_HINT_COST;

  const onType = (v: string) => {
    const cleaned = v.replace(/\s+/g, '').slice(0, typedCap);
    guessRef.current = cleaned; setGuessText(cleaned);
  };
  const assembleAnswer = (): string => {
    let idx = 0; const words: string[] = [];
    for (const wlen of wordLens) { let w = ''; for (let j = 0; j < wlen; j++) { w += boxContents[idx]?.letter ?? ''; idx++; } words.push(w); }
    return words.join(' ');
  };
  const submit = () => {
    const text = assembleAnswer().trim();
    if (!text || inReveal || locked || over) return;
    actions.cozkazanSubmit(text);
    guessRef.current = ''; setGuessText(''); // ipuçları kalır; yanlışsa 5sn kilit sunucudan gelir
  };

  return (
    <Screen contentCenter={false} bg={<CozKazanPitch />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <MatchExitButton onPress={() => (state.matchOver ? actions.leave() : setShowLeaveConfirm(true))} />
        <PlayerBar state={state} onEmotePress={() => setEmoteOpen(true)} />
      </View>

      {!over ? (
        <View style={{ alignItems: 'center', gap: 10, marginBottom: 4 }}>
          {/* Tur rozeti (ani-ölümde altın) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isSudden ? withAlpha(theme.gold, 0.18) : 'rgba(6,14,30,0.6)', borderColor: isSudden ? withAlpha(theme.gold, 0.6) : 'rgba(255,255,255,0.12)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4.5, ...shadowRow }}>
            <Text style={{ color: isSudden ? theme.gold : theme.textSub, fontSize: 12.5, fontFamily: 'Poppins-Black', letterSpacing: 1.1 }}>
              {isSudden ? `⚡ ${t('coz.sudden').toLocaleUpperCase('tr')}` : t('coz.round', { n: String(c.round), cap: String(c.totalRounds) }).toLocaleUpperCase('tr')}
            </Text>
          </View>
          {/* Skor: sen — geri sayım halkası — rakip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
            <CozScoreChip name={t('coz.you')} score={myScore} mine />
            <View style={{ width: 56, alignItems: 'center' }}>
              {!inReveal ? <CozTimer secs={secs} /> : <Text style={{ color: theme.muted, fontSize: 24, fontFamily: 'Poppins-Black' }}>–</Text>}
            </View>
            <CozScoreChip name={opp?.name ?? '—'} score={oppScore} />
          </View>
        </View>
      ) : null}

      {/* Orta bölge: karışık harfler ya da tur açılışı */}
      <View style={{ flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        {reveal ? (() => {
          const solveCol = reveal.solvedById === youId ? theme.primary : reveal.solvedById ? theme.danger : theme.gold;
          return (
            <View style={{ alignItems: 'center', gap: 12, backgroundColor: 'rgba(6,14,30,0.7)', borderRadius: 24, paddingVertical: 20, paddingHorizontal: 22, borderWidth: 1, borderColor: withAlpha(solveCol, 0.4), alignSelf: 'stretch', marginHorizontal: 6, ...shadowRaised }}>
              <View style={{ padding: 4, borderRadius: 999, borderWidth: 3, borderColor: solveCol, backgroundColor: withAlpha(solveCol, 0.12) }}>
                <PlayerPhoto uri={reveal.playerImageUrl} size={104} />
              </View>
              <Text style={{ color: theme.text, fontSize: 23, fontFamily: 'Poppins-Black', textAlign: 'center', ...engrave('sm') }}>{reveal.playerName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: withAlpha(theme.gold, 0.16), borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: withAlpha(theme.gold, 0.4) }}>
                <Ionicons name="checkmark-circle" size={16} color={theme.gold} />
                <Text style={{ color: theme.gold, fontSize: 16, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.3 }}>{reveal.answer}</Text>
              </View>
              <Text style={{ color: solveCol, fontSize: 13, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>
                {reveal.solvedById ? (reveal.solvedById === youId ? t('coz.youSolved') : t('coz.oppSolved', { name: reveal.solvedByName ?? '' })) : t('coz.nobody')}
              </Text>
            </View>
          );
        })() : (
          <View style={{ alignItems: 'center', gap: 18 }}>
            <ScrambleTiles words={c.scrambled} tileSize={tileSize} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(6,14,30,0.5)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Ionicons name="shuffle" size={13} color={theme.textSub} />
              <Text style={{ color: theme.textSub, fontSize: 12, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{t('coz.prompt')}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Cevap kutucukları + yazım + harf alma (yarış) */}
      {!over && !inReveal ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          {locked ? <Text style={{ color: theme.danger, fontSize: 13, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>⏳ {t('coz.locked', { s: String(lockedSecs) })}</Text> : null}
          {hintErr ? <Text style={{ color: theme.gold, fontSize: 12.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>{hintErr}</Text> : null}
          {/* Kutucuklar — dokun, klavye açılır */}
          <Pressable onPress={() => answerInputRef.current?.focus()}>
            <View style={{ alignItems: 'center', gap: Math.max(6, Math.round(boxSize * 0.22)) }}>
              {wordLens.map((wlen, wi) => {
                const off = wordLens.slice(0, wi).reduce((a, b) => a + b, 0);
                return (
                  <View key={wi} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Math.max(4, Math.round(boxSize * 0.14)) }}>
                    {Array.from({ length: wlen }).map((_, j) => { const b = boxContents[off + j]!; return <AnswerBox key={j} ch={b.letter} hint={b.hint} size={boxSize} />; })}
                  </View>
                );
              })}
            </View>
          </Pressable>
          {/* Gizli metin girişi — kutuları besler (Türkçe harfler cihaz klavyesinden) */}
          <TextInput
            ref={answerInputRef}
            value={guessText}
            onChangeText={onType}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="send"
            onSubmitEditing={submit}
            editable={!locked}
            style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
          />
          {/* Sadece GÖNDER — ortalanmış (kullanıcı isteği 2026-08-31) */}
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: '64%', minWidth: 200 }}>
              <Btn label={t('guess.send')} icon="send" feedback={GameFeedbackEvent.ANSWER_SUBMIT} onPress={submit} disabled={locked || !allFilled} />
            </View>
          </View>
          {/* Harf Al — sağda yüzer; kutuların TAMAMEN ÜSTÜNDE (satır sayısından
              bağımsız, üste sabit → kutucukların üstüne binmez) */}
          <View pointerEvents="box-none" style={{ position: 'absolute', right: 6, top: -104, zIndex: 30 }}>
            <CozHintBubble cost={COZ_HINT_COST} disabled={hintDisabled} onPress={actions.cozkazanHint} />
          </View>
        </View>
      ) : null}

      {/* Maç sonu */}
      {over ? (
        <View style={{ alignItems: 'center', gap: 10, marginTop: 14 }}>
          <Text style={{ color: over.winnerId === youId ? theme.primary : over.winnerId == null ? theme.gold : theme.danger, fontSize: 26, fontFamily: 'Poppins-Black', letterSpacing: 1, ...engrave('lg') }}>
            {over.winnerId === youId ? t('xox.youWon') : over.winnerId == null ? t('xox.draw') : t('xox.youLost')}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 15, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{myScore} – {oppScore}</Text>
          {state.rematchState === 'incoming' ? (
            <>
              <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold' }}>{t('result.rematchIncoming', { name: state.rematchByName ?? '' })}</Text>
              <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
                <View style={{ flex: 1 }}><Btn label={t('result.accept')} kind="accent" icon="checkmark-circle" onPress={actions.acceptRematch} /></View>
                <View style={{ flex: 1 }}><Btn label={t('result.decline')} kind="ghost" icon="close" onPress={actions.declineRematch} /></View>
              </View>
            </>
          ) : state.rematchState === 'waiting' ? (
            <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>{t('result.rematchWaiting')}</Text>
          ) : (
            <Btn big label={t('result.playAgain')} kind="accent" icon="refresh" feedback={GameFeedbackEvent.UI_PLAY} onPress={actions.playAgain} />
          )}
          <Btn label={t('result.leave')} kind="ghost" icon="home" onPress={actions.leave} />
        </View>
      ) : null}

      <View style={{ height: 8 }} />
      <LeaveConfirmModal visible={showLeaveConfirm} kind={leaveKind} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
      <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} />
    </Screen>
  );
}

export function GuessScreen({ state, actions, tutorial, prefill }: Props & { prefill?: string }) {
  // Tutorial: the answer arrives PRE-FILLED and locked — the player only taps
  // Send. `prefill` overrides the tutorial's real name: DevShot marketing
  // captures must show the FICTIONAL player (4.1 — real names in store
  // screenshots were cited in the v1.0 rejection), while the in-app tutorial
  // keeps Sneijder.
  const guessTextRef = useRef(prefill ?? (tutorial ? 'Wesley Sneijder' : ''));
  const teams = state.teams;
  const room = state.room!;
  const youAnswered = state.locked?.byId === room.youId;
  const someoneElseAnswered = state.locked && state.locked.byId !== room.youId;
  const youPassed = state.passedBy.includes(room.youId);
  const oppPassed = state.passedBy.some((id) => id !== room.youId);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  // wrongretry cezası: ilk yanlıştan sonra youRetryAt'e kadar input kilitli,
  // saniye sayacı akar; süre dolunca "son hakkın" ipucuyla input yeniden açılır.
  // Tik YALNIZ ceza penceresi boyunca çalışır (kendini söndüren interval).
  const retryAt = state.youRetryAt;
  const [, setRetryTick] = useState(0);
  useEffect(() => {
    if (!retryAt || Date.now() >= retryAt) return undefined;
    const id = setInterval(() => {
      setRetryTick((v) => v + 1);
      if (Date.now() >= retryAt) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [retryAt]);
  // Yanlış cevap sonrası 5sn ceza penceresi başlayınca cevap çubuğundaki ESKİ
  // yanlış metni temizle: süre dolup input yeniden açıldığında BOŞ gelir; oyuncu
  // doğruyu bulduysa eski yanlışı silmeden hemen yazar (kullanıcı isteği 2026-08-28).
  // Input cooldown boyunca zaten gizli olduğundan aktif yazmayı bozmaz; controlled
  // GuessControls remount'ta useState(guessTextRef.current='') ile boş başlar.
  useEffect(() => {
    if (retryAt) guessTextRef.current = '';
  }, [retryAt]);
  // ❄ Freeze: sunucu damgasına kadar kendi girişin kilitli (görsel + yerel).
  const frozenUntil = state.spFrozenUntil;
  const [, setFzTick] = useState(0);
  useEffect(() => {
    if (!frozenUntil || Date.now() >= frozenUntil) return undefined;
    const id = setInterval(() => {
      setFzTick((v) => v + 1);
      if (Date.now() >= frozenUntil) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [frozenUntil]);
  const frozen = !!frozenUntil && Date.now() < frozenUntil;
  const coolingDown = !!retryAt && Date.now() < retryAt && !state.youBurned;
  const retrySecs = coolingDown ? Math.max(1, Math.ceil(((retryAt ?? 0) - Date.now()) / 1000)) : 0;
  const onLastChance = !!retryAt && !coolingDown && !state.youBurned; // ikinci hak açık
  // Çarpı HER maçta sorar (kullanıcı kuralı 2026-08-10): botta yalnız "emin
  // misin", derecelide kupa uyarısı, dostlukta kupasız hükmen metni.
  const leaveKind = state.isQuickMatch ? ('ranked' as const) : ('forfeit' as const);
  const handleLeave = () => tutorial ? actions.leave() : setShowLeaveConfirm(true);

  // Reveal animation: teams slide in from the sides, the VS badge pops.
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!teams) return;
    reveal.setValue(0);
    Animated.spring(reveal, { toValue: 1, useNativeDriver: true, friction: 6, tension: 70 }).start();
  }, [teams?.teamA?.id, teams?.teamB?.id]);
  const leftX = reveal.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] });
  const rightX = reveal.interpolate({ inputRange: [0, 1], outputRange: [70, 0] });
  const vsScale = reveal.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });

  // Reveal → guess handoff: the guess block fades in and rises 12px over 200ms.
  const phaseIn = useRef(new Animated.Value(state.phase === 'guess' ? 1 : 0)).current;
  useEffect(() => {
    if (state.phase === 'guess') {
      phaseIn.setValue(0);
      Animated.timing(phaseIn, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  }, [state.phase, phaseIn]);

  return (
    // Top-aligned (not centred): with the keyboard up during the guess phase, centred
    // content pushed the input + Send/Pass buttons down under the keyboard. Anchored to
    // the top they sit in the upper screen, above the keyboard; automaticallyAdjust-
    // KeyboardInsets still scrolls the focused field into view on short screens.
    <Screen scroll contentCenter={false} keyboardShouldPersistTaps="always" bg={<MatchCosmeticBackdrop backgroundId={matchBackgroundIdForState(state)} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <MatchExitButton onPress={handleLeave} />
        <PlayerBar state={state} onEmotePress={tutorial ? undefined : () => setEmoteOpen(true)} />
      </View>
      {/* Özel güç çipleri KENDİ satırında (kullanıcı raporu 2026-08-28: aynı satırda
          PlayerBar'ı sıkıştırıp skoru gizliyordu). SpecialPowerHud güç yoksa null döner. */}
      {!tutorial ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
          <SpecialPowerHud state={state} actions={actions} />
        </View>
      ) : null}
      <View style={styles.teamsRow}>
        <Animated.View style={[styles.teamCard, { transform: [{ translateX: leftX }], opacity: reveal }]}>
          {state.revealMode === 'player-player' ? (
            teams?.teamA.logoUrl ? (
              <CachedImage uri={teams.teamA.logoUrl} style={{ width: 62, height: 62, borderRadius: 31 }} contentFit="cover" />
            ) : (
              <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: badgeColor(teams?.teamA.name ?? '?'), alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={30} color={theme.text} />
              </View>
            )
          ) : state.revealMode === 'country-team' ? (
            /* Flag emoji framed in the ClubBadge white circular chip */
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: theme.text, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <Text style={{ fontSize: 38 }}>{NATIONALITIES.find((n) => n.value === state.revealCountry)?.flag ?? '🏳️'}</Text>
            </View>
          ) : state.revealMode === 'letter-team' ? (
            <Text style={{ color: theme.accent, fontSize: 48, fontFamily: 'Poppins-Black', ...engrave('lg') }}>{teams?.teamA.name ?? '?'}</Text>
          ) : (
            <ClubBadge name={teams?.teamA.name ?? '?'} size={62} logoUrl={teams?.teamA.logoUrl ?? null} />
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {state.revealMode === 'country-team'
              ? NATIONALITIES.find((n) => n.value === state.revealCountry)?.displayName ?? teams?.teamA.name ?? '…'
              : teams?.teamA.name ?? '…'}
          </Text>
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: vsScale }], marginHorizontal: 4 }}>
          <VsBadge size={48} />
        </Animated.View>
        <Animated.View style={[styles.teamCard, { transform: [{ translateX: rightX }], opacity: reveal }]}>
          {state.revealMode === 'player-player' ? (
            teams?.teamB.logoUrl ? (
              <CachedImage uri={teams.teamB.logoUrl} style={{ width: 62, height: 62, borderRadius: 31 }} contentFit="cover" />
            ) : (
              <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: badgeColor(teams?.teamB.name ?? '?'), alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={30} color={theme.text} />
              </View>
            )
          ) : (
            <ClubBadge name={teams?.teamB.name ?? '?'} size={62} logoUrl={teams?.teamB.logoUrl ?? null} />
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {teams?.teamB.name ?? '…'}
          </Text>
        </Animated.View>
      </View>

      {state.phase === 'reveal' ? (
        <Text style={styles.h1}>{t('getReadyWait')}</Text>
      ) : (
        <Animated.View style={{ opacity: phaseIn, transform: [{ translateY: phaseIn.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          <MatchTimer endsAt={state.phase === 'guess' ? state.guessEndsAt : null} urgentAt={5} style={{ marginTop: 8, marginBottom: 4 }} />
          {someoneElseAnswered ? (
            <>
              <GuessStatusPanel
                icon="lock-closed"
                iconColor={theme.danger}
                stripe={theme.danger}
                text={t('guess.locked', { name: state.locked?.byName ?? '' })}
              />
              {state.tooLateSeq > 0 ? (
                <View style={styles.passHint}>
                  <Ionicons name="flash" size={14} color={theme.accent} />
                  <Text style={styles.passHintText}>{t('guess.tooLate', { name: state.locked?.byName ?? '' })}</Text>
                </View>
              ) : null}
            </>
          ) : coolingDown ? (
            <GuessStatusPanel
              icon="hourglass"
              iconColor={theme.accent}
              stripe={theme.accent}
              text={t('guess.retryWait', { secs: String(retrySecs) })}
            />
          ) : state.youBurned ? (
            <GuessStatusPanel
              icon="close-circle"
              iconColor={theme.danger}
              stripe={theme.danger}
              text={t('guess.youBurned')}
            />
          ) : youPassed ? (
            <GuessStatusPanel
              icon="play-skip-forward"
              iconColor={theme.accent}
              stripe={theme.accent}
              text={t('guess.youPassed')}
            />
          ) : (
            <>
              <Text style={styles.h1}>
                {state.revealMode === 'player-player'
                  ? t('guess.titlePlayerPlayer')
                  : state.revealMode === 'country-team' && state.revealCountry && teams?.teamB
                  ? t('guess.titleCountry', { country: NATIONALITIES.find((n) => n.value === state.revealCountry)?.displayName ?? state.revealCountry, team: teams.teamB.name })
                  : state.revealMode === 'letter-team' && state.revealLetter && teams?.teamB
                  ? t('guess.titleLetter', { letter: state.revealLetter, team: teams.teamB.name })
                  : t('guess.title')}
              </Text>
              {oppPassed ? (
                <View style={styles.passHint}>
                  <Ionicons name="play-skip-forward" size={14} color={theme.accent} />
                  <Text style={styles.passHintText}>{t('guess.oppPassed')}</Text>
                </View>
              ) : null}
              {state.oppWrong ? (
                <View style={styles.passHint}>
                  <Ionicons name="close-circle" size={14} color={theme.danger} />
                  <Text style={styles.passHintText}>{t('guess.oppWrong', { name: state.oppWrong.byName })}</Text>
                </View>
              ) : null}
              {onLastChance ? (
                <View style={styles.passHint}>
                  <Ionicons name="flash" size={14} color={theme.accent} />
                  <Text style={styles.passHintText}>{t('guess.retryNow')}</Text>
                </View>
              ) : null}
              {state.spReveal ? <RevealChip name={state.spReveal.playerName} /> : null}
              {frozen && frozenUntil ? (
                <FrozenPanel until={frozenUntil} />
              ) : (
                <GuessControls
                  placeholder={state.revealMode === 'player-player' ? t('guess.placeholderClub') : t('guess.placeholder')}
                  youAnswered={youAnswered}
                  tutorial={tutorial}
                  onSubmit={actions.submitGuess}
                  onPass={actions.pass}
                  textRef={guessTextRef}
                />
              )}
            </>
          )}
        </Animated.View>
      )}
      {/* trailing room so the last button can scroll clear of the keyboard on short screens */}
      <View style={{ height: 32 }} />
      {!tutorial ? <SpecialPowerOverlays state={state} /> : null}
      <LeaveConfirmModal visible={showLeaveConfirm} kind={leaveKind} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
      {!tutorial ? <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} /> : null}
    </Screen>
  );
}

// ---- Diamond Purchase Celebration ----
// Two phases: (1) a centered popup card with the pack image + "+N" and a close X.
// (2) When the user closes it, gems fly from the card up into the top-right gem
// counter, then the overlay dismisses. Triggered after a successful IAP.
const GEM_COUNT = 10; // number of flying gem particles
// Radial directions for the one-shot 6-gem reveal spark (≤7 particles — FX restraint).
const SPARK_DIRS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
  return { x: Math.cos(a) * 86, y: Math.sin(a) * 70 };
});

// ---- Maç sonrası kupa uçuşu — elmas kutlamasının kardeşi (spec §14: ≤7 parça) ----
// Modal DEĞİL, hafif overlay: kazançta kupalar ekran ortasından rozete uçar;
// kayıpta rozetten kopup aşağı dökülür. Bitince onDone (sayaç dönüşü App
// üzerinden HomeScreen'e "land" olarak iletilir).
export function TrophyFlight({ delta, onDone }: { delta: number; onDone: () => void }) {
  const gain = delta > 0;
  const n = Math.min(7, Math.max(3, Math.round(Math.abs(delta) / 8)));
  const anims = useRef(Array.from({ length: 7 }, () => ({
    x: new Animated.Value(0), y: new Animated.Value(0),
    scale: new Animated.Value(0), opacity: new Animated.Value(0),
  }))).current;
  const { width: screenW, height: screenH } = canvasSize();

  useEffect(() => {
    remeasureTrophyTarget();
    const badge = () => ({
      x: trophyTarget.measured ? trophyTarget.x : screenW - 40,
      y: trophyTarget.measured ? trophyTarget.y : 330,
    });
    let completed = 0;
    const finishOne = () => { completed += 1; if (completed === n) onDone(); };
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < n; i++) {
      const g = anims[i]!;
      const b = badge();
      const from = gain
        ? { x: screenW / 2 + (Math.random() - 0.5) * 110, y: screenH * 0.44 + (Math.random() - 0.5) * 80 }
        : { x: b.x, y: b.y };
      const to = gain
        ? b
        : { x: b.x + (Math.random() - 0.5) * 140, y: b.y + 190 + Math.random() * 90 };
      g.x.setValue(from.x); g.y.setValue(from.y); g.scale.setValue(0); g.opacity.setValue(0);
      timers.push(setTimeout(() => {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(g.opacity, { toValue: 1, duration: 90, useNativeDriver: true }),
            Animated.spring(g.scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.x, { toValue: to.x, duration: 560, easing: gain ? Easing.in(Easing.quad) : Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.y, { toValue: to.y, duration: 560, easing: gain ? Easing.in(Easing.quad) : Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.scale, { toValue: gain ? 0.42 : 0.7, duration: 560, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.scale, { toValue: gain ? 0.16 : 0.4, duration: 130, useNativeDriver: true }),
            Animated.timing(g.opacity, { toValue: 0, duration: 130, useNativeDriver: true }),
          ]),
        ]).start(finishOne);
      }, i * 80));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 60 }]}>
      {anims.slice(0, n).map((g, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', left: -14, top: -14,
            opacity: g.opacity,
            transform: [{ translateX: g.x }, { translateY: g.y }, { scale: g.scale }],
          }}
        >
          <Ionicons name="trophy" size={28} color={gain ? theme.gold : theme.muted} style={{ textShadowColor: 'rgba(5,11,31,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }} />
        </Animated.View>
      ))}
    </View>
  );
}

export function DiamondCelebration({
  amount,
  img,
  onDone,
  onFlightStart,
  onCollectTick,
  variant = 'purchase',
  arenaName,
}: {
  amount: number;
  img?: ImageSourcePropType;
  onDone: () => void;
  onFlightStart?: (durationMs: number) => void;
  onCollectTick?: (progress: number) => void;
  variant?: 'purchase' | 'arenaReward';
  arenaName?: string;
}) {
  const [flying, setFlying] = useState(false);
  const cardScale = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const arenaHeroAnim = useRef(new Animated.Value(0)).current;
  const arenaSheenAnim = useRef(new Animated.Value(0)).current;
  const gemAnims = useRef(Array.from({ length: GEM_COUNT }, () => ({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    scale: new Animated.Value(0),
    opacity: new Animated.Value(0),
  }))).current;

  const { width: screenW, height: screenH } = canvasSize();
  const originX = screenW / 2;        // gems launch from the card centre
  const originY = screenH * 0.46;
  // Fly into the real diamond counter (measured by App.tsx). Read this at close
  // time, not render time: App measures the pill after the celebration mounts.
  const getTarget = () => ({
    x: gemTarget.measured ? gemTarget.x : screenW - 86,
    y: gemTarget.measured ? gemTarget.y : 78,
  });
  const arenaReward = variant === 'arenaReward';
  const arenaVisual = arenaName ? getArenaDataByName(arenaName) : null;
  const title = arenaReward ? t('celebration.arenaTitle') : t('store.purchaseSuccess');
  const subtitle = arenaReward
    ? t('celebration.arenaReward', { arena: arenaName ?? 'Arena', n: amount.toLocaleString('tr-TR') })
    : null;
  // ~400ms count-up on the revealed amount (spec §11).
  const shownAmount = useCountUp(amount);

  // Pop the card in on mount.
  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [cardScale, cardOpacity]);

  // One-shot radial gem spark as the card lands (fades with the card on close).
  const sparkAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      Animated.timing(sparkAnim, { toValue: 1, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [sparkAnim]);

  useEffect(() => {
    if (!arenaReward || !arenaVisual) return;
    arenaHeroAnim.setValue(0);
    arenaSheenAnim.setValue(0);
    Animated.parallel([
      Animated.timing(arenaHeroAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(arenaSheenAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [arenaReward, arenaVisual, arenaHeroAnim, arenaSheenAnim]);

  // Close → fade the card, then fly the gems into the counter, then finish.
  const handleClose = () => {
    if (flying) return;
    setFlying(true);
    Animated.parallel([
      Animated.timing(cardScale, { toValue: 0.55, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();

    const perGem = 70;
    const target = getTarget();
    let completed = 0;
    gemAnims.forEach((g, i) => {
      const startOffX = (Math.random() - 0.5) * 90;
      const startOffY = (Math.random() - 0.5) * 70;
      g.x.setValue(originX + startOffX);
      g.y.setValue(originY + startOffY);
      g.scale.setValue(0);
      g.opacity.setValue(0);
      setTimeout(() => {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(g.opacity, { toValue: 1, duration: 90, useNativeDriver: true }),
            Animated.spring(g.scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.x, { toValue: target.x, duration: 540, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.y, { toValue: target.y, duration: 540, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.scale, { toValue: 0.44, duration: 540, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.delay(60),
          Animated.parallel([
            Animated.timing(g.scale, { toValue: 0.18, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
          ]),
        ]).start(() => {
          completed += 1;
          if (completed === gemAnims.length) onDone();
        });
      }, i * perGem);
    });
  };

  return (
    <SafeModal visible transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <View style={StyleSheet.absoluteFill}>
        {/* Scrim fades with the card's own animated value (Modal animates nothing) */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim, opacity: cardOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={!flying ? handleClose : undefined}
          />
        </Animated.View>

        {/* Centered popup card — GameModal anatomy: panelInk ring → gem frame → face */}
        <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          {/* one-shot 6-gem radial spark on reveal */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            {SPARK_DIRS.map((d, i) => (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  opacity: Animated.multiply(cardOpacity, sparkAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] })),
                  transform: [
                    { translateX: sparkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, d.x] }) },
                    { translateY: sparkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, d.y] }) },
                    { scale: sparkAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1, 0.6] }) },
                  ],
                }}
              >
                <GemIcon size={18} />
              </Animated.View>
            ))}
          </View>
          <Animated.View
            pointerEvents={flying ? 'none' : 'auto'}
            style={{
              width: '100%', maxWidth: 330,
              opacity: cardOpacity, transform: [{ scale: cardScale }],
              backgroundColor: theme.panelInk, borderRadius: 22, padding: 2,
              borderWidth: 2, borderColor: theme.gem, borderBottomColor: theme.gemDark,
              // no overflow:'hidden' here — it would clip this layer's own gem glow on iOS; the inner face clips itself
              shadowColor: theme.gem, shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 18,
            }}
          >
            <View style={{ backgroundColor: theme.modalFace, borderRadius: 18, overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28, zIndex: 5 }} />
              {/* Gold banner strip */}
              <View style={{ height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 46, backgroundColor: theme.accent, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.35)', borderBottomWidth: 3, borderBottomColor: theme.accentDark }}>
                <Ionicons name="sparkles" size={18} color={theme.ink} />
                <Text numberOfLines={1} style={{ color: theme.ink, fontFamily: 'Poppins-ExtraBold', fontSize: 16, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('celebration.congrats')}</Text>
              </View>

              <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 18, paddingHorizontal: 22 }}>
                {arenaReward && arenaVisual ? (
                  <View style={{ width: '100%', marginBottom: 12 }}>
                    <Animated.View style={{
                      borderRadius: 16,
                      overflow: 'hidden',
                      borderWidth: 1.5,
                      borderColor: withAlpha(arenaVisual.color, 0.4),
                      backgroundColor: theme.panelInk,
                      opacity: arenaHeroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.76, 1] }),
                      transform: [{ scale: arenaHeroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
                    }}>
                      <Image source={arenaVisual.img} style={{ width: '100%', height: 148 }} resizeMode="contain" />
                      <Animated.View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          top: -16,
                          bottom: -16,
                          width: '32%',
                          backgroundColor: 'rgba(255,255,255,0.11)',
                          opacity: arenaSheenAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] }),
                          transform: [
                            { translateX: arenaSheenAnim.interpolate({ inputRange: [0, 1], outputRange: [-120, 300] }) },
                            { rotate: '14deg' },
                          ],
                        }}
                      />
                    </Animated.View>
                    {/* Opaque mini-bevel nameplate (card face + arena ring + cardLip lip)
                        overlapping the image bottom — no translucent stacks (spec §14) */}
                    <Animated.View
                      style={{
                        alignSelf: 'center', marginTop: -16, maxWidth: '86%',
                        backgroundColor: theme.cardLip, borderRadius: 13, paddingBottom: 2,
                        opacity: arenaHeroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.76, 1] }),
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: theme.card,
                          // lip radius 13, flush top/sides, 2px bottom lip → 13 top / 11 bottom (nested-radius rule)
                          borderTopLeftRadius: 13, borderTopRightRadius: 13, borderBottomLeftRadius: 11, borderBottomRightRadius: 11,
                          borderWidth: 1.5, borderColor: arenaVisual.color,
                          paddingHorizontal: 14, paddingVertical: 7,
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: arenaVisual.color, fontFamily: 'Poppins-ExtraBold', fontSize: 15, textAlign: 'center', ...engrave('sm') }}>
                          {arenaLabel(arenaVisual.name)}
                        </Text>
                      </View>
                    </Animated.View>
                  </View>
                ) : !arenaReward && img ? (
                  <Image source={img} style={{ width: 150, height: 150 }} resizeMode="contain" />
                ) : (
                  <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
                    <GemIcon size={arenaReward ? 118 : 104} />
                  </View>
                )}
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 18, marginTop: 6, textAlign: 'center', ...engrave('lg') }}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10, fontFamily: 'Poppins-SemiBold' }}>
                    {subtitle}
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: theme.panelInnerFill, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1.5, borderColor: theme.gem }}>
                    <GemIcon size={24} />
                    <Text style={{ color: theme.gemText, fontFamily: 'Poppins-Black', fontSize: 22, fontVariant: ['tabular-nums'], ...engrave('sm') }}>+{shownAmount.toLocaleString('tr-TR')}</Text>
                  </View>
                )}
                <View style={{ alignSelf: 'stretch', marginTop: 10 }}>
                  <Btn
                    big
                    kind="primary"
                    icon={arenaReward ? 'diamond' : undefined}
                    label={t('store.gotIt')}
                    onPress={handleClose}
                  />
                </View>
              </View>

              {/* Close gem — the GameModal recipe verbatim. Shown on BOTH variants so an
                  arena-reward popup is never a dead-end (was arena-only-unclosable before). */}
              <Pressable
                onPress={handleClose}
                hitSlop={8}
                style={({ pressed }) => ({
                  position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15,
                  backgroundColor: pressed ? darken(theme.cardLip, 0.35) : theme.cardLip,
                  borderWidth: 2, borderColor: theme.accentDark,
                  alignItems: 'center', justifyContent: 'center', zIndex: 5,
                  transform: [{ translateY: pressed ? 1 : 0 }],
                })}
              >
                <Ionicons name="close" size={16} color={theme.accent} />
              </Pressable>
            </View>
          </Animated.View>
        </View>

        {/* Flying gem particles (toward the top-right counter) */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {gemAnims.map((g, i) => (
            <Animated.View key={i} style={{
              position: 'absolute', left: -12, top: -12, width: 24, height: 24,
              transform: [{ translateX: g.x }, { translateY: g.y }, { scale: g.scale }],
              opacity: g.opacity,
            }}>
              <GemIcon size={24} />
            </Animated.View>
          ))}
        </View>
      </View>
    </SafeModal>
  );
}

// ---- Store ----
// `productId` must match the Consumable products created in App Store Connect (and
// server/src/game/iap.ts DIAMOND_PRODUCTS). `price` is a fallback shown until the
// real localized App Store price is fetched.
// Pack tint = the theme escalation ramp (bronze lowest → flame highest) rendered
// as each GamePanel's frame tint, so bigger packs visibly escalate.
const DIAMOND_PACKS = [
  { id: 'pack1', amount: 100,   price: '₺29,99',   label: 'Elmas Kesesi',      color: theme.bronze, best: false, productId: 'com.crossover.diamonds.100',   img: require('../assets/store/diamonds-100.png') },
  { id: 'pack2', amount: 500,   price: '₺79,99',   label: 'Elmas Çuvalı',      color: theme.silver, best: false, productId: 'com.crossover.diamonds.500',   img: require('../assets/store/diamonds-500.png') },
  { id: 'pack3', amount: 1200,  price: '₺149,99',  label: 'Büyük Elmas Çuvalı', color: theme.gold,  best: true,  productId: 'com.crossover.diamonds.1200',  img: require('../assets/store/diamonds-1200.png') },
  { id: 'pack4', amount: 5000,  price: '₺449,99',  label: 'Elmas Sandığı',     color: theme.blue,   best: false, productId: 'com.crossover.diamonds.5000',  img: require('../assets/store/diamonds-5000.png') },
  { id: 'pack5', amount: 15000, price: '₺999,99',  label: 'Kraliyet Sandığı',  color: theme.purple, best: false, productId: 'com.crossover.diamonds.15000', img: require('../assets/store/diamonds-15000.png') },
  { id: 'pack6', amount: 50000, price: '₺2.499,99', label: 'Elmas Dağı',       color: theme.flame,  best: false, productId: 'com.crossover.diamonds.50000', img: require('../assets/store/diamonds-50000.png') },
];
const DIAMOND_PRODUCT_IDS = DIAMOND_PACKS.map((p) => p.productId);

// Social Pack = auto-renewable subscriptions (unlock Country-Team & Letter-Team in
// friend matches). productId must match the ASC subscription products + server.
const SOCIAL_PACK = [
  // wasPrice: çapa fiyat (üstü çizili gösterilir) — "₺79,99 yerine ₺39,99" algısı.
  // Fiyatlar 2026-08-29'da güncellendi (haftalık ₺24,99→₺39,99 zam, mevcut aboneler
  // ASC'de korunur; aylık ₺89,99→₺79,99 indirim). Bunlar YALNIZ yedek değerdir —
  // ekranda App Store'dan gelen displayPrice gösterilir (priceFor).
  { id: 'weekly', label: 'Haftalık', price: '₺39,99', wasPrice: '₺79,99', productId: 'com.crossover.socialpack.weekly' },
  { id: 'monthly', label: 'Aylık', price: '₺79,99', wasPrice: '₺170,00', productId: 'com.crossover.socialpack.monthly' },
];
export const SOCIAL_PACK_OFFER = SOCIAL_PACK[0]!; // kampanya popup'ının ürünü (haftalık)
const SOCIAL_PACK_IDS = SOCIAL_PACK.map((s) => s.productId);

/**
 * Smallest diamond pack that closes a shortfall. When a player is 250 gems short
 * we open the cheapest pack that actually covers it rather than dumping them in
 * the store to work it out themselves. Falls back to the largest pack if even
 * that is not enough (nothing else could satisfy the purchase anyway).
 */
function packForShortfall(missing: number): typeof DIAMOND_PACKS[number] {
  return DIAMOND_PACKS.find((p) => p.amount >= missing) ?? DIAMOND_PACKS[DIAMOND_PACKS.length - 1]!;
}

// CO Pass (Premium Level Road) — a CONSUMABLE bought with real money as an
// alternative to 2000 diamonds. productId must match the ASC Consumable + server
// (com.crossover.copass). Fallback price shows until StoreKit loads the real one.
const COPASS_PRODUCT_ID = 'com.crossover.copass';
const COPASS_FALLBACK_PRICE = '₺350';

function ChangeNameModal({ visible, diamonds, onClose, onConfirm }: {
  visible: boolean;
  diamonds: number;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const cost = 1000;
  const canAfford = diamonds >= cost;

  useEffect(() => { if (visible) setNewName(''); }, [visible]);

  return (
    <GameModal visible={visible} onClose={onClose} title={t('store.changeNameTitle')} icon="create">
      <GameInput
        placeholder={t('store.newName')}
        value={newName}
        onChangeText={setNewName}
        autoFocus
        maxLength={20}
      />

      {/* Cost / balance in a recessed summary well */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.well, borderRadius: 12, overflow: 'hidden', paddingVertical: 10, paddingHorizontal: 12 }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
        <Text style={styles.muted}>{t('store.cost')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: canAfford ? theme.gemText : theme.danger, fontFamily: 'Poppins-ExtraBold', fontSize: 15, fontVariant: ['tabular-nums'] }}>{cost}</Text>
          <GemIcon size={14} />
        </View>
        <Text style={styles.muted}>{t('store.balance')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 15, fontVariant: ['tabular-nums'] }}>{diamonds}</Text>
          <GemIcon size={14} />
        </View>
      </View>

      {!canAfford ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: withAlpha(theme.danger, 0.14), borderRadius: 10, borderWidth: 1.5, borderColor: theme.danger, paddingVertical: 6, paddingHorizontal: 10 }}>
          <Ionicons name="alert-circle" size={14} color={theme.danger} />
          <Text style={{ color: theme.danger, fontSize: 12, fontFamily: 'Poppins-SemiBold', flexShrink: 1 }}>
            {t('store.changeNameInsufficient')}
          </Text>
        </View>
      ) : null}

      <Btn
        label={t('store.changeNameConfirm')}
        kind="accent"
        icon="checkmark"
        onPress={() => onConfirm(newName.trim())}
        disabled={!canAfford || newName.trim().length < 2}
      />
      <Btn label={t('store.cancel')} kind="ghost" icon="close" onPress={onClose} />
    </GameModal>
  );
}

type EquippableCosmeticType = Exclude<CosmeticType, 'avatar' | 'emote'>;
const EQUIPPABLE_COSMETIC_TYPES: readonly EquippableCosmeticType[] = ['frame', 'name_effect', 'match_background', 'ball', 'intro', 'victory_effect', 'answer_effect'];
const COSMETIC_SLOT_META: readonly { type: EquippableCosmeticType; label: string; empty: string; icon: IoniconName }[] = [
  { type: 'frame', label: 'Çerçeve', empty: 'Boş', icon: 'radio-button-on' },
  { type: 'name_effect', label: 'İsim', empty: 'Efektsiz', icon: 'text' },
  { type: 'match_background', label: 'Arena', empty: 'Varsayılan', icon: 'stadium' as IoniconName },
  { type: 'ball', label: 'Top', empty: 'Classic', icon: 'football' },
  { type: 'intro', label: 'Giriş', empty: 'Yok', icon: 'sparkles' },
  { type: 'victory_effect', label: 'Zafer', empty: 'Yok', icon: 'trophy' },
  { type: 'answer_effect', label: 'Cevap', empty: 'Yok', icon: 'flash' },
];
const COSMETIC_FALLBACK_NAMES: Record<string, string> = {
  [DEFAULT_BALL_ID]: 'Classic',
  bronze: 'Bronze Frame',
  silver: 'Silver Frame',
  gold: 'Gold Frame',
  diamond: 'Diamond Frame',
  goat: 'GOAT Frame',
};
// Kullanıcının çizdiği kozmetik asset'leri (2026-08-26 AirDrop): isim plakaları,
// arena fotoğrafları, arma toplar. Gönderilmeyen kozmetikler kod-çizimi kalır.
const COSMETIC_ART = {
  fireNameplate: require('../assets/cosmetics/fire_nameplate.png'),
  iceNameplate: require('../assets/cosmetics/ice_nameplate.png'),
  neonPitchBg: require('../assets/cosmetics/neon_pitch_bg.jpg'),
  nightStadiumBg: require('../assets/cosmetics/night_stadium_bg.jpg'),
  goatArenaBg: require('../assets/cosmetics/goat_arena_bg.jpg'),
  goatBallCrest: require('../assets/cosmetics/goat_ball_crest.png'),
  championsBallCrest: require('../assets/cosmetics/champions_ball_crest.png'),
} as const;

const MATCH_BACKGROUND_LOOK: Record<string, { top: string; bottom: string; accent: string; glow: string; line: string }> = {
  [DEFAULT_MATCH_BACKGROUND_ID]: { top: theme.bg, bottom: '#07112B', accent: theme.primary, glow: 'rgba(22,178,122,0.18)', line: 'rgba(255,255,255,0.10)' },
  champions_stadium: { top: '#071B45', bottom: '#111A38', accent: '#37A8FF', glow: 'rgba(55,168,255,0.34)', line: 'rgba(255,206,58,0.24)' },
  night_stadium: { top: '#060B21', bottom: '#101C3C', accent: '#7FD7FF', glow: 'rgba(127,215,255,0.24)', line: 'rgba(127,215,255,0.16)' },
  fire_arena: { top: '#260B10', bottom: '#0B1838', accent: '#FF7A3D', glow: 'rgba(255,90,46,0.36)', line: 'rgba(255,206,58,0.2)' },
  neon_pitch: { top: '#031D23', bottom: '#071B45', accent: '#27E58B', glow: 'rgba(39,229,139,0.32)', line: 'rgba(39,229,139,0.24)' },
  golden_stadium: { top: '#2A1E05', bottom: '#101C3C', accent: '#FFCE3A', glow: 'rgba(255,206,58,0.34)', line: 'rgba(255,241,166,0.18)' },
  goat_arena: { top: '#1B0A38', bottom: '#2A120B', accent: '#D9B4FF', glow: 'rgba(199,125,255,0.36)', line: 'rgba(255,206,58,0.24)' },
};

function isEquippableCosmeticType(type: string | undefined): type is EquippableCosmeticType {
  return EQUIPPABLE_COSMETIC_TYPES.includes(type as EquippableCosmeticType);
}

function cosmeticFallbackName(id: string | null | undefined): string {
  if (!id) return 'Boş';
  return COSMETIC_FALLBACK_NAMES[id] ?? id.split('_').map((p) => p ? p[0]!.toUpperCase() + p.slice(1) : p).join(' ');
}

function cosmeticEquippedId(profile: ProfileView | null | undefined, type: EquippableCosmeticType): string | null {
  const loadout = profileLoadout(profile);
  if (type === 'frame') return loadout.frameId;
  if (type === 'name_effect') return loadout.nameEffectId;
  if (type === 'match_background') return loadout.matchBackgroundId;
  if (type === 'ball') return loadout.ballId ?? DEFAULT_BALL_ID;
  if (type === 'intro') return loadout.introId;
  if (type === 'victory_effect') return loadout.victoryEffectId;
  return loadout.answerEffectId;
}

function unequipCosmeticValue(type: EquippableCosmeticType): string | null {
  return type === 'ball' ? DEFAULT_BALL_ID : null;
}

function matchLocalLoadout(state: GameState): CosmeticLoadoutView | null {
  const room = state.room;
  const you = room?.players.find((p) => p.id === room.youId);
  return you?.cosmetics ?? (state.profile ? profileLoadout(state.profile) : null);
}

function matchBackgroundIdForState(state: GameState): string {
  const room = state.room;
  const you = room?.players.find((p) => p.id === room.youId);
  const opp = room?.players.find((p) => p.id !== room.youId);
  const localCosmetics = matchLocalLoadout(state);
  return resolveMatchBackground(localCosmetics ? { cosmetics: localCosmetics } : you, opp);
}

function localBallIdForState(state: GameState): string {
  return matchLocalLoadout(state)?.ballId ?? DEFAULT_BALL_ID;
}

function MatchCosmeticBackdrop({ backgroundId }: { backgroundId?: string | null }) {
  const id = backgroundId || DEFAULT_MATCH_BACKGROUND_ID;
  const look = MATCH_BACKGROUND_LOOK[id] ?? MATCH_BACKGROUND_LOOK[DEFAULT_MATCH_BACKGROUND_ID]!;
  // Uygulama kökü safe-area ile içeri alınmış durumda; arka plan çentik/home-bar
  // altına da uzansın diye insets kadar negatif taşırılır (yoksa üstte siyah bant).
  const insets = useSafeAreaInsets();
  const bleed = { position: 'absolute' as const, left: 0, right: 0, top: -insets.top, bottom: -insets.bottom };
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [pulse, id]);
  const hot = id.includes('fire') || id.includes('goat');
  // Çizilmiş arena fotoğrafı olan kozmetikler: fotoğraf + okunabilirlik örtüsü.
  const bgImage = id === 'neon_pitch' ? COSMETIC_ART.neonPitchBg : id === 'night_stadium' ? COSMETIC_ART.nightStadiumBg : id === 'goat_arena' ? COSMETIC_ART.goatArenaBg : null;
  if (bgImage) {
    return (
      <View pointerEvents="none" style={bleed}>
        <Image source={bgImage} style={[StyleSheet.absoluteFill, { width: undefined, height: undefined }]} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,9,24,0.30)' }]} />
        <Animated.View style={{ position: 'absolute', left: -48, right: -48, bottom: SCREEN_H * 0.16, height: 110, borderRadius: 80, backgroundColor: look.glow, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.4] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.05] }) }] }} />
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={bleed}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="cosmeticMatchBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={look.top} />
            <Stop offset="1" stopColor={look.bottom} />
          </SvgGradient>
          <RadialGradient id="cosmeticMatchGlow" cx="50%" cy="22%" rx="68%" ry="40%">
            <Stop offset="0" stopColor={look.accent} stopOpacity="0.36" />
            <Stop offset="1" stopColor={look.accent} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#cosmeticMatchBg)" />
        <Rect width="100%" height="100%" fill="url(#cosmeticMatchGlow)" />
        {hot ? Array.from({ length: 7 }).map((_, i) => (
          <Circle key={i} cx={`${10 + i * 14}%`} cy={`${82 - (i % 2) * 9}%`} r={10 + (i % 3) * 3} fill={i % 2 ? '#FFCE3A' : '#FF7A3D'} opacity="0.18" />
        )) : null}
      </Svg>
      {/* Gerçek futbol sahası çizgileri (kullanıcı isteği 2026-08-31): eski "kötü
          çizgiler" yerine tam saha geometrisi. SADECE çizgiler değişti; gradient/
          glow/renkler aynı. Renk yine `look.line` (her kozmetiğin kendi çizgi rengi). */}
      <PitchLines color={look.line} strokeWidth={0.6} />
      {/* Alt-orta yanıp sönen glow şeridi kaldırıldı (kullanıcı isteği 2026-08-28:
          sonuç yazısının arkasındaki şerit gereksiz). Premium foto arka planlardaki
          bant (yukarıdaki bgImage dalı) korunur. */}
    </View>
  );
}

function MiniArenaPreview({ backgroundId, size }: { backgroundId: string; size: number }) {
  const look = MATCH_BACKGROUND_LOOK[backgroundId] ?? MATCH_BACKGROUND_LOOK[DEFAULT_MATCH_BACKGROUND_ID]!;
  const img = backgroundId === 'neon_pitch' ? COSMETIC_ART.neonPitchBg : backgroundId === 'night_stadium' ? COSMETIC_ART.nightStadiumBg : backgroundId === 'goat_arena' ? COSMETIC_ART.goatArenaBg : null;
  if (img) {
    return (
      <View style={{ width: size, height: size * 0.68, borderRadius: size * 0.16, overflow: 'hidden', borderWidth: 2, borderColor: look.accent }}>
        <Image source={img} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size * 0.68, borderRadius: size * 0.16, overflow: 'hidden', backgroundColor: look.bottom, borderWidth: 2, borderColor: look.accent }}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgGradient id="arenaMini" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={look.top} />
            <Stop offset="1" stopColor={look.bottom} />
          </SvgGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#arenaMini)" />
        <Circle cx="50%" cy="62%" r={size * 0.22} stroke={look.line} strokeWidth="2" fill="none" />
        <Line x1="8%" y1="62%" x2="92%" y2="62%" stroke={look.line} strokeWidth="2" />
        <Rect x="18%" y="42%" width="64%" height="40%" rx="10" stroke={look.line} strokeWidth="1.5" fill="none" />
        {backgroundId.includes('fire') ? <Circle cx="50%" cy="20%" r={size * 0.2} fill="#FF7A3D" opacity="0.22" /> : null}
      </Svg>
    </View>
  );
}

function MatchBall({ ballId, size = 34 }: { ballId?: string | null; size?: number }) {
  const id = ballId || DEFAULT_BALL_ID;
  const look = id === 'golden_ball'
    ? { face: '#FFCE3A', ring: '#FFF1A6', seam: '#5C3A05', glow: 'rgba(255,206,58,0.38)' }
    : id === 'fire_ball'
      ? { face: '#FF7A3D', ring: '#FFE05C', seam: '#5C1506', glow: 'rgba(255,90,46,0.48)' }
      : id === 'champions_ball'
        ? { face: '#37A8FF', ring: '#FFCE3A', seam: '#06131F', glow: 'rgba(55,168,255,0.36)' }
        : id === 'neon_ball'
          ? { face: '#071B45', ring: '#27E58B', seam: '#7CFFB8', glow: 'rgba(39,229,139,0.42)' }
          : id === 'goat_ball'
            ? { face: '#D9B4FF', ring: '#FFCE3A', seam: '#3B145C', glow: 'rgba(199,125,255,0.5)' }
            : { face: '#FFFFFF', ring: '#CBD5E8', seam: '#101C3C', glow: 'rgba(255,255,255,0.2)' };
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(spin, { toValue: 1, duration: id === DEFAULT_BALL_ID ? 2400 : 1400, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [spin, id]);
  const crest = id === 'goat_ball' ? COSMETIC_ART.goatBallCrest : id === 'champions_ball' ? COSMETIC_ART.championsBallCrest : null;
  if (crest) {
    // Çizilmiş arma top: taçlı/boynuzlu amblem döndürülmez — ışıma nefesiyle süzülür.
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: size * 1.34, height: size * 1.34, borderRadius: size, backgroundColor: look.glow, opacity: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.7, 0.3] }), transform: [{ scale: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.92, 1.06, 0.92] }) }] }} />
        <Animated.Image source={crest} resizeMode="contain" style={{ width: size * 1.14, height: size * 1.14, transform: [{ translateY: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [size * 0.03, -size * 0.045, size * 0.03] }) }] }} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size * 1.32, height: size * 1.32, borderRadius: size, backgroundColor: look.glow, opacity: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.32, 0.78, 0.32] }), transform: [{ scale: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 1.08, 0.9] }) }] }} />
      {id === 'fire_ball' ? (
        <Animated.View style={{ position: 'absolute', right: -size * 0.22, top: size * 0.05, width: size * 0.42, height: size * 0.75, borderRadius: size, backgroundColor: '#FFCE3A', opacity: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 0.85, 0.25] }), transform: [{ rotate: '-26deg' }, { scale: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.15, 0.8] }) }] }} />
      ) : null}
      <Animated.View style={{ width: size * 0.86, height: size * 0.86, borderRadius: size, backgroundColor: look.face, borderWidth: Math.max(2, size * 0.065), borderColor: look.ring, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
        <Ionicons name="football" size={Math.round(size * 0.48)} color={look.seam} />
      </Animated.View>
    </View>
  );
}

function CosmeticEffectIcon({ id, type, size, accent }: { id: string; type: string; size: number; accent: string }) {
  // Önizleme artık kozmetiğin ne YAPTIĞINI oynatır (alev/şimşek/projektör/konfeti);
  // tür rozeti küçülüp köşeye iner — tek renk ikon dönemi kapandı.
  const icon: IoniconName = type === 'intro' ? 'sparkles' : type === 'victory_effect' ? 'trophy' : 'flash';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <EffectSceneFX id={id} size={size} />
      <View style={{ position: 'absolute', right: size * 0.02, bottom: size * 0.02, width: size * 0.34, height: size * 0.34, borderRadius: size * 0.11, backgroundColor: theme.surface3, borderWidth: 1.5, borderColor: accent, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={Math.round(size * 0.18)} color={accent} />
      </View>
    </View>
  );
}

function CosmeticArt({ id, type, size, accent, empty = false }: { id: string | null | undefined; type: string; size: number; accent: string; empty?: boolean }) {
  if (empty || !id) {
    const visual = cosmeticVisual({ id: `${type}_empty`, type, name: '', description: '', rarity: 'common', diamondPrice: 0 } as StoreCatalogItem);
    return <Ionicons name={visual.icon as IoniconName} size={Math.round(size * 0.4)} color={withAlpha(accent, 0.7)} />;
  }
  if (type === 'frame') return <Avatar avatar={null} name="Player" size={Math.round(size * 0.52)} ring={accent} iconColor={accent} frameId={id} />;
  if (type === 'name_effect') return <CosmeticName name={id === 'goat_name' ? 'GOAT' : 'CROSS'} effectId={id} style={{ fontSize: Math.round(size * 0.18), fontFamily: 'Poppins-Black', color: theme.text, ...engrave('sm') }} />;
  if (type === 'match_background') return <MiniArenaPreview backgroundId={id} size={Math.round(size * 0.78)} />;
  if (type === 'ball') return <MatchBall ballId={id} size={Math.round(size * 0.66)} />;
  return <CosmeticEffectIcon id={id} type={type} size={size} accent={accent} />;
}

export function CosmeticPreview({ item, size = 88 }: { item: StoreCatalogItem; size?: number }) {
  const visual = cosmeticVisual(item);
  const accent = RARITY_COLOR[item.rarity] ?? visual.accent;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pulse.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [item.id, pulse]);
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.08] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size * 0.28, backgroundColor: accent, opacity: 0.2, transform: [{ scale: glow }] }} />
      <View style={{ width: size * 0.9, height: size * 0.9, borderRadius: size * 0.24, backgroundColor: theme.surface3, borderWidth: 2, borderColor: accent, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: -size * 0.25, top: -size * 0.25, width: size * 0.8, height: size * 0.8, borderRadius: size, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
        <CosmeticArt id={item.id} type={item.type} size={size} accent={accent} />
      </View>
    </View>
  );
}

function CosmeticShopTile({ item, owned, equipped, vault, onPress }: { item: StoreCatalogItem; owned: boolean; equipped: boolean; vault?: boolean; onPress: () => void }) {
  const accent = RARITY_COLOR[item.rarity] ?? theme.primary;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: 138, minHeight: 184, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1.5, borderColor: equipped ? theme.primary : vault ? theme.gold : accent + '88', padding: 10, opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, shadowSoft]}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <CosmeticPreview item={item} size={84} />
        <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5, textAlign: 'center' }} numberOfLines={2}>{cosmeticDisplayName(item)}</Text>
        <Text style={{ color: accent, fontFamily: 'Poppins-Black', fontSize: 9.5, letterSpacing: 0.8 }}>{String(item.rarity).toUpperCase()}</Text>
        {equipped ? (
          <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 11 }}>KUŞANILI</Text>
        ) : owned ? (
          <Text style={{ color: theme.muted, fontFamily: 'Poppins-ExtraBold', fontSize: 11 }}>SAHİP</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><GemIcon size={12} /><Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>{item.diamondPrice}</Text></View>
        )}
      </View>
      {/* KASA: bu haftanın limitli mythic düşüşü — Pazartesi vitrinden kalkar */}
      {vault ? (
        <Ribbon label="KASADAN ÇIKTI" style={{ position: 'absolute', top: -7, left: 6, transform: [{ rotate: '-2deg' }], zIndex: 3 }} />
      ) : null}
    </Pressable>
  );
}

// Çizilmiş isim plakaları: plaka görseli ismin ARKASINA gerilir; sol taşma top
// amblemine, sağ taşma ok ucuna yer açar, yazı koyu panele oturur.
const NAMEPLATE_ART: Record<string, { src: number }> = {
  fire_name: { src: COSMETIC_ART.fireNameplate },
  ice_name: { src: COSMETIC_ART.iceNameplate },
};

function CosmeticName({ name, effectId, style, numberOfLines = 1 }: { name: string; effectId?: string | null; style?: any; numberOfLines?: number }) {
  const fx = nameEffectColors(effectId);
  const plate = effectId ? NAMEPLATE_ART[effectId] : undefined;
  if (fx && plate) {
    const fs = ((StyleSheet.flatten(style) as { fontSize?: number } | undefined)?.fontSize) ?? 14;
    return (
      <View style={{ flexShrink: 1, maxWidth: '100%', paddingLeft: fs * 1.5, paddingRight: fs * 0.95, paddingVertical: fs * 0.52, justifyContent: 'center' }}>
        <Image source={plate.src} style={[StyleSheet.absoluteFill, { width: undefined, height: undefined }]} resizeMode="stretch" />
        <Text
          numberOfLines={numberOfLines}
          style={[
            style,
            { color: fx.color, textShadowColor: fx.glow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
          ]}
        >
          {name}
        </Text>
      </View>
    );
  }
  if (fx) {
    return (
      <View style={{ flexShrink: 1, maxWidth: '100%' }}>
        <NameEffectParticles effectId={effectId} />
        <Text
          numberOfLines={numberOfLines}
          style={[
            style,
            { color: fx.color, textShadowColor: fx.glow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: effectId === 'fire_name' ? 12 : 9 },
          ]}
        >
          {name}
        </Text>
      </View>
    );
  }
  return (
    <Text
      numberOfLines={numberOfLines}
      style={style}
    >
      {name}
    </Text>
  );
}

function NameEffectParticles({ effectId }: { effectId?: string | null }) {
  // Sahneler cosmeticFx.tsx'te: her efektin kendi katmanlı kimliği var
  // (alev dilleri, buz kristalleri, neon titremesi, altın süpürme...).
  return <NameEffectFX effectId={effectId} />;
}

const BOLT_ART = require('../assets/fx/bolt.png');

// Clash Royale zap ritmi: çift çakma (çat-ÇAT), mavi-beyaz, panelin içinden.
// İki taraf da IntroEffectOverlay'i kendi panelinde çizer — iki oyuncuda görünür.
function LightningEntranceFX() {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(260),
      Animated.timing(p, { toValue: 1, duration: 36, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(p, { toValue: 0.22, duration: 70, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(p, { toValue: 0.92, duration: 44, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(p, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(1350),
    ]));
    loop.start();
    return () => loop.stop();
  }, [p]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* mavi ışık banyosu: çakma anında panel aydınlanır */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#7FD7FF', opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }) }]} />
      {/* ana şimşek: solda, hafif eğik */}
      <Animated.Image source={BOLT_ART} resizeMode="contain" style={{ position: 'absolute', left: '16%', top: -4, width: '22%', height: '86%', tintColor: '#BFE8FF', opacity: p, transform: [{ rotate: '-7deg' }] }} />
      {/* ikincil şimşek: sağda, aynalı, biraz sönük */}
      <Animated.Image source={BOLT_ART} resizeMode="contain" style={{ position: 'absolute', right: '17%', top: 2, width: '18%', height: '74%', tintColor: '#8FD0FF', opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }), transform: [{ scaleX: -1 }, { rotate: '9deg' }] }} />
      {/* beyaz çekirdek flaş */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, 0.10] }) }]} />
    </View>
  );
}

function IntroEffectOverlay({ effectId, accent }: { effectId?: string | null; accent: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!effectId) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 820, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 820, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a, effectId]);
  if (!effectId) return null;
  if (effectId.includes('lightning')) return <LightningEntranceFX />;
  const fire = effectId.includes('fire');
  const lightning = effectId.includes('lightning');
  const color = fire ? '#FF7A3D' : lightning ? '#FFE05C' : effectId.includes('goat') ? '#D9B4FF' : accent;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={{ position: 'absolute', left: 18, right: 18, top: 10, bottom: 10, borderRadius: 20, borderWidth: 2, borderColor: color, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.62] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.04] }) }] }} />
      {Array.from({ length: fire ? 6 : 4 }).map((_, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: fire ? `${10 + i * 16}%` : `${16 + i * 20}%`,
            top: fire ? undefined : 18 + (i % 2) * 48,
            bottom: fire ? 8 + (i % 2) * 6 : undefined,
            width: lightning ? 4 : 7,
            height: fire ? 22 : lightning ? 44 : 7,
            borderRadius: 12,
            backgroundColor: i % 2 ? '#FFCE3A' : color,
            opacity: a.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.14, 0.82, 0.14] }),
            transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [fire ? 10 : -6, fire ? -14 : 6] }) }, { rotate: lightning ? '24deg' : '0deg' }],
          }}
        />
      ))}
    </View>
  );
}

function AnswerEffectOverlay({ effectId }: { effectId?: string | null }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!effectId) return undefined;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a, effectId]);
  if (!effectId) return null;
  const fire = effectId.includes('fire');
  const ice = effectId.includes('ice');
  const color = fire ? '#FF7A3D' : ice ? '#7FD7FF' : effectId.includes('champions') ? '#FFCE3A' : '#FFE05C';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 55, overflow: 'hidden' }]}>
      <Animated.View
        style={{
          position: 'absolute', top: SCREEN_H * 0.34, left: -70,
          width: 70, height: 30, borderRadius: 18, backgroundColor: withAlpha(color, 0.26),
          opacity: a.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, SCREEN_W + 140] }) }, { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [44, -26] }) }, { rotate: '-12deg' }],
        }}
      >
        <View style={{ position: 'absolute', left: -56, top: 9, width: 70, height: 10, borderRadius: 12, backgroundColor: withAlpha(color, 0.32) }} />
        <MatchBall ballId={fire ? 'fire_ball' : ice ? 'classic_ball' : 'champions_ball'} size={30} />
      </Animated.View>
      {Array.from({ length: 5 }).map((_, i) => (
        <Animated.View key={i} style={{ position: 'absolute', left: 28 + i * 68, top: SCREEN_H * 0.42 + (i % 2) * 24, width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: a.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.72, 0] }), transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [18, -34] }) }] }} />
      ))}
    </View>
  );
}

function VictoryEffectOverlay({ effectId, active }: { effectId?: string | null; active: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || !effectId) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 1150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a, active, effectId]);
  if (!active || !effectId) return null;
  const fire = effectId.includes('fire');
  const lightning = effectId.includes('lightning');
  const color = fire ? '#FF7A3D' : lightning ? '#FFE05C' : effectId.includes('goat') ? '#D9B4FF' : '#FFCE3A';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 45, overflow: 'hidden' }]}>
      {Array.from({ length: 12 }).map((_, i) => {
        const x = 22 + ((i * 37) % Math.max(1, SCREEN_W - 44));
        const delay = i / 12;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: x, top: -22,
              width: lightning ? 5 : 8, height: fire ? 24 : lightning ? 32 : 8,
              borderRadius: 10, backgroundColor: i % 3 === 0 ? '#FFFFFF' : color,
              opacity: a.interpolate({ inputRange: [0, delay, Math.min(1, delay + 0.22), 1], outputRange: [0, 0, 0.9, 0] }),
              transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, SCREEN_H * 0.72] }) }, { rotate: `${(i % 5) * 18 - 28}deg` }],
            }}
          />
        );
      })}
      <Animated.View style={{ position: 'absolute', left: SCREEN_W * 0.5 - 85, top: SCREEN_H * 0.18, width: 170, height: 170, borderRadius: 90, backgroundColor: withAlpha(color, 0.24), opacity: a.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.12, 0.55, 0.1] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] }) }] }} />
    </View>
  );
}

const AD_STORAGE_KEY = '@crossover_ad_state';

// AdMob Rewarded Ad Unit IDs: test IDs during development (__DEV__), production IDs in release builds.
// Google test rewarded IDs always serve test ads instantly with no AdMob setup needed.
// Production IDs serve real ads and generate revenue.
const REWARDED_AD_IOS = __DEV__
  ? 'ca-app-pub-3940256099942544/1712485313'
  : 'ca-app-pub-5118403349234305/6758433311';
const REWARDED_AD_ANDROID = __DEV__
  ? 'ca-app-pub-3940256099942544/5224354917'
  : 'ca-app-pub-5118403349234305/3118571202';
const REWARDED_AD_UNIT = Platform.OS === 'ios' ? REWARDED_AD_IOS : REWARDED_AD_ANDROID;

// Load AdMob SDK — native module, absent in Expo Go.
let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let AdEventType: any = null;
try {
  const ads = require('react-native-google-mobile-ads');
  RewardedAd = ads.RewardedAd;
  RewardedAdEventType = ads.RewardedAdEventType;
  AdEventType = ads.AdEventType;
} catch {
  // native module unavailable (Expo Go) — ads disabled gracefully
}

// enabled=false: ön-yükleme yapılmaz (boş AdMob isteği atılmaz) — ResultScreen
// yalnız "kayıp + maç sonu" durumunda true geçer (istek şişmesi düzeltmesi 2026-08-29).
function useAdState(onReward?: () => void, enabled = true) {
  const [adsWatched, setAdsWatched] = useState(0);
  const [adLoading, setAdLoading] = useState(false);
  // Ad failures surface as state so the caller renders a skinned GameModal (no native Alert).
  const [adError, setAdError] = useState<{ code: string; message: string } | null>(null);
  const onRewardRef = useRef(onReward);
  onRewardRef.current = onReward;

  // Load today's count from AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AD_STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.date === new Date().toDateString()) setAdsWatched(data.watched);
        }
      } catch {}
    })();
  }, []);

  const saveState = async (watched: number) => {
    try {
      await AsyncStorage.setItem(AD_STORAGE_KEY, JSON.stringify({ date: new Date().toDateString(), watched }));
    } catch {}
  };

  // ÖN-YÜKLEME (2026-08-26): reklam kancası kurulur kurulmaz arka planda bir
  // reklam yüklenir; düğmeye basıldığında hazırsa SALİSESİNDE açılır. Kapanış /
  // hata sonrası bir sonraki hemen yüklenir — kullanıcı hiç yükleme görmez.
  const preloadedRef = useRef<{ ad: any; loaded: boolean } | null>(null);
  const preloadNext = useCallback(() => {
    if (!RewardedAd || preloadedRef.current) return;
    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT);
    const entry = { ad, loaded: false };
    preloadedRef.current = entry;
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => { entry.loaded = true; });
    ad.addAdEventListener(AdEventType.ERROR, () => { if (preloadedRef.current === entry) preloadedRef.current = null; });
    ad.load();
  }, []);
  useEffect(() => { if (enabled) preloadNext(); }, [preloadNext, enabled]);

  const watchAd = async () => {
    // No AdMob SDK → grant reward directly (dev/Expo Go fallback)
    if (!RewardedAd) {
      const n = adsWatched + 1;
      setAdsWatched(n);
      await saveState(n);
      onRewardRef.current?.();
      return;
    }

    const grantReward = async () => {
      const n = adsWatched + 1;
      setAdsWatched(n);
      await saveState(n);
      onRewardRef.current?.();
    };

    const pre = preloadedRef.current;
    if (pre?.loaded) {
      // Hazır reklam: anında göster; kapanınca sıradakini yüklemeye başla.
      preloadedRef.current = null;
      pre.ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, grantReward);
      pre.ad.addAdEventListener(AdEventType.CLOSED, () => { preloadNext(); });
      pre.ad.addAdEventListener(AdEventType.ERROR, (error?: { code?: number; message?: string }) => {
        setAdError({ code: String(error?.code ?? '?'), message: error?.message ?? '' });
        preloadNext();
      });
      pre.ad.show();
      return;
    }

    // Nadir yol: ön-yükleme henüz bitmedi — eski davranış (kısa spinner).
    setAdLoading(true);
    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT);

    const unsubs: (() => void)[] = [];
    const cleanup = () => { unsubs.forEach((u) => u()); setAdLoading(false); };

    unsubs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, grantReward));

    unsubs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show();
    }));

    unsubs.push(ad.addAdEventListener(AdEventType.ERROR, (error?: { code?: number; message?: string }) => {
      cleanup();
      setAdError({ code: String(error?.code ?? '?'), message: error?.message ?? '' });
      preloadNext();
    }));

    unsubs.push(ad.addAdEventListener(AdEventType.CLOSED, () => {
      cleanup();
      preloadNext();
    }));

    ad.load();
  };

  const canWatch = !adLoading;
  const clearAdError = useCallback(() => setAdError(null), []);
  return { adsWatched, canWatch, watchAd, adLoading, adError, clearAdError };
}

// Next weekly drop reset = upcoming Monday 00:00 local.
function nextWeeklyReset(): number {
  const d = new Date();
  const daysUntilMon = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMon);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Weekly-drop countdown: recessed timer trough (sunken top edge), tabular-nums so
// the ticking seconds never jitter the pill width, subtle scale pulse under 1 hour.
function WeeklyCountdown({ resetAt }: { resetAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  // Sunucu weeklyResetAt verirse ona kilitlen (rotasyonla aynı saniyede sıfırlanır);
  // yoksa yerel Pazartesi tahmini eski davranış olarak kalır.
  const serverTarget = resetAt ? Date.parse(resetAt) : NaN;
  const [target, setTarget] = useState(() => (Number.isFinite(serverTarget) ? serverTarget : nextWeeklyReset()));
  useEffect(() => {
    if (Number.isFinite(serverTarget) && serverTarget > Date.now()) setTarget(serverTarget);
  }, [serverTarget]);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  let ms = target - now;
  if (ms <= 0) { const t = Number.isFinite(serverTarget) ? target + 7 * 86_400_000 : nextWeeklyReset(); setTarget(t); ms = t - now; }
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const label = days >= 1
    ? t('store.countdown.daysHours', { d: days, h: hh })
    : t('store.countdown.hms', { h: hh, m: mm, s: ss });
  const urgent = s > 0 && s < 3600; // final hour → urgency pulse (spec §8 timer chips)
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!urgent) { pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [urgent, pulse]);
  return (
    <Animated.View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: theme.well, borderRadius: 999, overflow: 'hidden', // dark top = sunken
        paddingHorizontal: 9, paddingVertical: 3,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
      <Ionicons name="time-outline" size={12} color={theme.danger} />
      <Text style={{ color: theme.danger, fontSize: 10, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.3, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </Animated.View>
  );
}

// Rewarded-ad card — the "free gift" of the store: beveled play disc with a mint
// halo, gem reward in Poppins-Black gemText, and a slow looping shine sweep.
function AdRewardCard({ adLoading, adsWatched, onWatch }: { adLoading: boolean; adsWatched: number; onWatch: () => void }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <GamePanel compact accentStripe={theme.primary} style={{ marginVertical: 5 }}>
      <View
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: theme.well, borderWidth: 2, borderColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="play" size={24} color={theme.primary} style={{ marginLeft: 2 }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeAdTitle}>{t('store.watchAd')}</Text>
          <Text style={[styles.muted, { textAlign: 'left', fontSize: 11.5, marginTop: 2 }]}>{t('store.freeDiamondsDesc')}</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
            <Text style={styles.storeAdReward}>+5</Text>
            <GemIcon size={15} />
          </View>
          <Btn compact label={t('store.watch')} kind="primary" icon="play" loading={adLoading} onPress={onWatch} />
          {adsWatched > 0 ? <Text style={[styles.muted, { fontSize: 10 }]}>{t('store.adsWatchedToday', { n: adsWatched })}</Text> : null}
        </View>
      </View>
      {/* Sweep the full panel face, not the content row: the -12 offset escapes the
          body's 12px padding (Yoga insets absolute children by parent padding) and the
          face's own rounded overflow:'hidden' clips the band at the card edge. */}
      {size.w > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -12, left: -12 }}>
          <ShineSweep width={size.w + 24} height={size.h + 24} loop delay={600} duration={900} loopGap={2800} opacity={0.16} band={0.24} />
        </View>
      ) : null}
    </GamePanel>
  );
}

// One diamond pack row: GamePanel compact tinted by the pack's escalation-ramp
// color; the whole card gets the 2px press-lip and the price is a real Btn
// (its `loading` prop covers the mid-purchase state — no bare spinners).
function DiamondPackRow({ pack, busy, inert, price, firstDouble, onBuy }: {
  pack: (typeof DIAMOND_PACKS)[number]; busy: boolean; inert: boolean; price: string; firstDouble?: boolean; onBuy: () => void;
}) {
  const { ty, onIn, onOut } = usePressLip(2, GameFeedbackEvent.UI_PURCHASE);
  return (
    <Pressable disabled={inert || busy} onPress={onBuy} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={{ transform: [{ translateY: ty }], marginVertical: 5 }}>
        <GamePanel compact tint={pack.color}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={pack.img} style={{ width: 52, height: 52 }} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14, ...engrave('sm') }}>{t(`store.${pack.id}` as MessageKey)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <GemIcon size={14} />
                <Text style={{ color: theme.gemText, fontFamily: 'Poppins-ExtraBold', fontSize: 13 }}>{pack.amount.toLocaleString(currentLang())}</Text>
                {firstDouble ? (
                  <View style={{ backgroundColor: withAlpha(theme.gold, 0.16), borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ color: theme.gold, fontFamily: 'Poppins-Black', fontSize: 11 }}>×2 = {(pack.amount * 2).toLocaleString(currentLang())}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Btn compact kind="primary" label={price} loading={busy} disabled={inert} feedback={GameFeedbackEvent.UI_PURCHASE} onPress={onBuy} />
          </View>
        </GamePanel>
        {pack.best ? (
          <Ribbon label={t('store.popular')} style={{ position: 'absolute', top: -7, right: 10, transform: [{ rotate: '-2deg' }], zIndex: 3 }} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

// Mağaza ifade KUTUCUĞU — koleksiyondaki kartlarla aynı dil: kare kutu, ifade
// DURAĞAN durur (animasyon yalnız dokununca açılan popup'ta oynar). İsim,
// açıklama, fiyat yok — fiyat ve satın alma popup'tadır.
function EmoteShopTile({ emote, owned, width, onPress }: {
  emote: EmoteMeta; owned: boolean; width: number; onPress: () => void;
}) {
  const { scale, onIn, onOut } = usePressScale();
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ width }}>
      <Animated.View style={{
        transform: [{ scale }],
        width, height: width, borderRadius: 16,
        backgroundColor: theme.surface2,
        ...(owned ? { borderWidth: 2, borderColor: withAlpha(theme.primary, 0.6) } : { borderTopWidth: 1, borderTopColor: theme.topLight }),
        alignItems: 'center', justifyContent: 'center',
        ...shadowRow,
      }}>
        <EmoteSticker id={emote.id} size={Math.round(width * 0.68)} play={false} />
        {owned ? (
          <View style={{ position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={12} color={theme.ink} />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

// Mağaza + koleksiyonda listelenen güç kimlikleri — render başına yeni dizi
// kurmamak için modül sabiti (sıra, iki listede de aynen bu).
const POWER_ID_LIST: PowerId[] = ['xp2x', 'shield', 'streak', 'training', 'socialtoken'];

// Kıtlık kaydı ↔ dilim-memo el sıkışması: StoreScreen artık memo'lu (aşağıdaki
// karşılaştırıcı) ve take-once kıtlık yuvasını tüketen depsiz efekt RENDER'a
// bağımlı. İkinci bir kıtlık aynı scrollToSection/profil ile gelirse hiçbir
// karşılaştırılan prop değişmez ve memo efekti aç bırakırdı (popup kaybolur,
// bayat pending sonraki ziyarette Apple Pay açardı). Bu yüzden her kayıt bu
// sayacı artırır; karşılaştırıcı sayaç tüketilmemişken bilerek false döner
// (render → efekt yuvayı alır → sayaç eşitlenir → memo yeniden tutar).
let shortfallArrivalSeq = 0;
let shortfallConsumedSeq = 0;
function recordShortfall(missing: number): void {
  setPendingShortfall(missing);
  shortfallArrivalSeq++;
}

// DİLİM-MEMO SÖZLEŞMESİ: StoreScreen state'ten YALNIZ `state.profile` ve Daily
// Shop katalog durumunu okur (notice/error mağaza sekmesinde çizilmez — bkz.
// adReward yorumu). Ekrana yeni bir `state.X` okuması eklersen aşağıdaki
// karşılaştırıcıya da eklemek ZORUNDASIN; yoksa ekran o alana karşı körleşir.
// `actions` kimliğinin sabit olması useCrossover'daki actions-useMemo'suna
// dayanır (sabit değilse memo zararsız bir no-op'a düşer — eski davranış).
export const StoreScreen = memo(function StoreScreen({ state, actions, scrollToSection, onDiamondCelebration, storeActive = true }: Props & { scrollToSection?: 'socialPack' | 'diamonds' | 'top' | 'powers' | null; storeActive?: boolean }) {
  const profile = state.profile;
  const catalog = state.storeCatalog;
  const catalogStatus = state.storeCatalogStatus;
  const catalogError = state.storeCatalogError;
  // One skinned dialog for every store notice (pending/failed/coming-soon/ad errors) —
  // replaces the five native Alert.alert sites. Content stays mounted through the
  // GameModal exit animation; only `open` flips.
  const [storeDialog, setStoreDialog] = useState<{ title: string; body: string; icon: IoniconName; danger?: boolean; coach?: boolean } | null>(null);
  const [storeDialogOpen, setStoreDialogOpen] = useState(false);
  const openStoreDialog = useCallback((d: { title: string; body: string; icon: IoniconName; danger?: boolean; coach?: boolean }) => {
    setStoreDialog(d);
    setStoreDialogOpen(true);
  }, []);
  const adReward = useCallback(() => {
    // Watched a rewarded ad → credit diamonds server-side (persisted + capped).
    // state.notice/error aren't rendered on the Store tab, so give feedback HERE:
    // the celebration overlay on success, a danger dialog with the cap/throttle
    // reason on refusal. The balance updates from the server's ad_reward_result reply.
    actions.grantAdReward()
      .then((granted) => { track('ad_reward_granted', { granted }); if (granted > 0) onDiamondCelebration?.({ amount: granted }); })
      .catch((e: Error) => {
        captureError(e, { where: 'ad_reward' });
        if (!/timeout|disconnected/.test(e?.message ?? '')) {
          openStoreDialog({ title: t('store.adRewardTitle'), body: e?.message || t('store.adRewardFailed'), icon: 'videocam-off', danger: true });
        }
      });
  }, [actions, onDiamondCelebration, openStoreDialog]);
  const { adsWatched, canWatch, watchAd, adLoading, adError, clearAdError } = useAdState(adReward);
  useEffect(() => {
    if (!adError) return;
    openStoreDialog({
      title: t('store.adErrorTitle'),
      body: t('store.adErrorBody', { code: adError.code, details: adError.message ? ` — ${adError.message}` : '' }),
      icon: 'videocam-off',
      danger: true,
    });
    clearAdError();
  }, [adError, clearAdError, openStoreDialog]);
  const storeScrollRef = useRef<ScrollView>(null);
  const sectionYRef = useRef<Record<string, number>>({});

  // ── Apple In-App Purchase (StoreKit): consumable diamond packs + auto-renewable Social Pack ──
  const [buying, setBuying] = useState<string | null>(null); // productId mid-purchase
  const [restoring, setRestoring] = useState(false); // user-initiated Restore in flight
  const [activeSubId, setActiveSubId] = useState<string | null>(null); // active Social Pack plan id (StoreKit entitlement)
  const pendingDiamondIntentRef = useRef<DiamondIntent | null>(null);
  const onPurchaseSuccess = useCallback(async (purchase: Purchase) => {
    const isSub = SOCIAL_PACK_IDS.includes(purchase.productId);
    try {
      // Android: purchaseToken'ın kendisi doğrulama anahtarıdır (JWS Apple'a özgü).
      const receipt = Platform.OS === 'android'
        ? purchase.purchaseToken
        : (purchase.purchaseToken ?? (await getTransactionJwsIOS(purchase.productId)));
      if (!receipt) throw new Error('no-receipt');
      await actions.verifyPurchase(receipt, { productId: purchase.productId, isSubscription: isSub });
      await iapFinishTransaction({ purchase, isConsumable: !isSub });
      triggerFeedback(GameFeedbackEvent.PURCHASE_CONFIRMED);
      track(isSub ? 'social_pack_purchase_success' : 'diamond_purchase_success', { product_id: purchase.productId, kind: isSub ? 'subscription' : 'diamonds', purchase_intent: pendingDiamondIntentRef.current?.source, currentDiamonds: profile?.diamonds ?? 0 });
      // The shortfall popup was only up to explain the auto-opened sheet — once
      // the diamonds actually land it has nothing left to say. (A CANCELLED
      // sheet deliberately leaves it open; that is handled in onPurchaseError.)
      setShowNotEnough(false);
      setShortfall(null);
      if (isSub) {
        // Social Pack: explicit "activated" confirmation, dismissed with Tamam.
        // (CO Pass gets its popup from the GLOBAL premium_road_purchased ack —
        // the server sends that for the IAP path too, so no local dialog here
        // or it would double up.)
        openStoreDialog({ title: t('purchase.doneTitle'), body: t('purchase.socialPackBody'), icon: 'checkmark-circle' });
      } else if (purchase.productId !== COPASS_PRODUCT_ID) {
        const pack = DIAMOND_PACKS.find((p) => p.productId === purchase.productId);
        if (pack) onDiamondCelebration?.({ amount: pack.amount, img: pack.img });
        const intent = pendingDiamondIntentRef.current;
        if (intent?.product === 'power') {
          pendingDiamondIntentRef.current = null;
          if (intent.autoUseAfterPurchase) setPendingAutoUsePower(intent.powerId);
          track('monetization_offer_completed', { offer_id: intent.source, product: intent.powerId, missing_diamonds: intent.missingDiamonds, required_diamonds: intent.requiredDiamonds });
          track('item_purchase_started', { product: intent.powerId, source_screen: intent.source, diamond_balance: intent.currentBalance + (pack?.amount ?? 0) });
          actions.buyPower(intent.powerId);
        }
      }
    } catch (err) {
      captureError(err, { where: 'purchase_success', productId: purchase.productId });
      openStoreDialog({ title: t('store.purchasePendingTitle'), body: t('store.purchasePendingBody'), icon: 'hourglass' });
    } finally {
      setBuying(null);
    }
  }, [actions, onDiamondCelebration, openStoreDialog]);
  const onPurchaseError = useCallback((err: { code?: string }) => {
    setBuying(null);
    const code = err?.code ?? '';
    track(/cancel/i.test(code) ? 'diamond_purchase_cancelled' : 'diamond_purchase_failed', { code });
    if (!/cancel/i.test(code)) openStoreDialog({ title: t('store.purchaseFailedTitle'), body: t('store.purchaseFailedBody'), icon: 'alert-circle', danger: true });
  }, [openStoreDialog]);
  const { connected, products, subscriptions, requestPurchase, fetchProducts } = useIAP({ onPurchaseSuccess, onPurchaseError });
  // Latest actions via a ref: `actions` is a fresh object every render, and having
  // it in the effect deps re-ran the replay loop constantly — its verifies overlapped
  // a live purchase's verify (the stuck-overlay race). Replay runs ONCE per connect.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const replayedRef = useRef(false);
  useEffect(() => {
    if (!connected) { replayedRef.current = false; return; }
    fetchProducts({ skus: [...DIAMOND_PRODUCT_IDS, COPASS_PRODUCT_ID], type: 'in-app' }).catch(() => {});  // consumables + CO Pass
    fetchProducts({ skus: SOCIAL_PACK_IDS, type: 'subs' }).catch(() => {});         // auto-renewable
    if (replayedRef.current) return;
    replayedRef.current = true;
    // Replay any unfinished/available transactions (auto-renewed Social Pack, restores, or a
    // purchase whose grant failed before) — verify each by its JWS so the server grants + we
    // can finish them. granted-0 → no toast (see the reducer).
    getAvailablePurchases().then(async (ps: Purchase[]) => {
      // Which Social Pack plan (if any) the user currently owns — used to show
      // "extend / upgrade / switch" instead of a first-time purchase.
      const sub = (ps ?? []).find((p) => SOCIAL_PACK_IDS.includes(p.productId));
      setActiveSubId(sub ? sub.productId : null);
      for (const p of ps ?? []) {
        const isSubItem = SOCIAL_PACK_IDS.includes(p.productId);
        // Android'de purchaseToken doğrulama anahtarıdır; JWS yalnız iOS'ta.
        const receipt = Platform.OS === 'android'
          ? p.purchaseToken
          : (p.purchaseToken ?? (await getTransactionJwsIOS(p.productId)));
        if (!receipt) continue;
        try {
          await actionsRef.current.verifyPurchase(receipt, { productId: p.productId, isSubscription: isSubItem });
          await iapFinishTransaction({ purchase: p, isConsumable: !isSubItem });
        } catch { /* leave unfinished; retried next launch */ }
      }
    }).catch(() => {});
  }, [connected, fetchProducts]);
  // Fiyat sözlüğü: render başına ~12 priceFor çağrısı vardı ve her biri
  // [...products, ...subscriptions] dizisini yeniden kurup lineer arıyordu.
  // Ürün listeleri değişince BİR kez Map kurulur; ilk eşleşme kazanır ve
  // displayPrice'sız kayıt da yuvayı tutar — eski find() ile birebir aynı sonuç.
  const priceMap = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const p of [...(products as { id?: string; displayPrice?: string }[]), ...(subscriptions as { id?: string; displayPrice?: string }[])]) {
      if (p.id != null && !m.has(p.id)) m.set(p.id, p.displayPrice);
    }
    return m;
  }, [products, subscriptions]);
  const priceFor = (productId: string, fallback: string) => priceMap.get(productId) ?? fallback;
  const buy = useCallback((productId: string) => {
    if (buying) return;
    // Until the product exists in App Store Connect it won't load — show a gentle
    // "coming soon" instead of a payment error (e.g. in builds before IAP is set up).
    const loaded = [...products, ...subscriptions].some((p) => (p as { id?: string }).id === productId);
    if (!loaded) { openStoreDialog({ title: t('store.comingSoonTitle'), body: t('store.comingSoonBody'), icon: 'time', coach: true }); return; }
    // ANDROID KAPISI (2026-08-29): sunucuda Google doğrulaması (service account)
    // kurulu değilse satın almayı BAŞLATMA — ödeme alınıp hak verilememesi
    // riskini kapatır. iOS bu kapıdan etkilenmez.
    if (Platform.OS === 'android' && !getMonetizationConfig().androidIapReady) {
      openStoreDialog({ title: t('store.comingSoonTitle'), body: t('store.comingSoonBody'), icon: 'time', coach: true });
      return;
    }
    const isSub = SOCIAL_PACK_IDS.includes(productId);
    setBuying(productId);
    track(isSub ? 'social_pack_purchase_started' : 'diamond_package_selected', { product_id: productId, kind: isSub ? 'subscription' : 'diamonds', source_screen: pendingDiamondIntentRef.current?.source ?? 'store', currentDiamonds: profile?.diamonds ?? 0 });
    // ANDROID DESTEĞİ (2026-08-29): önceden yalnız `apple` isteği kuruluyordu,
    // bu yüzden Android'de satın alma hiç başlamıyordu. Her iki mağaza da tek
    // çağrıda tanımlanır; react-native-iap çalıştığı platformunkini kullanır.
    const apple = { sku: productId, appAccountToken: profile?.userId ?? undefined };
    const google = { skus: [productId] };
    Promise.resolve(requestPurchase({ request: { apple, google }, type: isSub ? 'subs' : 'in-app' })).catch(() => setBuying(null));
  }, [buying, requestPurchase, products, subscriptions, profile?.userId]);
  // Effects and modal-exit handlers below need the CURRENT buy without being in
  // its dependency chain.
  const buyRef = useRef(buy); buyRef.current = buy;

  // ── Kıtlık → StoreKit el sıkışması: OLAY GÜDÜMLÜ, kör zamanlayıcı değil ──
  // Eski akış "yetersiz elmas" penceresini açıp 380ms kör setTimeout ile sayfayı
  // ateşliyordu: her seferinde ~350ms ölü bekleme, üstelik kuyruklu sunumlarda
  // (ör. Seviye Yolu'nun slide kapanışı modalTraffic'te pencereyi 340ms tutar)
  // yarış payı ~40ms'e düşüyordu. Şimdi bekleyen ürün bir ref'te durur ve
  // pencerenin GERÇEK native sunumu (GameModal onShown ← RN Modal onShow)
  // ateşler — sayfa asla sunumdan önce açılamaz. İki emniyet:
  //  1) pencere ZATEN sunuluysa (ikinci kıtlık aynı pencereye gelir, visible
  //     false→true geçişi yok → onShow tekrar GELMEZ) bir sonraki karede ateşle;
  //  2) onShown hiç gelmezse 600ms'lik tek atımlık taban zamanlayıcı eski
  //     davranışı korur — asla asılı kalmaz. Olay/zamanlayıcıdan önce çalışan
  //     diğerini iptal eder ve ürün kimliği ateşlemeden ÖNCE boşaltılır:
  //     çift ateşleme yapısal olarak imkânsız (buy'ın kendi `buying` kilidi de
  //     ayrıca durur).
  const pendingBuyRef = useRef<string | null>(null);
  const notEnoughShownRef = useRef(false); // pencere şu an native sunulu mu (onShown/onExited günceller)
  const pendingBuyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firePendingBuy = useCallback(() => {
    if (pendingBuyTimerRef.current) { clearTimeout(pendingBuyTimerRef.current); pendingBuyTimerRef.current = null; }
    const pid = pendingBuyRef.current;
    if (pid == null) return;
    pendingBuyRef.current = null;
    buyRef.current(pid);
  }, []);
  // Ortak kıtlık dizisi — dört çağrı yeri (ekranlar arası varış, güç / CO Pass /
  // ifade onayı) aynı akışı paylaşır: popup'ı aç, sayfayı sunum-sonrasına kuyrukla.
  const openShortfallSheet = useCallback((missing: number, reason?: { required?: number; current?: number; source?: string }, intent?: DiamondIntent | null) => {
    const pack = packForShortfall(missing);
    pendingDiamondIntentRef.current = intent ?? null;
    setShortfall({ missing, productId: pack.productId, required: reason?.required, current: reason?.current, source: reason?.source, intent: intent ?? null });
    track('diamond_store_opened', { source: reason?.source ?? intent?.source, missingDiamonds: missing, requiredDiamonds: reason?.required, currentDiamonds: reason?.current ?? profile?.diamonds ?? 0, product: intent?.product === 'power' ? intent.powerId : undefined });
    track('diamond_offer_impression', { source: reason?.source ?? intent?.source, missingDiamonds: missing, currentDiamonds: reason?.current ?? profile?.diamonds ?? 0, product: intent?.product === 'power' ? intent.powerId : undefined });
    setShowNotEnough(true);
    pendingBuyRef.current = pack.productId;
    if (pendingBuyTimerRef.current) { clearTimeout(pendingBuyTimerRef.current); pendingBuyTimerRef.current = null; }
    if (notEnoughShownRef.current) requestAnimationFrame(firePendingBuy);
    else pendingBuyTimerRef.current = setTimeout(firePendingBuy, 600);
  }, [firePendingBuy]);

  // Cross-screen insufficient-diamonds arrivals (avatar, name change, level
  // road): a caller recorded its shortfall and jumped here — open the covering
  // pack's sheet with the AL/VAZGEC popup behind it, same as the emote flow.
  // No dep array ON PURPOSE: the slot is take-once, so checking every commit is
  // free — keying on [scrollToSection] silently dropped a second arrival with
  // the same section (avatar shortfall twice → storeSection already 'diamonds'
  // → effect never re-ran → no popup, and the stale pending value opened an
  // Apple Pay sheet on a later, unrelated store visit). No cleanup either: the
  // pending-buy handoff lives in refs outside this effect, so there is nothing
  // a re-run could cancel.
  useEffect(() => {
    // Sayaç ÖNCE eşitlenir (yuva boş olsa bile): memo karşılaştırıcısı yeniden
    // tutmaya başlar; yeni bir kayıt sayacı tekrar artırıp render'ı zorlar.
    shortfallConsumedSeq = shortfallArrivalSeq;
    const missing = takePendingShortfall();
    const reason = takePendingShortfallReason();
    const intent = takePendingDiamondIntent();
    if (missing == null) return;
    openShortfallSheet(missing, reason ?? undefined, intent);
  });

  // Guideline 3.1.1: a DISTINCT, user-initiated Restore. The launch-time replay in
  // the effect above does NOT satisfy this — App Review names that case explicitly
  // ("automatically restoring purchases on launch will not resolve this issue").
  // Re-verifies every StoreKit entitlement server-side, so a reinstall or a second
  // device gets its Social Pack back (and any diamonds whose grant never landed).
  const restorePurchases = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const ps: Purchase[] = (await getAvailablePurchases()) ?? [];
      const sub = ps.find((p) => SOCIAL_PACK_IDS.includes(p.productId));
      setActiveSubId(sub ? sub.productId : null);
      let restored = 0;
      for (const p of ps) {
        const isSubItem = SOCIAL_PACK_IDS.includes(p.productId);
        const receipt = Platform.OS === 'android'
          ? p.purchaseToken
          : (p.purchaseToken ?? (await getTransactionJwsIOS(p.productId)));
        if (!receipt) continue;
        try {
          await actionsRef.current.verifyPurchase(receipt, { productId: p.productId, isSubscription: isSubItem });
          await iapFinishTransaction({ purchase: p, isConsumable: !isSubItem });
          restored += 1;
        } catch { /* one bad entitlement must not abort the rest of the restore */ }
      }
      track('restore_purchases', { restored });
      openStoreDialog({
        title: t('store.restoreTitle'),
        body: restored > 0 ? t('store.restoreDone') : t('store.restoreNone'),
        icon: restored > 0 ? 'checkmark-circle' : 'information-circle',
      });
    } catch (err) {
      captureError(err, { where: 'restore_purchases' });
      openStoreDialog({ title: t('store.restoreTitle'), body: t('store.restoreFailed'), icon: 'alert-circle', danger: true });
    } finally {
      setRestoring(false);
    }
  }, [restoring, openStoreDialog]);

  useEffect(() => {
    if (scrollToSection && storeScrollRef.current) {
      // 'top' is the re-tap toggle's return trip — plain scroll to the very top.
      const y = scrollToSection === 'top' ? 0 : sectionYRef.current[scrollToSection];
      if (y !== undefined) {
        setTimeout(() => storeScrollRef.current?.scrollTo({ y, animated: true }), 150);
      }
    }
  }, [scrollToSection]);

  // Does the user have a Social Pack right now (server-authoritative expiry)?
  const hasActivePack = !!(profile?.socialPackUntil && new Date(profile.socialPackUntil) > new Date());

  // Haftalık vitrin grupları: emoteWeeks() statik PREMIUM_EMOTES üzerinde saf
  // bir gruplama — her render'da Map + sort yapmak yerine bir kez kurulur.
  const weeks = useMemo(() => emoteWeeks(), []);

  // "Not enough gems" dialog (weekly emote shop) — its CTA deep-links to the packs.
  const [showNotEnough, setShowNotEnough] = useState(false);
  // How short the player was, and which pack we auto-opened for them. Held while
  // the StoreKit sheet is up so the popup can stay behind it: dismissing Apple
  // Pay must leave this explaining what happened, not vanish silently.
  const [shortfall, setShortfall] = useState<{ missing: number; productId: string; required?: number; current?: number; source?: string; intent?: DiamondIntent | null } | null>(null);
  // Satın alma onayı: fiyat butonu artık DOĞRUDAN satın almaz — animasyonlu
  // önizlemeli "emin misin?" penceresi açar. İçerik, pencerenin çıkış
  // animasyonu boyunca ekranda kalsın diye ayrı `open` bayrağıyla tutulur.
  const [confirmEmote, setConfirmEmote] = useState<EmoteMeta | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCosmetic, setConfirmCosmetic] = useState<StoreCatalogItem | null>(null);
  // Open "not enough gems" only AFTER the buy-confirm modal's native dismissal
  // finishes (via onExited) — flipping both in one commit overlaps two native
  // <SafeModal>s and iOS freezes the app (dead touches + scroll). Holds the missing
  // amount recorded at confirm (null = nothing pending) — the powerShortfall
  // pattern, so the handoff never depends on render-closure state.
  const notEnoughOnExit = useRef<number | null>(null);
  // CO Pass modal hands off to another native surface after its own dismissal:
  // 'notEnough' → the insufficient-diamonds popup, 'buyMoney' → the StoreKit sheet.
  // Deferring past the modal's exit avoids the two-native-surfaces freeze.
  const coPassExit = useRef<null | 'notEnough' | 'buyMoney'>(null);
  const coPassMissing = useRef<number | null>(null);
  // Mağazadan güç satın alma onayı
  const [confirmPower, setConfirmPower] = useState<PowerId | null>(null);
  const [confirmSpecial, setConfirmSpecial] = useState<SpecialPowerIdView | null>(null);
  const powerShortfall = useRef<number | null>(null); // insufficient at confirm -> hand off on exit
  const powerShortfallReason = useRef<{ required?: number; current?: number; source?: string } | null>(null);
  // CO Pass satın alma onayı (mağazadan doğrudan)
  const [confirmCoPass, setConfirmCoPass] = useState(false);
  // İfade vitrini kutu boyu — konteyner genişliğinden ölçülür (kesilme olmasın)
  const [shelfW, setShelfW] = useState(0);
  useEffect(() => {
    if (!storeActive || !profile || catalogStatus !== 'idle') return;
    actions.loadStoreCatalog();
  }, [actions, catalogStatus, profile, storeActive]);
  const featuredCosmetics = useMemo(() => {
    const items = catalog?.items ?? [];
    const byId = new Map(items.map((item) => [item.id, item]));
    const ids = catalog?.featured ?? [];
    const featured = ids.map((id) => byId.get(id)).filter((item): item is StoreCatalogItem => Boolean(item));
    return featured.length ? featured : items.filter((item) => item.diamondPrice > 0).slice(0, 8);
  }, [catalog]);

  // Staggered section entrance: fade + 12px rise, 200ms each, 40ms stagger.
  // One entry per animated store section (socialPack, coPass, freeDiamonds,
  // diamonds, restore). Keep in sync with the highest sectionIn(i) below —
  // sectionIn falls back rather than dereferencing undefined if it drifts.
  const sectionAnims = useRef(Array.from({ length: 5 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(40, sectionAnims.map((v) =>
      Animated.timing(v, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    )).start();
  }, [sectionAnims]);
  const sectionIn = (i: number) => {
    // Never `sectionAnims[i]!` — an index past the end used to deref undefined and
    // take the whole Store screen down at render time (TS can't see it through the
    // non-null assertion). Falling back to the first value degrades the stagger,
    // not the screen.
    const v = sectionAnims[i] ?? sectionAnims[0]!;
    return {
      opacity: v,
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    };
  };

  // Entitlement flips (plan buttons ⇄ AKTİF chip) crossfade instead of snapping.
  const packFlip = useRef(new Animated.Value(1)).current;
  const packStateSeen = useRef(hasActivePack);
  useEffect(() => {
    if (packStateSeen.current === hasActivePack) return;
    packStateSeen.current = hasActivePack;
    packFlip.setValue(0);
    Animated.timing(packFlip, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [hasActivePack, packFlip]);

  return (
    <Screen>
      {/* nestedScrollEnabled: Android'de sekmeler yatay pager içinde yaşıyor ve
          pager'ın eksen kilidi yalnız iOS'ta çalışıyor — bu olmadan dikey
          sürükleme pager'a kaçıyor, mağaza kaymak yerine Koleksiyon'a atıyordu
          (oyuncu raporu 2026-08-29). */}
      <ScrollView ref={storeScrollRef} style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={t('store.title')} icon="storefront" />

        {/* Sosyal Paket — hero panel (gold frame + gloss), corner ribbon status */}
        <Animated.View style={sectionIn(0)} onLayout={(e) => { sectionYRef.current['socialPack'] = e.nativeEvent.layout.y; }}>
          <SectionHeader label={t('store.socialPackSection')} icon="people" />
          <View style={{ marginVertical: 5 }}>
            <GamePanel hero>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="people" size={24} color={theme.accent} />
                  <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('store.socialPackTitle')}</Text>
                </View>
                <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>
                  {t('store.socialPackDesc')}
                </Text>
                {hasActivePack && profile?.socialPackUntil ? (
                  <Animated.View style={{ opacity: packFlip, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: theme.panelInnerFill, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.primary, marginTop: 2 }}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>
                      {t('store.activeUntil', { date: new Date(profile.socialPackUntil).toLocaleDateString(currentLang()) })}
                    </Text>
                  </Animated.View>
                ) : null}
                {/* While the pack is active we only show the "AKTİF" status above — the
                    purchase buttons are hidden so it doesn't look re-purchasable. They
                    come back automatically once the entitlement expires. */}
                {!hasActivePack ? (
                  <Animated.View style={{ opacity: packFlip, flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {SOCIAL_PACK.map((sp, i) => {
                      const busy = buying === sp.productId;
                      return (
                        <View key={sp.id} style={{ flex: 1 }}>
                          <Text style={{ color: theme.muted, fontFamily: 'Poppins-ExtraBold', fontSize: 11, textAlign: 'center', textDecorationLine: 'line-through', marginBottom: 3 }}>{sp.wasPrice}</Text>
                          <Btn
                            label={`${t(`store.${sp.id}` as MessageKey)} · ${priceFor(sp.productId, sp.price)}`}
                            kind={i === 1 ? 'accent' : 'blue'}
                            compact
                            loading={busy}
                            disabled={!!buying && !busy}
                            feedback={GameFeedbackEvent.UI_PURCHASE}
                            onPress={() => buy(sp.productId)}
                          />
                          {i === 1 ? <Ribbon label={t('store.bestValue')} style={{ position: 'absolute', top: 10, right: 4, transform: [{ rotate: '-2deg' }], zIndex: 3 }} /> : null}
                        </View>
                      );
                    })}
                  </Animated.View>
                ) : null}
                {/* Subscription disclosure — guideline 3.1.2(c) requires the title,
                    the length, the price AND working Terms/privacy links to be
                    inside the purchase flow itself, not only in the metadata. The
                    title + price are on the buttons above; length, auto-renewal
                    terms and the two links live here. */}
                {!hasActivePack ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {SOCIAL_PACK.map((sp) => (
                        <Text key={sp.id} style={{ flex: 1, color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>
                          {`${t(`store.${sp.id}` as MessageKey)} · ${t(sp.id === 'weekly' ? 'store.subLengthWeekly' : 'store.subLengthMonthly')} · ${priceFor(sp.productId, sp.price)}`}
                        </Text>
                      ))}
                    </View>
                    <Text style={{ color: theme.muted, fontSize: 10, lineHeight: 15, fontFamily: 'Poppins-SemiBold' }}>
                      {t('store.autoRenewNote')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable style={({ pressed }) => [linkChip(pressed), { flex: 1 }]} onPress={() => openLink(INFO_LINKS.terms)}>
                        <Ionicons name="document-text-outline" size={14} color={theme.muted} />
                        <Text style={linkTxt} numberOfLines={1}>{t('store.termsLink')}</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [linkChip(pressed), { flex: 1 }]} onPress={() => openLink(INFO_LINKS.privacy)}>
                        <Ionicons name="shield-checkmark-outline" size={14} color={theme.muted} />
                        <Text style={linkTxt} numberOfLines={1}>{t('store.privacyLink')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </GamePanel>
            <Ribbon
              label={hasActivePack ? t('store.badgeActive') : t('store.badgeNew')}
              color={hasActivePack ? theme.primary : theme.danger}
              style={{ position: 'absolute', top: -7, right: 12, transform: [{ rotate: '-2deg' }], zIndex: 3 }}
            />
          </View>
        </Animated.View>

        <Animated.View style={sectionIn(1)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 6 }}>
            <SectionHeader label="Weekly shop" icon="sparkles" style={{ flex: 1, marginTop: 0, marginBottom: 0 }} />
            {catalog?.weeklyResetAt || catalog?.dailyResetAt ? <WeeklyCountdown resetAt={catalog?.weeklyResetAt} /> : null}
          </View>
          {catalogStatus === 'idle' || catalogStatus === 'loading' ? (
            <View style={[styles.storeEmoteCard, { minHeight: 94, justifyContent: 'center' }]}>
              <GameSpinner />
              <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 12 }}>Katalog yükleniyor…</Text>
            </View>
          ) : catalogStatus === 'error' ? (
            <View style={[styles.storeEmoteCard, { minHeight: 132, justifyContent: 'center' }]}>
              <EmptyState
                icon="cloud-offline"
                title={catalogError ?? 'Mağaza şu anda yüklenemedi. Tekrar dene.'}
                cta={<Btn compact kind="blue" label="Tekrar dene" onPress={actions.loadStoreCatalog} />}
                style={{ paddingVertical: 12 }}
              />
            </View>
          ) : featuredCosmetics.length === 0 ? (
            <View style={[styles.storeEmoteCard, { minHeight: 118, justifyContent: 'center' }]}>
              <EmptyState icon="sparkles" title="Mağazada şu anda ürün yok" style={{ paddingVertical: 12 }} />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {featuredCosmetics.map((item) => (
                <CosmeticShopTile
                  key={item.id}
                  item={item}
                  owned={ownsStoreCosmetic(profile, item)}
                  equipped={isEquippedCosmetic(profile, item)}
                  vault={item.id === catalog?.vaultItemId}
                  onPress={() => { track('cosmetic_viewed', { item_id: item.id, type: item.type, rarity: item.rarity, vault: item.id === catalog?.vaultItemId }); setConfirmCosmetic(item); }}
                />
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* CO Pass — Seviye Yolu'ndaki premium şeridin mağazadaki karşılığı;
            kalıcı, tek seferlik satın alma (sezon sıfırlamasında yeniden alınır). */}
        <Animated.View style={sectionIn(1)} onLayout={(e) => { sectionYRef.current['coPass'] = e.nativeEvent.layout.y; }}>
          <SectionHeader label={t('store.coPassSection')} icon="medal" />
          <View style={{ marginVertical: 5 }}>
            <GamePanel hero>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="medal" size={24} color={theme.gold} />
                  <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('premium.bannerTitle')}</Text>
                </View>
                <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>
                  {t('premium.bannerDesc')}
                </Text>
                {profile?.premiumRoad ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: theme.panelInnerFill, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.primary, marginTop: 2 }}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>{t('store.badgeActive')}</Text>
                  </View>
                ) : (
                  <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                      <Btn
                        compact
                        kind="accent"
                        gem
                        label={String(PREMIUM_ROAD_PRICE)}
                        feedback={GameFeedbackEvent.UI_PURCHASE}
                        onPress={() => {
                        setConfirmCoPass(true); // modal offers BOTH 2000 diamonds and ₺ purchase
                      }}
                    />
                  </View>
                )}
              </View>
            </GamePanel>
            <Ribbon
              label={t('premium.ribbon')}
              color={theme.gold}
              style={{ position: 'absolute', top: -7, right: 12, transform: [{ rotate: '-2deg' }], zIndex: 3 }}
            />
          </View>
        </Animated.View>

        {/* Haftalık ifade dükkanı — sıralama kullanıcı kararı: Sosyal Paket'in
            hemen altında, elmasların üstünde (satışlar burada — koleksiyonda değil) */}
        <Animated.View style={sectionIn(1)}>
          {weeks.map(({ week, emotes }) => {
            // Sahip olunan ifadeler vitrinde GÖSTERİLMEZ — yalnız alınabilir olanlar
            const unowned = emotes.filter((e) => !ownsEmote(profile, e.id));
            if (unowned.length === 0) return null;
            return (
            <View key={week}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6 }}>
                <SectionHeader
                  label={week === LATEST_WEEK ? t('store.thisWeek') : t('store.weekEmotes', { week })}
                  icon="happy"
                  style={{ flex: 1, marginTop: 0, marginBottom: 0 }}
                />
                {week === LATEST_WEEK ? (
                  <>
                    <Ribbon label={t('store.badgeNew')} color={theme.danger} />
                    <WeeklyCountdown />
                  </>
                ) : null}
              </View>
              {/* 3'erli kutucuk ızgarası — genişlik KONTEYNERDEN ölçülür (taşma/kesilme
                  imkânsız), sıralar tam ortalı; animasyon yalnız popup'ta oynar */}
              <View
                onLayout={(e) => setShelfW(e.nativeEvent.layout.width)}
                style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}
              >
                {shelfW > 0 ? unowned.map((e) => (
                  <EmoteShopTile
                    key={e.id}
                    emote={e}
                    owned={false}
                    width={Math.floor((shelfW - 20) / 3)}
                    onPress={() => { setConfirmEmote(e); setConfirmOpen(true); }}
                  />
                )) : null}
              </View>
            </View>
            );
          })}
        </Animated.View>

        {/* MAÇ GÜÇLERİ — maç içi Özel Güçler. Fiyatlar store_catalog.specialPowers'tan
            (sunucu config'i); "maç başına 1 kullanım" burada AÇIKÇA yazılır (spec §47). */}
        <Animated.View style={sectionIn(2)}>
          <SectionHeader label={t('store.specialPowers')} icon="sparkles" />
          <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', marginLeft: 4, marginBottom: 8, lineHeight: 15 }}>{t('store.spDisclosure')}</Text>
          {SPECIAL_POWER_LIST.map((spid) => {
            const meta = SPECIAL_POWERS[spid];
            const count = spInventoryCount(profile, spid);
            const price = catalog?.specialPowers?.find((x) => x.id === spid)?.price ?? SPECIAL_POWER_PRICE_FALLBACK[spid];
            const equippedList = (profile?.equippedSpecialPowers ?? (profile?.equippedSpecialPower ? [profile.equippedSpecialPower] : [])) as string[];
            const equipped = equippedList.includes(spid);
            return (
              <View key={spid} style={styles.storeEmoteCard}>
                <View>
                  <SpecialPowerBadge id={spid} size={52} />
                  {/* Tek rozet kuralı (kullanıcı kararı 2026-08-29): aynı ikonda
                      x3 paket + x2 envanter çifte sayı karmaşasıydı — envanter rozeti
                      KALDIRILDI (adet Koleksiyon > Güçler'de görünüyor); bizim altın
                      x3 paket rozeti kalır ve SAĞ-ÜSTTE durur. */}
                  <View style={{ position: 'absolute', right: -5, top: -5, backgroundColor: theme.gold, borderRadius: 999, paddingHorizontal: 5, height: 17, borderWidth: 2, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#231A00', fontSize: 9, fontFamily: 'Poppins-Black' }}>x3</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t(meta.nameKey)}</Text>
                  <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', lineHeight: 14 }} numberOfLines={2}>{t(meta.descKey)}</Text>
                  {count > 0 ? (
                    <Pressable hitSlop={6} onPress={() => { triggerFeedback(GameFeedbackEvent.UI_TOGGLE_ON); actions.equipSpecialPower(equipped ? null : spid); }}>
                      <Text style={{ color: equipped ? theme.primary : theme.muted, fontSize: 10.5, fontFamily: 'Poppins-Black', letterSpacing: 0.6, marginTop: 2 }}>
                        {equipped ? '✓ ' + t('store.spEquipped') : t('store.spEquip')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Btn
                  compact
                  kind="primary"
                  gem
                  label={String(price)}
                  feedback={GameFeedbackEvent.UI_PURCHASE}
                  onPress={() => {
                    const have = profile?.diamonds ?? 0;
                    if (have >= price) setConfirmSpecial(spid);
                    else openShortfallSheet(price - have, { required: price, current: have, source: 'store_special_power' });
                  }}
                />
              </View>
            );
          })}
        </Animated.View>

        {/* Güçler — tek kullanımlık, stoklanabilir; Seviye Yolu dışında buradan da alınır */}
        <Animated.View style={sectionIn(2)} onLayout={(e) => { sectionYRef.current['powers'] = e.nativeEvent.layout.y; }}>
          <SectionHeader label={t('store.powers')} icon="flash" />
          {POWER_ID_LIST.map((pid) => {
            const price = POWER_PRICES[pid];
            const count = pid === 'xp2x' ? (profile?.powerXp2x ?? 0) : pid === 'shield' ? (profile?.powerShield ?? 0) : pid === 'streak' ? (profile?.powerStreak ?? 0) : pid === 'training' ? (profile?.powerTraining ?? 0) : (profile?.powerSocialToken ?? 0);
            return (
              <View key={pid} style={styles.storeEmoteCard}>
                <View>
                  <PowerArt powerId={pid} size={56} />
                  {count > 0 ? (
                    <View style={{ position: 'absolute', right: -6, top: -6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: POWERS[pid].color, borderWidth: 2, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: theme.ink, fontSize: 10, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>x{count}</Text>
                    </View>
                  ) : null}
                </View>
                {/* Ad + "elinde N adet": rozetteki x4 ENVANTER sayisi, paket
                    adedi degil. Ikisi yan yana durunca "4 tanesi 250 elmas"
                    diye okunuyordu (kullanici sikayeti 2026-08-27). */}
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t(POWERS[pid].nameKey)}</Text>
                  {count > 0 ? (
                    <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold' }}>{t('store.powerOwned', { n: String(count) })}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Btn
                    compact
                    kind="primary"
                    gem
                    label={String(price)}
                    feedback={GameFeedbackEvent.UI_PURCHASE}
                    onPress={() => {
                      const have = profile?.diamonds ?? 0;
                      if (have >= price) setConfirmPower(pid);
                      else openShortfallSheet(price - have, { required: price, current: have, source: 'store_power' });
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Animated.View>

        {/* Free diamonds - watch ads (unlimited) */}
        <Animated.View style={sectionIn(2)}>
          <SectionHeader label={t('store.freeDiamonds')} icon="gift" />
          <AdRewardCard adLoading={adLoading} adsWatched={adsWatched} onWatch={watchAd} />
        </Animated.View>

        {/* Diamond packs */}
        <Animated.View style={sectionIn(3)} onLayout={(e) => { sectionYRef.current['diamonds'] = e.nativeEvent.layout.y; }}>
          <SectionHeader label={t('store.packs')} icon="diamond" />
          {/* İLK ALIMA 2x: sunucu hakkı tükenene kadar gösterir; katlamayı da
              satın alma anında sunucu uygular (rozet süs değil, gerçek). */}
          {catalog?.firstDiamondDoubleAvailable ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: withAlpha(theme.gold, 0.13), borderRadius: 12, paddingVertical: 8, paddingHorizontal: 11, marginBottom: 3 }}>
              <Ionicons name="gift" size={15} color={theme.gold} />
              <Text style={{ color: theme.gold, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5, flex: 1 }}>İlk elmas paketin 2 KAT yatar — hangi paketi seçersen seç!</Text>
            </View>
          ) : null}
          {DIAMOND_PACKS.map((pack) => (
            <DiamondPackRow
              key={pack.id}
              pack={pack}
              busy={buying === pack.productId}
              inert={!!buying && buying !== pack.productId}
              price={priceFor(pack.productId, pack.price)}
              firstDouble={!!catalog?.firstDiamondDoubleAvailable}
              onBuy={() => buy(pack.productId)}
            />
          ))}
        </Animated.View>

        {/* Guideline 3.1.1 — a distinct, always-visible Restore action. Kept at the
            end of the store (after the packs) so it reads as a utility, not an
            offer, but it is never hidden behind a menu. */}
        <Animated.View style={[sectionIn(4), { marginTop: 6, marginBottom: 4 }]}>
          <Btn
            big
            kind="ghost"
            icon="refresh"
            label={t('store.restore')}
            loading={restoring}
            disabled={restoring}
            onPress={() => { void restorePurchases(); }}
          />
        </Animated.View>
      </ScrollView>

      <GameModal
        visible={storeDialogOpen}
        onClose={() => setStoreDialogOpen(false)}
        title={storeDialog?.title ?? ''}
        icon={storeDialog?.icon}
        danger={storeDialog?.danger}
        coach={storeDialog?.coach}
      >
        <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
          {storeDialog?.body ?? ''}
        </Text>
        <Btn big label={t('settings.confirm')} onPress={() => setStoreDialogOpen(false)} />
      </GameModal>

      {/* Not enough gems for a weekly emote → gold CTA scrolls to the diamond packs */}
      {/* Insufficient diamonds. When we know exactly how short the player is we
          auto-open the cheapest covering pack's StoreKit sheet (fired from the
          previous modal's onExited) and keep THIS popup behind it — dismissing
          Apple Pay lands back here rather than on a blank screen, and "Al" can
          re-open the sheet. Without a known shortfall it degrades to the old
          "go to the diamond packs" behaviour. */}
      <GameModal
        visible={showNotEnough}
        onClose={() => { setShowNotEnough(false); setShortfall(null); }}
        // Sunum GERÇEKTEN tamamlandı → bekleyen StoreKit alımı şimdi güvenle açılabilir.
        onShown={() => { notEnoughShownRef.current = true; firePendingBuy(); }}
        onExited={() => { notEnoughShownRef.current = false; }}
        title={t('store.notEnoughGemsTitle')} icon="diamond">
        {shortfall ? (() => {
          const pack = DIAMOND_PACKS.find((p) => p.productId === shortfall.productId) ?? DIAMOND_PACKS[0]!;
          return (
            <>
              <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
                {shortfall.intent?.product === 'power'
                  ? t('store.notEnoughPowerNeed', { n: String(shortfall.missing) })
                  : t('store.notEnoughNeed', { n: String(shortfall.missing) })}
              </Text>
              {typeof shortfall.required === 'number' && typeof shortfall.current === 'number' ? (
                <View style={{ alignSelf: 'stretch', backgroundColor: theme.well, borderRadius: 12, padding: 10, gap: 6, borderTopWidth: 1, borderTopColor: theme.shadowInk }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold' }}>{t('store.required')}</Text>
                    <Text style={{ color: theme.text, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>{shortfall.required} 💎</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold' }}>{t('store.youHave')}</Text>
                    <Text style={{ color: theme.text, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>{shortfall.current} 💎</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold' }}>{t('store.missing')}</Text>
                    <Text style={{ color: theme.danger, fontSize: 12, fontFamily: 'Poppins-ExtraBold' }}>{shortfall.missing} 💎</Text>
                  </View>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.panelInnerFill, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: theme.topLight }}>
                <ExpoImage source={pack.img} style={{ width: 34, height: 34 }} contentFit="contain" />
                <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold' }}>{pack.label}</Text>
                <GemIcon size={13} />
                <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold' }}>{pack.amount}</Text>
              </View>
              <Text style={{ color: theme.primary, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>
                {t('store.packageCoversIntent')}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>
                {t('store.notEnoughProcessing')}
              </Text>
              <Btn
                big
                kind="accent"
                icon="cart"
                loading={buying === pack.productId}
                label={`${t('store.buyNow')} · ${priceFor(pack.productId, pack.price)}`}
                onPress={() => buy(pack.productId)}
              />
              {/* 🎬 Küçük açıklar reklamla kapanabilir (kullanıcı onayı 2026-08-29):
                  eksik ≤15 💎 ise "reklam izle → +5" ikinci yol olarak sunulur —
                  satın almanın alternatifi değil, küçük farkın dostu. */}
              {getMonetizationConfig().ads.rewardedShortfall && shortfall.missing <= 15 ? (
                <Btn
                  compact kind="primary" icon="videocam"
                  label={t('ads.shortfallCta')}
                  feedback={GameFeedbackEvent.UI_TAP}
                  onPress={() => {
                    track('ad_reward_shortfall_tap', { missing: shortfall.missing, source: shortfall.source });
                    setShowNotEnough(false); setShortfall(null);
                    void watchAd();
                  }}
                />
              ) : null}
              <Btn label={t('store.cancel')} kind="ghost" onPress={() => { setShowNotEnough(false); setShortfall(null); }} />
            </>
          );
        })() : (
          <>
            <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
              {t('store.notEnoughGemsBody')}
            </Text>
            <Btn
              big
              kind="accent"
              icon="diamond"
              label={t('store.goToDiamonds')}
              onPress={() => {
                setShowNotEnough(false);
                const y = sectionYRef.current['diamonds'];
                if (y !== undefined) storeScrollRef.current?.scrollTo({ y, animated: true });
              }}
            />
          </>
        )}
      </GameModal>

      {/* Güç satın alma onayı */}
      <GameModal
        visible={confirmPower != null}
        onClose={() => setConfirmPower(null)}
        onExited={() => {
          const m = powerShortfall.current;
          const reason = powerShortfallReason.current;
          powerShortfall.current = null;
          powerShortfallReason.current = null;
          if (m == null) return;
          // Popup önce; StoreKit sayfası popup'ın GERÇEK sunum sinyaliyle (kör 380ms değil).
          openShortfallSheet(m, reason ?? undefined);
        }}
        title={confirmPower ? t(POWERS[confirmPower].nameKey).toLocaleUpperCase(currentLang()) : ''}
        icon={confirmPower ? POWERS[confirmPower].icon : 'flash'}
      >
        {confirmPower ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <PowerArt powerId={confirmPower} size={84} />
            <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 18 }}>{t(POWERS[confirmPower].descKey)}</Text>
            <Text style={{ color: theme.text, fontSize: 12, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{t('power.buyConfirm')}</Text>
            <View style={{ alignSelf: 'stretch', marginTop: 4, gap: 8 }}>
              <Btn big kind="primary" gem label={String(POWER_PRICES[confirmPower])} feedback={GameFeedbackEvent.UI_PURCHASE} onPress={() => {
              const pid = confirmPower;
              const price = POWER_PRICES[pid];
              const have = profile?.diamonds ?? 0;
              if (have >= price) { setConfirmPower(null); actions.buyPower(pid); }
              else { powerShortfall.current = price - have; powerShortfallReason.current = { required: price, current: have, source: 'store_power_confirm' }; setConfirmPower(null); }
            }} />
              <Btn label={t('store.cancel')} kind="ghost" onPress={() => setConfirmPower(null)} />
            </View>
          </View>
        ) : null}
      </GameModal>

      {/* Özel Güç satın alma onayı — fiyat + 'maç başına 1 kullanım' açıklaması */}
      <GameModal
        visible={confirmSpecial != null}
        onClose={() => setConfirmSpecial(null)}
        title={confirmSpecial ? t(SPECIAL_POWERS[confirmSpecial].nameKey).toLocaleUpperCase(currentLang()) : ''}
        icon={confirmSpecial ? SPECIAL_POWERS[confirmSpecial].icon : 'sparkles'}
      >
        {confirmSpecial ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View>
              <SpecialPowerBadge id={confirmSpecial} size={96} />
              <View style={{ position: 'absolute', right: -7, bottom: -3, backgroundColor: theme.gold, borderRadius: 999, paddingHorizontal: 8, height: 24, borderWidth: 2.5, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#231A00', fontSize: 12.5, fontFamily: 'Poppins-Black' }}>x3</Text>
              </View>
            </View>
            <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 18 }}>{t(SPECIAL_POWERS[confirmSpecial].descKey)}</Text>
            <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }}>{t('sp.limitNote')}</Text>
            <View style={{ alignSelf: 'stretch', marginTop: 4, gap: 8 }}>
              <Btn big kind="primary" gem label={String(catalog?.specialPowers?.find((x) => x.id === confirmSpecial)?.price ?? SPECIAL_POWER_PRICE_FALLBACK[confirmSpecial])} feedback={GameFeedbackEvent.UI_PURCHASE} onPress={() => {
                const spid = confirmSpecial;
                setConfirmSpecial(null);
                actions.buySpecialPower(spid);
              }} />
              <Btn label={t('store.cancel')} kind="ghost" onPress={() => setConfirmSpecial(null)} />
            </View>
          </View>
        ) : null}
      </GameModal>

      {/* CO Pass satın alma onayı */}
      <GameModal
        visible={confirmCoPass}
        onClose={() => setConfirmCoPass(false)}
        onExited={() => {
          const a = coPassExit.current; coPassExit.current = null;
          if (a === 'notEnough') {
            const m = coPassMissing.current ?? PREMIUM_ROAD_PRICE;
            coPassMissing.current = null;
            openShortfallSheet(m); // popup oturunca StoreKit (kör 380ms değil)
          }
          else if (a === 'buyMoney') buy(COPASS_PRODUCT_ID);
        }}
        title={t('premium.bannerTitle').toLocaleUpperCase(currentLang())}
        icon="medal"
      >
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 18 }}>{t('premium.confirmBody')}</Text>
          <View style={{ alignSelf: 'stretch', marginTop: 4, gap: 8 }}>
            {/* Buy with 2000 diamonds — or fall through to the "not enough" popup */}
            <Btn big kind="accent" gem label={t('premium.unlockBtn', { n: String(PREMIUM_ROAD_PRICE) })} feedback={GameFeedbackEvent.UI_PURCHASE} onPress={() => {
              if ((profile?.diamonds ?? 0) >= PREMIUM_ROAD_PRICE) { setConfirmCoPass(false); actions.buyPremiumRoad(); }
              else { coPassExit.current = 'notEnough'; coPassMissing.current = PREMIUM_ROAD_PRICE - (profile?.diamonds ?? 0); setConfirmCoPass(false); }
            }} />
            {/* Or buy with real money (StoreKit) — always available, no diamonds needed */}
            <Btn big kind="blue" icon="card" label={t('premium.buyWithMoney', { price: priceFor(COPASS_PRODUCT_ID, COPASS_FALLBACK_PRICE) })} feedback={GameFeedbackEvent.UI_PURCHASE} onPress={() => { coPassExit.current = 'buyMoney'; setConfirmCoPass(false); }} />
            <Btn label={t('store.cancel')} kind="ghost" onPress={() => setConfirmCoPass(false)} />
          </View>
        </View>
      </GameModal>

      {/* İfade satın alma onayı — animasyonlu CANLI önizleme: alıcı ne aldığını görür */}
      <GameModal visible={confirmOpen} onClose={() => setConfirmOpen(false)} onExited={() => {
          const m = notEnoughOnExit.current;
          if (m == null) return;
          notEnoughOnExit.current = null;
          // Popup FIRST; StoreKit sayfası popup'ın gerçek sunum sinyaliyle
          // (openShortfallThenBuy). Aynı tick'te buy() çağırmak popup sunumunu
          // StoreKit sayfasıyla yarıştırıyordu — iOS sunumu kilitleyip tüm
          // dokunuşları öldürüyordu. Apple Pay iptali yine bu popup'a döner.
          openShortfallSheet(m);
        }} title={t('store.confirmBuyTitle')} icon="cart">
        {confirmEmote ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ borderRadius: 22, backgroundColor: theme.surface3, ...shadowRaised }}>
              <View style={{ width: 136, height: 136, borderRadius: 22, backgroundColor: theme.surface3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
                <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
                {/* animasyon YALNIZ burada oynar — pencere her açılışta baştan başlar */}
                <EmoteSticker key={confirmOpen ? `${confirmEmote.id}-open` : `${confirmEmote.id}-closed`} id={confirmEmote.id} size={108} play loop />
              </View>
            </View>
            {ownsEmote(profile, confirmEmote.id) ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.panelInnerFill, borderRadius: 999, borderWidth: 1.5, borderColor: theme.primary, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Ionicons name="checkmark-circle" size={15} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5 }}>{t('store.owned')}</Text>
                </View>
                <View style={{ alignSelf: 'stretch', marginTop: 4 }}>
                  <Btn label={t('common.close')} kind="ghost" onPress={() => setConfirmOpen(false)} />
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19, marginTop: 2 }}>
                  {t('store.buyAsk', { n: String(confirmEmote.premium?.price ?? 0) })}
                </Text>
                <View style={{ alignSelf: 'stretch', marginTop: 4 }}>
                  <Btn
                    big
                    kind="primary"
                    gem
                    label={String(confirmEmote.premium?.price ?? 0)}
                    feedback={GameFeedbackEvent.UI_PURCHASE}
                    onPress={() => {
                      const price = confirmEmote.premium?.price ?? 0;
                      const have = profile?.diamonds ?? 0;
                      if (have >= price) { actions.buyEmote(confirmEmote.id); setConfirmOpen(false); }
                      else {
                        // Short: remember how short. The handoff (popup, then
                        // the delayed StoreKit sheet) fires from onExited —
                        // opening anything while this modal is still animating
                        // out leaves two native modals up and freezes iOS.
                        notEnoughOnExit.current = price - have;
                        setConfirmOpen(false);
                      }
                    }}
                  />
                  <Btn label={t('store.cancel')} kind="ghost" onPress={() => setConfirmOpen(false)} />
                </View>
              </>
            )}
          </View>
        ) : null}
      </GameModal>

      <GameModal
        visible={confirmCosmetic != null}
        onClose={() => setConfirmCosmetic(null)}
        title={confirmCosmetic ? cosmeticDisplayName(confirmCosmetic).toLocaleUpperCase(currentLang()) : ''}
        icon={confirmCosmetic ? cosmeticVisual(confirmCosmetic).icon as IoniconName : 'diamond'}
      >
        {confirmCosmetic ? (() => {
          const item = confirmCosmetic;
          const owned = ownsStoreCosmetic(profile, item);
          const equipped = isEquippedCosmetic(profile, item);
          const short = item.diamondPrice - (profile?.diamonds ?? 0);
          const canEquip = item.type === 'frame' || item.type === 'name_effect' || item.type === 'match_background' || item.type === 'ball' || item.type === 'intro' || item.type === 'victory_effect' || item.type === 'answer_effect';
          return (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <CosmeticPreview item={item} size={128} />
              <Text style={{ color: RARITY_COLOR[item.rarity] ?? theme.primary, fontFamily: 'Poppins-Black', fontSize: 11, letterSpacing: 1 }}>{String(item.rarity).toUpperCase()}</Text>
              <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{item.description}</Text>
              {item.id === catalog?.vaultItemId ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: withAlpha(theme.gold, 0.14), borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }}>
                  <Ionicons name="time" size={13} color={theme.gold} />
                  <Text style={{ color: theme.gold, fontFamily: 'Poppins-ExtraBold', fontSize: 11.5 }}>Bu hafta kasadan çıktı — Pazartesi vitrinden kalkar</Text>
                </View>
              ) : null}
              <View style={{ alignSelf: 'stretch', backgroundColor: theme.well, borderRadius: 14, padding: 10, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 12 }}>Elmasın</Text>
                  <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>{profile?.diamonds ?? 0} 💎</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 12 }}>Fiyat</Text>
                  <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>{item.diamondPrice} 💎</Text>
                </View>
              </View>
              {equipped ? (
                <>
                  <Btn big kind="primary" icon="checkmark-circle" label="KUŞANILI" disabled onPress={() => {}} />
                  {canEquip ? <Btn kind="ghost" label="ÇIKAR" onPress={() => { actions.equipCosmetic(item.type as any, null); setConfirmCosmetic(null); }} /> : null}
                </>
              ) : owned ? (
                <Btn big kind="primary" icon="shirt" label="KUŞAN" feedback={GameFeedbackEvent.UI_CONFIRM} onPress={() => { track('cosmetic_equipped', { item_id: item.id, type: item.type }); actions.equipCosmetic(item.type as any, item.id); setConfirmCosmetic(null); }} />
              ) : short > 0 ? (
                <Btn big kind="accent" icon="diamond" label={`ELMAS AL · ${short} 💎 eksik`} feedback={GameFeedbackEvent.UI_PURCHASE} onPress={() => { track('insufficient_diamonds', { item_id: item.id, missing_diamonds: short }); setConfirmCosmetic(null); openShortfallSheet(short, { required: item.diamondPrice, current: profile?.diamonds ?? 0, source: 'cosmetic' }); }} />
              ) : (
                <Btn big kind="primary" gem label={`SATIN AL · ${item.diamondPrice}`} feedback={GameFeedbackEvent.UI_PURCHASE} onPress={() => { track('cosmetic_purchase_started', { item_id: item.id, type: item.type, price: item.diamondPrice }); actions.buyCosmetic(item.id); setConfirmCosmetic(null); }} />
              )}
              <Btn label={t('store.cancel')} kind="ghost" onPress={() => setConfirmCosmetic(null)} />
            </View>
          );
        })() : null}
      </GameModal>

      {buying ? <PurchaseOverlay /> : null}
    </Screen>
  );
}, (p, n) =>
  // Sözleşme yukarıdaki blok yorumunda. Bekleyen kıtlık varken bilerek render'a
  // düşülür (take-once efektin çalışması render ister).
  shortfallConsumedSeq === shortfallArrivalSeq &&
  p.state.profile === n.state.profile &&
  p.state.storeCatalog === n.state.storeCatalog &&
  p.state.storeCatalogStatus === n.state.storeCatalogStatus &&
  p.state.storeCatalogError === n.state.storeCatalogError &&
  p.actions === n.actions &&
  p.scrollToSection === n.scrollToSection &&
  p.storeActive === n.storeActive &&
  p.onDiamondCelebration === n.onDiamondCelebration
);

// Mid-payment wait: a GameModal-anatomy card (panelInk ring → gold frame → card
// face with cardLip lip) carrying the REAL BrandMark. 150ms scrim fade + spring
// scale 0.9→1 on mount, mirroring GameModal's entrance.
function PurchaseOverlay() {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [fade, scale]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim, opacity: fade }]} />
      <Animated.View
        style={{
          width: '100%', maxWidth: 280,
          opacity: fade, transform: [{ scale }],
          backgroundColor: theme.modalFace, borderRadius: 22,
          ...shadowModal,
        }}
      >
        <View style={{ backgroundColor: theme.modalFace, borderRadius: 22, overflow: 'hidden', borderTopWidth: 1, borderTopColor: theme.topLight, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 }}>
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
          <BrandMark size={72} glow />
          <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginTop: 14, lineHeight: 18 }}>{t('store.processing')}</Text>
          <View style={{ marginTop: 12 }}><GameSpinner /></View>
        </View>
      </Animated.View>
    </View>
  );
}

// ---- Discoverable emote card ----
// Locked language: crisp frame + panelInk dim overlay (never whole-card opacity),
// mini padlock disc. Tap to preview: the sticker spring-scales up, a primary
// highlight ring fades in, and the whole card POPS up off the row (Clash-Royale
// "swollen from below" lift) while it plays.
//
// Exactly ONE card previews at a time — the parent owns `previewId` and passes
// `active`. Tapping another card flips this one's `active` off mid-play: the
// animation is cut instantly (sticker swaps back to its static frame), the green
// ring fades and the lift springs back — no lingering highlight on the old card.
const DiscoverableEmoteCard = memo(function DiscoverableEmoteCard({ emote, width, active, onPreview, onPreviewEnd }: {
  emote: EmoteMeta;
  width: number;
  active: boolean;                // am I the one currently previewing?
  onPreview: (id: string) => void;    // tapped → claim the single preview slot
  onPreviewEnd: (id: string) => void; // my animation finished naturally → release it
}) {
  const tmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ring = useRef(new Animated.Value(0)).current; // highlight ring; also lifts the dim
  const lift = useRef(new Animated.Value(0)).current; // 0 = seated, 1 = popped up
  const { scale: pressScale, onIn, onOut } = usePressScale(0.96); // every touchable responds on press-in (spec §11)

  // All visual state follows `active` in one place, so the interrupt path
  // (parent hands the slot to another card) and the natural end share the exact
  // same revert — the ring can never be left glowing on a stopped card.
  // NOT: önizlemede BÜYÜTME YOK — 58px raster'ı transform'la şişirmek bulanıklık
  // yapar; ifade animasyonunu normal halinde, kristal netlikte oynar.
  useEffect(() => {
    if (tmRef.current) { clearTimeout(tmRef.current); tmRef.current = null; }
    if (active) {
      Animated.timing(ring, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      Animated.spring(lift, { toValue: 1, friction: 5, tension: 150, useNativeDriver: true }).start();
      // Lottie safety net: if onFinish never fires, release the slot ourselves.
      if (emote.kind === 'lottie') tmRef.current = setTimeout(() => onPreviewEnd(emote.id), 2000);
    } else {
      Animated.timing(ring, { toValue: 0, duration: 180, useNativeDriver: true }).start();
      Animated.spring(lift, { toValue: 0, friction: 6, tension: 150, useNativeDriver: true }).start();
    }
    return () => { if (tmRef.current) clearTimeout(tmRef.current); };
  }, [active, emote.id, emote.kind, ring, lift, onPreviewEnd]);

  return (
    <Pressable key={emote.id} onPress={() => { if (!active) onPreview(emote.id); }} onPressIn={onIn} onPressOut={onOut} style={{ width, zIndex: active ? 2 : 0 }}>
      <Animated.View
        style={{
          paddingVertical: 10,
          backgroundColor: theme.surface2, borderRadius: 14, alignItems: 'center',
          overflow: 'hidden',
          ...shadowRow,
          transform: [
            // Clash-Royale pop: the active card rises off the row — scale YOK
            // (raster büyütme = bulanıklık; ifade normal boyutunda kalır).
            { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
            { scale: pressScale },
          ],
        }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
        <View style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }}>
          {active ? (
            <EmoteSticker key={`${emote.id}-anim`} id={emote.id} size={58} play onFinish={() => onPreviewEnd(emote.id)} />
          ) : (
            <EmoteSticker key={`${emote.id}-static`} id={emote.id} size={58} play={false} />
          )}
        </View>
        {/* locked dim — lifts while the preview plays; the frame stays crisp */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(theme.panelInk, 0.45), opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} />
        {/* mini padlock disc */}
        <View style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.surface2, borderTopWidth: 1, borderTopColor: theme.topLight, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={10} color={theme.muted} />
        </View>
        {/* highlight ring — "currently playing" */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 14, borderWidth: 2, borderColor: theme.primary, opacity: ring }]} />
      </Animated.View>
    </Pressable>
  );
});

// ---- ActionFlap — karta/slota ALTTAN BİRLEŞİK küçük eylem düğmesi ----
// Üst köşeleri düz (karonun alt kenarıyla kaynaşır), alt köşeleri yuvarlak;
// yay ile karonun altından süzülerek çıkar. KULLAN (yeşil) / KALDIR (kırmızı).
function ActionFlap({ visible, label, tone, disabled = false, onPress }: {
  visible: boolean; label: string; tone: 'primary' | 'danger'; disabled?: boolean; onPress: () => void;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) Animated.spring(a, { toValue: 1, friction: 7, tension: 180, useNativeDriver: true }).start();
    else Animated.timing(a, { toValue: 0, duration: 110, useNativeDriver: true }).start();
  }, [visible, a]);
  const face = disabled ? theme.bg2 : tone === 'primary' ? theme.primary : theme.danger;
  const lip = disabled ? theme.cardLip : tone === 'primary' ? theme.primaryDark : theme.dangerDark;
  return (
    <Animated.View
      pointerEvents={visible && !disabled ? 'auto' : 'none'}
      style={{
        position: 'absolute', top: '100%', left: 5, right: 5, marginTop: -2, zIndex: 5,
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
      }}
    >
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          backgroundColor: lip,
          borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
          paddingBottom: pressed ? 1 : 3,
          shadowColor: theme.shadowInk, shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 7,
        })}
      >
        {({ pressed }) => (
          // inner bottom radius = outer 12 − lip inset (3 unpressed / 1 pressed), so the
          // corner seam tracks the press together with paddingBottom
          <View style={{ backgroundColor: face, borderBottomLeftRadius: pressed ? 11 : 9, borderBottomRightRadius: pressed ? 11 : 9, alignItems: 'center', paddingVertical: 5 }}>
            <Text style={{ color: disabled ? theme.muted : theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 11, letterSpacing: 0.5, textShadowColor: 'rgba(4,9,24,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ---- FlyingEmote — KULLAN'a basılan ifadenin karttan yuvaya uçuşu ----
// Ölçüme dayalı: kaynak kart, hedef yuva ve kök katman HER uçuşta yeniden
// measureInWindow ile ölçülür — elle koordinat yok, kaydırma konumu fark etmez.
// Yol: 20 örnekli, yumuşatılmış hafif kavisli fırlatma eğrisi (yukarı süzülüp
// yuvaya oturur), ortada zarif bir kabarma, inişte yuva boyutuna toparlanma.
// Tamamı native driver'da tek progress değeriyle oynar — JS meşgulken bile akıcı.
type FlightRect = { x: number; y: number; w: number; h: number };
type EmoteFlight = {
  key: number; id: string; toIdx: number;
  fromX: number; fromY: number; toX: number; toY: number;
  fromSize: number; toSize: number;
};

function FlyingEmote({ flight, onEnd }: { flight: EmoteFlight; onEnd: (key: number) => void }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(p, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished) onEnd(flight.key); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const N = 20;
  const input: number[] = []; const xs: number[] = []; const ys: number[] = []; const ss: number[] = [];
  const dx = flight.toX - flight.fromX;
  const dy = flight.toY - flight.fromY;
  const lift = Math.min(56, 24 + Math.hypot(dx, dy) * 0.12);
  const endScale = flight.toSize / flight.fromSize;
  const posAt = (t: number) => ({
    x: flight.fromX + dx * t,
    y: flight.fromY + dy * t - Math.sin(Math.PI * t) * lift,
    s: 1 + Math.sin(Math.PI * t) * 0.14 + (endScale - 1) * t,
  });
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const pt = posAt(t);
    input.push(t); xs.push(pt.x); ys.push(pt.y); ss.push(pt.s);
  }
  // Hız izi: aynı yörüngeyi faz gecikmesiyle izleyen, sönükleşerek küçülen yankı
  // kopyaları. Ana kopyayla AYNI progress değerine bağlılar — asla ayrışamazlar;
  // iz inişten önce yumuşakça sönüp yuvada hiçbir kalıntı bırakmaz.
  const ghost = (lag: number, baseOpacity: number, shrink: number) => {
    const gxs: number[] = []; const gys: number[] = []; const gss: number[] = []; const gop: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const pt = posAt(Math.max(0, t - lag));
      gxs.push(pt.x); gys.push(pt.y); gss.push(pt.s * shrink);
      const fadeIn = Math.min(1, Math.max(0, (t - lag) / 0.12));   // ayrışınca belirir
      const fadeOut = Math.min(1, Math.max(0, (1 - t) / 0.18));    // inişten önce söner
      gop.push(baseOpacity * fadeIn * fadeOut);
    }
    return { gxs, gys, gss, gop };
  };
  const ghosts = [ghost(0.16, 0.16, 0.84), ghost(0.08, 0.3, 0.92)]; // uzak → yakın
  return (
    <>
      {ghosts.map((g, gi) => (
        <Animated.View
          key={gi}
          pointerEvents="none"
          style={{
            position: 'absolute', left: 0, top: 0, zIndex: 99,
            width: flight.fromSize, height: flight.fromSize,
            opacity: p.interpolate({ inputRange: input, outputRange: g.gop }),
            transform: [
              { translateX: p.interpolate({ inputRange: input, outputRange: g.gxs }) },
              { translateY: p.interpolate({ inputRange: input, outputRange: g.gys }) },
              { scale: p.interpolate({ inputRange: input, outputRange: g.gss }) },
            ],
          }}
        >
          <EmoteSticker id={flight.id} size={flight.fromSize} play={false} />
        </Animated.View>
      ))}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: 0, top: 0, zIndex: 100,
          width: flight.fromSize, height: flight.fromSize,
          transform: [
            { translateX: p.interpolate({ inputRange: input, outputRange: xs }) },
            { translateY: p.interpolate({ inputRange: input, outputRange: ys }) },
            { scale: p.interpolate({ inputRange: input, outputRange: ss }) },
          ],
        }}
      >
        <EmoteSticker id={flight.id} size={flight.fromSize} play={false} />
      </Animated.View>
    </>
  );
}

// Owned-emote card — dokun: animasyon KARTTA oynar (statik dinlenme hali) ve
// altına birleşik KULLAN flap'i çıkar; kuşanma yalnız flap'e basınca olur.
// KULLAN, çıkartma kutusunu ölçüp konumu üst katmana verir (uçuş oradan başlar).
// memo — kardeşi DiscoverableEmoteCard ile aynı sözleşme: emote modül-sabiti
// dizilerden gelir (kimliği sabit), callback'ler CollectionScreen'de sabitlenir;
// bir önizleme dokunuşu artık yalnız etkilenen 2 kartı yeniden çizer. onUse /
// onRemove bu yüzden emote'u parametre olarak GERİ verir (kart başına closure
// üretilmesin diye).
const CollectibleEmoteCard = memo(function CollectibleEmoteCard({ emote, width, isEquipped, blocked, active, onPreview, onUse, onRemove }: {
  emote: EmoteMeta; width: number; isEquipped: boolean; blocked: boolean;
  active: boolean; onPreview: (id: string | null) => void; onUse: (e: EmoteMeta, from: FlightRect | null) => void; onRemove: (id: string) => void;
}) {
  const stickerBoxRef = useRef<View>(null);
  const ring = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(isEquipped ? 1 : 0)).current;
  const { scale: pressScale, onIn, onOut } = usePressScale(0.96);
  useEffect(() => {
    if (isEquipped) Animated.spring(check, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    else Animated.timing(check, { toValue: 0, duration: 120, useNativeDriver: true }).start();
  }, [isEquipped, check]);
  useEffect(() => {
    Animated.timing(ring, { toValue: active ? 1 : 0, duration: active ? 150 : 180, useNativeDriver: true }).start();
    Animated.spring(lift, { toValue: active ? 1 : 0, friction: active ? 5 : 6, tension: 150, useNativeDriver: true }).start();
  }, [active, ring, lift]);
  const flapDisabled = !isEquipped && blocked; // yuva dolu — kuşanamaz
  return (
    <View style={{ width, zIndex: active ? 30 : 0 }}>
      <Pressable onPress={() => onPreview(active ? null : emote.id)} onPressIn={onIn} onPressOut={onOut}>
        <Animated.View
          style={{
            paddingVertical: 10,
            backgroundColor: theme.surface2, borderRadius: 14, alignItems: 'center',
            borderTopWidth: 1, borderTopColor: theme.topLight,
            ...shadowRow,
            transform: [
              { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
              { scale: pressScale },
            ],
          }}
        >
          <View ref={stickerBoxRef} collapsable={false} style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }}>
            {active ? (
              <EmoteSticker key={`${emote.id}-anim`} id={emote.id} size={58} play />
            ) : (
              <EmoteSticker key={`${emote.id}-static`} id={emote.id} size={58} play={false} />
            )}
          </View>
          {/* kuşanıldı rozeti */}
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 4, right: 4, transform: [{ scale: check }] }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.card }}>
              <Ionicons name="checkmark" size={11} color={theme.ink} />
            </View>
          </Animated.View>
          {/* önizleme halkası */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 13, borderTopRightRadius: 13, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, borderWidth: 2, borderColor: isEquipped ? theme.danger : theme.primary, opacity: ring }]} />
        </Animated.View>
      </Pressable>
      <ActionFlap
        visible={active}
        label={(flapDisabled ? t('collection.slotsFull') : isEquipped ? t('collection.remove') : t('collection.use')).toLocaleUpperCase(currentLang())}
        tone={isEquipped ? 'danger' : 'primary'}
        disabled={flapDisabled}
        onPress={() => {
          if (isEquipped) { onRemove(emote.id); onPreview(null); return; }
          const node = stickerBoxRef.current;
          if (node) node.measureInWindow((x, y, w, h) => onUse(emote, { x, y, w, h }));
          else onUse(emote, null); // ölçüm yolu yoksa animasyonsuz kuşan — işlev asla kaybolmaz
          onPreview(null);
        }}
      />
    </View>
  );
});

// ---- Collection (emotes / loadout) ----
const EMOTE_SLOTS = 8;
// ---- Güçler paneli — Seviye Yolu'ndan kazanılan tek kullanımlık güçlerin
// envanteri. KULLAN → onay → sunucu etkinleştirir (jeton 24s pencere açar,
// kalkan kuşanılır). Adetler stoklanır; aktifken ikincisi başlatılamaz. ----
function fmtTimeLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.max(1, Math.ceil((ms % 3_600_000) / 60_000));
  return h > 0 ? t('power.hoursMin', { h: String(h), m: String(m) }) : t('power.min', { m: String(m) });
}

function PowersPanel({ profile, onUse, onToggleSpecial }: { profile: ProfileView | null; onUse: (id: PowerId) => void; onToggleSpecial: (id: SpecialPowerIdView) => void }) {
  const [confirmId, setConfirmId] = useState<PowerId | null>(null);
  const [noStreakOpen, setNoStreakOpen] = useState(false); // "geri yüklenecek kırık seri yok" bilgi popup'ı (güç TÜKETİLMEZ)
  // 2x XP geri sayımı canlı kalsın — yarım dakikada bir tazele
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(iv);
  }, []);
  const boostUntil = profile?.xpBoostUntil ? new Date(profile.xpBoostUntil).getTime() : 0;
  const boostActive = boostUntil > Date.now();
  const armed = profile?.shieldArmed ?? false;
  const lostStreak = profile?.lostStreak ?? 0;
  const trainingUntil = profile?.trainingBoostUntil ? new Date(profile.trainingBoostUntil).getTime() : 0;
  const trainingActive = trainingUntil > Date.now();
  const counts: Record<PowerId, number> = {
    xp2x: profile?.powerXp2x ?? 0,
    shield: profile?.powerShield ?? 0,
    streak: profile?.powerStreak ?? 0,
    training: profile?.powerTraining ?? 0,
    socialtoken: profile?.powerSocialToken ?? 0,
  };
  const anyOwnedOrActive = counts.xp2x > 0 || counts.shield > 0 || counts.streak > 0 || counts.training > 0 || counts.socialtoken > 0 || boostActive || armed || trainingActive;
  // Koleksiyonda YALNIZ sahip olunan (adet>0) ya da AKTİF (kuşanılı kalkan /
  // süren 2xXP·Antrenman) güçler görünür — sahip olunmayan hiçbir şekilde gösterilmez.
  const isActive = (id: PowerId) => (id === 'xp2x' ? boostActive : id === 'shield' ? armed : id === 'training' ? trainingActive : false);
  const visiblePowers = POWER_ID_LIST.filter((id) => counts[id] > 0 || isActive(id));

  const renderCard = (id: PowerId) => {
    const meta = POWERS[id];
    const count = counts[id];
    const active = id === 'xp2x' ? boostActive : id === 'shield' ? armed : id === 'training' ? trainingActive : false;
    const activeLabel = id === 'xp2x'
      ? t('power.activeLeft', { t: fmtTimeLeft(boostUntil - Date.now()) })
      : id === 'training' ? t('power.activeLeft', { t: fmtTimeLeft(trainingUntil - Date.now()) })
      : t('power.armed');
    return (
      <View key={id} style={{ borderRadius: 19, ...shadowRaised, ...(active ? { shadowColor: meta.color, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 } : {}) }}>
        <View style={{
          backgroundColor: active ? theme.surface3 : theme.surface2, borderRadius: 19, borderWidth: 2,
          borderColor: active ? meta.color : withAlpha(meta.color, count > 0 ? 0.55 : 0.25),
          // strips clip at the r19 corners here; shadows (raised + active glow)
          // live on the wrapper — overflow:'hidden' clips a layer's OWN shadow on iOS
          padding: 12, overflow: 'hidden',
        }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View>
              <PowerArt powerId={id} size={62} locked={count === 0 && !active} />
              {count > 0 ? (
                <View style={{ position: 'absolute', right: -6, top: -6, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: meta.color, borderWidth: 2, borderColor: darken(theme.card, 0.45), alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: theme.ink, fontSize: 11, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>x{count}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: theme.text, fontSize: 14.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t(meta.nameKey)}</Text>
              <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 15, fontFamily: 'Poppins-SemiBold' }}>{t(meta.descKey)}</Text>
            </View>
          </View>
          {active ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, backgroundColor: withAlpha(meta.color, 0.14), borderRadius: 999, borderWidth: 1.5, borderColor: withAlpha(meta.color, 0.6), paddingVertical: 6 }}>
              <Ionicons name={id === 'xp2x' ? 'time' : id === 'shield' ? 'shield-checkmark' : 'infinite'} size={14} color={meta.color} />
              <Text style={{ color: meta.color, fontSize: 12, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{activeLabel}</Text>
            </View>
          ) : (
            <View style={{ marginTop: 10 }}>
              {count > 0 ? (
                // Seri Geri Yükleme: kırık seri yoksa güç TÜKETİLMEZ — sadece bilgi popup'ı çıkar.
                <Btn kind={meta.kind} label={t('power.use')} onPress={() => { if (id === 'streak' && lostStreak <= 0) setNoStreakOpen(true); else setConfirmId(id); }} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7 }}>
                  <Ionicons name="lock-closed" size={12} color={theme.muted} />
                  <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>{t('power.emptyHint')}</Text>
                </View>
              )}
            </View>
          )}
          {id === 'shield' && armed ? (
            <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginTop: 6 }}>{t('power.armedHint')}</Text>
          ) : null}
          {id === 'streak' && lostStreak > 0 && count > 0 ? (
            <Text style={{ color: theme.primary, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginTop: 6 }}>{t('power.streakReady', { n: String(lostStreak) })}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  const confirmMeta = confirmId ? POWERS[confirmId] : null;
  // MAÇ GÜÇLERİ kuşanma durumu — İfadeler slot kalıbının güç uyarlaması.
  const spEquipped = ((profile?.equippedSpecialPowers ?? (profile?.equippedSpecialPower ? [profile.equippedSpecialPower] : [])) as SpecialPowerIdView[]).filter((id) => SPECIAL_POWERS[id]);
  return (
    <>
      {/* ── MAÇ GÜÇLERİ: 3 slot + tüm güçler (kullanıcı isteği 2026-08-28 —
          İfadeler'deki kuşanma düzeninin aynısı; dondurucu dahil HEPSİ listede,
          elde olmayan silik). Dokun: kuşan/çıkar — sunucu toggle. */}
      <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 13, letterSpacing: 0.5, marginBottom: 4, marginLeft: 4 }}>{t('collection.spLoadout')}</Text>
      <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', marginBottom: 10, marginLeft: 4 }}>{t('collection.spLoadoutHint', { n: String(spEquipped.length) })}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
        {Array.from({ length: 3 }).map((_, i) => {
          const id = spEquipped[i];
          return (
            <Pressable
              key={`sps${i}`}
              disabled={!id}
              onPress={() => { if (id) { triggerFeedback(GameFeedbackEvent.UI_TOGGLE_OFF); onToggleSpecial(id); } }}
              style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: id ? theme.surface2 : theme.well, ...(id ? { borderWidth: 2, borderColor: theme.primary } : {}), transform: [{ translateY: pressed ? 2 : 0 }] })}
            >
              {!id ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} /> : null}
              {id ? <SpecialPowerBadge id={id} size={52} /> : <Ionicons name="add" size={26} color={theme.muted} />}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
        {SPECIAL_POWER_LIST.map((spid) => {
          const cnt = spInventoryCount(profile, spid);
          const eq = spEquipped.includes(spid);
          const meta = SPECIAL_POWERS[spid];
          return (
            <Pressable
              key={spid}
              disabled={cnt <= 0 && !eq}
              onPress={() => { triggerFeedback(eq ? GameFeedbackEvent.UI_TOGGLE_OFF : GameFeedbackEvent.UI_TOGGLE_ON); onToggleSpecial(spid); }}
              style={({ pressed }) => ({ width: 96, borderRadius: 16, padding: 8, alignItems: 'center', gap: 5, backgroundColor: theme.card, borderWidth: 2, borderColor: eq ? theme.primary : withAlpha(theme.border, 0.9), opacity: cnt <= 0 && !eq ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
            >
              <View>
                <SpecialPowerBadge id={spid} size={50} dead={cnt <= 0 && !eq} />
                {cnt > 0 ? (
                  <View style={{ position: 'absolute', right: -7, top: -6, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: meta.color, borderWidth: 2, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: theme.ink, fontSize: 9.5, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>x{cnt}</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={{ color: eq ? theme.primary : theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 10 }}>{t(meta.nameKey)}</Text>
              <Text style={{ color: theme.muted, fontSize: 8.5, fontFamily: 'Poppins-Black', letterSpacing: 0.5 }}>{eq ? '✓ ' + t('store.spEquipped') : cnt > 0 ? t('collection.use').toLocaleUpperCase(currentLang()) : t('collection.spNone')}</Text>
            </Pressable>
          );
        })}
      </View>
      <SectionHeader label={t('collection.tabPowers').toLocaleUpperCase(currentLang())} icon="flash" style={{ marginBottom: 8 }} />
      {visiblePowers.length > 0 ? (
        <>
          <View style={{ gap: 12 }}>
            {visiblePowers.map(renderCard)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12, paddingHorizontal: 4 }}>
            <Ionicons name="information-circle" size={14} color={theme.muted} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, color: theme.muted, fontSize: 11, lineHeight: 15, fontFamily: 'Poppins-SemiBold' }}>
              {t('power.oneTime')}
            </Text>
          </View>
        </>
      ) : (
        <EmptyState icon="flash" title={t('power.earnHint')} hint={t('power.emptyHint')} />
      )}
      {/* Onay — güç tek kullanımlık, yanlışlıkla yakılmasın */}
      <GameModal
        visible={confirmId != null}
        onClose={() => setConfirmId(null)}
        title={confirmMeta ? t(confirmMeta.nameKey).toLocaleUpperCase(currentLang()) : ''}
        icon={confirmMeta?.icon ?? 'flash'}
      >
        {confirmId && confirmMeta ? (
          <>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <PowerArt powerId={confirmId} size={76} />
            </View>
            <Text style={{ color: theme.text, fontSize: 13.5, lineHeight: 19, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginBottom: 14 }}>
              {t(confirmMeta.confirmKey)}
            </Text>
            <View style={{ gap: 8 }}>
              <Btn big kind={confirmMeta.kind} label={t('power.use')} onPress={() => { const id = confirmId; setConfirmId(null); onUse(id); }} />
              <Btn kind="ghost" label={t('power.cancel')} onPress={() => setConfirmId(null)} />
            </View>
          </>
        ) : null}
      </GameModal>
      {/* Kırık seri yok — güç TÜKETİLMEZ (envanterde kalır), sadece bilgilendirir. */}
      <GameModal
        visible={noStreakOpen}
        onClose={() => setNoStreakOpen(false)}
        title={t('power.streakName').toLocaleUpperCase(currentLang())}
        icon="flame"
      >
        <View style={{ alignItems: 'center', marginBottom: 10 }}>
          <PowerArt powerId="streak" size={68} />
        </View>
        <Text style={{ color: theme.text, fontSize: 13.5, lineHeight: 19, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginBottom: 12 }}>
          {t('power.streakNone')}
        </Text>
        <Btn big kind="primary" label={t('common.continue')} onPress={() => setNoStreakOpen(false)} />
      </GameModal>
    </>
  );
}

// ---- Koleksiyon: Kozmetik paneli ------------------------------------------
// Satın alınan HER kozmetik (isim efekti, top, arena, giriş/zafer/cevap
// efektleri, mağaza çerçeveleri) + arena çerçeveleri tek yerde: gör, kuşan,
// çıkar. Kategori başına TEK parça kuşanılır — yenisine dokunmak eskisini
// otomatik değiştirir (sunucuda yuva başına tek sütun var).
function CosmeticsLoadoutPanel({ state, actions }: Props) {
  const profile = state.profile;
  const catalog = state.storeCatalog;
  useEffect(() => { if (!catalog) actions.loadStoreCatalog(); }, [catalog]);
  const ownedByType = useMemo(() => {
    const map: Partial<Record<EquippableCosmeticType, StoreCatalogItem[]>> = {};
    for (const item of catalog?.items ?? []) {
      if (!isEquippableCosmeticType(item.type)) continue;
      if (!ownsStoreCosmetic(profile, item)) continue;
      (map[item.type] ??= []).push(item);
    }
    return map;
  }, [catalog, profile]);
  if (!catalog) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 28 }}>
        <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 12.5 }}>{t('store.loading')}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 18 }}>
      <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', marginLeft: 4, lineHeight: 16 }}>{t('collection.cosmeticsHint')}</Text>
      {COSMETIC_SLOT_META.map((meta) => {
        const equippedId = cosmeticEquippedId(profile, meta.type);
        const storeItems = ownedByType[meta.type] ?? [];
        const arenaFrames = meta.type === 'frame' ? (profile?.ownedFrames ?? []) : [];
        const isDefaultEquipped = meta.type === 'ball' ? (!equippedId || equippedId === DEFAULT_BALL_ID) : !equippedId;
        const tiles: { id: string | null; name: string; kind: 'none' | 'arena' | 'store'; item?: StoreCatalogItem }[] = [
          { id: null, name: meta.empty, kind: 'none' },
          ...arenaFrames.map((f) => ({ id: f, name: cosmeticFallbackName(f), kind: 'arena' as const })),
          ...storeItems.map((it) => ({ id: it.id, name: cosmeticDisplayName(it), kind: 'store' as const, item: it })),
        ];
        return (
          <View key={meta.type}>
            <SectionHeader label={meta.label.toLocaleUpperCase(currentLang())} icon={meta.icon} style={{ marginBottom: 8 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 6 }}>
              {tiles.map((tile) => {
                const sel = tile.id === null ? isDefaultEquipped : equippedId === tile.id;
                return (
                  <Pressable
                    key={tile.id ?? 'none'}
                    onPress={() => {
                      if (sel) return; // zaten kuşanılı
                      triggerFeedback(GameFeedbackEvent.UI_CONFIRM);
                      if (meta.type === 'frame') {
                        // Arena çerçevesi selected_frame'e, mağaza çerçevesi
                        // equipped_frame_id'ye yazar; görünen değer equipped ??
                        // selected olduğu için öteki sütun da temizlenir.
                        if (tile.kind === 'arena') { actions.equipCosmetic('frame', null); actions.setFrame(tile.id); }
                        else if (tile.kind === 'store') { actions.setFrame(null); actions.equipCosmetic('frame', tile.id); }
                        else { actions.equipCosmetic('frame', null); actions.setFrame(null); }
                      } else {
                        actions.equipCosmetic(meta.type, tile.id);
                      }
                      track('cosmetic_equipped', { item_id: tile.id ?? 'none', type: meta.type, source: 'collection' });
                    }}
                    style={({ pressed }) => ({
                      width: 108, borderRadius: 16, padding: 8, alignItems: 'center', gap: 6,
                      backgroundColor: theme.card,
                      borderWidth: 2, borderColor: sel ? theme.primary : withAlpha(theme.border, 0.9),
                      opacity: pressed ? 0.85 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}
                  >
                    <View style={{ width: 84, height: 84, borderRadius: 14, backgroundColor: theme.surface3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <CosmeticArt
                        id={tile.id ?? (meta.type === 'ball' ? DEFAULT_BALL_ID : null)}
                        type={meta.type}
                        size={84}
                        accent={tile.item ? (RARITY_COLOR[tile.item.rarity] ?? theme.primary) : theme.muted}
                        empty={tile.id === null && meta.type !== 'ball'}
                      />
                    </View>
                    <Text numberOfLines={1} style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 10.5, textAlign: 'center' }}>{tile.name}</Text>
                    {sel ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: withAlpha(theme.primary, 0.14), borderRadius: 999, borderWidth: 1, borderColor: theme.primary, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Ionicons name="checkmark-circle" size={10} color={theme.primary} />
                        <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 9 }}>KUŞANILI</Text>
                      </View>
                    ) : (
                      <Text style={{ color: theme.muted, fontFamily: 'Poppins-ExtraBold', fontSize: 9.5 }}>{t('collection.use').toLocaleUpperCase(currentLang())}</Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}

// DİLİM-MEMO SÖZLEŞMESİ (StoreScreen'dekiyle aynı kural): CollectionScreen
// state'ten YALNIZ `state.profile` okur. Ekrana yeni bir `state.X` okuması
// eklersen aşağıdaki karşılaştırıcıya da eklemek ZORUNDASIN. `actions` sabitliği
// useCrossover'daki actions-useMemo'suna dayanır (değilse memo no-op'a düşer).
export const CollectionScreen = memo(function CollectionScreen({ state, actions, isActive = true }: Props & { isActive?: boolean }) {
  const { width: winW } = useWindow();
  const profile = state.profile;
  const equipped = profile?.equippedEmotes ?? [];
  // Sekmeler: İfadeler (yuvalar + koleksiyon) | Güçler (tek kullanımlık envanter)
  const [colTab, setColTab] = useState<'emotes' | 'powers' | 'cosmetics'>('emotes');
  // Kırmızı 1: açık sekme 'görüldü' sayılır — rozet söner (satın alınan şeyin
  // nereye gittiğini gösterme sistemi, kullanıcı isteği 2026-08-28).
  useEffect(() => { if (isActive) actions.markCollectionSeen(colTab); }, [isActive, colTab, state.unseenCollection]);
  // The single discoverable-emote preview slot: tapping a card claims it (which
  // interrupts whichever card held it), a finished animation releases it.
  // Both handlers are stable so the memo'd cards only re-render on `active` flips.
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Seçili yuva (KALDIR flap'i açık olan) — kart önizlemesiyle karşılıklı dışlar:
  // ekranda aynı anda tek seçim/flap olur.
  const [slotSel, setSlotSel] = useState<number | null>(null);
  const startPreview = useCallback((id: string) => { setPreviewId(id); setSlotSel(null); }, []);
  const endPreviewFor = useCallback((id: string) => {
    setPreviewId((cur) => (cur === id ? null : cur));
  }, []);
  const toggleEquip = (id: string) => {
    setSlotSel(null);
    if (equipped.includes(id)) actions.equipEmotes(equipped.filter((x) => x !== id));
    else if (equipped.length < EMOTE_SLOTS) actions.equipEmotes([...equipped, id]);
  };

  // ---- Uçuş yönetimi: KULLAN → kart konumundan hedef yuvaya ----
  // Sağlamlık kuralları:
  //  * Sunucu çağrısı uçuşla AYNI ANDA başlar (gecikme uçuş süresiyle örtüşür).
  //  * Uçan ifade, iniş bitene VE sunucu kuşanmayı onaylayana kadar ekranda
  //    kalır — yuva hiçbir an boş yanıp sönmez.
  //  * 4sn güvenlik ağı: sunucu ne olursa olsun uçuş temizlenir; onay
  //    gelmediyse ifade ızgarada yeniden belirir (işlev kaybı imkânsız).
  const rootRef = useRef<View>(null);
  const slotRefs = useRef<(View | null)[]>([]);
  const [flights, setFlights] = useState<EmoteFlight[]>([]);
  const flightSeq = useRef(0);
  const doneFlights = useRef<Set<number>>(new Set());
  const equippedRef = useRef(equipped);
  equippedRef.current = equipped;
  const [landedIdx, setLandedIdx] = useState<number | null>(null);
  const landFlash = useRef(new Animated.Value(0)).current;

  const pruneFlight = useCallback((key: number) => {
    doneFlights.current.delete(key);
    setFlights((cur) => cur.filter((f) => f.key !== key));
  }, []);

  const onFlightEnd = useCallback((key: number) => {
    doneFlights.current.add(key);
    setFlights((cur) => {
      const f = cur.find((x) => x.key === key);
      if (f) {
        // iniş parlaması — yuva yeşil bir nefes alır
        setLandedIdx(f.toIdx);
        landFlash.setValue(1);
        Animated.timing(landFlash, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      }
      // sunucu onayı geldiyse uçan kopyayı hemen bırak (yuva zaten dolu çizilir)
      if (f && equippedRef.current.includes(f.id)) return cur.filter((x) => x.key !== key);
      return cur;
    });
  }, [landFlash]);

  // Sunucu onayı inişten SONRA gelirse: onaylanan biten uçuşları burada bırak.
  useEffect(() => {
    setFlights((cur) => cur.filter((f) => !(doneFlights.current.has(f.key) && equipped.includes(f.id))));
  }, [equipped.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const startFlight = (e: EmoteMeta, from: FlightRect | null) => {
    const targetIdx = Math.min(EMOTE_SLOTS - 1, equipped.length + flights.length);
    const slotNode = slotRefs.current[targetIdx];
    const rootNode = rootRef.current;
    if (!from || !slotNode || !rootNode) { toggleEquip(e.id); return; } // ölçülemedi → animasyonsuz ama daima çalışır
    rootNode.measureInWindow((rx, ry) => {
      slotNode.measureInWindow((sx, sy, sw, sh) => {
        const fromSize = 58;
        const key = ++flightSeq.current;
        const flight: EmoteFlight = {
          key, id: e.id, toIdx: targetIdx,
          fromX: from.x + from.w / 2 - fromSize / 2 - rx,
          fromY: from.y + from.h / 2 - fromSize / 2 - ry,
          toX: sx + sw / 2 - fromSize / 2 - rx,
          toY: sy + sh / 2 - fromSize / 2 - ry,
          fromSize, toSize: 54,
        };
        try { LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity')); } catch {}
        setFlights((cur) => [...cur, flight]);
        setTimeout(() => pruneFlight(key), 4000); // güvenlik ağı
        toggleEquip(e.id);
      });
    });
  };

  // Kart callback'leri sabit kimlikli — memo(CollectibleEmoteCard) ancak böyle
  // tutar (önizleme dokunuşu artık yalnız etkilenen 2 kartı çizer; ws dispatch
  // ızgarayı komple atlar). startFlight/toggleEquip her render'da tazelenir
  // (equipped/flights yakalar); en-son-değer ref'i sayesinde sabit sarmalayıcı
  // basış anında DAİMA güncel fonksiyonu çağırır — bayat closure imkânsız.
  const startFlightRef = useRef(startFlight); startFlightRef.current = startFlight;
  const toggleEquipRef = useRef(toggleEquip); toggleEquipRef.current = toggleEquip;
  const onCardPreview = useCallback((id: string | null) => { setPreviewId(id); setSlotSel(null); }, []);
  const onCardUse = useCallback((e: EmoteMeta, from: FlightRect | null) => startFlightRef.current(e, from), []);
  const onCardRemove = useCallback((id: string) => toggleEquipRef.current(id), []);

  // Collectible sticker emotes the player owns: the 4 character faces (free) + any
  // owned premium + the animated emotes they've been granted. Quick-chat TEXT
  // phrases are NOT collectible and never appear here. Nothing is "pinned" — the
  // player chooses which ones fill the 6 loadout slots.
  const collectible: EmoteMeta[] = [
    ...FACE_EMOTES,
    ...PREMIUM_EMOTES.filter((e) => ownsEmote(profile, e.id)),
    ...ANIM_EMOTES.filter((e) => ownsEmote(profile, e.id)),
  ];
  // Izgara: kuşanılanlar ve o an uçuşta olanlar GÖRÜNMEZ — kullanılan ifade
  // kaldırılana kadar yalnız yuvasında yaşar.
  const gridEmotes = collectible.filter((e) => !equipped.includes(e.id) && !flights.some((f) => f.id === e.id));
  const allEmotes: EmoteMeta[] = [...FACE_EMOTES, ...PREMIUM_EMOTES, ...ANIM_EMOTES];
  const discoverable = allEmotes.filter((e) => !ownsEmote(profile, e.id));
  const COL_GAP = 8;
  // Fix the CELL size and derive the column count from the window, instead of
  // fixing 4 columns and dividing the width among them. On an iPad the old
  // formula produced 188pt cells (vs ~87pt on a phone) — a tiny emoji floating
  // in a huge card. Now the cells stay phone-sized and more of them fit.
  const COL_TARGET_W = 92;
  const gridW = winW - 44;
  const COLS = Math.max(4, Math.floor((gridW + COL_GAP) / (COL_TARGET_W + COL_GAP)));
  const COL_W = Math.floor((gridW - COL_GAP * (COLS - 1)) / COLS);
  const full = equipped.length >= EMOTE_SLOTS;

  const renderEmoteCard = (e: EmoteMeta) => {
    const isEquipped = equipped.includes(e.id);
    const blocked = full && !isEquipped;
    return (
      <CollectibleEmoteCard
        key={e.id}
        emote={e}
        width={COL_W}
        isEquipped={isEquipped}
        blocked={blocked}
        active={previewId === e.id}
        onPreview={onCardPreview}
        onUse={onCardUse}
        onRemove={onCardRemove}
      />
    );
  };

  return (
    <Screen>
      <View ref={rootRef} collapsable={false} style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} scrollEnabled={flights.length === 0} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <ScreenHeader
          title={t('tab.collection')}
          icon="albums"
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surface2, borderRadius: 999, borderTopWidth: 1, borderTopColor: theme.topLight, ...shadowRow, paddingHorizontal: 9, paddingVertical: 5 }}>
              <Ionicons name="albums" size={12} color={theme.accent} />
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 11, fontVariant: ['tabular-nums'] }}>{collectible.length}/{allEmotes.length}</Text>
            </View>
          }
        />

        {/* Sekmeler: İfadeler | Güçler — Clash tarzı iki kalın segment */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {([['emotes', 'happy', t('collection.tabEmotes')], ['cosmetics', 'shirt', t('collection.tabCosmetics')], ['powers', 'flash', t('collection.tabPowers')]] as const).map(([key, icon, label]) => {
            const sel = colTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setColTab(key)}
                style={({ pressed }) => ({
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: sel ? withAlpha(theme.primary, 0.16) : theme.surface2,
                  borderRadius: 15,
                  ...(sel ? { borderWidth: 2, borderColor: theme.primary } : { borderTopWidth: 1, borderTopColor: theme.topLight }),
                  paddingVertical: 9,
                  ...shadowRow,
                  transform: [{ translateY: pressed ? 2 : 0 }],
                })}
              >
                <Ionicons name={icon} size={14} color={sel ? theme.primary : theme.muted} />
                <Text style={{ color: sel ? theme.primary : theme.muted, fontSize: 12.5, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.4 }}>{label}</Text>
                {state.unseenCollection[key] > 0 ? (
                  <View style={{ position: 'absolute', top: -6, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: theme.danger, borderWidth: 2, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{state.unseenCollection[key]}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {colTab === 'powers' ? (
          <PowersPanel profile={profile} onUse={(id) => actions.usePower(id)} onToggleSpecial={(id) => actions.equipSpecialPower(id)} />
        ) : colTab === 'cosmetics' ? (
          <CosmeticsLoadoutPanel state={state} actions={actions} />
        ) : (<>

        {/* Loadout — 8 slots the player fills with any emotes they choose */}
        <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 13, letterSpacing: 0.5, marginBottom: 4, marginLeft: 4 }}>{t('collection.loadout')}</Text>
        <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', marginBottom: 10, marginLeft: 4 }}>{t('collection.loadoutHint', { n: String(equipped.length), max: String(EMOTE_SLOTS) })}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 22, zIndex: slotSel != null ? 20 : 0 }}>
          {Array.from({ length: EMOTE_SLOTS }).map((_, i) => {
            const id = equipped[i];
            const em = id ? (collectible.find((e) => e.id === id) ?? getEmote(id)) : null;
            // uçuşu süren ifade yuvada henüz ÇİZİLMEZ — uçan kopya inince görünür
            const inFlight = em ? flights.some((f) => f.id === em.id) : false;
            const shown = em && !inFlight;
            const sel = slotSel === i;
            return (
              <View key={`slot${i}`} style={{ zIndex: sel ? 30 : 0 }}>
                <Pressable
                  ref={(n) => { slotRefs.current[i] = n as unknown as View; }}
                  onPress={() => {
                    if (!shown) { setSlotSel(null); return; }
                    setPreviewId(null);
                    setSlotSel((cur) => (cur === i ? null : i));
                  }}
                  style={({ pressed }) => ({
                    width: 72, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    backgroundColor: shown ? theme.surface2 : theme.well,
                    ...(sel
                      ? { borderWidth: 2, borderColor: theme.danger }
                      : shown
                        ? { borderWidth: 2, borderColor: theme.primary }
                        : {}),
                    transform: [{ translateY: pressed ? 2 : 0 }],
                  })}
                >
                  {/* boş yuva = sunken well: dış çerçeve yerine iç üst gölge */}
                  {!shown ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} /> : null}
                  {/* slotta ifade DURAĞAN — animasyon yalnız kart önizlemesinde oynar */}
                  {shown ? <EmoteSticker id={em.id} size={54} play={false} /> : <Ionicons name="add" size={26} color={theme.muted} />}
                  {/* iniş parlaması — yuva bir nefes yeşil ışır */}
                  {landedIdx === i ? (
                    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 16, backgroundColor: theme.primary, opacity: landFlash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }) }]} />
                  ) : null}
                </Pressable>
                {/* seçili yuvanın altına birleşik KALDIR flap'i */}
                <ActionFlap
                  visible={sel && Boolean(shown)}
                  label={t('collection.remove').toLocaleUpperCase(currentLang())}
                  tone="danger"
                  onPress={() => { if (id) toggleEquip(id); }}
                />
              </View>
            );
          })}
        </View>

        {/* All collectible emotes — dokun: önizle; KULLAN flap'i ile kuşan.
            Kuşanılanlar burada listelenmez — yalnız yuvalarında görünürler. */}
        <SectionHeader label={t('collection.yourEmotes').toLocaleUpperCase(currentLang())} icon="happy" style={{ marginBottom: 8 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP, zIndex: gridEmotes.some((e) => e.id === previewId) ? 20 : 0 }}>
          {gridEmotes.map((e) => renderEmoteCard(e))}
        </View>

        {/* Discoverable emotes — all emotes greyed out, tap to play animation */}
        <SectionHeader label={t('collection.discoverable').toLocaleUpperCase(currentLang())} icon="lock-closed" style={{ marginTop: 18, marginBottom: 8 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP }}>
          {discoverable.length ? (
            discoverable.map((e) => (
              <DiscoverableEmoteCard
                key={e.id}
                emote={e}
                width={COL_W}
                active={previewId === e.id}
                onPreview={startPreview}
                onPreviewEnd={endPreviewFor}
              />
            ))
          ) : (
            // 100% completion is a celebration, not a muted empty box.
            <GamePanel compact style={{ flex: 1 }} bodyStyle={{ alignItems: 'center', gap: 8, paddingVertical: 18 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: theme.panelInnerFill, borderWidth: 2, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trophy" size={26} color={theme.gold} />
              </View>
              <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') }}>{t('collection.allOwned')}</Text>
            </GamePanel>
          )}
        </View>
        </>)}
      </ScrollView>
      {/* uçuş katmanı — kart→yuva yolculuğundaki ifadeler her şeyin üstünde süzülür */}
      {flights.map((f) => (
        <FlyingEmote key={f.key} flight={f} onEnd={onFlightEnd} />
      ))}
      </View>
    </Screen>
  );
}, (p, n) => p.state.profile === n.state.profile && p.state.storeCatalog === n.state.storeCatalog && p.actions === n.actions);

// (Sender-side waiting UI is now the OutgoingInviteBanner top strip in App.tsx —
// the old InviteWaitingModal blocked the whole Friends screen for 30s.)

// A friend's public profile (tapped from the friends list).
export function FriendProfileModal({ profile, onClose, relation, onAddFriend }: {
  profile: PublicProfile | null; onClose: () => void;
  // 'none' + onAddFriend → istatistiklerin altında "Arkadaş Ekle" düğmesi
  // (liderlik tablosundan bakılan yabancılar). 'self'/'friend' → düğme yok.
  relation?: 'self' | 'friend' | 'none'; onAddFriend?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const total = (profile?.wins ?? 0) + (profile?.losses ?? 0);
  const winRate = total ? Math.round(((profile?.wins ?? 0) / total) * 100) : 0;
  const profileModes = profile?.modes ?? [];
  const modeScoreText = (s?: { wins: number; losses: number }) => t('stats.winLossShort', { wins: s?.wins ?? 0, losses: s?.losses ?? 0 });
  const color = profile ? arenaColor(profile.arena.name) : theme.primary;
  // İstek bu açılışta gönderildiyse düğme "gönderildi" durumuna kilitlenir.
  const [requestSent, setRequestSent] = useState(false);
  useEffect(() => { setRequestSent(false); }, [profile?.userId]);
  // GİRİŞ ANİMASYONU — "kasılarak açılıyor" düzeltmesi (2026-08-11):
  // Eskiden native animationType="slide" kullanılıyordu; iOS o slide'ı sunum
  // anında başlatır ama JS thread aynı karede bu ağır ağacı (ScreenBg, hero
  // panel, 104pt çerçeveli avatar, 3 StatCard) kuruyordu → slide takılarak
  // akıyordu. Artık sunum ANINDA (animationType="none", modalTraffic da 100ms
  // hızlı kapısını kullanır) ve hareket NATIVE DRIVER'da koşar: JS ne kadar
  // meşgul olursa olsun UI thread'de pürüzsüz. Eğri ve süreler büyük-stüdyo
  // kalıbı: 220ms, cubic-bezier(0.22,1,0.36,1), kısa yükseliş + fade.
  const visible = !!profile;
  const enter = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    if (!visible) return;
    setMounted(true);
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 220, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [visible, enter]);
  useEffect(() => {
    if (visible) return;
    Animated.timing(enter, { toValue: 0, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(({ finished }) => { if (finished) setMounted(false); });
  }, [visible, enter]);
  if (!mounted) return null;
  return (
    <SafeModal visible animationType="none" onRequestClose={onClose} presentationStyle="overFullScreen" transparent>
      <Animated.View style={{
        flex: 1, backgroundColor: BG_TOP,
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [34, 0] }) }],
      }}>
        <ScreenBg />
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <ScreenHeader title={t('profile.title')} icon="person" onBack={onClose} />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }}
            showsVerticalScrollIndicator={false}
            bounces
          >
            {/* Identity block — hero panel tinted by the friend's arena */}
            <GamePanel hero tint={color} style={{ marginBottom: 14 }} bodyStyle={{ alignItems: 'center', paddingVertical: 22 }}>
              <AvatarBadge avatarId={profile?.avatar ?? profile?.selectedAvatar} size={104} ringColor={color} frameId={profile?.frame} trophies={profile?.trophies} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, maxWidth: '100%' }}>
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 22, ...engrave('lg'), flexShrink: 1 }} numberOfLines={1}>{profile?.displayName}</Text>
                {profile?.isBot ? <Ribbon label="BOT" color={theme.gold} /> : null}
              </View>
              {/* Gold trophies chip — surface2 face + arena-tint accent ring, integrated depth */}
              <View style={{ borderRadius: 12, backgroundColor: theme.surface2, marginTop: 8, ...shadowRow }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surface2, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: withAlpha(color, 0.45), paddingHorizontal: 14, paddingVertical: 6 }}>
                  <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
                  <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
                  <Ionicons name="trophy" size={15} color={theme.gold} />
                  <Text style={{ color: theme.gold, fontFamily: 'Poppins-ExtraBold', fontSize: 15, fontVariant: ['tabular-nums'], ...engrave('sm') }}>{profile?.trophies ?? 0}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>· {profile?.arena ? arenaLabel(profile.arena.name) + (profile.arena.name === 'GOAT' ? goatStageLabel(profile.trophies) : '') : ''}</Text>
                </View>
              </View>
            </GamePanel>

            {/* Stats */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatCard icon="trophy" color={theme.primary} label={t('stats.wins')} value={profile?.wins ?? 0} />
              <StatCard icon="skull-outline" color={theme.danger} label={t('stats.losses')} value={profile?.losses ?? 0} />
              <StatCard icon="stats-chart" color={theme.blue} label={t('stats.winRate')} value={`${winRate}%`} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <StatCard icon="flame" color={theme.flame} label={t('stats.bestStreak')} value={profile?.bestStreak ?? 0} />
            </View>
            <View style={{ marginTop: 12 }}>
              <SectionHeader label={t('stats.modeBreakdown')} icon="analytics" />
              <ModeStatsGrid stats={profile?.modeStats ?? profileModes} />
            </View>
            {relation === 'none' && onAddFriend ? (
              <View style={{ marginTop: 14 }}>
                <Btn
                  big
                  label={requestSent ? t('friends.requestSentShort') : t('friends.addFriend')}
                  icon={requestSent ? 'checkmark-circle' : 'person-add'}
                  kind={requestSent ? 'ghost' : 'primary'}
                  disabled={requestSent}
                  onPress={() => { setRequestSent(true); onAddFriend(); }}
                />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Animated.View>
    </SafeModal>
  );
}

// ---- Friends ----

// Count badge (tab bars, conversation rows): danger disc + 2px bg2 separating
// ring + engraved count, spring-pop on change (spec §8).
function CountBadge({ count, style }: { count: number; style?: any }) {
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(count);
  useEffect(() => {
    if (count === prev.current) return;
    prev.current = count;
    if (count > 0) {
      pop.setValue(0.5);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    }
  }, [count, pop]);
  if (count <= 0) return null;
  return (
    <Animated.View
      style={[{
        transform: [{ scale: pop }],
        backgroundColor: theme.danger, borderRadius: 11, minWidth: 20, height: 20,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
        borderWidth: 2, borderColor: theme.bg2,
      }, style]}
    >
      <Text style={{ color: theme.text, fontSize: 10, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{count}</Text>
    </Animated.View>
  );
}

// THE social list-row shell — the friend-row bevel recipe (2px ring with a
// panelTopGloss top edge, 3px cardLip lip, drop shadow) plus pressed feedback:
// 2px sink onto the lip + face darken. `ring` tints the frame (online/unread),
// `wash` lays the glowSoft unread wash over the face.
function BevelRow({ onPress, ring, wash = false, outerStyle, style, children }: {
  onPress?: (e: { nativeEvent: { pageX: number; pageY: number } }) => void;
  ring?: string; wash?: boolean; outerStyle?: any; style?: any; children: ReactNode;
}) {
  const face = (pressed: boolean) => (
    <View
      style={[{
        borderRadius: 15,
        ...shadowRow,
      }, outerStyle]}
    >
      <View
        style={[{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: pressed ? darken(theme.surface2, 0.14) : theme.surface2,
          borderRadius: 14, padding: 12, overflow: 'hidden',
          ...(ring ? { borderWidth: 2, borderColor: ring } : {}),
          transform: [{ translateY: pressed ? 2 : 0 }],
        }, style]}
      >
        {/* prestige depth: top light + integrated bottom slice (no default ring) */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.07 }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
        {wash ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.glowSoft }]} /> : null}
        {children}
      </View>
    </View>
  );
  if (!onPress) return face(false);
  return <Pressable onPress={onPress}>{({ pressed }) => face(pressed)}</Pressable>;
}

// Mini lipped circular icon-button (add-friend / view-profile / row actions):
// face on a darker lip, top gloss, 1px press sink.
function MiniIconBtn({ icon, face, lip, fg, ringColor, onPress, size = 34 }: {
  icon: IoniconName; face: string; lip: string; fg: string; ringColor?: string; onPress: () => void; size?: number;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      {({ pressed }) => (
        <View style={{ backgroundColor: lip, borderRadius: size / 2 + 2, paddingBottom: pressed ? 1 : 2.5 }}>
          <View
            style={{
              width: size, height: size, borderRadius: size / 2,
              backgroundColor: pressed ? darken(face, 0.1) : face,
              borderWidth: ringColor ? 1.5 : 0, borderColor: ringColor,
              borderTopWidth: 1.5, borderTopColor: ringColor ?? 'rgba(255,255,255,0.30)',
              alignItems: 'center', justifyContent: 'center',
              transform: [{ translateY: pressed ? 1.5 : 0 }],
            }}
          >
            <Ionicons name={icon} size={Math.round(size * 0.46)} color={fg} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

// Segmented control in a recessed trough: active segment is a chunky mint face
// on a primaryDark lip; inactive segments are quiet wells with a 2px press-lip.
function SegmentedTabs<K extends string>({ tabs, active, onChange }: {
  tabs: { key: K; icon: IoniconName; label: string; badge?: number }[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row', gap: 3, padding: 3,
        backgroundColor: theme.well, borderRadius: 15, overflow: 'hidden', // dark top = sunken
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
      {tabs.map((tab) => (
        <SegmentTab key={tab.key} icon={tab.icon} label={tab.label} badge={tab.badge ?? 0} active={tab.key === active} onPress={() => onChange(tab.key)} />
      ))}
    </View>
  );
}

function SegmentTab({ icon, label, badge, active, onPress }: {
  icon: IoniconName; label: string; badge: number; active: boolean; onPress: () => void;
}) {
  const { ty, onIn, onOut } = usePressLip(2);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ flex: 1 }}>
      <View style={{ backgroundColor: active ? theme.primaryDark : 'transparent', borderRadius: 11, paddingBottom: active ? 2 : 0 }}>
        <Animated.View
          style={{
            transform: [{ translateY: ty }],
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            paddingVertical: 9,
            // primaryDark lip: radius 11, flush top/sides, 2px bottom lip when active → 11 top / 9 bottom
            borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 9, borderBottomRightRadius: 9,
            backgroundColor: active ? theme.primary : 'transparent',
            borderTopWidth: active ? 1.5 : 0, borderTopColor: 'rgba(255,255,255,0.30)',
          }}
        >
          <Ionicons name={icon} size={14} color={active ? theme.ink : theme.muted} />
          <Text numberOfLines={1} style={{ color: active ? theme.ink : theme.muted, fontSize: 12, fontFamily: 'Poppins-ExtraBold', flexShrink: 1 }}>{label}</Text>
        </Animated.View>
      </View>
      <CountBadge count={badge} style={{ position: 'absolute', top: -7, right: -3 }} />
    </Pressable>
  );
}

// Pages content INSIDE one mounted GameModal: 200ms translateX/opacity slide on
// page change (spec §7 — chained setTimeout modal handoffs are banned).
// `dir` = 1 slides the new page in from the right (deeper), -1 from the left (back).
function ModalPager({ pageKey, dir = 1, children }: { pageKey: string; dir?: 1 | -1; children: ReactNode }) {
  const a = useRef(new Animated.Value(1)).current;
  const prev = useRef(pageKey);
  const dirRef = useRef<1 | -1>(dir);
  // Detect the page swap during render so the incoming page never flashes at
  // identity before the entrance starts (setValue is idempotent & pre-paint).
  if (prev.current !== pageKey) {
    prev.current = pageKey;
    dirRef.current = dir;
    a.setValue(0);
  }
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [pageKey, a]);
  return (
    <Animated.View
      style={{
        opacity: a,
        transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [dirRef.current * 26, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// Mini step-back button for paged dialogs — the ScreenHeader back-button chrome
// at dialog scale (34px beveled square, pressed 2px sink).
function ModalBackBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 34, height: 34, borderRadius: 12,
        backgroundColor: pressed ? theme.well : theme.surface2,
        borderTopWidth: 1, borderTopColor: theme.topLight,
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateY: pressed ? 2 : 0 }],
        ...shadowRow,
      })}
    >
      <Ionicons name="chevron-back" size={18} color={theme.text} />
    </Pressable>
  );
}

// Fades content back in whenever `trigger` changes (tab switches, page swaps).
function CrossFade({ trigger, children }: { trigger: unknown; children: ReactNode }) {
  const a = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [trigger, a]);
  return <Animated.View style={{ opacity: a }}>{children}</Animated.View>;
}

// Incoming friend request row: BevelRow shell + mini circular lipped accept/deny
// buttons; resolving slides the row out (translateX + fade + scaleY, 200ms,
// native driver) before the server reflow removes it — no instant frame-cut.
function FriendRequestRow({ request, onRespond }: {
  request: GameState['friendRequests'][number];
  onRespond: (accept: boolean) => void;
}) {
  const out = useRef(new Animated.Value(0)).current;
  const [hidden, setHidden] = useState(false);
  const resolving = useRef(false);
  const resolve = (accept: boolean) => {
    if (resolving.current) return;
    resolving.current = true;
    onRespond(accept); // protocol call unchanged — fires immediately
    Animated.timing(out, { toValue: 1, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setHidden(true);
    });
  };
  if (hidden) return null;
  return (
    <Animated.View
      style={{
        opacity: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          { translateX: out.interpolate({ inputRange: [0, 1], outputRange: [0, 84] }) },
          { scaleY: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) },
        ],
      }}
    >
      <BevelRow ring={theme.accent} outerStyle={{ marginBottom: 8 }}>
        {/* leading icon gem (GameRow recipe) */}
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.cardLip, borderWidth: 1.5, borderColor: darken(theme.accent, 0.25), alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person-add" size={18} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14, ...engrave('sm') }} numberOfLines={1}>{request.fromName}</Text>
          <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }} numberOfLines={1}>{t('friends.wantsToBeFriend')}</Text>
        </View>
        <MiniIconBtn icon="checkmark" face={theme.primary} lip={theme.primaryDark} fg={theme.ink} size={36} onPress={() => resolve(true)} />
        <MiniIconBtn icon="close" face={theme.danger} lip={theme.dangerDark} fg={theme.text} size={36} onPress={() => resolve(false)} />
      </BevelRow>
    </Animated.View>
  );
}

// Inline toast pill for transient notices/errors: glowSoft+primary (ok) or
// danger tint (error), 180ms fade + rise entrance (native driver).
function ToastPill({ kind, text }: { kind: 'ok' | 'error'; text: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [text, a]);
  const ok = kind === 'ok';
  const fg = ok ? theme.primary : theme.danger;
  return (
    <Animated.View
      style={{
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginTop: 8,
        paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999,
        backgroundColor: ok ? theme.glowSoft : withAlpha(theme.danger, 0.14),
        borderWidth: 1.5, borderColor: fg,
      }}
    >
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={14} color={fg} />
      <Text style={{ color: fg, fontSize: 12, fontFamily: 'Poppins-SemiBold', flexShrink: 1 }}>{text}</Text>
    </Animated.View>
  );
}

// Tiny mint "copied" confirmation pill — 150ms fade/scale/rise beside the copy button.
function CopiedPill({ visible }: { visible: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: visible ? 1 : 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [visible, a]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', right: 60,
        opacity: a,
        transform: [
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
        ],
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: theme.primary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2.5,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.4)',
        borderBottomWidth: 2, borderBottomColor: theme.primaryDark,
      }}
    >
      <Ionicons name="checkmark" size={10} color={theme.ink} />
      <Text style={{ color: theme.ink, fontSize: 9.5, fontFamily: 'Poppins-Black', letterSpacing: 1 }}>{t('friends.copied')}</Text>
    </Animated.View>
  );
}

// Spring pop-in wrapper for anchored popovers: scale 0.92→1 + fade + small rise
// (friction 6 / tension 120 — the dialog spring).
function SpringPop({ style, children }: { style?: any; children: ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [a]);
  const clamped = a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <Animated.View
      style={[{
        opacity: clamped,
        transform: [
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
        ],
      }, style]}
    >
      {children}
    </Animated.View>
  );
}

// ---- Arkadaş / sohbet satırları — memo'lu, YALNIZ ilkel props ----
// Ekleme girişi + mesaj araması FriendsScreen'in kendi state'i: her tuş vuruşu
// ve her typing/presence dispatch'i tüm ekranı yeniden çizer(di). Satırlar ilkel
// props'lu memo bileşenlere çekilince bu render'lar satır alt-ağaçlarını atlar —
// yalnız kendi metni/durumu/typing/unread'i değişen satır çizilir.
// statusText/timeText BİLEREK ebeveynde hesaplanır: memo'lu satırın içinde
// hesaplansaydı props'u hiç değişmeyen satır "5 dk önce"de sonsuza dek donardı;
// ebeveynin her render'ı ucuz string'i tazeler, memo da string'i karşılaştırır.
const FriendRow = memo(function FriendRow({ userId, displayName, online, trophies, statusText, avatarId, frameId, onMenu }: {
  userId: string; displayName: string; online: boolean; trophies: number; statusText: string;
  avatarId?: string | null; frameId?: string | null;
  onMenu: (userId: string, x: number, y: number) => void;
}) {
  return (
    <BevelRow
      onPress={(e) => onMenu(userId, e.nativeEvent.pageX, e.nativeEvent.pageY)}
      ring={online ? theme.primary : undefined}
      outerStyle={{ marginBottom: 8 }}
      style={{ gap: 12 }}
    >
      <View style={{ position: 'relative' }}>
        <AvatarBadge avatarId={avatarId} size={38} ringColor={theme.accent} frameId={frameId} />
        {online ? <View style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 15, ...engrave('sm') }} numberOfLines={1}>{displayName}</Text>
        <Text style={{ color: online ? theme.primary : theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }} numberOfLines={1}>{statusText}</Text>
      </View>
      {/* Trophy on the far right */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.surface1, borderRadius: 12, borderTopWidth: 1, borderTopColor: theme.topLight, paddingHorizontal: 9, paddingVertical: 5 }}>
        <Ionicons name="trophy" size={13} color={theme.gold} />
        <Text style={{ color: theme.gold, fontFamily: 'Poppins-ExtraBold', fontSize: 13, fontVariant: ['tabular-nums'], ...engrave('sm') }}>{trophies}</Text>
      </View>
    </BevelRow>
  );
});

const ConversationRow = memo(function ConversationRow({ userId, displayName, online, typing, unreadCount, lastMessage, timeText, avatarId, frameId, onOpen }: {
  userId: string; displayName: string; online: boolean; typing: boolean; unreadCount: number;
  lastMessage: string; timeText: string; avatarId?: string | null; frameId?: string | null;
  onOpen: (userId: string) => void;
}) {
  return (
    <BevelRow
      onPress={() => onOpen(userId)}
      ring={unreadCount > 0 ? theme.primary : undefined}
      wash={unreadCount > 0}
      outerStyle={{ marginBottom: 8 }}
    >
      <View style={{ position: 'relative' }}>
        <AvatarBadge avatarId={avatarId} size={44} ringColor={online ? theme.primary : theme.border} frameId={frameId} />
        {online ? <View style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14, ...engrave('sm') }} numberOfLines={1}>{displayName}</Text>
        <Text style={{ color: typing ? theme.primary : unreadCount > 0 ? theme.text : theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold' }} numberOfLines={1}>
          {typing ? t('chat.typing') : lastMessage}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{timeText}</Text>
        <CountBadge count={unreadCount} />
      </View>
    </BevelRow>
  );
});

export function FriendsScreen({ state, actions, onGoToStore, onLockedSocialMode, focusAddFriendSeq }: Props) {
  const [addInput, setAddInput] = useState('');
  const [searchMode, setSearchMode] = useState<'code' | 'username'>('code');
  const [friendTab, setFriendTab] = useState<'friends' | 'requests' | 'messages'>('friends');
  const [msgSearch, setMsgSearch] = useState('');
  const [copied, setCopied] = useState(false);
  // Davet ödülü: kod paylaşımı + yeni hesapların kod giriş alanı
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [matchModal, setMatchModal] = useState<string | null>(null); // friendId — friendly-match dialog
  // Friendly-match setup pages ALL live inside one mounted GameModal (mode →
  // scope → league/country) and slide between each other — no modal handoffs.
  const [matchPage, setMatchPage] = useState<{ key: 'mode' | 'scope' | 'league' | 'country'; dir: 1 | -1 }>({ key: 'mode', dir: 1 });
  const [matchMode, setMatchMode] = useState<GameMode>('team-team');
  const [menuFriend, setMenuFriend] = useState<FriendInfo | null>(null); // tapped friend → actions popover
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // tap anchor for the popover
  const [menuH, setMenuH] = useState(222); // measured popover height — hard-coding it mis-seats the panel when labels wrap (long locales / large type)
  const [confirmRemove, setConfirmRemove] = useState<FriendInfo | null>(null); // remove confirmation
  // The match-setup modal hands off to another native <SafeModal> (the social-pack
  // upsell or the invite-waiting dialog). iOS presents ONE modal at a time, so we
  // stash the intent and run it in matchModal's onExited — after its native
  // dismissal — never in the same commit (which overlaps two modals and FREEZES
  // the app: dead touches + no scroll).
  const matchExitAction = useRef<null | { kind: 'social'; mode: GameMode } | { kind: 'invite'; fid: string; name: string; options: GameOptions }>(null);
  // Friendly-match tap in the row menu: the match dialog must NOT open in the
  // same commit that dismisses the menu Modal (same-tick native modal swap —
  // the second presentation can silently fail on iOS). Stash the friend id and
  // open from the menu Modal's onDismiss (iOS); Android has no onDismiss, so it
  // opens directly (Android tolerates the swap).
  const menuExitInvite = useRef<string | null>(null);
  // Menüden açılan DİĞER pencereler (profil / sohbet) de menü modalı kapanana
  // kadar bekler: iki native modal aynı anda sunulunca iOS görünmez bir modal
  // bırakıyor ve uygulama donuyordu.
  const menuExitAction = useRef<null | { kind: 'profile' | 'chat'; id: string }>(null);
  const menuActionLock = useRef(false);
  const addInputRef = useRef<TextInput>(null);   // empty-state CTA → focus add-friend input
  const msgSearchRef = useRef<TextInput>(null);  // empty-state CTA → focus message search
  const profile = state.profile;
  const hasSocialPack = profile?.socialPackUntil ? new Date(profile.socialPackUntil) > new Date() : false;
  // Sıralama: çevrimiçiler en üstte (kendi içinde kupa azalan), sonra
  // çevrimdışılar kupa azalan — "kim müsait + kim güçlü" tek bakışta.
  const friends = useMemo(
    () => [...state.friends].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || (b.trophies ?? 0) - (a.trophies ?? 0)),
    [state.friends],
  );

  // Memo'lu satırların sabit kimlikli handler'ları. En-son-değer ref kalıbı:
  // actions/friends her render'da tazelenebilir, sarmalayıcı basış anında DAİMA
  // güncelini kullanır (bayat closure imkânsız). Menü, satırdaki f nesnesini
  // kapatmak yerine userId ile en güncel listeden bulur — arkadaş bu arada
  // listeden düştüyse sessizce vazgeçer (eskisi bayat nesneyle açardı).
  const actionsRef = useRef(actions); actionsRef.current = actions;
  const friendsRef = useRef(friends); friendsRef.current = friends;
  const onOpenChat = useCallback((userId: string) => { dismissActiveInput(); actionsRef.current.openChat(userId); }, []);
  const onFriendMenu = useCallback((userId: string, x: number, y: number) => {
    const f = friendsRef.current.find((fr) => fr.userId === userId);
    if (!f) return;
    menuActionLock.current = false;
    setMenuPos({ x, y });
    setMenuFriend(f);
  }, []);

  // Auto-clear the transient "request sent" notice.
  useEffect(() => {
    if (!state.notice) return;
    const id = setTimeout(() => actions.clearNotice(), 2600);
    return () => clearTimeout(id);
  }, [state.notice]);
  // Aynı şekilde arkadaş bildirimi (zaten arkadaş / davet reddedildi) — YALNIZ burada.
  useEffect(() => {
    if (!state.friendNotice) return;
    const id = setTimeout(() => actions.clearFriendNotice(), 2600);
    return () => clearTimeout(id);
  }, [state.friendNotice]);
  const requests = state.friendRequests;

  useEffect(() => {
    if (profile?.userId && state.connected) actions.loadFriends();
  }, [profile?.userId, state.connected]);

  // Home's find-friend card lands here: switch to name search and raise the keyboard.
  // The delay lets the tab pager's instant jump settle before focus scrolls/animates.
  // The ref seeds from the mount-time value so a remount (e.g. the language-change
  // key bump) with an old nonzero seq doesn't steal focus — only a fresh tap does.
  const handledAddSeq = useRef(focusAddFriendSeq ?? 0);
  useEffect(() => {
    if (!focusAddFriendSeq || focusAddFriendSeq === handledAddSeq.current) return;
    handledAddSeq.current = focusAddFriendSeq;
    setSearchMode('username');
    const id = setTimeout(() => addInputRef.current?.focus(), 300);
    return () => clearTimeout(id);
  }, [focusAddFriendSeq]);

  // Misafir kapısı: misafir hesap arkadaş EKLEYEMEZ — denemede kayıt penceresi açılır.
  const isGuest = state.authProvider == null;
  const [guestGateOpen, setGuestGateOpen] = useState(false);
  useEffect(() => {
    // kayıt tamamlanınca (Apple/Google bağlandı) kapı kendiliğinden kapanır
    if (state.authProvider != null) setGuestGateOpen(false);
  }, [state.authProvider]);

  const onSendRequest = () => {
    const val = addInput.trim();
    if (val.length < 3) return;
    if (isGuest) { setGuestGateOpen(true); return; }
    if (searchMode === 'code') {
      actions.sendFriendRequest(val, undefined);
    } else {
      actions.sendFriendRequest(undefined, val);
    }
    setAddInput('');
    // İstek gönderilince klavye kapansın — submit'te (return) TextInput odakta kalıp
    // klavyeyi açık bırakıyordu ("klavye full açık kalıyor"). Blur + dismiss birlikte.
    dismissActiveInput();
  };

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets>
        <ScreenHeader title={t('friends.title')} icon="people" />

        {/* Your code — recessed trough (engraved code) + mini beveled copy button + copied pill */}
        <Text style={styles.sectionLabel}>{t('friends.yourCode')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 5 }}>
          <View
            style={{
              flex: 1, alignItems: 'center', justifyContent: 'center',
              backgroundColor: theme.well, borderRadius: 14, paddingVertical: 12, overflow: 'hidden', // dark top = sunken
            }}
          >
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
            <Text style={styles.friendCode}>{profile?.userId?.slice(0, 8).toUpperCase() ?? '...'}</Text>
          </View>
          {/* Kopyala butonu kod kutusuyla AYNI yükseklikte (alignSelf:stretch), ÜSTTE
              hiçbir çizgi/highlight YOK (kullanıcı isteği) — düz, tam kapalı üst. */}
          <Pressable
            onPress={() => {
              const code = profile?.userId?.slice(0, 8).toUpperCase();
              if (code) {
                Clipboard.setStringAsync(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 52, alignSelf: 'stretch', borderRadius: 14,
              backgroundColor: pressed ? darken(theme.surface2, 0.12) : theme.surface2,
              alignItems: 'center', justifyContent: 'center',
              transform: [{ translateY: pressed ? 1 : 0 }],
            })}
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={copied ? theme.primary : theme.accent} />
          </Pressable>
          <CopiedPill visible={copied} />
        </View>

        {/* Davet ödülü — kodunu paylaş, ikiniz de kazanın (sunucu kuralları:
            kod giren kimlikli + ≤7 günlük hesap; tek kullanım; oto-arkadaşlık). */}
        <Text style={styles.sectionLabel}>DAVET ÖDÜLÜ</Text>
        <View style={{ marginVertical: 5 }}>
          <GamePanel compact tint={theme.gold}>
            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 13.5 }}>Arkadaşını getir — ikinize de 100 💎</Text>
              <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 11.5, lineHeight: 16 }}>
                Kodunu paylaş; arkadaşın ilk 7 gününde girerse ikiniz de kazanır, otomatik arkadaş olursunuz.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn compact kind="primary" icon="share-social" label="KODU PAYLAŞ" feedback={GameFeedbackEvent.UI_CONFIRM} onPress={() => {
                  const code = profile?.userId?.slice(0, 8).toUpperCase();
                  if (!code) return;
                  track('referral_share', {});
                  void Share.share({ message: `CrossOver Football'da bana karşı oyna! ⚽ Davet kodum: ${code} — uygulamada girersen İKİMİZ de 100💎 kazanırız.\nhttps://crossoverfootball.com/indir` }).catch(() => {});
                }} />
                <Btn compact kind="ghost" label="Kodun mu var?" onPress={() => setRedeemOpen((v) => !v)} />
              </View>
              {redeemOpen ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <GameInput
                    placeholder="Davet kodu"
                    value={redeemCode}
                    onChangeText={setRedeemCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    containerStyle={{ flex: 1 }}
                  />
                  <Btn compact kind="accent" label="GÖNDER" disabled={!redeemCode.trim()} feedback={GameFeedbackEvent.UI_CONFIRM} onPress={() => {
                    track('referral_redeem_submit', {});
                    actions.redeemReferral(redeemCode.trim());
                    dismissActiveInput();
                  }} />
                </View>
              ) : null}
              {state.referralRedeem ? (
                <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5 }}>
                  🎉 {state.referralRedeem.referrerName} ile arkadaş oldunuz — +{state.referralRedeem.reward} 💎 hesabında!
                </Text>
              ) : null}
            </View>
          </GamePanel>
        </View>

        {/* Add friend — search mode as a segmented control (same trough voice as the tab bar) */}
        <Text style={styles.sectionLabel}>{t('friends.addSection')}</Text>
        <View style={{ marginBottom: 6 }}>
          <SegmentedTabs
            tabs={[
              { key: 'code', icon: 'key-outline', label: t('friends.byCode') },
              { key: 'username', icon: 'person-outline', label: t('friends.byName') },
            ]}
            active={searchMode}
            onChange={setSearchMode}
          />
        </View>
        <GameInput
          inputRef={addInputRef}
          placeholder={searchMode === 'code' ? t('friends.enterCode') : t('friends.usernamePlaceholder')}
          value={addInput}
          onChangeText={setAddInput}
          autoCapitalize={searchMode === 'code' ? 'characters' : 'none'}
          autoCorrect={false}
          onSubmitEditing={onSendRequest}
        />
        {searchMode === 'code' ? (
          <Btn label={t('friends.sendRequest')} icon="paper-plane" kind="primary" onPress={onSendRequest} disabled={addInput.trim().length < 3} />
        ) : (
          <Btn label={t('friends.search')} icon="search" kind="primary" onPress={() => { if (addInput.trim().length >= 3) actions.searchUsers(addInput.trim()); }} disabled={addInput.trim().length < 3} />
        )}
        {!isNetworkErrorMessage(state.error) && state.error ? <ToastPill kind="error" text={state.error} /> : null}
        {state.notice ? <ToastPill kind="ok" text={state.notice} /> : null}
        {state.friendNotice ? <ToastPill kind={state.friendNotice.kind} text={state.friendNotice.text} /> : null}

        {/* Username search results — same bevel voice as the friend rows */}
        {searchMode === 'username' && state.userSearchResults.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            {state.userSearchResults.map((u) => (
              <BevelRow key={u.userId} outerStyle={{ marginBottom: 6 }} style={{ paddingVertical: 9 }}>
                <Avatar avatar={null} name={u.displayName} size={34} ring={theme.primary} ringWidth={1.5} iconColor={theme.primary} iconSize={15} />
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 13, flex: 1, ...engrave('sm') }} numberOfLines={1}>{u.displayName}</Text>
                <MiniIconBtn icon="eye" face={theme.surface2} lip={theme.shadowInk} fg={theme.text} onPress={() => actions.getUserProfile(u.userId)} />
                <MiniIconBtn icon="person-add" face={theme.primary} lip={theme.primaryDark} fg={theme.ink} onPress={() => { if (isGuest) { setGuestGateOpen(true); return; } actions.sendFriendRequest(undefined, u.displayName); dismissActiveInput(); }} />
              </BevelRow>
            ))}
          </View>
        ) : null}

        {/* Tabs: Arkadaşlarım | İstekler | Mesajlar — segmented control in a recessed trough */}
        <View style={{ marginTop: 18, marginBottom: 12 }}>
          <SegmentedTabs
            tabs={[
              { key: 'friends', icon: 'people', label: t('friends.tabFriends') },
              { key: 'requests', icon: 'person-add', label: t('friends.tabRequests'), badge: requests.length },
              { key: 'messages', icon: 'chatbubbles', label: t('friends.tabMessages'), badge: state.totalUnread },
            ]}
            active={friendTab}
            onChange={(key) => {
              setFriendTab(key);
              if (key === 'messages') actions.loadConversations();
            }}
          />
        </View>

        <CrossFade trigger={friendTab}>
        {/* Requests tab */}
        {friendTab === 'requests' ? (
          requests.length === 0 ? (
            <EmptyState
              icon="mail-open"
              title={t('friends.noPendingRequests')}
              hint={t('friends.noRequestsHint')}
              cta={<Btn label={t('friends.add')} kind="ghost" icon="person-add" onPress={() => addInputRef.current?.focus()} />}
            />
          ) : (
            requests.map((req) => (
              <FriendRequestRow
                key={req.requestId || req.fromId}
                request={req}
                onRespond={(accept) => actions.respondFriendRequest(req.requestId, accept)}
              />
            ))
          )
        ) : friendTab === 'messages' ? (
          <>
            {/* Search bar for starting a new chat */}
            <GameInput
              icon="search"
              inputRef={msgSearchRef}
              placeholder={t('friends.searchFriends')}
              value={msgSearch}
              onChangeText={setMsgSearch}
              containerStyle={{ marginTop: 0, marginBottom: 10 }}
              style={{ fontSize: 13 }}
            />
            {/* Search results — friends not in conversations yet */}
            {msgSearch.trim().length >= 2 ? (() => {
              const q = msgSearch.trim().toLowerCase();
              const matches = friends.filter(f => f.displayName.toLowerCase().includes(q) && !state.conversations.some(c => c.userId === f.userId));
              return matches.length > 0 ? matches.map(f => (
                <BevelRow key={f.userId} onPress={() => { setMsgSearch(''); onOpenChat(f.userId); }} outerStyle={{ marginBottom: 6 }} style={{ padding: 10 }}>
                  <Avatar avatar={f.avatar} name={f.displayName} size={36} ring={theme.primary} iconColor={theme.primary} iconSize={16} frameId={f.frame} />
                  <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14, flex: 1, ...engrave('sm') }} numberOfLines={1}>{f.displayName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary, borderRadius: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.30)', borderBottomWidth: 2, borderBottomColor: theme.primaryDark, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Ionicons name="chatbubble" size={12} color={theme.ink} />
                    <Text style={{ color: theme.ink, fontFamily: 'Poppins-ExtraBold', fontSize: 11 }}>{t('friends.sendMessage')}</Text>
                  </View>
                </BevelRow>
              )) : null;
            })() : null}
            {/* Conversation list */}
            {state.conversations.length === 0 && !msgSearch.trim() ? (
              <EmptyState
                icon="chatbubbles"
                title={t('friends.noChats')}
                hint={t('friends.searchToMessage')}
                cta={<Btn label={t('friends.search')} kind="ghost" icon="search" onPress={() => msgSearchRef.current?.focus()} />}
              />
            ) : state.conversations.map(c => (
              <ConversationRow
                key={c.userId}
                userId={c.userId}
                displayName={c.displayName}
                online={c.online}
                typing={!!state.typingFrom[c.userId]}
                unreadCount={c.unreadCount}
                lastMessage={c.lastMessage}
                timeText={shortDate(c.lastMessageAt)}
                avatarId={c.avatar ?? c.selectedAvatar}
                frameId={c.frame}
                onOpen={onOpenChat}
              />
            ))}
          </>
        ) : /* Friends tab */ friends.length === 0 ? (
          <EmptyState
            icon="people"
            title={t('friends.empty')}
            hint={t('friends.shareHint')}
            cta={<Btn label={t('friends.add')} kind="ghost" icon="person-add" onPress={() => addInputRef.current?.focus()} />}
          />
        ) : (
          friends.map((f) => (
            <FriendRow
              key={f.userId}
              userId={f.userId}
              displayName={f.displayName}
              online={f.online}
              trophies={f.trophies}
              statusText={f.online ? t('common.online') : lastSeenLabel(f.lastSeen)}
              avatarId={f.avatar ?? f.selectedAvatar}
              frameId={f.frame}
              onMenu={onFriendMenu}
            />
          ))
        )}
        </CrossFade>
      </ScrollView>

      <NetworkErrorBeacon visible={isNetworkErrorMessage(state.error)} />

      {/* Friend actions — small Clash-Royale-style popover above the tapped row */}
      <SafeModal visible={menuFriend !== null} transparent animationType="none" onRequestClose={() => setMenuFriend(null)} onDismiss={() => {
        const fid = menuExitInvite.current; menuExitInvite.current = null;
        if (fid) { setMatchPage({ key: 'mode', dir: 1 }); setMatchModal(fid); return; }
        const a = menuExitAction.current; menuExitAction.current = null;
        if (a?.kind === 'profile') actions.getUserProfile(a.id);
        else if (a?.kind === 'chat') onOpenChat(a.id);
      }}>
        <View style={{ flex: 1 }} pointerEvents="box-none">
          <Pressable style={[StyleSheet.absoluteFill, { zIndex: 0 }]} onPress={() => setMenuFriend(null)} />
          {menuFriend ? (() => {
            const W = 236;
            const H = menuH; // measured via onLayout below; 222 only until the first layout
            const left = Math.max(8, Math.min(menuPos.x - W / 2, SCREEN_W - W - 8));
            const top = Math.max(56, menuPos.y - H - 14);
            const tailLeft = Math.min(Math.max(menuPos.x - left - 8, 18), W - 34);
            const Row = ({ color, label, onPress }: { color: string; label: string; onPress: () => void }) => (
              <Pressable
                onPress={() => {
                  if (menuActionLock.current) return;
                  menuActionLock.current = true;
                  onPress();
                }}
                hitSlop={6}
                pressRetentionOffset={18}
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                  backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent',
                })}
              >
                {({ pressed }) => (
                  <Text style={{ color, fontFamily: 'Poppins-ExtraBold', fontSize: 14, ...engrave('sm'), transform: [{ translateY: pressed ? 2 : 0 }], opacity: pressed ? 0.82 : 1 }}>{label}</Text>
                )}
              </Pressable>
            );
            return (
              <View style={{ position: 'absolute', left, top, width: W, zIndex: 2, elevation: 20 }} pointerEvents="box-none" onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== menuH) setMenuH(h); }}>
                {/* GamePanel-compact frame language + 150ms spring pop anchored at the tail */}
                <SpringPop>
                  <View style={{ backgroundColor: theme.surface1, borderRadius: 15, ...shadowModal }}>
                    <View style={{ backgroundColor: theme.modalFace, borderRadius: 15, borderTopWidth: 1, borderTopColor: theme.topLight, overflow: 'hidden' }}>
                      <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28, zIndex: 5 }} />
                      <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.5, textAlign: 'center', paddingTop: 9, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: theme.hairline }} numberOfLines={1}>
                        {menuFriend.displayName}
                      </Text>
                      <Row color={theme.text} label={t('friends.friendlyMatch')} onPress={() => { menuExitInvite.current = menuFriend.userId; setMenuFriend(null); if (Platform.OS !== 'ios') { const fid = menuExitInvite.current; menuExitInvite.current = null; if (fid) { setMatchPage({ key: 'mode', dir: 1 }); setMatchModal(fid); } } }} />
                      <View style={{ height: 1, backgroundColor: theme.hairline, marginHorizontal: 10 }} />
                      <Row color={theme.text} label={t('friends.sendMessage')} onPress={() => { menuExitAction.current = { kind: 'chat', id: menuFriend.userId }; setMenuFriend(null); if (Platform.OS !== 'ios') { const a = menuExitAction.current; menuExitAction.current = null; if (a) onOpenChat(a.id); } }} />
                      <View style={{ height: 1, backgroundColor: theme.hairline, marginHorizontal: 10 }} />
                      <Row color={theme.text} label={t('friends.viewProfile')} onPress={() => { menuExitAction.current = { kind: 'profile', id: menuFriend.userId }; setMenuFriend(null); if (Platform.OS !== 'ios') { const a = menuExitAction.current; menuExitAction.current = null; if (a) actions.getUserProfile(a.id); } }} />
                      <View style={{ height: 1, backgroundColor: theme.hairline, marginHorizontal: 10 }} />
                      <Row color={theme.danger} label={t('friends.removeFriend')} onPress={() => { const f = menuFriend; setMenuFriend(null); setConfirmRemove(f); }} />
                    </View>
                  </View>
                  {/* downward tail pointing at the row — matches the frame ring */}
                  <View style={{ position: 'absolute', bottom: -7, left: tailLeft, width: 15, height: 15, backgroundColor: theme.modalFace, transform: [{ rotate: '45deg' }], borderRightWidth: 2, borderBottomWidth: 2, borderColor: theme.shadowInk }} />
                </SpringPop>
              </View>
            );
          })() : null}
        </View>
      </SafeModal>

      {/* Remove-friend confirmation */}
      <GameModal visible={confirmRemove !== null} onClose={() => setConfirmRemove(null)} title={t('friends.removeConfirmTitle')} icon="warning" danger>
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 6 }]}> 
          {t('friends.removeConfirmBody', { name: confirmRemove?.displayName ?? '' })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Btn label={t('settings.cancel')} kind="ghost" icon="close" onPress={() => setConfirmRemove(null)} /></View>
          <View style={{ flex: 1 }}><Btn label={t('settings.confirm')} kind="danger" icon="checkmark" onPress={() => { actions.removeFriend(confirmRemove!.userId); setConfirmRemove(null); }} /></View>
        </View>
      </GameModal>

      {/* Friendly match setup — mode → scope → league/country page INSIDE one
          mounted GameModal (200ms slide, spec §7: no setTimeout modal handoffs). */}
      <GameModal
        visible={matchModal !== null}
        onClose={() => setMatchModal(null)}
        onExited={() => {
          const a = matchExitAction.current;
          matchExitAction.current = null;
          if (!a) return;
          if (a.kind === 'social') onLockedSocialMode?.(a.mode);
          else actions.inviteFriendMatch(a.fid, a.name, a.options);
        }}
        title={(
          matchPage.key === 'mode' ? t('friends.matchModeTitle')
          : matchPage.key === 'scope' ? t('friends.scopeTitle')
          : matchPage.key === 'league' ? t('scope.pickLeague')
          : t('scope.pickCountry')
        ).toLocaleUpperCase(currentLang())}
        icon="game-controller"
      >
        <ModalPager pageKey={matchPage.key} dir={matchPage.dir}>
          {matchPage.key === 'mode' ? (
            (['team-team', 'xox', 'country-team', 'letter-team'] as GameMode[]).map((m) => {
              const locked = m !== 'team-team' && !hasSocialPack;
              return (
                <GameRow
                  key={m}
                  icon={MODE_ICON[m]}
                  label={MODE_LABEL(m)}
                  locked={locked}
                  chevron
                  onPress={() => {
                    if (locked) {
                      matchExitAction.current = { kind: 'social', mode: m }; // upsell fires in onExited
                      track('premium_mode_locked_clicked', { mode: m, source: 'friendly_match', social_token_count: profile?.powerSocialToken ?? 0 });
                      track('premium_mode_preview_viewed', { mode: m, source: 'friendly_match', social_token_count: profile?.powerSocialToken ?? 0 });
                      setMatchModal(null);
                      return;
                    }
                    setMatchMode(m);
                    setMatchPage({ key: 'scope', dir: 1 });
                  }}
                />
              );
            })
          ) : matchPage.key === 'scope' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <ModalBackBtn onPress={() => setMatchPage({ key: 'mode', dir: -1 })} />
              </View>
              <GameRow
                icon="earth"
                iconColor={theme.primary}
                label={t('scope.all')}
                onPress={() => {
                  const fid = matchModal;
                  if (!fid) return; // dialog already exiting
                  const name = friends.find((f) => f.userId === fid)?.displayName ?? 'Arkadaş';
                  matchExitAction.current = { kind: 'invite', fid, name, options: { mode: matchMode } };
                  setMatchModal(null); // invite (+ waiting modal) fires in onExited, after native dismissal
                }}
              />
              <GameRow icon="trophy" label={t('scope.pickLeague')} chevron onPress={() => setMatchPage({ key: 'league', dir: 1 })} />
              <GameRow icon="flag" iconColor={theme.blue} label={t('scope.pickCountry')} chevron onPress={() => setMatchPage({ key: 'country', dir: 1 })} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <ModalBackBtn onPress={() => setMatchPage({ key: 'scope', dir: -1 })} />
              </View>
              <ScopeListPage
                key={matchPage.key}
                kind={matchPage.key}
                scopes={state.scopes}
                onPick={(s) => {
                  const fid = matchModal;
                  if (!fid) return; // dialog already exiting
                  const name = friends.find((f) => f.userId === fid)?.displayName ?? 'Arkadaş';
                  matchExitAction.current = { kind: 'invite', fid, name, options: { mode: matchMode, scope: s } };
                  setMatchModal(null); // invite (+ waiting modal) fires in onExited, after native dismissal
                }}
              />
            </>
          )}
        </ModalPager>
      </GameModal>

      {/* Profil penceresi YALNIZ App.tsx'te render edilir. Burada bir İKİNCİSİ
          daha vardı: aynı state (state.viewProfile) iki native modalı birden
          sunmaya çalışıyordu — donmanın ta kendisi; sıraya alınsa bile profil
          kapanınca aynısı bir kez daha açılırdı. */}
      {/* Chat screen — WhatsApp style, swipe-back enabled */}
      <SafeModal visible={state.chatWith !== null} transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={actions.closeChat}>
        <SwipeBackWrap onBack={actions.closeChat}>
          {(softBack) => <ChatScreen state={state} actions={actions} onBack={softBack} />}
        </SwipeBackWrap>
      </SafeModal>

      {/* Misafir kapısı — arkadaş eklemek kayıt ister */}
      <GuestGateModal visible={guestGateOpen} onClose={() => setGuestGateOpen(false)} actions={actions} />
    </Screen>
  );
}

// ---- Typing dot (animated) ----
function TypingDot({ delay }: { delay: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(a, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(400 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, delay]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.primary, transform: [{ scale }], opacity }} />;
}

// New chat messages mount with a 180ms fade + 8px rise (spec §11). History that
// is already on screen when the chat opens must NOT re-animate: items mounted
// with animate=false render at identity and stay there.
function RiseIn({ animate, children }: { animate: boolean; children: ReactNode }) {
  const a = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.timing(a, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [a, animate]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// ---- MessageBubble ----
// Tek mesaj balonu, memo'lu ve TAMAMEN primitive prop'lu: composer'daki her tuş
// vuruşu (setText) ve her klavye frame'i (setKeyboardHeight/setKbOpen)
// ChatScreen'i yeniden çizer — balonlar memo'landığı için o commit'lerde yalnız
// giriş çubuğu kabuğu reconcile edilir, 150 mesajlık geçmiş değil. Zaman
// damgası (Hermes'te pahalı Intl çağrısı) da böylece mesaj başına bir kez
// hesaplanır, tuş vuruşu başına değil. profile/friend OBJELERİ geçirilmez —
// obje kimliği her dispatch'te değişip memo'yu boşa düşürürdü.
const MessageBubble = memo(function MessageBubble({ id, body, deleted, mine, createdAt, avatarId, frameId, actionable, animate, onAction }: {
  id: string;
  body: string;
  deleted: boolean;
  mine: boolean;
  createdAt: string;
  avatarId?: string | null;
  frameId?: string | null;
  actionable: boolean;
  animate: boolean;
  onAction: (id: string, mine: boolean) => void;
}) {
  return (
    <RiseIn animate={animate}>
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
        <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, maxWidth: '80%' }}>
          <AvatarBadge avatarId={avatarId} size={28} ringColor={mine ? theme.primary : theme.border} frameId={frameId} />
          <Pressable onLongPress={actionable ? () => onAction(id, mine) : undefined} delayLongPress={350} style={{
            backgroundColor: mine ? theme.primary : theme.surface2,
            borderRadius: 16,
            borderBottomRightRadius: mine ? 4 : 16,
            borderBottomLeftRadius: mine ? 16 : 4,
            paddingHorizontal: 14, paddingVertical: 9,
            // mine: top-lit mint toy with a primaryDark lip;
            // theirs: surface2 face with topLight edge + integrated shadowInk slice.
            ...(mine
              ? { borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.30)', borderBottomWidth: 2.5, borderBottomColor: theme.primaryDark }
              : { borderTopWidth: 1, borderTopColor: theme.topLight, overflow: 'hidden' as const, ...shadowRow }),
          }}>
            {!mine ? <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} /> : null}
            {deleted ? (
              <Text style={{ color: mine ? withAlpha(theme.ink, 0.6) : theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', fontStyle: 'italic' }}>{t('mod.deleted')}</Text>
            ) : (
              <Text style={{ color: mine ? theme.ink : theme.text, fontSize: 14, fontFamily: 'Poppins-SemiBold' }}>{body}</Text>
            )}
            <Text style={{ color: mine ? withAlpha(theme.ink, 0.55) : theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', marginTop: 3, textAlign: 'right' }}>
              {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Pressable>
        </View>
      </View>
    </RiseIn>
  );
});

// ---- Swipe-back wrapper ----
// Horizontal drag anywhere closes the full-screen chat softly. Supports both
// directions because users describe the gesture differently; vertical scrolls are
// not intercepted.
const SWIPE_THRESHOLD = 0.24; // fraction of screen width to trigger back

// Top edge (pageY) of the chat composer. Gestures starting on/below it never
// capture-steal — otherwise a horizontal text-selection drag inside the input
// would close the chat and destroy the draft (Android TextInput always grants
// responder termination, unlike iOS). ChatScreen keeps this up to date.
const chatComposerTop = { y: Number.POSITIVE_INFINITY };

function SwipeBackWrap({ children, onBack }: { children: (softBack: () => void) => ReactNode; onBack: () => void }) {
  const screenW = canvasSize().width;
  const translateX = useRef(new Animated.Value(screenW)).current;
  const closingRef = useRef(false);
  const ignoreRef = useRef(false);

  const closeWithAnimation = useCallback((direction = 1) => {
    if (closingRef.current) return;
    closingRef.current = true;
    // Retire the keyboard up front so the slide-out and the keyboard teardown
    // don't race the unmount (backing out with the keyboard up froze the screen).
    dismissActiveInput();
    Animated.timing(translateX, {
      toValue: direction >= 0 ? screenW : -screenW,
      duration: 210,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      // Do NOT reset translateX before onBack(): the parent unmounts this wrap a
      // render later, and resetting first popped the closed chat back on screen
      // for those frames — read as "ekran takılıyor". Leave it parked off-screen;
      // the entrance effect re-runs from scratch on the next mount anyway.
      closingRef.current = false;
      onBack();
    });
  }, [onBack, screenW, translateX]);

  useEffect(() => {
    translateX.setValue(screenW);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 210,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screenW, translateX]);

  // RNGH pan (NATIVE-level gesture): unlike the old JS PanResponder capture — which
  // lost the race to the message ScrollView everywhere but the screen edge — this
  // wins a clearly-horizontal drag started ANYWHERE. Vertical intent fails fast so
  // the list scrolls normally; gestures starting on/below the composer are ignored
  // (text-selection drags in the input must never close the chat).
  const springBack = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }).start();
  }, [translateX]);
  // Parmak takibi tamamen NATIVE tarafta: Animated.event, translationX'i her
  // jest karesinde JS'e uğramadan doğrudan native Animated düğümüne yazar. Eski
  // runOnJS(true) + translateX.setValue hattı her karede JS thread'e atlıyordu —
  // WS dispatch'leri/mesaj listesi render'ı sürerken panel parmağın gerisinde
  // kalıp takılıyordu (8783'teki "ekran takılıyor" sınıfı jank). Composer
  // koruması da native hızda: BEGAN'da tek bir gate.setValue(0), çarpan olarak
  // jesti anında etkisizleştirir — bir enabled prop'unu flip edip re-render
  // beklemek JS meşgulken tam da bu düzeltmenin hedeflediği anda gecikirdi.
  const gestureX = useRef(new Animated.Value(0)).current;
  const gate = useRef(new Animated.Value(1)).current;
  const activeRef = useRef(false); // jest gerçekten aktifleşti mi (FAILED'de ofset aktarma)
  const dragX = useMemo(() => Animated.add(translateX, Animated.multiply(gestureX, gate)), [translateX, gestureX, gate]);
  const onGestureEvent = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: gestureX } }], { useNativeDriver: true }),
    [gestureX],
  );
  const onHandlerStateChange = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state: st, translationX: tx, velocityX: vx, absoluteY } = e.nativeEvent;
    if (st === State.BEGAN) {
      ignoreRef.current = absoluteY >= chatComposerTop.y || closingRef.current;
      activeRef.current = false;
      gestureX.setValue(0);
      gate.setValue(ignoreRef.current ? 0 : 1);
      return;
    }
    if (st === State.ACTIVE) { activeRef.current = true; return; }
    if (st !== State.END && st !== State.CANCELLED && st !== State.FAILED) return;
    const wasActive = activeRef.current;
    activeRef.current = false;
    if (ignoreRef.current || closingRef.current || !wasActive) {
      // Görsel hiç kıpırdamadı (gate=0 ya da aktivasyon olmadı) — sadece
      // bir sonraki jest için jest değerini sıfırla.
      gestureX.setValue(0);
      return;
    }
    // Ofseti tek JS tick'inde jest değerinden ana değere aktar (aynı batch →
    // görünür sıçrama yok), sonra eski eşik/flick kararı AYNEN.
    translateX.setValue(tx);
    gestureX.setValue(0);
    if (st === State.END) {
      const pastThreshold = Math.abs(tx) > screenW * SWIPE_THRESHOLD;
      const fastFlick = Math.abs(vx) > 450 && Math.abs(tx) > 34; // px/s (RNGH), not px/ms
      if (pastThreshold || fastFlick) closeWithAnimation(tx >= 0 ? 1 : -1);
      else springBack();
    } else {
      // Cancelled without a clean end (another gesture took over) → spring back.
      springBack();
    }
  }, [closeWithAnimation, gate, gestureX, screenW, springBack, translateX]);

  return (
    <PanGestureHandler
      activeOffsetX={[-14, 14]}
      failOffsetY={[-12, 12]}
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
    >
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        {/* Foreground page that slides */}
        <Animated.View style={{ flex: 1, backgroundColor: theme.bg, transform: [{ translateX: dragX }], shadowColor: theme.shadowInk, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: -10, height: 0 }, elevation: 16 }}>
          {children(() => closeWithAnimation(1))}
        </Animated.View>
      </View>
    </PanGestureHandler>
  );
}

// ---- Chat Screen (WhatsApp-style) ----
// Architecture: fullScreen overlay modal with an absolute input bar. The input
// bar follows the native keyboard frame directly instead of relying on KAV, so
// the send button remains touchable while the keyboard is open.
// Guideline 1.2 report flow. Shared by the chat and the friend profile so a
// report is always one tap from wherever the offending content is seen.
const REPORT_REASONS: { key: MessageKey; value: string }[] = [
  { key: 'mod.reasonAbuse', value: 'abuse' },
  { key: 'mod.reasonHate', value: 'hate' },
  { key: 'mod.reasonSexual', value: 'sexual' },
  { key: 'mod.reasonSpam', value: 'spam' },
  { key: 'mod.reasonOther', value: 'other' },
];

function ReportReasonModal({ visible, onClose, onExited, onPick }: {
  visible: boolean;
  onClose: () => void;
  // Forwarded so the caller can hand off to the next modal only AFTER this one's
  // native <SafeModal> has unmounted — two mounted at once freezes iOS.
  onExited?: () => void;
  onPick: (reason: string) => void;
}) {
  return (
    <GameModal visible={visible} onClose={onClose} onExited={onExited} title={t('mod.reportTitle')} icon="flag" danger>
      <Text style={{ color: theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19, marginBottom: 4 }}>
        {t('mod.reportBody')}
      </Text>
      {REPORT_REASONS.map((r) => (
        <GameRow key={r.value} icon="flag-outline" label={t(r.key)} chevron onPress={() => onPick(r.value)} />
      ))}
    </GameModal>
  );
}

function ChatScreen({ state, actions, onBack }: Props & { onBack?: () => void }) {
  const [text, setText] = useState('');
  // Guideline 1.2 moderation surfaces, all reachable from the conversation.
  const [chatMenu, setChatMenu] = useState(false);                              // header ⋯ sheet
  const [msgAction, setMsgAction] = useState<{ id: string; mine: boolean } | null>(null); // long-pressed bubble
  const [reportFor, setReportFor] = useState<{ messageId?: string } | null>(null);        // reason picker
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [guestGate, setGuestGate] = useState(false);
  const isGuest = state.authProvider == null;
  // Modal→modal handoff. GameModal keeps its native <SafeModal> mounted for the 160ms
  // exit animation, so opening the next one in the same handler leaves TWO native
  // modals mounted and iOS kills touch AND scroll for the whole screen (the tab
  // "freezes" — it still scrolls sideways but not vertically). Every transition
  // below records what to open, and the closing modal's onExited performs it.
  type PendingOpen = { kind: 'report'; messageId?: string } | { kind: 'block' } | { kind: 'reportSent' };
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null);
  const runPendingOpen = useCallback(() => {
    setPendingOpen((p) => {
      if (!p) return null;
      if (p.kind === 'report') setReportFor({ messageId: p.messageId });
      else if (p.kind === 'block') setBlockConfirm(true);
      else setReportSent(true);
      return null;
    });
  }, []);
  const [kbOpen, setKbOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputBarHeight, setInputBarHeight] = useState(86);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const chatWith = state.chatWith;
  // iOS: the input bar's position above the keyboard, ANIMATED (soft glide).
  const barTY = useRef(new Animated.Value(0)).current;

  // Messages that arrive after this settles animate in (fade + rise); the
  // history present at open renders statically.
  const animReady = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => { animReady.current = true; }, 350);
    return () => clearTimeout(id);
  }, []);

  // Partner may be a friend OR just a conversation partner (DMs with non-friends).
  // Both carry displayName/online/avatar, so fall back to the conversation row.
  const friend = state.friends.find(f => f.userId === chatWith) ?? state.conversations.find(c => c.userId === chatWith);
  const myId = state.profile?.userId;
  const messages = state.chatMessages;
  // Memo'lu MessageBubble için TEK sabit long-press callback'i (setMsgAction
  // setter'ı sabittir) + primitive avatar/çerçeve prop'ları — obje geçirmek
  // balon memo'sunu her render'da boşa düşürürdü.
  const onMsgAction = useCallback((id: string, mine: boolean) => setMsgAction({ id, mine }), []);
  const myAvatarId = state.profile?.avatar ?? state.profile?.selectedAvatar;
  const myFrameId = state.profile?.selectedFrame;
  const friendAvatarId = friend?.avatar ?? friend?.selectedAvatar;
  const friendFrameId = friend?.frame;
  const isTyping = chatWith ? state.typingFrom[chatWith] : false;
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTyping = useRef(false);
  const sendingRef = useRef(false);
  const keepKeyboardOpenRef = useRef(false);

  const refocusInput = useCallback(() => {
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.focus());
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  // Auto-scroll to bottom whenever content grows (new message, typing indicator)
  // or the ScrollView layout changes (keyboard opens → ScrollView shrinks).
  // NEVER while the user is dragging: on-drag keyboard dismissal collapses the
  // keyboard padding mid-scroll, and the resulting content-size change used to
  // yank the history straight back to the bottom.
  const draggingRef = useRef(false);
  const scrollToBottom = useCallback(() => {
    if (draggingRef.current) return;
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Mark messages as read when chat opens or new messages arrive
  useEffect(() => {
    if (chatWith) actions.markRead(chatWith);
  }, [chatWith, messages.length]);

  // Track keyboard open/close: collapse the input bar's home-indicator padding
  // while the keyboard is up (so it sits flush above it, Instagram-style — no jump)
  // and keep the latest message in view.
  useEffect(() => {
    // The bar GLIDES with the keyboard (event's own duration + Apple-like curve)
    // instead of snapping — on-drag dismissal used to slam it down ("pat diye").
    const glideBar = (toY: number, e: any) => {
      if (Platform.OS !== 'ios') return; // Android: window resizes, bar stays at 0
      const dur = typeof e?.duration === 'number' && e.duration > 0 ? e.duration : 250;
      Animated.timing(barTY, { toValue: toY, duration: dur, easing: Easing.bezier(0.17, 0.59, 0.4, 0.77), useNativeDriver: true }).start();
    };
    const setKeyboardFrame = (e: any) => {
      const endY = e?.endCoordinates?.screenY ?? SCREEN_H;
      const height = Math.max(0, SCREEN_H - endY);
      setKeyboardHeight(height);
      setKbOpen(height > 0);
      glideBar(-height, e);
      // Follow to bottom only when the keyboard OPENS; the hide frame (fired by
      // on-drag dismissal) must not fight the user's scroll gesture.
      if (height > 0) setTimeout(scrollToBottom, 50);
    };
    const resetKeyboardFrame = (e: any) => {
      setKeyboardHeight(0);
      setKbOpen(false);
      glideBar(0, e);
    };
    const frameEvt = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onFrame = Keyboard.addListener(frameEvt, setKeyboardFrame);
    const onHide = Keyboard.addListener(hideEvt, resetKeyboardFrame);
    // KESİN DÜZELTME: Sohbet bir RN <SafeModal> (yeni native pencere) içinde açılıyor.
    // İlk açılışta "Will" olayı bu pencere geçişiyle çakışıp BAYAT/yanlış bir
    // çerçeve bildirebilir — çubuk klavyenin arkasında kalır ya da "kaybolur"
    // ("ilk girildiğinde arama çubuğu kayboluyor"). "Did" olayları OS klavye
    // geçişini TAMAMEN bitirdikten SONRA gelir ve her zaman doğrudur; burada
    // sessizce (animasyonsuz, anlık) SON durumu dayatarak "Will" ne olursa
    // olsun çubuğu kesin doğru yere kilitler. "Will" zaten doğruysa bu no-op'tur.
    const confirmShow = (e: any) => {
      const endY = e?.endCoordinates?.screenY ?? SCREEN_H;
      const height = Math.max(0, SCREEN_H - endY);
      if (height <= 0) return;
      setKeyboardHeight(height);
      setKbOpen(true);
      barTY.setValue(-height);
    };
    const confirmHide = () => {
      setKeyboardHeight(0);
      setKbOpen(false);
      barTY.setValue(0);
    };
    // Android zaten frameEvt/hideEvt için "Did" olaylarını kullanıyor — ekstra
    // doğrulama yalnız iOS'ta (Will/Did ayrımının olduğu platformda) gerekli.
    const onDidShow = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidShow', confirmShow) : null;
    const onDidHide = Platform.OS === 'ios' ? Keyboard.addListener('keyboardDidHide', confirmHide) : null;
    // Sohbet, klavye ZATEN açıkken açıldıysa frame olayı bir daha gelmez ve
    // giriş çubuğu klavyenin arkasında (ekran dibinde) kalırdı — mount anında
    // klavyenin mevcut ölçüsünü okuyup çubuğu HEMEN doğru yere koy.
    const m = Keyboard.metrics?.();
    if (m && m.height > 0) {
      setKeyboardHeight(m.height);
      setKbOpen(true);
      barTY.setValue(Platform.OS === 'ios' ? -m.height : 0);
      setTimeout(scrollToBottom, 50);
    }
    return () => { onFrame.remove(); onHide.remove(); onDidShow?.remove(); onDidHide?.remove(); };
  }, [scrollToBottom]);

  // Publish the composer's top edge so SwipeBackWrap ignores gestures over it.
  useEffect(() => {
    chatComposerTop.y = SCREEN_H - keyboardHeight - inputBarHeight;
    return () => { chatComposerTop.y = Number.POSITIVE_INFINITY; };
  }, [keyboardHeight, inputBarHeight]);

  const onChangeText = (t: string) => {
    setText(t);
    if (!chatWith) return;
    if (t.trim() && !wasTyping.current) {
      wasTyping.current = true;
      actions.typingStart(chatWith);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      if (wasTyping.current && chatWith) {
        wasTyping.current = false;
        actions.typingStop(chatWith);
      }
    }, 2000);
  };

  const focusInputSoon = useCallback(() => {
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const onSend = useCallback(() => {
    if (!text.trim() || !chatWith) return;
    // Guideline 1.2 — no anonymous posting. The server refuses a guest's message
    // anyway; this turns that refusal into the sign-in offer instead of an error.
    if (isGuest) { setGuestGate(true); return; }
    if (sendingRef.current) return;
    sendingRef.current = true;
    keepKeyboardOpenRef.current = true;
    actions.sendMessage(chatWith, text.trim());
    setText('');
    if (wasTyping.current) {
      wasTyping.current = false;
      actions.typingStop(chatWith);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    focusInputSoon();
    setTimeout(() => { sendingRef.current = false; }, 120);
  }, [text, chatWith, actions, focusInputSoon]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header — ScreenHeader language: beveled 40px back button, chrome bar
          with a 2px cardLip edge, engraved name; safe-area top (no magic 54). */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 14,
        backgroundColor: theme.surface1, borderTopWidth: 1, borderTopColor: theme.topLight,
        ...shadowSoft,
      }}>
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
        <Pressable
          onPress={() => { dismissActiveInput(); (onBack ?? actions.closeChat)(); }}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 14,
            backgroundColor: pressed ? theme.surface3 : theme.surface2,
            borderTopWidth: 1, borderTopColor: theme.topLight,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ translateY: pressed ? 2 : 0 }],
            ...shadowRow,
          })}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <AvatarBadge avatarId={friend?.avatar ?? friend?.selectedAvatar} size={36} ringColor={friend?.online ? theme.primary : theme.border} frameId={friend?.frame} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 15, ...engrave('sm') }} numberOfLines={1}>{friend?.displayName ?? '...'}</Text>
          <Text style={{ color: isTyping ? theme.primary : friend?.online ? theme.primary : theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>
            {isTyping ? t('chat.typing') : friend?.online ? t('common.online') : t('common.offline')}
          </Text>
        </View>
        {/* Guideline 1.2 — block / report the person you are talking to. Must be
            reachable from the conversation itself, not buried in settings. */}
        <Pressable
          onPress={() => { dismissActiveInput(); setChatMenu(true); }}
          hitSlop={10}
          accessibilityLabel={t('mod.report')}
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 14,
            backgroundColor: pressed ? theme.surface3 : theme.surface2,
            borderTopWidth: 1, borderTopColor: theme.topLight,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ translateY: pressed ? 2 : 0 }],
            ...shadowRow,
          })}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.text} />
        </Pressable>
      </View>

      {/* Messages — bottom padding reserves the input bar AND (on iOS, where the
          window doesn't resize) the keyboard, so the newest message stays visible. */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 12, paddingBottom: inputBarHeight + 10 + (Platform.OS === 'ios' ? keyboardHeight : 0) }}
        // "handled": chips/bubbles still get their taps, but tapping EMPTY space
        // dismisses the keyboard; "on-drag": scrolling the history closes it too
        // (both user asks). The send button lives OUTSIDE this ScrollView, so
        // neither setting can steal its touches.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
        onScrollBeginDrag={() => { draggingRef.current = true; }}
        onScrollEndDrag={() => { draggingRef.current = false; }}
      >
        {/* Boş alana dokunmak klavyeyi indirir (balon/çip dokunuşları kendi
            işleyicilerine gitmeye devam eder — bu sarmalayıcıya düşmez) */}
        <Pressable accessible={false} onPress={dismissActiveInput}>
        {messages.length === 0 ? (
          <View style={{ marginTop: 28 }}>
            <EmptyState icon="chatbubbles" title={t('chat.sayHello')} hint={t('chat.noMessages')} />
            {/* Mint ghost greeting chips — tap fills the composer */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 2 }}>
              {(['chat.greeting1', 'chat.greeting2', 'chat.greeting3'] as MessageKey[]).map((k) => (
                <Pressable key={k} onPress={() => { onChangeText(t(k)); focusInputSoon(); }} style={({ pressed }) => ({ transform: [{ translateY: pressed ? 2 : 0 }] })}>
                  <View style={{ backgroundColor: theme.glowSoft, borderRadius: 999, borderWidth: 2, borderColor: theme.primary, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ color: theme.primary, fontSize: 12.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t(k)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : messages.map((m) => {
          const isMe = m.fromId === myId;
          // Guideline 1.2 — long-press opens the moderation sheet: report anyone
          // else's message, delete your own. Skipped on an already-removed bubble
          // and on the optimistic 'local-' echo (no server id to act on yet).
          const actionable = !m.deleted && !m.id.startsWith('local-');
          // Own bubbles never animate in: the optimistic local- entry appears
          // instantly, and the server echo swaps the id (bubble remounts) — an
          // entrance animation there replayed as a visible blink.
          return (
            <MessageBubble
              key={m.id}
              id={m.id}
              body={m.body}
              deleted={!!m.deleted}
              mine={isMe}
              createdAt={m.createdAt}
              avatarId={isMe ? myAvatarId : friendAvatarId}
              frameId={isMe ? myFrameId : friendFrameId}
              actionable={actionable}
              animate={animReady.current && !isMe}
              onAction={onMsgAction}
            />
          );
        })}
        {isTyping ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <AvatarBadge avatarId={friend?.avatar ?? friend?.selectedAvatar} size={28} ringColor={theme.border} frameId={friend?.frame} />
            <View style={{ backgroundColor: theme.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.topLight, ...shadowRow, flexDirection: 'row', gap: 4 }}>
              <TypingDot delay={0} />
              <TypingDot delay={150} />
              <TypingDot delay={300} />
            </View>
          </View>
        ) : null}
        </Pressable>
      </ScrollView>

      {/* Absolute input bar: rides the real keyboard frame via an ANIMATED translateY
          (glides with the keyboard's own duration — no snap), not KAV hit-testing. */}
      <Animated.View
        onLayout={(e) => setInputBarHeight(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          transform: [{ translateY: barTY }],
          flexDirection: 'row', alignItems: 'flex-end', gap: 8,
          paddingHorizontal: 12, paddingTop: 8, paddingBottom: kbOpen ? 8 : Math.max(insets.bottom, 12),
          backgroundColor: theme.surface1, borderTopWidth: 1, borderTopColor: theme.topLight,
          ...shadowTabBar,
          zIndex: 50, elevation: 50,
        }}
      >
        {/* Skirt: extends the bar's own background BELOW its bottom edge, behind
            the keyboard. The iOS 26 keyboard has transparent rounded TOP corners —
            without this the darker chat bg peeked through them as two notches
            ("klavyenin sol üst ve sağ üst köşesi boşluk"). */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '100%', height: 40, backgroundColor: theme.surface1 }} />
        <GameInput
          inputRef={inputRef}
          placeholder={t('chat.placeholder')}
          value={text}
          onChangeText={onChangeText}
          blurOnSubmit={false}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={onSend}
          containerStyle={{ flex: 1, marginVertical: 0 }}
          style={{ maxHeight: 100, paddingVertical: 10 }}
          multiline
          maxLength={500}
        />
        {/* Send fires on touch-down (Instagram behavior). Nothing here can blur the
            input: the App-level tab pager now uses keyboardShouldPersistTaps="always",
            which was the actual cause of the tap-eats-keyboard bug. onPress stays for
            the Android accessibility click path (TalkBack/keyboard fire only onPress);
            the sendingRef guard dedupes the touch double-fire. */}
        <Pressable
          onPressIn={onSend}
          onPress={onSend}
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          hitSlop={8}
          style={{ marginBottom: 2 }} // the ONE baseline nudge vs the composer — do not repeat it on the inner circle
        >
          {({ pressed }) => {
            const hasText = !!text.trim();
            return (
              // Flat, clean send circle (the old chunky lip + dark top border made
              // the idle state look gray-with-a-clipped-top — user feedback).
              // Idle: quiet flat well. Ready: solid primary.
              <View
                style={{
                  width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
                  backgroundColor: hasText ? theme.primary : theme.well,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: pressed && hasText ? 0.85 : 1,
                }}
              >
                {!hasText ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} /> : null}
                <Ionicons name="send" size={19} color={hasText ? theme.ink : theme.muted} />
              </View>
            );
          }}
        </Pressable>
      </Animated.View>

      {/* ---- Guideline 1.2 moderation sheets ---- */}
      <GameModal visible={chatMenu} onClose={() => setChatMenu(false)} onExited={runPendingOpen} title={friend?.displayName ?? ''} icon="person">
        <GameRow
          icon="flag-outline"
          iconColor={theme.danger}
          label={t('mod.report')}
          chevron
          onPress={() => { setPendingOpen({ kind: 'report' }); setChatMenu(false); }}
        />
        <GameRow
          icon="ban-outline"
          iconColor={theme.danger}
          label={t('mod.block')}
          chevron
          onPress={() => { setPendingOpen({ kind: 'block' }); setChatMenu(false); }}
        />
      </GameModal>

      {/* Long-pressed bubble: report anyone's, delete your own. */}
      <GameModal visible={!!msgAction} onClose={() => setMsgAction(null)} onExited={runPendingOpen} title={t('mod.messageTitle')} icon="chatbubble">
        {msgAction?.mine ? (
          <GameRow
            icon="trash-outline"
            iconColor={theme.danger}
            label={t('mod.deleteMessage')}
            sublabel={t('mod.deleteMessageBody')}
            chevron
            onPress={() => { const id = msgAction.id; setMsgAction(null); actions.deleteMessage(id); }}
          />
        ) : (
          <GameRow
            icon="flag-outline"
            iconColor={theme.danger}
            label={t('mod.report')}
            chevron
            onPress={() => { setPendingOpen({ kind: 'report', messageId: msgAction!.id }); setMsgAction(null); }}
          />
        )}
      </GameModal>

      <ReportReasonModal
        visible={!!reportFor}
        onClose={() => setReportFor(null)}
        onExited={runPendingOpen}
        onPick={(reason) => {
          if (chatWith) actions.reportContent(chatWith, reason, reportFor?.messageId);
          setPendingOpen({ kind: 'reportSent' });
          setReportFor(null);
        }}
      />

      {/* The 24-hour commitment is stated back to the reporter, so the promise in
          the EULA is visible at the moment it matters. */}
      <GameModal visible={reportSent} onClose={() => setReportSent(false)} title={t('mod.reportSentTitle')} icon="checkmark-circle">
        <Text style={{ color: theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19 }}>
          {t('mod.reportSentBody')}
        </Text>
        <Btn big label={t('settings.confirm')} onPress={() => setReportSent(false)} />
      </GameModal>

      <GuestGateModal visible={guestGate} onClose={() => setGuestGate(false)} actions={actions} />

      <GameModal visible={blockConfirm} onClose={() => setBlockConfirm(false)} title={t('mod.blockTitle')} icon="ban" danger>
        <Text style={{ color: theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19 }}>
          {t('mod.blockBody', { name: friend?.displayName ?? '' })}
        </Text>
        <Btn
          big
          kind="danger"
          icon="ban"
          label={t('mod.block')}
          onPress={() => {
            dismissActiveInput();
            setBlockConfirm(false);
            if (chatWith) actions.blockUser(chatWith);
            (onBack ?? actions.closeChat)();
          }}
        />
      </GameModal>
    </View>
  );
}

// ---- Profile ----
function StatCard({ icon, color, label, value, gem }: { icon?: IoniconName; color: string; label: string; value: number | string; gem?: boolean }) {
  return (
    <GamePanel compact accentStripe={color} style={{ flex: 1, minHeight: 104 }} bodyStyle={{ alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14 }}>
      {gem ? <GemIcon size={24} /> : icon ? <Ionicons name={icon} size={22} color={color} /> : null}
      <Text style={{ color: theme.text, fontSize: 24, fontFamily: 'Poppins-Black', ...engrave('sm') }}>{value}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{label}</Text>
    </GamePanel>
  );
}

function seasonCountdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return t('season.endingNow');
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return t('season.endsInDays', { d: String(days) });
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return t('season.endsInHours', { h: String(hours) });
}

/** Sezon kartı — bu ayın zirvesi + kalan süre + geçen sezonun sonucu.
 *  Ödül YOKTUR (elmas/güç musluğu açılmaz); değer prestijdir. */
function SeasonCard({ season }: { season: SeasonStateView }) {
  const total = season.wins + season.losses;
  return (
    <GamePanel compact accentStripe={theme.gold} bodyStyle={{ padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="calendar" size={17} color={theme.gold} />
        <Text style={{ flex: 1, color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-Black', ...engrave('sm') }}>
          {t('season.title', { id: season.seasonId })}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>{seasonCountdown(season.endsAt)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: theme.well, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: theme.gold, fontSize: 16, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{season.peakTrophies}</Text>
          <Text style={{ color: theme.muted, fontSize: 9.5, fontFamily: 'Poppins-ExtraBold' }}>{t('season.peak')}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: theme.well, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12.5, fontFamily: 'Poppins-Black' }}>{arenaLabel(season.peakArenaName)}</Text>
          <Text style={{ color: theme.muted, fontSize: 9.5, fontFamily: 'Poppins-ExtraBold' }}>{t('season.bestArena')}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: theme.well, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: theme.text, fontSize: 16, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{season.wins}</Text>
          <Text style={{ color: theme.muted, fontSize: 9.5, fontFamily: 'Poppins-ExtraBold' }}>{t('season.wins', { n: String(total) })}</Text>
        </View>
      </View>
      {season.last ? (
        <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 14 }}>
          {t('season.lastLine', { id: season.last.seasonId, arena: arenaLabel(season.last.peakArenaName), n: String(season.last.peakTrophies) })}
        </Text>
      ) : null}
    </GamePanel>
  );
}

export function ProfileScreen({ state, actions, onOpenMatchHistory, onGoToStore, onOpenLevelRoad }: Props) {
  const p = state.profile;
  // Eski sunucu ProfileView'da xp/level göndermeyebilir — "Seviye undefined"
  // basmamak için ProfilePill/LevelRoadModal ile aynı varsayılanlar kullanılır.
  const lvl = p?.level ?? 1;
  const lvlXp = p?.xp ?? 0;
  const lvlUnclaimed = unclaimedLevelCount(p);
  // Detaylı istatistikler + sezon özeti ekran açılışında bir kez istenir.
  useEffect(() => {
    actions.getSeason();
    actions.loadMyStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [framePrev, setFramePrev] = useState<{ tier: LevelTier; unlocked: boolean } | null>(null);
  const [pendingAvatarId, setPendingAvatarId] = useState<string | null>(null);
  const [confirmAvatarId, setConfirmAvatarId] = useState<string | null>(null);
  const [showAvatarPage, setShowAvatarPage] = useState(false);
  const [showInsufficientPopup, setShowInsufficientPopup] = useState(false);
  const insufficientMissing = useRef<number | null>(null);
  // Set on confirm: close the picker page once the confirm dialog's exit
  // animation completes (GameModal onExited) — no setTimeout handoff chains.
  const closePickerOnExit = useRef(false);
  // Set when "Evet" is tapped without enough diamonds: the insufficient popup
  // opens from the purchase modal's onExited (never in the same commit).
  const insufficientOnExit = useRef(false);

  if (!p) {
    // Branded placeholder while the profile loads — never a bare "—".
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <BrandMark size={88} />
          <GamePanel compact bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 }}>
            <GameSpinner />
            <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Poppins-SemiBold' }}>{t('common.loading')}</Text>
          </GamePanel>
        </View>
      </Screen>
    );
  }
  const rankedWins = state.myStats?.wins ?? p.wins;
  const rankedLosses = state.myStats?.losses ?? p.losses;
  const total = rankedWins + rankedLosses;
  const winRate = total ? Math.round((rankedWins / total) * 100) : 0;
  const color = arenaColor(p.arena.name);
  const arenaArt = getArenaDataByName(p.arena.name);
  const pendingAvatar = pendingAvatarId ? avatarMeta(pendingAvatarId) : null;
  const confirmAvatar = confirmAvatarId ? avatarMeta(confirmAvatarId) : null;
  const canAffordPending = pendingAvatar ? p.diamonds >= avatarPrice(pendingAvatar.id) : false;

  // Avatar picker — an INLINE page, deliberately NOT a native <SafeModal>.
  //
  // It used to be a presentationStyle="fullScreen" Modal with the confirm/purchase
  // GameModals (themselves Modals) nested inside it. Confirming a change dismissed BOTH
  // levels in a single commit — GameModal's exit callback runs setMounted(false) and
  // onExited() back to back, and onExited closed the picker — so iOS tore down a presented
  // view controller while its own child was still mid-dismissal and left the app on a black
  // screen with no way out. Rendering the page in the normal tree keeps GameModal the only
  // native modal on screen, so there is nothing to race; the picker also closes instantly
  // (a render branch, not a native dismissal) and inherits the app's ScreenBg.
  if (showAvatarPage) {
    return (
      <Screen>
          <ScreenHeader title={t('profile.pictures')} icon="images" onBack={() => setShowAvatarPage(false)} />
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {([
              'pp7', 'pp11', 'pp12', 'pp13', 'pp14', 'pp15', 'pp16', 'pp17',
              // pp.jpeg'ten eklenen yeni karakterler (pp21-31: 150, pp32-34: 250)
              'pp21', 'pp22', 'pp23', 'pp24', 'pp25', 'pp26', 'pp27', 'pp28', 'pp29', 'pp30', 'pp31',
              'pp32', 'pp33', 'pp34',
              'pp1', 'pp2', 'pp3', 'pp4', 'pp5', 'pp6', 'pp8', 'pp9', 'pp10',
              'pp19', 'pp20', 'pp18',
            ]).map((avatarId) => {
              const meta = avatarMeta(avatarId);
              const owned = ownsAvatar(p, avatarId);
              const selected = (p.avatar ?? p.selectedAvatar ?? null) === avatarId;
              return (
                <AvatarTile
                  key={avatarId}
                  avatarId={avatarId}
                  owned={owned}
                  selected={selected}
                  price={meta.price}
                  onPress={() => {
                    if (!owned) {
                      setPendingAvatarId(avatarId);
                      return;
                    }
                    if (selected) return;
                    setConfirmAvatarId(avatarId);
                  }}
                />
              );
            })}
          </View>
        </ScrollView>

        {/* Purchase confirmation modal (inside avatar picker).
            onExited: opening the "not enough gems" popup must WAIT for this
            modal's native dismissal to finish — flipping both in one commit
            makes iOS drop the new presentation and the popup never shows
            (same race the picker's own close guards against, see above). */}
        <GameModal
          visible={pendingAvatar !== null}
          onClose={() => setPendingAvatarId(null)}
          onExited={() => {
            if (!insufficientOnExit.current) return;
            insufficientOnExit.current = false;
            const m = insufficientMissing.current;
            insufficientMissing.current = null;
            if (m != null && onGoToStore) {
              // Unified flow: Store opens the covering pack's sheet with the
              // AL/VAZGEC popup behind it (see shortfall.ts).
              recordShortfall(m);
              onGoToStore('diamonds');
            } else {
              setShowInsufficientPopup(true);
            }
          }}
          title={t('profile.buyTitle')}
          icon="lock-closed"
        >
          {pendingAvatar ? (
            <>
              <View style={{ alignItems: 'center', gap: 10 }}>
                <AvatarBadge avatarId={pendingAvatar.id} size={88} />
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 18 }}>{pendingAvatar.label}</Text>
                <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>
                  {t('profile.buyConfirm', { price: pendingAvatar.price })}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <GemIcon size={16} />
                  <Text style={{ color: theme.gold, fontFamily: 'Poppins-Black', fontSize: 14, fontVariant: ['tabular-nums'], ...engrave('sm') }}>{pendingAvatar.price}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  {/* Cancel is ALWAYS ghost — danger is reserved for destructive confirms */}
                  <Btn label={t('common.no')} kind="ghost" icon="close" onPress={() => setPendingAvatarId(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn
                    label={t('common.yes')}
                    kind="blue"
                    icon="checkmark"
                    onPress={() => {
                      if (!pendingAvatar) return;
                      if (canAffordPending) {
                        actions.buyAvatar(pendingAvatar.id);
                        setPendingAvatarId(null);
                      } else {
                        // Close first; onExited hands off to the Store, which opens
                        // the covering pack's sheet with the popup behind it.
                        insufficientOnExit.current = true;
                        insufficientMissing.current = avatarPrice(pendingAvatar.id) - p.diamonds;
                        setPendingAvatarId(null);
                      }
                    }}
                  />
                </View>
              </View>
            </>
          ) : null}
        </GameModal>

        <GameModal
          visible={confirmAvatar !== null}
          onClose={() => setConfirmAvatarId(null)}
          onExited={() => {
            if (closePickerOnExit.current) {
              closePickerOnExit.current = false;
              setShowAvatarPage(false);
            }
          }}
          title={t('profile.changeTitle')}
          icon="images"
        >
          {confirmAvatar ? (
            <>
              <View style={{ alignItems: 'center', gap: 10 }}>
                <AvatarBadge avatarId={confirmAvatar.id} size={88} />
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 18 }}>{confirmAvatar.label}</Text>
                <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>
                  {t('profile.changeConfirm')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Btn label={t('common.no')} kind="ghost" icon="close" onPress={() => setConfirmAvatarId(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn
                    label={t('common.yes')}
                    kind="blue"
                    icon="checkmark"
                    onPress={() => {
                      const nextAvatarId = confirmAvatarId;
                      if (!nextAvatarId) return;
                      closePickerOnExit.current = true;
                      setConfirmAvatarId(null);
                      actions.setAvatar(nextAvatarId);
                    }}
                  />
                </View>
              </View>
            </>
          ) : null}
        </GameModal>

        {/* Insufficient diamonds popup (inside avatar picker) — the same recipe as
            the store's weekly-emote version: one line of copy + a single gold CTA
            that jumps straight to the diamond packs. */}
        <GameModal visible={showInsufficientPopup} onClose={() => setShowInsufficientPopup(false)} title={t('profile.notEnoughTitle')} icon="diamond">
          <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
            {t('profile.notEnoughGemsBody')}
          </Text>
          <Btn
            big
            kind="accent"
            icon="diamond"
            label={t('store.goToDiamonds')}
            onPress={() => {
              setShowInsufficientPopup(false);
              actions.closeProfile();
              onGoToStore?.('diamonds');
            }}
          />
        </GameModal>
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={t('profile.title')} icon="person" onBack={actions.closeProfile} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* marginTop: çerçeve avatarın çok üstüne taşar (özellikle GOAT tacı) — çerçeve
            takılıyken bloğu aşağı iterek üst yayın başlığın altında kesilmesini önler */}
        <View style={{ alignItems: 'center', gap: 8, marginTop: 10 + (p.selectedFrame ? Math.min(56, Math.round((104 * ((FRAME_SCALE[p.selectedFrame] ?? 2.1) - 1)) / 2 * 0.6)) : 0), marginBottom: 10 }}>
          <Pressable onPress={() => setShowAvatarPage(true)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <View>
              <AvatarBadge avatarId={p.avatar ?? p.selectedAvatar} size={104} ringColor={color} frameId={p.selectedFrame} trophies={p.trophies} />
              {/* not: çerçeve kaplaması avatarın DIŞINA taşar (FRAME_SCALE) —
                  alttaki isim için ek boşluk aşağıda frameGap ile açılır */}
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.card }}>
                <Ionicons name="pencil" size={15} color={theme.ink} />
              </View>
            </View>
          </Pressable>
          <Text style={{ color: theme.text, fontSize: 24, fontFamily: 'Poppins-ExtraBold', ...engrave('lg'), marginTop: p.selectedFrame ? Math.min(44, Math.round((104 * ((FRAME_SCALE[p.selectedFrame] ?? 2.1) - 1)) / 2 * 0.5)) : 0 }}>{p.displayName}</Text>
          {/* Arena chip — crafted arena art thumbnail in a beveled chip (no raw emoji) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.bg2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1.5, borderColor: withAlpha(color, 0.4) }}>
            {arenaArt ? (
              <Image source={arenaArt.img} style={{ width: 24, height: 21 }} resizeMode="contain" />
            ) : (
              <Ionicons name={arenaIcon(p.arena)} size={15} color={color} />
            )}
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 13, ...engrave('sm') }}>{arenaLabel(p.arena.name)}</Text>
          </View>
        </View>

        {/* Sezon kartı (2026-08-29): aylık döngü artık görünür — bu ayın zirvesi,
            kalan süre ve geçen sezonun sonucu. */}
        {state.season ? (
          <View style={{ marginBottom: 12 }}>
            <SeasonCard season={state.season} />
          </View>
        ) : null}

        {/* Seviye Yolu girişi — rozet + XP çubuğu, dokununca tam ekran yol */}
        <Pressable onPress={() => onOpenLevelRoad?.()} style={({ pressed }) => ({ marginTop: 12, transform: [{ translateY: pressed ? 2 : 0 }] })}>
          <GamePanel compact accentStripe={levelTier(lvl)?.c ?? theme.primary} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14 }}>
            <LevelBadge level={lvl} size={44} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('level.levelN', { n: String(lvl) })}</Text>
              {lvl < LEVEL_CAP ? (
                <>
                  <XpBar xp={lvlXp} level={lvl} height={9} />
                  <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{t('level.toNext', { n: String(xpForNextLevel(lvl) - lvlXp) })}</Text>
                </>
              ) : (
                <Text style={{ color: theme.flame, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('level.maxed')}</Text>
              )}
            </View>
            {lvlUnclaimed > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: withAlpha(theme.accent, 0.14), borderRadius: 999, borderWidth: 1.5, borderColor: withAlpha(theme.accent, 0.6), paddingHorizontal: 9, paddingVertical: 4 }}>
                <Ionicons name="gift" size={12} color={theme.accent} />
                <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>{t('level.rewardsReady', { n: String(lvlUnclaimed) })}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={theme.muted} style={{ marginRight: 8 }} />
          </GamePanel>
        </Pressable>

        {/* Açılan çerçeveler — kazanılmış statü vitrini (dokun: büyük önizleme).
            MAĞAZA çerçeveleri de burada (kullanıcı raporu 2026-08-27: satın alınan
            çerçeve profilde görünmüyordu — şerit yalnız seviye kademelerini
            listeliyordu). Mağaza çerçevesine dokunmak DOĞRUDAN kuşanır/çıkarır. */}
        {(LEVEL_TIERS.some((tr) => ownsFrame(p, tr.key)) || (p.ownedCosmetics ?? []).some((id) => id.endsWith('_frame'))) ? (
          <View style={{ marginTop: 10 }}>
            <GamePanel compact accentStripe={levelTier(lvl)?.c ?? theme.primary} bodyStyle={{ paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1.2, marginBottom: 6 }}>{t('profile.frames').toLocaleUpperCase(currentLang())}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 12 }}>
                {LEVEL_TIERS.filter((tr) => ownsFrame(p, tr.key)).map((tr) => {
                  const worn = p.selectedFrame === tr.key;
                  return (
                    <Pressable key={tr.key} onPress={() => setFramePrev({ tier: tr, unlocked: true })} hitSlop={4} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
                      <View style={worn ? { borderRadius: 56 * 0.28 + 2, borderWidth: 2, borderColor: tr.c, margin: -2 } : undefined}>
                        <FrameArt tierKey={tr.key} size={56} well />
                      </View>
                      {worn ? (
                        <View style={{ position: 'absolute', right: -5, top: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={11} color={theme.ink} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
                {/* Arena çerçeveleri — envanterde görünüp burada görünmüyordu
                    (kullanıcı raporu 2026-08-28: 'profilde sadece pass'tekiler') */}
                {(p.ownedFrames ?? []).filter((id) => !LEVEL_TIERS.some((tr) => tr.key === id)).map((id) => {
                  const worn = p.selectedFrame === id;
                  return (
                    <Pressable key={`af-${id}`} onPress={() => { triggerFeedback(worn ? GameFeedbackEvent.UI_TOGGLE_OFF : GameFeedbackEvent.UI_TOGGLE_ON); actions.equipCosmetic('frame', null); actions.setFrame(worn ? null : id); }} hitSlop={4} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
                      <View style={worn ? { borderRadius: 56 * 0.28 + 2, borderWidth: 2, borderColor: theme.primary, margin: -2 } : undefined}>
                        <FrameArt tierKey={id} size={56} well />
                      </View>
                      {worn ? (
                        <View style={{ position: 'absolute', right: -5, top: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={11} color={theme.ink} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
                {(p.ownedCosmetics ?? []).filter((id) => id.endsWith('_frame')).map((id) => {
                  const worn = p.selectedFrame === id;
                  return (
                    <Pressable key={id} onPress={() => { triggerFeedback(worn ? GameFeedbackEvent.UI_TOGGLE_OFF : GameFeedbackEvent.UI_TOGGLE_ON); actions.setFrame(null); actions.equipCosmetic('frame', worn ? null : id); }} hitSlop={4} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
                      <View style={worn ? { borderRadius: 56 * 0.28 + 2, borderWidth: 2, borderColor: theme.primary, margin: -2 } : undefined}>
                        <FrameArt tierKey={id} size={56} well />
                      </View>
                      {worn ? (
                        <View style={{ position: 'absolute', right: -5, top: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={11} color={theme.ink} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </GamePanel>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <StatCard icon="trophy" color={theme.gold} label={t('stats.trophies')} value={p.trophies} />
          <StatCard gem color={GEM_COLOR} label={t('stats.diamonds')} value={p.diamonds} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <StatCard icon="checkmark-circle" color={theme.primary} label={t('stats.wins')} value={rankedWins} />
          <StatCard icon="close-circle" color={theme.danger} label={t('stats.losses')} value={rankedLosses} />
          <StatCard icon="stats-chart" color={theme.purple} label={t('stats.winRateShort')} value={`%${winRate}`} />
        </View>

        {/* Detaylı istatistikler — seri rekoru + tüm modlarda G/M/% kırılımı */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <StatCard icon="flame" color={theme.flame} label={t('stats.bestStreak')} value={state.myStats?.bestStreak ?? p.bestStreak ?? 0} />
        </View>
        <View style={{ marginTop: 10 }}>
          <SectionHeader label={t('stats.modeBreakdown')} icon="analytics" />
          <ModeStatsGrid stats={state.myStats?.modes} />
        </View>

        <View style={{ marginTop: 16 }}>
          <Btn label={t('menu.matchHistory')} icon="time" kind="blue" onPress={() => onOpenMatchHistory?.()} />
        </View>
      </ScrollView>

      <FramePreviewModal
        tier={framePrev?.tier ?? null}
        unlocked={framePrev?.unlocked ?? false}
        visible={framePrev != null}
        onClose={() => setFramePrev(null)}
        equipped={framePrev != null && p.selectedFrame === framePrev.tier.key}
        onEquip={(frameId) => { actions.setFrame(frameId); setFramePrev(null); }}
      />
    </Screen>
  );
}

// Profile-picture chooser: a grid of the 20 avatars; tap to select, then apply.
// Avatar grid tile — chunky kit card with press-lip physics, a spring-pop
// selected check (ported from the retired bottom-sheet picker) and a gold
// gem-price pill when locked. The frame stays crisp; only the badge dims.
function AvatarTile({ avatarId, owned, selected, price, onPress }: {
  avatarId: string; owned: boolean; selected: boolean; price: number; onPress: () => void;
}) {
  const { ty, onIn, onOut } = usePressLip(2);
  const check = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (selected) Animated.spring(check, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    else Animated.timing(check, { toValue: 0, duration: 120, useNativeDriver: true }).start();
  }, [selected, check]);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ width: '31%', minWidth: 96 }}>
      <View style={{ backgroundColor: theme.shadowInk, borderRadius: 17, ...shadowRow }}>
        <Animated.View style={{ transform: [{ translateY: ty }], backgroundColor: selected ? theme.surface3 : theme.surface2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, overflow: 'hidden', ...(selected ? { borderWidth: 2, borderColor: theme.primary } : {}), alignItems: 'center' }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
          <AvatarBadge avatarId={avatarId} size={58} locked={!owned} dimmed={!owned} ringColor={selected ? theme.primary : undefined} />
          {owned ? (
            <Text style={{ color: selected ? theme.primary : theme.muted, fontSize: 10, marginTop: 4, fontFamily: 'Poppins-ExtraBold' }}>{selected ? t('profile.inUse') : t('profile.ready')}</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: theme.panelInnerFill, borderRadius: 999, borderWidth: 1, borderColor: theme.accentDark, paddingHorizontal: 8, paddingVertical: 2 }}>
              <GemIcon size={11} />
              <Text style={{ color: theme.gold, fontSize: 10, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>{price}</Text>
            </View>
          )}
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 5, right: 5, transform: [{ scale: check }] }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.card }}>
              <Ionicons name="checkmark" size={12} color={theme.ink} />
            </View>
          </Animated.View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ---- Arenas ----
// Tier colors = the theme's 7-step arena ramp (bronze lowest → flame highest).
const ARENA_DATA = [
  { name: 'GOAT', min: 5000, max: 99999, color: theme.flame, icon: 'flame' as IoniconName, img: require('../assets/arenas/goat.png'), win: '+15', loss: '-35', reward: 1000, desc: 'Efsanelerin zirvesi. Sadece en iyiler ayakta kalır.' },
  { name: 'Dünya Klasmanı', min: 3500, max: 4999, color: theme.purple, icon: 'trophy' as IoniconName, img: require('../assets/arenas/dunya.png'), win: '+18', loss: '-30', reward: 500, desc: 'Dünya sahnesinde mücadele. Her hata çok ağır.' },
  { name: 'Efsaneler Arası', min: 2000, max: 3499, color: theme.blue, icon: 'ribbon' as IoniconName, img: require('../assets/arenas/efsaneler.png'), win: '+20', loss: '-26', reward: 300, desc: 'Efsaneler burada. Kayıplar acıtıyor.' },
  { name: 'Şampiyonlar Ligi', min: 1000, max: 1999, color: theme.primary, icon: 'medal' as IoniconName, img: require('../assets/arenas/sampiyonlar.png'), win: '+22', loss: '-22', reward: 200, desc: 'Avrupa\'nın en prestijli arenası. Dengeli mücadele.' },
  { name: 'Profesyonel Lig', min: 500, max: 999, color: theme.gold, icon: 'shield' as IoniconName, img: require('../assets/arenas/profesyonel.png'), win: '+25', loss: '-18', reward: 150, desc: 'Profesyonel seviye. Artık gerçek bir rakipsin.' },
  { name: 'Amatör Lig', min: 200, max: 499, color: theme.silver, icon: 'shield-half' as IoniconName, img: require('../assets/arenas/amator.png'), win: '+28', loss: '-14', reward: 100, desc: 'İlk adımları attın. Yükselmeye devam!' },
  { name: 'Mahalle Sahası', min: 0, max: 199, color: theme.bronze, icon: 'shield-outline' as IoniconName, img: require('../assets/arenas/mahalle.png'), win: '+30', loss: '-10', reward: 50, desc: 'Herkesin başladığı yer. Kolay tırmanış.' },
];

function getArenaDataByName(name: string) {
  return ARENA_DATA.find((arena) => arena.name === name) ?? null;
}

// Ladder connector between arena tiers — an SVG gradient segment (upper tier
// color → lower tier color) with a node dot at each junction. The segment the
// player climbed into the current arena pulses slowly (opacity 0.6→1, ≥900ms
// cycle) to signal "you are climbing here"; future segments render dimmed.
let _ladSeq = 0;
function LadderConnector({ topColor, bottomColor, active, future }: {
  topColor: string; bottomColor: string; active: boolean; future: boolean;
}) {
  const gid = useRef(`lad${_ladSeq++}`).current;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.6, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);
  return (
    <View style={{ alignItems: 'center', height: 30, opacity: future ? 0.35 : 1 }}>
      <Animated.View style={{ flex: 1, width: 5, opacity: active ? pulse : 1 }}>
        <Svg width={5} height="100%">
          <Defs>
            <SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={topColor} />
              <Stop offset="1" stopColor={bottomColor} />
            </SvgGradient>
          </Defs>
          <Rect width="100%" height="100%" rx={2.5} fill={`url(#${gid})`} />
        </Svg>
      </Animated.View>
      <View pointerEvents="none" style={{ position: 'absolute', top: -3, width: 9, height: 9, borderRadius: 4.5, backgroundColor: topColor, borderWidth: 1.5, borderColor: theme.panelInk }} />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: -3, width: 9, height: 9, borderRadius: 4.5, backgroundColor: bottomColor, borderWidth: 1.5, borderColor: theme.panelInk }} />
    </View>
  );
}

export function ArenasScreen({ state, actions }: Props) {
  const trophies = state.profile?.trophies ?? 0;
  const currentArenaIdx = ARENA_DATA.findIndex((a) => trophies >= a.min && trophies <= a.max);
  const currentArenaUnlockIdx = Math.max(0, ARENA_DATA.length - 1 - Math.max(0, currentArenaIdx));
  const highestUnlockedArenaIdx = Math.max(currentArenaUnlockIdx, state.profile?.highestArenaRewarded ?? 0);
  const scrollRef = useRef<ScrollView>(null);

  // Land on the player's own arena, not the top of the list. The rows have very
  // different heights (the current tier is a tall hero card), so a fixed
  // row-height guess is unreliable — measure the current row's actual Y within the
  // scroll content (via onLayout, below) and scroll to it once, a little below the
  // header so it isn't glued to the very top.
  const didScrollToCurrent = useRef(false);
  const scrollToCurrentRow = useCallback((y: number) => {
    if (didScrollToCurrent.current) return;
    didScrollToCurrent.current = true;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: false }));
  }, []);

  // Progress within current arena (0..1)
  const currentArena = ARENA_DATA[currentArenaIdx] ?? ARENA_DATA[ARENA_DATA.length - 1]!;
  const range = currentArena.max - currentArena.min;
  const progress = range > 0 ? Math.min(1, (trophies - currentArena.min) / range) : 1;

  // Current-arena hero card dims — measured for the one-shot ShineSweep on mount.
  const [heroSize, setHeroSize] = useState({ w: 0, h: 0 });

  // Slide up from the bottom when opened (e.g. re-tapping the Oyna tab).
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 1, friction: 10, tension: 72, useNativeDriver: true }).start();
  }, [slide]);
  const slideY = slide.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H * 0.5, 0] });

  return (
    <Screen>
      <Animated.View style={{ flex: 1, transform: [{ translateY: slideY }], opacity: slide }}>
      <ScreenHeader
        title={t('home.arenas')}
        onBack={actions.closeArenas}
        right={(
          <View style={{ minWidth: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingLeft: 4 }}>
            <Ionicons name="trophy" size={15} color={theme.accent} />
            <Text numberOfLines={1} style={{ color: theme.gold, fontFamily: 'Poppins-Black', fontSize: 14, fontVariant: ['tabular-nums'], ...engrave('sm') }}>{trophies}</Text>
          </View>
        )}
      />

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Arenas listed top-to-bottom (highest first) */}
        {ARENA_DATA.map((arena, idx) => {
          const isCurrent = idx === currentArenaIdx;
          const arenaUnlockIdx = ARENA_DATA.length - 1 - idx;
          const isLocked = highestUnlockedArenaIdx < arenaUnlockIdx;
          const isPassed = trophies > arena.max;
          // Elmas ödülü TEK SEFER alınır: bu arenaya bir kez ulaşılıp ödül işlendiyse
          // (arena index'i highestArenaRewarded'a dahilse) düşüp tekrar çıkınca yeniden
          // verilmez → ödül silik + kilitli gösterilir (kullanıcı isteği 2026-08-28).
          const rewardClaimed = arenaUnlockIdx <= (state.profile?.highestArenaRewarded ?? 0);
          const maxLabel = arena.max === 99999 ? '∞' : String(arena.max);

          const cardInner = (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: isCurrent ? 96 : 74, height: isCurrent ? 88 : 68, alignItems: 'center', justifyContent: 'center' }}>
                  {/* Locked = art-only dim + padlock chip; text stays legible (no whole-card opacity) */}
                  <Image source={arena.img} resizeMode="contain" style={{ width: '100%', height: '100%', opacity: isLocked ? 0.55 : 1, shadowColor: theme.shadowInk, shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 3 } }} />
                  {isLocked ? (
                    <View style={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.surface2, borderTopWidth: 1, borderTopColor: theme.topLight, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="lock-closed" size={10} color={theme.muted} />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: isCurrent ? arena.color : isLocked ? theme.muted : theme.text, fontSize: isCurrent ? 18 : 16, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>
                    {arenaLabel(arena.name)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{arena.min} - {maxLabel}</Text>
                    <Ionicons name="trophy" size={12} color={theme.gold} />
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', marginTop: 3 }}>{arenaDesc(arena.name)}</Text>
                  {/* Tier reward only — the per-match win/loss trophy stakes are not shown.
                      Alınmışsa (rewardClaimed) elmas + sayı silik + kilitli: tek seferlik. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, opacity: rewardClaimed ? 0.4 : 1 }}>
                    <GemIcon size={13} />
                    <Text style={{ color: rewardClaimed ? theme.muted : theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>+{arena.reward}</Text>
                    {rewardClaimed ? <Ionicons name="lock-closed" size={11} color={theme.muted} style={{ marginLeft: 2 }} /> : null}
                  </View>
                </View>
              </View>

              {/* Progress bar for the current arena — the LoadingScreen recipe at small scale */}
              {isCurrent ? (
                <View style={{ height: 20, borderRadius: 12, backgroundColor: theme.well, overflow: 'hidden', padding: 2, marginTop: 12, justifyContent: 'center' }}>
                  <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
                  <View style={{ flex: 1, borderRadius: 8, backgroundColor: theme.well, overflow: 'hidden' }}>
                    {progress > 0.01 ? (
                      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.max(5, progress * 100)}%`, borderRadius: 8, backgroundColor: arena.color, overflow: 'hidden' }}>
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '46%', backgroundColor: 'rgba(255,255,255,0.32)' }} />
                        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: darken(arena.color), opacity: 0.85 }} />
                        <View style={{ position: 'absolute', top: 2, bottom: 2, right: 2, width: 4, borderRadius: 2, backgroundColor: lighten(arena.color, 0.55), opacity: 0.9 }} />
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ position: 'absolute', alignSelf: 'center', color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.5, fontVariant: ['tabular-nums'], ...engrave('sm') }}>{trophies} / {maxLabel}</Text>
                </View>
              ) : null}

              {/* Status ribbon — locked tiers carry the padlock on the art instead */}
              {isCurrent ? (
                <Ribbon label={t('arenas.here')} color={arena.color} style={{ position: 'absolute', top: 8, right: 8 }} />
              ) : isPassed ? (
                <Ribbon label={t('arenas.passed')} color={theme.primary} icon="checkmark" style={{ position: 'absolute', top: 8, right: 8 }} />
              ) : null}
            </>
          );

          return (
            <View key={arena.name} onLayout={isCurrent ? (e) => scrollToCurrentRow(e.nativeEvent.layout.y) : undefined}>
              {/* Gradient ladder segment between tiers (not on the first item) */}
              {idx > 0 ? (
                <LadderConnector
                  topColor={ARENA_DATA[idx - 1]!.color}
                  bottomColor={arena.color}
                  active={idx === currentArenaIdx + 1}
                  future={idx <= currentArenaIdx}
                />
              ) : null}

              {isCurrent ? (
                <View onLayout={(e) => setHeroSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
                  <GamePanel hero tint={arena.color} bodyStyle={{ padding: 14 }}>
                    {cardInner}
                    {/* Full-face sweep: -14 offset escapes the body's 14px padding (Yoga insets
                        absolute children by it); the face's rounded overflow:'hidden' clips at the card edge. */}
                    {heroSize.w > 0 ? (
                      <View pointerEvents="none" style={{ position: 'absolute', top: -14, left: -14 }}>
                        <ShineSweep width={heroSize.w} height={heroSize.h} delay={420} duration={720} opacity={0.22} band={0.26} />
                      </View>
                    ) : null}
                  </GamePanel>
                </View>
              ) : (
                <GamePanel compact accentStripe={arena.color} bodyStyle={{ padding: 12, paddingLeft: 14 }}>
                  {cardInner}
                </GamePanel>
              )}
            </View>
          );
        })}
      </ScrollView>
      </Animated.View>
    </Screen>
  );
}

// ---- Searching ----
// ---- OrbitLoader — web istemcideki 3D yörünge yükleyicisinin birebir RN karşılığı ----
// Ortada SABİT altın yıldırım (yumuşak ışıma nabzıyla); iki marka topu saat
// yönünde, gerçek derinlik hissiyle tur atar: öndeyken büyük/parlak, arkadayken
// küçük/loş. Ön/arka katman geçişi toplar tam yanlardayken (yıldırımla hiç
// çakışmadıkları anda) olur. İki top aynı yörüngeyi 180° faz farkıyla paylaşır.
// Web karşılığı: webapp/styles.css @keyframes orbit3d (aynı 45° örnek noktaları).
const ORBIT_BALL_WHITE = require('../assets/ball-card-white.png');
const ORBIT_BALL_BLUE = require('../assets/ball-card-blue.png');
const ORBIT_PERIOD_MS = 2600;
const ORBIT_T = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
// A topu (t=0'da önde): x = -R·sinθ (saat yönü), y = V·cosθ, ölçek = 1+0.16·cosθ
const ORBIT_AX = [0, -52, -74, -52, 0, 52, 74, 52, 0];
const ORBIT_AY = [14, 10, 0, -10, -14, -10, 0, 10, 14];
const ORBIT_AS = [1.16, 1.11, 1, 0.89, 0.84, 0.89, 1, 1.11, 1.16];
// B topu: aynı değer, yarım periyot kaydırılmış çıktılar
const ORBIT_BX = [0, 52, 74, 52, 0, -52, -74, -52, 0];
const ORBIT_BY = [-14, -10, 0, 10, 14, 10, 0, -10, -14];
const ORBIT_BS = [0.84, 0.89, 1, 1.11, 1.16, 1.11, 1, 0.89, 0.84];
// Görünürlük pencereleri: A önde t∈[0,.25)∪(.75,1], B önde t∈(.25,.75).
// Geçiş .24→.25 ve .75→.76 aralığında (~26ms, toplar yanlardayken) olur.
const ORBIT_VIS_T = [0, 0.24, 0.25, 0.75, 0.76, 1];
const ORBIT_A_FRONT = [1, 1, 0, 0, 1, 1];
const ORBIT_A_BACK = [0, 0, 0.82, 0.82, 0, 0]; // arkada hafif loş (derinlik)
const ORBIT_B_FRONT = [0, 0, 1, 1, 0, 0];
const ORBIT_B_BACK = [0.82, 0.82, 0, 0, 0, 0.82];

function OrbitLoader({ size = 190 }: { size?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: ORBIT_PERIOD_MS, easing: Easing.linear, useNativeDriver: true }),
    );
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    spin.start();
    pulse.start();
    return () => { spin.stop(); pulse.stop(); };
  }, [t, glow]);

  const k = size / 190;
  const ballSz = 58 * k;
  const orbitBall = (src: any, xs: number[], ys: number[], ss: number[], vis: number[]) => (
    <Animated.Image
      source={src}
      resizeMode="contain"
      style={{
        position: 'absolute', width: ballSz, height: ballSz,
        opacity: t.interpolate({ inputRange: ORBIT_VIS_T, outputRange: vis }),
        transform: [
          { translateX: t.interpolate({ inputRange: ORBIT_T, outputRange: xs.map((v) => v * k) }) },
          { translateY: t.interpolate({ inputRange: ORBIT_T, outputRange: ys.map((v) => v * k) }) },
          { scale: t.interpolate({ inputRange: ORBIT_T, outputRange: ss }) },
        ],
      }}
    />
  );

  return (
    <View style={{ width: 224 * k, height: 168 * k, alignItems: 'center', justifyContent: 'center' }}>
      {/* arka yarıdaki toplar — yıldırımın ALTINDA çizilir */}
      {orbitBall(ORBIT_BALL_WHITE, ORBIT_AX, ORBIT_AY, ORBIT_AS, ORBIT_A_BACK)}
      {orbitBall(ORBIT_BALL_BLUE, ORBIT_BX, ORBIT_BY, ORBIT_BS, ORBIT_B_BACK)}
      {/* sabit yıldırım + nabız gibi atan altın ışıma */}
      <Animated.View style={{ position: 'absolute', opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.75] }) }}>
        <Svg width={116 * k} height={116 * k}>
          <Defs>
            <RadialGradient id="orbitGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={theme.accent} stopOpacity="0.55" />
              <Stop offset="1" stopColor={theme.accent} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={58 * k} cy={58 * k} r={56 * k} fill="url(#orbitGlow)" />
        </Svg>
      </Animated.View>
      <Svg width={58 * k} height={58 * k} viewBox="0 0 24 24">
        <Defs>
          <SvgGradient id="orbitBolt" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFE484" />
            <Stop offset="0.55" stopColor={theme.accent} />
            <Stop offset="1" stopColor="#E5A912" />
          </SvgGradient>
        </Defs>
        <Path
          d="M13.2 1.6 3.4 13.5c-.3.4 0 .9.5.9h5.8l-1.3 7.2c-.1.6.7 1 1.1.5l9.9-11.9c.3-.4 0-.9-.5-.9h-5.8l1.2-7.2c.1-.6-.7-1-1.1-.5Z"
          fill="url(#orbitBolt)" stroke="#6B4E06" strokeWidth={1.1} strokeLinejoin="round"
        />
      </Svg>
      {/* ön yarıdaki toplar — yıldırımın ÜSTÜNDE çizilir */}
      {orbitBall(ORBIT_BALL_WHITE, ORBIT_AX, ORBIT_AY, ORBIT_AS, ORBIT_A_FRONT)}
      {orbitBall(ORBIT_BALL_BLUE, ORBIT_BX, ORBIT_BY, ORBIT_BS, ORBIT_B_FRONT)}
    </View>
  );
}

export function SearchingScreen({ state, actions }: Props) {
  const [factIdx, setFactIdx] = useState(Math.floor(Math.random() * LOADING_TIPS.length));
  const factFade = useRef(new Animated.Value(1)).current;
  // Tahmini eşleşme sayacı: sunucunun verdiği DÜRÜST saniyeden geriye sayar
  // (kullanıcı isteği 2026-08-27; söylenen = olacak). 0'a inince 'Rakip
  // bulunuyor…' — sunucu o anda maçı kuruyordur.
  const [, setEtaTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setEtaTick((v) => v + 1), 500);
    return () => clearInterval(id);
  }, []);
  const etaLeft = state.searchEta ? Math.ceil(state.searchEta.seconds - (Date.now() - state.searchEta.at) / 1000) : null;

  // Rotate tips every 6s with a 200ms crossfade (fade out → swap → fade in).
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(factFade, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setFactIdx((prev) => (prev + 1) % LOADING_TIPS.length);
        Animated.timing(factFade, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      });
    }, 6000);
    return () => clearInterval(id);
  }, [factFade]);

  const factText = t(LOADING_TIPS[factIdx] ?? 'loading.tip1');

  return (
    <Screen>
      {/* Hero wait — webapp'teki 3D yörünge yükleyicisi: sabit yıldırım + dönen toplar */}
      <View style={[styles.center, { gap: 16 }]}>
        <OrbitLoader />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={styles.h1}>{t('searching.header')}</Text>
          <Text style={styles.muted}>{t('searching.title')}</Text>
          {etaLeft != null ? (
            <View style={{ marginTop: 10, backgroundColor: withAlpha(theme.accent, 0.14), borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, borderWidth: 1.5, borderColor: withAlpha(theme.accent, 0.5) }}>
              <Text style={{ color: theme.accent, fontSize: 14, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>
                {etaLeft > 0 ? t('searching.eta', { s: String(etaLeft) }) : t('searching.etaNow')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <GamePanel compact accentStripe={theme.accent} style={{ marginVertical: 20 }} bodyStyle={{ paddingLeft: 16, paddingRight: 14 }}>
        <SectionHeader label={t('searching.didYouKnow')} icon="bulb" style={{ marginTop: 0, marginBottom: 6 }} />
        <Animated.Text style={{ opacity: factFade, color: theme.text, fontSize: 13, lineHeight: 20, fontFamily: 'Poppins-SemiBold', minHeight: 40 }}>
          {factText}
        </Animated.Text>
      </GamePanel>

      <Btn label={t('searching.cancel')} kind="ghost" icon="close" onPress={actions.cancelSearch} />
    </Screen>
  );
}

// ---- Leaderboard ----
const RANK_COLORS = [theme.gold, theme.silver, theme.bronze];

// THE leaderboard row — one component for the popup (LeaderboardModal) and the
// fullscreen LeaderboardScreen: RankBadge + GamePanel compact with a medal
// accent stripe for the top 3, pressed 2px depress, tap opens the profile.
// memo (2026-08-10): pano açıkken HER reducer dispatch'i tüm satırları (50 ×
// ~15 view + arenaLabel/toLocaleUpperCase/t() işi) yeniden çiziyordu — satıra
// dokunuşun basılı-karesi bu yüzden takılıyordu. entry nesnesi yalnız
// _leaderboard yanıtında değişir → sığ karşılaştırma tutar. onPress yerine
// SABİT onView(userId) alınır; satır İÇİNDEKİ closure memo'yu bozmaz.
const LeaderboardRow = memo(function LeaderboardRow({ entry, onView }: { entry: LeaderboardEntry; onView?: (userId: string) => void }) {
  return (
    <Pressable
      onPress={onView ? () => onView(entry.userId) : undefined}
      disabled={!onView}
      style={({ pressed }) => ({ marginVertical: 4, transform: [{ translateY: pressed ? 2 : 0 }] })}
    >
      <GamePanel compact accentStripe={entry.rank <= 3 ? RANK_COLORS[entry.rank - 1] : undefined} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12 }}>
        <RankBadge rank={entry.rank} size={28} />
        <Avatar avatar={entry.avatar} name={entry.displayName} size={30} ring={theme.primary} ringWidth={1.5} iconColor={theme.primary} iconSize={14} frameId={entry.frame} trophies={entry.trophies} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm'), flexShrink: 1 }}>{entry.displayName}</Text>
            {entry.isBot ? <Ribbon label="BOT" color={theme.gold} /> : null}
          </View>
          <Text numberOfLines={1} style={{ color: theme.accent, fontSize: 10, fontFamily: 'Poppins-SemiBold' }}>{arenaLabel(entry.arena.name).toLocaleUpperCase(currentLang())}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="trophy" size={12} color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: 13, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{entry.trophies}</Text>
          </View>
          <View style={{ backgroundColor: entry.rank <= 3 ? withAlpha(RANK_COLORS[entry.rank - 1]!, 0.2) : theme.well, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: entry.rank <= 3 ? RANK_COLORS[entry.rank - 1]! : theme.hairline }}>
            <Text style={{ color: entry.rank <= 3 ? RANK_COLORS[entry.rank - 1]! : theme.muted, fontSize: 9.5, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>#{entry.rank}</Text>
          </View>
        </View>
        <Text style={{ color: theme.muted, fontSize: 10, width: 40, textAlign: 'right', fontFamily: 'Poppins-SemiBold' }}>{t('stats.record', { wins: entry.wins, losses: entry.losses })}</Text>
      </GamePanel>
    </Pressable>
  );
});

// Loading ≠ empty (spec §9): lists shimmer 3–4 skeleton panels while fetching,
// and only resolve into a crafted EmptyState once the fetch window has passed.
function useLoadGrace(active: boolean, ms = 2500): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!active) { setOver(false); return; }
    const id = setTimeout(() => setOver(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return over;
}

// Skeleton placeholder rows with a slow glowSoft shimmer (native driver opacity).
function SkeletonRows({ rows = 3 }: { rows?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <GamePanel key={i} compact style={{ marginVertical: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.panelInnerFill }} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ height: 12, borderRadius: 6, width: '62%', backgroundColor: theme.panelInnerFill }} />
              <View style={{ height: 8, borderRadius: 4, width: '38%', backgroundColor: theme.panelInnerFill }} />
            </View>
          </View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.glowSoft, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.5] }) }]} />
        </GamePanel>
      ))}
    </>
  );
}

// Crafted leaderboard emptiness — trophy medallion + hint + ghost "play now" CTA.
function LeaderboardEmpty({ onPlay }: { onPlay?: () => void }) {
  return (
    <EmptyState
      icon="trophy"
      title={t('leaderboard.empty')}
      hint={t('leaderboard.emptyHint')}
      cta={onPlay ? <Btn label={t('home.quickMatch')} kind="ghost" icon="flash" onPress={onPlay} /> : undefined}
    />
  );
}

// ---- Match History ----

function arenaForTrophies(trophies: number): { name: string; icon: IoniconName; color: string } {
  // Single source of truth: ARENA_DATA carries the trophy thresholds AND the
  // theme's 7-step arena ramp (flame/purple/blue/primary/gold/silver/bronze).
  const a = ARENA_DATA.find((arena) => trophies >= arena.min && trophies <= arena.max) ?? ARENA_DATA[ARENA_DATA.length - 1]!;
  return { name: a.name, icon: a.icon, color: a.color };
}

// Map an arena's canonical (Turkish) name — as stored on the server & in ARENA_DATA
// — to its localized label / description. Resolved at render time so it follows
// live language changes. Unknown names pass through unchanged.
function arenaKeyFromName(name: string): 'mahalle' | 'amator' | 'profesyonel' | 'sampiyonlar' | 'efsaneler' | 'dunya' | 'goat' | null {
  switch (name) {
    case 'Mahalle Sahası': return 'mahalle';
    case 'Amatör Lig': return 'amator';
    case 'Profesyonel Lig': return 'profesyonel';
    case 'Şampiyonlar Ligi': return 'sampiyonlar';
    case 'Efsaneler Arası': return 'efsaneler';
    case 'Dünya Klasmanı': return 'dunya';
    case 'GOAT': return 'goat';
    default: return null;
  }
}
function arenaLabel(name: string): string {
  const k = arenaKeyFromName(name);
  return k ? t(`arena.${k}` as MessageKey) : name;
}
function arenaDesc(name: string): string {
  const k = arenaKeyFromName(name);
  return k ? t(`arena.${k}.desc` as MessageKey) : '';
}

// "Last seen 5 min ago" for an offline friend (relative, localized).
function lastSeenLabel(iso: string | null | undefined): string {
  if (!iso) return t('common.offline');
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return t('common.offline');
  const mins = Math.floor(diff / 60000);
  const p = t('lastSeen.prefix');
  if (mins < 1) return `${p} ${t('lastSeen.justNow')}`;
  if (mins < 60) return `${p} ${t('lastSeen.min', { n: String(mins) })}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${p} ${t('lastSeen.hour', { n: String(hrs) })}`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${p} ${t('lastSeen.day', { n: String(days) })}`;
  return `${p} ${t('lastSeen.long')}`;
}

// One short-date voice for match-history cards AND conversation rows:
// today → HH:mm, otherwise dd.MM (spec: metadata stays on the 10px caption floor).
function shortDate(iso: string | number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Remote club logo / player photo, rendered via expo-image with disk caching, so it
// is fetched from the backend ONCE, saved on the phone, and shown instantly forever
// after (no re-download, no flash). transition:0 = no fade when it's already cached.
function CachedImage({ uri, style, contentFit = 'cover' }: { uri: string | null | undefined; style?: any; contentFit?: 'cover' | 'contain' }) {
  return <ExpoImage source={uri ? { uri } : null} style={style} contentFit={contentFit} cachePolicy="memory-disk" transition={0} />;
}

function ClubLogo({ uri, name, size = 22 }: { uri: string | null; name?: string; size?: number }) {
  if (!uri) return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: name ? badgeColor(name) : theme.border, alignItems: 'center', justifyContent: 'center' }}>
      {name ? <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: size * 0.45 }}>{initial(name)}</Text> : null}
    </View>
  );
  return <CachedImage uri={uri} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

function PlayerPhoto({ uri, size = 32 }: { uri: string | null; size?: number }) {
  if (!uri) return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.border, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="person" size={size * 0.5} color={theme.muted} />
    </View>
  );
  return <CachedImage uri={uri} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

// THE match-history card — one component for the popup (MatchHistoryModal) and
// the fullscreen MatchHistoryScreen: GamePanel compact tinted by the result,
// Ribbon verdict chip, engraved Poppins-Black score, recessed round wells.
// Maç geçmişi kartı — savaş günlüğü dili (Clash Royale kalıbı, araştırma
// reçetesi): sonuç DÖRT ayrı yolla anlatılır, çünkü tek başına renk yeterli
// değildir (renk körlüğü + gri baskı testi):
//   1) dolu madalyon (galibiyet) vs HALKA (mağlubiyet) — silüet farkı
//   2) kartın sol kenar şeridi + hafif ton yıkaması
//   3) skorda kazananın rakamı parlak, kaybedenin sönük
//   4) kupa farkının İŞARETİ
// Ayrıntı (turlar) varsayılan KAPALI: liste taranabilir kalır, merak eden açar.
// memo (2026-08-10): liste artık sanal (FlatList) — sığ karşılaştırma, popup
// açıkken gelen alakasız dispatch'lerin tüm kartları yeniden çizmesini keser
// (match nesnesi yalnız _match_history yanıtında değişir). Tur süzgeçleri de
// yalnız veri değişince koşar; her render'da iki .filter turu atılıyordu.
const MatchHistoryCard = memo(function MatchHistoryCard({ match: m, myName }: { match: MatchHistoryView; myName: string }) {
  const [open, setOpen] = useState(false);
  const myRounds = useMemo(() => m.rounds.filter((r) => r.answeredBy === myName), [m.rounds, myName]);
  const oppRounds = useMemo(() => m.rounds.filter((r) => r.answeredBy !== myName), [m.rounds, myName]);
  const tint = m.won ? theme.primary : theme.danger;
  const delta = (m.playerTrophies ?? 0) - (m.opponentTrophies ?? 0); // gösterim amaçlı fark
  const oArena = arenaForTrophies(m.opponentTrophies);

  const roundChip = (r: MatchHistoryView['rounds'][number], mine: boolean, key: number) => (
    <View
      key={key}
      style={{
        backgroundColor: theme.well, borderRadius: 10, padding: 8, marginBottom: 4, overflow: 'hidden',
        borderLeftWidth: 3, borderLeftColor: mine ? theme.primary : theme.danger,
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <MatchHistoryLeadBadge mode={(r.mode as GameMode) ?? (m.gameMode as GameMode) ?? 'team-team'} country={r.country} letter={r.letter} teamA={r.teamA} teamALogo={r.teamALogo} size={18} />
        <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold' }}>+</Text>
        <ClubLogo uri={r.teamBLogo} name={r.teamB} size={18} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <PlayerPhoto uri={r.playerImageUrl} size={22} />
        <Text style={{ color: mine ? theme.primary : theme.danger, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', flex: 1 }} numberOfLines={1}>{r.player}</Text>
      </View>
    </View>
  );

  return (
    <Pressable
      onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen((o) => !o); }}
      style={({ pressed }) => ({ marginBottom: 10, transform: [{ scale: pressed ? 0.985 : 1 }, { translateY: pressed ? 2 : 0 }] })}
    >
      <GamePanel compact tint={tint} bodyStyle={{ padding: 0 }}>
        {/* Sonuç şeridi — sol kenarda, tam boy */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: tint, zIndex: 3 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 12, paddingVertical: 10, backgroundColor: withAlpha(tint, 0.08) }}>
          {/* 1) Silüet: galibiyette DOLU madalyon, mağlubiyette HALKA */}
          {m.won ? (
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, backgroundColor: '#FFFFFF', opacity: 0.3 }} />
              <Ionicons name="trophy" size={17} color={theme.onAccent} />
            </View>
          ) : (
            <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, borderColor: theme.danger, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={17} color={theme.danger} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-ExtraBold' }}>{m.opponentName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name={oArena.icon} size={11} color={oArena.color} />
              <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold' }} numberOfLines={1}>
                {arenaLabel(oArena.name)} · {MODE_LABEL((m.gameMode as GameMode) ?? 'team-team')}
              </Text>
            </View>
          </View>
          {/* 3) Skor: kazananın rakamı parlak, kaybedenin sönük — renksiz de okunur */}
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: m.won ? theme.text : theme.textSub, fontSize: 24, fontFamily: 'Poppins-Black', letterSpacing: 1.2, fontVariant: ['tabular-nums'], ...engrave('lg') }}>{m.playerScore}</Text>
              <Text style={{ color: theme.muted, fontSize: 18, fontFamily: 'Poppins-Black', marginHorizontal: 3 }}>-</Text>
              <Text style={{ color: m.won ? theme.textSub : theme.text, fontSize: 24, fontFamily: 'Poppins-Black', letterSpacing: 1.2, fontVariant: ['tabular-nums'], ...engrave('lg') }}>{m.opponentScore}</Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{shortDate(m.playedAt)}</Text>
          </View>
        </View>

        {/* Ayrıntı satırı: tek şevron — "aç/kapa" demek, "git" değil */}
        {m.rounds.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 26, borderTopWidth: 1, borderTopColor: theme.hairline }}>
            <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', flex: 1 }}>
              {t('matchHistory.rounds', { n: String(m.rounds.length) })}
            </Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.muted} />
          </View>
        ) : null}

        {open && m.rounds.length > 0 ? (
          <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12, gap: 6 }}>
            <View style={{ flex: 1 }}>{myRounds.map((r, i) => roundChip(r, true, i))}</View>
            {myRounds.length > 0 && oppRounds.length > 0 ? <View style={{ width: 1, backgroundColor: theme.hairline, marginVertical: 4 }} /> : null}
            <View style={{ flex: 1 }}>{oppRounds.map((r, i) => roundChip(r, false, i))}</View>
          </View>
        ) : null}
      </GamePanel>
    </Pressable>
  );
});

export function MatchHistoryScreen({ state, actions }: Props) {
  const history = state.matchHistory;
  const myName = state.profile?.displayName ?? '';

  return (
    <Screen>
      <ScreenHeader title={t('matchHistory.title')} icon="time" onBack={actions.closeMatchHistory} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={history.length === 0 ? { flexGrow: 1, justifyContent: 'center', paddingBottom: 30 } : { paddingBottom: 30 }}
      >
        {history.length === 0 ? (
          <EmptyState
            icon="time"
            title={t('matchHistory.empty')}
            hint={t('matchHistory.emptyHint')}
            cta={<Btn label={t('home.quickMatch')} kind="ghost" icon="flash" onPress={actions.closeMatchHistory} />}
          />
        ) : (
          history.map((m) => (
            <MatchHistoryCard key={m.id} match={m} myName={myName} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

// ---- Leaderboard ----

// One podium spot for the fullscreen leaderboard hero: avatar over a stepped
// plinth in the medal color, RankBadge medal overlapping the avatar, pressed
// 2px sink, tap opens the profile. #1 carries the gold gloss.
function PodiumSpot({ entry, onPress }: { entry: LeaderboardEntry; onPress: () => void }) {
  const place = entry.rank;
  const c = RANK_COLORS[place - 1] ?? theme.gold;
  const plinthH = place === 1 ? 44 : place === 2 ? 30 : 22;
  const avSize = place === 1 ? 58 : 46;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: 'center', transform: [{ translateY: pressed ? 2 : 0 }] })}>
      <Avatar avatar={entry.avatar} name={entry.displayName} size={avSize} ring={c} ringWidth={2.5} iconColor={c} iconSize={Math.round(avSize * 0.45)} frameId={entry.frame} trophies={entry.trophies} />
      <View style={{ marginTop: -11 }}>
        <RankBadge rank={place} size={22} />
      </View>
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold', marginTop: 4, maxWidth: '96%', ...engrave('sm') }}>{entry.displayName}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1, marginBottom: 6 }}>
        <Ionicons name="trophy" size={10} color={theme.accent} />
        <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{entry.trophies}</Text>
      </View>
      {/* Stepped plinth — raised block in the medal color (light top / dark lip) */}
      <View style={{ alignSelf: 'stretch', height: plinthH, borderRadius: 8, backgroundColor: c, borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.45)', borderBottomWidth: 3, borderBottomColor: darken(c), overflow: 'hidden' }}>
        {place === 1 ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundColor: 'rgba(255,255,255,0.22)' }} /> : null}
      </View>
    </Pressable>
  );
}

export function LeaderboardScreen({ state, actions }: Props) {
  const lb = state.leaderboard;
  const myRank = lb.find((e) => e.userId === state.profile?.userId)?.rank;
  // Loading ≠ empty: skeleton shimmer during the fetch window, then EmptyState.
  const graceOver = useLoadGrace(lb.length === 0);
  const top3 = lb.filter((e) => e.rank >= 1 && e.rank <= 3);
  // memo(LeaderboardRow) için sabit kimlikli dokunuş: actions her AppRoot
  // render'ında yeni nesne — latest-ref güncel kalmayı garanti eder, kimlik
  // sabit kalır (satır başına taze closure memo'yu bozuyordu).
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const onView = useCallback((id: string) => actionsRef.current.getUserProfile(id), []);
  return (
    <Screen>
      <ScreenHeader title={t('leaderboard.title')} icon="trophy" onBack={actions.closeLeaderboard} />
      <ScrollView style={{ flex: 1, marginTop: 10 }} showsVerticalScrollIndicator={false} contentContainerStyle={lb.length === 0 && graceOver ? { flexGrow: 1, justifyContent: 'center' } : { paddingBottom: 24 }}>
        {top3.length === 3 ? (
          // Hero podium header: 2 — 1 — 3 on stepped plinths.
          <GamePanel hero style={{ marginBottom: 12 }} bodyStyle={{ paddingTop: 18, paddingBottom: 12, paddingHorizontal: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <PodiumSpot entry={top3[1]!} onPress={() => actions.getUserProfile(top3[1]!.userId)} />
              <PodiumSpot entry={top3[0]!} onPress={() => actions.getUserProfile(top3[0]!.userId)} />
              <PodiumSpot entry={top3[2]!} onPress={() => actions.getUserProfile(top3[2]!.userId)} />
            </View>
          </GamePanel>
        ) : null}
        {lb.map((entry) => (
          <View key={entry.rank} style={{ marginBottom: 4 }}>
            <LeaderboardRow entry={entry} onView={onView} />
          </View>
        ))}
        {lb.length === 0 ? (
          graceOver ? <LeaderboardEmpty onPlay={actions.closeLeaderboard} /> : <SkeletonRows rows={4} />
        ) : null}
        <MyLeaderboardRank rank={myRank} />
      </ScrollView>
    </Screen>
  );
}

// ---- Result ----
function TeamResultCard({ team, spells, played }: { team: ClubRef; spells: SpellInfo[]; played: boolean | null }) {
  return (
    <View style={[styles.teamResult, { borderColor: played == null ? theme.border : played ? theme.primary : theme.danger }]}>
      <ClubBadge name={team.name} size={40} logoUrl={team.logoUrl} />
      <Text style={styles.teamResultName} numberOfLines={2}>
        {team.name}
      </Text>
      {played == null ? null : (
        <>
          <Ionicons
            name={played ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={played ? theme.primary : theme.danger}
          />
          <Text style={styles.teamResultYears}>
            {played ? spells.map(yearsText).filter(Boolean).join(', ') || t('career.played') : t('career.notPlayed')}
          </Text>
        </>
      )}
    </View>
  );
}

function ReadyButton({ state, onPress }: { state: GameState; onPress: () => void }) {
  const [secs, setSecs] = useState<number | null>(null);

  useEffect(() => {
    if (!state.readyCountdownEndsAt) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((state.readyCountdownEndsAt! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.readyCountdownEndsAt]);

  // Last 3 seconds: flip to accent + a gentle scale pulse for urgency.
  const urgent = secs !== null && secs <= 3;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!urgent) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [urgent, pulse]);

  return (
    <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }] }}>
      <Btn
        label={t('ready.label')}
        badge={secs !== null ? String(secs) : undefined}
        kind={urgent ? 'accent' : 'primary'}
        icon="checkmark"
        onPress={onPress}
      />
    </Animated.View>
  );
}

// Falling confetti for the victory screen (pure RN Animated, no deps).
// Full-viewport travel, per-piece duration/size variance + sinusoidal sway.
function Confetti() {
  const COLORS = [theme.primary, theme.accent, theme.blue, theme.purple, theme.danger, theme.gold];
  const pieces = useRef(
    Array.from({ length: 32 }, (_, i) => ({
      x: (i * 53) % 100,
      delay: (i * 71) % 900,
      duration: 1800 + ((i * 97) % 1400),
      w: 6 + (i % 3) * 2,
      h: 10 + ((i * 13) % 8),
      sway: (8 + ((i * 29) % 14)) * (i % 2 === 0 ? 1 : -1),
      color: COLORS[i % COLORS.length]!,
      v: new Animated.Value(0),
    })),
  ).current;
  useEffect(() => {
    pieces.forEach((p) =>
      Animated.loop(
        Animated.timing(p.v, { toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.linear, useNativeDriver: true }),
      ).start(),
    );
  }, [pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const ty = p.v.interpolate({ inputRange: [0, 1], outputRange: [-30, SCREEN_H + 30] });
        const tx = p.v.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, p.sway, 0, -p.sway, 0] });
        const rot = p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });
        const op = p.v.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{ position: 'absolute', left: `${p.x}%`, top: 0, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.color, opacity: op, transform: [{ translateY: ty }, { translateX: tx }, { rotate: rot }] }}
          />
        );
      })}
    </View>
  );
}

// Count-up ticker for score / reward numerals (~400ms, spec §11). JS-driven by
// design — the ticking value feeds a Text, which the native driver can't do.
function useCountUp(target: number, duration = 400): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setVal(Math.round(value)));
    Animated.timing(v, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => { v.removeListener(id); v.stopAnimation(); };
  }, [target, duration]);
  return val;
}

// Trophy delta — beveled reward chip (Ribbon language: gold for gains, danger
// for losses) with a count-up delta and the new total in a recessed muted
// segment. Slides in 150ms after the banner lands.
function TrophyDeltaChip({ delta, trophies }: { delta: number; trophies: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(150),
      Animated.timing(a, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [a]);
  const gain = delta >= 0;
  const color = gain ? theme.accent : theme.danger;
  const fg = gain ? theme.ink : theme.text;
  const shownDelta = useCountUp(Math.abs(delta));
  return (
    <Animated.View
      style={{
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        flexDirection: 'row', alignItems: 'stretch', marginTop: 8,
        borderRadius: 10, overflow: 'hidden',
        ...shadowRow,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color, paddingHorizontal: 10, paddingVertical: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.4)', borderBottomWidth: 2, borderBottomColor: darken(color, 0.4) }}>
        <Ionicons name="trophy" size={12} color={fg} />
        <Text style={{ color: fg, fontSize: 13, fontFamily: 'Poppins-Black', letterSpacing: 0.5, fontVariant: ['tabular-nums'] }}>
          {gain ? '+' : '-'}{shownDelta}
        </Text>
      </View>
      <View style={{ justifyContent: 'center', backgroundColor: theme.panelInnerFill, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: theme.cardLip, borderBottomWidth: 2, borderBottomColor: theme.cardLip }}>
        <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{trophies}</Text>
      </View>
    </Animated.View>
  );
}

// Match-over banner: spring-scales in, trophy/sad icon in a gold-glow medallion,
// count-up score, trophy delta as a reward chip (no more raw '→' text row).
// Trophy medallion art (cropped from the Kupa-popup mockup): gold cup on blue for
// a win, cracked silver cup on purple for a loss.
const TROPHY_MEDALLION_WIN = require('../assets/trophy-win.png');
const TROPHY_MEDALLION_LOSS = require('../assets/trophy-loss.png');

// Static confetti scattered down the sides of the win card (as in the mockup).
const WIN_CONFETTI: { l: `${number}%`; t: `${number}%`; c: string; w: number; h: number; r: `${number}deg` }[] = [
  { l: '6%', t: '10%', c: theme.purple, w: 11, h: 7, r: '25deg' },
  { l: '17%', t: '28%', c: theme.gold, w: 12, h: 6, r: '-18deg' },
  { l: '3%', t: '40%', c: theme.blue, w: 9, h: 9, r: '10deg' },
  { l: '21%', t: '9%', c: theme.primary, w: 8, h: 8, r: '40deg' },
  { l: '11%', t: '50%', c: theme.gold, w: 10, h: 6, r: '-30deg' },
  { l: '87%', t: '11%', c: theme.gold, w: 10, h: 7, r: '15deg' },
  { l: '92%', t: '29%', c: theme.purple, w: 9, h: 9, r: '-22deg' },
  { l: '82%', t: '45%', c: theme.blue, w: 11, h: 6, r: '32deg' },
  { l: '77%', t: '8%', c: theme.danger, w: 8, h: 8, r: '-12deg' },
  { l: '90%', t: '50%', c: theme.primary, w: 9, h: 6, r: '50deg' },
];

// Flying gold trophies: spawn at screen centre and arc onto the trophy counter
// (mirrors the diamond gem-fly). Calls onDone once every trophy has landed, so the
// caller can then run the counter's fill + count-up.
function TrophyFly({ target, onDone, count = 9 }: { target: { x: number; y: number }; onDone: () => void; count?: number }) {
  const { width: screenW, height: screenH } = canvasSize();
  const originX = screenW / 2;
  const originY = screenH * 0.42;
  const parts = useRef(
    Array.from({ length: count }, () => ({ x: new Animated.Value(0), y: new Animated.Value(0), s: new Animated.Value(0), o: new Animated.Value(0) })),
  ).current;
  useEffect(() => {
    let done = 0;
    parts.forEach((g, i) => {
      g.x.setValue(originX + (Math.random() - 0.5) * 90);
      g.y.setValue(originY + (Math.random() - 0.5) * 70);
      g.s.setValue(0);
      g.o.setValue(0);
      setTimeout(() => {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(g.o, { toValue: 1, duration: 90, useNativeDriver: true }),
            Animated.spring(g.s, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.x, { toValue: target.x, duration: 560, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.y, { toValue: target.y, duration: 560, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.s, { toValue: 0.42, duration: 560, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.s, { toValue: 0.15, duration: 120, useNativeDriver: true }),
            Animated.timing(g.o, { toValue: 0, duration: 120, useNativeDriver: true }),
          ]),
        ]).start(() => { done += 1; if (done === parts.length) onDone(); });
      }, i * 55);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Rendered in a Modal so absoluteFill maps to the whole window — the same
  // coordinate space measureInWindow / Dimensions gave us for origin and target.
  return (
    <SafeModal visible transparent animationType="none" statusBarTranslucent>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {parts.map((g, i) => (
          <Animated.View key={i} style={{ position: 'absolute', left: -15, top: -15, opacity: g.o, transform: [{ translateX: g.x }, { translateY: g.y }, { scale: g.s }] }}>
            <Ionicons name="trophy" size={30} color={theme.gold} />
          </Animated.View>
        ))}
      </View>
    </SafeModal>
  );
}

// Match-over banner, styled after the Kupa-popup mockup: a coloured card (blue win /
// purple loss) with a ringed trophy medallion, confetti on a win, and a recessed
// panel showing the score and the arena-based trophy delta (+green / −red).
export function MatchOverBanner({ youWon, youScore, oppScore, youWrong, oppWrong, winnerName, trophyDelta, reason, xpGained }: {
  youWon: boolean; youScore: number; oppScore: number; youWrong: number; oppWrong: number;
  winnerName: string | null; trophyDelta: { delta: number; trophies: number; shielded?: boolean } | null;
  reason?: 'cheat';
  xpGained?: number | null; // maçtan kazanılan XP — popup'ta görünür, ana menüde küre uçuşuyla çubuğa akar
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [a]);
  const sYou = useCountUp(youScore);
  const sOpp = useCountUp(oppScore);
  const deltaCount = useCountUp(trophyDelta ? Math.abs(trophyDelta.delta) : 0);

  const accent = youWon ? theme.blue : theme.purple;                 // ring / glow
  const cardFill = youWon ? '#1E52C0' : '#432A9E';                    // card body
  const insetFill = youWon ? 'rgba(8,20,60,0.5)' : 'rgba(18,8,52,0.5)'; // score panel well
  // Kalkanlı mağlubiyet: kupa kaybı emildi → net 0. "+0" (kazanç gibi yeşil) DEĞİL,
  // "−0" göster (kalkan mavisi); alttaki "kalkan kurtardı" rozeti nedenini açıklar.
  const shielded = !!trophyDelta?.shielded;
  const gain = trophyDelta ? (shielded ? false : trophyDelta.delta >= 0) : youWon;
  const deltaColor = shielded ? theme.blue : (gain ? theme.primary : theme.danger); // +yeşil / −kırmızı; kalkan=mavi

  return (
    <Animated.View
      style={{
        width: '100%', maxWidth: 320, alignSelf: 'center', marginBottom: 14,
        backgroundColor: cardFill, borderRadius: 28,
        borderWidth: 2.5, borderColor: accent,
        paddingTop: 18, paddingBottom: 16, paddingHorizontal: 16, alignItems: 'center',
        shadowColor: accent, shadowOpacity: 0.7, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 18,
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
      }}
    >
      {/* Confetti (win only) */}
      {youWon ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {WIN_CONFETTI.map((p, i) => (
            <View key={i} style={{ position: 'absolute', left: p.l, top: p.t, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.c, transform: [{ rotate: p.r }] }} />
          ))}
        </View>
      ) : null}

      {/* Ringed trophy medallion (image slightly overscanned so its ring meets the circle) */}
      <View style={{ width: 132, height: 132, borderRadius: 66, overflow: 'hidden', marginBottom: 14 }}>
        <Image
          source={youWon ? TROPHY_MEDALLION_WIN : TROPHY_MEDALLION_LOSS}
          style={{ width: 150, height: 150, marginLeft: -9, marginTop: -9 }}
          resizeMode="cover"
        />
      </View>
      {reason === 'cheat' ? (
        <View style={{ marginTop: -4, marginBottom: 12, alignItems: 'center', gap: 4 }}>
          <Text style={{ color: '#fff', fontFamily: 'Poppins-Black', fontSize: 22, textAlign: 'center', ...engrave('sm') }}>{t('match.cheatDetectedTitle')}</Text>
          <Text style={{ color: withAlpha('#fff', 0.82), fontFamily: 'Poppins-SemiBold', fontSize: 13, textAlign: 'center', lineHeight: 18 }}>{t('match.cheatDetectedBody')}</Text>
        </View>
      ) : null}

      {/* Recessed panel: score + divider + trophy delta */}
      <View
        style={{
          width: '100%', backgroundColor: insetFill, borderRadius: 20,
          paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center',
          borderWidth: 1.5, borderColor: withAlpha(accent, 0.35),
        }}
      >
        <Text style={{ color: '#fff', fontFamily: 'Poppins-Black', fontSize: 42, letterSpacing: 4, fontVariant: ['tabular-nums'], ...engrave('lg') }}>
          {sYou} - {sOpp}
        </Text>
        {trophyDelta ? (
          <>
            <View style={{ height: 1.5, width: '84%', backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 10, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="trophy" size={28} color={youWon ? theme.gold : theme.silver} />
              <Text style={{ color: deltaColor, fontFamily: 'Poppins-Black', fontSize: 34, fontVariant: ['tabular-nums'], ...engrave('sm') }}>
                {gain ? '+' : '−'}{deltaCount}
              </Text>
            </View>
            {trophyDelta.shielded ? (
              // Kupa Kalkanı bu mağlubiyetin kupa kaybını emdi — delta 0 gösterilir
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: withAlpha(theme.blue, 0.18), borderRadius: 999, borderWidth: 1.5, borderColor: withAlpha(theme.blue, 0.65), paddingHorizontal: 11, paddingVertical: 5 }}>
                <Ionicons name="shield-checkmark" size={14} color={theme.blue} />
                <Text style={{ color: lighten(theme.blue, 0.25), fontSize: 12, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('power.shieldSaved')}</Text>
              </View>
            ) : null}
          </>
        ) : null}
        {xpGained ? (
          // Kazanılan XP — kaybeden de görür (XP kupadan bağımsız): mint rozet.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: withAlpha(theme.primary, 0.16), borderRadius: 999, borderWidth: 1.5, borderColor: withAlpha(theme.primary, 0.6), paddingHorizontal: 12, paddingVertical: 5 }}>
            <Ionicons name="flash" size={14} color={theme.primary} />
            <Text style={{ color: lighten(theme.primary, 0.2), fontSize: 13, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>+{xpGained} XP</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function ResultScreen({ state, actions, tutorial }: Props) {
  const r = state.result!;
  const room = state.room!;
  const you = room.players.find((p) => p.id === room.youId);
  const opp = room.players.find((p) => p.id !== room.youId);
  const matchOver = state.matchOver;
  const youWon = state.matchWinnerId != null && state.matchWinnerId === room.youId;
  // Tur arası Çık = hükmen mağlubiyet (kupa cezası). Diğer maç-içi ekranlar
  // (Pick/Guess) onay soruyordu, burası sormuyordu — kullanıcı uyarısız kupa
  // kaybetti (2026-08-10). Maç BİTTİYSE çıkış serbesttir, onay sorulmaz.
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Çarpı/Çık HER maçta sorar (maç bittiyse ya da tutorial'daysa hariç):
  // botta yalnız "emin misin", derecelide kupa uyarısı, dostlukta kupasız hükmen.
  const leaveKind = state.isQuickMatch ? ('ranked' as const) : ('forfeit' as const);
  const handleLeave = () => (matchOver || tutorial) ? actions.leave() : setShowLeaveConfirm(true);

  // KAYIP SONRASI ÖDÜLLÜ REKLAM (kullanıcı onayı 2026-08-29): maç bitti ve
  // kaybettiysen "reklam izle → elmas" teselli teklifi. Ödül sunucu-onaylı
  // (grant_ad_reward: günlük tavan + hız sınırı sunucuda) — istemci yalnız
  // izletir; miktar sunucudan döner, başarıda buton "+N elmas" onayına dönüşür.
  const [adClaimState, setAdClaimState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [adClaimGranted, setAdClaimGranted] = useState(0);
  const lostFinal = matchOver && state.matchWinnerId != null && state.matchWinnerId !== room.youId
    && getMonetizationConfig().ads.rewardedPostLoss;
  const postLossAd = useAdState(() => {
    setAdClaimState('busy');
    actions.grantAdReward()
      .then((granted) => { track('ad_reward_granted', { granted, source: 'post_loss' }); setAdClaimGranted(granted); setAdClaimState(granted > 0 ? 'done' : 'error'); if (granted > 0) triggerFeedback(GameFeedbackEvent.UI_PURCHASE); })
      .catch(() => setAdClaimState('error'));
  }, lostFinal);
  const showPostLossAd = lostFinal && adClaimState !== 'done' && adClaimState !== 'error';

  const { icon, color, headline } = useMemo(() => {
    if (r.reason === 'same_team')
      return { icon: 'swap-horizontal' as IoniconName, color: theme.accent, headline: t('result.roundSkipped') };
    if (r.reason === 'no_common')
      return { icon: 'information' as IoniconName, color: theme.accent, headline: t('result.roundSkipped') };
    if (r.reason === 'power_skip')
      return { icon: 'flash' as IoniconName, color: theme.purple, headline: t('result.powerSkipped') };
    if (r.reason === 'passed')
      return { icon: 'play-skip-forward' as IoniconName, color: theme.accent, headline: t('result.roundSkipped') };
    if (r.reason === 'all_wrong')
      return { icon: 'close-circle' as IoniconName, color: theme.danger, headline: t('result.allWrongTitle') };
    if (r.reason === 'timeout')
      return { icon: 'time' as IoniconName, color: theme.muted, headline: t('result.timeUp') };
    return r.correct
      ? { icon: 'checkmark' as IoniconName, color: theme.primary, headline: t('result.correct') }
      : { icon: 'close' as IoniconName, color: theme.danger, headline: t('result.wrong') };
  }, [r]);

  // Round verdict pop (scale 0.5 → spring overshoot → 1) + 80ms photo stagger.
  const verdictA = useRef(new Animated.Value(0)).current;
  const photoA = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    verdictA.setValue(0);
    photoA.setValue(0);
    Animated.spring(verdictA, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(80),
      Animated.spring(photoA, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [r, verdictA, photoA]);
  const photoStyle = {
    alignItems: 'center' as const,
    opacity: photoA.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' as const }),
    transform: [{ scale: photoA.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
  };

  // Fold-altı bölümler ilk commit'e GİRMEZ: 'result' dispatch'iyle aynı frame'de
  // 10-20 CareerRow + ortak-oyuncu görsel listesi (+ galibiyette 32 değerli
  // konfeti) mount etmek verdict pop'unun ilk karesini geciktiriyordu. Bir frame
  // sonra (rAF) mount edilirler — Hazır/Çık'ın altında, fold altında oldukları
  // için piksel farkı yok; native spring'ler ikinci commit boyunca akmaya devam
  // eder.
  const [late, setLate] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLate(true));
    return () => cancelAnimationFrame(id);
  }, [r]);

  const playedA = r.spellsA.length > 0;
  const playedB = r.spellsB.length > 0;
  // Geçerli bir oyuncu söylenmediyse (timeout / passed / all_wrong / no_match)
  // takım kartlarında "oynadı/oynamadı" kararı gösterilmez — değerlendirilecek
  // bir cevap yoktur; takımlar yalnızca nötr halde görünür.
  const answered = !!(r.matchedPlayerName || r.matchedClubName);

  return (
    <Screen bg={<MatchCosmeticBackdrop backgroundId={matchBackgroundIdForState(state)} />}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* Kupa kazanma/kaybetme popup'ı artık BURADA ÇİZİLMEZ — maç ekranından
            çıkıp ana menüye dönünce App-seviyesi katmanda gösterilir (kullanıcı
            kararı). Veriyi App.tsx maç biterken yakalar. */}

        {/* Round verdict — always shown, so even on the deciding round you see who/what the answer was */}
        <Animated.View
          style={[styles.center, {
            opacity: verdictA.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale: verdictA.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
          }]}
        >
          {/* Check/cross medallion. Built from two stacked FILLS, never per-side
              borders: iOS draws a rounded border as four segments, so a light-top/
              dark-bottom border pair leaves diagonal seams (the ring reads "cut" —
              see PulseRing's comment), and the asymmetric widths (top 2 / bottom 4)
              shifted the glyph's content box 1px off the visual centre. A face
              circle over a darker lip circle offset downwards gives the same bevel
              with one continuous edge and a truly centred glyph. */}
          {(() => {
            const d = matchOver ? 52 : 72;
            const lip = matchOver ? 3 : 4;
            return (
              <View style={{ width: d, height: d + lip }}>
                <View style={{ position: 'absolute', top: lip, width: d, height: d, borderRadius: d / 2, backgroundColor: darken(color) }} />
                <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={icon} size={matchOver ? 26 : 38} color={theme.ink} />
                </View>
              </View>
            );
          })()}
          <Text style={[styles.h1, { color }]}>{headline}</Text>
          {r.reason === 'same_team' ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>{t('result.sameTeam')}</Text>
          ) : r.reason === 'no_common' ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>
              {state.revealMode === 'country-team' ? t('result.noCommonCountry')
                : state.revealMode === 'letter-team' ? t('result.noCommonLetter')
                : t('result.noCommon')}
            </Text>
          ) : r.reason === 'power_skip' ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>{state.spSkipBy === 'you' ? t('result.youSkippedPower') : t('result.oppSkippedPower')}</Text>
          ) : r.reason === 'passed' ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>{t('result.passed')}</Text>
          ) : r.reason === 'all_wrong' ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>{t('result.allWrong')}</Text>
          ) : null}
          {/* 🔥 Seri kilometre taşı + sıradaki hedef — kayıpta bile bir sonraki
              hedef görünür kalmaz (yalnız kazanana): kazanan "bir maç daha"
              için net hedef görür (spec §36). Ödülün kendisi sunucudan geldi. */}
          {matchOver ? (() => {
            const sr = state.streakReward;
            const streak = state.profile?.winStreak ?? 0;
            const next = STREAK_MILESTONES_VIEW.find((m) => m.streak > streak);
            if (!sr && !(youWon && next)) return null;
            return (
              <View style={{ alignItems: 'center', gap: 5, marginTop: 10 }}>
                {sr ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: withAlpha(theme.gold, 0.14), borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: withAlpha(theme.gold, 0.55) }}>
                    <Text style={{ fontSize: 18 }}>🔥</Text>
                    <View>
                      <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: 13 }}>{t('streak.rewardTitle', { n: String(sr.streak) })}</Text>
                      <Text style={{ color: theme.gemText, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>
                        {sr.diamonds > 0 ? t('streak.rewardDiamonds', { n: String(sr.diamonds) }) : ''}
                        {sr.powerId && SPECIAL_POWERS[sr.powerId as SpecialPowerIdView] ? `${sr.diamonds > 0 ? ' · ' : ''}${t('streak.rewardPower', { name: t(SPECIAL_POWERS[sr.powerId as SpecialPowerIdView].nameKey) })}` : ''}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {youWon && next ? (
                  <Text style={{ color: theme.muted, fontFamily: 'Poppins-SemiBold', fontSize: 12 }}>
                    {t('streak.nextAt', { n: String(next.streak), reward: next.diamonds ? `${next.diamonds} 💎` : t(SPECIAL_POWERS[next.powerId!].nameKey) })}
                  </Text>
                ) : null}
              </View>
            );
          })() : null}
          {/* 🎬 Kayıp tesellisi: reklam izle → elmas (yalnız maç sonu + kaybeden) */}
          {showPostLossAd ? (
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <Btn
                compact kind="accent" icon="videocam"
                label={postLossAd.adLoading || adClaimState === 'busy' ? t('ads.loading') : t('ads.postLossCta')}
                feedback={GameFeedbackEvent.UI_TAP}
                onPress={() => { if (!postLossAd.adLoading && adClaimState === 'idle') void postLossAd.watchAd(); }}
              />
            </View>
          ) : null}
          {adClaimState === 'done' ? (
            <Text style={{ color: theme.gemText, fontFamily: 'Poppins-Black', fontSize: 13, textAlign: 'center', marginTop: 10 }}>{t('ads.rewardGranted', { n: String(adClaimGranted) })}</Text>
          ) : null}
          {/* "Ben de doğru yazmıştım" hissinin ilacı: kaybeden tarafa hızı açıkça söyle */}
          {r.correct && r.answeredById != null && r.answeredById !== room.youId ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>{t('result.faster', { name: r.answeredByName ?? '' })}</Text>
          ) : null}
          {state.revealMode === 'player-player' && r.correct ? (
            <Animated.View style={photoStyle}>
              {r.matchedClubLogo ? (
                <ClubBadge name={r.matchedClubName ?? '?'} size={104} logoUrl={r.matchedClubLogo} />
              ) : null}
              {r.matchedClubName ? <Text style={styles.matched}>{r.matchedClubName}</Text> : null}
            </Animated.View>
          ) : (
            <Animated.View style={photoStyle}>
              {r.matchedPlayerImageUrl ? (
                <CachedImage uri={r.matchedPlayerImageUrl} style={styles.playerPhoto} contentFit="cover" />
              ) : null}
              {r.matchedPlayerName ? <Text style={styles.matched}>{r.matchedPlayerName}</Text> : null}
            </Animated.View>
          )}
          {r.answeredByName ? (
            <Text style={styles.muted}>
              {r.answeredByName} • "{r.guess}"
            </Text>
          ) : null}
          {r.autocorrected ? (
            <View style={styles.fixRow}>
              <Ionicons name="swap-horizontal" size={13} color={theme.accent} />
              <Text style={styles.fixText}>{t('result.autocorrected')}</Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Per-round detail (also shown on a passed round so both players see who the
            common player(s) were — the two team cards + "who played for both"). */}
        {r.reason !== 'no_common' && r.reason !== 'same_team' ? (
          <>
            <View style={styles.teamResultRow}>
              {state.revealMode === 'player-player' ? (
                <>
                  <View style={[styles.teamResult, { borderColor: playedA ? theme.primary : theme.danger }]}>
                    {r.teamA.logoUrl ? (
                      <CachedImage uri={r.teamA.logoUrl} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: badgeColor(r.teamA.name), alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person" size={20} color={theme.text} />
                      </View>
                    )}
                    <Text style={styles.teamResultName} numberOfLines={2}>{r.teamA.name}</Text>
                    <Ionicons name={playedA ? 'checkmark-circle' : 'close-circle'} size={20} color={playedA ? theme.primary : theme.danger} />
                    <Text style={styles.teamResultYears}>
                      {playedA ? r.spellsA.map(yearsText).filter(Boolean).join(', ') || t('career.played') : t('career.notPlayed')}
                    </Text>
                  </View>
                  <View style={[styles.teamResult, { borderColor: playedB ? theme.primary : theme.danger }]}>
                    {r.teamB.logoUrl ? (
                      <CachedImage uri={r.teamB.logoUrl} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: badgeColor(r.teamB.name), alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person" size={20} color={theme.text} />
                      </View>
                    )}
                    <Text style={styles.teamResultName} numberOfLines={2}>{r.teamB.name}</Text>
                    <Ionicons name={playedB ? 'checkmark-circle' : 'close-circle'} size={20} color={playedB ? theme.primary : theme.danger} />
                    <Text style={styles.teamResultYears}>
                      {playedB ? r.spellsB.map(yearsText).filter(Boolean).join(', ') || t('career.played') : t('career.notPlayed')}
                    </Text>
                  </View>
                </>
              ) : state.revealMode === 'country-team' ? (
                /* Country card: flag + name (+ checkmark only when there was an answer) */
                <View style={[styles.teamResult, { borderColor: answered ? theme.primary : theme.border }]}>
                  {/* Flag emoji framed in the ClubBadge white circular chip */}
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.text, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <Text style={{ fontSize: 28 }}>{NATIONALITIES.find((n) => n.value === state.revealCountry)?.flag ?? '🏳️'}</Text>
                  </View>
                  <Text style={styles.teamResultName} numberOfLines={2}>
                    {NATIONALITIES.find((n) => n.value === state.revealCountry)?.displayName ?? r.teamA.name}
                  </Text>
                  {answered ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
                </View>
              ) : state.revealMode === 'letter-team' ? null : (
                <TeamResultCard team={r.teamA} spells={r.spellsA} played={answered ? playedA : null} />
              )}
              {state.revealMode !== 'player-player' ? (
                <TeamResultCard team={r.teamB} spells={r.spellsB} played={answered ? playedB : null} />
              ) : null}
            </View>
          </>
        ) : null}

        {/* Running match score — one recessed strip, leader tinted mint */}
        <View style={styles.scoreRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.well, borderRadius: 16, overflow: 'hidden', paddingVertical: 8, paddingHorizontal: 14 }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
            {room.players.map((p, i) => {
              const other = room.players[1 - i];
              const leads = (p.score ?? 0) > (other?.score ?? 0);
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {i > 0 ? <View style={{ width: 1.5, height: 22, backgroundColor: theme.hairline }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Avatar avatar={p.avatar} name={p.name} size={22} ring={leads ? theme.primary : theme.border} ringWidth={1.5} iconColor={theme.muted} iconSize={13} frameId={p.frame} />
                    <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', maxWidth: 72 }} numberOfLines={1}>{p.name}</Text>
                    <Text style={{ color: leads ? theme.primary : theme.text, fontSize: 15, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>
                      {p.score}/{state.winTarget}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {matchOver ? (
          <>
            {state.rematchState === 'incoming' ? (
              <>
                <Text style={[styles.muted, { marginBottom: 4 }]}>
                  {t('result.rematchIncoming', { name: state.rematchByName ?? '' })}
                </Text>
                <Btn label={t('result.accept')} kind="accent" icon="checkmark-circle" onPress={actions.acceptRematch} />
                <Btn label={t('result.decline')} kind="ghost" icon="close" onPress={actions.declineRematch} />
              </>
            ) : state.rematchState === 'waiting' ? (
              <View style={styles.center}>
                <GameSpinner />
                <Text style={styles.muted}>{t('result.rematchWaiting')}</Text>
              </View>
            ) : state.rematchState === 'declined' ? (
              <>
                <Text style={[styles.muted, { color: theme.danger }]}>{t('result.rematchDeclined')}</Text>
                <Btn label={t('result.tryAgain')} kind="accent" icon="refresh" onPress={actions.playAgain} />
              </>
            ) : (
              <Btn label={t('result.playAgain')} kind="accent" icon="refresh" onPress={actions.playAgain} />
            )}
          </>
        ) : state.waitingReady ? (
          state.iReady ? (
            <View style={styles.center}>
              <Ionicons name="checkmark-circle" size={28} color={theme.primary} />
              <Text style={styles.muted}>{t('result.readyWaiting')}</Text>
            </View>
          ) : (
            <ReadyButton state={state} onPress={actions.ready} />
          )
        ) : (
          <View style={styles.center}>
            <GameSpinner />
            <Text style={styles.muted}>{t('result.nextRound')}</Text>
          </View>
        )}
        <View style={{ height: 10 }} />
        <Btn label={t('result.leave')} kind="ghost" icon="close" onPress={handleLeave} />
        <LeaveConfirmModal visible={showLeaveConfirm} kind={leaveKind} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />

        {/* Kariyer + diğer oynamış oyuncular — Hazır/Çık'ın ALTINDA: Hazır butonu
            kariyer listesini beklemeden her zaman ekranda görünür olsun diye taşındı.
            `late`: bir frame gecikmeli mount (yukarıdaki rAF yorumu). */}
        {late && r.reason !== 'no_common' && r.reason !== 'same_team' ? (
          <>
            {r.allClubs.length ? (
              <>
                <Text style={styles.sectionLabel}>{t('result.career')}</Text>
                {r.allClubs.map((s, i) => (
                  <CareerRow
                    key={`${s.clubId}-${i}`}
                    spell={s}
                    highlight={state.revealMode === 'player-player'
                      ? r.matchedClubName ? s.clubName === r.matchedClubName : false
                      : s.clubId === r.teamA.id || s.clubId === r.teamB.id}
                  />
                ))}
              </>
            ) : null}

            {(() => {
              const countryName = state.revealCountry
                ? NATIONALITIES.find((n) => n.value === state.revealCountry)?.displayName ?? state.revealCountry
                : '';
              const teamName = r.teamB.name;
              const letterVal = state.revealLetter ?? '';
              const commonLabel =
                state.revealMode === 'country-team' ? t('result.commonPlayersCountry', { country: countryName, team: teamName })
                : state.revealMode === 'letter-team' ? t('result.commonPlayersLetter', { letter: letterVal, team: teamName })
                : t('result.commonPlayers');
              const otherLabel =
                state.revealMode === 'country-team' ? t('result.otherCommonCountry', { country: countryName })
                : state.revealMode === 'letter-team' ? t('result.otherCommonLetter', { letter: letterVal })
                : t('result.otherCommon');
              const emptyLabel =
                state.revealMode === 'country-team' ? t('result.noCommonFoundCountry')
                : state.revealMode === 'letter-team' ? t('result.noCommonFoundLetter')
                : t('result.noCommonFound');
              // One GamePanel compact wrapping recessed panelInnerFill rows.
              const renderList = (list: typeof r.commonPlayers) => (
                <GamePanel compact style={{ marginTop: 6 }} bodyStyle={{ padding: 8, gap: 6 }}>
                  {list.map((cp, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface2, borderRadius: 10, borderTopWidth: 1, borderTopColor: theme.topLight, ...shadowRow, paddingVertical: 6, paddingHorizontal: 8 }}>
                      {cp.imageUrl ? (
                        <CachedImage uri={cp.imageUrl} style={styles.commonPhoto} contentFit="cover" />
                      ) : (
                        <View style={[styles.commonPhoto, { backgroundColor: badgeColor(cp.name), alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14 }}>{initial(cp.name)}</Text>
                        </View>
                      )}
                      <Text style={styles.commonName}>{cp.name}</Text>
                    </View>
                  ))}
                </GamePanel>
              );
              if (!r.correct) {
                return (
                  <>
                    <Text style={styles.sectionLabel}>{commonLabel}</Text>
                    {r.commonPlayers && r.commonPlayers.length > 0
                      ? renderList(r.commonPlayers)
                      : <Text style={[styles.muted, { marginTop: 6 }]}>{emptyLabel}</Text>}
                  </>
                );
              }
              if (r.commonPlayers && r.commonPlayers.length > 1) {
                return (
                  <>
                    <Text style={styles.sectionLabel}>{otherLabel}</Text>
                    {renderList(r.commonPlayers.filter((cp) => cp.name !== r.matchedPlayerName))}
                  </>
                );
              }
              return null;
            })()}
          </>
        ) : null}
      </ScrollView>
      {late && matchOver && youWon ? <Confetti /> : null}
      {!tutorial ? <EmoteLayer state={state} actions={actions} fab="top-right" /> : null}
    </Screen>
  );
}


// ═══════════════════════ SEVİYE SİSTEMİ ═══════════════════════
// Kupadan bağımsız, asla düşmeyen sadakat merdiveni (sunucu: game/level.ts).
// Bu blok kendi içinde kapalıdır — kaldırmak istenirse bu bölüm + App.tsx'teki
// popup zinciri + ProfilePill/Matchup rozetleri geri alınır.

// Oyunun XP simgesi: masaüstü xp.jpeg'ten bozulmadan çıkarılan taçlı altın
// yıldız — maç sonrası çubuğa uçan ödül taneleri ve +N XP çipi bunu taşır.
export const XP_STAR = require('../assets/xp-star.png');

// ---- XpOrbFly — maç sonrası XP kürelerinin çubuğa akışı ----
// Ortada "+N XP" çipi belirir, ışıyan küreler sırayla profil hapındaki XP
// çubuğuna süzülür; çubuk EŞ ZAMANLI dolar (HomeScreen animasyonu sürer).
// Küre zamanlaması: i. küre 260+i*70'te fırlar, ~610ms sonra çubuğa değer.
export function xpOrbTiming(gained: number): { count: number; firstArrival: number; span: number } {
  const count = Math.max(4, Math.min(9, Math.round(gained / 12)));
  return { count, firstArrival: 260 + 610, span: Math.max(320, (count - 1) * 70 + 160) };
}

function XpOrbFly({ gained, target, onDone, onOrbLand }: { gained: number; target: { x: number; y: number }; onDone: () => void; onOrbLand?: () => void }) {
  const { width: screenW, height: screenH } = canvasSize();
  const originX = screenW / 2;
  const originY = screenH * 0.4;
  const chip = useRef(new Animated.Value(0)).current;
  const { count } = xpOrbTiming(gained);
  const parts = useRef(
    Array.from({ length: 9 }, () => ({ x: new Animated.Value(0), y: new Animated.Value(0), s: new Animated.Value(0), o: new Animated.Value(0) })),
  ).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(chip, { toValue: 1, friction: 6, tension: 130, useNativeDriver: true }),
      Animated.delay(520),
      Animated.timing(chip, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
    let done = 0;
    for (let i = 0; i < count; i++) {
      const g = parts[i]!;
      g.x.setValue(originX + (Math.random() - 0.5) * 80);
      g.y.setValue(originY + (Math.random() - 0.5) * 56);
      g.s.setValue(0);
      g.o.setValue(0);
      setTimeout(() => {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(g.o, { toValue: 1, duration: 90, useNativeDriver: true }),
            Animated.spring(g.s, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.x, { toValue: target.x, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.y, { toValue: target.y, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.s, { toValue: 0.45, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ]).start(() => {
          // KÜRE ÇUBUĞA DEĞDİ — çubuk tam bu anda bir adım dolar
          onOrbLand?.();
          Animated.parallel([
            Animated.timing(g.s, { toValue: 0.12, duration: 110, useNativeDriver: true }),
            Animated.timing(g.o, { toValue: 0, duration: 110, useNativeDriver: true }),
          ]).start(() => { done += 1; if (done === count) onDone(); });
        });
      }, 260 + i * 70);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <SafeModal visible transparent animationType="none" statusBarTranslucent>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* +N XP çipi */}
        <Animated.View style={{
          position: 'absolute', left: 0, right: 0, top: originY - 64, alignItems: 'center',
          opacity: chip, transform: [{ scale: chip.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.panelInk, borderRadius: 999, borderWidth: 2, borderColor: theme.gold, paddingHorizontal: 16, paddingVertical: 7, shadowColor: theme.gold, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 12 }}>
            <Image source={XP_STAR} style={{ width: 20, height: 20 }} resizeMode="contain" />
            <Text style={{ color: theme.text, fontSize: 17, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>+{gained} XP</Text>
          </View>
        </Animated.View>
        {/* küreler */}
        {parts.slice(0, count).map((g, i) => (
          <Animated.View key={i} style={{
            position: 'absolute', left: -13, top: -13,
            shadowColor: theme.gold, shadowOpacity: 0.9, shadowRadius: 9, shadowOffset: { width: 0, height: 0 }, elevation: 9,
            opacity: g.o,
            transform: [{ translateX: g.x }, { translateY: g.y }, { scale: g.s }],
          }}>
            <Image source={XP_STAR} style={{ width: 26, height: 26 }} resizeMode="contain" />
          </Animated.View>
        ))}
      </View>
    </SafeModal>
  );
}

// ---- GemOrbFly — seviye ödülü elmasların hapa akışı ----
// XpOrbFly ile aynı dil: ortada "+N 💎" çipi, elmas taneleri sırayla sağ üstteki
// elmas hapına süzülür. Sayaç dönüşü App.tsx'te uçuş bitince başlar.
export function GemOrbFly({ amount, onDone }: { amount: number; onDone: () => void }) {
  const { width: screenW, height: screenH } = canvasSize();
  const originX = screenW / 2;
  const originY = screenH * 0.4;
  const chip = useRef(new Animated.Value(0)).current;
  const count = Math.max(5, Math.min(10, Math.round(amount / 10)));
  const parts = useRef(
    Array.from({ length: 10 }, () => ({ x: new Animated.Value(0), y: new Animated.Value(0), s: new Animated.Value(0), o: new Animated.Value(0) })),
  ).current;
  useEffect(() => {
    const target = {
      x: gemTarget.measured ? gemTarget.x : screenW - 86,
      y: gemTarget.measured ? gemTarget.y : 78,
    };
    Animated.sequence([
      Animated.spring(chip, { toValue: 1, friction: 6, tension: 130, useNativeDriver: true }),
      Animated.delay(520),
      Animated.timing(chip, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
    let done = 0;
    for (let i = 0; i < count; i++) {
      const g = parts[i]!;
      g.x.setValue(originX + (Math.random() - 0.5) * 84);
      g.y.setValue(originY + (Math.random() - 0.5) * 58);
      g.s.setValue(0);
      g.o.setValue(0);
      setTimeout(() => {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(g.o, { toValue: 1, duration: 90, useNativeDriver: true }),
            Animated.spring(g.s, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.x, { toValue: target.x, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.y, { toValue: target.y, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.s, { toValue: 0.5, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ]).start(() => {
          Animated.parallel([
            Animated.timing(g.s, { toValue: 0.15, duration: 110, useNativeDriver: true }),
            Animated.timing(g.o, { toValue: 0, duration: 110, useNativeDriver: true }),
          ]).start(() => { done += 1; if (done === count) onDone(); });
        });
      }, 260 + i * 70);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <SafeModal visible transparent animationType="none" statusBarTranslucent>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* +N elmas çipi */}
        <Animated.View style={{
          position: 'absolute', left: 0, right: 0, top: originY - 64, alignItems: 'center',
          opacity: chip, transform: [{ scale: chip.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.panelInk, borderRadius: 999, borderWidth: 2, borderColor: theme.gem, paddingHorizontal: 16, paddingVertical: 7, shadowColor: theme.gem, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 12 }}>
            <GemIcon size={16} />
            <Text style={{ color: theme.text, fontSize: 17, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>+{amount}</Text>
          </View>
        </Animated.View>
        {/* elmas taneleri */}
        {parts.slice(0, count).map((g, i) => (
          <Animated.View key={i} style={{
            position: 'absolute', left: -11, top: -11,
            shadowColor: theme.gem, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 9,
            opacity: g.o,
            transform: [{ translateX: g.x }, { translateY: g.y }, { scale: g.s }],
          }}>
            <GemIcon size={22} />
          </Animated.View>
        ))}
      </View>
    </SafeModal>
  );
}

export const LEVEL_CAP = 50;
// SUNUCUYLA AYNI kademeli bantlar (server/src/game/level.ts xpForNext) —
// aylık sezona ayarlı, toplam 9.460 XP. İkisi birlikte değişmeli.
export const xpForNextLevel = (level: number): number => {
  if (level <= 1) return 40;
  if (level === 2) return 60;
  if (level <= 5) return 80;
  if (level <= 10) return 120;
  if (level <= 20) return 160;
  if (level <= 30) return 200;
  if (level <= 40) return 240;
  return 280;
};

// Çerçeve kademeleri — 10'un katlarında açılır; renkler tema paletinden.
export interface LevelTier { key: string; min: number; nameKey: MessageKey; c: string; dark: string }
export const LEVEL_TIERS: LevelTier[] = [
  { key: 'bronze',  min: 10, nameKey: 'level.tierBronze',  c: theme.bronze, dark: darken(theme.bronze, 0.4) },
  { key: 'silver',  min: 20, nameKey: 'level.tierSilver',  c: theme.silver, dark: darken(theme.silver, 0.45) },
  { key: 'gold',    min: 30, nameKey: 'level.tierGold',    c: theme.gold,   dark: darken(theme.gold, 0.4) },
  { key: 'diamond', min: 40, nameKey: 'level.tierDiamond', c: theme.gem,    dark: darken(theme.gem, 0.4) },
  { key: 'goat',    min: 50, nameKey: 'level.tierGoat',    c: theme.flame,  dark: darken(theme.flame, 0.4) },
];
export function levelTier(level: number): LevelTier | null {
  let cur: LevelTier | null = null;
  for (const t of LEVEL_TIERS) if (level >= t.min) cur = t;
  return cur;
}

// 5'in katlarında açılan özel ifadeler (sunucudaki LEVEL_EMOTES ile birebir).
// Çerçeve sahipliği KALICIDIR (sezonlar arası): yeni alan ownedFrames esas,
// eski sunucuya karşı claimedLevels'tan türetme yedeği korunur.
export function ownsFrame(p: ProfileView | null, tierKey: string): boolean {
  if (!p) return false;
  if (p.ownedFrames) return p.ownedFrames.includes(tierKey);
  const tier = LEVEL_TIERS.find((tr) => tr.key === tierKey);
  return tier ? (p.claimedLevels ?? []).includes(tier.min) : false;
}

// Ulaşılmış ama Seviye Yolu'ndan henüz toplanmamış ödül sayısı — haberci
// rozetleri bunu gösterir. Ödül YALNIZ 5'in katlarında vardır.
export function unclaimedLevelCount(p: ProfileView | null): number {
  if (!p) return 0;
  const claimed = new Set(p.claimedLevels ?? []);
  const claimedPremium = new Set(p.claimedPremium ?? []);
  let n = 0;
  for (let i = 5; i <= (p.level ?? 1); i += 5) {
    if (!claimed.has(i)) n++;
    if (p.premiumRoad && !claimedPremium.has(i)) n++; // premium şerit yalnız sahiplere sayılır
  }
  return n;
}

// ---- Özel güçler — Seviye Yolu'ndan kazanılan TEK KULLANIMLIK tüketilebilirler.
// Elmasla satılmaz; kullanılmadıkça envanterde birikir (sunucudaki LEVEL_POWERS
// ve powers kataloglarıyla birebir aynı kimlikler/seviyeler).
export type PowerId = 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken';
export const POWERS: Record<PowerId, {
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
  kind: BtnKind;
  badgeIcon: ComponentProps<typeof Ionicons>['name'];
  nameKey: MessageKey;
  descKey: MessageKey;
  confirmKey: MessageKey;
}> = {
  xp2x: { icon: 'flash', color: theme.gold, kind: 'accent', badgeIcon: 'refresh', nameKey: 'power.xp2xName', descKey: 'power.xp2xDesc', confirmKey: 'power.confirmXp2x' },
  shield: { icon: 'shield', color: theme.blue, kind: 'blue', badgeIcon: 'refresh', nameKey: 'power.shieldName', descKey: 'power.shieldDesc', confirmKey: 'power.confirmShield' },
  streak: { icon: 'flame', color: theme.primary, kind: 'primary', badgeIcon: 'refresh', nameKey: 'power.streakName', descKey: 'power.streakDesc', confirmKey: 'power.confirmStreak' },
  training: { icon: 'barbell', color: theme.purple, kind: 'purple', badgeIcon: 'barbell', nameKey: 'power.trainingName', descKey: 'power.trainingDesc', confirmKey: 'power.confirmTraining' },
  socialtoken: { icon: 'people', color: theme.flame, kind: 'flame', badgeIcon: 'people', nameKey: 'power.socialtokenName', descKey: 'power.socialtokenDesc', confirmKey: 'power.confirmSocialtoken' },
};
export const LEVEL_POWER_UNLOCKS: Record<number, PowerId> = {
  5: 'xp2x',
  15: 'shield',
  25: 'streak',
  35: 'training',
  45: 'socialtoken',
};

// ---- PREMIUM Seviye Yolu (sunucudaki PREMIUM_* sabitleriyle birebir) ----
// 2000 elmasla (ya da ₺350 IAP ile) açılır; her ×5 seviyesinde EKSTRA güç + daha dolgun elmas.
// Dağıtım: her güç şeritte TAM 2 kez + ücretsiz şeritle ORTAK seviyelerde
// (5/15/25/35/45) asla aynı güç değil (aynı satırda iki kart hiç aynı olmaz).
export const PREMIUM_ROAD_PRICE = 2000;
export const PREMIUM_LEVEL_POWERS: Record<number, PowerId> = {
  5: 'shield', 10: 'streak', 15: 'xp2x', 20: 'socialtoken', 25: 'training',
  30: 'shield', 35: 'socialtoken', 40: 'xp2x', 45: 'streak', 50: 'training',
};
// Mağaza güç fiyatları (sunucudaki POWER_PRICES ile birebir)
export const POWER_PRICES: Record<PowerId, number> = { xp2x: 150, shield: 250, streak: 300, training: 250, socialtoken: 350 };

export function premiumRewardGems(n: number): number {
  if (n % 5 !== 0) return 0;
  if (n === LEVEL_CAP) return 400;
  return n % 10 === 0 ? 300 : 200;
}

// Güç rozetleri — özellik.jpeg'ten birebir kesilmiş gerçek sanatlar (altın 2x
// jetonu / mavi kupa kalkanı). Çizim yok: görselin kendisi, şekli bozulmadan.
const POWER_ART: Partial<Record<PowerId, number>> = {
  xp2x: require('../assets/power-xp2x.png'),
  shield: require('../assets/power-shield.png'),
  streak: require('../assets/power-streak.png'), // seri.jpeg'ten birebir
  training: require('../assets/power-training.png'), // özellik2.jpeg'ten birebir
  socialtoken: require('../assets/power-socialtoken.png'), // özellik2.jpeg'ten birebir
};
export function PowerArt({ powerId, size, locked, well = false }: { powerId: PowerId; size: number; locked?: boolean; well?: boolean }) {
  const art = POWER_ART[powerId];
  // well: FrameArt ile aynı yuva dili — theme.well plaka + üstte 2px iç gölge
  // şeridi, sanat 8px içeride (yol/popup şeritlerinde çerçevelerle aynı oturma).
  const inner = size - (well ? 8 : 0);
  if (art != null) {
    return (
      <View style={{
        width: size, height: size, alignItems: 'center', justifyContent: 'center',
        ...(well ? { backgroundColor: theme.well, borderRadius: size * 0.28, overflow: 'hidden' } : {}),
      }}>
        {well ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} /> : null}
        <Image source={art} style={{ width: inner, height: inner, opacity: locked ? 0.45 : 1 }} resizeMode="contain" />
      </View>
    );
  }
  // Görseli olmayan güç (streak): alev madalyonu — koyu plaka, alev halkası,
  // sağ altta geri-sarma mini rozeti. Özel sanat gelince POWER_ART'a eklenir.
  const meta = POWERS[powerId];
  const c = locked ? theme.muted : meta.color;
  const medallion = (
    <View style={{
      width: inner, height: inner, borderRadius: inner / 2,
      backgroundColor: darken(theme.card, 0.35),
      borderWidth: Math.max(2, inner * 0.045), borderColor: withAlpha(c, locked ? 0.4 : 0.85),
      alignItems: 'center', justifyContent: 'center',
    }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: inner * 0.82, height: inner * 0.82, borderRadius: inner * 0.41, backgroundColor: withAlpha(c, locked ? 0.07 : 0.18) }} />
      <View style={{ opacity: locked ? 0.55 : 1 }}>
        <Ionicons name={meta.icon} size={Math.round(inner * 0.48)} color={c} />
      </View>
      <View style={{ position: 'absolute', right: -inner * 0.02, bottom: -inner * 0.02, width: inner * 0.34, height: inner * 0.34, borderRadius: inner * 0.17, backgroundColor: locked ? theme.border : meta.color, borderWidth: 1.5, borderColor: darken(theme.card, 0.45), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={meta.badgeIcon} size={Math.round(inner * 0.2)} color={theme.ink} />
      </View>
    </View>
  );
  if (!well) return medallion;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.well, borderRadius: size * 0.28, overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} />
      {medallion}
    </View>
  );
}

// Bir seviyenin toplanabilir elmas ödülü — sunucudaki levelRewardDiamonds ile
// birebir: yalnız 5'in katları (güç 50 / çerçeve 100), arası 0.
export function levelRewardGems(n: number): number {
  if (n % 5 !== 0) return 0;
  return n % 10 === 0 ? 100 : 50;
}

// (ARTIK KULLANILMIYOR: ifadeler Seviye Yolu'ndan kazanılmaz, yalnız mağazadan
// satılır. Tarihsel referans olarak duruyor — yol/popup bu haritayı okumaz.)
export const LEVEL_EMOTE_UNLOCKS: Record<number, string> = {
  5: 'footballer', 15: 'kick', 25: 'squad', 35: 'pitch', 45: 'euro2024',
};

// ---- Çerçeve sanatları (çerçeve.jpeg'ten, ışıltıları birebir korunarak) ----
export { FRAME_ART } from './frames';

// Çerçeve görseli — kilitliyse soluk + kilit rozetli ("henüz açılmadı" hali).
// well: küçük boyutlarda koyu zeminde kaybolmasın diye yuvarlatılmış yuva zemini.
export function FrameArt({ tierKey, size, locked = false, well = false }: { tierKey: string; size: number; locked?: boolean; well?: boolean }) {
  const src = FRAME_ART_MAP[tierKey];
  if (!src) return null;
  const art = size - (well ? 8 : 0);
  return (
    <View style={{
      width: size, height: size, alignItems: 'center', justifyContent: 'center',
      ...(well ? { backgroundColor: theme.well, borderRadius: size * 0.28, overflow: 'hidden' } : {}),
    }}>
      {well ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.4 }} /> : null}
      <Image source={src} style={{ width: art, height: art, opacity: locked ? 0.32 : 1 }} resizeMode="contain" />
      {locked ? (
        // absoluteFill + iç ortalama: rozet her platformda halkanın TAM merkezinde
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: Math.max(20, size * 0.3), height: Math.max(20, size * 0.3), borderRadius: Math.max(10, size * 0.15), backgroundColor: withAlpha(theme.panelInk, 0.88), borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="lock-closed" size={Math.max(11, size * 0.15)} color={theme.muted} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Dokununca açılan büyük çerçeve önizlemesi — kademe adı + açılma durumu.
// onEquip verilirse (profil Çerçeveler şeridi) KULLAN/KALDIR butonu da çizilir.
export function FramePreviewModal({ tier, unlocked, visible, onClose, equipped, onEquip }: {
  tier: LevelTier | null; unlocked: boolean; visible: boolean; onClose: () => void;
  equipped?: boolean; onEquip?: (frameId: string | null) => void;
}) {
  if (!visible || !tier) return null;
  const big = Math.min(SCREEN_W * 0.8, 330);
  return (
    <SafeModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }]} onPress={onClose}>
        <FrameArt tierKey={tier.key} size={big} locked={!unlocked} />
        <Text style={{ color: tier.c, fontSize: 24, fontFamily: 'Poppins-Black', letterSpacing: 1.2, marginTop: 6, ...engrave('lg') }}>
          {t(tier.nameKey).toLocaleUpperCase(currentLang())}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: unlocked ? withAlpha(theme.primary, 0.16) : theme.panelInnerFill, borderRadius: 999, borderWidth: 1.5, borderColor: unlocked ? theme.primary : theme.border, paddingHorizontal: 14, paddingVertical: 6 }}>
          <Ionicons name={unlocked ? 'checkmark-circle' : 'lock-closed'} size={15} color={unlocked ? theme.primary : theme.muted} />
          <Text style={{ color: unlocked ? theme.primary : theme.muted, fontSize: 12.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>
            {unlocked ? t('level.frameOwned') : t('level.frameLockedAt', { n: String(tier.min) })}
          </Text>
        </View>
        {unlocked && onEquip ? (
          <View style={{ marginTop: 18, width: Math.min(SCREEN_W * 0.6, 240) }}>
            <Btn
              big
              kind={equipped ? 'ghost' : 'primary'}
              icon={equipped ? 'close-circle' : 'checkmark-circle'}
              label={(equipped ? t('collection.remove') : t('collection.use')).toLocaleUpperCase(currentLang())}
              onPress={() => onEquip(equipped ? null : tier.key)}
            />
          </View>
        ) : null}
        <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', marginTop: 16 }}>{t('common.close')}</Text>
      </Pressable>
    </SafeModal>
  );
}

// ---- FrameUnlockCelebration — çerçeve/İFADE açılışı: efsanevi kutlama ----
// Clash Royale sandık açılışı duygusu: karanlık sahne → büyüyen ışıma →
// beyaz parlama → ödül yaylanarak iner; şok halkası + kıvılcım patlaması,
// arkada ağır dönen ışık huzmeleri; ödülün adı damgalanır.
// Değeri YALNIZ bir kez üretir — useRef(new X()) kalıbının aksine initializer her
// render'da yeniden çalışıp çöp üretmez (kutlamada ~60 Animated.Value + config sabit kalır).
function useConst<T>(init: () => T): T {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = init();
  return ref.current;
}

export function FrameUnlockCelebration({ tierKey, emoteId, powerId, onDone }: { tierKey?: string | null; emoteId?: string | null; powerId?: PowerId | null; onDone: () => void }) {
  // Güç meta'sı — bilinmeyen powerId (callsite'taki `as PowerId` cast'i tip güvenliğini
  // deler) POWERS'ta yoksa undefined kalır; böylece isPower false olur ve kademe dalı
  // gibi çökmeden (POWERS[powerId].color TypeError'ı olmadan) sessizce ele alınır.
  const powerMeta = powerId ? POWERS[powerId] : undefined;
  const isEmote = !tierKey && Boolean(emoteId);
  const isPower = !tierKey && !emoteId && Boolean(powerMeta);
  const tier = LEVEL_TIERS.find((tr) => tr.key === tierKey) ?? LEVEL_TIERS[0]!;
  const glowColor = powerMeta ? powerMeta.color : isEmote ? theme.accent : tier.c;
  const accent = lighten(glowColor, 0.4);
  // Soğuk kademeler (gümüş/elmas) → kristal kıymık parçacıklar; sıcaklar → köz.
  const isShard = tierKey === 'silver' || tierKey === 'diamond';
  const big = Math.min(SCREEN_W * 0.72, 300);
  const uid = isEmote ? `e-${emoteId}` : isPower ? `p-${powerId}` : `f-${tier.key}`;

  // ---- tek seferlik giriş (useConst: initializer yalnız BİR kez çalışır) ----
  const glow = useConst(() => new Animated.Value(0));    // sahneyi ısıtan ışıma
  const flash = useConst(() => new Animated.Value(0));   // patlama anı beyazı
  const frameIn = useConst(() => new Animated.Value(0)); // çerçeve girişi
  const ringFx = useConst(() => new Animated.Value(0));  // şok halkası
  const titleIn = useConst(() => new Animated.Value(0));
  const btnIn = useConst(() => new Animated.Value(0));
  const [btnReady, setBtnReady] = useState(false); // görünmeden tıklanamasın
  const sparks = useConst(() => Array.from({ length: 14 }, () => new Animated.Value(0)));
  const sparkDirs = useConst(() => Array.from({ length: 14 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 14 + (i % 2 ? 0.24 : 0);
    const r = 118 + (i % 3) * 40;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }));

  // ---- sürekli ambient ----
  const spinA = useConst(() => new Animated.Value(0));   // huzme dönüşü (yavaş)
  const spinB = useConst(() => new Animated.Value(0));   // yörünge halkası 1
  const spinC = useConst(() => new Animated.Value(0));   // yörünge halkası 2 (ters)
  const pulse = useConst(() => new Animated.Value(0));   // ışıma nefesi
  const bob = useConst(() => new Animated.Value(0));     // madalyon süzülüşü
  const N = 22; // ambient parçacık (köz / kristal)
  const parts = useConst(() => Array.from({ length: N }, () => new Animated.Value(0)));
  const partCfg = useConst(() => Array.from({ length: N }, () => {
    const ang = Math.random() * Math.PI * 2;
    const rad = 55 + Math.random() * 155;
    return {
      x0: Math.cos(ang) * rad, y0: Math.sin(ang) * rad * 0.92,
      dur: 2800 + Math.random() * 3200, delay: Math.random() * 3400,
      size: 3 + Math.random() * 5.5, rise: -(45 + Math.random() * 155),
      drift: (Math.random() - 0.5) * 90, white: Math.random() < 0.42,
      rot: `${Math.round(Math.random() * 360)}deg`,
    };
  }));
  const TW = 12; // ışıltı (parlayıp sönen)
  const tw = useConst(() => Array.from({ length: TW }, () => new Animated.Value(0)));
  const twCfg = useConst(() => Array.from({ length: TW }, () => {
    const ang = Math.random() * Math.PI * 2; const rad = 85 + Math.random() * 195;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.96, dur: 620 + Math.random() * 900, delay: Math.random() * 2600, size: 2 + Math.random() * 3 };
  }));

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    const run = (a: Animated.CompositeAnimation) => { loops.push(a); a.start(); };
    run(Animated.loop(Animated.timing(spinA, { toValue: 1, duration: 17000, easing: Easing.linear, useNativeDriver: true })));
    run(Animated.loop(Animated.timing(spinB, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })));
    run(Animated.loop(Animated.timing(spinC, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true })));
    run(Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])));
    run(Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])));
    parts.forEach((p, i) => run(Animated.sequence([
      Animated.delay(partCfg[i]!.delay),
      Animated.loop(Animated.timing(p, { toValue: 1, duration: partCfg[i]!.dur, easing: Easing.linear, useNativeDriver: true })),
    ])));
    tw.forEach((s, i) => run(Animated.sequence([
      Animated.delay(twCfg[i]!.delay),
      Animated.loop(Animated.sequence([
        Animated.timing(s, { toValue: 1, duration: twCfg[i]!.dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(s, { toValue: 0, duration: twCfg[i]!.dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
    ])));
    // giriş patlaması
    Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 560, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(ringFx, { toValue: 1, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(frameIn, { toValue: 1, friction: 5, tension: 44, useNativeDriver: true }),
        ...sparks.map((s, i) => Animated.sequence([
          Animated.delay(30 + (i % 4) * 40),
          Animated.timing(s, { toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ])),
      ]),
    ]).start();
    // flaş — TEK deterministik zincir (yükselir → tamamen söner, takılmaz)
    Animated.sequence([
      Animated.delay(540),
      Animated.timing(flash, { toValue: 0.6, duration: 80, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    Animated.sequence([Animated.delay(840), Animated.spring(titleIn, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true })]).start();
    const btnTimer = setTimeout(() => {
      setBtnReady(true);
      Animated.timing(btnIn, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    }, 1500);
    return () => { clearTimeout(btnTimer); loops.forEach((l) => l.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotA = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotB = spinB.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotC = spinC.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const ringSize = big * 1.55;

  return (
    <SafeModal visible transparent animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3,5,12,0.985)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>
        {/* kademe renkli geniş ambient yıkama (girişte belirir) — ekran köşegenine
            yakın boyut yeter (perf: aşırı büyük translucent yüzey overdraw yükü) */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: glow }}>
          <Svg width={SCREEN_W * 1.42} height={SCREEN_W * 1.42}>
            <Defs>
              <RadialGradient id={`wash-${uid}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={glowColor} stopOpacity={0.24} />
                <Stop offset="42%" stopColor={glowColor} stopOpacity={0.09} />
                <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={SCREEN_W * 0.71} cy={SCREEN_W * 0.71} r={SCREEN_W * 0.71} fill={`url(#wash-${uid})`} />
          </Svg>
        </Animated.View>

        {/* ağır dönen ışık huzmeleri (goat mockup'ındaki çapraz altın çizgiler).
            Dönen ama İÇERİĞİ SABİT katman: donanım dokusuna rasterize et → dönüş
            önbelleğe alınmış tek dokuyu çevirir, her kare yeniden çizim yok. */}
        <Animated.View pointerEvents="none" shouldRasterizeIOS renderToHardwareTextureAndroid style={{ position: 'absolute', opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }), transform: [{ rotate: rotA }] }}>
          <Svg width={SCREEN_W * 1.45} height={SCREEN_W * 1.45} viewBox="-100 -100 200 200">
            <Defs>
              <SvgGradient id={`ray-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={accent} stopOpacity={0} />
                <Stop offset="0.5" stopColor={accent} stopOpacity={0.5} />
                <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
              </SvgGradient>
            </Defs>
            {Array.from({ length: 12 }, (_, i) => (
              <Polygon key={i} points="0,0 -3.2,-115 3.2,-115" fill={i % 3 === 0 ? `url(#ray-${uid})` : glowColor} opacity={i % 3 === 0 ? 0.9 : i % 2 ? 0.06 : 0.12} transform={`rotate(${i * 30})`} />
            ))}
          </Svg>
        </Animated.View>

        {/* yörünge enerji halkaları — kesikli yaylar döner (elmas mockup'ındaki girdap) */}
        <Animated.View pointerEvents="none" shouldRasterizeIOS renderToHardwareTextureAndroid style={{ position: 'absolute', opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }), transform: [{ rotate: rotB }, { scaleY: 0.82 }] }}>
          <Svg width={ringSize} height={ringSize}>
            <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringSize / 2 - 6} fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round" strokeDasharray="120 210" opacity={0.85} />
            <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringSize / 2 - 22} fill="none" stroke={glowColor} strokeWidth={2} strokeLinecap="round" strokeDasharray="60 260" opacity={0.6} />
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" shouldRasterizeIOS renderToHardwareTextureAndroid style={{ position: 'absolute', opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }), transform: [{ rotate: rotC }, { scaleY: 0.82 }] }}>
          <Svg width={ringSize * 0.78} height={ringSize * 0.78}>
            <Circle cx={ringSize * 0.39} cy={ringSize * 0.39} r={ringSize * 0.39 - 5} fill="none" stroke={lighten(glowColor, 0.2)} strokeWidth={2.4} strokeLinecap="round" strokeDasharray="90 190" opacity={0.8} />
          </Svg>
        </Animated.View>

        {/* merkez ışıma — nabız gibi nefes alır */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: Animated.multiply(glow, pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] })), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.12] }) }] }}>
          <Svg width={400} height={400}>
            <Defs>
              <RadialGradient id={`core-${uid}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={glowColor} stopOpacity={0.6} />
                <Stop offset="55%" stopColor={glowColor} stopOpacity={0.2} />
                <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={200} cy={200} r={200} fill={`url(#core-${uid})`} />
          </Svg>
        </Animated.View>

        {/* ambient parçacıklar — sürekli süzülüp sönerek yükselen köz / kristal */}
        {parts.map((p, i) => {
          const c = partCfg[i]!;
          return (
            <Animated.View key={`pt${i}`} pointerEvents="none" style={{
              position: 'absolute',
              width: c.size, height: c.size,
              borderRadius: isShard ? 1.5 : c.size,
              backgroundColor: c.white ? '#FFFFFF' : accent,
              opacity: Animated.multiply(glow, p.interpolate({ inputRange: [0, 0.14, 0.7, 1], outputRange: [0, 1, 0.85, 0] })),
              transform: [
                { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [c.x0, c.x0 + c.drift] }) },
                { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [c.y0, c.y0 + c.rise] }) },
                { scale: p.interpolate({ inputRange: [0, 0.16, 1], outputRange: [0.3, 1, 0.35] }) },
                { rotate: c.rot },
              ],
            }} />
          );
        })}

        {/* ışıltılar — sabit dağınık noktalar parlayıp söner */}
        {tw.map((s, i) => {
          const c = twCfg[i]!;
          return (
            <Animated.View key={`tw${i}`} pointerEvents="none" style={{
              position: 'absolute', left: '50%', top: '50%',
              width: c.size, height: c.size, borderRadius: c.size, marginLeft: c.x - c.size / 2, marginTop: c.y - c.size / 2,
              backgroundColor: '#FFFFFF',
              opacity: Animated.multiply(glow, s),
              transform: [{ scale: s.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) }],
            }} />
          );
        })}

        {/* şok halkası (giriş) */}
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', width: big, height: big, borderRadius: big / 2,
          borderWidth: 3, borderColor: lighten(glowColor, 0.35),
          opacity: ringFx.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
          transform: [{ scale: ringFx.interpolate({ inputRange: [0, 1], outputRange: [0.35, 2.1] }) }],
        }} />

        {/* kıvılcım patlaması (giriş) */}
        {sparks.map((s, i) => (
          <Animated.View key={`sp${i}`} pointerEvents="none" style={{
            position: 'absolute', width: i % 3 ? 7 : 10, height: i % 3 ? 7 : 10, borderRadius: 6,
            backgroundColor: i % 2 ? '#FFFFFF' : lighten(glowColor, 0.25),
            opacity: s.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 0.9, 0] }),
            transform: [
              { translateX: s.interpolate({ inputRange: [0, 1], outputRange: [0, sparkDirs[i]!.x] }) },
              { translateY: s.interpolate({ inputRange: [0, 1], outputRange: [0, sparkDirs[i]!.y] }) },
              { scale: s.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.3, 1.15, 0.4] }) },
            ],
          }} />
        ))}

        {/* çerçeve/madalyon — yaylanarak iner, sonra hafifçe süzülür */}
        <Animated.View style={{
          opacity: frameIn,
          transform: [
            { scale: frameIn.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] }) },
            { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [7, -9] }) },
          ],
        }}>
          {isPower && powerId ? (
            <PowerArt powerId={powerId} size={Math.round(big * 0.66)} />
          ) : isEmote && emoteId ? (
            <EmoteSticker id={emoteId} size={Math.round(big * 0.78)} play />
          ) : (
            <FrameArt tierKey={tier.key} size={big} />
          )}
        </Animated.View>

        {/* patlama beyazı — en üstte */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) }]} />

        {/* kademe adı damgası + ayraç */}
        <Animated.View style={{
          position: 'absolute', bottom: '19%', left: 0, right: 0, alignItems: 'center',
          opacity: titleIn, transform: [{ scale: titleIn.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }],
        }}>
          <Text style={{ color: glowColor, fontSize: isEmote || isPower ? 26 : 32, fontFamily: 'Poppins-Black', letterSpacing: 1.8, ...engrave('lg') }}>
            {(powerMeta ? t(powerMeta.nameKey) : isEmote ? t('level.exclusiveEmote') : t(tier.nameKey)).toLocaleUpperCase(currentLang())}
          </Text>
          <Text style={{ color: theme.text, fontSize: 15.5, fontFamily: 'Poppins-ExtraBold', marginTop: 2, letterSpacing: 3.4, ...engrave('sm') }}>
            {isPower ? t('power.celebUnlocked') : isEmote ? t('level.emoteCelebUnlocked') : t('level.frameCelebUnlocked')}
          </Text>
          {/* ince ayraç — çizgi · kademe elması · çizgi (mockup'taki gibi) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 }}>
            <View style={{ width: 46, height: 2, borderRadius: 1, backgroundColor: withAlpha(glowColor, 0.55) }} />
            <View style={{ width: 12, height: 12, backgroundColor: glowColor, transform: [{ rotate: '45deg' }], borderRadius: 2, shadowColor: glowColor, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }} />
            <View style={{ width: 46, height: 2, borderRadius: 1, backgroundColor: withAlpha(glowColor, 0.55) }} />
          </View>
        </Animated.View>

        {/* devam — zamanı gelince render edilir (görünmez buton tık yemesin) */}
        {btnReady ? (
          <Animated.View style={{ position: 'absolute', bottom: 60, left: 40, right: 40, opacity: btnIn }}>
            <Btn big kind="primary" label={t('common.continue')} onPress={onDone} />
          </Animated.View>
        ) : null}
      </View>
    </SafeModal>
  );
}

// Seviye rozeti — kademe renkli çift halka içinde kazınmış numara.
// 10+ seviyelerde halka kademe rengini alır; GOAT hafif ışıma taşır.
export function LevelBadge({ level, size = 24 }: { level: number; size?: number }) {
  const tier = levelTier(level);
  const ring = tier?.c ?? theme.border;
  const fs = Math.max(9, size * 0.44);
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: theme.panelInk,
      borderWidth: Math.max(1.5, size * 0.09), borderColor: ring,
      alignItems: 'center', justifyContent: 'center',
      ...(tier?.key === 'goat' ? { shadowColor: theme.flame, shadowOpacity: 0.8, shadowRadius: size * 0.3, shadowOffset: { width: 0, height: 0 }, elevation: 6 } : {}),
    }}>
      <Text style={{ color: tier ? tier.c : theme.text, fontSize: fs, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{level}</Text>
    </View>
  );
}

// İnce XP çubuğu — mevcut seviye içindeki ilerleme.
function XpBar({ xp, level, height = 8, color }: { xp: number; level: number; height?: number; color?: string }) {
  const need = xpForNextLevel(level);
  const pct = level >= LEVEL_CAP ? 1 : Math.max(0, Math.min(1, xp / need));
  const c = color ?? levelTier(level)?.c ?? theme.primary;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: theme.navyWell, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', borderRadius: height / 2, backgroundColor: c }} />
    </View>
  );
}

// ---- Seviye atlama kutlaması — maç ÇIKIŞINDA, kupa popup'ından sonra ----
export function LevelUpPopup({ toLevel, diamonds, emoteIds, powerIds = [], hasReward = true, onClose, onGoToRoad }: {
  toLevel: number; diamonds: number; emoteIds: string[]; powerIds?: string[]; onClose: () => void;
  hasReward?: boolean; // bu atlayışta toplanacak ödül var mı (yalnız ×5 seviyeleri taşır)
  onGoToRoad?: () => void; // "Ödülü Topla" → Seviye Yolu'nu bu seviyede açar
}) {
  const a = useRef(new Animated.Value(0)).current;
  const badge = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(120),
      Animated.spring(badge, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [a, badge]);
  const tier = levelTier(toLevel);
  const frameJustUnlocked = toLevel % 10 === 0 && tier;
  const accent = tier?.c ?? theme.primary;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 70, backgroundColor: theme.scrim, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, opacity: a }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={{ width: '100%', maxWidth: 330, backgroundColor: theme.panelInk, borderRadius: 26, padding: 2, borderWidth: 2, borderColor: accent, borderBottomColor: darken(accent, 0.35), shadowColor: accent, shadowOpacity: 0.55, shadowRadius: 26, shadowOffset: { width: 0, height: 0 }, elevation: 20 }}>
        <View style={{ backgroundColor: theme.card, borderRadius: 22, alignItems: 'center', paddingVertical: 22, paddingHorizontal: 18, overflow: 'hidden' }}>
          {/* ışın patlaması — RN bir view'ı KENDİ merkezinden döndürür: ışının orta
              noktası (top + 65) rozet merkeziyle (22 pad + 43 yarı-rozet = 65)
              çakışmalı → top: 0. Eski top: 62 tüm patlamayı ~62px aşağı, 'LEVEL
              UP' başlığının içine kaydırıyordu. */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={{ position: 'absolute', left: '50%', top: 0, width: 3, height: 130, marginLeft: -1.5, backgroundColor: withAlpha(accent, 0.14), transform: [{ rotate: `${i * 45}deg` }] }} />
            ))}
          </View>
          <Animated.View style={{ transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }}>
            <LevelBadge level={toLevel} size={86} />
          </Animated.View>
          <Text style={{ color: theme.text, fontSize: 21, fontFamily: 'Poppins-Black', letterSpacing: 0.6, marginTop: 12, ...engrave('lg') }}>{t('level.levelUp')}</Text>
          <Text style={{ color: accent, fontSize: 14, fontFamily: 'Poppins-ExtraBold', marginTop: 2, ...engrave('sm') }}>{t('level.reached', { n: String(toLevel) })}</Text>

          {/* ödüller — elmas çipi yalnız gerçekten elmas varsa (ara seviyeler ödülsüz) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {diamonds > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.panelInnerFill, borderRadius: 999, borderWidth: 1.5, borderColor: theme.gem, paddingHorizontal: 13, paddingVertical: 6 }}>
                <GemIcon size={16} />
                <Text style={{ color: theme.gemText, fontSize: 14, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>+{diamonds}</Text>
              </View>
            ) : null}
            {emoteIds.map((id) => (
              <View key={id} style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: theme.panelInnerFill, borderWidth: 1.5, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <EmoteSticker id={id} size={36} play={false} />
              </View>
            ))}
            {powerIds.map((id) => (
              <PowerArt key={id} powerId={id as PowerId} size={46} well />
            ))}
          </View>
          {emoteIds.length > 0 ? (
            <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', marginTop: 6 }}>{t('level.emoteUnlocked')}</Text>
          ) : null}
          {frameJustUnlocked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, backgroundColor: withAlpha(accent, 0.14), borderRadius: 999, borderWidth: 1.5, borderColor: accent, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Ionicons name="shield-checkmark" size={14} color={accent} />
              <Text style={{ color: accent, fontSize: 12, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('level.frameUnlocked', { name: t(tier!.nameKey) })}</Text>
            </View>
          ) : null}

          {/* ödüller toplamalı: yalnız bu atlayışta ödül VARSA yola çağır */}
          {hasReward ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
              <Ionicons name="gift" size={13} color={theme.accent} />
              <Text style={{ color: theme.accent, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('level.claimHint')}</Text>
            </View>
          ) : null}

          <View style={{ alignSelf: 'stretch', marginTop: 16, gap: 8 }}>
            {hasReward && onGoToRoad ? (
              <>
                <Btn big kind="accent" label={t('level.claim')} onPress={onGoToRoad} />
                <Btn kind="ghost" label={t('common.continue')} onPress={onClose} />
              </>
            ) : (
              <Btn big kind="primary" label={t('common.continue')} onPress={onClose} />
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ---- Seviye Yolu — ortadan inen DOLAN kanal + sağlı-sollu ödül kartları ----
// Kanal, geçilen seviyelerde o bölümün KADEME rengiyle dolar; mevcut seviyenin
// segmenti XP oranınca kısmen dolar ve ucunda ışıyan bir kafa noktası taşır.
// Kartlar zikzak dizilir; 5'in katları ifade, 10'un katları çerçeve vitrinidir.
const ROAD_ROW_H = 92;
const ROAD_ROW_H_MILESTONE = 132; // 5'in katları: büyük ödül satırı
const ROAD_TRACK_W = 16;
const roadRowH = (n: number) => (n % 5 === 0 ? ROAD_ROW_H_MILESTONE : ROAD_ROW_H);
const roadRowTop = (n: number) => { let y = 0; for (let i = 1; i < n; i++) y += roadRowH(i); return y; };
// FlatList veri kaynağı — seviye numaraları 1..LEVEL_CAP, modül sabiti ki liste
// kimliği render'lar arasında değişmesin.
const ROAD_LEVELS: number[] = Array.from({ length: LEVEL_CAP }, (_, i) => i + 1);

function segmentColor(n: number): string {
  // n → n+1 segmentinin rengi: bulunduğu onluğun kademe rengi (ilk onluk zümrüt)
  return levelTier(Math.floor(n / 10) * 10)?.c ?? theme.primary;
}

// memo (2026-08-10): yol açıkken her kök dispatch'i ve claim/celeb/showTopBtn
// state değişimleri 50 satırı BİRDEN çiziyordu — tam da RoadClaimFly
// parçacıkları uçarken. Prop'lar ilkel + 3 SABİT callback (LevelRoadModal
// useCallback'leri); sığ karşılaştırma yalnız gerçekten değişen satırı çizer.
const RoadRow = memo(function RoadRow({ n, level, xp, claimed, premiumOwned, premiumClaimed, onFramePress, onClaim, onBuyPremium }: {
  n: number; level: number; xp: number;
  claimed: boolean; // bu seviyenin ödülü toplandı mı
  premiumOwned: boolean;   // Premium Yol açık mı
  premiumClaimed: boolean; // premium şeridin bu seviyesi toplandı mı
  onFramePress?: (tier: LevelTier, unlocked: boolean) => void;
  onClaim?: (n: number, pos: { x: number; y: number }, track?: 'free' | 'premium') => void;
  onBuyPremium?: () => void; // kilitli premium karta dokunuldu → satın alma
}) {
  const done = n < level;
  const current = n === level;
  const reached = n <= level;
  const claimable = reached && n % 5 === 0 && !claimed; // ödül YALNIZ 5'in katlarında
  const tier = levelTier(n);
  const isFrame = n % 10 === 0;
  const powerId = LEVEL_POWER_UNLOCKS[n];
  const milestone = n % 5 === 0; // tüm ödül seviyeleri büyük karttır (güç ya da çerçeve)
  const segAbove = segmentColor(n - 1);
  const segBelow = segmentColor(n);
  const nodeColor = done || current ? (tier?.c ?? segmentColor(n)) : theme.border;
  const left = n % 2 === 1; // tek seviyeler solda, çiftler sağda
  const fillPct = current && level < LEVEL_CAP ? Math.max(0, Math.min(1, xp / xpForNextLevel(level))) : 0;

  // kilometre taşı vurgu rengi: çerçevede kademe rengi, güçte gücün rengi, ifadede amber
  const mColor = isFrame ? (tier?.c ?? theme.accent) : powerId ? POWERS[powerId].color : theme.accent;
  const gems = levelRewardGems(n);
  const gemChip = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: theme.panelInnerFill, borderRadius: 999, borderWidth: 1, borderColor: withAlpha(theme.gem, 0.5), paddingHorizontal: 7, paddingVertical: 3 }}>
      <GemIcon size={11} />
      <Text style={{ color: theme.gemText, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>+{gems}</Text>
    </View>
  );
  const card = milestone ? (
    // BÜYÜK ÖDÜL kartı: kilitliyken canlı önizleme, TOPLANABİLİRKEN parlak ve
    // renkli (dokun → topla), toplanınca yeşil AÇILDI
    <View style={{
      flex: 1,
      backgroundColor: claimable ? lighten(theme.card, 0.06) : theme.card,
      borderRadius: 17,
      borderWidth: claimable ? 3 : 2.5,
      borderColor: claimable ? lighten(mColor, 0.12) : current ? mColor : claimed ? withAlpha(theme.primary, 0.7) : withAlpha(mColor, 0.55),
      paddingVertical: 10, paddingHorizontal: 12,
      opacity: reached ? 1 : 0.88,
      shadowColor: claimable ? mColor : mColor,
      shadowOpacity: claimable ? 0.8 : current ? 0.55 : 0.22,
      shadowRadius: claimable ? 15 : current ? 12 : 8,
      shadowOffset: { width: 0, height: 0 }, elevation: claimable ? 10 : current ? 8 : 4,
    }}>
      {/* yüzen bandrol — toplanabilirken DOLU renkli 'ÖDÜLÜ TOPLA' */}
      <View style={{
        position: 'absolute', top: -10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: claimable ? mColor : claimed ? darken(theme.primary, 0.55) : darken(mColor, 0.55),
        borderRadius: 999, borderWidth: 1.5,
        borderColor: claimable ? lighten(mColor, 0.35) : claimed ? theme.primary : mColor,
        paddingHorizontal: 7, paddingVertical: 2.5,
        ...(claimable ? { shadowColor: mColor, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 12 } : {}),
      }}>
        <Ionicons name={claimable ? 'gift' : claimed ? 'checkmark-circle' : 'star'} size={9} color={claimable ? theme.ink : claimed ? theme.primary : lighten(mColor, 0.2)} />
        <Text style={{ color: claimable ? theme.ink : claimed ? theme.primary : lighten(mColor, 0.25), fontSize: 8.5, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.5 }}>
          {(claimable ? t('level.claim') : claimed ? t('level.frameOwned') : t('level.bigReward')).toLocaleUpperCase(currentLang())}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ color: done ? theme.muted : theme.text, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.4, ...engrave('sm') }}>
        {t('level.levelN', { n: String(n) }).toLocaleUpperCase(currentLang())}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 }}>
        {isFrame && tier ? (
          <Pressable onPress={() => onFramePress?.(tier, claimed)} hitSlop={6} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
            <FrameArt tierKey={tier.key} size={54} locked={!claimed} well />
          </Pressable>
        ) : powerId ? (
          <View>
            <PowerArt powerId={powerId} size={54} locked={!claimed && !claimable} well />
            {!claimed && !claimable ? (
              <View style={{ position: 'absolute', right: -5, bottom: -5, width: 19, height: 19, borderRadius: 10, backgroundColor: theme.panelInk, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="lock-closed" size={10} color={theme.muted} />
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={2} style={{ color: claimed ? theme.muted : claimable ? lighten(mColor, 0.15) : mColor, fontSize: 10.5, lineHeight: 14, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.3, ...engrave('sm') }}>
            {(isFrame && tier
              ? t('level.tierFrameName', { name: t(tier.nameKey) })
              : powerId
                ? t(POWERS[powerId].nameKey)
                : '').toLocaleUpperCase(currentLang())}
          </Text>
          {gemChip}
        </View>
      </View>
    </View>
  ) : null; // Ödülsüz ara seviyede yan kutucuk YOK — numara zaten ortadaki düğümde yazıyor

  // toplanabilir kart dokunuşla ödülünü verir (dokunuş noktası uçuş başlangıcı)
  const pressableCard = claimable && onClaim ? (
    <Pressable
      style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
      onPress={(e) => onClaim(n, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }, 'free')}
    >
      {card}
    </Pressable>
  ) : card;

  // ---- PREMIUM şerit kartı — ücretsiz kartın KARŞI yakasında, görkemli:
  // altın çift çerçeve + koyu mor kadife zemin + PREMIUM bandrolü. Kilitliyken
  // loş + kilit (dokun → satın alma), açıkken TOPLA parlaması / AÇILDI.
  const pPower = PREMIUM_LEVEL_POWERS[n];
  const pGems = premiumRewardGems(n);
  const pClaimable = premiumOwned && reached && milestone && !premiumClaimed;
  const premiumCard = milestone ? (
    <Pressable
      style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
      onPress={(e) => {
        if (!premiumOwned) { onBuyPremium?.(); return; }
        if (pClaimable && onClaim) onClaim(n, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }, 'premium');
      }}
    >
      <View style={{
        flex: 1, backgroundColor: darken(theme.gold, 0.55), borderRadius: 18, padding: 2,
        ...(pClaimable ? { shadowColor: theme.gold, shadowOpacity: 0.85, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 10 } : {}),
      }}>
        <View style={{
          flex: 1, backgroundColor: '#241539', borderRadius: 16,
          borderWidth: 2, borderColor: premiumOwned ? (pClaimable ? lighten(theme.gold, 0.2) : withAlpha(theme.gold, 0.75)) : withAlpha(theme.gold, 0.35),
          paddingVertical: 7, paddingHorizontal: 9,
          opacity: premiumOwned || pClaimable ? 1 : 0.8,
        }}>
          {/* CO PASS bandrolü — kısaltılmış, dar kartta sağdaki durum bandrolüyle çakışmasın */}
          <View style={{
            position: 'absolute', top: -9, left: 8, flexDirection: 'row', alignItems: 'center', gap: 2,
            backgroundColor: theme.gold, borderRadius: 999, borderWidth: 1.5, borderColor: lighten(theme.gold, 0.4),
            paddingHorizontal: 5, paddingVertical: 1.5,
          }}>
            <Ionicons name="diamond" size={7} color={theme.ink} />
            <Text style={{ color: theme.ink, fontSize: 7, fontFamily: 'Poppins-Black', letterSpacing: 0.5 }}>{t('premium.ribbon')}</Text>
          </View>
          {/* durum bandrolü — toplanabilir/toplandı (kısa metin: TOPLA/AÇILDI) */}
          {premiumOwned && (pClaimable || premiumClaimed) ? (
            <View style={{
              position: 'absolute', top: -9, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2,
              backgroundColor: pClaimable ? theme.gold : darken(theme.primary, 0.55),
              borderRadius: 999, borderWidth: 1.5, borderColor: pClaimable ? lighten(theme.gold, 0.35) : theme.primary,
              paddingHorizontal: 5, paddingVertical: 2,
            }}>
              <Ionicons name={pClaimable ? 'gift' : 'checkmark-circle'} size={7} color={pClaimable ? theme.ink : theme.primary} />
              <Text style={{ color: pClaimable ? theme.ink : theme.primary, fontSize: 7, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.3 }}>
                {(pClaimable ? t('level.claimShort') : t('level.frameOwned')).toLocaleUpperCase(currentLang())}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
            {pPower ? (
              <View>
                <PowerArt powerId={pPower} size={40} locked={!premiumOwned} />
                {!premiumOwned ? (
                  <View style={{ position: 'absolute', right: -4, bottom: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.panelInk, borderWidth: 1.5, borderColor: withAlpha(theme.gold, 0.6), alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="lock-closed" size={8} color={theme.gold} />
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={2} style={{ color: premiumClaimed ? theme.muted : lighten(theme.gold, 0.15), fontSize: 9.5, lineHeight: 12, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.2, ...engrave('sm') }}>
                {(pPower ? t(POWERS[pPower].nameKey) : '').toLocaleUpperCase(currentLang())}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', backgroundColor: withAlpha(theme.gold, 0.12), borderRadius: 999, borderWidth: 1, borderColor: withAlpha(theme.gold, 0.5), paddingHorizontal: 6, paddingVertical: 2.5 }}>
                <GemIcon size={10} />
                <Text style={{ color: lighten(theme.gold, 0.2), fontSize: 9.5, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>+{pGems}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  ) : null;

  // düğümden karta uzanan bağ çizgisi
  const tie = (
    <View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: withAlpha(nodeColor, done || current ? 0.6 : 0.25) }} />
  );

  return (
    <View style={{ height: roadRowH(n), flexDirection: 'row', alignItems: 'center' }}>
      {/* SOL yuva — yalnız ödül (milestone) seviyelerinde kart gösterilir; ara
          seviyelerde boş kalır (numara ortadaki düğümde zaten yazıyor) */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
        {milestone ? (left ? pressableCard : premiumCard) : null}
        {milestone ? tie : null}
      </View>
      {/* ORTA kanal — beveled tüp + dolum + düğüm */}
      <View style={{ width: 52, alignItems: 'center', alignSelf: 'stretch' }}>
        <View style={{ flex: 1, width: ROAD_TRACK_W, backgroundColor: theme.panelInk, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: darken(theme.card, 0.35), overflow: 'hidden' }}>
          {/* Dolgu KESİKSİZ akar: parça uçları yuvarlatılmaz (radius 0), satır
              sınırında bir sonraki parçayla boşluksuz birleşir */}
          <View style={{ flex: 1, marginHorizontal: 2.5, backgroundColor: n === 1 ? 'transparent' : done || current ? segAbove : theme.navyWell }} />
        </View>
        <View style={{
          width: current ? 44 : milestone ? 38 : 32,
          height: current ? 44 : milestone ? 38 : 32,
          borderRadius: 22,
          backgroundColor: done ? nodeColor : theme.panelInk,
          borderWidth: current ? 3 : 2.5, borderColor: nodeColor,
          alignItems: 'center', justifyContent: 'center',
          ...(current ? { shadowColor: nodeColor, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 10 } : milestone && done ? { shadowColor: nodeColor, shadowOpacity: 0.5, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 5 } : {}),
        }}>
          {done ? (
            <Ionicons name="checkmark" size={milestone ? 19 : 16} color={theme.ink} />
          ) : (
            <Text style={{ color: current ? nodeColor : theme.muted, fontSize: current ? 16 : 12.5, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{n}</Text>
          )}
        </View>
        <View style={{ flex: 1, width: ROAD_TRACK_W, backgroundColor: theme.panelInk, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: darken(theme.card, 0.35), overflow: 'hidden' }}>
          <View style={{ flex: 1, marginHorizontal: 2.5, backgroundColor: n === LEVEL_CAP ? 'transparent' : done ? segBelow : theme.navyWell, overflow: 'hidden' }}>
            {current && fillPct > 0 ? (
              <>
                <View style={{ height: `${Math.round(fillPct * 100)}%`, backgroundColor: segBelow }} />
                <View style={{ position: 'absolute', top: `${Math.round(fillPct * 100)}%`, left: -1, right: -1, height: 7, marginTop: -3.5, borderRadius: 4, backgroundColor: lighten(segBelow, 0.45), shadowColor: segBelow, shadowOpacity: 1, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 8 }} />
              </>
            ) : null}
          </View>
        </View>
      </View>
      {/* SAĞ yuva — yalnız ödül (milestone) seviyelerinde kart gösterilir */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }}>
        {milestone ? tie : null}
        {milestone ? (!left ? pressableCard : premiumCard) : null}
      </View>
    </View>
  );
});

// Toplanan elmasların karttan başlıktaki elmas hapına akışı (modal içi, hafif).
function RoadClaimFly({ from, to, amount, onDone }: {
  from: { x: number; y: number }; to: { x: number; y: number }; amount: number; onDone: () => void;
}) {
  const count = Math.max(4, Math.min(8, Math.round(amount / 12)));
  const parts = useRef(
    Array.from({ length: 8 }, () => ({ x: new Animated.Value(0), y: new Animated.Value(0), s: new Animated.Value(0), o: new Animated.Value(0) })),
  ).current;
  useEffect(() => {
    let done = 0;
    for (let i = 0; i < count; i++) {
      const g = parts[i]!;
      g.x.setValue(from.x + (Math.random() - 0.5) * 46);
      g.y.setValue(from.y + (Math.random() - 0.5) * 30);
      g.s.setValue(0);
      g.o.setValue(0);
      setTimeout(() => {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(g.o, { toValue: 1, duration: 80, useNativeDriver: true }),
            Animated.spring(g.s, { toValue: 1, friction: 5, tension: 150, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.x, { toValue: to.x, duration: 460, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.y, { toValue: to.y, duration: 460, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(g.s, { toValue: 0.5, duration: 460, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(g.s, { toValue: 0.15, duration: 100, useNativeDriver: true }),
            Animated.timing(g.o, { toValue: 0, duration: 100, useNativeDriver: true }),
          ]),
        ]).start(() => { done += 1; if (done === count) onDone(); });
      }, 60 + i * 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 60 }]}>
      {parts.slice(0, count).map((g, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: -10, top: -10,
          shadowColor: theme.gem, shadowOpacity: 0.9, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 9,
          opacity: g.o,
          transform: [{ translateX: g.x }, { translateY: g.y }, { scale: g.s }],
        }}>
          <GemIcon size={20} />
        </Animated.View>
      ))}
    </View>
  );
}

// ---- Sezon geri sayımı — yol SEZONLUKTUR (her ay başa döner, Europe/Istanbul).
// Ay sonuna kalan süreyi canlı gösterir; dakikada bir tazelenir.
function msToSeasonEnd(): number {
  const IST_OFFSET = 3 * 3600_000; // Istanbul = UTC+3 (DST yok)
  const ist = new Date(Date.now() + IST_OFFSET);
  const nextMonthStartIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1);
  return nextMonthStartIst - IST_OFFSET - Date.now();
}

function SeasonCountdown() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(iv);
  }, []);
  const ms = Math.max(0, msToSeasonEnd());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.max(1, Math.floor((ms % 3_600_000) / 60_000));
  const left = d > 0 ? t('season.daysHours', { d: String(d), h: String(h) }) : t('season.hoursMin', { h: String(h), m: String(m) });
  const urgent = d < 3; // son 3 gün: kırmızıya döner, aciliyet hissi
  const c = urgent ? theme.danger : theme.accent;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: withAlpha(c, 0.12), borderRadius: 999,
      borderWidth: 1.5, borderColor: withAlpha(c, 0.55),
      paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'center',
    }}>
      <Ionicons name="hourglass" size={12} color={c} />
      <Text style={{ color: c, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>
        {t('season.endsIn', { t: left })}
      </Text>
    </View>
  );
}

export function LevelRoadModal({ visible, profile, onClose, onClaim, onBuyPremium, onNeedDiamonds, lastClaim }: {
  visible: boolean; profile: ProfileView | null; onClose: () => void;
  onClaim?: (level: number, track?: 'free' | 'premium') => void; // karta dokununca sunucuya claim gönder
  onBuyPremium?: () => void; // Premium Yol satın alma isteği
  onNeedDiamonds?: () => void; // yetersiz elmas -> Store'a devret (shortfall kaydedilmis)
  lastClaim?: { level: number; diamonds: number; emoteId: string | null; frameTier: string | null; powerId: string | null; track?: 'free' | 'premium'; seq: number } | null;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<FlatList<number>>(null);
  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const [framePrev, setFramePrev] = useState<{ tier: LevelTier; unlocked: boolean } | null>(null);
  // Yol aşağı kaydırılınca beliren "en yukarı dön" düğmesi
  const [showTopBtn, setShowTopBtn] = useState(false);
  // Premium Yol: satın alma onay penceresi
  const [buyOpen, setBuyOpen] = useState(false);
  const premiumOwned = profile?.premiumRoad ?? false;
  const claimedSet = useMemo(() => new Set(profile?.claimedLevels ?? []), [profile?.claimedLevels]);
  const claimedPremiumSet = useMemo(() => new Set(profile?.claimedPremium ?? []), [profile?.claimedPremium]);
  // --- toplama animasyonu: dokunulan karttan başlığın elmas hapına elmas uçar ---
  const pillRef = useRef<View>(null);
  const pillPos = useRef({ x: SCREEN_W - 54, y: 40 });
  const claimPos = useRef<{ x: number; y: number } | null>(null);
  const claimBusy = useRef(false);
  const [claimFly, setClaimFly] = useState<{ from: { x: number; y: number }; amount: number; key: number } | null>(null);
  const [celeb, setCeleb] = useState<{ tierKey?: string; emoteId?: string; powerId?: PowerId } | null>(null);
  const [shownDiamonds, setShownDiamonds] = useState(profile?.diamonds ?? 0);
  const lastSeq = useRef(lastClaim?.seq ?? 0);
  useEffect(() => {
    // uçuş yoksa hap gerçek bakiyeyi izler
    if (!claimFly) setShownDiamonds(profile?.diamonds ?? 0);
  }, [profile?.diamonds, claimFly]);
  useEffect(() => {
    if (!visible || !lastClaim || lastClaim.seq === lastSeq.current) return;
    lastSeq.current = lastClaim.seq;
    claimBusy.current = false;
    // hap toplanan miktar KADAR eksik gösterir; elmaslar inince tamamlanır
    setShownDiamonds(Math.max(0, (profile?.diamonds ?? 0) - lastClaim.diamonds));
    triggerFeedback(GameFeedbackEvent.UI_REWARD);
    setClaimFly({ from: claimPos.current ?? { x: SCREEN_W / 2, y: 300 }, amount: lastClaim.diamonds, key: lastClaim.seq });
  }, [visible, lastClaim, profile?.diamonds]);
  const handleClaimPress = useCallback((n: number, pos: { x: number; y: number }, track: 'free' | 'premium' = 'free') => {
    if (claimBusy.current || !onClaim) return;
    claimBusy.current = true;
    claimPos.current = pos;
    onClaim(n, track);
  }, [onClaim]);
  // memo(RoadRow) ancak SABİT callback'lerle tutar — satır içi ok fonksiyonları
  // her render'da yeni kimlikti ve memo hiç devreye giremezdi. profile latest-ref
  // üzerinden okunur: dokunma anında güncel değer istenir, eski değere ihtiyaç
  // duyan yol yok.
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const handleFramePress = useCallback((tier: LevelTier, unlocked: boolean) => {
    setFramePrev({ tier, unlocked: unlocked || ownsFrame(profileRef.current, tier.key) });
  }, []);
  const handleBuyPremium = useCallback(() => setBuyOpen(true), []);
  const handleFlyDone = useCallback(() => {
    setClaimFly(null);
    setShownDiamonds(profile?.diamonds ?? 0);
    // elmaslar indikten sonra büyük ödülün kutlaması: çerçeve, özel ifade ya da güç
    if (lastClaim?.frameTier) setCeleb({ tierKey: lastClaim.frameTier });
    else if (lastClaim?.emoteId) setCeleb({ emoteId: lastClaim.emoteId });
    else if (lastClaim?.powerId) setCeleb({ powerId: lastClaim.powerId as PowerId });
  }, [profile?.diamonds, lastClaim?.frameTier, lastClaim?.emoteId, lastClaim?.powerId]);
  // sıradaki 5'in katı = sıradaki büyük ödül (çerçeve ya da özel ifade)
  const nextMilestone = level >= LEVEL_CAP ? null : Math.min(LEVEL_CAP, (Math.floor(level / 5) + 1) * 5);
  const nextIsFrame = nextMilestone != null && nextMilestone % 10 === 0;
  const nextTier = nextMilestone != null ? levelTier(nextMilestone) : null;
  const nextPower = nextMilestone != null ? LEVEL_POWER_UNLOCKS[nextMilestone] : undefined;
  const nextColor = nextIsFrame ? (nextTier?.c ?? theme.accent) : nextPower ? POWERS[nextPower].color : theme.accent;
  // Açılış konumu artık FlatList'in initialScrollIndex'inde (satır boyları
  // deterministik → senkron): eski 60ms'lik kör zamanlayıcı yolu önce y=0'da
  // gösterip sonra zıplatıyordu.
  if (!visible) return null;

  return (
    <SafeModal visible transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <ScreenBg />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14, backgroundColor: theme.surface1, borderTopWidth: 1, borderTopColor: theme.topLight, ...shadowSoft }}>
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.shadowInk, opacity: 0.28 }} />
          <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 14, backgroundColor: pressed ? theme.surface1 : theme.surface2, borderTopWidth: 1, borderTopColor: theme.topLight, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: pressed ? 2 : 0 }], ...shadowRow })}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <Text style={{ flex: 1, color: theme.text, fontFamily: 'Poppins-Black', fontSize: 17, letterSpacing: 0.5, ...engrave('lg') }}>{t('level.roadTitle').toLocaleUpperCase(currentLang())}</Text>
          <View
            ref={pillRef}
            collapsable={false}
            onLayout={() => pillRef.current?.measureInWindow((x, y, w, h) => { if (w > 0) pillPos.current = { x: x + w / 2, y: y + h / 2 }; })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.card, borderRadius: 999, borderWidth: 2, borderColor: withAlpha(theme.gem, 0.6), paddingHorizontal: 10, paddingVertical: 5 }}
          >
            <GemIcon size={14} />
            <Text style={{ color: theme.gemText, fontSize: 13, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>{shownDiamonds}</Text>
          </View>
          <LevelBadge level={level} size={38} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          {/* Sezon geri sayımı — yol her ay yenilenir */}
          <View style={{ marginBottom: 8 }}>
            <SeasonCountdown />
          </View>
          <GamePanel hero bodyStyle={{ gap: 8, paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <LevelBadge level={level} size={52} />
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('level.levelN', { n: String(level) })}</Text>
                {level < LEVEL_CAP ? (
                  <>
                    <XpBar xp={xp} level={level} height={10} />
                    <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{t('level.toNext', { n: String(xpForNextLevel(level) - xp) })}</Text>
                  </>
                ) : (
                  <Text style={{ color: theme.flame, fontSize: 12, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('level.maxed')}</Text>
                )}
              </View>
            </View>
          </GamePanel>
          {/* Sıradaki büyük ödül — heyecan kancası; dokununca o satıra kayar */}
          {nextMilestone ? (
            <Pressable
              onPress={() => scrollRef.current?.scrollToOffset({ offset: Math.max(0, roadRowTop(nextMilestone) - ROAD_ROW_H * 0.7), animated: true })}
              style={({ pressed }) => ({ marginTop: 8, transform: [{ translateY: pressed ? 2 : 0 }] })}
            >
              <View style={{ backgroundColor: darken(theme.card, 0.5), borderRadius: 17, paddingBottom: 2.5 }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: theme.card, borderWidth: 2,
                  // radius-17 lip, flush top/sides, 2.5px bottom lip → 17 top / 14.5 bottom
                  borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomLeftRadius: 14.5, borderBottomRightRadius: 14.5,
                  borderColor: withAlpha(nextColor, 0.7), paddingVertical: 8, paddingHorizontal: 11,
                }}>
                  {nextIsFrame && nextTier ? (
                    <FrameArt tierKey={nextTier.key} size={44} well />
                  ) : nextPower ? (
                    <PowerArt powerId={nextPower} size={44} well />
                  ) : null}
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ color: theme.muted, fontSize: 9, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1.1 }}>{t('level.nextReward').toLocaleUpperCase(currentLang())}</Text>
                    <Text numberOfLines={1} style={{ color: nextColor, fontSize: 13, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.3, ...engrave('sm') }}>
                      {(nextIsFrame && nextTier ? t('level.tierFrameName', { name: t(nextTier.nameKey) }) : nextPower ? t(POWERS[nextPower].nameKey) : '').toLocaleUpperCase(currentLang())}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    <View style={{ backgroundColor: withAlpha(nextColor, 0.14), borderRadius: 999, borderWidth: 1, borderColor: withAlpha(nextColor, 0.55), paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: nextColor, fontSize: 10, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>{t('level.levelsLeft', { n: String(nextMilestone - level) })}</Text>
                    </View>
                    <Ionicons name="chevron-down" size={13} color={theme.muted} />
                  </View>
                </View>
              </View>
            </Pressable>
          ) : null}
          {/* PREMIUM YOL banner'ı — açık değilken görkemli altın davet */}
          {!premiumOwned ? (
            <Pressable onPress={() => setBuyOpen(true)} style={({ pressed }) => ({ marginTop: 8, transform: [{ translateY: pressed ? 2 : 0 }] })}>
              <View style={{ backgroundColor: darken(theme.gold, 0.55), borderRadius: 18, padding: 2, shadowColor: theme.gold, shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 9 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#241539', borderRadius: 16, borderWidth: 2, borderColor: withAlpha(theme.gold, 0.8), paddingVertical: 10, paddingHorizontal: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: withAlpha(theme.gold, 0.15), borderWidth: 2, borderColor: theme.gold, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="diamond" size={20} color={theme.gold} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ color: lighten(theme.gold, 0.25), fontSize: 13.5, fontFamily: 'Poppins-Black', letterSpacing: 0.6, ...engrave('sm') }}>{t('premium.bannerTitle').toLocaleUpperCase(currentLang())}</Text>
                    <Text numberOfLines={2} style={{ color: theme.muted, fontSize: 10.5, lineHeight: 14, fontFamily: 'Poppins-SemiBold' }}>{t('premium.bannerDesc')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.gold, borderRadius: 999, borderWidth: 1.5, borderColor: lighten(theme.gold, 0.4), paddingHorizontal: 10, paddingVertical: 5 }}>
                    <GemIcon size={13} />
                    <Text style={{ color: theme.ink, fontSize: 12.5, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'] }}>{PREMIUM_ROAD_PRICE}</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          ) : null}
        </View>
        {/* FlatList (2026-08-10): düz ScrollView 50 RoadRow'u (~1000 view, çok
            katmanlı gölgeli kilometre taşı kartları) modal slide başlamadan TEK
            commit'te basıyordu — dokunuştan görünmeye dek tüm mount bedeli
            ödeniyordu. Satır boyları deterministik (roadRowH) → getItemLayout +
            initialScrollIndex açılışı senkron doğru konuma getirir; ekran dışı
            satırlar tembel basar. Aynı padding — pikseller aynı.
            removeClippedSubviews kapalı: kilometre taşı parıltı gölgeleri
            pencere kenarında kırpılmasın (Android'de varsayılan açık). */}
        <FlatList
          ref={scrollRef}
          data={ROAD_LEVELS}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 26 }}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setShowTopBtn(e.nativeEvent.contentOffset.y > ROAD_ROW_H * 2)}
          scrollEventThrottle={32}
          keyExtractor={(n) => String(n)}
          // Ofsetlere contentContainer paddingTop'u (8) dahildir — getItemLayout
          // padding'i bilmez; katılmazsa pencere hesabı ve açılış konumu 8px kayar.
          getItemLayout={(_, index) => ({ length: roadRowH(index + 1), offset: 8 + roadRowTop(index + 1), index })}
          // Eski scrollTo hedefiyle aynı niyet (roadRowTop(level) - ROAD_ROW_H):
          // mevcut seviyenin BİR satır üstü görünür → 0 tabanlı indeks level-2.
          initialScrollIndex={Math.max(0, level - 2)}
          initialNumToRender={8}
          windowSize={5}
          removeClippedSubviews={false}
          renderItem={({ item: n }) => (
            <RoadRow
              n={n} level={level} xp={xp}
              claimed={claimedSet.has(n)}
              premiumOwned={premiumOwned}
              premiumClaimed={claimedPremiumSet.has(n)}
              onFramePress={handleFramePress}
              onClaim={handleClaimPress}
              onBuyPremium={handleBuyPremium}
            />
          )}
        />
        {showTopBtn ? (
          <Pressable
            onPress={() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true })}
            hitSlop={8}
            style={({ pressed }) => ({
              position: 'absolute', right: 16, bottom: insets.bottom + 18,
              width: 46, height: 46, borderRadius: 16,
              backgroundColor: pressed ? theme.surface1 : theme.surface2,
              borderWidth: 2, borderColor: withAlpha(theme.accent, 0.6),
              alignItems: 'center', justifyContent: 'center',
              transform: [{ translateY: pressed ? 2 : 0 }],
              ...shadowRow,
            })}
          >
            {/* top-light inset past the r16 corner arcs — a 1px strip can't carry a corner
                radius, and the button has no overflow:'hidden' (it would clip shadowRow) */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 14, right: 14, height: 1, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
            <Ionicons name="chevron-up" size={24} color={theme.accent} />
          </Pressable>
        ) : null}
        {claimFly ? (
          <RoadClaimFly key={claimFly.key} from={claimFly.from} to={pillPos.current} amount={claimFly.amount} onDone={handleFlyDone} />
        ) : null}
        {celeb ? (
          <FrameUnlockCelebration tierKey={celeb.tierKey} emoteId={celeb.emoteId} powerId={celeb.powerId} onDone={() => setCeleb(null)} />
        ) : null}
        {/* Premium Yol satın alma onayı — faydalar + fiyat */}
        <GameModal visible={buyOpen} onClose={() => setBuyOpen(false)} title={t('premium.bannerTitle').toLocaleUpperCase(currentLang())} icon="diamond">
          <View style={{ alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PowerArt powerId="xp2x" size={52} />
              <PowerArt powerId="shield" size={52} />
              <PowerArt powerId="streak" size={52} />
            </View>
            <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>
              {t('premium.confirmBody')}
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            <Btn big kind="accent" gem label={t('premium.unlockBtn', { n: String(PREMIUM_ROAD_PRICE) })} onPress={() => {
              const have = profile?.diamonds ?? 0;
              if (have >= PREMIUM_ROAD_PRICE) { setBuyOpen(false); onBuyPremium?.(); }
              else { recordShortfall(PREMIUM_ROAD_PRICE - have); setBuyOpen(false); onClose(); onNeedDiamonds?.(); }
            }} />
            <Btn kind="ghost" label={t('power.cancel')} onPress={() => setBuyOpen(false)} />
          </View>
        </GameModal>
        <FramePreviewModal tier={framePrev?.tier ?? null} unlocked={framePrev?.unlocked ?? false} visible={framePrev != null} onClose={() => setFramePrev(null)} />
      </View>
    </SafeModal>
  );
}

const styles = StyleSheet.create({
  // Top padding is deliberately tighter than the sides: the app root already
  // pays the safe-area inset, and 22pt more read as a void above every header
  // ("üstte çok boşluk"). Sides/bottom keep the original breathing room.
  screen: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 22, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 6 },
  h1: { color: theme.text, fontSize: 18, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginVertical: 6, letterSpacing: 0.5, ...engrave('lg') },
  label: { color: theme.muted, fontSize: 10, letterSpacing: 2, textAlign: 'center', fontFamily: 'Poppins-SemiBold' },
  sectionLabel: { color: theme.muted, fontSize: 10, letterSpacing: 2, marginTop: 12, marginBottom: 4, fontFamily: 'Poppins-ExtraBold' },
  code: { color: theme.accent, fontSize: 32, fontFamily: 'Poppins-Black', textAlign: 'center', letterSpacing: 4 },
  muted: { color: theme.muted, textAlign: 'center', fontSize: 12, fontFamily: 'Poppins-SemiBold' },
  input: {
    backgroundColor: theme.well, // recessed inner well
    color: theme.text,
    borderTopWidth: 2,
    borderTopColor: theme.shadowInk, // sunken inner top shadow (no drawn ring)
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    fontFamily: 'Poppins-ExtraBold',
    marginVertical: 6,
  },
  lobbyName: { color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') },
  // Recessed waiting chip (lobby waiting / wait-host states)
  lobbyWaitChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'center', backgroundColor: theme.well, borderRadius: 14, borderTopWidth: 2, borderTopColor: theme.shadowInk, paddingVertical: 10, paddingHorizontal: 16 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  teamCard: { flex: 1, backgroundColor: theme.surface2, borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: theme.topLight, ...shadowRow },
  teamName: { color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') },
  plus: { color: theme.accent, fontSize: 22, fontFamily: 'Poppins-Black', ...engrave('sm') },
  passHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: withAlpha(theme.accent, 0.12), borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: theme.accent },
  passHintText: { color: theme.accent, fontSize: 12, fontFamily: 'Poppins-SemiBold', flexShrink: 1 },
  playerPhoto: { width: 104, height: 104, borderRadius: 52, marginTop: 10, borderWidth: 3, borderColor: theme.primary, backgroundColor: theme.card },
  matched: { color: theme.text, fontSize: 19, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginTop: 4, ...engrave('sm') },
  matchScore: { color: theme.text, fontSize: 46, fontFamily: 'Poppins-Black', letterSpacing: 3, marginTop: 6, fontVariant: ['tabular-nums'], ...engrave('lg') },
  matchBanner: { alignItems: 'center', gap: 2, backgroundColor: theme.surface3, borderRadius: 20, borderWidth: 2, borderColor: theme.frameGold, borderBottomWidth: 4, borderBottomColor: theme.frameGoldDark, paddingVertical: 18, paddingHorizontal: 14, marginBottom: 14, ...shadowRaised },
  fixRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fixText: { color: theme.accent, fontSize: 12, fontFamily: 'Poppins-SemiBold' },
  teamResultRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  teamResult: { flex: 1, backgroundColor: theme.surface2, borderRadius: 16, borderTopWidth: 1, borderTopColor: theme.topLight, padding: 12, alignItems: 'center', gap: 6, ...shadowRow },
  teamResultName: { color: theme.text, fontSize: 12.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') },
  teamResultYears: { color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', textAlign: 'center' },
  careerList: { alignSelf: 'stretch', maxHeight: 220 },
  careerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.hairline,
  },
  careerRowHi: { backgroundColor: theme.glowSoft, borderRadius: 8 },
  careerClub: { color: theme.text, fontSize: 12, flex: 1, fontFamily: 'Poppins-SemiBold' },
  careerYears: { color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' },
  storeAdTitle: { color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') },
  storeAdReward: { color: theme.gemText, fontSize: 15, fontFamily: 'Poppins-Black' },
  friendCode: { color: theme.accent, fontSize: 16, fontFamily: 'Poppins-Black', letterSpacing: 2, ...engrave('sm') },
  commonPhoto: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
  commonName: { color: theme.text, fontSize: 13, fontFamily: 'Poppins-SemiBold', flex: 1 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 14 },
  // emotes
  emoteTop: { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  emoteBottom: { position: 'absolute', bottom: 90, left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  emoteFabBottom: { right: 18, bottom: 28 },
  emoteFabTop: { right: 18, top: 8 },
  emoteSheetBackdrop: { flex: 1, backgroundColor: theme.scrim, justifyContent: 'flex-end' },
  // store emotes — raised-row bevel: surface2 face + topLight top edge + integrated shadowInk bottom slice + navy shadow
  storeEmoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface2,
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
    borderTopWidth: 1,
    borderTopColor: theme.topLight,
    borderBottomWidth: 2,
    borderBottomColor: theme.shadowInk,
    ...shadowRow,
  },
  storeEmoteName: { color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') },
  storeEmoteDesc: { color: theme.muted, fontSize: 11, marginTop: 2, fontFamily: 'Poppins-SemiBold' },
});
