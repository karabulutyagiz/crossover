import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { Animated, Easing, Platform, Dimensions, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { theme, engrave } from './theme';
import { t, currentLang, setLanguage, LANGUAGES } from './i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_IOS_CLIENT_ID } from './config';
import { GemIcon, GEM_COLOR } from './GemIcon';
import Svg, { Rect, Circle, Line, Defs, LinearGradient as SvgGradient, RadialGradient, Stop } from 'react-native-svg';

WebBrowser.maybeCompleteAuthSession();
import type { GameState, FriendInfo } from './useCrossover';
import { initialState } from './useCrossover';
import type { ClubRef, Difficulty, GameMode, GameOptions, ProfileView, PublicProfile, RoomView, Scope, SpellInfo } from './protocol';
import {
  EmoteCallout,
  EmoteSticker,
  PREMIUM_EMOTES,
  FREE_EMOTES,
  TEXT_EMOTES,
  FACE_EMOTES,
  availableEmotes,
  loadoutEmotes,
  emoteWeeks,
  LATEST_WEEK,
  getEmote,
  ownsEmote,
} from './emotes';
import { NATIONALITIES } from './nationalities';

type Actions = {
  register: (name: string, gameCenterId?: string) => void;
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
  submitGuess: (text: string) => void;
  pass: () => void;
  ready: () => void;
  playAgain: () => void;
  acceptRematch: () => void;
  declineRematch: () => void;
  sendEmote: (emoteId: string) => void;
  buyEmote: (emoteId: string) => void;
  equipEmotes: (emoteIds: string[]) => void;
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
  leave: () => void;
};

interface Props {
  state: GameState;
  actions: Actions;
  onGoToStore?: (section?: 'socialPack' | 'diamonds') => void;
  tutorial?: boolean; // running inside the guided simulation → no emotes, no keyboard autofocus
  onLanguageChange?: () => void;
  onOpenLeaderboard?: () => void; // open the centered leaderboard popup (App-level overlay)
  onOpenMatchHistory?: () => void; // open the centered match-history popup (App-level overlay)
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

// ---- shared primitives ----
// Flat, simple button: solid colour, subtle scale press feedback. Palette index
// [1] is the solid fill (other entries kept for tonal reference).
const BTN_PALETTE: Record<string, [string, string, string]> = {
  primary: ['#3DF29A', '#1FBE76', '#0E8C53'],
  accent: ['#FFD968', '#F5B81F', '#C68A0E'],
  blue: ['#5FB8FF', '#2E93F0', '#1E6FD4'],
  danger: ['#FF6E80', '#ED3F55', '#B82B3F'],
  ghost: ['transparent', 'transparent', theme.border],
};

function Btn({
  label,
  onPress,
  kind = 'primary',
  disabled,
  icon,
  big,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'accent' | 'blue' | 'danger';
  disabled?: boolean;
  icon?: IoniconName;
  big?: boolean;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const pal = BTN_PALETTE[kind] ?? BTN_PALETTE.primary!;
  const face = pal[1];
  const lip = pal[2];
  const ghost = kind === 'ghost';
  const fg = ghost ? theme.text : theme.ink;
  const radius = big ? 14 : 12;
  const ty = press.interpolate({ inputRange: [0, 1], outputRange: [0, ghost ? 2 : 4] });
  const glow = big && (kind === 'primary' || kind === 'accent') && !disabled;
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={big ? 23 : 19} color={fg} style={{ marginRight: 9 }} /> : null}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: fg, fontSize: big ? 18 : 15, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.3, flexShrink: 1 }}>{label}</Text>
    </>
  );
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => Animated.timing(press, { toValue: 1, duration: 60, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: 110, useNativeDriver: true }).start()}
      onPress={disabled ? undefined : onPress}
      style={{
        marginVertical: 6, opacity: disabled ? 0.5 : 1, borderRadius: radius + 2,
        ...(glow ? { shadowColor: face, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 10 } : {}),
      }}
    >
      {ghost ? (
        <Animated.View
          style={{
            transform: [{ translateY: ty }], backgroundColor: theme.glowSoft, borderRadius: radius, borderWidth: 2, borderColor: theme.primary,
            paddingVertical: big ? 14 : 11, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            shadowColor: theme.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4,
          }}
        >
          {content}
        </Animated.View>
      ) : (
        // chunky 3D button: darker bottom "lip" + face that depresses onto it when pressed
        <View style={{ backgroundColor: lip, borderRadius: radius + 1, paddingBottom: disabled ? 0 : 4, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
          <Animated.View
            style={{
              transform: [{ translateY: ty }], backgroundColor: face, borderRadius: radius, paddingVertical: big ? 15 : 12, paddingHorizontal: 18,
              borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.30)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {content}
          </Animated.View>
        </View>
      )}
    </Pressable>
  );
}

// Compact option chip (mode / scope / difficulty) for the home screen.
function Chip({ icon, label, onPress }: { icon: IoniconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
        backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
        borderRadius: 12, paddingVertical: 11, paddingHorizontal: 6,
      }}
    >
      <Ionicons name={icon} size={14} color={theme.accent} />
      <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// Darken a hex color (for tinted frame bottom-edges).
function darken(hex: string, amt = 0.34): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---- Game design kit: framed panel + centered pop-in modal + rank badge ----
let _gpSeq = 0;
// Reusable Clash-Royale-style framed surface: outer frame ring → beveled face
// (+ optional top-lit gloss for hero panels) → optional left accent stripe.
function GamePanel({ children, hero = false, tint, accentStripe, compact = false, style, bodyStyle }: {
  children: ReactNode; hero?: boolean; tint?: string; accentStripe?: string; compact?: boolean; style?: any; bodyStyle?: any;
}) {
  const gid = useRef(`gp${_gpSeq++}`).current;
  const r = compact ? 14 : 18;
  const fr = compact ? 12 : 16;
  const frameColor = tint ?? (hero ? theme.frameGold : theme.border);
  const frameBot = tint ? darken(tint) : (hero ? theme.accentDark : theme.cardLip);
  return (
    <View style={[{ backgroundColor: hero ? theme.panelInk : theme.bg2, borderRadius: r, padding: 2, borderWidth: 2, borderColor: frameColor, borderBottomColor: frameBot, shadowColor: tint ?? '#000', shadowOpacity: tint ? 0.45 : 0.4, shadowRadius: compact ? 6 : 12, shadowOffset: { width: 0, height: compact ? 4 : 6 }, elevation: compact ? 5 : 9 }, style]}>
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

// Centered pop-in modal with a gold banner header + close gem (Clash-Royale dialog).
function GameModal({ visible, onClose, title, icon, danger = false, coach = false, children }: {
  visible: boolean; onClose: () => void; title?: string; icon?: IoniconName; danger?: boolean; coach?: boolean; children: ReactNode;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    else a.setValue(0);
  }, [visible, a]);
  const frameColor = coach ? theme.primary : theme.frameGold;
  const frameBot = coach ? theme.primaryDark : theme.frameGoldDark;
  const bannerBg = danger ? theme.danger : theme.accent;
  const bannerBot = danger ? theme.dangerDark : theme.accentDark;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: theme.scrim, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }} onPress={onClose}>
        <Animated.View style={{ width: '100%', maxWidth: 360, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }], opacity: a, backgroundColor: theme.panelInk, borderRadius: 22, padding: 2, borderWidth: 2, borderColor: frameColor, borderBottomColor: frameBot, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 24 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: theme.card, borderRadius: 20, overflow: 'hidden', borderBottomWidth: 3, borderBottomColor: theme.cardLip }}>
            {title ? (
              <View style={{ height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 46, backgroundColor: bannerBg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.35)', borderBottomWidth: 3, borderBottomColor: bannerBot }}>
                {icon ? <Ionicons name={icon} size={18} color={danger ? theme.text : theme.ink} /> : null}
                <Text numberOfLines={1} style={{ color: danger ? theme.text : theme.ink, fontFamily: 'Poppins-ExtraBold', fontSize: 16, letterSpacing: 0.5, textTransform: 'uppercase' }}>{title}</Text>
              </View>
            ) : null}
            <View style={{ padding: 20, paddingTop: title ? 16 : 20, gap: 12 }}>{children}</View>
            <Pressable onPress={onClose} hitSlop={8} style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: theme.cardLip, borderWidth: 2, borderColor: theme.accentDark, alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
              <Ionicons name="close" size={16} color={theme.accent} />
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// Beveled rank badge (1/2/3 = gold/silver/bronze with glow; 4+ = plain).
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

// Framed screen header bar with a real back mini-button + engraved title.
function ScreenHeader({ title, onBack, icon, right, underline }: {
  title: string; onBack?: () => void; icon?: IoniconName; right?: ReactNode; underline?: string;
}) {
  return (
    <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: theme.bg2, borderBottomWidth: 2, borderBottomColor: theme.cardLip, marginBottom: 12 }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: theme.card, borderWidth: 2, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
      ) : <View style={{ width: 40 }} />}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        {icon ? <Ionicons name={icon} size={18} color={theme.accent} /> : null}
        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 18, letterSpacing: 0.5, textTransform: 'uppercase', ...engrave('lg') }}>{title}</Text>
      </View>
      {right ?? <View style={{ width: 40 }} />}
      {underline ? <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: underline, opacity: 0.55 }} /> : null}
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
export type BgVariant = 'home' | 'store' | 'menu' | 'match';
const BG_HOME = require('../assets/bg-home.png');   // royal-blue arena backdrop (Oyna/home only)
const BG_STORE = require('../assets/bg-store.png');  // violet gem-shop backdrop (Mağaza)
const BG_MENU = require('../assets/bg-menu.png');    // calm navy backdrop (collection/friends/sub-screens)
const BG_VARIANT = { home: BG_HOME, store: BG_STORE, menu: BG_MENU } as const;
// Per-screen background. 'match' = flat solid colour (no pattern). The image variants
// already bake a radial vignette + faint diamond weave; we only add a top/bottom shade
// so the resource bar and tab bar stay readable.
export function ScreenBg({ variant = 'menu' }: { variant?: BgVariant }) {
  if (variant === 'match') {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />;
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={BG_VARIANT[variant]} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <Svg width="100%" height="100%">
        <Defs>
          <SvgGradient id="bgshade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#04060F" stopOpacity={0.32} />
            <Stop offset="0.22" stopColor="#04060F" stopOpacity={0.04} />
            <Stop offset="0.80" stopColor="#04060F" stopOpacity={0.04} />
            <Stop offset="1" stopColor="#04060F" stopOpacity={0.44} />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bgshade)" />
      </Svg>
    </View>
  );
}

function Screen({ children, scroll }: { children: ReactNode; scroll?: boolean; noPitch?: boolean }) {
  // Keyboard-aware by default so inputs/buttons never get covered by the keyboard.
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
    >
      {/* Keyboard dismiss: a backdrop Pressable BEHIND the content. It never wraps the
          children (so no layout shift) and sits under the ScrollViews (so it never
          intercepts scroll); tapping empty background area still dismisses. Scroll-area
          taps are handled by each ScrollView's keyboardShouldPersistTaps="handled". */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()} accessible={false} />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : children}
    </KeyboardAvoidingView>
  );
}

// ---- Swipeable intro / onboarding (shown on first launch) ----

const INTRO_SLIDES = [
  { icon: 'football' as IoniconName, color: theme.primary, title: 'CROSSOVER', desc: 'İki takımda da oynamış futbolcuyu bul. İlk bilen kazanır!' },
  { icon: 'flash' as IoniconName, color: theme.accent, title: 'RAKİBİNLE YARIŞ', desc: 'Ortak oyuncuyu ilk doğru yazan turu alır. Hızlı düşün!' },
  { icon: 'trophy' as IoniconName, color: theme.gold, title: 'KUPALARI TOPLA', desc: 'Maç kazan, kupa kazan, arenalarda zirveye tırman.' },
];

function IntroSlide({ slide, index, scrollX }: { slide: (typeof INTRO_SLIDES)[number]; index: number; scrollX: Animated.Value }) {
  const inputRange = [(index - 1) * SCREEN_W, index * SCREEN_W, (index + 1) * SCREEN_W];
  const scale = scrollX.interpolate({ inputRange, outputRange: [0.55, 1, 0.55], extrapolate: 'clamp' });
  const opacity = scrollX.interpolate({ inputRange, outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' });
  return (
    <View style={{ width: SCREEN_W, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
      <Animated.View style={{ transform: [{ scale }], opacity, alignItems: 'center' }}>
        <View style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: theme.card, borderWidth: 3, borderColor: slide.color, alignItems: 'center', justifyContent: 'center', marginBottom: 30, shadowColor: slide.color, shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 12 }}>
          <Ionicons name={slide.icon} size={72} color={slide.color} />
        </View>
        <Text style={{ color: theme.text, fontSize: 26, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginBottom: 12 }}>{slide.title}</Text>
        <Text style={{ color: theme.muted, fontSize: 15, textAlign: 'center', lineHeight: 23 }}>{slide.desc}</Text>
      </Animated.View>
    </View>
  );
}

export function IntroScreen({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0);
  const scRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const last = INTRO_SLIDES.length - 1;
  const next = () => {
    if (page < last) scRef.current?.scrollTo({ x: (page + 1) * SCREEN_W, animated: true });
    else onDone();
  };
  const tint = INTRO_SLIDES[page]?.color ?? theme.primary;
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 44 }}>
      {/* Soft color glow that spreads to the sides and shifts hue per slide */}
      <View pointerEvents="none" style={{ position: 'absolute', top: '12%', alignSelf: 'center', width: SCREEN_W * 1.7, height: SCREEN_W * 1.7, borderRadius: SCREEN_W * 0.85, backgroundColor: tint, opacity: 0.1 }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: '22%', alignSelf: 'center', width: SCREEN_W * 1.05, height: SCREEN_W * 1.05, borderRadius: SCREEN_W * 0.53, backgroundColor: tint, opacity: 0.14 }} />
      <Pressable onPress={onDone} style={{ position: 'absolute', top: 50, right: 22, zIndex: 10 }} hitSlop={12}>
        <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 14 }}>Atla</Text>
      </Pressable>
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
          <IntroSlide key={i} slide={s} index={i} scrollX={scrollX} />
        ))}
      </Animated.ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
        {INTRO_SLIDES.map((_, i) => (
          <View key={i} style={{ width: i === page ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? theme.primary : theme.border }} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 28, paddingBottom: 40 }}>
        <Btn label={page === last ? 'BAŞLA' : 'İLERİ'} icon={page === last ? 'rocket' : 'arrow-forward'} kind="primary" big onPress={next} />
      </View>
    </View>
  );
}

// ---- Animated branded splash (rings expand outward → CROSSOVER → BY GAMES) ----
export function SplashScreen() {
  const ring = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(ring, { toValue: 1, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [ring, fade]);
  const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.45, 0.16] });
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
      {[1.8, 1.25, 0.8].map((m, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', width: SCREEN_W * m, height: SCREEN_W * m, borderRadius: (SCREEN_W * m) / 2,
            backgroundColor: i === 1 ? theme.accent : theme.primary,
            opacity: ringOpacity, transform: [{ scale }],
          }}
        />
      ))}
      <Animated.View style={{ opacity: fade, alignItems: 'center', gap: 12, alignSelf: 'stretch', paddingHorizontal: 20 }}>
        <Ionicons name="football" size={66} color={theme.primary} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: theme.text, fontSize: 34, fontFamily: 'Poppins-Black', letterSpacing: 2, textAlign: 'center', alignSelf: 'stretch', includeFontPadding: false }}>CROSSOVER</Text>
      </Animated.View>
      <Animated.Text style={{ position: 'absolute', bottom: 44, color: theme.muted, fontSize: 12, letterSpacing: 3, fontFamily: 'Poppins-ExtraBold', opacity: fade }}>
        BY GAMES
      </Animated.Text>
    </View>
  );
}

// ---- Loading screen (Clash-Royale-style bar) shown on entry; warms the logo cache ----
const LOADING_TIPS = [
  'İki takımda da oynamış futbolcuyu ilk bilen kazanır.',
  'Rakipten önce yaz — hız kadar bilgi de önemli.',
  'Pas mı? İki taraf da pas geçerse el atlanır, puan gitmez.',
  'İlk 3 turu kazanan maçı ve kupayı alır.',
];
export function LoadingScreen({ state, actions, onReady }: Props & { onReady: () => void }) {
  const [pct, setPct] = useState(0);
  const done = useRef(false);
  const prefetched = useRef(false);
  const tip = useRef(LOADING_TIPS[Math.floor((state.profile?.trophies ?? 0) % LOADING_TIPS.length)] ?? LOADING_TIPS[0]!).current;

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

  // Fill the bar 0→100 over ~2.2s, then enter the home panel.
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        const next = Math.min(100, p + 4);
        if (next >= 100 && !done.current) { done.current = true; setTimeout(onReady, 280); }
        return next;
      });
    }, 80);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <ScreenBg />
      <View style={{ alignItems: 'center', gap: 14, alignSelf: 'stretch', paddingHorizontal: 24 }}>
        <View style={{ width: 96, height: 96, borderRadius: 24, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.primary }}>
          <Ionicons name="football" size={54} color={theme.primary} />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: theme.text, fontSize: 30, fontFamily: 'Poppins-Black', letterSpacing: 2, textAlign: 'center', alignSelf: 'stretch', includeFontPadding: false }}>CROSSOVER</Text>
      </View>

      <View style={{ position: 'absolute', left: 32, right: 32, bottom: 64, alignItems: 'center', gap: 10 }}>
        <Text style={{ color: theme.muted, fontSize: 12.5, textAlign: 'center', lineHeight: 18 }}>{tip}</Text>
        <View style={{ width: '100%', height: 16, borderRadius: 10, backgroundColor: theme.cardLip, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', borderRadius: 10, backgroundColor: theme.primary }} />
        </View>
        <Text style={{ color: theme.primary, fontSize: 13, fontFamily: 'Poppins-ExtraBold' }}>{pct}%</Text>
      </View>
    </View>
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
  ownedEmotes: [], equippedEmotes: [], usernameSet: true, socialPackUntil: null,
  arena: { name: 'Mahalle Sahası', icon: '🏟️', minTrophies: 0 },
};

// Guided first-time tutorial that drives the REAL match screens (PickTeam → Guess
// → Result) with scripted fake data, plus a coach overlay + skip. Step advances
// when the player does the real action (pick a team, submit a guess).
export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0); // 0 pick · 1 guess · 2 result
  const [wrong, setWrong] = useState(false); // typed a wrong guess in the sim
  const [gateOpen, setGateOpen] = useState(true); // centered coach card blocks interaction until "Devam Et"
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
      gate: "Hoş geldin! 👋 Hızlı bir alıştırma yapalım. İki takımda da oynamış futbolcuyu bulacaksın.\n\nDevam Et'e bas, sonra Galatasaray'a dokun.",
      hint: '👇 Galatasaray’a dokun',
      cta: 'Devam Et',
    },
    {
      gate: wrong
        ? "Olmadı 🙈 Doğru cevap: Wesley Sneijder.\n\nDevam Et'e bas ve aynen yaz."
        : "Sıra sende! Galatasaray ve Real Madrid'in ikisinde de oynayan futbolcu: Wesley Sneijder.\n\nDevam Et'e bas, yaz ve Gönder'e bas.",
      hint: '⌨️ “Wesley Sneijder” yaz ve Gönder’e bas',
      cta: 'Devam Et',
    },
    {
      gate: 'Doğru! 🎉 Sneijder hem Galatasaray hem Real Madrid forması giydi.\n\nRakipten önce bilen turu kazanır; ilk 3 turu alan kupayı kazanır!',
      hint: '',
      cta: 'BAŞLA',
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
      {!gateOpen && cur.hint ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 96, left: 16, right: 16, alignItems: 'center' }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 14, borderWidth: 1.5, borderColor: theme.primary, paddingVertical: 9, paddingHorizontal: 14, maxWidth: '100%' }}>
            <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '700', textAlign: 'center' }}>{cur.hint}</Text>
          </View>
        </View>
      ) : null}

      {/* Result step: keep the win + career fully visible, celebration card at the bottom */}
      {step >= 2 ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 }}>
          <Animated.View style={{ transform: [{ scale: bubble }], opacity: bubble, backgroundColor: theme.card, borderRadius: 20, borderWidth: 2, borderColor: theme.primary, padding: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 14 }}>
            <Text style={{ color: theme.text, fontSize: 14.5, lineHeight: 22, textAlign: 'center', marginBottom: 14 }}>{cur.gate}</Text>
            <View style={{ width: '100%' }}>
              <Btn label={cur.cta} kind="primary" icon="rocket" onPress={onGate} big />
            </View>
          </Animated.View>
        </View>
      ) : gateOpen ? (
        /* Pick/Guess step: centered coach gate — blocks interaction until "Devam Et" */
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,10,28,0.82)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <Animated.View style={{ width: '100%', transform: [{ scale: bubble }], opacity: bubble, backgroundColor: theme.card, borderRadius: 22, borderWidth: 2, borderColor: wrong ? theme.danger : theme.primary, padding: 22, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 16 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: wrong ? theme.danger : theme.primary, marginBottom: 12 }}>
              <Ionicons name={wrong ? 'alert' : 'football'} size={28} color={wrong ? theme.danger : theme.primary} />
            </View>
            <Text style={{ color: theme.muted, fontWeight: '900', fontSize: 11, letterSpacing: 1.5, marginBottom: 8 }}>KOÇ · ADIM {step + 1}/3</Text>
            <Text style={{ color: theme.text, fontSize: 15.5, lineHeight: 23, textAlign: 'center', marginBottom: 18 }}>{cur.gate}</Text>
            <View style={{ width: '100%' }}>
              <Btn label={cur.cta} kind="primary" icon="arrow-forward" onPress={onGate} big />
            </View>
          </Animated.View>
        </View>
      ) : null}

      {/* Skip — always reachable, on top */}
      <Pressable
        onPress={onDone}
        style={{ position: 'absolute', top: 50, right: 16, zIndex: 40, backgroundColor: theme.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.border }}
        hitSlop={10}
      >
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>Atla ›</Text>
      </Pressable>
    </View>
  );
}

// ---- Emotes (Clash-Royale-style in-match reactions) ----

// One emote pop: springs in, holds, fades out. Re-mounted (via `key={n}`) on
// every new emote so the same sticker can replay.
function TransientCallout({ emoteId }: { emoteId: string }) {
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
        ({ finished }) => finished && setGone(true),
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
function EmoteLayer({ state, actions, fab = 'bottom-right', hideFab, externalOpen, onOpenChange }: Props & { fab?: 'bottom-right' | 'top-right'; hideFab?: boolean; externalOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = (v: boolean) => { setInternalOpen(v); onOpenChange?.(v); };
  const room = state.room;
  const youId = room?.youId;
  const oppId = room?.players.find((p) => p.id !== youId)?.id;
  const mine = youId ? state.emotes[youId] : undefined;
  const theirs = oppId ? state.emotes[oppId] : undefined;
  const allEmotes = loadoutEmotes(state.profile);
  const textEmotes = allEmotes.filter((e) => e.kind === 'text');   // quick-chat messages
  const stickerEmotes = allEmotes.filter((e) => e.kind !== 'text'); // the 4 faces + equipped visual

  return (
    <>
      <View pointerEvents="none" style={styles.emoteTop}>
        {theirs ? <TransientCallout key={`opp-${theirs.n}`} emoteId={theirs.emoteId} /> : null}
      </View>
      <View pointerEvents="none" style={styles.emoteBottom}>
        {mine ? <TransientCallout key={`you-${mine.n}`} emoteId={mine.emoteId} /> : null}
      </View>

      {!hideFab ? (
        <Pressable
          style={[styles.emoteFab, fab === 'top-right' ? styles.emoteFabTop : styles.emoteFabBottom]}
          onPress={() => setOpen(true)}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color="#06131F" />
        </Pressable>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.emoteSheetBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={{
              backgroundColor: theme.card, borderTopLeftRadius: 26, borderTopRightRadius: 26,
              paddingTop: 10, paddingBottom: 34, paddingHorizontal: 18,
              borderTopWidth: 1, borderColor: theme.border,
            }}
            onPress={() => {}}
          >
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 16 }} />

            {/* Quick-chat text messages (no emoji — just text, Clash-Royale style) */}
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 9, marginLeft: 2 }}>{t('emote.quickChat')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {textEmotes.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => { actions.sendEmote(e.id); setOpen(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.bg, borderRadius: 22, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1.5, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip }}
                >
                  <Ionicons name="chatbubble-ellipses" size={14} color={theme.primary} />
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13.5 }}>{e.phrase}</Text>
                </Pressable>
              ))}
            </View>

            {/* Character emotes (smiling / crying / angry / OK) + any equipped visual emotes */}
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 }}>{t('emote.faces')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
              {stickerEmotes.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => { actions.sendEmote(e.id); setOpen(false); }}
                  style={{ alignItems: 'center', width: 72 }}
                >
                  <View style={{
                    width: 70, height: 70, borderRadius: 35, backgroundColor: theme.bg,
                    borderWidth: 2.5, borderColor: e.color, alignItems: 'center', justifyContent: 'center',
                  }}>
                    <EmoteSticker id={e.id} size={56} />
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 9.5, marginTop: 5, textAlign: 'center' }} numberOfLines={1}>{e.phrase}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
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
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Image source={{ uri: logoUrl }} style={{ width: size * 0.78, height: size * 0.78 }} resizeMode="contain" />
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
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initial(name)}</Text>
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
  return { easy: 'Kolay', medium: 'Orta', hard: 'Zor' }[d];
}
function MODE_LABEL(m: GameMode): string {
  return { 'team-team': t('mode.teamTeam'), 'country-team': t('mode.countryTeam'), 'letter-team': t('mode.letterTeam') }[m];
}
const MODE_ICON: Record<GameMode, IoniconName> = {
  'team-team': 'football',
  'country-team': 'flag',
  'letter-team': 'text',
};

function scopeLabel(scope: Scope): string {
  return scope.type === 'all' ? t('scope.all') : scope.value;
}

type Picker = null | 'difficulty' | 'scopeType' | 'league' | 'country' | 'mode';

function ProfileCard({ profile, onPress }: { profile: ProfileView; onPress?: () => void }) {
  return (
    <Pressable style={styles.profileCard} onPress={onPress}>
      <View style={styles.profileRow}>
        <Ionicons name={arenaIcon(profile.arena)} size={24} color={theme.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{profile.displayName}</Text>
          <Text style={styles.profileArena}>{profile.arena.name}</Text>
        </View>
        <View style={styles.profileStat}>
          <Ionicons name="trophy" size={15} color={theme.accent} />
          <Text style={styles.profileStatVal}>{profile.trophies}</Text>
        </View>
      </View>
      <View style={styles.profileWL}>
        <Text style={[styles.muted, { fontSize: 11 }]}>
          {profile.wins}G / {profile.losses}M
        </Text>
      </View>
    </Pressable>
  );
}

// Login gate: shown until the user signs in. No guest play — the app is locked
// behind Apple/Google (Facebook coming soon) sign-in.
export function LoginScreen({ state, actions }: Props) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
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

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <View style={styles.center}>
          <Ionicons name="football" size={56} color={theme.primary} />
          <Text style={styles.logo}>CROSSOVER</Text>
          <Text style={styles.tagline}>{t('home.tagline')}</Text>
        </View>

        <View style={{ height: 12 }} />

        {Platform.OS === 'ios' && appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={10}
            style={{ height: 50 }}
            onPress={signInApple}
          />
        ) : null}

        <Btn label={t('login.google')} icon="logo-google" kind="accent" onPress={() => promptAsync()} disabled={!request} />

        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
        <Text style={[styles.muted, { marginTop: 12 }]}>{t('login.hint')}</Text>
      </View>
    </Screen>
  );
}

// One-time unique username pick, shown after sign-in before anything else.
export function UsernameScreen({ state, actions }: Props) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const valid =
    trimmed.length >= 3 &&
    trimmed.length <= 16 &&
    /^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]+$/.test(trimmed);
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <View style={styles.center}>
          <Ionicons name="person-circle-outline" size={56} color={theme.primary} />
          <Text style={styles.h1}>{t('username.title')}</Text>
          <Text style={styles.muted}>{t('username.subtitle')}</Text>
        </View>
        <TextInput
          placeholder={t('username.placeholder')}
          placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={16}
          style={styles.input}
          autoFocus
        />
        <Text style={[styles.muted, { fontSize: 11 }]}>{t('username.rules')}</Text>
        <Btn
          label={t('username.create')}
          icon="checkmark"
          kind="primary"
          onPress={() => actions.setUsername(trimmed)}
          disabled={!valid}
        />
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      </View>
    </Screen>
  );
}

function arenaColor(name: string): string {
  return ARENA_DATA.find((a) => a.name === name)?.color ?? theme.primary;
}

// Soft warm sunlit haze behind the arena — drifting fog so the arena
// stands out from the background (low opacity, non-distracting).
function ArenaHaze() {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);
  const tx = drift.interpolate({ inputRange: [0, 1], outputRange: [-12, 12] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -6, width: 330, height: 210, transform: [{ translateX: tx }] }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="haze" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#EAF6C4" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#EAF6C4" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="hazeLight" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="38%" cy="56%" r={86} fill="url(#haze)" />
        <Circle cx="64%" cy="46%" r={74} fill="url(#haze)" />
        <Circle cx="52%" cy="64%" r={96} fill="url(#haze)" />
        <Circle cx="34%" cy="34%" r={60} fill="url(#hazeLight)" />
      </Svg>
    </Animated.View>
  );
}

// Arena crest (Clash-Royale-style): the cut-out isometric arena sits planted with a
// contact shadow + drifting haze behind it + a nameplate below. Tap → arenas screen.
function ArenaCrest({ arena, trophies, onPress }: { arena: { name: string; icon: string }; trophies: number; onPress: () => void }) {
  const tier = ARENA_DATA.find((a) => trophies >= a.min && trophies <= a.max) ?? ARENA_DATA[ARENA_DATA.length - 1]!;
  const color = arenaColor(arena.name);
  return (
    <Pressable onPress={onPress} style={{ marginVertical: 6, alignItems: 'center' }}>
      {/* Planted top-view arena (Clash-Royale board): NO float / NO bob. The shadow is the
          arena's OWN silhouette cast down + to the sides (left/right/bottom) so it reads as
          seated on the ground — not a single ellipse directly beneath (that looked airborne). */}
      <View style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
        <ArenaHaze />
        {/* faint wide ground darkening so the base meets the floor */}
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 14, width: 196, height: 22, borderRadius: 11, backgroundColor: '#02030B', opacity: 0.3, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 2 }, transform: [{ scaleX: 1.35 }] }} />
        <Image
          source={tier.img}
          resizeMode="contain"
          style={{ width: 250, height: 218, shadowColor: '#01030B', shadowOpacity: 0.6, shadowRadius: 17, shadowOffset: { width: 0, height: 7 } }}
        />
      </View>
      {/* Nameplate below */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: theme.card, borderRadius: 13, borderWidth: 1.5, borderColor: color + 'AA', paddingHorizontal: 14, paddingVertical: 7, marginTop: 8 }}>
        <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 15 }} numberOfLines={1}>{arena.name}</Text>
        <View style={{ width: 1, height: 16, backgroundColor: theme.border }} />
        <Ionicons name="trophy" size={13} color={theme.gold} />
        <Text style={{ color: theme.gold, fontWeight: '900', fontSize: 14 }}>{trophies}</Text>
      </View>
      <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '700', marginTop: 5 }}>ARENALAR ›</Text>
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
function SettingsPanel({ onLanguageChange, diamonds, onChangeName, onNeedDiamonds }: {
  onLanguageChange: () => void;
  diamonds: number;
  onChangeName: (name: string) => void;
  onNeedDiamonds: () => void;
}) {
  const [langPicker, setLangPicker] = useState(false);
  const [confirmLang, setConfirmLang] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const activeLang = currentLang();
  const activeName = LANGUAGES.find((l) => l.code === activeLang)?.name ?? activeLang;

  const doChangeLang = (code: string) => {
    setLanguage(code);
    AsyncStorage.setItem('@crossover_lang', code).catch(() => {});
    setConfirmLang(null);
    setLangPicker(false);
    onLanguageChange();
  };

  const linkChip = {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7,
    paddingVertical: 11, paddingHorizontal: 11, borderRadius: 12,
    backgroundColor: theme.bg, borderWidth: 1.5, borderColor: theme.border,
    borderBottomWidth: 3, borderBottomColor: theme.cardLip,
  };
  const linkTxt = { color: theme.text, fontSize: 12, fontWeight: '700' as const, flex: 1 };

  return (
    <View style={{ padding: 14 }}>
      <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{t('settings.language')}</Text>
      <Pressable
        onPress={() => setLangPicker(true)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.bg, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 }}
      >
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{activeName}</Text>
        <Ionicons name="chevron-down" size={18} color={theme.muted} />
      </Pressable>

      {/* Ad Değiştir (1000 elmas) */}
      <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>AD</Text>
      <Pressable
        onPress={() => { if (diamonds < 1000) onNeedDiamonds(); else setRenameOpen(true); }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.bg, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 }}
      >
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Ad Değiştir</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 14 }}>1000</Text>
          <GemIcon size={14} />
        </View>
      </Pressable>

      <ChangeNameModal
        visible={renameOpen}
        diamonds={diamonds}
        onClose={() => setRenameOpen(false)}
        onConfirm={(newName) => { onChangeName(newName); setRenameOpen(false); }}
      />

      {/* ── Yardım & Bilgiler — framed link chips ── */}
      <View style={{ height: 1, backgroundColor: theme.border, marginTop: 22, marginBottom: 14 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[linkChip, { flex: 1 }]} onPress={() => openLink(INFO_LINKS.help)}>
          <Ionicons name="help-circle-outline" size={15} color={theme.muted} />
          <Text style={linkTxt} numberOfLines={1}>Yardım ve Bilgiler</Text>
        </Pressable>
        <Pressable style={[linkChip, { flex: 1 }]} onPress={() => openLink(INFO_LINKS.privacy)}>
          <Ionicons name="shield-checkmark-outline" size={15} color={theme.muted} />
          <Text style={linkTxt} numberOfLines={1}>Gizlilik</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Pressable style={[linkChip, { flex: 1 }]} onPress={() => openLink(INFO_LINKS.parents)}>
          <Ionicons name="people-outline" size={15} color={theme.muted} />
          <Text style={linkTxt} numberOfLines={1}>Ebeveyn Kılavuzu</Text>
        </Pressable>
        <Pressable style={[linkChip, { flex: 1 }]} onPress={() => openLink(INFO_LINKS.terms)}>
          <Ionicons name="document-text-outline" size={15} color={theme.muted} />
          <Text style={linkTxt} numberOfLines={1}>Hizmet Koşulları</Text>
        </Pressable>
      </View>
      <Pressable style={[linkChip, { marginTop: 8, justifyContent: 'center' }]} onPress={() => openLink(INFO_LINKS.founders)}>
        <Ionicons name="star-outline" size={15} color={theme.accent} />
        <Text style={[linkTxt, { flex: 0, color: theme.text, fontWeight: '800', letterSpacing: 0.5 }]}>Kurucular</Text>
      </Pressable>

      <PopupCard visible={langPicker} title={t('settings.language')} icon="language" onClose={() => setLangPicker(false)}>
        <ScrollView style={{ maxHeight: 430 }} contentContainerStyle={{ padding: 12 }} showsVerticalScrollIndicator={false}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang.code}
              onPress={() => {
                if (lang.code === activeLang) { setLangPicker(false); return; }
                doChangeLang(lang.code); // apply immediately (the confirm modal sat behind the picker → unselectable)
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12,
                borderRadius: 10, backgroundColor: lang.code === activeLang ? theme.primary + '22' : theme.bg,
                borderWidth: 1.5, borderColor: lang.code === activeLang ? theme.primary : theme.border,
                marginBottom: 6,
              }}
            >
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{lang.name}</Text>
              {lang.code === activeLang ? <Ionicons name="checkmark" size={18} color={theme.primary} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </PopupCard>

      <Modal visible={confirmLang !== null} transparent animationType="fade" onRequestClose={() => setConfirmLang(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 40 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 20, alignItems: 'center' }}>
            <Ionicons name="language" size={36} color={theme.accent} />
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 10, marginBottom: 18 }}>
              {t('settings.changeLangConfirm')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <Pressable
                onPress={() => setConfirmLang(null)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.danger, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('settings.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmLang && doChangeLang(confirmLang)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#2196F3', alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('settings.confirm')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Centered "letter" popup shell — gold-framed card, title + top-right X, scrollable
// body. Everything that used to open fullscreen (leaderboard, match history) now uses
// this so it pops in the middle of the screen instead of taking it over.
function PopupCard({ visible, title, icon, onClose, children }: {
  visible: boolean; title: string; icon: IoniconName; onClose: () => void; children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 18 }}>
        {/* Backdrop catches outside taps. It is a SIBLING of the card (not a parent),
            so it never swallows the inner ScrollView's scroll gestures. */}
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} onPress={onClose} />
        <View style={{ backgroundColor: theme.card, borderRadius: 22, borderWidth: 2, borderColor: theme.frameGold, borderBottomWidth: 4, borderBottomColor: theme.frameGoldDark, maxHeight: '80%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 11 }}>
            <Ionicons name={icon} size={20} color={theme.accent} />
            <Text style={[{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 17, marginLeft: 8, flex: 1 }, engrave('sm')]} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.panelInnerFill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}>
              <Ionicons name="close" size={18} color={theme.text} />
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: theme.border }} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function LeaderboardModal({ visible, entries, onClose }: { visible: boolean; entries: GameState['leaderboard']; onClose: () => void }) {
  return (
    <PopupCard visible={visible} title={t('menu.leaderboard')} icon="podium" onClose={onClose}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }} showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 36 }}><ActivityIndicator color={theme.primary} /></View>
        ) : entries.map((entry) => (
          <View key={entry.rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ color: entry.rank <= 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][entry.rank - 1] : theme.muted, fontWeight: '900', fontSize: 15, width: 28 }}>{entry.rank}</Text>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 }} numberOfLines={1}>{entry.displayName}</Text>
            <Ionicons name="trophy" size={13} color={theme.accent} />
            <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 14 }}>{entry.trophies}</Text>
          </View>
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
          <View style={{ alignItems: 'center', paddingVertical: 36 }}>
            <Ionicons name="time-outline" size={42} color={theme.border} />
            <Text style={[styles.muted, { marginTop: 8 }]}>{t('matchHistory.empty')}</Text>
          </View>
        ) : history.map((m) => {
          const myRounds = m.rounds.filter((r) => r.answeredBy === myName);
          const oppRounds = m.rounds.filter((r) => r.answeredBy !== myName);
          const pArena = arenaForTrophies(m.playerTrophies);
          const oArena = arenaForTrophies(m.opponentTrophies);
          const borderColor = m.won ? theme.primary : theme.danger;
          const date = new Date(m.playedAt);
          const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
          return (
            <View key={m.id} style={{ backgroundColor: theme.panelInnerFill, borderRadius: 14, borderWidth: 1.5, borderColor, marginBottom: 12, overflow: 'hidden' }}>
              {/* result + score + mode + date */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: m.won ? 'rgba(39,229,139,0.10)' : 'rgba(255,84,104,0.10)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={m.won ? 'trophy' : 'close-circle'} size={15} color={m.won ? theme.accent : theme.danger} />
                  <Text style={{ color: m.won ? theme.primary : theme.danger, fontWeight: '900', fontSize: 12 }}>{m.won ? t('matchHistory.won') : t('matchHistory.lost')}</Text>
                </View>
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900', letterSpacing: 2 }}>{m.playerScore} - {m.opponentScore}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.muted, fontSize: 8 }}>{MODE_LABEL((m.gameMode as GameMode) ?? 'team-team')}</Text>
                  <Text style={{ color: theme.muted, fontSize: 8 }}>{dateStr}</Text>
                </View>
              </View>
              {/* head-to-head */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: theme.text, fontWeight: '900', fontSize: 14 }} numberOfLines={1}>{m.playerName || myName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name={pArena.icon} size={11} color={pArena.color} />
                    <Text style={{ color: pArena.color, fontSize: 9, fontWeight: '700' }}>{m.playerTrophies}</Text>
                  </View>
                </View>
                <View style={{ justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ color: theme.muted, fontSize: 11, fontWeight: '900' }}>VS</Text></View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: theme.text, fontWeight: '900', fontSize: 14 }} numberOfLines={1}>{m.opponentName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name={oArena.icon} size={11} color={oArena.color} />
                    <Text style={{ color: oArena.color, fontSize: 9, fontWeight: '700' }}>{m.opponentTrophies}</Text>
                  </View>
                </View>
              </View>
              {/* who answered which player (two club logos + player photo/name) */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 12, gap: 6 }}>
                <View style={{ flex: 1 }}>
                  {myRounds.length > 0 ? myRounds.map((r, i) => (
                    <View key={i} style={{ backgroundColor: theme.bg, borderRadius: 10, padding: 7, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: theme.primary }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <ClubLogo uri={r.teamALogo} name={r.teamA} size={17} />
                        <Text style={{ color: theme.muted, fontSize: 8, fontWeight: '600' }}>+</Text>
                        <ClubLogo uri={r.teamBLogo} name={r.teamB} size={17} />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <PlayerPhoto uri={r.playerImageUrl} size={22} />
                        <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 10.5, flex: 1 }} numberOfLines={1}>{r.player}</Text>
                      </View>
                    </View>
                  )) : <Text style={{ color: theme.muted, fontSize: 10, textAlign: 'center', marginTop: 8 }}>—</Text>}
                </View>
                <View style={{ width: 1, backgroundColor: theme.border, marginVertical: 4 }} />
                <View style={{ flex: 1 }}>
                  {oppRounds.length > 0 ? oppRounds.map((r, i) => (
                    <View key={i} style={{ backgroundColor: theme.bg, borderRadius: 10, padding: 7, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: theme.danger }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <ClubLogo uri={r.teamALogo} name={r.teamA} size={17} />
                        <Text style={{ color: theme.muted, fontSize: 8, fontWeight: '600' }}>+</Text>
                        <ClubLogo uri={r.teamBLogo} name={r.teamB} size={17} />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <PlayerPhoto uri={r.playerImageUrl} size={22} />
                        <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 10.5, flex: 1 }} numberOfLines={1}>{r.player}</Text>
                      </View>
                    </View>
                  )) : <Text style={{ color: theme.muted, fontSize: 10, textAlign: 'center', marginTop: 8 }}>—</Text>}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </PopupCard>
  );
}

export function HomeScreen({ actions, state, onLanguageChange, onGoToStore, onOpenLeaderboard, onOpenMatchHistory }: Props) {
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [scope, setScope] = useState<Scope>({ type: 'all' });
  const [mode, setMode] = useState<GameMode>('team-team');
  const [picker, setPicker] = useState<Picker>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSub, setMenuSub] = useState<'settings' | null>(null);
  const [botOpen, setBotOpen] = useState(false);
  const opts: GameOptions = { scope, mode };
  const profile = state.profile;
  const playerName = profile?.displayName ?? (name || 'Oyuncu');

  return (
    <Screen>
      {/* Top bar: profile avatar (→ profile) · leaderboard (gems live in the global resource bar) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Pressable onPress={actions.openProfile} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.card, borderRadius: 22, paddingVertical: 4, paddingLeft: 4, paddingRight: 12, borderWidth: 2, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip, maxWidth: '60%', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.primary, shadowColor: theme.primary, shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }}>
            <Ionicons name="person" size={18} color={theme.primary} />
          </View>
          <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 13 }} numberOfLines={1}>{profile?.displayName ?? 'Oyuncu'}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setMenuOpen(true)} style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip }}>
          <Ionicons name="menu" size={20} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 4, paddingBottom: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.logo, { marginTop: 2, fontSize: 22, marginBottom: 8 }]}>CROSSOVER</Text>

        {profile ? <ArenaCrest arena={profile.arena} trophies={profile.trophies} onPress={actions.openArenas} /> : null}

        <View style={{ height: 16 }} />

        {/* Primary action — quick match always all teams, team-team mode */}
        <Btn label={t('home.quickMatch')} icon="flash" kind="primary" big onPress={() => actions.findMatch({ mode: 'team-team' })} />

        {/* Bot match */}
        <Btn label={t('home.solo')} icon="game-controller" kind="accent" onPress={() => setBotOpen(true)} />

        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      </ScrollView>

      {/* ── Hamburger Menu Popup ── */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => { setMenuOpen(false); setMenuSub(null); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border, maxHeight: '80%', overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }}>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900' }}>
                {menuSub === 'settings' ? t('settings.title') : t('menu.title')}
              </Text>
              <Pressable onPress={() => { if (menuSub) setMenuSub(null); else setMenuOpen(false); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={menuSub ? 'arrow-back' : 'close'} size={18} color={theme.text} />
              </Pressable>
            </View>
            <View style={{ height: 1, backgroundColor: theme.border }} />

            {/* Content */}
            {menuSub === null ? (
              <View style={{ padding: 12 }}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, backgroundColor: theme.bg }} onPress={() => { setMenuOpen(false); setMenuSub(null); onOpenLeaderboard?.(); }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{t('menu.leaderboard')}</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                </Pressable>
                <View style={{ height: 8 }} />
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, backgroundColor: theme.bg }} onPress={() => { setMenuOpen(false); setMenuSub(null); onOpenMatchHistory?.(); }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{t('menu.matchHistory')}</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                </Pressable>
                <View style={{ height: 8 }} />
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, backgroundColor: theme.bg }} onPress={() => setMenuSub('settings')}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{t('settings.title')}</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                </Pressable>
              </View>
            ) : (
              <SettingsPanel
                onLanguageChange={() => { setMenuOpen(false); setMenuSub(null); onLanguageChange?.(); }}
                diamonds={profile?.diamonds ?? 0}
                onChangeName={(newName) => actions.changeName(newName)}
                onNeedDiamonds={() => { setMenuOpen(false); setMenuSub(null); onGoToStore?.('diamonds'); }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Bot difficulty picker */}
      <GameModal visible={botOpen} onClose={() => setBotOpen(false)} title={t('home.solo')} icon="game-controller">
        {/* Mode & scope chips */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Chip icon={MODE_ICON[mode]} label={MODE_LABEL(mode)} onPress={() => setPicker('mode')} />
          <Chip icon="globe-outline" label={scopeLabel(scope)} onPress={() => setPicker('scopeType')} />
        </View>

        {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => {
          const c = d === 'easy' ? theme.primary : d === 'medium' ? theme.accent : theme.danger;
          return (
            <Pressable
              key={d}
              onPress={() => { setDifficulty(d); setBotOpen(false); actions.createSolo(playerName, { ...opts, difficulty: d }); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12, backgroundColor: theme.panelInnerFill, borderWidth: 1.5, borderColor: theme.border, borderLeftWidth: 4, borderLeftColor: c }}
            >
              <Ionicons name={d === 'easy' ? 'happy' : d === 'medium' ? 'flash' : 'skull'} size={20} color={c} />
              <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Poppins-ExtraBold' }}>{DIFF_LABEL(d)}</Text>
            </Pressable>
          );
        })}
      </GameModal>

      <PickerModal
        picker={picker}
        scopes={state.scopes}
        onClose={() => setPicker(null)}
        onDifficulty={(d) => {
          setDifficulty(d);
          setPicker(null);
        }}
        onScope={(s) => {
          setScope(s);
          setPicker(null);
        }}
        onMode={(m) => {
          setMode(m);
          setPicker(null);
        }}
        goto={setPicker}
      />
    </Screen>
  );
}

function PickerModal({
  picker,
  scopes,
  onClose,
  onDifficulty,
  onScope,
  onMode,
  goto,
}: {
  picker: Picker;
  scopes: GameState['scopes'];
  onClose: () => void;
  onDifficulty: (d: Difficulty) => void;
  onScope: (s: Scope) => void;
  onMode: (m: GameMode) => void;
  goto: (p: Picker) => void;
}) {
  const visible = picker !== null;
  const allList =
    picker === 'league' ? scopes?.leagues ?? [] : picker === 'country' ? scopes?.countries ?? [] : [];

  const [search, setSearch] = useState('');

  // Reset search when picker changes
  useEffect(() => { setSearch(''); }, [picker]);

  const filtered = search.trim()
    ? allList.filter((o) => (o.displayName ?? o.value).toLowerCase().includes(search.toLowerCase()))
    : allList;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBg} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {picker === 'difficulty' && (
            <>
              <Text style={styles.modalTitle}>Bot zorluğu</Text>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <Pressable key={d} style={styles.modalRow} onPress={() => onDifficulty(d)}>
                  <Text style={styles.modalRowText}>{DIFF_LABEL(d)}</Text>
                </Pressable>
              ))}
            </>
          )}

          {picker === 'mode' && (
            <>
              <Text style={styles.modalTitle}>{t('mode.select')}</Text>
              {(['team-team', 'country-team', 'letter-team'] as GameMode[]).map((m) => (
                <Pressable key={m} style={styles.modalRow} onPress={() => onMode(m)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name={MODE_ICON[m]} size={18} color={theme.accent} />
                    <Text style={styles.modalRowText}>{MODE_LABEL(m)}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {picker === 'scopeType' && (
            <>
              <Text style={styles.modalTitle}>Kapsam</Text>
              <Pressable style={styles.modalRow} onPress={() => onScope({ type: 'all' })}>
                <Text style={styles.modalRowText}>{t('scope.all')}</Text>
              </Pressable>
              <Pressable style={styles.modalRow} onPress={() => goto('league')}>
                <Text style={styles.modalRowText}>{t('scope.pickLeagueRow')}</Text>
              </Pressable>
              <Pressable style={styles.modalRow} onPress={() => goto('country')}>
                <Text style={styles.modalRowText}>{t('scope.pickCountryRow')}</Text>
              </Pressable>
            </>
          )}

          {(picker === 'league' || picker === 'country') && (
            <>
              <Text style={styles.modalTitle}>{picker === 'league' ? t('scope.pickLeague') : t('scope.pickCountry')}</Text>
              <View style={styles.modalSearchBox}>
                <Ionicons name="search" size={16} color={theme.muted} />
                <TextInput
                  placeholder={picker === 'league' ? t('scope.searchLeague') : t('scope.searchCountry')}
                  placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
                  value={search}
                  onChangeText={setSearch}
                  style={styles.modalSearchInput}
                  autoFocus
                />
                {search.length > 0 ? (
                  <Pressable onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={16} color={theme.muted} />
                  </Pressable>
                ) : null}
              </View>
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                {filtered.map((o) => (
                  <Pressable
                    key={o.value}
                    style={styles.modalRow}
                    onPress={() => onScope({ type: picker === 'league' ? 'league' : 'country', value: o.value })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      {picker === 'league' && o.logoUrl ? (
                        <Image source={{ uri: o.logoUrl }} style={{ width: 24, height: 24 }} resizeMode="contain" />
                      ) : picker === 'country' && o.logoUrl ? (
                        <Text style={{ fontSize: 20 }}>{o.logoUrl}</Text>
                      ) : picker === 'country' ? (
                        <Ionicons name="flag" size={18} color={theme.muted} />
                      ) : null}
                      <Text style={[styles.modalRowText, { flex: 1 }]} numberOfLines={1}>{o.displayName ?? o.value}</Text>
                    </View>
                    <Text style={styles.modalCount}>{o.count}</Text>
                  </Pressable>
                ))}
                {filtered.length === 0 && search.trim() ? (
                  <Text style={[styles.muted, { marginTop: 12 }]}>{t('common.noResults')}</Text>
                ) : null}
                {allList.length === 0 ? <Text style={styles.muted}>{t('common.loading')}</Text> : null}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---- Lobby ----
function LeaveConfirmModal({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 36 }}>
        <View style={{ backgroundColor: theme.card, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 24, alignItems: 'center' }}>
          <Ionicons name="warning" size={44} color={theme.danger} />
          <Text style={{ color: theme.text, fontSize: 16, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginTop: 14 }}>
            {t('leave.confirmTitle')}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13, fontFamily: 'Poppins-SemiBold', textAlign: 'center', marginTop: 6, marginBottom: 20 }}>
            {t('leave.confirmBody')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            <Pressable
              onPress={onCancel}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: 'center' }}
            >
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14 }}>{t('leave.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.danger, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontFamily: 'Poppins-ExtraBold', fontSize: 14 }}>{t('leave.confirm')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function OpponentForfeitModal({ visible, onFindNew, onGoHome }: { visible: boolean; onFindNew: () => void; onGoHome: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onGoHome}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 36 }}>
        <View style={{ backgroundColor: theme.card, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 24, alignItems: 'center' }}>
          <Ionicons name="exit-outline" size={48} color={theme.accent} />
          <Text style={{ color: theme.text, fontSize: 16, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginTop: 14, marginBottom: 20 }}>
            {t('opponent.leftTitle')}
          </Text>
          <View style={{ gap: 10, width: '100%' }}>
            <Pressable
              onPress={onFindNew}
              style={{ paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center' }}
            >
              <Text style={{ color: '#06131F', fontFamily: 'Poppins-ExtraBold', fontSize: 14 }}>{t('opponent.findNew')}</Text>
            </Pressable>
            <Pressable
              onPress={onGoHome}
              style={{ paddingVertical: 14, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: 'center' }}
            >
              <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 14 }}>{t('opponent.goHome')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
          <Ionicons
            name={p.name === 'Bot' ? 'game-controller' : p.isHost ? 'star' : 'person'}
            size={18}
            color={p.isHost ? theme.accent : theme.muted}
          />
          <Text style={styles.lobbyName}>
            {p.name}
            {p.id === room.youId ? t('lobby.youSuffix') : ''}
          </Text>
        </GamePanel>
      ))}
      <View style={{ height: 18 }} />
      {room.players.length < 2 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          <Text style={styles.muted}>{t('lobby.waiting')}</Text>
        </View>
      ) : canStart ? (
        <Btn label={t('lobby.start')} icon="play" onPress={actions.start} />
      ) : (
        <Text style={styles.muted}>{t('lobby.waitHost')}</Text>
      )}
      <View style={{ height: 16 }} />
      <Btn label={t('result.leave')} kind="ghost" icon="close" onPress={() => needConfirm ? setShowLeaveConfirm(true) : actions.leave()} />
      <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
    </Screen>
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

  const renderPlayer = (p: typeof you, color: string, slideY: Animated.AnimatedInterpolation<number>) => (
    <Animated.View style={{ transform: [{ translateY: slideY }], opacity: anim, alignItems: 'center', gap: 6 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.card, borderWidth: 3, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={p?.name === 'Bot' ? 'game-controller' : 'person'} size={30} color={color} />
      </View>
      <Text style={{ color: theme.text, fontSize: 18, fontFamily: 'Poppins-ExtraBold' }} numberOfLines={1}>{p?.name ?? '?'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name="trophy" size={15} color={theme.accent} />
        <Text style={{ color: theme.accent, fontSize: 14, fontFamily: 'Poppins-SemiBold' }}>{p?.trophies ?? 0}</Text>
      </View>
      {p?.arena ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.bg2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: color + '55' }}>
          <Text style={{ fontSize: 13 }}>{p.arena.icon}</Text>
          <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-SemiBold' }}>{p.arena.name}</Text>
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Text style={{ color: theme.muted, fontSize: 11, fontFamily: 'Poppins-ExtraBold', letterSpacing: 3 }}>{t('matchup.title')}</Text>
        {renderPlayer(opp, oppColor, oppSlide)}
        <Animated.View style={{ transform: [{ scale: vsScale }] }}>
          <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.accentDark }}>
            <Text style={{ color: '#06131F', fontFamily: 'Poppins-Black', fontSize: 16 }}>{t('matchup.vs')}</Text>
          </View>
        </Animated.View>
        {renderPlayer(you, youColor, youSlide)}
      </View>
    </Screen>
  );
}

// ---- Thought bubble callout (appears next to player bar) ----
function ThoughtBubble({ emoteId, emoteN, position }: { emoteId?: string; emoteN?: number; position: 'top' | 'bottom' }) {
  const a = useRef(new Animated.Value(0)).current;
  const [gone, setGone] = useState(true);
  const [currentEmote, setCurrentEmote] = useState<string | null>(null);

  useEffect(() => {
    if (!emoteId || !emoteN) return;
    setCurrentEmote(emoteId);
    setGone(false);
    a.setValue(0);
    Animated.spring(a, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    const tm = setTimeout(() => {
      Animated.timing(a, { toValue: 0, duration: 250, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => finished && setGone(true),
      );
    }, 3000);
    return () => clearTimeout(tm);
  }, [emoteId, emoteN, a]);

  if (gone || !currentEmote) return null;
  const scale = a.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.2, 1.1, 1] });
  const op = a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });
  const dotOp = a.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.6, 1] });

  return (
    <Animated.View style={{
      position: 'absolute', right: 6, [position === 'top' ? 'top' : 'bottom']: -60,
      opacity: op, transform: [{ scale }], zIndex: 50,
      alignItems: 'flex-end',
    }}>
      {/* Main bubble */}
      <View style={{
        backgroundColor: theme.card, borderRadius: 18, borderWidth: 1.5, borderColor: theme.border,
        paddingHorizontal: 8, paddingVertical: 6, minWidth: 60, alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
      }}>
        <EmoteSticker id={currentEmote} size={40} />
      </View>
      {/* Small dots (thought bubble tail) */}
      <Animated.View style={{ opacity: dotOp, alignItems: 'flex-end', marginRight: 10 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, marginTop: 3 }} />
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, marginTop: 2, marginRight: 4 }} />
      </Animated.View>
    </Animated.View>
  );
}

// ---- Shared in-match player bar (opponent top, you bottom) ----
function PlayerBar({ player, isYou, onEmotePress, emoteId, emoteN }: {
  player: { name: string; trophies?: number; arena?: { name: string; icon: string; minTrophies: number } } | undefined;
  isYou?: boolean;
  onEmotePress?: () => void;
  emoteId?: string;
  emoteN?: number;
}) {
  if (!player) return null;
  const color = player.arena ? arenaColor(player.arena.name) : theme.muted;
  return (
    <View style={{ position: 'relative', alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.card, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: isYou ? theme.primary + '44' : theme.border }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.bg2, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={player.name === 'Bot' ? 'game-controller' : 'person'} size={14} color={color} />
        </View>
        <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Poppins-ExtraBold', flex: 1 }} numberOfLines={1}>{player.name}</Text>
        <Ionicons name="trophy" size={13} color={theme.accent} />
        <Text style={{ color: theme.accent, fontSize: 12, fontFamily: 'Poppins-SemiBold' }}>{player.trophies ?? 0}</Text>
        {isYou && onEmotePress ? (
          <Pressable onPress={onEmotePress} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
            <Ionicons name="happy" size={18} color="#06131F" />
          </Pressable>
        ) : null}
      </View>
      <ThoughtBubble emoteId={emoteId} emoteN={emoteN} position={isYou ? 'bottom' : 'top'} />
    </View>
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
        <View style={{ width: 172, height: 172, borderRadius: 86, borderWidth: 5, borderColor: theme.primary, borderTopColor: '#7CF3BC', borderBottomColor: theme.primaryDark, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panelInk, shadowColor: theme.primary, shadowOpacity: 0.65, shadowRadius: 28, shadowOffset: { width: 0, height: 0 }, elevation: 18 }}>
          <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: theme.card, borderWidth: 2, borderColor: theme.primary + '55', alignItems: 'center', justifyContent: 'center' }}>
            <Animated.Text style={{ color: theme.text, fontSize: n > 0 ? 88 : 50, fontFamily: 'Poppins-Black', transform: [{ scale }], opacity: a, ...engrave('lg') }}>
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

function PickTimer({ pickEndsAt }: { pickEndsAt: number | null }) {
  const [pickSecs, setPickSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!pickEndsAt) return;
    const tick = () => setPickSecs(Math.max(0, Math.ceil((pickEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [pickEndsAt]);
  return (
    <View style={styles.pickTimerBox}>
      <Ionicons name="time-outline" size={18} color={pickSecs !== null && pickSecs <= 3 ? theme.danger : theme.accent} />
      <Text style={[styles.pickTimerText, pickSecs !== null && pickSecs <= 3 ? { color: theme.danger } : null]}>
        {pickSecs !== null ? pickSecs : 10}
      </Text>
    </View>
  );
}

export function PickTeamScreen({ state, actions, tutorial }: Props) {
  const [q, setQ] = useState('');
  const [countryQ, setCountryQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const role = state.pickRole ?? 'team';
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const hasBot = state.room?.players.some((p) => p.name === 'Bot');
  const handleLeave = () => hasBot ? actions.leave() : setShowLeaveConfirm(true);
  const room = state.room;
  const oppPlayer = room?.players.find((p) => p.id !== room.youId);
  const youPlayer = room?.players.find((p) => p.id === room.youId);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const oppEmote = room ? state.emotes[room.players.find((p) => p.id !== room.youId)?.id ?? ''] : undefined;
  const myEmote = room ? state.emotes[room.youId] : undefined;

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

  if (state.picked) {
    return (
      <Screen>
        <PlayerBar player={oppPlayer} emoteId={oppEmote?.emoteId} emoteN={oppEmote?.n} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <ActivityIndicator color={theme.primary} />
          <Text style={styles.muted}>{t('pick.picked')}</Text>
        </View>
        <PlayerBar player={youPlayer} isYou emoteId={myEmote?.emoteId} emoteN={myEmote?.n} />
        <Pressable onPress={handleLeave} style={{ position: 'absolute', top: 54, left: 18, zIndex: 20 }}>
          <Ionicons name="close-circle" size={32} color={theme.muted} />
        </Pressable>
        <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
      </Screen>
    );
  }

  // ---- Letter picker ----
  if (role === 'letter') {
    return (
      <Screen>
        <PlayerBar player={oppPlayer} emoteId={oppEmote?.emoteId} emoteN={oppEmote?.n} />
        <View style={{ alignItems: 'center', marginBottom: 8, marginTop: 8 }}>
          <Text style={styles.h1}>{t('pick.titleLetter')}</Text>
          <PickTimer pickEndsAt={state.pickEndsAt} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {PICK_LETTERS.map((l) => (
            <Pressable
              key={l}
              style={{
                width: 48, height: 48, borderRadius: 12,
                backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
                alignItems: 'center', justifyContent: 'center',
              }}
              onPress={() => actions.pickLetter(l)}
            >
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900' }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <PlayerBar player={youPlayer} isYou onEmotePress={() => setEmoteOpen(true)} emoteId={myEmote?.emoteId} emoteN={myEmote?.n} />
        <Pressable onPress={handleLeave} style={{ position: 'absolute', top: 54, left: 18, zIndex: 20 }}>
          <Ionicons name="close-circle" size={32} color={theme.muted} />
        </Pressable>
        <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
        {!tutorial ? <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} /> : null}
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
        <PlayerBar player={oppPlayer} emoteId={oppEmote?.emoteId} emoteN={oppEmote?.n} />
        <View style={{ alignItems: 'center', marginBottom: 8, marginTop: 8 }}>
          <Text style={styles.h1}>{t('pick.titleCountry')}</Text>
          <PickTimer pickEndsAt={state.pickEndsAt} />
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={theme.muted} />
          <TextInput
            placeholder={t('pick.searchCountry')}
            placeholderTextColor={theme.muted}
            keyboardAppearance="dark"
            value={countryQ}
            onChangeText={setCountryQ}
            style={styles.searchInput}
            autoFocus={!tutorial}
          />
        </View>
        <ScrollView style={{ alignSelf: 'stretch', flex: 1 }} keyboardShouldPersistTaps="handled">
          {filtered.map((n) => (
            <Pressable key={n.value} style={styles.clubRow} onPress={() => actions.pickCountry(n.value)}>
              <Text style={{ fontSize: 24 }}>{n.flag}</Text>
              <Text style={styles.clubText} numberOfLines={1}>{n.displayName}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </Pressable>
          ))}
          {filtered.length === 0 && countryQ.trim() ? <Text style={styles.muted}>{t('common.noResults')}</Text> : null}
        </ScrollView>
        <PlayerBar player={youPlayer} isYou onEmotePress={() => setEmoteOpen(true)} emoteId={myEmote?.emoteId} emoteN={myEmote?.n} />
        <Pressable onPress={handleLeave} style={{ position: 'absolute', top: 54, left: 18, zIndex: 20 }}>
          <Ionicons name="close-circle" size={32} color={theme.muted} />
        </Pressable>
        <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
        {!tutorial ? <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} /> : null}
      </Screen>
    );
  }

  // ---- Team picker (default) ----
  return (
    <Screen>
      <PlayerBar player={oppPlayer} emoteId={oppEmote?.emoteId} emoteN={oppEmote?.n} />
      <View style={{ alignItems: 'center', marginBottom: 8, marginTop: 8 }}>
        <Text style={styles.h1}>{t('pick.title')}</Text>
        <PickTimer pickEndsAt={state.pickEndsAt} />
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.muted} />
        <TextInput
          placeholder={t('pick.search')}
          placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
          value={q}
          onChangeText={onChange}
          style={styles.searchInput}
          autoFocus={!tutorial}
        />
      </View>
      <ScrollView
        style={{ alignSelf: 'stretch', flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8, paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {state.clubResults.map((c: ClubRef) => (
          <Pressable
            key={c.id}
            onPress={() => actions.pickTeam(c.id)}
            style={{
              width: '31.5%', alignItems: 'center', gap: 7,
              backgroundColor: theme.card, borderRadius: 14,
              borderWidth: 2, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip,
              paddingVertical: 12, paddingHorizontal: 4,
              shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 4,
            }}
          >
            <ClubBadge name={c.name} size={46} logoUrl={c.logoUrl} />
            <Text style={{ color: theme.text, fontSize: 10.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center' }} numberOfLines={2}>
              {c.name}
            </Text>
          </Pressable>
        ))}
        {state.clubResults.length === 0 && q.trim() ? (
          <Text style={[styles.muted, { width: '100%', marginTop: 20 }]}>{t('common.noResults')}</Text>
        ) : null}
      </ScrollView>
      <PlayerBar player={youPlayer} isYou onEmotePress={() => setEmoteOpen(true)} emoteId={myEmote?.emoteId} emoteN={myEmote?.n} />
      <Pressable onPress={handleLeave} style={{ position: 'absolute', top: 54, left: 18, zIndex: 20 }}>
        <Ionicons name="close-circle" size={32} color={theme.muted} />
      </Pressable>
      <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
      {!tutorial ? <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} /> : null}
    </Screen>
  );
}

// ---- Reveal + Guess ----
export function GuessScreen({ state, actions, tutorial }: Props) {
  const [text, setText] = useState('');
  const teams = state.teams;
  const room = state.room!;
  const youAnswered = state.locked?.byId === room.youId;
  const someoneElseAnswered = state.locked && state.locked.byId !== room.youId;
  const youPassed = state.passedBy.includes(room.youId);
  const oppPassed = state.passedBy.some((id) => id !== room.youId);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const hasBot = room.players.some((p) => p.name === 'Bot');
  const handleLeave = () => hasBot ? actions.leave() : setShowLeaveConfirm(true);
  const oppPlayer = room.players.find((p) => p.id !== room.youId);
  const youPlayer = room.players.find((p) => p.id === room.youId);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const oppEmote = state.emotes[room.players.find((p) => p.id !== room.youId)?.id ?? ''];
  const myEmote = state.emotes[room.youId];

  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'guess' || !state.guessEndsAt) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((state.guessEndsAt! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.phase, state.guessEndsAt]);

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

  return (
    <Screen scroll>
      <PlayerBar player={oppPlayer} emoteId={oppEmote?.emoteId} emoteN={oppEmote?.n} />
      <View style={{ height: 8 }} />
      <View style={styles.teamsRow}>
        <Animated.View style={[styles.teamCard, { transform: [{ translateX: leftX }], opacity: reveal }]}>
          {state.revealMode === 'country-team' ? (
            <Text style={{ fontSize: 52 }}>{NATIONALITIES.find((n) => n.value === state.revealCountry)?.flag ?? '🏳️'}</Text>
          ) : state.revealMode === 'letter-team' ? (
            <Text style={{ color: theme.accent, fontSize: 48, fontFamily: 'Poppins-Black' }}>{teams?.teamA.name ?? '?'}</Text>
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
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.55)', borderBottomWidth: 4, borderBottomColor: theme.accentDark, shadowColor: theme.accent, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8 }}>
            <Text style={{ color: theme.ink, fontFamily: 'Poppins-Black', fontSize: 15, ...engrave('sm') }}>VS</Text>
          </View>
        </Animated.View>
        <Animated.View style={[styles.teamCard, { transform: [{ translateX: rightX }], opacity: reveal }]}>
          <ClubBadge name={teams?.teamB.name ?? '?'} size={62} logoUrl={teams?.teamB.logoUrl ?? null} />
          <Text style={styles.teamName} numberOfLines={2}>
            {teams?.teamB.name ?? '…'}
          </Text>
        </Animated.View>
      </View>

      {state.phase === 'reveal' ? (
        <Text style={styles.h1}>{t('getReadyWait')}</Text>
      ) : (
        <>
          <Text style={styles.timer}>{secs !== null ? `${secs}s` : ''}</Text>
          {someoneElseAnswered ? (
            <View style={styles.center}>
              <Ionicons name="lock-closed" size={28} color={theme.muted} />
              <Text style={styles.muted}>{t('guess.locked', { name: state.locked?.byName ?? '' })}</Text>
            </View>
          ) : youPassed ? (
            <View style={styles.center}>
              <Ionicons name="play-skip-forward" size={30} color={theme.accent} />
              <Text style={styles.muted}>{t('guess.youPassed')}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.h1}>
                {state.revealMode === 'country-team' && state.revealCountry && teams?.teamB
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
              <TextInput
                placeholder={t('guess.placeholder')}
                placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
                value={text}
                onChangeText={setText}
                style={styles.input}
                autoFocus={!tutorial}
                editable={!youAnswered}
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
        </>
      )}
      <View style={{ height: 8 }} />
      <PlayerBar player={youPlayer} isYou onEmotePress={() => setEmoteOpen(true)} emoteId={myEmote?.emoteId} emoteN={myEmote?.n} />
      <Pressable onPress={handleLeave} style={{ position: 'absolute', top: 54, left: 18, zIndex: 20 }}>
        <Ionicons name="close-circle" size={32} color={theme.muted} />
      </Pressable>
      <LeaveConfirmModal visible={showLeaveConfirm} onCancel={() => setShowLeaveConfirm(false)} onConfirm={actions.leave} />
      {!tutorial ? <EmoteLayer state={state} actions={actions} hideFab externalOpen={emoteOpen} onOpenChange={setEmoteOpen} /> : null}
    </Screen>
  );
}

// ---- Store ----
const DIAMOND_PACKS = [
  { id: 'pack1', amount: 100, price: '₺29,99', color: '#A855F7', best: false },
  { id: 'pack2', amount: 500, price: '₺99,99', color: '#C084FC', best: true },
  { id: 'pack3', amount: 1200, price: '₺199,99', color: '#A855F7', best: false },
  { id: 'pack4', amount: 5000, price: '₺699,99', color: '#7C3AED', best: false },
];

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBg} onPress={onClose}>
        <Pressable style={styles.nameModalCard} onPress={() => {}}>
          <Ionicons name="create" size={32} color={theme.accent} />
          <Text style={styles.modalTitle}>{t('store.changeName')}</Text>

          <TextInput
            placeholder={t('store.newName')}
            placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
            value={newName}
            onChangeText={setNewName}
            style={styles.input}
            autoFocus
            maxLength={20}
          />

          <View style={styles.nameModalCost}>
            <Text style={styles.muted}>{t('store.cost')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: canAfford ? GEM_COLOR : theme.danger, fontWeight: '800', fontSize: 15 }}>{cost}</Text>
              <GemIcon size={14} />
            </View>
            <Text style={styles.muted}>{t('store.balance')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{diamonds}</Text>
              <GemIcon size={14} />
            </View>
          </View>

          {!canAfford ? (
            <Text style={{ color: theme.danger, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>
              {t('store.changeNameInsufficient')}
            </Text>
          ) : null}

          <Btn
            label={t('store.changeNameConfirm')}
            kind="accent"
            icon="checkmark"
            onPress={() => onConfirm(newName.trim())}
            disabled={!canAfford || newName.trim().length < 2}
          />
          <View style={{ height: 6 }} />
          <Btn label={t('store.cancel')} kind="ghost" icon="close" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const AD_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 saat
const AD_STORAGE_KEY = '@crossover_ad_state';

function useAdState() {
  const [adsWatched, setAdsWatched] = useState(0);
  const [nextAdAt, setNextAdAt] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState('');

  // Load from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const raw = await AsyncStorage.getItem(AD_STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          const today = new Date().toDateString();
          if (data.date === today) {
            setAdsWatched(data.watched);
            if (data.nextAdAt) setNextAdAt(data.nextAdAt);
          }
        }
      } catch {}
    })();
  }, []);

  // Reset at midnight (00:00)
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const storedDate = new Date().toDateString();
      // If adsWatched > 0 but date changed, reset
      if (adsWatched > 0) {
        (async () => {
          try {
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            const raw = await AsyncStorage.getItem(AD_STORAGE_KEY);
            if (raw) {
              const data = JSON.parse(raw);
              if (data.date !== storedDate) {
                setAdsWatched(0);
                setNextAdAt(null);
                setCooldownLeft('');
              }
            }
          } catch {}
        })();
      }
    };
    const id = setInterval(check, 60_000); // check every minute
    return () => clearInterval(id);
  }, [adsWatched]);

  // Countdown timer
  useEffect(() => {
    if (!nextAdAt) return;
    const tick = () => {
      const diff = nextAdAt - Date.now();
      if (diff <= 0) {
        setCooldownLeft('');
        setNextAdAt(null);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCooldownLeft(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextAdAt]);

  const watchAd = async () => {
    if (adsWatched >= 2) return;
    if (nextAdAt && Date.now() < nextAdAt) return;
    const newCount = adsWatched + 1;
    const newNextAt = newCount < 2 ? Date.now() + AD_COOLDOWN_MS : null;
    setAdsWatched(newCount);
    setNextAdAt(newNextAt);
    setCooldownLeft('');
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem(AD_STORAGE_KEY, JSON.stringify({
        date: new Date().toDateString(),
        watched: newCount,
        nextAdAt: newNextAt,
      }));
    } catch {}
  };

  const canWatch = adsWatched < 2 && (!nextAdAt || Date.now() >= nextAdAt);
  return { adsWatched, canWatch, cooldownLeft, watchAd };
}

// Next weekly drop reset = upcoming Monday 00:00 local.
function nextWeeklyReset(): number {
  const d = new Date();
  const daysUntilMon = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMon);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Valorant-style countdown pill: "X gün Y saat" normally, "Xsa Ydk Zsn" under a day.
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
  const label = days >= 1 ? `${days} gün ${hh} saat` : `${hh}sa ${mm}dk ${ss}sn`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: theme.danger, marginBottom: 4 }}>
      <Ionicons name="time-outline" size={12} color={theme.danger} />
      <Text style={{ color: theme.danger, fontSize: 10, fontWeight: '800' }}>{label} kaldı</Text>
    </View>
  );
}

export function StoreScreen({ state, actions, scrollToSection }: Props & { scrollToSection?: 'socialPack' | 'diamonds' | null }) {
  const profile = state.profile;
  const { adsWatched, canWatch, cooldownLeft, watchAd } = useAdState();
  const storeScrollRef = useRef<ScrollView>(null);
  const sectionYRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (scrollToSection && storeScrollRef.current) {
      const y = sectionYRef.current[scrollToSection];
      if (y !== undefined) {
        setTimeout(() => storeScrollRef.current?.scrollTo({ y, animated: true }), 150);
      }
    }
  }, [scrollToSection]);

  return (
    <Screen>
      <ScrollView ref={storeScrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={t('store.title')} icon="storefront" underline={theme.accent} />

        {/* Sosyal Paket */}
        <View onLayout={(e) => { sectionYRef.current['socialPack'] = e.nativeEvent.layout.y; }} />
        <Text style={styles.sectionLabel}>SOSYAL PAKET</Text>
        <View style={[styles.storePackCard, { borderColor: theme.accent, borderWidth: 2 }]}>
          <View style={styles.storePackBadge}>
            <Text style={styles.storePackBadgeText}>YENİ</Text>
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="people" size={24} color={theme.accent} />
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>Sosyal Paket</Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              Arkadaşlarınla Ülke-Takım ve Harf-Takım modlarında dostluk maçı oyna.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <View style={[styles.storePackPriceBox, { flex: 1, alignItems: 'center' as const }]}>
                <Text style={{ color: '#06131F', fontSize: 10, fontWeight: '600' }}>Haftalık</Text>
                <Text style={styles.storePackPrice}>₺24,99</Text>
              </View>
              <View style={[styles.storePackPriceBox, { flex: 1, alignItems: 'center' as const, backgroundColor: theme.accent }]}>
                <Text style={{ color: '#06131F', fontSize: 10, fontWeight: '600' }}>Aylık</Text>
                <Text style={styles.storePackPrice}>₺89,99</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Free diamonds - watch ads */}
        <Text style={styles.sectionLabel}>{t('store.freeDiamonds')}</Text>
        <View style={styles.storeAdCard}>
          <Ionicons name="play-circle" size={32} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.storeAdTitle}>{t('store.watchAd')}</Text>
            <Text style={styles.muted}>{t('store.adsDaily')}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 }}>
              <Text style={styles.storeAdReward}>+25</Text>
              <GemIcon size={14} />
            </View>
            {adsWatched >= 2 ? (
              <Btn label={t('store.done')} kind="ghost" icon="checkmark-circle" onPress={() => {}} disabled />
            ) : cooldownLeft ? (
              <View style={styles.storeCooldown}>
                <Ionicons name="time-outline" size={14} color={theme.accent} />
                <Text style={styles.storeCooldownText}>{cooldownLeft}</Text>
              </View>
            ) : (
              <Btn label={t('store.watch')} kind="primary" icon="play" onPress={watchAd} />
            )}
            <Text style={[styles.muted, { fontSize: 10, marginTop: 2 }]}>{adsWatched}/2</Text>
          </View>
        </View>

        {/* Diamond packs */}
        <View onLayout={(e) => { sectionYRef.current['diamonds'] = e.nativeEvent.layout.y; }} />
        <Text style={styles.sectionLabel}>{t('store.packs')}</Text>
        {DIAMOND_PACKS.map((pack) => (
          <Pressable key={pack.id} style={[styles.storePackCard, pack.best && styles.storePackBest]}>
            {pack.best ? (
              <View style={styles.storePackBadge}>
                <Text style={styles.storePackBadgeText}>{t('store.popular')}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.storePackIcon, { backgroundColor: pack.color + '22' }]}>
                <GemIcon size={28} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storePackAmount}>{t('store.diamonds', { n: pack.amount.toLocaleString('tr-TR') })}</Text>
              </View>
              <View style={styles.storePackPriceBox}>
                <Text style={styles.storePackPrice}>{pack.price}</Text>
              </View>
            </View>
          </Pressable>
        ))}

        {/* Haftalık ifade dükkanı (satışlar burada — koleksiyonda değil) */}
        {emoteWeeks().map(({ week, emotes }) => (
          <View key={week}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.sectionLabel}>{week === LATEST_WEEK ? 'BU HAFTA' : `${week}. HAFTA İFADELERİ`}</Text>
              {week === LATEST_WEEK ? (
                <>
                  <View style={{ backgroundColor: theme.danger, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>YENİ</Text>
                  </View>
                  <WeeklyCountdown />
                </>
              ) : null}
            </View>
            {emotes.map((e) => {
              const owned = ownsEmote(profile, e.id);
              const canAfford = (profile?.diamonds ?? 0) >= (e.premium?.price ?? 0);
              return (
                <View key={e.id} style={styles.storeEmoteCard}>
                  <View style={{ width: 56, height: 56 }}>
                    <EmoteSticker id={e.id} size={56} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storeEmoteName}>{e.premium?.name}</Text>
                    <Text style={styles.storeEmoteDesc} numberOfLines={2}>{e.premium?.desc}</Text>
                  </View>
                  {owned ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                      <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12 }}>Sahipsin</Text>
                    </View>
                  ) : (
                    <Pressable style={[styles.storeEmoteBuy, !canAfford && { opacity: 0.5 }]} onPress={() => canAfford && actions.buyEmote(e.id)}>
                      <Text style={styles.storeEmoteBuyText}>{e.premium?.price}</Text>
                      <GemIcon size={13} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

// ---- Collection (emotes / loadout) ----
export function CollectionScreen({ state, actions }: Props) {
  const profile = state.profile;
  const equipped = profile?.equippedEmotes ?? [];
  const toggleEquip = (id: string) => {
    if (equipped.includes(id)) actions.equipEmotes(equipped.filter((x) => x !== id));
    else if (equipped.length < 3) actions.equipEmotes([...equipped, id]);
  };
  // Only VISUAL (premium) emotes can be equipped into the 3 loadout slots — the free
  // quick-chat + character faces are always available in matches, so they're not shown
  // here (tapping them did nothing because the server rejects equipping free emotes).
  const all = PREMIUM_EMOTES;
  const COL_GAP = 8;
  const COL_W = Math.floor((SCREEN_W - 44 - COL_GAP * 3) / 4); // 4 columns inside Screen's 22px padding

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <ScreenHeader title="Koleksiyon" icon="albums" underline={theme.primary} />
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 10 }]}>Maçta kuşanılan {equipped.length}/3</Text>

        {/* Equipped loadout — 3 slots at the very top (empty = dashed placeholder) */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 18 }}>
          {[0, 1, 2].map((i) => {
            const id = equipped[i];
            const em = id ? all.find((e) => e.id === id) : null;
            return (
              <Pressable
                key={`slot${i}`}
                onPress={() => { if (id) toggleEquip(id); }}
                style={{
                  width: 82, height: 82, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: em ? theme.card : theme.panelInnerFill,
                  borderWidth: 2, borderColor: em ? theme.primary : theme.border,
                  borderStyle: em ? 'solid' : 'dashed',
                  shadowColor: em ? theme.primary : 'transparent', shadowOpacity: em ? 0.5 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
                }}
              >
                {em ? <EmoteSticker id={em.id} size={62} /> : <Ionicons name="add" size={26} color={theme.muted} />}
              </Pressable>
            );
          })}
        </View>

        {/* All emotes — 4-column grid. The WHOLE card is tappable → equips directly. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP }}>
          {all.map((e) => {
            const owned = ownsEmote(profile, e.id);
            const isEquipped = equipped.includes(e.id);
            const full = equipped.length >= 3 && !isEquipped;
            return (
              <Pressable
                key={e.id}
                disabled={!owned}
                onPress={() => { if (owned && !full) toggleEquip(e.id); }}
                style={{
                  width: COL_W, paddingTop: 11, paddingBottom: 9, paddingHorizontal: 4,
                  backgroundColor: theme.card, borderRadius: 14, alignItems: 'center',
                  borderWidth: 2, borderColor: isEquipped ? theme.primary : theme.border,
                  borderBottomWidth: 3, borderBottomColor: isEquipped ? theme.primaryDark : theme.cardLip,
                  opacity: owned ? (full ? 0.65 : 1) : 0.5,
                }}
              >
                {isEquipped ? (
                  <View style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                    <Ionicons name="checkmark" size={12} color="#06131F" />
                  </View>
                ) : null}
                <EmoteSticker id={e.id} size={58} />
                <View style={{ height: 6 }} />
                {owned ? (
                  <Text style={{ color: isEquipped ? theme.primary : theme.muted, fontWeight: '800', fontSize: 10.5 }} numberOfLines={1} adjustsFontSizeToFit>{isEquipped ? 'Kuşanıldı' : 'Kuşan'}</Text>
                ) : (
                  <Ionicons name="lock-closed" size={13} color={theme.muted} />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

// Waiting overlay shown to the inviter while the friend decides (30s window).
function InviteWaitingModal({ invite, onCancel }: { invite: GameState['outgoingInvite']; onCancel: () => void }) {
  const [left, setLeft] = useState(30);
  useEffect(() => {
    if (!invite) return;
    const tick = () => {
      const s = Math.max(0, Math.ceil((invite.expiresAt - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) onCancel();
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [invite?.toId, invite?.expiresAt]);
  return (
    <Modal visible={!!invite} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={styles.modalTitle}>{invite?.toName}</Text>
          <Text style={[styles.muted, { textAlign: 'center', marginBottom: 6 }]}>Kabul etmesi bekleniyor…</Text>
          <Text style={{ color: theme.accent, fontFamily: 'Poppins-Black', fontSize: 36 }}>{left}s</Text>
          <View style={{ height: 12 }} />
          <Btn label="Vazgeç" kind="ghost" icon="close" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

// A friend's public profile (tapped from the friends list).
function FriendProfileModal({ profile, onClose }: { profile: PublicProfile | null; onClose: () => void }) {
  const total = (profile?.wins ?? 0) + (profile?.losses ?? 0);
  const winRate = total ? Math.round(((profile?.wins ?? 0) / total) * 100) : 0;
  const color = profile ? arenaColor(profile.arena.name) : theme.primary;
  return (
    <Modal visible={!!profile} animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent>
      <View style={{ flex: 1, backgroundColor: BG_TOP }}>
        <ScreenBg />
        <View style={{ flex: 1, paddingTop: 56, paddingHorizontal: 20 }}>
          {/* Header with back */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}>
              <Ionicons name="arrow-back" size={20} color={theme.text} />
            </Pressable>
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 18, marginLeft: 12 }}>Profil</Text>
          </View>

          {/* Avatar + name + arena */}
          <View style={{ alignItems: 'center', marginBottom: 26 }}>
            <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: theme.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: color, shadowColor: color, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10 }}>
              <Ionicons name="person" size={56} color={color} />
            </View>
            <Text style={{ color: theme.text, fontFamily: 'Poppins-ExtraBold', fontSize: 24, marginTop: 14 }}>{profile?.displayName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: theme.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: color + '66' }}>
              <Ionicons name="trophy" size={15} color={theme.gold} />
              <Text style={{ color: theme.gold, fontWeight: '900', fontSize: 16 }}>{profile?.trophies ?? 0}</Text>
              <Text style={styles.muted}> · {profile?.arena.name ?? ''}</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard icon="trophy" color={theme.primary} label="Galibiyet" value={profile?.wins ?? 0} />
            <StatCard icon="skull-outline" color={theme.danger} label="Mağlubiyet" value={profile?.losses ?? 0} />
            <StatCard icon="stats-chart" color={theme.blue} label="Kazanma %" value={`${winRate}%`} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---- Friends ----
export function FriendsScreen({ state, actions, onGoToStore }: Props) {
  const [addInput, setAddInput] = useState('');
  const [searchMode, setSearchMode] = useState<'code' | 'username'>('code');
  const [friendTab, setFriendTab] = useState<'friends' | 'requests'>('friends');
  const [copied, setCopied] = useState(false);
  const [matchModal, setMatchModal] = useState<string | null>(null); // friendId — mode picker
  const [matchStep, setMatchStep] = useState<'mode' | 'scope'>('mode');
  const [matchMode, setMatchMode] = useState<GameMode>('team-team');
  const [matchScope, setMatchScope] = useState<Scope>({ type: 'all' });
  const [matchPicker, setMatchPicker] = useState<'scopeType' | 'league' | 'country' | null>(null);
  const [menuFriend, setMenuFriend] = useState<FriendInfo | null>(null); // tapped friend → actions popover
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // tap anchor for the popover
  const [confirmRemove, setConfirmRemove] = useState<FriendInfo | null>(null); // remove confirmation
  const [socialPackPopup, setSocialPackPopup] = useState(false);
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
    if (profile?.userId) actions.loadFriends();
  }, [profile?.userId]);

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
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={t('friends.title')} icon="people" underline={theme.primary} />

        {/* Your code */}
        <Text style={styles.sectionLabel}>{t('friends.yourCode')}</Text>
        <View style={[styles.friendAddCard, { justifyContent: 'center', gap: 10 }]}>
          <Text style={styles.friendCode}>{profile?.userId?.slice(0, 8).toUpperCase() ?? '...'}</Text>
          <Pressable
            onPress={() => {
              const code = profile?.userId?.slice(0, 8).toUpperCase();
              if (code) {
                Clipboard.setStringAsync(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            hitSlop={8}
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? theme.primary : theme.accent} />
          </Pressable>
        </View>

        {/* Add friend */}
        <Text style={styles.sectionLabel}>{t('friends.addSection')}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
          <Pressable
            style={[styles.optChip, searchMode === 'code' && { borderColor: theme.primary }]}
            onPress={() => setSearchMode('code')}
          >
            <Ionicons name="key-outline" size={14} color={searchMode === 'code' ? theme.primary : theme.muted} />
            <Text style={[styles.optChipText, searchMode === 'code' && { color: theme.primary }]}>Kod ile</Text>
          </Pressable>
          <Pressable
            style={[styles.optChip, searchMode === 'username' && { borderColor: theme.primary }]}
            onPress={() => setSearchMode('username')}
          >
            <Ionicons name="person-outline" size={14} color={searchMode === 'username' ? theme.primary : theme.muted} />
            <Text style={[styles.optChipText, searchMode === 'username' && { color: theme.primary }]}>İsim ile</Text>
          </Pressable>
        </View>
        <TextInput
          placeholder={searchMode === 'code' ? t('friends.enterCode') : 'Kullanıcı adı yaz'}
          placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
          value={addInput}
          onChangeText={setAddInput}
          autoCapitalize={searchMode === 'code' ? 'characters' : 'none'}
          autoCorrect={false}
          onSubmitEditing={onSendRequest}
          style={styles.input}
        />
        <Btn label="Arkadaşlık İsteği Gönder" icon="paper-plane" kind="primary" onPress={onSendRequest} disabled={addInput.trim().length < 3} />
        {state.error ? <Text style={[styles.error, { marginTop: 6 }]}>{state.error}</Text> : null}
        {state.notice ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
            <Ionicons name="checkmark-circle" size={15} color={theme.primary} />
            <Text style={{ color: theme.primary, fontSize: 12.5, fontWeight: '700' }}>{state.notice}</Text>
          </View>
        ) : null}

        {/* Tabs: Arkadaşlarım | Arkadaşlık İstekleri */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 12 }}>
          {([['friends', 'people', 'Arkadaşlarım'], ['requests', 'person-add', 'İstekler']] as const).map(([key, icon, label]) => {
            const active = friendTab === key;
            const badge = key === 'requests' && requests.length > 0 ? ` (${requests.length})` : '';
            return (
              <Pressable
                key={key}
                onPress={() => setFriendTab(key)}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 11, borderRadius: 12,
                  backgroundColor: active ? theme.primary : theme.card,
                  borderWidth: 1, borderColor: active ? theme.primary : theme.border,
                }}
              >
                <Ionicons name={icon} size={16} color={active ? '#06131F' : theme.muted} />
                <Text style={{ color: active ? '#06131F' : theme.text, fontWeight: '800', fontSize: 13 }}>{label}{badge}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Requests tab */}
        {friendTab === 'requests' ? (
          requests.length === 0 ? (
            <View style={styles.friendEmpty}>
              <Ionicons name="mail-open-outline" size={48} color={theme.border} />
              <Text style={styles.muted}>Bekleyen istek yok</Text>
            </View>
          ) : (
            requests.map((req) => (
              <View key={req.requestId || req.fromId} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: theme.card, borderRadius: 14, padding: 12, marginBottom: 8,
                borderWidth: 2, borderColor: theme.accent, borderBottomWidth: 3, borderBottomColor: theme.accentDark,
                shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
              }}>
                <Ionicons name="person-add" size={24} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{req.fromName}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>Seninle arkadaş olmak istiyor</Text>
                </View>
                <Pressable
                  onPress={() => actions.respondFriendRequest(req.requestId, true)}
                  style={{ backgroundColor: theme.primary, borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="checkmark" size={20} color="#06131F" />
                </Pressable>
                <Pressable
                  onPress={() => actions.respondFriendRequest(req.requestId, false)}
                  style={{ backgroundColor: theme.danger, borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </Pressable>
              </View>
            ))
          )
        ) : /* Friends tab */ friends.length === 0 ? (
          <View style={styles.friendEmpty}>
            <Ionicons name="people-outline" size={48} color={theme.border} />
            <Text style={styles.muted}>{t('friends.empty')}</Text>
            <Text style={[styles.muted, { fontSize: 11 }]}>{t('friends.shareHint')}</Text>
          </View>
        ) : (
          friends.map((f) => (
            <Pressable
              key={f.userId}
              onPress={(e) => { setMenuPos({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }); setMenuFriend(f); }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: theme.card, borderRadius: 14, padding: 12, marginBottom: 8,
                borderWidth: 2, borderColor: f.online ? theme.primary : theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip,
                shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
              }}
            >
              <View style={{ position: 'relative' }}>
                <Ionicons name="person-circle" size={38} color={theme.accent} />
                {f.online ? <View style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card, shadowColor: theme.primary, shadowOpacity: 0.7, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>{f.displayName}</Text>
                <Text style={{ color: f.online ? theme.primary : theme.muted, fontSize: 11, fontWeight: '600' }}>{f.online ? 'Çevrimiçi' : f.arena.name}</Text>
              </View>
              {/* Trophy on the far right */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.bg2, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: theme.border }}>
                <Ionicons name="trophy" size={13} color={theme.gold} />
                <Text style={{ color: theme.gold, fontWeight: '900', fontSize: 13 }}>{f.trophies}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Friend actions — small Clash-Royale-style popover above the tapped row */}
      <Modal visible={menuFriend !== null} transparent animationType="fade" onRequestClose={() => setMenuFriend(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setMenuFriend(null)}>
          {menuFriend ? (() => {
            const W = 226;
            const H = 168; // header + 3 rows (approx)
            const left = Math.max(8, Math.min(menuPos.x - W / 2, SCREEN_W - W - 8));
            const top = Math.max(56, menuPos.y - H - 14);
            const tailLeft = Math.min(Math.max(menuPos.x - left - 8, 18), W - 34);
            const Row = ({ color, label, onPress }: { color: string; label: string; onPress: () => void }) => (
              <Pressable onPress={onPress} style={{ paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' }}>
                <Text style={{ color, fontWeight: '800', fontSize: 14.5 }}>{label}</Text>
              </Pressable>
            );
            return (
              <View style={{ position: 'absolute', left, top, width: W }}>
                <View style={{ backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 16 }}>
                  <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center', paddingTop: 9, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: theme.border }} numberOfLines={1}>
                    {menuFriend.displayName}
                  </Text>
                  <Row color={theme.text} label="Dostluk Savaşı" onPress={() => { const id = menuFriend.userId; setMenuFriend(null); setMatchModal(id); }} />
                  <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 10 }} />
                  <Row color={theme.text} label="Profili Görüntüle" onPress={() => { const id = menuFriend.userId; setMenuFriend(null); actions.getUserProfile(id); }} />
                  <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 10 }} />
                  <Row color={theme.danger} label="Arkadaşlıktan Kaldır" onPress={() => { const f = menuFriend; setMenuFriend(null); setConfirmRemove(f); }} />
                </View>
                {/* downward tail pointing at the row */}
                <View style={{ position: 'absolute', bottom: -7, left: tailLeft, width: 15, height: 15, backgroundColor: theme.card, transform: [{ rotate: '45deg' }], borderRightWidth: 1, borderBottomWidth: 1, borderColor: theme.border }} />
              </View>
            );
          })() : null}
        </Pressable>
      </Modal>

      {/* Remove-friend confirmation */}
      <GameModal visible={confirmRemove !== null} onClose={() => setConfirmRemove(null)} title="Kaldırılsın mı?" icon="warning" danger>
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 6 }]}>
          {confirmRemove?.displayName} adlı kişiyi arkadaşlarından çıkarmak istediğine emin misin?
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Btn label="İptal" kind="danger" icon="close" onPress={() => setConfirmRemove(null)} /></View>
          <View style={{ flex: 1 }}><Btn label="Tamam" kind="blue" icon="checkmark" onPress={() => { actions.removeFriend(confirmRemove!.userId); setConfirmRemove(null); }} /></View>
        </View>
      </GameModal>

      {/* Match mode + scope selection modal */}
      <Modal visible={matchModal !== null} transparent animationType="fade" onRequestClose={() => { setMatchModal(null); setMatchStep('mode'); }}>
        <Pressable style={styles.modalBg} onPress={() => { setMatchModal(null); setMatchStep('mode'); }}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {matchStep === 'mode' ? (
              <>
                <Text style={styles.modalTitle}>Dostluk Maçı - Mod Seç</Text>
                {(['team-team', 'country-team', 'letter-team'] as GameMode[]).map((m) => {
                  const locked = m !== 'team-team' && !hasSocialPack;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.modalRow, locked && { opacity: 0.4 }]}
                      onPress={() => {
                        if (locked) {
                          setMatchModal(null);
                          setMatchStep('mode');
                          setSocialPackPopup(true);
                          return;
                        }
                        setMatchMode(m);
                        setMatchStep('scope');
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name={MODE_ICON[m]} size={18} color={locked ? theme.muted : theme.accent} />
                        <Text style={[styles.modalRowText, locked && { color: theme.muted }]}>{MODE_LABEL(m)}</Text>
                      </View>
                      {locked ? <Ionicons name="lock-closed" size={16} color={theme.muted} /> : null}
                    </Pressable>
                  );
                })}
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Pressable onPress={() => setMatchStep('mode')} hitSlop={8}>
                    <Ionicons name="arrow-back" size={20} color={theme.text} />
                  </Pressable>
                  <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>Kapsam Seç</Text>
                </View>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    actions.inviteFriendMatch(matchModal!, friends.find((f) => f.userId === matchModal)?.displayName ?? 'Arkadaş', { mode: matchMode });
                    setMatchModal(null);
                    setMatchStep('mode');
                    setMatchScope({ type: 'all' });
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="globe-outline" size={18} color={theme.primary} />
                    <Text style={styles.modalRowText}>{t('scope.all')}</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => setMatchPicker('league')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="trophy-outline" size={18} color={theme.accent} />
                    <Text style={styles.modalRowText}>{t('scope.pickLeague')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                </Pressable>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => setMatchPicker('country')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="flag-outline" size={18} color={theme.blue} />
                    <Text style={styles.modalRowText}>{t('scope.pickCountry')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* League/country picker for friend match scope */}
      <PickerModal
        picker={matchPicker}
        scopes={state.scopes}
        onClose={() => setMatchPicker(null)}
        onScope={(s) => {
          setMatchScope(s);
          setMatchPicker(null);
          actions.inviteFriendMatch(matchModal!, friends.find((f) => f.userId === matchModal)?.displayName ?? 'Arkadaş', { mode: matchMode, scope: s });
          setMatchModal(null);
          setMatchStep('mode');
        }}
        onMode={() => {}}
        onDifficulty={() => {}}
        goto={() => {}}
      />

      {/* Social pack popup */}
      <Modal visible={socialPackPopup} transparent animationType="fade" onRequestClose={() => setSocialPackPopup(false)}>
        <Pressable style={styles.modalBg} onPress={() => setSocialPackPopup(false)}>
          <Pressable style={styles.nameModalCard} onPress={() => {}}>
            <Ionicons name="lock-closed" size={32} color={theme.accent} />
            <Text style={styles.modalTitle}>Sosyal Paket Gerekli</Text>
            <Text style={[styles.muted, { marginBottom: 12 }]}>
              Ülke-Takım ve Harf-Takım modlarını dostluk maçlarında kullanmak için Sosyal Paket satın almalısın.
            </Text>
            <Btn label="Mağazaya Git" kind="accent" icon="storefront" onPress={() => { setSocialPackPopup(false); onGoToStore?.('socialPack'); }} />
            <View style={{ height: 6 }} />
            <Btn label="Vazgeç" kind="ghost" icon="close" onPress={() => setSocialPackPopup(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Outgoing invite — waiting for the friend to accept (30s) */}
      <InviteWaitingModal
        invite={state.outgoingInvite}
        onCancel={() => { if (state.outgoingInvite) actions.cancelMatchInvite(state.outgoingInvite.toId); }}
      />

      {/* Tapped a friend → their public profile */}
      <FriendProfileModal profile={state.viewProfile} onClose={actions.closeUserProfile} />
    </Screen>
  );
}

// ---- Profile ----
function StatCard({ icon, color, label, value }: { icon: IoniconName; color: string; label: string; value: number | string }) {
  return (
    <GamePanel compact accentStripe={color} style={{ flex: 1 }} bodyStyle={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
      <View style={{ shadowColor: color, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={{ color: theme.text, fontSize: 24, fontFamily: 'Poppins-Black', ...engrave('sm') }}>{value}</Text>
      <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </GamePanel>
  );
}

export function ProfileScreen({ state, actions, onOpenMatchHistory }: Props) {
  const p = state.profile;
  if (!p) return <Screen><View style={styles.center}><Text style={styles.muted}>—</Text></View></Screen>;
  const total = p.wins + p.losses;
  const winRate = total ? Math.round((p.wins / total) * 100) : 0;
  const color = arenaColor(p.arena.name);
  return (
    <Screen>
      <ScreenHeader title="Profil" icon="person" onBack={actions.closeProfile} underline={color} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', gap: 8, marginVertical: 10 }}>
          <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: theme.bg2, borderWidth: 4, borderColor: color, alignItems: 'center', justifyContent: 'center', shadowColor: color, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 12 }}>
            <Ionicons name="person" size={54} color={color} />
          </View>
          <Text style={{ color: theme.text, fontSize: 24, fontFamily: 'Poppins-ExtraBold', ...engrave('lg') }}>{p.displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.bg2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: color + '66' }}>
            <Text style={{ fontSize: 17 }}>{p.arena.icon}</Text>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{p.arena.name}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <StatCard icon="trophy" color={theme.gold} label="Kupa" value={p.trophies} />
          <StatCard icon="diamond" color="#5BC8FF" label="Elmas" value={p.diamonds} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <StatCard icon="checkmark-circle" color={theme.primary} label="Galibiyet" value={p.wins} />
          <StatCard icon="close-circle" color={theme.danger} label="Mağlubiyet" value={p.losses} />
          <StatCard icon="stats-chart" color={theme.purple} label="Kazanma" value={`%${winRate}`} />
        </View>

        <View style={{ marginTop: 16 }}>
          <Btn label={t('menu.matchHistory')} icon="time" kind="blue" onPress={() => onOpenMatchHistory?.()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

// ---- Arenas ----
const ARENA_DATA = [
  { name: 'GOAT', min: 5000, max: 99999, color: '#FF4500', icon: 'flame' as IoniconName, img: require('../assets/arenas/goat.png'), win: '+15', loss: '-35', desc: 'Efsanelerin zirvesi. Sadece en iyiler ayakta kalır.' },
  { name: 'Dünya Klasmanı', min: 3500, max: 4999, color: '#FFD700', icon: 'trophy' as IoniconName, img: require('../assets/arenas/dunya.png'), win: '+18', loss: '-30', desc: 'Dünya sahnesinde mücadele. Her hata çok ağır.' },
  { name: 'Efsaneler Arası', min: 2000, max: 3499, color: '#C0C0C0', icon: 'ribbon' as IoniconName, img: require('../assets/arenas/efsaneler.png'), win: '+20', loss: '-26', desc: 'Efsaneler burada. Kayıplar acıtıyor.' },
  { name: 'Şampiyonlar Ligi', min: 1000, max: 1999, color: '#1E90FF', icon: 'medal' as IoniconName, img: require('../assets/arenas/sampiyonlar.png'), win: '+22', loss: '-22', desc: 'Avrupa\'nın en prestijli arenası. Dengeli mücadele.' },
  { name: 'Profesyonel Lig', min: 500, max: 999, color: '#32CD32', icon: 'shield' as IoniconName, img: require('../assets/arenas/profesyonel.png'), win: '+25', loss: '-18', desc: 'Profesyonel seviye. Artık gerçek bir rakipsin.' },
  { name: 'Amatör Lig', min: 200, max: 499, color: '#FF8C00', icon: 'shield-half' as IoniconName, img: require('../assets/arenas/amator.png'), win: '+28', loss: '-14', desc: 'İlk adımları attın. Yükselmeye devam!' },
  { name: 'Mahalle Sahası', min: 0, max: 199, color: '#8B4513', icon: 'shield-outline' as IoniconName, img: require('../assets/arenas/mahalle.png'), win: '+30', loss: '-10', desc: 'Herkesin başladığı yer. Kolay tırmanış.' },
];

export function ArenasScreen({ state, actions }: Props) {
  const trophies = state.profile?.trophies ?? 0;
  const currentArenaIdx = ARENA_DATA.findIndex((a) => trophies >= a.min && trophies <= a.max);
  const scrollRef = useRef<ScrollView>(null);

  // Scroll to current arena on mount
  useEffect(() => {
    if (currentArenaIdx >= 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, (ARENA_DATA.length - 1 - currentArenaIdx) * 160 - 200), animated: true });
      }, 300);
    }
  }, [currentArenaIdx]);

  // Progress within current arena (0..1)
  const currentArena = ARENA_DATA[currentArenaIdx] ?? ARENA_DATA[ARENA_DATA.length - 1]!;
  const range = currentArena.max - currentArena.min;
  const progress = range > 0 ? Math.min(1, (trophies - currentArena.min) / range) : 1;

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
        title="Arenalar"
        onBack={actions.closeArenas}
        underline={theme.accent}
        right={(
          <View style={{ minWidth: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingLeft: 4 }}>
            <Ionicons name="trophy" size={15} color={theme.accent} />
            <Text numberOfLines={1} style={{ color: theme.gold, fontWeight: '900', fontSize: 14, ...engrave('sm') }}>{trophies}</Text>
          </View>
        )}
      />

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Arenas listed top-to-bottom (highest first) */}
        {ARENA_DATA.map((arena, idx) => {
          const isCurrent = idx === currentArenaIdx;
          const isLocked = trophies < arena.min;
          const isPassed = trophies > arena.max;

          return (
            <View key={arena.name}>
              {/* Connector line (not on first item) */}
              {idx > 0 ? (
                <View style={{ alignItems: 'center', height: 24 }}>
                  <View style={{ width: 3, flex: 1, backgroundColor: isPassed || isCurrent ? theme.primary : theme.border }} />
                </View>
              ) : null}

              <View style={[
                styles.arenaCard,
                { borderColor: isCurrent ? arena.color : isLocked ? theme.border : theme.primary, opacity: isLocked ? 0.5 : 1 },
                isCurrent && { borderWidth: 2, shadowColor: arena.color, shadowOpacity: 0.3, shadowRadius: 8 },
              ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[styles.arenaIconBox, isLocked && { opacity: 0.55 }]}>
                    <Image source={arena.img} resizeMode="contain" style={{ width: '100%', height: '100%', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 3 } }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.arenaName, { color: isCurrent ? arena.color : isLocked ? theme.muted : theme.text }]}>
                      {arena.name}
                    </Text>
                    <Text style={styles.arenaTrophyRange}>
                      {arena.min} - {arena.max === 99999 ? '∞' : arena.max} 🏆
                    </Text>
                    <Text style={[styles.muted, { fontSize: 11, marginTop: 2 }]}>{arena.desc}</Text>
                  </View>
                </View>


                {/* Progress bar for current arena */}
                {isCurrent ? (
                  <View style={styles.arenaProgressOuter}>
                    <View style={[styles.arenaProgressInner, { width: `${progress * 100}%`, backgroundColor: arena.color }]} />
                    <Text style={styles.arenaProgressText}>{trophies} / {arena.max === 99999 ? '∞' : arena.max}</Text>
                  </View>
                ) : null}

                {/* Status badge */}
                {isCurrent ? (
                  <View style={[styles.arenaBadge, { backgroundColor: arena.color }]}>
                    <Text style={styles.arenaBadgeText}>BURADASIN</Text>
                  </View>
                ) : isPassed ? (
                  <View style={[styles.arenaBadge, { backgroundColor: theme.primary }]}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                ) : isLocked ? (
                  <View style={[styles.arenaBadge, { backgroundColor: theme.border }]}>
                    <Ionicons name="lock-closed" size={12} color={theme.muted} />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
      </Animated.View>
    </Screen>
  );
}

// ---- Searching ----
const FUN_FACTS = [
  { icon: '🇧🇷', text: 'Pele, kariyeri boyunca 1.281 gol attı ve bu rekor hâlâ tartışılıyor.' },
  { icon: '🏟️', text: "Camp Nou, Avrupa'nın en büyük stadyumu olarak 99.354 kişi kapasitesine sahiptir." },
  { icon: '🇦🇷', text: "Messi, tek bir takvim yılında 91 gol atarak Gerd Müller'in rekorunu kırdı (2012)." },
  { icon: '🇹🇷', text: "Galatasaray, 2000 yılında UEFA Kupası'nı kazanan ilk Türk takımı oldu." },
  { icon: '🏆', text: "Real Madrid, 15 Şampiyonlar Ligi kupasıyla en çok kazanan takımdır." },
  { icon: '🇮🇹', text: "Paolo Maldini, 25 yıl boyunca yalnızca AC Milan forması giydi." },
  { icon: '⚽', text: "İlk FIFA Dünya Kupası 1930'da Uruguay'da düzenlendi ve ev sahibi Uruguay şampiyon oldu." },
  { icon: '🇫🇷', text: "Zinedine Zidane, 2006 Dünya Kupası finalinde kafa attığı anla tarihe geçti." },
  { icon: '🇩🇪', text: "Bundesliga'da ayakta seyirci bölümleri sayesinde bilet fiyatları Avrupa'nın en düşüğüdür." },
  { icon: '🇳🇱', text: "Johan Cruyff, 'toplam futbol' felsefesinin mimarı olarak kabul edilir." },
  { icon: '🇵🇹', text: "Cristiano Ronaldo, uluslararası arenada en çok gol atan futbolcudur." },
  { icon: '🇪🇸', text: "Barcelona, 2008-2012 arasında tiki-taka stiliyle futbol tarihini değiştirdi." },
  { icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', text: "Premier Lig, dünyanın en çok izlenen futbol ligidir; 212 ülkede yayınlanır." },
  { icon: '🇭🇷', text: "Luka Modric, 2018'de Ballon d'Or'u kazanarak Messi-Ronaldo hegemonyasını kırdı." },
  { icon: '🇹🇷', text: "Hakan Şükür, 2002 Dünya Kupası'nda tarihin en erken golünü 11. saniyede attı." },
  { icon: '🧤', text: "Gianluigi Buffon, 40 yaşını geçtikten sonra bile üst düzey kaleciliğe devam etti." },
  { icon: '🇲🇽', text: "Azteca Stadyumu, iki Dünya Kupası finaline ev sahipliği yapan tek stadyumdur." },
  { icon: '🇪🇬', text: "Mohamed Salah, Premier Lig'de tek sezonda 32 gol atarak rekoru kırdı (2017-18)." },
  { icon: '🏅', text: "Alex Ferguson, Manchester United'da 26 yıl teknik direktörlük yaptı ve 38 kupa kazandı." },
  { icon: '🇯🇵', text: "Japonya, 2002'de Güney Kore ile birlikte Dünya Kupası'na ev sahipliği yapan ilk Asya ülkesiydi." },
];

export function SearchingScreen({ actions }: Props) {
  const [factIdx, setFactIdx] = useState(Math.floor(Math.random() * FUN_FACTS.length));

  useEffect(() => {
    const id = setInterval(() => {
      setFactIdx((prev) => (prev + 1) % FUN_FACTS.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  const fact = FUN_FACTS[factIdx]!;

  return (
    <Screen>
      <View style={styles.center}>
        <Ionicons name="flash" size={44} color={theme.primary} />
        <Text style={styles.h1}>Rakip Aranıyor</Text>
        <View style={{ height: 20 }} />
        <ActivityIndicator size="large" color={theme.primary} />
        <View style={{ height: 12 }} />
        <Text style={styles.muted}>{t('searching.title')}</Text>
      </View>

      <View style={styles.factCard}>
        <Ionicons name="bulb" size={26} color={theme.accent} />
        <Text style={styles.factText}>{fact.text}</Text>
      </View>

      <Btn label={t('searching.cancel')} kind="ghost" icon="close" onPress={actions.cancelSearch} />
    </Screen>
  );
}

// ---- Leaderboard ----
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze

// ---- Match History ----

function arenaForTrophies(trophies: number): { name: string; icon: IoniconName; color: string } {
  if (trophies >= 5000) return { name: 'GOAT', icon: 'flame', color: '#FF4500' };
  if (trophies >= 3500) return { name: 'Dünya Klasmanı', icon: 'trophy', color: '#FFD700' };
  if (trophies >= 2000) return { name: 'Efsaneler Arası', icon: 'ribbon', color: '#C0C0C0' };
  if (trophies >= 1000) return { name: 'Şampiyonlar Ligi', icon: 'medal', color: '#1E90FF' };
  if (trophies >= 500) return { name: 'Profesyonel Lig', icon: 'medal-outline', color: '#32CD32' };
  if (trophies >= 200) return { name: 'Amatör Lig', icon: 'football', color: '#FF8C00' };
  return { name: 'Mahalle Sahası', icon: 'football-outline', color: '#8B4513' };
}

function ClubLogo({ uri, name, size = 22 }: { uri: string | null; name?: string; size?: number }) {
  if (!uri) return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: name ? badgeColor(name) : theme.border, alignItems: 'center', justifyContent: 'center' }}>
      {name ? <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.45 }}>{initial(name)}</Text> : null}
    </View>
  );
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

function PlayerPhoto({ uri, size = 32 }: { uri: string | null; size?: number }) {
  if (!uri) return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.border, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="person" size={size * 0.5} color={theme.muted} />
    </View>
  );
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

export function MatchHistoryScreen({ state, actions }: Props) {
  const history = state.matchHistory;
  const myName = state.profile?.displayName ?? '';

  return (
    <Screen>
      <ScreenHeader title={t('matchHistory.title')} icon="time" onBack={actions.closeMatchHistory} underline={theme.primary} />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {history.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="time-outline" size={48} color={theme.border} />
            <Text style={styles.muted}>{t('matchHistory.empty')}</Text>
          </View>
        ) : (
          history.map((m) => {
            const myRounds = m.rounds.filter((r) => r.answeredBy === myName);
            const oppRounds = m.rounds.filter((r) => r.answeredBy !== myName);
            const pArena = arenaForTrophies(m.playerTrophies);
            const oArena = arenaForTrophies(m.opponentTrophies);
            const borderColor = m.won ? theme.primary : theme.danger;
            const date = new Date(m.playedAt);
            const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

            return (
              <View key={m.id} style={{
                backgroundColor: theme.card, borderRadius: 16, borderWidth: 1.5,
                borderColor, marginBottom: 14, overflow: 'hidden',
              }}>
                {/* ── Top bar: result badge + score + mode + date ── */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 14, paddingVertical: 8,
                  backgroundColor: m.won ? 'rgba(61,220,132,0.08)' : 'rgba(255,90,95,0.08)',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={m.won ? 'trophy' : 'close-circle'} size={16} color={m.won ? theme.accent : theme.danger} />
                    <Text style={{ color: m.won ? theme.primary : theme.danger, fontWeight: '900', fontSize: 12 }}>
                      {m.won ? t('matchHistory.won') : t('matchHistory.lost')}
                    </Text>
                  </View>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: '900', letterSpacing: 3 }}>
                    {m.playerScore} - {m.opponentScore}
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: theme.muted, fontSize: 9 }}>{MODE_LABEL((m.gameMode as GameMode) ?? 'team-team')}</Text>
                    <Text style={{ color: theme.muted, fontSize: 9 }}>{dateStr}</Text>
                  </View>
                </View>

                {/* ── Players head-to-head ── */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
                  {/* My side */}
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ color: theme.text, fontWeight: '900', fontSize: 16 }} numberOfLines={1}>{m.playerName || myName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name={pArena.icon} size={12} color={pArena.color} />
                      <Text style={{ color: pArena.color, fontSize: 10, fontWeight: '700' }}>{m.playerTrophies}</Text>
                    </View>
                    <Text style={{ color: theme.muted, fontSize: 9, marginTop: 1 }}>{pArena.name}</Text>
                  </View>

                  {/* VS */}
                  <View style={{ justifyContent: 'center', paddingHorizontal: 8 }}>
                    <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '900' }}>VS</Text>
                  </View>

                  {/* Opponent side */}
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ color: theme.text, fontWeight: '900', fontSize: 16 }} numberOfLines={1}>{m.opponentName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name={oArena.icon} size={12} color={oArena.color} />
                      <Text style={{ color: oArena.color, fontSize: 10, fontWeight: '700' }}>{m.opponentTrophies}</Text>
                    </View>
                    <Text style={{ color: theme.muted, fontSize: 9, marginTop: 1 }}>{oArena.name}</Text>
                  </View>
                </View>

                {/* ── Rounds detail ── */}
                <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 12, gap: 6 }}>
                  {/* My rounds */}
                  <View style={{ flex: 1 }}>
                    {myRounds.length > 0 ? myRounds.map((r, i) => {
                      const rMode = r.mode ?? m.gameMode ?? 'team-team';
                      return (
                        <View key={i} style={{
                          backgroundColor: theme.bg, borderRadius: 10, padding: 8, marginBottom: 4,
                          borderLeftWidth: 3, borderLeftColor: theme.primary,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            {rMode === 'country-team' && r.country ? (
                              <Text style={{ fontSize: 16 }}>{NATIONALITIES.find((n) => n.value === r.country)?.flag ?? '🏳️'}</Text>
                            ) : rMode === 'letter-team' && r.letter ? (
                              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#06131F', fontSize: 11, fontWeight: '900' }}>{r.letter}</Text>
                              </View>
                            ) : (
                              <ClubLogo uri={r.teamALogo} size={18} name={r.teamA} />
                            )}
                            <Text style={{ color: theme.muted, fontSize: 8, fontWeight: '600' }}>+</Text>
                            <ClubLogo uri={r.teamBLogo} size={18} name={r.teamB} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <PlayerPhoto uri={r.playerImageUrl} size={24} />
                            <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 11, flex: 1 }} numberOfLines={1}>{r.player}</Text>
                          </View>
                        </View>
                      );
                    }) : <Text style={{ color: theme.muted, fontSize: 10, textAlign: 'center', marginTop: 8 }}>—</Text>}
                  </View>

                  {/* Divider */}
                  <View style={{ width: 1, backgroundColor: theme.border, marginVertical: 4 }} />

                  {/* Opponent rounds */}
                  <View style={{ flex: 1 }}>
                    {oppRounds.length > 0 ? oppRounds.map((r, i) => {
                      const rMode = r.mode ?? m.gameMode ?? 'team-team';
                      return (
                        <View key={i} style={{
                          backgroundColor: theme.bg, borderRadius: 10, padding: 8, marginBottom: 4,
                          borderLeftWidth: 3, borderLeftColor: theme.danger,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            {rMode === 'country-team' && r.country ? (
                              <Text style={{ fontSize: 16 }}>{NATIONALITIES.find((n) => n.value === r.country)?.flag ?? '🏳️'}</Text>
                            ) : rMode === 'letter-team' && r.letter ? (
                              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#06131F', fontSize: 11, fontWeight: '900' }}>{r.letter}</Text>
                              </View>
                            ) : (
                              <ClubLogo uri={r.teamALogo} size={18} name={r.teamA} />
                            )}
                            <Text style={{ color: theme.muted, fontSize: 8, fontWeight: '600' }}>+</Text>
                            <ClubLogo uri={r.teamBLogo} size={18} name={r.teamB} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <PlayerPhoto uri={r.playerImageUrl} size={24} />
                            <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 11, flex: 1 }} numberOfLines={1}>{r.player}</Text>
                          </View>
                        </View>
                      );
                    }) : <Text style={{ color: theme.muted, fontSize: 10, textAlign: 'center', marginTop: 8 }}>—</Text>}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

// ---- Leaderboard ----
export function LeaderboardScreen({ state, actions }: Props) {
  const lb = state.leaderboard;
  return (
    <Screen>
      <ScreenHeader title="Lider Tablosu" icon="trophy" onBack={actions.closeLeaderboard} underline={theme.accent} />
      <ScrollView style={{ flex: 1, marginTop: 10 }} showsVerticalScrollIndicator={false}>
        {lb.map((entry) => (
          <View key={entry.rank} style={{ marginBottom: 8 }}>
            <GamePanel compact accentStripe={entry.rank <= 3 ? RANK_COLORS[entry.rank - 1] : undefined} bodyStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12 }}>
              <RankBadge rank={entry.rank} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lbName} numberOfLines={1}>{entry.displayName}</Text>
                <Text style={styles.lbArena}>{entry.arena.name}</Text>
              </View>
              <View style={styles.lbTrophyBox}>
                <Ionicons name="trophy" size={12} color={theme.accent} />
                <Text style={styles.lbTrophies}>{entry.trophies}</Text>
              </View>
              <Text style={styles.lbWL}>{entry.wins}G {entry.losses}M</Text>
            </GamePanel>
          </View>
        ))}
        {lb.length === 0 ? <Text style={styles.muted}>{t('leaderboard.empty')}</Text> : null}
      </ScrollView>
      <View style={{ height: 10 }} />
      <Btn label={t('common.back')} kind="ghost" icon="arrow-back" onPress={actions.closeLeaderboard} />
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

  return (
    <Btn
      label={secs !== null ? t('ready.labelSecs', { secs }) : t('ready.label')}
      kind="primary"
      icon="checkmark"
      onPress={onPress}
    />
  );
}

// Falling confetti for the victory screen (pure RN Animated, no deps).
function Confetti() {
  const COLORS = [theme.primary, theme.accent, theme.blue, theme.purple, theme.danger, theme.gold];
  const pieces = useRef(
    Array.from({ length: 32 }, (_, i) => ({
      x: (i * 53) % 100,
      delay: (i * 71) % 900,
      color: COLORS[i % COLORS.length]!,
      v: new Animated.Value(0),
    })),
  ).current;
  useEffect(() => {
    pieces.forEach((p) =>
      Animated.loop(
        Animated.timing(p.v, { toValue: 1, duration: 2400, delay: p.delay, easing: Easing.linear, useNativeDriver: true }),
      ).start(),
    );
  }, [pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const ty = p.v.interpolate({ inputRange: [0, 1], outputRange: [-30, 820] });
        const rot = p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });
        const op = p.v.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{ position: 'absolute', left: `${p.x}%`, top: 0, width: 8, height: 13, borderRadius: 2, backgroundColor: p.color, opacity: op, transform: [{ translateY: ty }, { rotate: rot }] }}
          />
        );
      })}
    </View>
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
      return { icon: 'information-circle-outline' as IoniconName, color: theme.accent, headline: t('result.roundSkipped') };
    if (r.reason === 'passed')
      return { icon: 'play-skip-forward' as IoniconName, color: theme.accent, headline: t('result.roundSkipped') };
    if (r.reason === 'timeout')
      return { icon: 'time' as IoniconName, color: theme.muted, headline: t('result.timeUp') };
    return r.correct
      ? { icon: 'checkmark-circle' as IoniconName, color: theme.primary, headline: t('result.correct') }
      : { icon: 'close-circle' as IoniconName, color: theme.danger, headline: t('result.wrong') };
  }, [r]);

  const playedA = r.spellsA.length > 0;
  const playedB = r.spellsB.length > 0;

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* Match-over banner (the round detail below still shows the deciding answer) */}
        {matchOver ? (
          <View style={styles.matchBanner}>
            <Ionicons name={youWon ? 'trophy' : 'sad-outline'} size={40} color={youWon ? theme.accent : theme.muted} />
            <Text style={[styles.h1, { color: youWon ? theme.accent : theme.text, marginTop: 2 }]}>
              {youWon ? t('result.youWon') : t('result.youLost')}
            </Text>
            <Text style={styles.matchScore}>
              {(you?.score ?? 0)} - {(opp?.score ?? 0)}
            </Text>
            {!youWon && state.matchWinnerName ? (
              <Text style={styles.muted}>{t('result.winnerTook', { name: state.matchWinnerName })}</Text>
            ) : null}
            {state.trophyDelta ? (
              <View style={styles.trophyDeltaRow}>
                <Ionicons name="trophy" size={14} color={theme.accent} />
                <Text style={[styles.trophyDeltaText, { color: state.trophyDelta.delta >= 0 ? theme.primary : theme.danger }]}>
                  {state.trophyDelta.delta >= 0 ? '+' : ''}{state.trophyDelta.delta} → {state.trophyDelta.trophies}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Round verdict — always shown, so even on the deciding round you see who/what the answer was */}
        <View style={styles.center}>
          <Ionicons name={icon} size={matchOver ? 44 : 64} color={color} />
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
          {r.matchedPlayerImageUrl ? (
            <Image source={{ uri: r.matchedPlayerImageUrl }} style={styles.playerPhoto} />
          ) : null}
          {r.matchedPlayerName ? <Text style={styles.matched}>{r.matchedPlayerName}</Text> : null}
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
        </View>

        {/* Per-round detail (also shown on a passed round so both players see who the
            common player(s) were — the two team cards + "who played for both"). */}
        {r.reason !== 'no_common' && r.reason !== 'same_team' ? (
          <>
            <View style={styles.teamResultRow}>
              {state.revealMode === 'country-team' ? (
                /* Country card: flag + name + checkmark only */
                <View style={[styles.teamResult, { borderColor: theme.primary }]}>
                  <Text style={{ fontSize: 36 }}>{NATIONALITIES.find((n) => n.value === state.revealCountry)?.flag ?? '🏳️'}</Text>
                  <Text style={styles.teamResultName} numberOfLines={2}>
                    {NATIONALITIES.find((n) => n.value === state.revealCountry)?.displayName ?? r.teamA.name}
                  </Text>
                  <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                </View>
              ) : state.revealMode === 'letter-team' ? null : (
                <TeamResultCard team={r.teamA} spells={r.spellsA} played={playedA} />
              )}
              <TeamResultCard team={r.teamB} spells={r.spellsB} played={playedB} />
            </View>

            {r.allClubs.length ? (
              <>
                <Text style={styles.sectionLabel}>{t('result.career')}</Text>
                {r.allClubs.map((s, i) => (
                  <CareerRow
                    key={`${s.clubId}-${i}`}
                    spell={s}
                    highlight={s.clubId === r.teamA.id || s.clubId === r.teamB.id}
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
              const renderList = (list: typeof r.commonPlayers) => list.map((cp, i) => (
                <View key={i} style={styles.commonRow}>
                  {cp.imageUrl ? (
                    <Image source={{ uri: cp.imageUrl }} style={styles.commonPhoto} resizeMode="cover" />
                  ) : (
                    <View style={[styles.commonPhoto, { backgroundColor: badgeColor(cp.name), alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{initial(cp.name)}</Text>
                    </View>
                  )}
                  <Text style={styles.commonName}>{cp.name}</Text>
                </View>
              ));
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

        <View style={styles.scoreRow}>
          {room.players.map((p) => (
            <View key={p.id} style={styles.scoreChip}>
              <Ionicons name={p.name === 'Bot' ? 'game-controller' : 'person'} size={14} color={theme.muted} />
              <Text style={styles.scoreText}>
                {p.name} {p.score}/{state.winTarget}
              </Text>
            </View>
          ))}
        </View>

        {matchOver ? (
          <>
            {/* Match result banner */}
            <View style={[styles.matchBanner, { borderColor: youWon ? theme.accent : theme.muted }]}>
              <Ionicons name={youWon ? 'trophy' : 'sad-outline'} size={32} color={youWon ? theme.accent : theme.muted} />
              <Text style={[styles.h1, { color: youWon ? theme.accent : theme.text }]}>
                {youWon ? t('result.youWon') : t('result.youLost')}
              </Text>
              <Text style={styles.matchScore}>
                {(you?.score ?? 0)} - {(opp?.score ?? 0)}
              </Text>
            </View>

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
                <ActivityIndicator color={theme.primary} />
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
            <ActivityIndicator color={theme.primary} />
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
  logo: { color: theme.primary, fontSize: 28, fontFamily: 'Poppins-Black', textAlign: 'center', letterSpacing: 2, paddingRight: 4, marginTop: 6 },
  tagline: { color: theme.muted, textAlign: 'center', marginBottom: 20, marginTop: 4, fontSize: 12, fontFamily: 'Poppins-SemiBold' },
  h1: { color: theme.text, fontSize: 18, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginVertical: 6, letterSpacing: 0.5, ...engrave('lg') },
  label: { color: theme.muted, fontSize: 10, letterSpacing: 2, textAlign: 'center' },
  sectionLabel: { color: theme.muted, fontSize: 10, letterSpacing: 2, marginTop: 12, marginBottom: 4, fontFamily: 'Poppins-ExtraBold' },
  code: { color: theme.accent, fontSize: 32, fontFamily: 'Poppins-Black', textAlign: 'center', letterSpacing: 4 },
  big: { color: theme.text, fontSize: 64, fontFamily: 'Poppins-Black' },
  muted: { color: theme.muted, textAlign: 'center', fontSize: 12 },
  error: { color: theme.danger, textAlign: 'center', marginTop: 10, fontSize: 12 },
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginVertical: 8,
  },
  searchInput: { flex: 1, color: theme.text, paddingVertical: 12, fontSize: 14 },
  btn: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    borderColor: theme.border,
  },
  btnText: { fontSize: 14, fontWeight: '800' },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 16, alignSelf: 'stretch' },
  lobbyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginVertical: 5 },
  lobbyName: { color: theme.text, fontSize: 14 },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
  },
  clubText: { color: theme.text, fontSize: 13, flex: 1 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  teamCard: { flex: 1, backgroundColor: theme.card, borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, borderWidth: 2, borderColor: theme.border, borderTopColor: theme.panelTopGloss, borderBottomWidth: 4, borderBottomColor: theme.cardLip, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 5 }, elevation: 7 },
  teamName: { color: theme.text, fontSize: 13.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') },
  plus: { color: theme.accent, fontSize: 22, fontWeight: '900' },
  timer: { color: theme.accent, fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  passHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.accent + '1F', borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.accent + '55' },
  passHintText: { color: theme.accent, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  playerPhoto: { width: 104, height: 104, borderRadius: 52, marginTop: 10, borderWidth: 3, borderColor: theme.primary, backgroundColor: theme.card },
  matched: { color: theme.text, fontSize: 19, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', marginTop: 4 },
  matchScore: { color: theme.text, fontSize: 46, fontFamily: 'Poppins-Black', letterSpacing: 3, marginTop: 6, ...engrave('lg') },
  matchBanner: { alignItems: 'center', gap: 2, backgroundColor: theme.card, borderRadius: 20, borderWidth: 2, borderColor: theme.frameGold, borderBottomWidth: 4, borderBottomColor: theme.frameGoldDark, paddingVertical: 18, paddingHorizontal: 14, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  trophyDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  trophyDeltaText: { fontSize: 14, fontWeight: '800' },
  fixRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fixText: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  teamResultRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  teamResult: { flex: 1, backgroundColor: theme.card, borderRadius: 16, borderWidth: 2, borderBottomWidth: 4, borderBottomColor: theme.cardLip, padding: 12, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  teamResultName: { color: theme.text, fontSize: 12.5, fontFamily: 'Poppins-ExtraBold', textAlign: 'center', ...engrave('sm') },
  teamResultYears: { color: theme.muted, fontSize: 10, textAlign: 'center' },
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
  careerRowHi: { backgroundColor: 'rgba(61,220,132,0.10)', borderRadius: 8 },
  careerClub: { color: theme.text, fontSize: 12, flex: 1 },
  careerYears: { color: theme.muted, fontSize: 11 },
  nameModalCard: { width: '100%' as const, maxWidth: 360, backgroundColor: theme.card, borderRadius: 26, padding: 24, alignItems: 'center' as const, gap: 10, borderWidth: 2, borderColor: theme.frameGold, borderBottomWidth: 4, borderBottomColor: theme.frameGoldDark, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 20 },
  nameModalCost: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginVertical: 6 },
  storeBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.card, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginTop: 6, borderWidth: 1, borderColor: theme.border },
  storeBalanceText: { color: '#C084FC', fontSize: 18, fontWeight: '800' },
  storeAdCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 14, padding: 14, marginVertical: 5, borderWidth: 2, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  storeAdTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
  storeAdReward: { color: '#C084FC', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  storeCooldown: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.bg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginVertical: 4 },
  storeCooldownText: { color: theme.accent, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  storePackCard: { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginVertical: 5, borderWidth: 2, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip, position: 'relative' as const, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  storePackBest: { borderColor: '#A855F7', borderWidth: 2 },
  storePackBadge: { position: 'absolute' as const, top: -10, right: 12, backgroundColor: '#A855F7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  storePackBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  storePackIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  storePackAmount: { color: theme.text, fontSize: 16, fontWeight: '800' },
  storePackPriceBox: { backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  storePackPrice: { color: '#06131F', fontSize: 14, fontWeight: '800' },
  friendAddCard: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: theme.card, borderRadius: 14, padding: 14, marginVertical: 5, borderWidth: 2, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip },
  friendDivider: { width: 1, height: 40, backgroundColor: theme.border, marginHorizontal: 10 },
  friendLabel: { color: theme.muted, fontSize: 10, fontWeight: '600', marginBottom: 4 },
  friendCode: { color: theme.accent, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  friendInput: { color: theme.text, fontSize: 14, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 4 },
  friendEmpty: { alignItems: 'center' as const, gap: 8, paddingVertical: 30 },
  arenaCard: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 2, borderColor: theme.border, borderBottomWidth: 3, borderBottomColor: theme.cardLip, padding: 14, position: 'relative', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  arenaIconBox: { width: 66, height: 60, alignItems: 'center', justifyContent: 'center' },
  arenaName: { color: theme.text, fontSize: 16, fontWeight: '900' },
  arenaTrophyRange: { color: theme.muted, fontSize: 12, marginTop: 2 },
  arenaStats: { flexDirection: 'row', gap: 16, marginTop: 8 },
  arenaStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arenaProgressOuter: { height: 8, backgroundColor: theme.border, borderRadius: 4, marginTop: 10, overflow: 'hidden', position: 'relative' },
  arenaProgressInner: { height: '100%', borderRadius: 4 },
  arenaProgressText: { position: 'absolute', right: 0, top: -16, color: theme.muted, fontSize: 10, fontWeight: '600' },
  arenaBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  arenaBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pickTimerBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.card, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginTop: 6, borderWidth: 1, borderColor: theme.border },
  pickTimerText: { color: theme.accent, fontSize: 22, fontWeight: '900' },
  factCard: { backgroundColor: theme.card, borderRadius: 12, padding: 16, marginVertical: 24, borderWidth: 1, borderColor: theme.border, alignItems: 'center', gap: 10 },
  factIcon: { fontSize: 28 },
  factText: { color: theme.text, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.card, borderRadius: 10, padding: 10, marginVertical: 3, borderWidth: 1, borderColor: theme.border },
  lbRank: { color: theme.muted, fontSize: 15, fontWeight: '900', width: 24, textAlign: 'center' },
  lbName: { color: theme.text, fontSize: 13, fontWeight: '700' },
  lbArena: { color: theme.accent, fontSize: 10 },
  lbTrophyBox: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lbTrophies: { color: theme.accent, fontSize: 13, fontWeight: '800' },
  lbWL: { color: theme.muted, fontSize: 10, width: 40, textAlign: 'right' },
  profileCard: { backgroundColor: theme.card, borderRadius: 12, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: theme.border },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileName: { color: theme.text, fontSize: 15, fontWeight: '800' },
  profileArena: { color: theme.accent, fontSize: 11, fontWeight: '600' },
  profileStat: { alignItems: 'center', gap: 2 },
  profileStatIcon: { fontSize: 14 },
  profileStatVal: { color: theme.text, fontSize: 13, fontWeight: '700' },
  profileWL: { alignItems: 'flex-end', marginTop: 4 },
  commonList: { alignSelf: 'stretch', marginTop: 4 },
  commonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.border },
  commonPhoto: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
  commonName: { color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 14 },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.card,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  scoreText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  optRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  optChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optChipText: { color: theme.text, fontSize: 12, fontWeight: '600', flex: 1 },
  modalBg: { flex: 1, backgroundColor: theme.scrim, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22 },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.card,
    borderRadius: 26,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.frameGold, // gold game frame
    borderBottomWidth: 4,
    borderBottomColor: theme.frameGoldDark,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  modalSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  modalSearchInput: { flex: 1, color: theme.text, paddingVertical: 10, fontSize: 13 },
  modalTitle: { color: theme.text, fontSize: 17, fontFamily: 'Poppins-ExtraBold', letterSpacing: 0.5, marginBottom: 8, textShadowColor: theme.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalRowText: { color: theme.text, fontSize: 13 },
  modalCount: { color: theme.muted, fontSize: 11 },
  // emotes
  emoteTop: { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  emoteBottom: { position: 'absolute', bottom: 90, left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  emoteFab: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  emoteFabBottom: { right: 18, bottom: 28 },
  emoteFabTop: { right: 18, top: 8 },
  emoteSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  emoteSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  emoteSheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, marginBottom: 12 },
  emoteSheetTitle: { color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  emoteGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  emoteCell: {
    width: '30%',
    alignItems: 'center',
    backgroundColor: theme.bg,
    borderRadius: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  emoteCellLabel: { color: theme.text, fontSize: 11, fontWeight: '600', marginTop: 2 },
  emoteHint: { color: theme.muted, fontSize: 11, textAlign: 'center', marginTop: 14 },
  // store emotes
  storeEmoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  storeEmoteName: { color: theme.text, fontSize: 14, fontWeight: '800' },
  storeEmoteDesc: { color: theme.muted, fontSize: 11, marginTop: 2 },
  storeEmoteBuy: { backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  storeEmoteBuyText: { color: '#06131F', fontSize: 13, fontWeight: '800' },
  storeEmoteOwned: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  storeEmoteOwnedText: { color: theme.primary, fontSize: 12, fontWeight: '700' },
});
