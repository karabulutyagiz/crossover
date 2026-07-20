import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from 'react';
import {
  Image,
  type ImageSourcePropType,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, PanResponder, Platform, Dimensions, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { theme, engrave } from './theme';
import { t, currentLang, setLanguage, LANGUAGES } from './i18n';
import type { MessageKey } from './i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './config';
import { GemIcon, GEM_COLOR } from './GemIcon';
import { gemTarget, setGemTarget } from './gemTarget';
import { Avatar } from './Avatar';
import Svg, { Rect, Circle, Line, Polygon, Path, G, Ellipse, ClipPath, Defs, LinearGradient as SvgGradient, RadialGradient, Stop } from 'react-native-svg';

WebBrowser.maybeCompleteAuthSession();
import type { GameState, FriendInfo, LeaderboardEntry } from './useCrossover';
import { initialState } from './useCrossover';
import type { ClubRef, Difficulty, GameMode, GameOptions, MatchHistoryView, PlayerRef, ProfileView, PublicProfile, RoomView, Scope, SpellInfo } from './protocol';
import {
  EmoteCallout,
  EmoteSticker,
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
import { NATIONALITIES } from './nationalities';
import { captureError, track } from './telemetry';
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
  authWith: (provider: 'apple' | 'google' | 'facebook', token: string, name?: string) => void;
  setUsername: (username: string) => void;
  changeName: (newName: string) => void;
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
  setAvatar: (avatar: string | null) => void;
  verifyPurchase: (receipt: string) => Promise<void>;
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
  dismissMatchInvite: () => void;
  findMatchAgain: () => void;
  loadConversations: () => void;
  openChat: (userId: string) => void;
  closeChat: () => void;
  sendMessage: (toUserId: string, body: string) => void;
  markRead: (fromUserId: string) => void;
  typingStart: (toUserId: string) => void;
  typingStop: (toUserId: string) => void;
  leave: () => void;
  logout: () => Promise<void>;
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
  onGoToFriends?: () => void; // page the tab ScrollView across to the Friends tab
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];

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
// (the current block from BTN_PALETTE through ScreenHeader, ~lines 168–381).
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
function usePressLip(depth = 2) {
  const press = useRef(new Animated.Value(0)).current;
  const ty = press.interpolate({ inputRange: [0, 1], outputRange: [0, depth] });
  // A tiny scale-down alongside the lip. The lip alone (a 2px shift) is too subtle
  // to register as feedback; the scale makes every press read as instant.
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.965] });
  const onIn = useCallback(() => {
    Animated.timing(press, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start();
  }, [press]);
  const onOut = useCallback(() => {
    Animated.timing(press, { toValue: 0, duration: PRESS_OUT_MS, useNativeDriver: true }).start();
  }, [press]);
  return { press, ty, scale, onIn, onOut };
}

// Spring press-scale for tile/cell touchables (sticker cells, crest taps).
function usePressScale(to = 0.92) {
  const v = useRef(new Animated.Value(1)).current;
  const onIn = useCallback(() => {
    Animated.spring(v, { toValue: to, friction: 5, tension: 300, useNativeDriver: true }).start();
  }, [v, to]);
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
        borderWidth: 4, borderColor: color, borderTopColor: lighten(color, 0.35), borderBottomColor: darken(color),
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

// ---- Btn 2.1 ----------------------------------------------------------------
// Palette derived from theme tokens — ONE mint/gold/blue/red/purple in the app.
// CR-grade face: dark ink outline around the whole body + a single-hue tonal
// ramp on the face (top-lit toy, NOT a multi-color web gradient).
let _btnSeq = 0;
type BtnKind = 'primary' | 'ghost' | 'accent' | 'blue' | 'danger' | 'purple';
const rampOf = (face: string, lip: string) => ({ hi: lighten(face, 0.3), face, lip });
const BTN_PALETTE: Record<BtnKind, { hi: string; face: string; lip: string }> = {
  primary: rampOf(theme.primary, theme.primaryDark),
  accent: rampOf(theme.accent, theme.accentDark),
  blue: rampOf(theme.blue, theme.blueDark),
  danger: rampOf(theme.danger, theme.dangerDark),
  purple: rampOf(theme.purple, theme.purpleDark),
  ghost: { hi: 'transparent', face: 'transparent', lip: theme.border },
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
}) {
  const press = useRef(new Animated.Value(0)).current;
  const btnGid = useRef(`btn${_btnSeq++}`).current;
  const pal = BTN_PALETTE[kind] ?? BTN_PALETTE.primary;
  const ghost = kind === 'ghost';
  const inert = Boolean(disabled || loading);
  const ghostTint = tint ?? theme.primary;
  // Disabled = desaturated at FULL geometry (no 4px layout jump).
  const face = disabled ? theme.bg2 : pal.face;
  const lip = disabled ? theme.cardLip : darken(pal.face, 0.42);
  // CR signature: WHITE label with a dark cast on painted faces (dark-on-bright
  // reads web). Ghost keeps quiet white; disabled goes muted.
  const fg = disabled ? theme.muted : theme.text;
  const radius = big ? 16 : compact ? 11 : 14;
  const depth = ghost ? 2 : big ? 5 : compact ? 3 : 4;
  const ty = press.interpolate({ inputRange: [0, 1], outputRange: [0, depth] });
  const glow = big && (kind === 'primary' || kind === 'accent') && !inert;
  const padV = big ? 16 : compact ? 9 : 13;
  const font = big ? 18 : compact ? 13 : 15;
  const iconSz = big ? 23 : compact ? 15 : 19;
  // White label with a strong dark cast (CR reads bold-white-on-color); ghost engraves.
  const emboss = ghost
    ? engrave('sm')
    : disabled
      ? {}
      : { textShadowColor: 'rgba(4,9,24,0.55)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 1.5 };
  void icon; void iconSz; // icons intentionally not rendered inside buttons
  const content = (
    <>
      {loading ? (
        <View style={{ marginRight: compact ? 6 : 8 }}>
          <GameSpinner size="sm" color={fg} />
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
  return (
    <Pressable
      disabled={inert}
      onPressIn={() => Animated.timing(press, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: PRESS_OUT_MS, useNativeDriver: true }).start()}
      onPress={inert ? undefined : onPress}
      style={{
        marginVertical: 6,
        borderRadius: radius + 2,
        ...(glow ? { shadowColor: pal.face, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 10 } : {}),
      }}
    >
      {ghost ? (
        // Ghost: glowSoft fill + tint ring. NO rest glow — glow is for hero CTAs only.
        <Animated.View
          style={{
            transform: [{ translateY: ty }],
            backgroundColor: disabled ? withAlpha(theme.muted, 0.08) : tint ? withAlpha(ghostTint, 0.16) : theme.glowSoft,
            borderRadius: radius,
            borderWidth: 2,
            borderColor: disabled ? theme.border : ghostTint,
            paddingVertical: big ? 14 : compact ? 7 : 11,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {content}
        </Animated.View>
      ) : (
        // CLASH-ROYALE button: chunky body with a dark ink outline + deep bottom
        // lip; the face carries a vertical gradient AND a glossy highlight pill
        // over the top half (the glass shine is what makes it read premium).
        <View
          style={{
            backgroundColor: lip,
            borderRadius: radius + 4,
            borderWidth: 2,
            borderColor: disabled ? theme.cardLip : darken(pal.face, 0.5),
            paddingBottom: depth, // ALWAYS — disabled keeps full geometry
            shadowColor: '#000',
            shadowOpacity: disabled ? 0.14 : 0.34,
            shadowRadius: 7,
            shadowOffset: { width: 0, height: 5 },
            elevation: disabled ? 2 : 6,
          }}
        >
          <Animated.View
            style={{
              transform: [{ translateY: ty }],
              backgroundColor: face,
              borderRadius: radius,
              paddingVertical: padV,
              paddingHorizontal: 18,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {!disabled ? (
              // Body gradient + a SMOOTH top gloss (white→transparent), so the
              // shine reads like a glass dome, not a slapped-on white band.
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgGradient id={btnGid} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={lighten(face, 0.52)} />
                    <Stop offset="0.5" stopColor={face} />
                    <Stop offset="1" stopColor={darken(face, 0.3)} />
                  </SvgGradient>
                  <SvgGradient id={`${btnGid}g`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
                    <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.06" />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                  </SvgGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#${btnGid})`} />
                <Rect x={4} y={3} rx={radius - 4} width="92%" height="55%" fill={`url(#${btnGid}g)`} />
              </Svg>
            ) : null}
            {content}
          </Animated.View>
        </View>
      )}
    </Pressable>
  );
}

// ---- Chip 2.0 ---------------------------------------------------------------
// Mini-bevel option chip with real press physics. `active` = selected state.
function Chip({ icon, label, onPress, active = false }: { icon: IoniconName; label: string; onPress: () => void; active?: boolean }) {
  const { ty, onIn, onOut } = usePressLip(2);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ flex: 1 }}>
      <View style={{ backgroundColor: theme.cardLip, borderRadius: 13, paddingBottom: 2 }}>
        <Animated.View
          style={{
            transform: [{ translateY: ty }],
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            backgroundColor: active ? theme.glowSoft : theme.card,
            borderWidth: 1.5,
            borderColor: active ? theme.primary : theme.border,
            borderTopColor: active ? theme.primary : theme.panelTopGloss,
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 6,
          }}
        >
          <Ionicons name={icon} size={14} color={theme.accent} />
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 11, fontFamily: 'Poppins-ExtraBold', flexShrink: 1, ...engrave('sm') }}>
            {label}
          </Text>
        </Animated.View>
      </View>
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
  const fr = compact ? 12 : 16;
  const frameColor = tint ?? (hero ? theme.frameGold : theme.border);
  const frameBot = tint ? darken(tint) : (hero ? theme.accentDark : theme.cardLip);
  return (
    <View style={[{ backgroundColor: hero ? theme.panelInk : theme.bg2, borderRadius: r, padding: 2, borderWidth: 2, borderColor: frameColor, borderBottomColor: frameBot, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: compact ? 6 : 12, shadowOffset: { width: 0, height: compact ? 4 : 6 }, elevation: compact ? 5 : 9 }, style]}>
      <View style={[{ backgroundColor: theme.card, borderRadius: fr, borderTopWidth: 1, borderTopColor: theme.panelTopGloss, borderBottomWidth: 3, borderBottomColor: theme.cardLip, overflow: 'hidden', padding: 12 }, bodyStyle]}>
        {hero ? (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.panelTop} />
                <Stop offset="0.5" stopColor={theme.card} />
                <Stop offset="1" stopColor={theme.panelBot} />
              </SvgGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gid})`} />
            <Rect width="100%" height="50%" fill="#FFFFFF" opacity={0.05} />
          </Svg>
        ) : null}
        {accentStripe ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accentStripe, borderTopLeftRadius: fr, borderBottomLeftRadius: fr }} /> : null}
        {children}
      </View>
    </View>
  );
}

// ---- GameModal — THE dialog. Native Alert.alert is banned for game flows. ----
// Spring pop-in + 160ms animated exit (scale/fade, scrim fades with it) +
// pressed close gem. Keeps the Modal mounted during the exit animation.
export function GameModal({ visible, onClose, onExited, title, icon, danger = false, coach = false, children }: {
  visible: boolean; onClose: () => void; onExited?: () => void; title?: string; icon?: IoniconName; danger?: boolean; coach?: boolean; children: ReactNode;
}) {
  const a = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    } else {
      Animated.timing(a, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          onExitedRef.current?.(); // exit animation done — safe to hand off (no timer chains)
        }
      });
    }
  }, [visible, a]);
  if (!mounted && !visible) return null;
  const clamped = a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const frameColor = coach ? theme.primary : theme.frameGold;
  const frameBot = coach ? theme.primaryDark : theme.frameGoldDark;
  const bannerBg = danger ? theme.danger : theme.accent;
  const bannerBot = danger ? theme.dangerDark : theme.accentDark;
  const bannerFg = danger ? theme.text : theme.ink;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={{ flex: 1, backgroundColor: theme.scrim, opacity: clamped }}>
        {/* Inert the instant `visible` flips false — the 160ms exit must not be
            hit-testable (double-tapped confirms re-fired actions, e.g. double gem charges) */}
        <Pressable pointerEvents={visible ? 'auto' : 'none'} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }} onPress={onClose}>
          <Animated.View
            pointerEvents={visible ? 'auto' : 'none'}
            style={{
              width: '100%', maxWidth: 360,
              transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
              opacity: clamped,
              backgroundColor: theme.panelInk, borderRadius: 22, padding: 2,
              borderWidth: 2, borderColor: frameColor, borderBottomColor: frameBot, overflow: 'hidden',
              shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 24,
            }}
          >
            <Pressable onPress={() => {}} style={{ backgroundColor: theme.card, borderRadius: 20, overflow: 'hidden', borderBottomWidth: 3, borderBottomColor: theme.cardLip }}>
              {title ? (
                <View style={{ height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 46, backgroundColor: bannerBg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.35)', borderBottomWidth: 3, borderBottomColor: bannerBot }}>
                  {icon ? <Ionicons name={icon} size={18} color={bannerFg} /> : null}
                  <Text numberOfLines={1} style={{ color: bannerFg, fontFamily: 'Poppins-ExtraBold', fontSize: 16, letterSpacing: 0.5, textTransform: 'uppercase' }}>{title}</Text>
                </View>
              ) : null}
              <View style={{ padding: 20, paddingTop: title ? 16 : 20, gap: 12 }}>{children}</View>
              <Pressable
                onPress={onClose}
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
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

// ---- RankBadge (unchanged) ---------------------------------------------------
function RankBadge({ rank, size = 28 }: { rank: number; size?: number }) {
  if (rank <= 3) {
    const c = [theme.gold, theme.silver, theme.bronze][rank - 1]!;
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.6)', borderBottomWidth: 2, borderBottomColor: darken(c), alignItems: 'center', justifyContent: 'center', shadowColor: c, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 5 }}>
        <Text style={{ color: theme.ink, fontFamily: 'Poppins-Black', fontSize: size * 0.46 }}>{rank}</Text>
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
    <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: theme.bg2, borderBottomWidth: 2, borderBottomColor: theme.cardLip, marginBottom: 12 }}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 14,
            backgroundColor: pressed ? theme.bg2 : theme.card,
            borderWidth: 2, borderColor: theme.border,
            borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ translateY: pressed ? 2 : 0 }],
          })}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
      ) : <View style={{ width: 40 }} />}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        {icon ? <Ionicons name={icon} size={18} color={theme.accent} /> : null}
        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 18, letterSpacing: 0.5, textTransform: 'uppercase', ...engrave('lg') }}>{title}</Text>
      </View>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

// ---- GameInput — THE text input (recessed well + animated focus halo) --------
// Replaces styles.searchBox / modalSearchBox / friendInput. Forward-compatible
// with all TextInput props; `icon` renders a leading glyph inside the well;
// `inputRef` reaches the underlying TextInput (imperative focus flows).
function GameInput({ icon, error = false, containerStyle, style, onFocus, onBlur, inputRef, ...rest }: ComponentProps<typeof TextInput> & {
  icon?: IoniconName; error?: boolean; containerStyle?: any; inputRef?: Ref<TextInput>;
}) {
  const [focused, setFocused] = useState(false);
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(halo, { toValue: focused ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [focused, halo]);
  const ring = error ? theme.danger : theme.primary;
  return (
    <View style={[{ marginVertical: 6 }, containerStyle]}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 17,
          borderWidth: 3, borderColor: error ? withAlpha(theme.danger, 0.28) : theme.glowSoft,
          opacity: halo,
        }}
      />
      <View
        style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: theme.panelInnerFill, // recessed inner well
          borderRadius: 14, borderWidth: 2,
          borderColor: error ? theme.danger : focused ? ring : theme.border,
          borderTopColor: error ? theme.danger : focused ? ring : theme.cardLip, // dark top edge = sunken
          paddingHorizontal: 14,
        }}
      >
        {icon ? <Ionicons name={icon} size={16} color={focused ? ring : theme.muted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          ref={inputRef}
          placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
          {...rest}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
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
  const { ty, onIn, onOut } = usePressLip(2);
  const check = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (selected) Animated.spring(check, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    else Animated.timing(check, { toValue: 0, duration: 120, useNativeDriver: true }).start();
  }, [selected, check]);
  const ring = selected ? theme.primary : tint ?? theme.border;
  const fgLabel = locked ? theme.muted : theme.text;
  const gemRing = locked ? theme.border : darken(iconColor, 0.25);
  const body = (
    <View
      style={{
        backgroundColor: theme.cardLip, borderRadius: 15, paddingBottom: 3, marginVertical: 4,
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 5,
      }}
    >
      <Animated.View
        style={[{
          transform: [{ translateY: ty }],
          flexDirection: 'row', alignItems: 'center', gap: 11,
          backgroundColor: theme.card, borderRadius: 14, overflow: 'hidden',
          borderWidth: 2, borderColor: ring, borderTopColor: selected ? theme.primary : theme.panelTopGloss,
          paddingVertical: 12, paddingHorizontal: 12,
        }, style]}
      >
        {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.glowSoft }]} /> : null}
        {leading || icon ? (
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.cardLip, borderWidth: 1.5, borderColor: gemRing, alignItems: 'center', justifyContent: 'center' }}>
            {leading ?? <Ionicons name={icon!} size={18} color={locked ? theme.muted : iconColor} />}
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: fgLabel, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{label}</Text>
          {sublabel ? <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', marginTop: 1 }}>{sublabel}</Text> : null}
          {children}
        </View>
        {locked ? (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.accent, borderBottomWidth: 2, borderBottomColor: theme.accentDark, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="lock-closed" size={12} color={theme.ink} />
          </View>
        ) : selected ? (
          <Animated.View style={{ transform: [{ scale: check }] }}>
            <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
          </Animated.View>
        ) : (
          right ?? (chevron ? <Ionicons name="chevron-forward" size={16} color={theme.muted} /> : null)
        )}
      </Animated.View>
    </View>
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
    <View
      style={[{
        flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
        backgroundColor: color, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.4)',
        borderBottomWidth: 2, borderBottomColor: darken(color, 0.4),
        shadowColor: color, shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4,
      }, style]}
    >
      {icon ? <Ionicons name={icon} size={10} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 9.5, fontFamily: 'Poppins-Black', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

// ---- SectionHeader — one section-label voice for every screen ------------------
function SectionHeader({ label, icon, color = theme.muted, style }: { label: string; icon?: IoniconName; color?: string; style?: any }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 6 }, style]}>
      {icon ? <Ionicons name={icon} size={13} color={color === theme.muted ? theme.accent : color} /> : null}
      <Text style={{ color, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 2, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.border, opacity: 0.6 }} />
    </View>
  );
}

// ---- EmptyState — crafted emptiness (icon gem + title + hint + optional CTA) ---
function EmptyState({ icon, title, hint, cta, style }: { icon: IoniconName; title: string; hint?: string; cta?: ReactNode; style?: any }) {
  return (
    <View style={[{ alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 18 }, style]}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.panelInnerFill, borderWidth: 2, borderColor: theme.border, borderTopColor: theme.cardLip, alignItems: 'center', justifyContent: 'center' }}>
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
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
export const BG_TOP = '#0E2347'; // navy shown behind the bg image (frame before load / root)
export type BgVariant = 'home' | 'stadium' | 'store' | 'menu' | 'match';
const BG_HOME = require('../assets/bg-home.png');   // royal-blue arena backdrop (legacy home)
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
            <Stop offset="0.80" stopColor="#04060F" stopOpacity={0.04} />
            <Stop offset="1" stopColor="#04060F" stopOpacity={0.44} />
          </SvgGradient>
          <SvgGradient id="bgphoto" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#06101F" stopOpacity={0.78} />
            <Stop offset="0.13" stopColor="#06101F" stopOpacity={0.34} />
            <Stop offset="0.42" stopColor="#06101F" stopOpacity={0.14} />
            <Stop offset="0.70" stopColor="#06101F" stopOpacity={0.40} />
            <Stop offset="1" stopColor="#06101F" stopOpacity={0.84} />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={photo ? 'url(#bgphoto)' : 'url(#bgshade)'} />
      </Svg>
    </View>
  );
}

function Screen({ children, scroll, bg, pad, contentCenter = true }: { children: ReactNode; scroll?: boolean; noPitch?: boolean; bg?: ReactNode; pad?: number; contentCenter?: boolean }) {
  // Keyboard-aware by default so inputs/buttons never get covered by the keyboard.
  // The KAV offset mirrors the app root's safe-area top inset (one source — they can't drift).
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.screen, pad !== undefined && { padding: pad }]}
      // Scroll screens let the ScrollView's `automaticallyAdjustKeyboardInsets` do the
      // work (it insets AND scrolls the focused input above the keyboard); only fixed
      // (non-scroll) screens need the KAV to pad. Running both double-shifts the layout
      // and was pushing the submit button under the keyboard ("gönderme kısmı gidiyor").
      behavior={Platform.OS === 'ios' && !scroll ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      {/* Optional fixed backdrop BEHIND the scroll content (covers the app's default
          ScreenBg). Rendered outside the ScrollView so it never scrolls. */}
      {bg ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>{bg}</View> : null}
      {/* Keyboard dismiss: a backdrop Pressable BEHIND the content. It never wraps the
          children (so no layout shift) and sits under the ScrollViews (so it never
          intercepts scroll); tapping empty background area still dismisses. Scroll-area
          taps are handled by each ScrollView's keyboardShouldPersistTaps="handled". */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()} accessible={false} />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: contentCenter ? 'center' : 'flex-start' }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
      ) : children}
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
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: pressed ? theme.bg2 : theme.card,
            borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7,
            borderWidth: 1.5, borderColor: theme.border,
            borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
            transform: [{ translateY: pressed ? 2 : 0 }],
          }}
        >
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12, ...engrave('sm') }}>{t('common.skip')}</Text>
          <Ionicons name="chevron-forward" size={12} color={theme.muted} />
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
                <Text key={i} style={{ color: theme.text, fontSize: Math.min(30, SCREEN_W * 0.076), letterSpacing: 1, marginHorizontal: 1.5, includeFontPadding: false, fontFamily: 'Poppins-Black', ...engrave('lg') }}>{ch}</Text>
              ))}
            </View>
          </>
        ) : (
          <>
            {/* Slides 2–3 — beveled badge tile in the BrandMark construction:
                panelInk face, slide-color ring, darkened lip, top-half gloss,
                one-shot ShineSweep when the page gains focus. */}
            <View
              style={{
                width: INTRO_TILE, height: INTRO_TILE, borderRadius: INTRO_TILE * 0.24,
                backgroundColor: theme.panelInk,
                borderWidth: 2, borderColor: slide.color,
                borderBottomWidth: 5, borderBottomColor: darken(slide.color),
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                marginBottom: 26,
                shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8,
              }}
            >
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundColor: '#FFFFFF', opacity: 0.05 }} />
              <Ionicons name={slide.icon} size={72} color={slide.color} />
              {active ? <ShineSweep width={INTRO_TILE} height={INTRO_TILE} delay={260} duration={700} opacity={0.3} band={0.3} /> : null}
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
function BrandMark({ size = 104 }: { size?: number; glow?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.24, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
      <View style={{ width: size, height: size, borderRadius: size * 0.24, overflow: 'hidden', backgroundColor: '#0A0A0B' }}>
        <Image
          source={require('../assets/splash-icon.png')}
          style={{ width: size, height: size, transform: [{ scale: 1.03 }] }}
          resizeMode="cover"
        />
      </View>
    </View>
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

// ---- "STADIUM SLAM" opening: the badge drops in with weight, sparks fly,
// CROSSOVER stamps in letter-by-letter, then a gold shine sweeps the wordmark.
// Runs entirely on the native driver; a fixed timer fires onDone at 2600ms so
// the splash never blocks on anything.
const SLAM_TOTAL_MS = 2500;
const SLAM_WORD = 'CROSSOVER';
const SLAM_FONT = Math.min(36, SCREEN_W * 0.088);
const SLAM_WM_W = Math.min(SCREEN_W * 0.88, 380);
const SLAM_BADGE = 128;
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

export function SplashScreen({ onDone, fontsReady = true }: { onDone?: () => void; fontsReady?: boolean }) {
  const veil = useRef(new Animated.Value(1)).current;      // black cover → fades out
  const drop = useRef(new Animated.Value(0)).current;      // badge fall
  const impact = useRef(new Animated.Value(0)).current;    // squash & recover
  const shake = useRef(new Animated.Value(0)).current;     // stage shake
  const ring1 = useRef(new Animated.Value(0)).current;     // mint impact ring
  const burst = useRef(new Animated.Value(0)).current;     // spark burst
  const letters = useRef(SLAM_WORD.split('').map(() => new Animated.Value(0))).current;
  const fired = useRef(false);
  // The 2600ms timer must call the LATEST onDone, not the mount-time closure.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const anim = Animated.sequence([
      // 0–640ms: lights up, badge falls with gravity
      Animated.parallel([
        Animated.timing(veil, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(120),
          Animated.timing(drop, { toValue: 1, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      // 640ms: IMPACT — squash, shake, rings, sparks; letters stamp in from 980ms
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
    // Hard, network-independent exit: the animation is scenery, the timer is the contract.
    const tm = setTimeout(() => {
      if (!fired.current) { fired.current = true; onDoneRef.current?.(); }
    }, SLAM_TOTAL_MS);
    return () => { clearTimeout(tm); anim.stop(); };
  }, []);

  const badgeTY = drop.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_H * 0.42, 0] });
  const badgeScale = drop.interpolate({ inputRange: [0, 1], outputRange: [1.3, 1] });
  const badgeOpacity = drop.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  // squash anchored to the floor: scale + a compensating translate
  const squashTY = impact.interpolate({ inputRange: [0, 0.22, 0.55, 1], outputRange: [0, SLAM_BADGE * 0.09, -SLAM_BADGE * 0.02, 0] });
  const squashX = impact.interpolate({ inputRange: [0, 0.22, 0.55, 1], outputRange: [1, 1.12, 0.96, 1] });
  const squashY = impact.interpolate({ inputRange: [0, 0.22, 0.55, 1], outputRange: [1, 0.8, 1.06, 1] });
  const shakeTX = shake.interpolate({ inputRange: [0, 0.25, 0.55, 0.8, 1], outputRange: [0, -4, 3, -2, 0] });
  const shakeTY = shake.interpolate({ inputRange: [0, 0.18, 0.42, 0.66, 0.85, 1], outputRange: [0, 7, -5, 3, -1, 0] });
  const shadowOpacity = drop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.05, 0.34], extrapolate: 'clamp' });
  const shadowScaleX = drop.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <OpeningBackdrop>
      <Animated.View style={{ alignItems: 'center', transform: [{ translateX: shakeTX }, { translateY: shakeTY }] }}>
        {/* badge + floor shadow + impact FX */}
        <View style={{ width: SLAM_BADGE * 1.4, height: SLAM_BADGE + 30, alignItems: 'center', justifyContent: 'flex-start' }}>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 0, width: SLAM_BADGE * 1.05, height: 20, borderRadius: 12, backgroundColor: '#01030A', opacity: shadowOpacity, transform: [{ scaleX: shadowScaleX }] }} />
          <Animated.View style={{ opacity: badgeOpacity, transform: [{ translateY: badgeTY }, { scale: badgeScale }, { translateY: squashTY }, { scaleX: squashX }, { scaleY: squashY }] }}>
            <BrandMark size={SLAM_BADGE} />
          </Animated.View>
          {/* impact anchor (zero-size, centered at the badge base) */}
          <View pointerEvents="none" style={{ position: 'absolute', left: '50%', bottom: 16, width: 0, height: 0 }}>
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
        <View style={{ width: SLAM_WM_W, alignItems: 'center', marginTop: 26 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            {SLAM_WORD.split('').map((ch, i) => (
              <Animated.Text
                key={i}
                style={{
                  color: theme.text, fontSize: SLAM_FONT, letterSpacing: 1, marginHorizontal: 1.5, includeFontPadding: false,
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
          <ShineSweep width={SLAM_WM_W} height={SLAM_FONT * 1.4} delay={1780} duration={620} tint={theme.accent} opacity={0.3} band={0.24} />
        </View>
      </Animated.View>
      {/* fade-from-black veil (on top of everything) */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: veil }]} />
    </OpeningBackdrop>
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
const LOAD_BAR_INNER = LOAD_BAR_W - 8; // minus 2px frame border + 2px well padding per side
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

  // Fill the bar 0→100 over ~2.2s; at 100% blink the bar white, then enter home.
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
    }, 80);
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
          per-letter wordmark, underline and margins) so the cut is invisible */}
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: SLAM_BADGE * 1.4, height: SLAM_BADGE + 30, alignItems: 'center', justifyContent: 'flex-start' }}>
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, width: SLAM_BADGE * 1.05, height: 20, borderRadius: 12, backgroundColor: '#01030A', opacity: 0.34 }} />
          <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -3, 0] }) }] }}>
            <BrandMark size={SLAM_BADGE} />
          </Animated.View>
        </View>
        <View style={{ width: SLAM_WM_W, alignItems: 'center', marginTop: 26 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            {SLAM_WORD.split('').map((ch, i) => (
              <Text key={i} style={{ color: theme.text, fontSize: SLAM_FONT, letterSpacing: 1, marginHorizontal: 1.5, includeFontPadding: false, fontFamily: 'Poppins-Black', ...engrave('lg') }}>{ch}</Text>
            ))}
          </View>
        </View>
      </View>

      {/* bottom: CR-style tip card + beveled glossy progress bar */}
      <Animated.View style={{ position: 'absolute', left: 24, right: 24, bottom: 56, gap: 14, opacity: kit, transform: [{ translateY: kit.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <GamePanel compact bodyStyle={{ padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.cardLip, borderWidth: 1.5, borderColor: theme.accentDark, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="bulb" size={18} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.accent, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1.4 }}>{t('loading.tipLabel')}</Text>
              <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', lineHeight: 17, marginTop: 2 }}>{t(tipKey)}</Text>
            </View>
          </View>
        </GamePanel>

        <View style={{ height: LOAD_BAR_H, borderRadius: 13, backgroundColor: theme.panelInk, borderWidth: 2, borderColor: theme.border, borderBottomColor: theme.cardLip, padding: 2, justifyContent: 'center' }}>
          <View style={{ flex: 1, borderRadius: 10, backgroundColor: theme.panelInnerFill, overflow: 'hidden' }}>
            {/* glossy mint fill slab (full width, slid in from the left on the native
                driver): top gloss + dark lip + hot leading cap + looping shine */}
            <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: LOAD_BAR_INNER, borderRadius: 10, backgroundColor: theme.primary, overflow: 'hidden', transform: [{ translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-LOAD_BAR_INNER, 0] }) }] }}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '46%', backgroundColor: 'rgba(255,255,255,0.32)', borderTopLeftRadius: 10, borderTopRightRadius: 10 }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: theme.primaryDark, opacity: 0.85 }} />
              <View style={{ position: 'absolute', top: 2, bottom: 2, right: 2, width: 6, borderRadius: 3, backgroundColor: lighten(theme.primary, 0.55), opacity: 0.9 }} />
              <ShineSweep width={LOAD_BAR_INNER} height={LOAD_BAR_H - 8} loop delay={350} duration={900} loopGap={900} opacity={0.35} band={0.22} />
            </Animated.View>
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#000000', opacity: 0.28 }} />
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
  const frame = wrong ? theme.danger : theme.primary;
  const frameBot = wrong ? theme.dangerDark : theme.primaryDark;
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
          transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
          backgroundColor: theme.panelInk, borderRadius: 22, padding: 2,
          borderWidth: 2, borderColor: frame, borderBottomColor: frameBot,
          shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 16,
        }}
      >
        <View style={{ backgroundColor: theme.card, borderRadius: 20, overflow: 'hidden', borderBottomWidth: 3, borderBottomColor: theme.cardLip }}>
          <View style={{ height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: frame, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.35)', borderBottomWidth: 3, borderBottomColor: frameBot }}>
            <Text style={{ color: wrong ? theme.text : theme.ink, fontFamily: 'Poppins-ExtraBold', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>{stepLabel}</Text>
          </View>
          <View style={{ padding: 22, paddingTop: 18, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.panelInnerFill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: frame, borderTopColor: theme.cardLip, marginBottom: 12 }}>
              <Ionicons name={wrong ? 'alert' : 'football'} size={28} color={frame} />
            </View>
            <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-SemiBold', lineHeight: 23, textAlign: 'center', marginBottom: 16 }}>{body}</Text>
            <View style={{ width: '100%' }}>
              <Btn label={cta} kind="primary" icon={ctaIcon} onPress={onPress} big />
            </View>
          </View>
        </View>
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
        position: 'absolute', top: 96, left: 16, right: 16, alignItems: 'center',
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
      }}
    >
      <View style={{ backgroundColor: theme.card, borderRadius: 14, borderWidth: 1.5, borderColor: theme.primary, borderBottomWidth: 3, borderBottomColor: theme.cardLip, paddingVertical: 9, paddingHorizontal: 14, maxWidth: '100%' }}>
        <Text style={{ color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{text}</Text>
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

  const future = Date.now() + 9_999_999;
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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {screen}

      {/* Slim top hint while the player is interacting (gate closed) */}
      <TutorialHint visible={!gateOpen && !!cur.hint} text={cur.hint} />

      {/* Result step: keep the win + career fully visible, celebration card at the bottom */}
      {step >= 2 ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 }}>
          <Animated.View
            style={{ transform: [{ scale: bubble }], opacity: bubble }}
            onLayout={(e) => setCelebSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            <GamePanel hero tint={theme.primary} bodyStyle={{ alignItems: 'center', padding: 18 }}>
              <CelebrationSparks />
              <Text style={{ color: theme.text, fontSize: 14.5, fontFamily: 'Poppins-SemiBold', lineHeight: 22, textAlign: 'center', marginBottom: 14 }}>{cur.gate}</Text>
              <View style={{ width: '100%' }}>
                <Btn label={cur.cta} kind="primary" icon="rocket" onPress={onGate} big />
              </View>
              {celebSize.w > 0 ? <ShineSweep width={celebSize.w - 8} height={celebSize.h - 8} delay={340} duration={720} opacity={0.24} band={0.26} /> : null}
            </GamePanel>
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
    <Animated.View style={{ opacity: op, transform: [{ scale }, { rotate: rot }, { translateY: by }] }}>
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
      <View style={{ backgroundColor: theme.accentDark, borderRadius: size / 2 + 2, paddingBottom: 3, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
        <Animated.View
          style={{
            transform: [{ translateY: ty }],
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: theme.accent,
            borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.30)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="chatbubble-ellipses" size={Math.round(size * 0.46)} color={theme.ink} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

// Sticker cell in the emote sheet — spring press-scale 0.92 (spec §11).
function EmoteStickerCell({ emote, onPress }: { emote: EmoteMeta; onPress: () => void }) {
  const { scale, onIn, onOut } = usePressScale();
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

      <Modal visible={open || sheetMounted} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Animated.View style={[styles.emoteSheetBackdrop, { opacity: sheetA.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <Animated.View style={{ transform: [{ translateY: sheetA.interpolate({ inputRange: [0, 1], outputRange: [440, 0] }) }] }}>
            {/* Gold top rim over a panelInk edge → card face with a panelTopGloss inner line */}
            <View style={{ backgroundColor: theme.panelInk, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderTopWidth: 2, borderTopColor: theme.frameGold, paddingTop: 3 }}>
              <View
                style={{
                  backgroundColor: theme.card, borderTopLeftRadius: 26, borderTopRightRadius: 26,
                  borderTopWidth: 1, borderTopColor: theme.panelTopGloss,
                  paddingTop: 10, paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 16) + 12,
                }}
              >
                <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 16 }} />

                {/* Quick-chat text messages (no emoji — just text, Clash-Royale style) */}
                <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 1.5, marginBottom: 9, marginLeft: 2 }}>{t('emote.quickChat')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                  {textEmotes.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => { actions.sendEmote(e.id); setOpen(false); }}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.bg,
                        borderRadius: 22, paddingVertical: 11, paddingHorizontal: 16,
                        borderWidth: 1.5, borderColor: theme.border,
                        borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
                        transform: [{ translateY: pressed ? 2 : 0 }],
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
      </Modal>
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
  return { 'team-team': t('mode.teamTeam'), 'country-team': t('mode.countryTeam'), 'letter-team': t('mode.letterTeam'), 'player-player': t('mode.playerPlayer') }[m];
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
};

function scopeLabel(scope: Scope): string {
  return scope.type === 'all' ? t('scope.all') : scope.value;
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
// Custom "Sign in with Apple" trigger in the kit's chunky anatomy. Follows
// Apple's HIG (white field, black  logo + localized title — the mandated
// white/black are a sanctioned exception to the no-raw-hex rule); the actual
// sign-in still runs through the native AppleAuthentication module.
function AppleSignInBtn({ onPress }: { onPress: () => void }) {
  const press = useRef(new Animated.Value(0)).current;
  const ty = press.interpolate({ inputRange: [0, 1], outputRange: [0, 4] });
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.timing(press, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: PRESS_OUT_MS, useNativeDriver: true }).start()}
      style={{ marginVertical: 6 }}
    >
      <View style={{ backgroundColor: '#B9BFCB', borderRadius: 16.5, borderWidth: 1.5, borderColor: theme.panelInk, paddingBottom: 4, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
        <Animated.View style={{ transform: [{ translateY: ty }], backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="logo-apple" size={22} color="#000000" style={{ marginRight: 9, marginTop: -3 }} />
          <Text numberOfLines={1} style={{ color: '#000000', fontSize: 17, fontFamily: 'Poppins-ExtraBold' }}>{t('login.apple')}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

export function LoginScreen({ state, actions }: Props) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [hasInternet, setHasInternet] = useState(true);
  const [showOfflinePulse, setShowOfflinePulse] = useState(false);
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
    androidClientId: GOOGLE_WEB_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token ?? response.authentication?.idToken;
      if (idToken) actions.authWith('google', idToken);
    }
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
      /* user canceled the Apple sheet */
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
              <Text key={i} style={{ color: theme.text, fontSize: SLAM_FONT, letterSpacing: 1, marginHorizontal: 1.5, includeFontPadding: false, fontFamily: 'Poppins-Black', ...engrave('lg') }}>{ch}</Text>
            ))}
          </View>
        </Animated.View>

        <Animated.View style={{ paddingBottom: 16, opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
          <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 18, marginBottom: 8 }}>{t('login.hint')}</Text>
          {Platform.OS === 'ios' && appleAvailable ? (
            <AppleSignInBtn onPress={() => { if (hasInternet) void signInApple(); else setShowOfflinePulse(true); }} />
          ) : null}
          <Btn label={t('login.google')} icon="logo-google" kind="accent" onPress={() => { if (hasInternet) void promptAsync(); else setShowOfflinePulse(true); }} disabled={!request} big />
          {!isNetworkErrorMessage(state.error) && state.error ? <ErrorBanner message={state.error} /> : null}
          <Btn label={t('login.guest')} icon="person-outline" kind="ghost" onPress={() => { if (hasInternet) actions.guestLogin(); else setShowOfflinePulse(true); }} />
        </Animated.View>
      </View>

      <NetworkErrorBeacon visible={!hasInternet || showOfflinePulse || isNetworkErrorMessage(state.error)} />
    </Screen>
  );
}

// One-time unique username pick, shown after sign-in before anything else.
export function UsernameScreen({ state, actions }: Props) {
  const [name, setName] = useState('');
  const intro = useRef(new Animated.Value(0)).current;
  const trimmed = name.trim();
  const valid =
    trimmed.length >= 3 &&
    trimmed.length <= 16 &&
    /^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]+$/.test(trimmed);
  useEffect(() => {
    Animated.spring(intro, { toValue: 1, friction: 7, tension: 72, useNativeDriver: true }).start();
  }, [intro]);
  return (
    <Screen>
      <Animated.View style={{ flex: 1, justifyContent: 'center', transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }], opacity: intro }}>
        <GamePanel hero tint={valid ? theme.primary : theme.frameGold} bodyStyle={{ gap: 14, padding: 22 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ width: 78, height: 78, borderRadius: 24, backgroundColor: theme.panelInnerFill, borderWidth: 2, borderColor: valid ? theme.primary : theme.accent, borderBottomWidth: 5, borderBottomColor: valid ? theme.primaryDark : theme.accentDark, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={38} color={valid ? theme.primary : theme.accent} />
            </View>
            <Text style={{ color: theme.text, fontFamily: 'Poppins-Black', fontSize: 24, textAlign: 'center', ...engrave('lg') }}>{t('username.title')}</Text>
            <Text style={{ color: theme.muted, fontSize: 13.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>{t('username.subtitle')}</Text>
          </View>
          <GameInput
            placeholder={t('username.placeholder')}
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={16}
            error={!valid && trimmed.length > 0}
            autoFocus
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
            <Ionicons name={valid ? 'checkmark-circle' : 'information-circle'} size={15} color={valid ? theme.primary : theme.muted} />
            <Text style={{ color: valid ? theme.primary : theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>{t('username.rules')}</Text>
          </View>
          <Btn
            label={t('username.create')}
            icon="checkmark"
            kind="primary"
            onPress={() => actions.setUsername(trimmed)}
            disabled={!valid}
            big
          />
          {!isNetworkErrorMessage(state.error) && state.error ? <ErrorBanner message={state.error} style={{ marginVertical: 0 }} /> : null}
        </GamePanel>
      </Animated.View>
      <NetworkErrorBeacon visible={isNetworkErrorMessage(state.error)} />
    </Screen>
  );
}

function arenaColor(name: string): string {
  return ARENA_DATA.find((a) => a.name === name)?.color ?? theme.primary;
}

// The home console's dominant action — one oversized primary button with a
// periodic shine pass. Same Btn anatomy (ink outline → lip → top-lit face).
function HeroPlayBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const press = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  const ty = press.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.timing(press, { toValue: 1, duration: PRESS_IN_MS, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: PRESS_OUT_MS, useNativeDriver: true }).start()}
      style={{ marginVertical: 4 }}
    >
      <View style={{ backgroundColor: darken(theme.primary, 0.4), borderRadius: 22, borderWidth: 2, borderColor: darken(theme.primary, 0.5), paddingBottom: 6, shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 8, shadowOffset: { width: 0, height: 5 }, elevation: 8 }}>
        <Animated.View
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          style={{ transform: [{ translateY: ty }], backgroundColor: theme.primary, borderRadius: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        >
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id="heroPlayG" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lighten(theme.primary, 0.52)} />
                <Stop offset="0.5" stopColor={theme.primary} />
                <Stop offset="1" stopColor={darken(theme.primary, 0.3)} />
              </SvgGradient>
              <SvgGradient id="heroPlayGloss" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
                <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.06" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </SvgGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#heroPlayG)" />
            <Rect x={5} y={3} rx={15} width="94%" height="54%" fill="url(#heroPlayGloss)" />
          </Svg>
          {w > 0 ? <ShineSweep width={w} height={64} loop delay={1600} duration={800} loopGap={3600} opacity={0.22} band={0.2} /> : null}
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 22, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.8, textShadowColor: 'rgba(4,9,24,0.55)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 1.5 }}>{label}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// External info links (placeholders — swap for the real URLs when ready).
const INFO_LINKS = {
  help: 'https://crossover.gg/yardim',
  privacy: 'https://crossover.gg/gizlilik',
  parents: 'https://crossover.gg/ebeveyn',
  terms: 'https://crossover.gg/kosullar',
  founders: 'https://crossover.gg/kurucular',
};
const openLink = (url: string) => { Linking.openURL(url).catch(() => {}); };

// ---- Settings Panel (inside hamburger menu) ----
function SettingsPanel({ onLanguageChange, diamonds, onChangeName, onNeedDiamonds, onLogout }: {
  onLanguageChange: () => void;
  diamonds: number;
  onChangeName: (name: string) => void;
  onNeedDiamonds: () => void;
  onLogout: () => void;
}) {
  const [langPicker, setLangPicker] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const activeLang = currentLang();
  const activeName = LANGUAGES.find((l) => l.code === activeLang)?.name ?? activeLang;

  const doChangeLang = (code: string) => {
    setLanguage(code);
    AsyncStorage.setItem('@crossover_lang', code).catch(() => {});
    setLangPicker(false);
    onLanguageChange();
  };

  const linkChip = (pressed: boolean) => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7,
    paddingVertical: 11, paddingHorizontal: 11, borderRadius: 12,
    backgroundColor: pressed ? theme.bg2 : theme.bg, borderWidth: 1.5, borderColor: theme.border,
    borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
    transform: [{ translateY: pressed ? 2 : 0 }],
  });
  const linkTxt = { color: theme.text, fontSize: 12, fontFamily: 'Poppins-SemiBold', flex: 1 };

  return (
    <View style={{ paddingBottom: 4 }}>
      <SectionHeader label={t('settings.language')} icon="language" style={{ marginTop: 2 }} />
      <GameRow
        icon="language"
        label={activeName}
        right={<Ionicons name="chevron-down" size={16} color={theme.muted} />}
        onPress={() => setLangPicker(true)}
      />

      {/* Ad Değiştir (1000 elmas) */}
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
        onPress={() => { if (diamonds < 1000) onNeedDiamonds(); else setRenameOpen(true); }}
      />

      <ChangeNameModal
        visible={renameOpen}
        diamonds={diamonds}
        onClose={() => setRenameOpen(false)}
        onConfirm={(newName) => { onChangeName(newName); setRenameOpen(false); }}
      />

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

      <View style={{ height: 1, backgroundColor: theme.border, marginTop: 18, marginBottom: 8 }} />
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

// Centered "letter" popup shell — gold-framed card, title + top-right X, scrollable
// body. Everything that used to open fullscreen (leaderboard, match history) now uses
// this so it pops in the middle of the screen instead of taking it over.
function PopupCard({ visible, title, icon, onClose, children }: {
  visible: boolean; title: string; icon: IoniconName; onClose: () => void; children: ReactNode;
}) {
  // Spring pop-in + 160ms animated exit (scrim fades with the same value) —
  // centered cards never use animationType='fade'/'slide' (spec §7).
  const a = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    } else {
      Animated.timing(a, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, a]);
  if (!mounted && !visible) return null;
  const clamped = a.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 18 }}>
        {/* Backdrop catches outside taps. It is a SIBLING of the card (not a parent),
            so it never swallows the inner ScrollView's scroll gestures. */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim, opacity: clamped }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={{ opacity: clamped, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }], backgroundColor: theme.card, borderRadius: 22, borderWidth: 2, borderColor: theme.frameGold, borderBottomWidth: 4, borderBottomColor: theme.frameGoldDark, maxHeight: '80%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 11 }}>
            <Ionicons name={icon} size={20} color={theme.accent} />
            <Text style={[{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 17, marginLeft: 8, flex: 1 }, engrave('sm')]} numberOfLines={1}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: pressed ? darken(theme.panelInnerFill, 0.25) : theme.panelInnerFill,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: theme.border,
                transform: [{ translateY: pressed ? 1 : 0 }],
              })}
            >
              <Ionicons name="close" size={18} color={theme.text} />
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: theme.border }} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---- News / announcements feed (opened from the Home bell icon) ----
// Static for now; swap NEWS for a server `/news` fetch later without touching the UI
// or the bell wiring. Newest item first — its id drives the unread pip.
type NewsItem = { id: string; date: string; title: string; body: string; icon: any; tint: string };
const NEWS: NewsItem[] = [
  { id: '2026-07-20-ball', date: '20.07.2026', icon: 'football', tint: theme.gold,
    title: 'Yeni: Zıplayan Top emote!',
    body: "Mağaza'dan Zıplayan Top premium emote'unu al, maç içinde rakibini şaşırt. Koleksiyondan loadout'una ekle." },
  { id: '2026-07-14-social', date: '14.07.2026', icon: 'people', tint: theme.primary,
    title: 'Sosyal Paket geldi',
    body: 'Ülke-Takım ve Harf-Takım modlarını arkadaşlarınla oyna. Haftalık veya aylık Sosyal Paket ile kilidi aç.' },
  { id: '2026-07-01-arena', date: '01.07.2026', icon: 'trophy', tint: theme.accent,
    title: 'Arenalar ve kupalar',
    body: "Maç kazandıkça kupa topla, Mahalle Sahası'ndan GOAT'a yüksel. Her arena atlayışında elmas ödülü seni bekliyor." },
  { id: 'welcome', date: '01.06.2026', icon: 'sparkles', tint: theme.blue,
    title: "Crossover'a hoş geldin!",
    body: "İki takım seç; ikisinde de oynamış futbolcuyu ilk yazan kazanır. Bot'a karşı çalış, arkadaşınla oda kur ya da hızlı eşleşmeye gir." },
];
export const LATEST_NEWS_ID = NEWS[0]?.id ?? '';
export const NEWS_READ_KEY = '@crossover_news_read';

export function NewsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <GameModal visible={visible} onClose={onClose} title="Haberler" icon="megaphone">
      <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {NEWS.map((item) => (
          <View key={item.id} style={{ backgroundColor: theme.panelInnerFill, borderRadius: 16, borderWidth: 1.5, borderColor: theme.border, borderTopColor: theme.cardLip, padding: 15, gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1.5, borderColor: item.tint, borderBottomColor: darken(item.tint), alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={item.icon} size={21} color={item.tint} />
              </View>
              <Text style={{ flex: 1, color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 17, ...engrave('sm') }} numberOfLines={2}>{item.title}</Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 22, fontFamily: 'Poppins-SemiBold' }}>{item.body}</Text>
            <Text style={{ color: theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold', opacity: 0.7 }}>{item.date}</Text>
          </View>
        ))}
      </ScrollView>
    </GameModal>
  );
}

export function LeaderboardModal({ visible, entries, onClose, onViewProfile }: {
  visible: boolean;
  entries: GameState['leaderboard'];
  onClose: () => void;
  onViewProfile?: (userId: string) => void;
}) {
  // Loading ≠ empty: shimmer skeletons during the fetch window, then a crafted
  // EmptyState if the board is genuinely empty (spec §9).
  const graceOver = useLoadGrace(visible && entries.length === 0);
  return (
    <PopupCard visible={visible} title={t('menu.leaderboard')} icon="podium" onClose={onClose}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10 }} showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          graceOver ? <LeaderboardEmpty onPlay={onClose} /> : <SkeletonRows rows={4} />
        ) : entries.map((entry) => (
          <LeaderboardRow key={entry.rank} entry={entry} onPress={onViewProfile ? () => onViewProfile(entry.userId) : undefined} />
        ))}
      </ScrollView>
    </PopupCard>
  );
}

export function MatchHistoryModal({ visible, history, myName, onClose }: { visible: boolean; history: GameState['matchHistory']; myName: string; onClose: () => void }) {
  return (
    <PopupCard visible={visible} title={t('menu.matchHistory')} icon="time" onClose={onClose}>
      <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
        {history.length === 0 ? (
          <EmptyState icon="time" title={t('matchHistory.empty')} hint={t('matchHistory.emptyHint')} />
        ) : history.map((m) => (
          <MatchHistoryCard key={m.id} match={m} myName={myName} />
        ))}
      </ScrollView>
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

// The mockup's pair of balls straddling the wordmark's crown — one classic
// white, one blue, tilted toward each other.
function BrandBalls({ size }: { size: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size * 0.30 }}>
      <View style={{ transform: [{ rotate: '-9deg' }] }}>
        <Ball size={size * 0.58} face="#F4F7FC" faceDark="#B9C4D6" ink="#131C30" />
      </View>
      <View style={{ marginTop: size * 0.04, transform: [{ rotate: '11deg' }] }}>
        <Ball size={size * 0.55} face="#3E97F0" faceDark="#1A62C0" ink="#0B2E5C" />
      </View>
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
function ConfettiPiece({ p, w, h }: { p: (typeof CONFETTI)[number]; w: number; h: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: p.dur, easing: Easing.linear, useNativeDriver: true }),
    );
    const start = setTimeout(() => loop.start(), p.delay);
    return () => { clearTimeout(start); loop.stop(); };
  }, [t, p.dur, p.delay]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-20, h + 20] });
  const translateX = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, p.sway, 0, -p.sway, 0] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * p.spins}deg`] });
  return (
    <Animated.View style={{ position: 'absolute', left: p.x * w, top: 0, transform: [{ translateY }, { translateX }, { rotate }] }}>
      <View style={{ width: p.w, height: p.h, borderRadius: p.round ? p.w / 2 : 1.5, backgroundColor: p.c }} />
    </Animated.View>
  );
}

function HeroConfetti({ w, h }: { w: number; h: number }) {
  if (w <= 0 || h <= 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {CONFETTI.map((p, i) => <ConfettiPiece key={i} p={p} w={w} h={h} />)}
    </View>
  );
}

// A floating counter beside the hero: round art badge with its value on a dark
// caption chip clipped to the badge's bottom edge.
function RailBadge({ icon, iconColor, ringColor, value, onPress, countAnim, fillAnim, innerRef }: {
  icon: IoniconName; iconColor: string; ringColor: string; value: string; onPress: () => void;
  countAnim?: Animated.Value; fillAnim?: Animated.Value; innerRef?: Ref<View>;
}) {
  const { scale, onIn, onOut } = usePressScale();
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
        <View style={{
          marginTop: -8,
          backgroundColor: '#0A1428', borderRadius: 9,
          borderWidth: 1.5, borderColor: withAlpha(ringColor, 0.6),
          paddingHorizontal: 7, paddingVertical: 1.5,
        }}>
          <Text style={{ color: theme.text, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{shown}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ---- top bar --------------------------------------------------------------

// Raised round button — the mockup's pack / bell / gear trio.
function RoundIconBtn({ icon, onPress, dot = false, tint = theme.text }: {
  icon: IoniconName; onPress: () => void; dot?: boolean; tint?: string;
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2);
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
}

// Profile pill: avatar (tier-ringed, tier-badged) · name · progress trough.
// The mockup's "level" is this game's ARENA TIER (1–7, Mahalle→GOAT) and its XP
// bar is the trophy climb toward the next arena — real numbers in the mockup's slots.
function ProfilePill({ name, avatarId, tier, pct, color, onPress }: {
  name: string; avatarId?: string | null; tier: number; pct: number; color: string; onPress: () => void;
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ flex: 1, minWidth: 108 }}>
      <View style={{ backgroundColor: darken(theme.card, 0.5), borderRadius: 24, paddingBottom: 2.5 }}>
        <Animated.View style={{
          transform: [{ translateY: ty }, { scale }],
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: theme.card, borderRadius: 24,
          paddingVertical: 3.5, paddingLeft: 3.5, paddingRight: 10,
        }}>
          <View>
            <AvatarBadge avatarId={avatarId} size={34} ringColor={color} />
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
            <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.navyWell, justifyContent: 'center', overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
            </View>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// Currency pill — the mockup's coin capsule. This game has exactly one currency
// (diamonds), so the coin slot carries the gem and the capsule's green "+" goes
// straight to the diamond aisle of the store.
function GemPill({ count, onPress, countAnim, fillAnim, innerRef }: {
  count: number; onPress: () => void;
  countAnim?: Animated.Value; fillAnim?: Animated.Value; innerRef?: Ref<View>;
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2);
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
      <View style={{ backgroundColor: darken(theme.card, 0.5), borderRadius: 18, paddingBottom: 2.5 }}>
        <Animated.View style={{
          transform: [{ translateY: ty }, { scale }],
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: theme.card, borderRadius: 18, overflow: 'hidden',
          paddingVertical: 3.5, paddingLeft: 7, paddingRight: 3.5,
        }}>
          {fillAnim ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, right: 0,
                backgroundColor: withAlpha(GEM_COLOR, 0.34),
                transformOrigin: 'left', transform: [{ scaleX: fillAnim }],
              }}
            />
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
}

// ---- cards ----------------------------------------------------------------

// The mockup's bright art cards: an art field up top, a dark caption band across
// the bottom carrying the title. `art` is drawn into the field and may overhang it.
function ArtCard({ title, tint, art, height, onPress }: {
  title: string; tint: string; art?: ReactNode; height: number; onPress: () => void;
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2);
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut} style={{ flex: 1 }}>
      <View style={{ backgroundColor: darken(tint, 0.55), borderRadius: 20, paddingBottom: 3, shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
        <Animated.View style={{
          transform: [{ translateY: ty }, { scale }], height, borderRadius: 18, overflow: 'hidden',
          backgroundColor: tint, borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.26)',
        }}>
          <View style={StyleSheet.absoluteFill}>{art}</View>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(darken(tint, 0.66), 0.94), paddingHorizontal: 11, paddingVertical: 7 }}>
            <Text style={{ color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} numberOfLines={1}>{title}</Text>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

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
function GhostPanel({ title, icon, ghost, height, onPress, children, locked = false }: {
  title: string; icon?: IoniconName; ghost: IoniconName; height: number;
  onPress?: () => void; children?: ReactNode; locked?: boolean;
}) {
  const { ty, scale, onIn, onOut } = usePressLip(2);
  const body = (
    <View style={{ backgroundColor: darken(theme.card, 0.52), borderRadius: 20, paddingBottom: 3, shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
      <Animated.View style={{
        transform: onPress ? [{ translateY: ty }, { scale }] : [], height, borderRadius: 18, overflow: 'hidden',
        backgroundColor: theme.card, borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.14)', padding: 11,
      }}>
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
}

// ---- the screen -----------------------------------------------------------

// Every mode this game can actually play. country-team/letter-team are the
// Social-Pack-gated pair (server: isSocialPackMode, ws/server.ts:79); team-team
// and player-player are free. player-player is fully implemented server-side
// (rooms/room.ts) but had no entry point anywhere in the UI before this screen.
const CAROUSEL_GAP = 8;
// Below this width the one-row top bar cannot seat all three round buttons without
// starving the profile pill, so the pack shortcut (duplicated in the Store tab) steps out.
const TOPBAR_ROOMY_W = 360;
// Room codes are always exactly this long — server/src/rooms/manager.ts:5 (CODE_LEN).
const ROOM_CODE_LEN = 6;
const HOME_MODES: GameMode[] = ['team-team', 'player-player', 'country-team', 'letter-team'];
const PACK_MODES: GameMode[] = ['country-team', 'letter-team'];

export function HomeScreen({ actions, state, onLanguageChange, onGoToStore, onOpenLeaderboard, onOpenMatchHistory, onGoToFriends }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [scope, setScope] = useState<Scope>({ type: 'all' });
  const [mode, setMode] = useState<GameMode>('team-team');
  const [botPage, setBotPage] = useState<{ key: BotPage; dir: 1 | -1 }>({ key: 'bot', dir: 1 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSub, setMenuSub] = useState<'settings' | null>(null);
  const [botOpen, setBotOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const [socialPackPopup, setSocialPackPopup] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsUnread, setNewsUnread] = useState(false);
  // Show the bell's red pip until the user has opened the feed at the latest item.
  useEffect(() => {
    AsyncStorage.getItem(NEWS_READ_KEY).then((v) => setNewsUnread(v !== LATEST_NEWS_ID)).catch(() => {});
  }, []);
  const [joinCode, setJoinCode] = useState('');
  const [friendQuery, setFriendQuery] = useState('');
  // The query THIS card submitted. `state.userSearchResults` is global and is never reset
  // (useCrossover.ts only ever writes it on user_search_results), so without this the card
  // would show a hit left behind by the Friends tab before the user searched anything here.
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [hero, setHero] = useState({ w: 0, h: 0 });
  const [railW, setRailW] = useState(0);
  // 🧪 TEMP DEBUG — maç-sonu ve arena popup önizlemesi (kaldırılacak)
  const [demo, setDemo] = useState<'win' | 'loss' | 'arena' | null>(null);

  const opts: GameOptions = { scope, mode };
  const profile = state.profile;
  const hasPack = !!(profile?.socialPackUntil && new Date(profile.socialPackUntil) > new Date());
  const playerName = profile?.displayName ?? t('home.namePlaceholder');
  const trophies = profile?.trophies ?? 0;

  // 🧪 Arena elmas ödülü animasyonu: kutlamayı kapatınca elmaslar üstteki elmas
  // çubuğuna uçar → çubuk soldan sağa dolar → sayı ödül kadar yükselir.
  const ARENA_DEMO_REWARD = 100;
  const gemCountAnim = useRef(new Animated.Value(profile?.diamonds ?? 0)).current;
  const gemFillAnim = useRef(new Animated.Value(0)).current;
  const gemPillRef = useRef<View>(null);
  const gemAnimating = useRef(false);
  // Keep the pill synced to the real balance whenever we're NOT mid-reward-animation.
  useEffect(() => {
    if (!gemAnimating.current) gemCountAnim.setValue(profile?.diamonds ?? 0);
  }, [profile?.diamonds, gemCountAnim]);
  const startArenaDemo = useCallback(() => {
    // Register the pill's on-screen centre so the celebration's gems fly onto it.
    gemPillRef.current?.measureInWindow((x, y, w, h) => { if (w > 0 && h > 0) setGemTarget(x + w * 0.5, y + h * 0.55); });
    setDemo('arena');
  }, []);
  const finishArenaDemo = useCallback(() => {
    setDemo(null);
    const start = profile?.diamonds ?? 0;
    const end = start + ARENA_DEMO_REWARD;
    gemAnimating.current = true;
    gemCountAnim.setValue(start);
    gemFillAnim.setValue(0);
    Animated.parallel([
      Animated.timing(gemCountAnim, { toValue: end, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.sequence([
        Animated.timing(gemFillAnim, { toValue: 1, duration: 880, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(gemFillAnim, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    ]).start(() => { gemAnimating.current = false; });
  }, [profile?.diamonds, gemCountAnim, gemFillAnim]);

  // 🏆 Kupa ödülü animasyonu (elmasların kupa karşılığı): KAZANINCA kupalar ekranın
  // ortasında belirir → kupa göstergesine uçar → gösterge dolar → sayı ödül kadar
  // artar. KAYBEDİNCE gösterge animasyonsuz düşer.
  const WIN_TROPHY_DELTA = 30;
  const LOSS_TROPHY_DELTA = 18;
  const trophyCountAnim = useRef(new Animated.Value(profile?.trophies ?? 0)).current;
  const trophyFillAnim = useRef(new Animated.Value(0)).current;
  const trophyBadgeRef = useRef<View>(null);
  const trophyAnimating = useRef(false);
  const [trophyFly, setTrophyFly] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!trophyAnimating.current) trophyCountAnim.setValue(profile?.trophies ?? 0);
  }, [profile?.trophies, trophyCountAnim]);
  // Trophies have landed on the counter → sweep the fill up-and-back and tick the number up.
  const finishTrophyWin = useCallback(() => {
    const start = profile?.trophies ?? 0;
    const end = start + WIN_TROPHY_DELTA;
    trophyAnimating.current = true;
    trophyCountAnim.setValue(start);
    trophyFillAnim.setValue(0);
    Animated.parallel([
      Animated.timing(trophyCountAnim, { toValue: end, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.sequence([
        Animated.timing(trophyFillAnim, { toValue: 1, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(trophyFillAnim, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    ]).start(() => { trophyAnimating.current = false; setTrophyFly(null); });
  }, [profile?.trophies, trophyCountAnim, trophyFillAnim]);
  // Closing the match popup: a WIN throws trophies onto the counter (fly → fill →
  // rise); a LOSS just drops the number with no animation, as requested.
  const dismissMatchDemo = useCallback(() => {
    const was = demo;
    setDemo(null);
    if (was === 'win') {
      trophyBadgeRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) setTrophyFly({ x: x + w * 0.5, y: y + h * 0.34 });
        else finishTrophyWin();
      });
    } else if (was === 'loss') {
      trophyAnimating.current = true;
      trophyCountAnim.setValue(Math.max(0, (profile?.trophies ?? 0) - LOSS_TROPHY_DELTA));
      trophyAnimating.current = false;
    }
  }, [demo, profile?.trophies, trophyCountAnim, finishTrophyWin]);

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

  const startMode = useCallback((m: GameMode) => {
    if (PACK_MODES.includes(m) && !hasPack) {
      setModesOpen(false);
      setSocialPackPopup(true);
      return;
    }
    setModesOpen(false);
    actions.findMatch({ mode: m });
  }, [actions, hasPack]);

  // searchUsers is an EXACT display-name lookup server-side (rank.ts:624,
  // `lower(display_name) = lower($1)`), so searching per keystroke would read as
  // broken for every partial name. Fire on submit only, and say so in the hint.
  const runSearch = useCallback(() => {
    const q = friendQuery.trim();
    if (q.length < 2) return;
    setSubmitted(q);
    actions.searchUsers(q);
  }, [friendQuery, actions]);

  // Three across, as the mockup — the row is (3 cards + 2 gaps) wide.
  const cardW = railW > 0 ? (railW - 2 * CAROUSEL_GAP) / 3 : 0;
  const codeReady = joinCode.length === ROOM_CODE_LEN;
  // searchUsers is an exact display-name match (server/src/game/rank.ts:624), so a result
  // belongs to this card only when it equals the query we submitted.
  const hit = submitted
    ? state.userSearchResults.find((u) => u.displayName.toLowerCase() === submitted.toLowerCase())
    : undefined;

  return (
    <Screen scroll pad={16} contentCenter={false}>
      {/* ── 1. TOP BAR ── one row, exactly as the mockup: the profile pill flexes to
           absorb whatever the fixed-width gem pill and button trio leave behind. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ProfilePill
          name={playerName}
          avatarId={profile?.avatar ?? profile?.selectedAvatar}
          tier={tierNo}
          pct={arenaPct}
          color={arenaC}
          onPress={actions.openProfile}
        />
        <GemPill count={profile?.diamonds ?? 0} onPress={() => onGoToStore?.('diamonds')} countAnim={gemCountAnim} fillAnim={gemFillAnim} innerRef={gemPillRef} />
        {SCREEN_W >= TOPBAR_ROOMY_W ? (
          <RoundIconBtn icon="ribbon" tint={hasPack ? theme.accent : theme.text} onPress={() => onGoToStore?.('socialPack')} />
        ) : null}
        <RoundIconBtn icon="notifications" dot={newsUnread} onPress={() => { setNewsOpen(true); setNewsUnread(false); AsyncStorage.setItem(NEWS_READ_KEY, LATEST_NEWS_ID).catch(() => {}); }} />
        <RoundIconBtn icon="settings-sharp" onPress={() => { setMenuSub(null); setMenuOpen(true); }} />
      </View>

      {/* 🧪 TEMP DEBUG — 3 test butonu: maç-sonu kazanma/kaybetme + arena atlama popup'ları.
          Bu blok yalnızca popup'ları önizlemek için; kaldırılacak. */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable onPress={() => setDemo('win')} style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: theme.primaryDark }}>
          <Text style={{ color: theme.ink, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>🏆 Kazanma</Text>
        </Pressable>
        <Pressable onPress={() => setDemo('loss')} style={{ flex: 1, backgroundColor: theme.danger, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: theme.dangerDark }}>
          <Text style={{ color: '#fff', fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>😢 Kaybetme</Text>
        </Pressable>
        <Pressable onPress={startArenaDemo} style={{ flex: 1, backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: theme.accentDark }}>
          <Text style={{ color: theme.ink, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>⬆️ Arena</Text>
        </Pressable>
      </View>

      {/* 🧪 TEMP DEBUG — maç-sonu banner önizlemesi (kazanma/kaybetme) */}
      <Modal visible={demo === 'win' || demo === 'loss'} transparent animationType="fade" onRequestClose={dismissMatchDemo}>
        <Pressable onPress={dismissMatchDemo} style={{ flex: 1, backgroundColor: theme.scrim, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          {demo === 'win' ? (
            <MatchOverBanner youWon youScore={3} oppScore={1} youWrong={0} oppWrong={0} winnerName={playerName} trophyDelta={{ delta: WIN_TROPHY_DELTA, trophies: trophies + WIN_TROPHY_DELTA }} />
          ) : demo === 'loss' ? (
            <MatchOverBanner youWon={false} youScore={1} oppScore={3} youWrong={0} oppWrong={0} winnerName="Bot" trophyDelta={{ delta: -LOSS_TROPHY_DELTA, trophies: Math.max(0, trophies - LOSS_TROPHY_DELTA) }} />
          ) : null}
          <Text style={{ color: theme.muted, marginTop: 18, fontSize: 12 }}>Kapatmak için dokun</Text>
        </Pressable>
      </Modal>

      {/* 🏆 Kupa uçuşu — kazanma popup'ı kapanınca kupalar göstergeye uçar */}
      {trophyFly ? <TrophyFly target={trophyFly} onDone={finishTrophyWin} /> : null}

      {/* 🧪 TEMP DEBUG — arena atlama kutlaması önizlemesi */}
      {demo === 'arena' ? (
        <DiamondCelebration amount={ARENA_DEMO_REWARD} variant="arenaReward" arenaName="Amatör Lig" onDone={finishArenaDemo} />
      ) : null}

      {/* ── 2. HERO ── */}
      <View
        onLayout={(e) => setHero({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        // minHeight must clear the absolutely-positioned rail: top(2) + 2 badges (44 circle
        // + 14.5 chip overlap) + 12 gap = 131. Anything less and the rail spills onto the CTA.
        style={{ alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 2, minHeight: 134 }}
      >
        <HeroConfetti w={hero.w} h={hero.h} />
        <BrandBalls size={Math.min(104, SCREEN_W * 0.26)} />
        {/* the wordmark tucks UNDER the balls, as in the mockup */}
        <View style={{ marginTop: -22 }}>
          <Wordmark size={wordmarkSize(SCREEN_W - 32)} />
        </View>
        <View style={{ position: 'absolute', right: 0, top: 2, gap: 12 }}>
          <RailBadge icon="trophy" iconColor={theme.gold} ringColor={theme.purple} value={String(trophies)} onPress={actions.openArenas} countAnim={trophyCountAnim} fillAnim={trophyFillAnim} innerRef={trophyBadgeRef} />
          <RailBadge icon="podium" iconColor={theme.accent} ringColor={theme.accentDark} value={String(profile?.wins ?? 0)} onPress={() => onOpenLeaderboard?.()} />
        </View>
      </View>

      {!isNetworkErrorMessage(state.error) && state.error ? <ErrorBanner message={state.error} /> : null}

      {/* ── 3. CTA ── */}
      <HeroPlayBtn label={t('home.quickMatch')} onPress={() => actions.findMatch({ mode: 'team-team' })} />

      {/* ── 4. GRID ── */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
        <ArtCard
          title={t('home.modesTitle')}
          tint={theme.amber}
          height={142}
          onPress={() => setModesOpen(true)}
          art={
            <View style={StyleSheet.absoluteFill}>
              {/* a faint sun glow so the amber face isn't flat, then the squad filling
                  the card — big enough that the card no longer reads as empty */}
              <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: -20, right: -20, height: 120 }}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <RadialGradient id="amberGlow" cx="50%" cy="40%" r="60%">
                      <Stop offset="0" stopColor={lighten(theme.amber, 0.4)} stopOpacity={0.9} />
                      <Stop offset="1" stopColor={theme.amber} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#amberGlow)" />
                </Svg>
              </View>
              <Image source={EMOTE_ART.squad} resizeMode="contain" style={{ position: 'absolute', alignSelf: 'center', bottom: 22, width: '104%', height: '90%' }} />
            </View>
          }
        />
        {/* Özel Mod — the private-room flow. createRoom/joinRoom have existed in
            useCrossover (797/826) with a working LobbyScreen, but nothing in the UI
            had called them; this panel is their entry point. */}
        <GhostPanel title={t('home.specialMode')} ghost="key" height={142}>
          <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', marginTop: 9 }} numberOfLines={1}>{t('home.roomCodeLabel')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
            <TextInput
              value={joinCode}
              onChangeText={(v) => setJoinCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN))}
              onSubmitEditing={() => { if (codeReady) { actions.joinRoom(joinCode, playerName); setJoinCode(''); } }}
              placeholder={t('home.codePlaceholder')}
              placeholderTextColor={withAlpha(theme.muted, 0.5)}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              style={{
                flex: 1, height: 34, borderRadius: 11, backgroundColor: theme.navyWell,
                borderWidth: 1.5, borderColor: theme.border,
                color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 12.5, letterSpacing: 1.2,
                paddingHorizontal: 8, textAlign: 'center',
              }}
            />
            <Pressable
              disabled={!codeReady}
              onPress={() => { actions.joinRoom(joinCode, playerName); setJoinCode(''); }}
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
            onPress={() => actions.createRoom(playerName, opts)}
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

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'flex-end' }}>
        <ArtCard
          title={arenaLabel(profile?.arena.name ?? '')}
          tint={theme.card}
          height={96}
          onPress={actions.openArenas}
          art={
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
              <Text style={{ position: 'absolute', left: 11, top: 9, color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }} numberOfLines={1}>
                {nextTier ? `${trophies}/${nextTier.min} 🏆` : t('home.topArena')}
              </Text>
            </View>
          }
        />
        <GhostPanel
          title={t('home.solo')}
          icon="people"
          ghost="game-controller"
          height={96}
          onPress={() => { setBotPage({ key: 'bot', dir: 1 }); setBotOpen(true); }}
        >
          <Text style={{ color: theme.muted, fontSize: 11.5, fontFamily: 'Poppins-SemiBold', marginTop: 6 }} numberOfLines={2}>{t('home.soloShort')}</Text>
        </GhostPanel>
      </View>

      {/* ── 5. CAROUSEL ── */}
      {/* marginBottom clears the tab bar's raised centre ball, which breaks ~18pt above
          the bar and would otherwise sit on this strip's captions. */}
      <View onLayout={(e) => setRailW(e.nativeEvent.layout.width)} style={{ marginTop: 10, marginBottom: 18 }}>
        {cardW > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardW + CAROUSEL_GAP}
            decelerationRate="fast"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: CAROUSEL_GAP }}
          >
            <View style={{ width: cardW }}>
              <ArtCard
                title={hasPack ? t('store.badgeActive') : t('store.socialPackTitle')}
                tint={theme.purple}
                height={128}
                onPress={() => onGoToStore?.('socialPack')}
                art={
                  <View style={StyleSheet.absoluteFill}>
                    <Image source={EMOTE_ART.squad} resizeMode="contain" style={{ position: 'absolute', right: -2, top: 26, width: '74%', height: '58%' }} />
                    <Text style={{ position: 'absolute', left: 11, top: 10, color: theme.text, fontSize: 11, fontFamily: 'Poppins-SemiBold', width: '58%', ...engrave('sm') }} numberOfLines={3}>
                      {t('home.socialPackShort')}
                    </Text>
                  </View>
                }
              />
            </View>
            <View style={{ width: cardW }}>
              <ArtCard
                title={t('menu.leaderboard')}
                tint={theme.blue}
                height={128}
                onPress={() => onOpenLeaderboard?.()}
                art={
                  <View style={StyleSheet.absoluteFill}>
                    <Image source={EMOTE_ART.worldcup} resizeMode="contain" style={{ position: 'absolute', right: -2, top: 24, width: '60%', height: '58%' }} />
                    <Text style={{ position: 'absolute', left: 11, top: 10, color: theme.text, fontSize: 11, fontFamily: 'Poppins-SemiBold', width: '58%', ...engrave('sm') }} numberOfLines={3}>
                      {t('home.leaderboardHint')}
                    </Text>
                  </View>
                }
              />
            </View>
            {/* Find a friend. Unlike the in-room player search (search_players, handled
                only inside a room), search_users is served top-level at ws/server.ts:489
                — so it genuinely works from home. */}
            <View style={{ width: cardW }}>
              <View style={{ backgroundColor: darken(theme.card, 0.52), borderRadius: 20, paddingBottom: 3 }}>
                <View style={{ height: 128, borderRadius: 18, backgroundColor: theme.card, borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.14)', padding: 11 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} numberOfLines={1}>{t('home.findFriends')}</Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
                    height: 32, borderRadius: 16, backgroundColor: theme.navyWell,
                    borderWidth: 1.5, borderColor: theme.border, paddingHorizontal: 9,
                  }}>
                    <Ionicons name="search" size={13} color={theme.muted} />
                    <TextInput
                      value={friendQuery}
                      onChangeText={(v) => { setFriendQuery(v); setSubmitted(null); }}
                      onSubmitEditing={runSearch}
                      placeholder={t('friends.usernamePlaceholder')}
                      placeholderTextColor={withAlpha(theme.muted, 0.5)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                      style={{ flex: 1, color: theme.text, fontFamily: 'Poppins-SemiBold', fontSize: 11.5, padding: 0 }}
                    />
                    <Pressable onPress={runSearch} hitSlop={6} disabled={friendQuery.trim().length < 2}>
                      <Ionicons name="arrow-forward-circle" size={19} color={friendQuery.trim().length < 2 ? theme.muted : theme.primary} />
                    </Pressable>
                  </View>
                  {hit ? (
                    <View style={{ marginTop: 9, gap: 6 }}>
                      {/* No avatar: user_search_results carries only { userId, displayName }
                          (protocol.ts:224), so an avatar here is always the generic fallback —
                          and at this card's width it would starve the name it identifies. */}
                      <Text style={{ color: theme.text, fontSize: 11.5, fontFamily: 'Poppins-ExtraBold' }} numberOfLines={1}>{hit.displayName}</Text>
                      <Pressable
                        onPress={() => actions.sendFriendRequest(undefined, hit.displayName)}
                        style={({ pressed }) => ({
                          height: 28, borderRadius: 14, backgroundColor: theme.primary,
                          borderBottomWidth: 2, borderBottomColor: theme.primaryDark,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                          transform: [{ translateY: pressed ? 2 : 0 }],
                        })}
                      >
                        <Ionicons name="person-add" size={12} color={theme.ink} />
                        <Text style={{ color: theme.ink, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold' }} numberOfLines={1}>{t('friends.sendRequest')}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={{ color: theme.muted, fontSize: 10.5, fontFamily: 'Poppins-SemiBold', marginTop: 10 }} numberOfLines={3}>
                      {submitted ? t('home.findFriendsNone') : t('home.findFriendsHint')}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>

      <NetworkErrorBeacon visible={isNetworkErrorMessage(state.error)} />

      {/* ── Mode picker ── */}
      <GameModal visible={modesOpen} onClose={() => setModesOpen(false)} title={t('home.modesTitle').toLocaleUpperCase(currentLang())} icon="football">
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 6 }]}>{t('home.specialModeBody')}</Text>
        {HOME_MODES.map((m) => {
          const locked = PACK_MODES.includes(m) && !hasPack;
          const c = m === 'team-team' ? theme.primary : m === 'player-player' ? theme.accent : m === 'country-team' ? theme.blue : theme.purple;
          return (
            <GameRow
              key={m}
              icon={MODE_ICON[m]}
              iconColor={c}
              tint={locked ? undefined : c}
              label={MODE_LABEL(m)}
              locked={locked}
              chevron={!locked}
              onPress={() => startMode(m)}
            />
          );
        })}
      </GameModal>

      {/* ── Hamburger menu ── */}
      <GameModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={(menuSub === 'settings' ? t('settings.title') : t('menu.title')).toLocaleUpperCase(currentLang())}
        icon={menuSub === 'settings' ? 'settings' : 'menu'}
      >
        <ModalPager pageKey={menuSub ?? 'menu'} dir={menuSub ? 1 : -1}>
          {menuSub === null ? (
            <>
              <GameRow icon="podium" label={t('menu.leaderboard')} chevron onPress={() => { setMenuOpen(false); onOpenLeaderboard?.(); }} />
              <GameRow icon="time" iconColor={theme.blue} label={t('menu.matchHistory')} chevron onPress={() => { setMenuOpen(false); onOpenMatchHistory?.(); }} />
              <GameRow icon="settings" iconColor={theme.muted} label={t('settings.title')} chevron onPress={() => setMenuSub('settings')} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <ModalBackBtn onPress={() => setMenuSub(null)} />
              </View>
              <ScrollView style={{ maxHeight: 430 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <SettingsPanel
                  onLanguageChange={() => { setMenuOpen(false); onLanguageChange?.(); }}
                  diamonds={profile?.diamonds ?? 0}
                  onChangeName={(newName) => actions.changeName(newName)}
                  onNeedDiamonds={() => { setMenuOpen(false); onGoToStore?.('diamonds'); }}
                  onLogout={() => { setMenuOpen(false); void actions.logout(); }}
                />
              </ScrollView>
            </>
          )}
        </ModalPager>
      </GameModal>

      {/* ── Bot match — difficulty home + mode/scope pages inside ONE modal ── */}
      <GameModal
        visible={botOpen}
        onClose={() => setBotOpen(false)}
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
                    onPress={() => { setDifficulty(d); setBotOpen(false); actions.createSolo(playerName, { ...opts, difficulty: d }); }}
                  />
                );
              })}
            </>
          ) : botPage.key === 'mode' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <ModalBackBtn onPress={() => setBotPage({ key: 'bot', dir: -1 })} />
              </View>
              {(['team-team', 'country-team', 'letter-team'] as GameMode[]).map((m) => (
                <GameRow key={m} icon={MODE_ICON[m]} label={MODE_LABEL(m)} selected={mode === m} onPress={() => { setMode(m); setBotPage({ key: 'bot', dir: -1 }); }} />
              ))}
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

      <GameModal visible={socialPackPopup} onClose={() => setSocialPackPopup(false)} title={t('friends.socialPackRequired')} icon="lock-closed">
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 8 }]}>{t('home.specialModeLocked')}</Text>
        <Btn label={t('friends.goToStore')} kind="accent" icon="storefront" onPress={() => { setSocialPackPopup(false); onGoToStore?.('socialPack'); }} />
      </GameModal>
    </Screen>
  );
}

// Searchable league/country scope list — one page shared by the bot dialog (home)
// and the friendly-match dialog (friends). Skeletons while scopes load; crafted
// EmptyState for no results. Key it by `kind` so the search resets per page.
function ScopeListPage({ kind, scopes, onPick }: {
  kind: 'league' | 'country';
  scopes: GameState['scopes'];
  onPick: (s: Scope) => void;
}) {
  const allList = kind === 'league' ? scopes?.leagues ?? [] : scopes?.countries ?? [];
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? allList.filter((o) => (o.displayName ?? o.value).toLowerCase().includes(search.toLowerCase()))
    : allList;
  const countChip = (count: number) => (
    <View style={{ backgroundColor: theme.cardLip, borderRadius: 8, borderWidth: 1, borderColor: theme.accentDark, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: theme.accent, fontSize: 10, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{count}</Text>
    </View>
  );
  return (
    <>
      <GameInput
        icon="search"
        placeholder={kind === 'league' ? t('scope.searchLeague') : t('scope.searchCountry')}
        value={search}
        onChangeText={setSearch}
        autoFocus
      />
      <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {allList.length === 0 ? (
          // Loading skeleton — never confused with "empty".
          <SkeletonRows rows={3} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title={t('common.noResults')} />
        ) : (
          filtered.map((o) => (
            <GameRow
              key={o.value}
              leading={
                kind === 'league' && o.logoUrl ? (
                  <CachedImage uri={o.logoUrl} style={{ width: 24, height: 24 }} contentFit="contain" />
                ) : kind === 'country' && o.logoUrl ? (
                  <Text style={{ fontSize: 18 }}>{o.logoUrl}</Text>
                ) : (
                  <Ionicons name={kind === 'league' ? 'trophy' : 'flag'} size={18} color={theme.muted} />
                )
              }
              label={o.displayName ?? o.value}
              right={countChip(o.count)}
              onPress={() => onPick({ type: kind === 'league' ? 'league' : 'country', value: o.value })}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

// ---- Lobby ----
function LeaveConfirmModal({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <GameModal visible={visible} onClose={onCancel} title={t('leave.bannerTitle')} icon="warning" danger>
      <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') }}>
        {t('leave.confirmTitle')}
      </Text>
      <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19 }}>
        {t('leave.confirmBody')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Btn label={t('leave.cancel')} kind="ghost" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn label={t('leave.confirm')} kind="danger" onPress={onConfirm} />
        </View>
      </View>
    </GameModal>
  );
}

export function OpponentForfeitModal({ visible, onFindNew, onGoHome, trophyDelta }: { visible: boolean; onFindNew: () => void; onGoHome: () => void; trophyDelta?: { delta: number; trophies: number } | null }) {
  return (
    <GameModal visible={visible} onClose={onGoHome} title={t('opponent.bannerTitle')} icon="exit">
      {/* Exit icon in a beveled medallion (card face + accent ring + soft gold glow) */}
      <View
        style={{
          alignSelf: 'center', width: 64, height: 64, borderRadius: 32,
          backgroundColor: theme.card, borderWidth: 2, borderColor: theme.accent,
          borderTopColor: lighten(theme.accent, 0.3), borderBottomColor: theme.accentDark,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: theme.accent, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6,
        }}
      >
        <Ionicons name="exit-outline" size={30} color={theme.accent} />
      </View>
      <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 19 }}>
        {t('opponent.leftTitle')}
      </Text>
      {/* Forfeit is always a win for whoever stays → show the trophies gained (chip
          shows +delta and the new total), mirroring the match-over screen. */}
      {trophyDelta && trophyDelta.delta ? (
        <View style={{ alignItems: 'center' }}>
          <TrophyDeltaChip delta={trophyDelta.delta} trophies={trophyDelta.trophies} />
        </View>
      ) : null}
      <Btn label={t('opponent.findNew')} icon="flash" onPress={onFindNew} />
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
          <Avatar avatar={p.id === room.youId ? (p.avatar ?? state.profile?.avatar) : p.avatar} name={p.name} size={32} ring={p.isHost ? theme.accent : theme.primary} iconColor={p.isHost ? theme.accent : theme.muted} iconSize={18} />
          <Text style={styles.lobbyName}>
            {p.name}
            {p.id === room.youId ? t('lobby.youSuffix') : ''}
          </Text>
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
      <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
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
        borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.55)',
        borderBottomWidth: 4, borderBottomColor: theme.accentDark,
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

  const renderPlayer = (p: typeof you, color: string, slideY: Animated.AnimatedInterpolation<number>, fallbackAvatar?: string | null) => (
    <Animated.View style={{ transform: [{ translateY: slideY }], opacity: anim, alignSelf: 'stretch' }}>
      <GamePanel compact tint={color} bodyStyle={{ alignItems: 'center', gap: 6, paddingVertical: 14 }}>
        <Avatar avatar={p?.avatar ?? fallbackAvatar} name={p?.name} size={64} ring={color} ringWidth={3} bg={theme.card} iconColor={color} iconSize={30} />
        <Text style={{ color: theme.text, fontSize: 18, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} numberOfLines={1}>{p?.name ?? '?'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="trophy" size={15} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 14, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{p?.trophies ?? 0}</Text>
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
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Text style={{ color: theme.accent, fontSize: 14, fontFamily: 'Poppins-ExtraBold', letterSpacing: 3, textTransform: 'uppercase', ...engrave('lg') }}>{t('matchup.title')}</Text>
        {renderPlayer(opp, oppColor, oppSlide)}
        <Animated.View style={{ transform: [{ scale: vsScale }] }}>
          <VsBadge size={50} />
        </Animated.View>
        {renderPlayer(you, youColor, youSlide, state.profile?.avatar)}
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
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: 14,
        backgroundColor: pressed ? theme.bg2 : theme.card,
        borderWidth: 2, borderColor: theme.border,
        borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateY: pressed ? 2 : 0 }],
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
  return (
    <GamePanel compact style={{ flex: 1 }} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5, paddingHorizontal: 10 }}>
      <Avatar avatar={opp.avatar} name={opp.name} size={30} ring={color} ringWidth={2} iconColor={color} iconSize={15} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{opp.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="trophy" size={10} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 10, fontFamily: 'Poppins-SemiBold', letterSpacing: 0.5, fontVariant: ['tabular-nums'] }}>{opp.trophies ?? 0}</Text>
        </View>
      </View>
      {/* Running score — recessed well; your side leads in mint */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.panelInnerFill, borderRadius: 10, borderWidth: 1.5, borderColor: theme.border, borderTopColor: theme.cardLip, paddingHorizontal: 10, paddingVertical: 2 }}>
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
  const n = state.countdown ?? 0;
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
  }, [n, a]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] });
  return (
    <Screen>
      <View style={styles.center}>
        <View style={{ width: 172, height: 172, borderRadius: 86, borderWidth: 5, borderColor: theme.primary, borderTopColor: lighten(theme.primary, 0.35), borderBottomColor: theme.primaryDark, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panelInk, shadowColor: theme.primary, shadowOpacity: 0.65, shadowRadius: 28, shadowOffset: { width: 0, height: 0 }, elevation: 18 }}>
          <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: theme.card, borderWidth: 2, borderColor: withAlpha(theme.primary, 0.33), alignItems: 'center', justifyContent: 'center' }}>
            <Animated.Text style={{ color: theme.text, fontSize: n > 0 ? 88 : 50, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], transform: [{ scale }], opacity: a, ...engrave('lg') }}>
              {n > 0 ? n : 'GO!'}
            </Animated.Text>
          </View>
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
        backgroundColor: theme.panelInnerFill, borderRadius: 14,
        borderWidth: 2, borderColor: theme.border, borderTopColor: theme.cardLip,
        paddingVertical: 4, paddingHorizontal: 14,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) }],
      }, style]}
    >
      <Ionicons name="time-outline" size={16} color={color} />
      <Text style={{ color, fontSize: 22, fontFamily: 'Poppins-Black', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{shown}</Text>
    </Animated.View>
  );
}

function PickTimer({ pickEndsAt }: { pickEndsAt: number | null }) {
  return <MatchTimer endsAt={pickEndsAt} urgentAt={3} fallbackSecs={10} style={{ marginTop: 6 }} />;
}

// What the local player chose this round — kept as UI state so the waiting
// screen can render the pick large (the server only echoes `picked: true`).
type LastPick =
  | { kind: 'team'; label: string; logoUrl: string | null }
  | { kind: 'player'; label: string; imageUrl: string | null }
  | { kind: 'country'; label: string; flag: string }
  | { kind: 'letter'; label: string };

export function PickTeamScreen({ state, actions, tutorial }: Props) {
  const [q, setQ] = useState('');
  const [countryQ, setCountryQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const role = state.pickRole ?? 'team';
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [lastPick, setLastPick] = useState<LastPick | null>(null);
  const hasBot = state.room?.players.some((p) => p.name === 'Bot');
  const handleLeave = () => hasBot ? actions.leave() : setShowLeaveConfirm(true);

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

  // Top chrome shared by every pick state: exit button + opponent HUD, then title + timer.
  const header = (title: string) => (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 8 }}>
        <MatchExitButton onPress={handleLeave} />
        <PlayerBar state={state} onEmotePress={tutorial ? undefined : () => setEmoteOpen(true)} />
      </View>
      <View style={{ alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.h1}>{title}</Text>
        <PickTimer pickEndsAt={state.pickEndsAt} />
      </View>
    </>
  );
  const emoteLayer = !tutorial ? (
    <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} />
  ) : null;
  const leaveModal = (
    <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
  );

  if (state.picked) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 8 }}>
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
      <Screen>
        {header(t('pick.titlePlayer'))}
        <GameInput
          icon="search"
          placeholder={t('pick.searchPlayer')}
          value={q}
          onChangeText={onPlayerChange}
          autoFocus={!tutorial}
        />
        <ScrollView style={{ alignSelf: 'stretch', flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {state.playerResults.map((p: PlayerRef) => (
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
          ))}
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
      <Screen>
        {header(t('pick.titleLetter'))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {PICK_LETTERS.map((l) => (
            <Pressable
              key={l}
              style={({ pressed }) => ({
                width: 48, height: 48, borderRadius: 12,
                backgroundColor: theme.card,
                borderWidth: 2, borderColor: theme.border, borderTopColor: theme.panelTopGloss,
                borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 4,
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
    // Turkish-insensitive search: normalize İ→i, Ş→s, Ü→u, Ö→o, Ç→c, Ğ→g, ı→i
    const trLower = (s: string) =>
      s.replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
        .replace(/[ŞşŞ]/g, 's').replace(/[ÜüÜ]/g, 'u').replace(/[ÖöÖ]/g, 'o')
        .replace(/[ÇçÇ]/g, 'c').replace(/[ĞğĞ]/g, 'g').toLowerCase();
    const filtered = countryQ.trim()
      ? NATIONALITIES.filter((n) => {
          const q = trLower(countryQ);
          return trLower(n.displayName).includes(q) || trLower(n.value).includes(q);
        })
      : NATIONALITIES;
    return (
      <Screen>
        {header(t('pick.titleCountry'))}
        <GameInput
          icon="search"
          placeholder={t('pick.searchCountry')}
          value={countryQ}
          onChangeText={setCountryQ}
          autoFocus={!tutorial}
        />
        <ScrollView style={{ alignSelf: 'stretch', flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {filtered.map((n) => (
            <GameRow
              key={n.value}
              leading={<Text style={{ fontSize: 18 }}>{n.flag}</Text>}
              label={n.displayName}
              chevron
              onPress={() => { setLastPick({ kind: 'country', label: n.displayName, flag: n.flag }); actions.pickCountry(n.value); }}
            />
          ))}
          {filtered.length === 0 && countryQ.trim() ? (
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
    <Screen>
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
        contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8, paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {state.clubResults.map((c: ClubRef) => (
          <Pressable
            key={c.id}
            onPress={() => { setLastPick({ kind: 'team', label: c.name, logoUrl: c.logoUrl ?? null }); actions.pickTeam(c.id); }}
            style={({ pressed }) => ({
              width: '31.5%' as const, alignItems: 'center' as const, gap: 7,
              backgroundColor: theme.card, borderRadius: 14,
              borderWidth: 2, borderColor: theme.border, borderTopColor: theme.panelTopGloss,
              borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
              paddingVertical: 12, paddingHorizontal: 4,
              shadowColor: '#000', shadowOpacity: pressed ? 0.15 : 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: pressed ? 2 : 4,
              transform: [{ translateY: pressed ? 2 : 0 }],
            })}
          >
            <ClubBadge name={c.name} size={46} logoUrl={c.logoUrl} />
            <Text style={{ color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }} numberOfLines={2}>
              {c.name}
            </Text>
          </Pressable>
        ))}
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

export function GuessScreen({ state, actions, tutorial }: Props) {
  const [text, setText] = useState('');
  const teams = state.teams;
  const room = state.room!;
  const youAnswered = state.locked?.byId === room.youId;
  const someoneElseAnswered = state.locked && state.locked.byId !== room.youId;
  const youPassed = state.passedBy.includes(room.youId);
  const oppPassed = state.passedBy.some((id) => id !== room.youId);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const hasBot = room.players.some((p) => p.name === 'Bot');
  const handleLeave = () => hasBot ? actions.leave() : setShowLeaveConfirm(true);

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
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <MatchExitButton onPress={handleLeave} />
        <PlayerBar state={state} onEmotePress={tutorial ? undefined : () => setEmoteOpen(true)} />
      </View>
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
            <GuessStatusPanel
              icon="lock-closed"
              iconColor={theme.danger}
              stripe={theme.danger}
              text={t('guess.locked', { name: state.locked?.byName ?? '' })}
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
              <GameInput
                placeholder={state.revealMode === 'player-player' ? t('guess.placeholderClub') : t('guess.placeholder')}
                value={text}
                onChangeText={setText}
                autoFocus={!tutorial}
                editable={!youAnswered}
                returnKeyType="send"
                onSubmitEditing={() => text.trim() && actions.submitGuess(text.trim())}
              />
              <Btn
                label={t('guess.send')}
                icon="send"
                onPress={() => actions.submitGuess(text.trim())}
                disabled={!text.trim() || youAnswered}
              />
              <View style={{ height: 8 }} />
              <Btn
                label={t('guess.pass')}
                kind="ghost"
                icon="play-skip-forward"
                onPress={actions.pass}
                disabled={youAnswered}
              />
            </>
          )}
        </Animated.View>
      )}
      <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
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

export function DiamondCelebration({
  amount,
  img,
  onDone,
  variant = 'purchase',
  arenaName,
}: {
  amount: number;
  img?: ImageSourcePropType;
  onDone: () => void;
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

  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;
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
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
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
              overflow: 'hidden',
              shadowColor: theme.gem, shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 18,
            }}
          >
            <View style={{ backgroundColor: theme.card, borderRadius: 20, overflow: 'hidden', borderBottomWidth: 3, borderBottomColor: theme.cardLip }}>
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
                          backgroundColor: theme.card, borderRadius: 12,
                          borderWidth: 1.5, borderColor: arenaVisual.color, borderTopColor: theme.panelTopGloss,
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: theme.panelInnerFill, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1.5, borderColor: theme.gem, borderTopColor: theme.cardLip }}>
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
    </Modal>
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
  { id: 'weekly', label: 'Haftalık', price: '₺24,99', productId: 'com.crossover.socialpack.weekly' },
  { id: 'monthly', label: 'Aylık', price: '₺89,99', productId: 'com.crossover.socialpack.monthly' },
];
const SOCIAL_PACK_IDS = SOCIAL_PACK.map((s) => s.productId);

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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.panelInnerFill, borderRadius: 12, borderWidth: 1.5, borderColor: theme.border, borderTopColor: theme.cardLip, paddingVertical: 10, paddingHorizontal: 12 }}>
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

function useAdState(onReward?: () => void) {
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

  const watchAd = async () => {
    // No AdMob SDK → grant reward directly (dev/Expo Go fallback)
    if (!RewardedAd) {
      const n = adsWatched + 1;
      setAdsWatched(n);
      await saveState(n);
      onRewardRef.current?.();
      return;
    }

    // Load and show a rewarded ad
    setAdLoading(true);
    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT);

    const unsubs: (() => void)[] = [];
    const cleanup = () => { unsubs.forEach((u) => u()); setAdLoading(false); };

    unsubs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, async () => {
      const n = adsWatched + 1;
      setAdsWatched(n);
      await saveState(n);
      onRewardRef.current?.();
    }));

    unsubs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show();
    }));

    unsubs.push(ad.addAdEventListener(AdEventType.ERROR, (error?: { code?: number; message?: string }) => {
      cleanup();
      setAdError({ code: String(error?.code ?? '?'), message: error?.message ?? '' });
    }));

    unsubs.push(ad.addAdEventListener(AdEventType.CLOSED, () => {
      cleanup();
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
function WeeklyCountdown() {
  const [now, setNow] = useState(() => Date.now());
  const [target, setTarget] = useState(() => nextWeeklyReset());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  let ms = target - now;
  if (ms <= 0) { const t = nextWeeklyReset(); setTarget(t); ms = t - now; }
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
        backgroundColor: theme.panelInnerFill, borderRadius: 999,
        borderWidth: 1.5, borderColor: theme.border, borderTopColor: theme.cardLip, // dark top = sunken
        paddingHorizontal: 9, paddingVertical: 3,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
      }}
    >
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
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: theme.bg2, borderWidth: 2, borderColor: theme.primary, borderBottomColor: theme.primaryDark, alignItems: 'center', justifyContent: 'center' }}>
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
      {size.w > 0 ? <ShineSweep width={size.w} height={size.h} loop delay={600} duration={900} loopGap={2800} opacity={0.16} band={0.24} /> : null}
    </GamePanel>
  );
}

// One diamond pack row: GamePanel compact tinted by the pack's escalation-ramp
// color; the whole card gets the 2px press-lip and the price is a real Btn
// (its `loading` prop covers the mid-purchase state — no bare spinners).
function DiamondPackRow({ pack, busy, inert, price, onBuy }: {
  pack: (typeof DIAMOND_PACKS)[number]; busy: boolean; inert: boolean; price: string; onBuy: () => void;
}) {
  const { ty, onIn, onOut } = usePressLip(2);
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
              </View>
            </View>
            <Btn compact kind="primary" label={price} loading={busy} disabled={inert} onPress={onBuy} />
          </View>
        </GamePanel>
        {pack.best ? (
          <Ribbon label={t('store.popular')} style={{ position: 'absolute', top: -7, right: 10, transform: [{ rotate: '-2deg' }], zIndex: 3 }} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

// Weekly emote shop row — raised-row bevel; unaffordable taps shake the row and
// surface the "not enough gems" dialog (which deep-links to the diamond packs).
function EmoteShopRow({ emote, owned, canAfford, onBuy, onBlocked }: {
  emote: EmoteMeta; owned: boolean; canAfford: boolean; onBuy: () => void; onBlocked: () => void;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  const runShake = useCallback(() => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [shake]);
  return (
    <Animated.View style={[styles.storeEmoteCard, { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] }) }] }]}>
      <View style={{ width: 56, height: 56 }}>
        <EmoteSticker id={emote.id} size={56} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.storeEmoteName}>{emote.premium?.name}</Text>
        <Text style={styles.storeEmoteDesc} numberOfLines={2}>{emote.premium?.desc}</Text>
      </View>
      {owned ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.panelInnerFill, borderRadius: 10, borderWidth: 1, borderColor: theme.primary, paddingHorizontal: 10, paddingVertical: 7 }}>
          <Ionicons name="checkmark-circle" size={15} color={theme.primary} />
          <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 12 }}>{t('store.owned')}</Text>
        </View>
      ) : (
        <Btn compact kind="primary" icon="diamond" label={String(emote.premium?.price ?? 0)} onPress={() => { if (canAfford) onBuy(); else { runShake(); onBlocked(); } }} />
      )}
    </Animated.View>
  );
}

export function StoreScreen({ state, actions, scrollToSection, onDiamondCelebration }: Props & { scrollToSection?: 'socialPack' | 'diamonds' | null }) {
  const profile = state.profile;
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
  const [activeSubId, setActiveSubId] = useState<string | null>(null); // active Social Pack plan id (StoreKit entitlement)
  const onPurchaseSuccess = useCallback(async (purchase: Purchase) => {
    const isSub = SOCIAL_PACK_IDS.includes(purchase.productId);
    try {
      const jws = purchase.purchaseToken ?? (await getTransactionJwsIOS(purchase.productId));
      if (!jws) throw new Error('no-jws');
      await actions.verifyPurchase(jws);
      await iapFinishTransaction({ purchase, isConsumable: !isSub });
      track('purchase_success', { productId: purchase.productId, kind: isSub ? 'subscription' : 'diamonds' });
      // Trigger celebration animation for diamond purchases
      if (!isSub) {
        const pack = DIAMOND_PACKS.find((p) => p.productId === purchase.productId);
        if (pack) onDiamondCelebration?.({ amount: pack.amount, img: pack.img });
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
    track('purchase_error', { code });
    if (!/cancel/i.test(code)) openStoreDialog({ title: t('store.purchaseFailedTitle'), body: t('store.purchaseFailedBody'), icon: 'alert-circle', danger: true });
  }, [openStoreDialog]);
  const { connected, products, subscriptions, requestPurchase, fetchProducts } = useIAP({ onPurchaseSuccess, onPurchaseError });
  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: DIAMOND_PRODUCT_IDS, type: 'in-app' }).catch(() => {});  // consumables
    fetchProducts({ skus: SOCIAL_PACK_IDS, type: 'subs' }).catch(() => {});         // auto-renewable
    // Replay any unfinished/available transactions (auto-renewed Social Pack, restores, or a
    // purchase whose grant failed before) — verify each by its JWS so the server grants + we
    // can finish them. granted-0 → no toast (see the reducer).
    getAvailablePurchases().then(async (ps: Purchase[]) => {
      // Which Social Pack plan (if any) the user currently owns — used to show
      // "extend / upgrade / switch" instead of a first-time purchase.
      const sub = (ps ?? []).find((p) => SOCIAL_PACK_IDS.includes(p.productId));
      setActiveSubId(sub ? sub.productId : null);
      for (const p of ps ?? []) {
        const jws = p.purchaseToken ?? (await getTransactionJwsIOS(p.productId));
        if (!jws) continue;
        try {
          await actions.verifyPurchase(jws);
          await iapFinishTransaction({ purchase: p, isConsumable: !SOCIAL_PACK_IDS.includes(p.productId) });
        } catch { /* leave unfinished; retried next launch */ }
      }
    }).catch(() => {});
  }, [connected, fetchProducts, actions]);
  const priceFor = (productId: string, fallback: string) =>
    (([...(products as { id?: string; displayPrice?: string }[]), ...(subscriptions as { id?: string; displayPrice?: string }[])]).find((p) => p.id === productId)?.displayPrice) ?? fallback;
  const buy = useCallback((productId: string) => {
    if (buying) return;
    // Until the product exists in App Store Connect it won't load — show a gentle
    // "coming soon" instead of a payment error (e.g. in builds before IAP is set up).
    const loaded = [...products, ...subscriptions].some((p) => (p as { id?: string }).id === productId);
    if (!loaded) { openStoreDialog({ title: t('store.comingSoonTitle'), body: t('store.comingSoonBody'), icon: 'time', coach: true }); return; }
    const isSub = SOCIAL_PACK_IDS.includes(productId);
    setBuying(productId);
    track('purchase_start', { productId, kind: isSub ? 'subscription' : 'diamonds' });
    const apple = { sku: productId, appAccountToken: profile?.userId ?? undefined };
    Promise.resolve(requestPurchase({ request: { apple }, type: isSub ? 'subs' : 'in-app' })).catch(() => setBuying(null));
  }, [buying, requestPurchase, products, subscriptions, profile?.userId]);

  useEffect(() => {
    if (scrollToSection && storeScrollRef.current) {
      const y = sectionYRef.current[scrollToSection];
      if (y !== undefined) {
        setTimeout(() => storeScrollRef.current?.scrollTo({ y, animated: true }), 150);
      }
    }
  }, [scrollToSection]);

  // Does the user have a Social Pack right now (server-authoritative expiry)?
  const hasActivePack = !!(profile?.socialPackUntil && new Date(profile.socialPackUntil) > new Date());

  // "Not enough gems" dialog (weekly emote shop) — its CTA deep-links to the packs.
  const [showNotEnough, setShowNotEnough] = useState(false);

  // Staggered section entrance: fade + 12px rise, 200ms each, 40ms stagger.
  const sectionAnims = useRef(Array.from({ length: 4 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(40, sectionAnims.map((v) =>
      Animated.timing(v, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    )).start();
  }, [sectionAnims]);
  const sectionIn = (i: number) => ({
    opacity: sectionAnims[i]!,
    transform: [{ translateY: sectionAnims[i]!.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  });

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
      <ScrollView ref={storeScrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
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
                          <Btn
                            label={`${t(`store.${sp.id}` as MessageKey)} · ${priceFor(sp.productId, sp.price)}`}
                            kind={i === 1 ? 'accent' : 'blue'}
                            compact
                            loading={busy}
                            disabled={!!buying && !busy}
                            onPress={() => buy(sp.productId)}
                          />
                          {i === 1 ? <Ribbon label={t('store.bestValue')} style={{ position: 'absolute', top: -5, right: 4, transform: [{ rotate: '-2deg' }], zIndex: 3 }} /> : null}
                        </View>
                      );
                    })}
                  </Animated.View>
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

        {/* Free diamonds - watch ads (unlimited) */}
        <Animated.View style={sectionIn(1)}>
          <SectionHeader label={t('store.freeDiamonds')} icon="gift" />
          <AdRewardCard adLoading={adLoading} adsWatched={adsWatched} onWatch={watchAd} />
        </Animated.View>

        {/* Diamond packs */}
        <Animated.View style={sectionIn(2)} onLayout={(e) => { sectionYRef.current['diamonds'] = e.nativeEvent.layout.y; }}>
          <SectionHeader label={t('store.packs')} icon="diamond" />
          {DIAMOND_PACKS.map((pack) => (
            <DiamondPackRow
              key={pack.id}
              pack={pack}
              busy={buying === pack.productId}
              inert={!!buying && buying !== pack.productId}
              price={priceFor(pack.productId, pack.price)}
              onBuy={() => buy(pack.productId)}
            />
          ))}
        </Animated.View>

        {/* Haftalık ifade dükkanı (satışlar burada — koleksiyonda değil) */}
        <Animated.View style={sectionIn(3)}>
          {emoteWeeks().map(({ week, emotes }) => (
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
              {emotes.map((e) => (
                <EmoteShopRow
                  key={e.id}
                  emote={e}
                  owned={ownsEmote(profile, e.id)}
                  canAfford={(profile?.diamonds ?? 0) >= (e.premium?.price ?? 0)}
                  onBuy={() => actions.buyEmote(e.id)}
                  onBlocked={() => setShowNotEnough(true)}
                />
              ))}
            </View>
          ))}
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
      <GameModal visible={showNotEnough} onClose={() => setShowNotEnough(false)} title={t('store.notEnoughGemsTitle')} icon="diamond">
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
      </GameModal>

      {buying ? <PurchaseOverlay /> : null}
    </Screen>
  );
}

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
          backgroundColor: theme.panelInk, borderRadius: 22, padding: 2,
          borderWidth: 2, borderColor: theme.frameGold, borderBottomColor: theme.frameGoldDark,
          shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 24,
        }}
      >
        <View style={{ backgroundColor: theme.card, borderRadius: 20, overflow: 'hidden', borderTopWidth: 1, borderTopColor: theme.panelTopGloss, borderBottomWidth: 3, borderBottomColor: theme.cardLip, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 }}>
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
// mini padlock disc, unlock-source caption. Tap to preview: the sticker spring-
// scales up, a primary highlight ring fades in and auto-decays 400ms after the
// preview ends — highlight means "currently playing", not "last touched".
function DiscoverableEmoteCard({ emote, width }: {
  emote: EmoteMeta;
  width: number;
}) {
  const [playing, setPlaying] = useState(false);
  const tmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ring = useRef(new Animated.Value(0)).current; // highlight ring; also lifts the dim
  const stickerScale = useRef(new Animated.Value(1)).current;
  const { scale: pressScale, onIn, onOut } = usePressScale(0.96); // every touchable responds on press-in (spec §11)

  const endPreview = useCallback(() => {
    setPlaying(false);
    Animated.spring(stickerScale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    if (decayRef.current) clearTimeout(decayRef.current);
    decayRef.current = setTimeout(() => {
      Animated.timing(ring, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }, 400);
  }, [ring, stickerScale]);

  const handlePress = () => {
    if (playing) return;
    if (decayRef.current) clearTimeout(decayRef.current);
    setPlaying(true);
    Animated.timing(ring, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    Animated.spring(stickerScale, { toValue: 1.12, friction: 5, tension: 140, useNativeDriver: true }).start();
    if (emote.kind === 'lottie') {
      tmRef.current = setTimeout(endPreview, 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (tmRef.current) clearTimeout(tmRef.current);
      if (decayRef.current) clearTimeout(decayRef.current);
    };
  }, []);

  const unlockLabel = emote.premium
    ? (emote.week ? t('collection.unlockWeek', { week: emote.week }) : t('collection.unlockStore'))
    : t('collection.unlockReward');

  return (
    <Pressable key={emote.id} onPress={handlePress} onPressIn={onIn} onPressOut={onOut} style={{ width }}>
      <Animated.View
        style={{
          paddingTop: 10, paddingBottom: 6,
          backgroundColor: theme.card, borderRadius: 14, alignItems: 'center',
          borderWidth: 2, borderColor: theme.border, borderTopColor: theme.panelTopGloss,
          borderBottomWidth: 3, borderBottomColor: theme.cardLip,
          overflow: 'hidden',
          transform: [{ scale: pressScale }],
        }}
      >
        <Animated.View style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center', transform: [{ scale: stickerScale }] }}>
          {playing ? (
            <EmoteSticker key={`${emote.id}-anim`} id={emote.id} size={58} play onFinish={endPreview} />
          ) : (
            <EmoteSticker key={`${emote.id}-static`} id={emote.id} size={58} play={false} />
          )}
        </Animated.View>
        <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', letterSpacing: 0.3, marginTop: 3, maxWidth: width - 12 }}>
          {unlockLabel}
        </Text>
        {/* locked dim — lifts while the preview plays; the frame stays crisp */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(theme.panelInk, 0.45), opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} />
        {/* mini padlock disc */}
        <View style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.cardLip, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={10} color={theme.muted} />
        </View>
        {/* highlight ring — "currently playing" */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 12, borderWidth: 2, borderColor: theme.primary, opacity: ring }]} />
      </Animated.View>
    </Pressable>
  );
}

// Owned-emote card — press-lip physics + spring-pop equipped check. When the
// loadout is full, the frame stays crisp and only the sticker dims.
function CollectibleEmoteCard({ emote, width, isEquipped, blocked, onToggle }: {
  emote: EmoteMeta; width: number; isEquipped: boolean; blocked: boolean; onToggle: () => void;
}) {
  const { ty, onIn, onOut } = usePressLip(2);
  const check = useRef(new Animated.Value(isEquipped ? 1 : 0)).current;
  useEffect(() => {
    if (isEquipped) Animated.spring(check, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    else Animated.timing(check, { toValue: 0, duration: 120, useNativeDriver: true }).start();
  }, [isEquipped, check]);
  return (
    <Pressable onPress={() => { if (!blocked) onToggle(); }} onPressIn={blocked ? undefined : onIn} onPressOut={blocked ? undefined : onOut} style={{ width }}>
      <View style={{ backgroundColor: isEquipped ? theme.primaryDark : theme.cardLip, borderRadius: 15, paddingBottom: 3 }}>
        <Animated.View style={{ transform: [{ translateY: ty }], paddingTop: 11, paddingBottom: 9, paddingHorizontal: 4, backgroundColor: theme.card, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderColor: isEquipped ? theme.primary : theme.border, borderTopColor: isEquipped ? theme.primary : theme.panelTopGloss }}>
          <View style={{ opacity: blocked ? 0.45 : 1 }}>
            <EmoteSticker id={emote.id} size={58} />
          </View>
          <View style={{ height: 6 }} />
          <Text style={{ color: isEquipped ? theme.primary : theme.muted, fontFamily: 'Poppins-ExtraBold', fontSize: 10.5 }} numberOfLines={1} adjustsFontSizeToFit>
            {isEquipped ? t('collection.equipped') : t('collection.equip')}
          </Text>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 4, right: 4, transform: [{ scale: check }] }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.card }}>
              <Ionicons name="checkmark" size={11} color={theme.ink} />
            </View>
          </Animated.View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ---- Collection (emotes / loadout) ----
const EMOTE_SLOTS = 6;
export function CollectionScreen({ state, actions }: Props) {
  const profile = state.profile;
  const equipped = profile?.equippedEmotes ?? [];
  const toggleEquip = (id: string) => {
    if (equipped.includes(id)) actions.equipEmotes(equipped.filter((x) => x !== id));
    else if (equipped.length < EMOTE_SLOTS) actions.equipEmotes([...equipped, id]);
  };

  // Collectible sticker emotes the player owns: the 4 character faces (free) + any
  // owned premium + the animated emotes they've been granted. Quick-chat TEXT
  // phrases are NOT collectible and never appear here. Nothing is "pinned" — the
  // player chooses which ones fill the 6 loadout slots.
  const collectible: EmoteMeta[] = [
    ...FACE_EMOTES,
    ...PREMIUM_EMOTES.filter((e) => ownsEmote(profile, e.id)),
    ...ANIM_EMOTES.filter((e) => ownsEmote(profile, e.id)),
  ];
  const allEmotes: EmoteMeta[] = [...FACE_EMOTES, ...PREMIUM_EMOTES, ...ANIM_EMOTES];
  const discoverable = allEmotes.filter((e) => !ownsEmote(profile, e.id));
  const COL_GAP = 8;
  const COL_W = Math.floor((SCREEN_W - 44 - COL_GAP * 3) / 4);
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
        onToggle={() => toggleEquip(e.id)}
      />
    );
  };

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <ScreenHeader
          title={t('tab.collection')}
          icon="albums"
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.panelInnerFill, borderRadius: 999, borderWidth: 1.5, borderColor: theme.border, borderTopColor: theme.cardLip, paddingHorizontal: 9, paddingVertical: 5 }}>
              <Ionicons name="albums" size={12} color={theme.accent} />
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 11, fontVariant: ['tabular-nums'] }}>{collectible.length}/{allEmotes.length}</Text>
            </View>
          }
        />

        {/* Loadout — 6 slots the player fills with any emotes they choose */}
        <Text style={{ color: theme.primary, fontFamily: 'Poppins-ExtraBold', fontSize: 13, letterSpacing: 0.5, marginBottom: 4, marginLeft: 4 }}>{t('collection.loadout')}</Text>
        <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold', marginBottom: 10, marginLeft: 4 }}>{t('collection.loadoutHint', { n: String(equipped.length), max: String(EMOTE_SLOTS) })}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 22 }}>
          {Array.from({ length: EMOTE_SLOTS }).map((_, i) => {
            const id = equipped[i];
            const em = id ? (collectible.find((e) => e.id === id) ?? getEmote(id)) : null;
            return (
              <Pressable
                key={`slot${i}`}
                onPress={() => { if (id) toggleEquip(id); }}
                style={({ pressed }) => ({
                  width: 72, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: em ? theme.card : theme.panelInnerFill,
                  borderWidth: 2, borderColor: em ? theme.primary : theme.border,
                  ...(em ? { borderTopColor: theme.panelTopGloss, borderBottomWidth: 4, borderBottomColor: theme.cardLip } : {}),
                  borderStyle: (em ? 'solid' : 'dashed') as 'solid' | 'dashed',
                  transform: [{ translateY: pressed ? 2 : 0 }],
                })}
              >
                {em ? <EmoteSticker id={em.id} size={54} /> : <Ionicons name="add" size={26} color={theme.muted} />}
              </Pressable>
            );
          })}
        </View>

        {/* All collectible emotes — tap to equip/unequip */}
        <SectionHeader label={t('collection.yourEmotes').toLocaleUpperCase(currentLang())} icon="happy" style={{ marginBottom: 8 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP }}>
          {collectible.map((e) => renderEmoteCard(e))}
        </View>

        {/* Discoverable emotes — all emotes greyed out, tap to play animation */}
        <SectionHeader label={t('collection.discoverable').toLocaleUpperCase(currentLang())} icon="lock-closed" style={{ marginTop: 18, marginBottom: 8 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP }}>
          {discoverable.length ? (
            discoverable.map((e) => (
              <DiscoverableEmoteCard key={e.id} emote={e} width={COL_W} />
            ))
          ) : (
            // 100% completion is a celebration, not a muted empty box.
            <GamePanel compact style={{ flex: 1 }} bodyStyle={{ alignItems: 'center', gap: 8, paddingVertical: 18 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: theme.panelInnerFill, borderWidth: 2, borderColor: theme.accent, borderTopColor: theme.accentDark, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trophy" size={26} color={theme.gold} />
              </View>
              <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') }}>{t('collection.allOwned')}</Text>
            </GamePanel>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

// Waiting overlay shown to the inviter while the friend decides (30s window).
// GameModal + the hero-wait dialect (spec §9): the friend's avatar sits inside
// a pulsing glowSoft halo while an Svg ring drains down the 30s countdown.
const INVITE_WINDOW_MS = 30_000;
function InviteWaitingModal({ invite, avatarId, onCancel }: {
  invite: GameState['outgoingInvite']; avatarId?: string | null; onCancel: () => void;
}) {
  const [leftMs, setLeftMs] = useState(INVITE_WINDOW_MS);
  // Keep the last invite rendered through GameModal's 160ms exit animation.
  const lastInvite = useRef(invite);
  if (invite) lastInvite.current = invite;
  const shown = invite ?? lastInvite.current;

  useEffect(() => {
    if (!invite) return;
    const tick = () => {
      const ms = Math.max(0, invite.expiresAt - Date.now());
      setLeftMs(ms);
      if (ms <= 0) onCancel();
    };
    tick();
    const id = setInterval(tick, 100); // 10fps keeps the draining ring smooth
    return () => clearInterval(id);
  }, [invite?.toId, invite?.expiresAt]);

  // Pulsing glowSoft halo behind the avatar (native driver scale/opacity only).
  // Gated on an active invite — the component itself stays mounted in
  // FriendsScreen, so an unconditional loop would churn forever.
  const pulse = useRef(new Animated.Value(0)).current;
  const hasInvite = !!invite;
  useEffect(() => {
    if (!hasInvite) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [hasInvite, pulse]);

  const secs = Math.ceil(leftMs / 1000);
  const frac = Math.min(1, Math.max(0, leftMs / INVITE_WINDOW_MS));
  const urgent = secs <= 5;
  const RING = 118;
  const STROKE = 6;
  const R = (RING - STROKE) / 2;
  const C = 2 * Math.PI * R;

  return (
    <GameModal visible={!!invite} onClose={onCancel} title={t('friends.friendlyMatch')} icon="flash">
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: RING + 20, height: RING + 20, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', width: RING + 16, height: RING + 16, borderRadius: (RING + 16) / 2,
              backgroundColor: theme.glowSoft,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] }) }],
            }}
          />
          {/* countdown ring draining around the avatar */}
          <Svg width={RING} height={RING} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={theme.panelInnerFill} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2} cy={RING / 2} r={R}
              stroke={urgent ? theme.danger : theme.primary} strokeWidth={STROKE} fill="none" strokeLinecap="round"
              strokeDasharray={`${C}`} strokeDashoffset={C * (1 - frac)}
            />
          </Svg>
          <AvatarBadge avatarId={avatarId} size={RING - STROKE * 2 - 14} ringColor={theme.border} />
        </View>
        <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 17, ...engrave('sm') }} numberOfLines={1}>{shown?.toName}</Text>
        <Text style={{ color: theme.muted, fontSize: 12.5, fontFamily: 'Poppins-SemiBold', textAlign: 'center' }}>{t('friends.waitingAccept')}</Text>
        <Text style={{ color: urgent ? theme.danger : theme.accent, fontFamily: 'Poppins-Black', fontSize: 34, fontVariant: ['tabular-nums'], ...engrave('lg') }}>{secs}</Text>
      </View>
      <Btn label={t('searching.cancel')} kind="ghost" icon="close" onPress={onCancel} />
    </GameModal>
  );
}

// A friend's public profile (tapped from the friends list).
export function FriendProfileModal({ profile, onClose }: { profile: PublicProfile | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const total = (profile?.wins ?? 0) + (profile?.losses ?? 0);
  const winRate = total ? Math.round(((profile?.wins ?? 0) / total) * 100) : 0;
  const color = profile ? arenaColor(profile.arena.name) : theme.primary;
  return (
    <Modal visible={!!profile} animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent>
      <View style={{ flex: 1, backgroundColor: BG_TOP }}>
        <ScreenBg />
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <ScreenHeader title={t('profile.title')} icon="person" onBack={onClose} />

          <View style={{ paddingHorizontal: 20 }}>
            {/* Identity block — hero panel tinted by the friend's arena */}
            <GamePanel hero tint={color} style={{ marginBottom: 14 }} bodyStyle={{ alignItems: 'center', paddingVertical: 22 }}>
              <AvatarBadge avatarId={profile?.avatar ?? profile?.selectedAvatar} size={104} ringColor={color} />
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 22, marginTop: 12, ...engrave('lg') }} numberOfLines={1}>{profile?.displayName}</Text>
              {/* Beveled gold trophies chip (mini-bevel: card face on a cardLip lip) */}
              <View style={{ backgroundColor: theme.cardLip, borderRadius: 13, paddingBottom: 2, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1.5, borderColor: withAlpha(color, 0.45), borderTopColor: theme.panelTopGloss, paddingHorizontal: 14, paddingVertical: 6 }}>
                  <Ionicons name="trophy" size={15} color={theme.gold} />
                  <Text style={{ color: theme.gold, fontFamily: 'Poppins-ExtraBold', fontSize: 15, fontVariant: ['tabular-nums'], ...engrave('sm') }}>{profile?.trophies ?? 0}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>· {profile?.arena ? arenaLabel(profile.arena.name) : ''}</Text>
                </View>
              </View>
            </GamePanel>

            {/* Stats */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatCard icon="trophy" color={theme.primary} label={t('stats.wins')} value={profile?.wins ?? 0} />
              <StatCard icon="skull-outline" color={theme.danger} label={t('stats.losses')} value={profile?.losses ?? 0} />
              <StatCard icon="stats-chart" color={theme.blue} label={t('stats.winRate')} value={`${winRate}%`} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
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
        backgroundColor: theme.cardLip, borderRadius: 15, paddingBottom: pressed ? 1 : 3,
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
      }, outerStyle]}
    >
      <View
        style={[{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: pressed ? darken(theme.card, 0.14) : theme.card,
          borderRadius: 14, padding: 12, overflow: 'hidden',
          borderWidth: 2, borderColor: ring ?? theme.border, borderTopColor: ring ?? theme.panelTopGloss,
          transform: [{ translateY: pressed ? 2 : 0 }],
        }, style]}
      >
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
        backgroundColor: theme.panelInnerFill, borderRadius: 15,
        borderWidth: 2, borderColor: theme.border, borderTopColor: theme.cardLip, // dark top = sunken
      }}
    >
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
            paddingVertical: 9, borderRadius: 10,
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
        backgroundColor: pressed ? theme.bg2 : theme.card,
        borderWidth: 2, borderColor: theme.border,
        borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateY: pressed ? 2 : 0 }],
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

export function FriendsScreen({ state, actions, onGoToStore }: Props) {
  const [addInput, setAddInput] = useState('');
  const [searchMode, setSearchMode] = useState<'code' | 'username'>('code');
  const [friendTab, setFriendTab] = useState<'friends' | 'requests' | 'messages'>('friends');
  const [msgSearch, setMsgSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [matchModal, setMatchModal] = useState<string | null>(null); // friendId — friendly-match dialog
  // Friendly-match setup pages ALL live inside one mounted GameModal (mode →
  // scope → league/country) and slide between each other — no modal handoffs.
  const [matchPage, setMatchPage] = useState<{ key: 'mode' | 'scope' | 'league' | 'country'; dir: 1 | -1 }>({ key: 'mode', dir: 1 });
  const [matchMode, setMatchMode] = useState<GameMode>('team-team');
  const [menuFriend, setMenuFriend] = useState<FriendInfo | null>(null); // tapped friend → actions popover
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // tap anchor for the popover
  const [confirmRemove, setConfirmRemove] = useState<FriendInfo | null>(null); // remove confirmation
  const [socialPackPopup, setSocialPackPopup] = useState(false);
  const menuActionLock = useRef(false);
  const addInputRef = useRef<TextInput>(null);   // empty-state CTA → focus add-friend input
  const msgSearchRef = useRef<TextInput>(null);  // empty-state CTA → focus message search
  const profile = state.profile;
  const hasSocialPack = profile?.socialPackUntil ? new Date(profile.socialPackUntil) > new Date() : false;
  const friends = state.friends;

  // Auto-clear the transient "request sent" notice.
  useEffect(() => {
    if (!state.notice) return;
    const id = setTimeout(() => actions.clearNotice(), 2600);
    return () => clearTimeout(id);
  }, [state.notice]);
  const requests = state.friendRequests;

  useEffect(() => {
    if (profile?.userId && state.connected) actions.loadFriends();
  }, [profile?.userId, state.connected]);

  const onSendRequest = () => {
    const val = addInput.trim();
    if (val.length < 3) return;
    if (searchMode === 'code') {
      actions.sendFriendRequest(val, undefined);
    } else {
      actions.sendFriendRequest(undefined, val);
    }
    setAddInput('');
  };

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <ScreenHeader title={t('friends.title')} icon="people" />

        {/* Your code — recessed trough (engraved code) + mini beveled copy button + copied pill */}
        <Text style={styles.sectionLabel}>{t('friends.yourCode')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 5 }}>
          <View
            style={{
              flex: 1, alignItems: 'center', justifyContent: 'center',
              backgroundColor: theme.panelInnerFill, borderRadius: 14, paddingVertical: 12,
              borderWidth: 2, borderColor: theme.border, borderTopColor: theme.cardLip, // dark top = sunken
            }}
          >
            <Text style={styles.friendCode}>{profile?.userId?.slice(0, 8).toUpperCase() ?? '...'}</Text>
          </View>
          <MiniIconBtn
            icon={copied ? 'checkmark' : 'copy-outline'}
            face={theme.card}
            lip={theme.cardLip}
            ringColor={theme.border}
            fg={copied ? theme.primary : theme.accent}
            size={38}
            onPress={() => {
              const code = profile?.userId?.slice(0, 8).toUpperCase();
              if (code) {
                Clipboard.setStringAsync(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
          />
          <CopiedPill visible={copied} />
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

        {/* Username search results — same bevel voice as the friend rows */}
        {searchMode === 'username' && state.userSearchResults.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            {state.userSearchResults.map((u) => (
              <BevelRow key={u.userId} outerStyle={{ marginBottom: 6 }} style={{ paddingVertical: 9 }}>
                <Avatar avatar={null} name={u.displayName} size={34} ring={theme.primary} ringWidth={1.5} iconColor={theme.primary} iconSize={15} />
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 13, flex: 1, ...engrave('sm') }} numberOfLines={1}>{u.displayName}</Text>
                <MiniIconBtn icon="eye" face={theme.card} lip={theme.cardLip} ringColor={theme.border} fg={theme.text} onPress={() => actions.getUserProfile(u.userId)} />
                <MiniIconBtn icon="person-add" face={theme.primary} lip={theme.primaryDark} fg={theme.ink} onPress={() => actions.sendFriendRequest(undefined, u.displayName)} />
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
                <BevelRow key={f.userId} onPress={() => { setMsgSearch(''); actions.openChat(f.userId); }} outerStyle={{ marginBottom: 6 }} style={{ padding: 10 }}>
                  <Avatar avatar={f.avatar} name={f.displayName} size={36} ring={theme.primary} iconColor={theme.primary} iconSize={16} />
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
              <BevelRow
                key={c.userId}
                onPress={() => actions.openChat(c.userId)}
                ring={c.unreadCount > 0 ? theme.primary : undefined}
                wash={c.unreadCount > 0}
                outerStyle={{ marginBottom: 8 }}
              >
                <View style={{ position: 'relative' }}>
                  <AvatarBadge avatarId={c.avatar ?? c.selectedAvatar} size={44} ringColor={c.online ? theme.primary : theme.border} />
                  {c.online ? <View style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14, ...engrave('sm') }} numberOfLines={1}>{c.displayName}</Text>
                  <Text style={{ color: state.typingFrom[c.userId] ? theme.primary : c.unreadCount > 0 ? theme.text : theme.muted, fontSize: 12, fontFamily: 'Poppins-SemiBold' }} numberOfLines={1}>
                    {state.typingFrom[c.userId] ? t('chat.typing') : c.lastMessage}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{shortDate(c.lastMessageAt)}</Text>
                  <CountBadge count={c.unreadCount} />
                </View>
              </BevelRow>
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
            <BevelRow
              key={f.userId}
              onPress={(e) => { menuActionLock.current = false; setMenuPos({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }); setMenuFriend(f); }}
              ring={f.online ? theme.primary : undefined}
              outerStyle={{ marginBottom: 8 }}
              style={{ gap: 12 }}
            >
              <View style={{ position: 'relative' }}>
                <AvatarBadge avatarId={f.avatar ?? f.selectedAvatar} size={38} ringColor={theme.accent} />
                {f.online ? <View style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card }} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 15, ...engrave('sm') }} numberOfLines={1}>{f.displayName}</Text>
                <Text style={{ color: f.online ? theme.primary : theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }} numberOfLines={1}>{f.online ? t('common.online') : lastSeenLabel(f.lastSeen)}</Text>
              </View>
              {/* Trophy on the far right */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.bg2, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: theme.border }}>
                <Ionicons name="trophy" size={13} color={theme.gold} />
                <Text style={{ color: theme.gold, fontFamily: 'Poppins-ExtraBold', fontSize: 13, fontVariant: ['tabular-nums'], ...engrave('sm') }}>{f.trophies}</Text>
              </View>
            </BevelRow>
          ))
        )}
        </CrossFade>
      </ScrollView>

      <NetworkErrorBeacon visible={isNetworkErrorMessage(state.error)} />

      {/* Friend actions — small Clash-Royale-style popover above the tapped row */}
      <Modal visible={menuFriend !== null} transparent animationType="none" onRequestClose={() => setMenuFriend(null)}>
        <View style={{ flex: 1 }} pointerEvents="box-none">
          <Pressable style={[StyleSheet.absoluteFill, { zIndex: 0 }]} onPress={() => setMenuFriend(null)} />
          {menuFriend ? (() => {
            const W = 236;
            const H = 222;
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
              <View style={{ position: 'absolute', left, top, width: W, zIndex: 2, elevation: 20 }} pointerEvents="box-none">
                {/* GamePanel-compact frame language + 150ms spring pop anchored at the tail */}
                <SpringPop>
                  <View style={{ backgroundColor: theme.bg2, borderRadius: 15, padding: 2, borderWidth: 2, borderColor: theme.border, borderBottomColor: theme.cardLip, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 16 }}>
                    <View style={{ backgroundColor: theme.card, borderRadius: 13, borderTopWidth: 1, borderTopColor: theme.panelTopGloss, borderBottomWidth: 3, borderBottomColor: theme.cardLip, overflow: 'hidden' }}>
                      <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.5, textAlign: 'center', paddingTop: 9, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: theme.border }} numberOfLines={1}>
                        {menuFriend.displayName}
                      </Text>
                      <Row color={theme.text} label={t('friends.friendlyMatch')} onPress={() => { const id = menuFriend.userId; setMenuFriend(null); setMatchPage({ key: 'mode', dir: 1 }); setMatchModal(id); }} />
                      <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 10 }} />
                      <Row color={theme.text} label={t('friends.sendMessage')} onPress={() => { const id = menuFriend.userId; setMenuFriend(null); actions.openChat(id); }} />
                      <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 10 }} />
                      <Row color={theme.text} label={t('friends.viewProfile')} onPress={() => { const id = menuFriend.userId; setMenuFriend(null); actions.getUserProfile(id); }} />
                      <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 10 }} />
                      <Row color={theme.danger} label={t('friends.removeFriend')} onPress={() => { const f = menuFriend; setMenuFriend(null); setConfirmRemove(f); }} />
                    </View>
                  </View>
                  {/* downward tail pointing at the row — matches the frame ring */}
                  <View style={{ position: 'absolute', bottom: -7, left: tailLeft, width: 15, height: 15, backgroundColor: theme.bg2, transform: [{ rotate: '45deg' }], borderRightWidth: 2, borderBottomWidth: 2, borderColor: theme.cardLip }} />
                </SpringPop>
              </View>
            );
          })() : null}
        </View>
      </Modal>

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
            (['team-team', 'country-team', 'letter-team'] as GameMode[]).map((m) => {
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
                      setMatchModal(null);
                      setSocialPackPopup(true);
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
                  if (!matchModal) return; // dialog already exiting
                  actions.inviteFriendMatch(matchModal, friends.find((f) => f.userId === matchModal)?.displayName ?? 'Arkadaş', { mode: matchMode });
                  setMatchModal(null);
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
                  if (!matchModal) return; // dialog already exiting
                  actions.inviteFriendMatch(matchModal, friends.find((f) => f.userId === matchModal)?.displayName ?? 'Arkadaş', { mode: matchMode, scope: s });
                  setMatchModal(null);
                }}
              />
            </>
          )}
        </ModalPager>
      </GameModal>

      {/* Social pack upsell — the ONE GameModal pattern (same as HomeScreen's) */}
      <GameModal visible={socialPackPopup} onClose={() => setSocialPackPopup(false)} title={t('friends.socialPackRequired')} icon="lock-closed">
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 8 }]}>{t('friends.socialPackRequiredBody')}</Text>
        <Btn label={t('friends.goToStore')} kind="accent" icon="storefront" onPress={() => { setSocialPackPopup(false); onGoToStore?.('socialPack'); }} />
      </GameModal>

      {/* Outgoing invite — waiting for the friend to accept (30s) */}
      <InviteWaitingModal
        invite={state.outgoingInvite}
        avatarId={(() => {
          const f = friends.find((fr) => fr.userId === state.outgoingInvite?.toId);
          return f?.avatar ?? f?.selectedAvatar;
        })()}
        onCancel={() => { if (state.outgoingInvite) actions.cancelMatchInvite(state.outgoingInvite.toId); }}
      />

      {/* Tapped a friend → their public profile */}
      <FriendProfileModal profile={state.viewProfile} onClose={actions.closeUserProfile} />

      {/* Chat screen — WhatsApp style, swipe-back enabled */}
      <Modal visible={state.chatWith !== null} transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={actions.closeChat}>
        <SwipeBackWrap onBack={actions.closeChat}>
          {(softBack) => <ChatScreen state={state} actions={actions} onBack={softBack} />}
        </SwipeBackWrap>
      </Modal>
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
  const screenW = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(screenW)).current;
  const closingRef = useRef(false);
  const shouldStartBackSwipe = (evt: any, g: { dx: number; dy: number }) =>
    evt.nativeEvent.pageY < chatComposerTop.y &&
    Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.7;

  const closeWithAnimation = useCallback((direction = 1) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(translateX, {
      toValue: direction >= 0 ? screenW : -screenW,
      duration: 210,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      translateX.setValue(0);
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

  const panResponder = useRef(PanResponder.create({
    // Capture before the message ScrollView consumes the horizontal swipe.
    onMoveShouldSetPanResponderCapture: shouldStartBackSwipe,
    onMoveShouldSetPanResponder: shouldStartBackSwipe,
    onPanResponderMove: (_, g) => {
      translateX.setValue(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      const pastThreshold = Math.abs(g.dx) > screenW * SWIPE_THRESHOLD;
      const fastFlick = Math.abs(g.vx) > 0.45 && Math.abs(g.dx) > 34;
      if (pastThreshold || fastFlick) {
        closeWithAnimation(g.dx >= 0 ? 1 : -1);
      } else {
        // Cancel: spring back to origin
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }).start();
    },
  })).current;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }} {...panResponder.panHandlers}>
      {/* Foreground page that slides */}
      <Animated.View style={{ flex: 1, backgroundColor: theme.bg, transform: [{ translateX }], shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: -10, height: 0 }, elevation: 16 }}>
        {children(() => closeWithAnimation(1))}
      </Animated.View>
    </View>
  );
}

// ---- Chat Screen (WhatsApp-style) ----
// Architecture: fullScreen overlay modal with an absolute input bar. The input
// bar follows the native keyboard frame directly instead of relying on KAV, so
// the send button remains touchable while the keyboard is open.
function ChatScreen({ state, actions, onBack }: Props & { onBack?: () => void }) {
  const [text, setText] = useState('');
  const [kbOpen, setKbOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputBarHeight, setInputBarHeight] = useState(86);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const chatWith = state.chatWith;

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
  const isTyping = chatWith ? state.typingFrom[chatWith] : false;
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTyping = useRef(false);
  const sendingRef = useRef(false);

  // Auto-scroll to bottom whenever content grows (new message, typing indicator)
  // or the ScrollView layout changes (keyboard opens → ScrollView shrinks).
  const scrollToBottom = useCallback(() => {
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
    const setKeyboardFrame = (e: any) => {
      const endY = e?.endCoordinates?.screenY ?? SCREEN_H;
      const height = Math.max(0, SCREEN_H - endY);
      setKeyboardHeight(height);
      setKbOpen(height > 0);
      setTimeout(scrollToBottom, 50);
    };
    const resetKeyboardFrame = () => {
      setKeyboardHeight(0);
      setKbOpen(false);
    };
    const frameEvt = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onFrame = Keyboard.addListener(frameEvt, setKeyboardFrame);
    const onHide = Keyboard.addListener(hideEvt, resetKeyboardFrame);
    return () => { onFrame.remove(); onHide.remove(); };
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
    if (sendingRef.current) return;
    sendingRef.current = true;
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
        backgroundColor: theme.bg2, borderBottomWidth: 2, borderBottomColor: theme.cardLip,
      }}>
        <Pressable
          onPress={onBack ?? actions.closeChat}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40, height: 40, borderRadius: 14,
            backgroundColor: pressed ? theme.bg2 : theme.card,
            borderWidth: 2, borderColor: theme.border,
            borderBottomWidth: pressed ? 1 : 3, borderBottomColor: theme.cardLip,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ translateY: pressed ? 2 : 0 }],
          })}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <AvatarBadge avatarId={friend?.avatar ?? friend?.selectedAvatar} size={36} ringColor={friend?.online ? theme.primary : theme.border} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 15, ...engrave('sm') }} numberOfLines={1}>{friend?.displayName ?? '...'}</Text>
          <Text style={{ color: isTyping ? theme.primary : friend?.online ? theme.primary : theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>
            {isTyping ? t('chat.typing') : friend?.online ? t('common.online') : t('common.offline')}
          </Text>
        </View>
      </View>

      {/* Messages — bottom padding reserves the input bar AND (on iOS, where the
          window doesn't resize) the keyboard, so the newest message stays visible. */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{ padding: 12, paddingBottom: inputBarHeight + 10 + (Platform.OS === 'ios' ? keyboardHeight : 0) }}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
      >
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
          return (
            <RiseIn key={m.id} animate={animReady.current}>
              <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <View style={{ flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, maxWidth: '80%' }}>
                  <AvatarBadge avatarId={isMe ? (state.profile?.avatar ?? state.profile?.selectedAvatar) : (friend?.avatar ?? friend?.selectedAvatar)} size={28} ringColor={isMe ? theme.primary : theme.border} />
                  <View style={{
                    backgroundColor: isMe ? theme.primary : theme.card,
                    borderRadius: 16,
                    borderBottomRightRadius: isMe ? 4 : 16,
                    borderBottomLeftRadius: isMe ? 16 : 4,
                    paddingHorizontal: 14, paddingVertical: 9,
                    // mine: top-lit mint toy with a primaryDark lip;
                    // theirs: card face ring with a cardLip bottom edge.
                    borderWidth: isMe ? 0 : 1.5, borderColor: theme.border,
                    borderTopWidth: 1.5, borderTopColor: isMe ? 'rgba(255,255,255,0.30)' : theme.panelTopGloss,
                    borderBottomWidth: 2.5, borderBottomColor: isMe ? theme.primaryDark : theme.cardLip,
                  }}>
                    <Text style={{ color: isMe ? theme.ink : theme.text, fontSize: 14, fontFamily: 'Poppins-SemiBold' }}>{m.body}</Text>
                    <Text style={{ color: isMe ? withAlpha(theme.ink, 0.55) : theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', marginTop: 3, textAlign: 'right' }}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </View>
            </RiseIn>
          );
        })}
        {isTyping ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <AvatarBadge avatarId={friend?.avatar ?? friend?.selectedAvatar} size={28} ringColor={theme.border} />
            <View style={{ backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', gap: 4 }}>
              <TypingDot delay={0} />
              <TypingDot delay={150} />
              <TypingDot delay={300} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Absolute input bar: placed above the real keyboard frame instead of relying on KAV hit-testing. */}
      <View
        onLayout={(e) => setInputBarHeight(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: Platform.OS === 'ios' ? keyboardHeight : 0,
          flexDirection: 'row', alignItems: 'flex-end', gap: 8,
          paddingHorizontal: 12, paddingTop: 8, paddingBottom: kbOpen ? 8 : Math.max(insets.bottom, 12),
          backgroundColor: theme.bg2, borderTopWidth: 2, borderTopColor: theme.cardLip,
          zIndex: 50, elevation: 50,
        }}
      >
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
          style={{ marginBottom: 2 }}
        >
          {({ pressed }) => {
            const hasText = !!text.trim();
            return (
              // Chunky circular send: primaryDark lip under a top-lit mint face,
              // pressed = 2px sink; empty input = recessed panelInnerFill well.
              <View style={{ backgroundColor: hasText ? theme.primaryDark : 'transparent', borderRadius: 23, paddingBottom: hasText && pressed ? 1 : 3 }}>
                <View
                  style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: hasText ? theme.primary : theme.panelInnerFill,
                    borderWidth: hasText ? 0 : 2, borderColor: theme.border,
                    borderTopWidth: hasText ? 1.5 : 2, borderTopColor: hasText ? 'rgba(255,255,255,0.30)' : theme.cardLip,
                    alignItems: 'center', justifyContent: 'center',
                    transform: [{ translateY: hasText && pressed ? 2 : 0 }],
                  }}
                >
                  <Ionicons name="send" size={19} color={hasText ? theme.ink : theme.muted} />
                </View>
              </View>
            );
          }}
        </Pressable>
      </View>
    </View>
  );
}

// ---- Profile ----
function StatCard({ icon, color, label, value, gem }: { icon?: IoniconName; color: string; label: string; value: number | string; gem?: boolean }) {
  return (
    <GamePanel compact accentStripe={color} style={{ flex: 1 }} bodyStyle={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
      {gem ? <GemIcon size={24} /> : icon ? <Ionicons name={icon} size={22} color={color} /> : null}
      <Text style={{ color: theme.text, fontSize: 24, fontFamily: 'Poppins-Black', ...engrave('sm') }}>{value}</Text>
      <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>{label}</Text>
    </GamePanel>
  );
}

export function ProfileScreen({ state, actions, onOpenMatchHistory, onGoToStore }: Props) {
  const p = state.profile;
  const [pendingAvatarId, setPendingAvatarId] = useState<string | null>(null);
  const [confirmAvatarId, setConfirmAvatarId] = useState<string | null>(null);
  const [showAvatarPage, setShowAvatarPage] = useState(false);
  const [showInsufficientPopup, setShowInsufficientPopup] = useState(false);
  // Set on confirm: close the picker page once the confirm dialog's exit
  // animation completes (GameModal onExited) — no setTimeout handoff chains.
  const closePickerOnExit = useRef(false);

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
  const total = p.wins + p.losses;
  const winRate = total ? Math.round((p.wins / total) * 100) : 0;
  const color = arenaColor(p.arena.name);
  const arenaArt = getArenaDataByName(p.arena.name);
  const pendingAvatar = pendingAvatarId ? avatarMeta(pendingAvatarId) : null;
  const confirmAvatar = confirmAvatarId ? avatarMeta(confirmAvatarId) : null;
  const canAffordPending = pendingAvatar ? p.diamonds >= avatarPrice(pendingAvatar.id) : false;

  // Avatar picker — an INLINE page, deliberately NOT a native <Modal>.
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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {([
              'pp7', 'pp11', 'pp12', 'pp13', 'pp14', 'pp15', 'pp16', 'pp17',
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

        {/* Purchase confirmation modal (inside avatar picker) */}
        <GameModal visible={pendingAvatar !== null} onClose={() => setPendingAvatarId(null)} title={t('profile.buyTitle')} icon="lock-closed">
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
                        setPendingAvatarId(null);
                        setShowInsufficientPopup(true);
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

        {/* Insufficient diamonds popup (inside avatar picker) */}
        <GameModal visible={showInsufficientPopup} onClose={() => setShowInsufficientPopup(false)} title={t('profile.notEnoughTitle')} icon="alert-circle">
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 4 }}>
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 16, textAlign: 'center' }}>
              {t('store.changeNameInsufficient')}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center', lineHeight: 20 }}>
              {t('profile.notEnoughBody')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Btn label={t('settings.cancel')} kind="ghost" icon="close" onPress={() => setShowInsufficientPopup(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn
                label={t('common.continue')}
                kind="primary"
                icon="storefront"
                onPress={() => {
                  setShowInsufficientPopup(false);
                  actions.closeProfile();
                  onGoToStore?.('diamonds');
                }}
              />
            </View>
          </View>
        </GameModal>
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={t('profile.title')} icon="person" onBack={actions.closeProfile} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', gap: 8, marginVertical: 10 }}>
          <Pressable onPress={() => setShowAvatarPage(true)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <View>
              <AvatarBadge avatarId={p.avatar ?? p.selectedAvatar} size={104} ringColor={color} />
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.card }}>
                <Ionicons name="pencil" size={15} color={theme.ink} />
              </View>
            </View>
          </Pressable>
          <Text style={{ color: theme.text, fontSize: 24, fontFamily: 'Poppins-ExtraBold', ...engrave('lg') }}>{p.displayName}</Text>
          {/* Arena chip — crafted arena art thumbnail in a beveled chip (no raw emoji) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.bg2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1.5, borderColor: withAlpha(color, 0.4), borderBottomWidth: 3, borderBottomColor: theme.cardLip }}>
            {arenaArt ? (
              <Image source={arenaArt.img} style={{ width: 24, height: 21 }} resizeMode="contain" />
            ) : (
              <Ionicons name={arenaIcon(p.arena)} size={15} color={color} />
            )}
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 13, ...engrave('sm') }}>{arenaLabel(p.arena.name)}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <StatCard icon="trophy" color={theme.gold} label={t('stats.trophies')} value={p.trophies} />
          <StatCard gem color={GEM_COLOR} label={t('stats.diamonds')} value={p.diamonds} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <StatCard icon="checkmark-circle" color={theme.primary} label={t('stats.wins')} value={p.wins} />
          <StatCard icon="close-circle" color={theme.danger} label={t('stats.losses')} value={p.losses} />
          <StatCard icon="stats-chart" color={theme.purple} label={t('stats.winRateShort')} value={`%${winRate}`} />
        </View>

        <View style={{ marginTop: 16 }}>
          <Btn label={t('menu.matchHistory')} icon="time" kind="blue" onPress={() => onOpenMatchHistory?.()} />
        </View>
      </ScrollView>

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
      <View style={{ backgroundColor: selected ? theme.primaryDark : theme.cardLip, borderRadius: 17, paddingBottom: 3 }}>
        <Animated.View style={{ transform: [{ translateY: ty }], backgroundColor: theme.card, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, borderWidth: 2, borderColor: selected ? theme.primary : theme.border, borderTopColor: selected ? theme.primary : theme.panelTopGloss, alignItems: 'center' }}>
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
          const isLocked = trophies < arena.min;
          const isPassed = trophies > arena.max;
          const maxLabel = arena.max === 99999 ? '∞' : String(arena.max);

          const cardInner = (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: isCurrent ? 96 : 74, height: isCurrent ? 88 : 68, alignItems: 'center', justifyContent: 'center' }}>
                  {/* Locked = art-only dim + padlock chip; text stays legible (no whole-card opacity) */}
                  <Image source={arena.img} resizeMode="contain" style={{ width: '100%', height: '100%', opacity: isLocked ? 0.55 : 1, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 3 } }} />
                  {isLocked ? (
                    <View style={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.cardLip, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}>
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
                  {/* Tier reward only — the per-match win/loss trophy stakes are not shown. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <GemIcon size={13} />
                    <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'] }}>+{arena.reward}</Text>
                  </View>
                </View>
              </View>

              {/* Progress bar for the current arena — the LoadingScreen recipe at small scale */}
              {isCurrent ? (
                <View style={{ height: 20, borderRadius: 12, backgroundColor: theme.panelInk, borderWidth: 2, borderColor: theme.border, borderBottomColor: theme.cardLip, padding: 2, marginTop: 12, justifyContent: 'center' }}>
                  <View style={{ flex: 1, borderRadius: 8, backgroundColor: theme.panelInnerFill, overflow: 'hidden' }}>
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
                    {heroSize.w > 0 ? <ShineSweep width={heroSize.w - 8} height={heroSize.h - 8} delay={420} duration={720} opacity={0.22} band={0.26} /> : null}
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
export function SearchingScreen({ actions }: Props) {
  const [factIdx, setFactIdx] = useState(Math.floor(Math.random() * LOADING_TIPS.length));
  const factFade = useRef(new Animated.Value(1)).current;

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
      {/* Hero wait — Countdown-dialect pulsing mint ring around the engraved flash */}
      <View style={[styles.center, { gap: 16 }]}>
        <PulseRing size={132}>
          <Ionicons
            name="flash"
            size={46}
            color={theme.primary}
            style={{ textShadowColor: theme.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 }}
          />
        </PulseRing>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={styles.h1}>{t('searching.header')}</Text>
          <Text style={styles.muted}>{t('searching.title')}</Text>
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
function LeaderboardRow({ entry, onPress }: { entry: LeaderboardEntry; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ marginVertical: 4, transform: [{ translateY: pressed ? 2 : 0 }] })}
    >
      <GamePanel compact accentStripe={entry.rank <= 3 ? RANK_COLORS[entry.rank - 1] : undefined} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12 }}>
        <RankBadge rank={entry.rank} size={28} />
        <Avatar avatar={entry.avatar} name={entry.displayName} size={30} ring={theme.primary} ringWidth={1.5} iconColor={theme.primary} iconSize={14} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{entry.displayName}</Text>
          <Text numberOfLines={1} style={{ color: theme.accent, fontSize: 10, fontFamily: 'Poppins-SemiBold' }}>{arenaLabel(entry.arena.name).toLocaleUpperCase(currentLang())}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="trophy" size={12} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 13, fontFamily: 'Poppins-ExtraBold', fontVariant: ['tabular-nums'], ...engrave('sm') }}>{entry.trophies}</Text>
        </View>
        <Text style={{ color: theme.muted, fontSize: 10, width: 40, textAlign: 'right', fontFamily: 'Poppins-SemiBold' }}>{t('stats.record', { wins: entry.wins, losses: entry.losses })}</Text>
      </GamePanel>
    </Pressable>
  );
}

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
function MatchHistoryCard({ match: m, myName }: { match: MatchHistoryView; myName: string }) {
  const myRounds = m.rounds.filter((r) => r.answeredBy === myName);
  const oppRounds = m.rounds.filter((r) => r.answeredBy !== myName);
  const pArena = arenaForTrophies(m.playerTrophies);
  const oArena = arenaForTrophies(m.opponentTrophies);
  const tint = m.won ? theme.primary : theme.danger;

  // Round chip: recessed panelInnerFill well (dark top edge = sunken) with a
  // mine/theirs stripe. Metadata never dips under the 10px caption floor.
  const roundChip = (r: MatchHistoryView['rounds'][number], mine: boolean, key: number) => (
    <View
      key={key}
      style={{
        backgroundColor: theme.panelInnerFill, borderRadius: 10, padding: 8, marginBottom: 4,
        borderTopWidth: 1, borderTopColor: theme.cardLip,
        borderLeftWidth: 3, borderLeftColor: mine ? theme.primary : theme.danger,
      }}
    >
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

  const side = (name: string, arena: ReturnType<typeof arenaForTrophies>, trophies: number) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }} numberOfLines={1}>{name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <Ionicons name={arena.icon} size={11} color={arena.color} />
        <Text style={{ color: arena.color, fontSize: 10, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{trophies}</Text>
      </View>
      <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', marginTop: 1 }} numberOfLines={1}>{arenaLabel(arena.name)}</Text>
    </View>
  );

  return (
    <GamePanel compact tint={tint} style={{ marginBottom: 12 }} bodyStyle={{ padding: 0 }}>
      {/* Result + score + mode/date band, washed in the result tint */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: withAlpha(tint, 0.10) }}>
        <Ribbon
          label={m.won ? t('matchHistory.won') : t('matchHistory.lost')}
          color={m.won ? theme.accent : theme.danger}
          icon={m.won ? 'trophy' : 'close-circle'}
        />
        <Text style={{ color: theme.text, fontSize: 22, fontFamily: 'Poppins-Black', letterSpacing: 2, fontVariant: ['tabular-nums'], ...engrave('lg') }}>
          {m.playerScore} - {m.opponentScore}
        </Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold' }}>{MODE_LABEL((m.gameMode as GameMode) ?? 'team-team')}</Text>
          <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', fontVariant: ['tabular-nums'] }}>{shortDate(m.playedAt)}</Text>
        </View>
      </View>

      {/* Head-to-head */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
        {side(m.playerName || myName, pArena, m.playerTrophies)}
        <View style={{ justifyContent: 'center', paddingHorizontal: 8 }}>
          <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') }}>{t('common.vs')}</Text>
        </View>
        {side(m.opponentName, oArena, m.opponentTrophies)}
      </View>

      {/* Rounds detail — who answered which pairing */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 12, gap: 6 }}>
        <View style={{ flex: 1 }}>
          {myRounds.length > 0
            ? myRounds.map((r, i) => roundChip(r, true, i))
            : <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginTop: 8 }}>—</Text>}
        </View>
        <View style={{ width: 1, backgroundColor: theme.border, marginVertical: 4 }} />
        <View style={{ flex: 1 }}>
          {oppRounds.length > 0
            ? oppRounds.map((r, i) => roundChip(r, false, i))
            : <Text style={{ color: theme.muted, fontSize: 10, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginTop: 8 }}>—</Text>}
        </View>
      </View>
    </GamePanel>
  );
}

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
      <Avatar avatar={entry.avatar} name={entry.displayName} size={avSize} ring={c} ringWidth={2.5} iconColor={c} iconSize={Math.round(avSize * 0.45)} />
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
  // Loading ≠ empty: skeleton shimmer during the fetch window, then EmptyState.
  const graceOver = useLoadGrace(lb.length === 0);
  const top3 = lb.filter((e) => e.rank >= 1 && e.rank <= 3);
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
            <LeaderboardRow entry={entry} onPress={() => actions.getUserProfile(entry.userId)} />
          </View>
        ))}
        {lb.length === 0 ? (
          graceOver ? <LeaderboardEmpty onPlay={actions.closeLeaderboard} /> : <SkeletonRows rows={4} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// ---- Result ----
function TeamResultCard({ team, spells, played }: { team: ClubRef; spells: SpellInfo[]; played: boolean }) {
  return (
    <View style={[styles.teamResult, { borderColor: played ? theme.primary : theme.danger }]}>
      <ClubBadge name={team.name} size={40} logoUrl={team.logoUrl} />
      <Text style={styles.teamResultName} numberOfLines={2}>
        {team.name}
      </Text>
      <Ionicons
        name={played ? 'checkmark-circle' : 'close-circle'}
        size={20}
        color={played ? theme.primary : theme.danger}
      />
      <Text style={styles.teamResultYears}>
        {played ? spells.map(yearsText).filter(Boolean).join(', ') || t('career.played') : t('career.notPlayed')}
      </Text>
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
        shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4,
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
  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;
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
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {parts.map((g, i) => (
          <Animated.View key={i} style={{ position: 'absolute', left: -15, top: -15, opacity: g.o, transform: [{ translateX: g.x }, { translateY: g.y }, { scale: g.s }] }}>
            <Ionicons name="trophy" size={30} color={theme.gold} />
          </Animated.View>
        ))}
      </View>
    </Modal>
  );
}

// Match-over banner, styled after the Kupa-popup mockup: a coloured card (blue win /
// purple loss) with a ringed trophy medallion, confetti on a win, and a recessed
// panel showing the score and the arena-based trophy delta (+green / −red).
function MatchOverBanner({ youWon, youScore, oppScore, youWrong, oppWrong, winnerName, trophyDelta }: {
  youWon: boolean; youScore: number; oppScore: number; youWrong: number; oppWrong: number;
  winnerName: string | null; trophyDelta: { delta: number; trophies: number } | null;
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
  const gain = trophyDelta ? trophyDelta.delta >= 0 : youWon;
  const deltaColor = gain ? theme.primary : theme.danger;            // +green / −red

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
          </>
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

  const { icon, color, headline } = useMemo(() => {
    if (r.reason === 'same_team')
      return { icon: 'swap-horizontal' as IoniconName, color: theme.accent, headline: t('result.roundSkipped') };
    if (r.reason === 'no_common')
      return { icon: 'information' as IoniconName, color: theme.accent, headline: t('result.roundSkipped') };
    if (r.reason === 'passed')
      return { icon: 'play-skip-forward' as IoniconName, color: theme.accent, headline: t('result.roundSkipped') };
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

  const playedA = r.spellsA.length > 0;
  const playedB = r.spellsB.length > 0;

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* Match-over banner — only for ranked matches that actually change trophies.
            Bot matches award no trophies (trophyDelta stays null), so no popup there. */}
        {matchOver && state.trophyDelta ? (
          <MatchOverBanner
            youWon={youWon}
            youScore={you?.score ?? 0}
            oppScore={opp?.score ?? 0}
            youWrong={you?.wrongCount ?? 0}
            oppWrong={opp?.wrongCount ?? 0}
            winnerName={state.matchWinnerName ?? null}
            trophyDelta={state.trophyDelta ?? null}
          />
        ) : null}

        {/* Round verdict — always shown, so even on the deciding round you see who/what the answer was */}
        <Animated.View
          style={[styles.center, {
            opacity: verdictA.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale: verdictA.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
          }]}
        >
          {/* Check/cross in a beveled medallion — colored face, darkened lip, top gloss, glow */}
          <View
            style={{
              width: matchOver ? 52 : 72, height: matchOver ? 52 : 72, borderRadius: matchOver ? 26 : 36,
              backgroundColor: color,
              borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.45)',
              borderBottomWidth: matchOver ? 3 : 4, borderBottomColor: darken(color),
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name={icon} size={matchOver ? 26 : 38} color={theme.ink} />
          </View>
          <Text style={[styles.h1, { color }]}>{headline}</Text>
          {r.reason === 'same_team' ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>{t('result.sameTeam')}</Text>
          ) : r.reason === 'no_common' ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>
              {state.revealMode === 'country-team' ? t('result.noCommonCountry')
                : state.revealMode === 'letter-team' ? t('result.noCommonLetter')
                : t('result.noCommon')}
            </Text>
          ) : r.reason === 'passed' ? (
            <Text style={[styles.muted, { marginTop: 2 }]}>{t('result.passed')}</Text>
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
                /* Country card: flag + name + checkmark only */
                <View style={[styles.teamResult, { borderColor: theme.primary }]}>
                  {/* Flag emoji framed in the ClubBadge white circular chip */}
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.text, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <Text style={{ fontSize: 28 }}>{NATIONALITIES.find((n) => n.value === state.revealCountry)?.flag ?? '🏳️'}</Text>
                  </View>
                  <Text style={styles.teamResultName} numberOfLines={2}>
                    {NATIONALITIES.find((n) => n.value === state.revealCountry)?.displayName ?? r.teamA.name}
                  </Text>
                  <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                </View>
              ) : state.revealMode === 'letter-team' ? null : (
                <TeamResultCard team={r.teamA} spells={r.spellsA} played={playedA} />
              )}
              {state.revealMode !== 'player-player' ? (
                <TeamResultCard team={r.teamB} spells={r.spellsB} played={playedB} />
              ) : null}
            </View>

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
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.panelInnerFill, borderRadius: 10, borderWidth: 1.5, borderColor: theme.border, borderTopColor: theme.cardLip, paddingVertical: 6, paddingHorizontal: 8 }}>
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

        {/* Running match score — one recessed strip, leader tinted mint */}
        <View style={styles.scoreRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.panelInnerFill, borderRadius: 16, borderWidth: 2, borderColor: theme.border, borderTopColor: theme.cardLip, paddingVertical: 8, paddingHorizontal: 14 }}>
            {room.players.map((p, i) => {
              const other = room.players[1 - i];
              const leads = (p.score ?? 0) > (other?.score ?? 0);
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {i > 0 ? <View style={{ width: 1.5, height: 22, backgroundColor: theme.border }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Avatar avatar={p.avatar} name={p.name} size={22} ring={leads ? theme.primary : theme.border} ringWidth={1.5} iconColor={theme.muted} iconSize={13} />
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
        <Btn label={t('result.leave')} kind="ghost" icon="close" onPress={actions.leave} />
      </ScrollView>
      {matchOver && youWon ? <Confetti /> : null}
      {!tutorial ? <EmoteLayer state={state} actions={actions} fab="top-right" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent', padding: 22, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 6 },
  h1: { color: theme.text, fontSize: 18, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginVertical: 6, letterSpacing: 0.5, ...engrave('lg') },
  label: { color: theme.muted, fontSize: 10, letterSpacing: 2, textAlign: 'center', fontFamily: 'Poppins-SemiBold' },
  sectionLabel: { color: theme.muted, fontSize: 10, letterSpacing: 2, marginTop: 12, marginBottom: 4, fontFamily: 'Poppins-ExtraBold' },
  code: { color: theme.accent, fontSize: 32, fontFamily: 'Poppins-Black', textAlign: 'center', letterSpacing: 4 },
  muted: { color: theme.muted, textAlign: 'center', fontSize: 12, fontFamily: 'Poppins-SemiBold' },
  input: {
    backgroundColor: theme.panelInnerFill, // recessed inner well
    color: theme.text,
    borderColor: theme.border,
    borderWidth: 2,
    borderTopColor: theme.cardLip, // dark top edge = sunken
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    fontFamily: 'Poppins-ExtraBold',
    marginVertical: 6,
  },
  lobbyName: { color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') },
  // Recessed waiting chip (lobby waiting / wait-host states)
  lobbyWaitChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'center', backgroundColor: theme.panelInnerFill, borderRadius: 14, borderWidth: 2, borderColor: theme.border, borderTopColor: theme.cardLip, paddingVertical: 10, paddingHorizontal: 16 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  teamCard: { flex: 1, backgroundColor: theme.card, borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, borderWidth: 2, borderColor: theme.border, borderTopColor: theme.panelTopGloss, borderBottomWidth: 4, borderBottomColor: theme.cardLip, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 5 }, elevation: 7 },
  teamName: { color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') },
  plus: { color: theme.accent, fontSize: 22, fontFamily: 'Poppins-Black', ...engrave('sm') },
  passHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: withAlpha(theme.accent, 0.12), borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 8, borderWidth: 1.5, borderColor: theme.border, borderTopColor: theme.cardLip, borderLeftWidth: 3, borderLeftColor: theme.accent },
  passHintText: { color: theme.accent, fontSize: 12, fontFamily: 'Poppins-SemiBold', flexShrink: 1 },
  playerPhoto: { width: 104, height: 104, borderRadius: 52, marginTop: 10, borderWidth: 3, borderColor: theme.primary, backgroundColor: theme.card },
  matched: { color: theme.text, fontSize: 19, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginTop: 4, ...engrave('sm') },
  matchScore: { color: theme.text, fontSize: 46, fontFamily: 'Poppins-Black', letterSpacing: 3, marginTop: 6, fontVariant: ['tabular-nums'], ...engrave('lg') },
  matchBanner: { alignItems: 'center', gap: 2, backgroundColor: theme.card, borderRadius: 20, borderWidth: 2, borderColor: theme.frameGold, borderBottomWidth: 4, borderBottomColor: theme.frameGoldDark, paddingVertical: 18, paddingHorizontal: 14, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  fixRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fixText: { color: theme.accent, fontSize: 12, fontFamily: 'Poppins-SemiBold' },
  teamResultRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  teamResult: { flex: 1, backgroundColor: theme.card, borderRadius: 16, borderWidth: 2, borderColor: theme.border, borderTopColor: theme.panelTopGloss, borderBottomWidth: 4, borderBottomColor: theme.cardLip, padding: 12, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
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
    borderBottomColor: theme.border,
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
  // store emotes — raised-row bevel (2px ring + panelTopGloss top + 3px cardLip lip + shadow)
  storeEmoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
    borderWidth: 2,
    borderColor: theme.border,
    borderTopColor: theme.panelTopGloss,
    borderBottomWidth: 3,
    borderBottomColor: theme.cardLip,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  storeEmoteName: { color: theme.text, fontSize: 14, fontFamily: 'Poppins-ExtraBold', ...engrave('sm') },
  storeEmoteDesc: { color: theme.muted, fontSize: 11, marginTop: 2, fontFamily: 'Poppins-SemiBold' },
});
