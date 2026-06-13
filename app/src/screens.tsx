import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { Animated, Easing, Platform, Dimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { theme } from './theme';
import { t } from './i18n';
import { GOOGLE_IOS_CLIENT_ID } from './config';

WebBrowser.maybeCompleteAuthSession();
import type { GameState } from './useCrossover';
import type { ClubRef, Difficulty, GameMode, GameOptions, ProfileView, Scope, SpellInfo } from './protocol';
import {
  EmoteCallout,
  EmoteSticker,
  PREMIUM_EMOTES,
  availableEmotes,
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
  ready: () => void;
  playAgain: () => void;
  acceptRematch: () => void;
  declineRematch: () => void;
  sendEmote: (emoteId: string) => void;
  buyEmote: (emoteId: string) => void;
  loadFriends: () => void;
  sendFriendRequest: (targetCode?: string, targetUsername?: string) => void;
  respondFriendRequest: (requestId: string, accept: boolean) => void;
  removeFriend: (friendId: string) => void;
  searchUsers: (query: string) => void;
  inviteFriendMatch: (friendId: string, options?: GameOptions) => void;
  dismissMatchInvite: () => void;
  leave: () => void;
};

interface Props {
  state: GameState;
  actions: Actions;
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Map a trophy arena to a vector icon (emojis don't render on every device).
function arenaIcon(arena: { minTrophies: number }): IoniconName {
  const t = arena.minTrophies;
  if (t >= 5000) return 'flame';
  if (t >= 3500) return 'trophy';
  if (t >= 2000) return 'ribbon';
  if (t >= 1000) return 'medal';
  if (t >= 500) return 'medal-outline';
  if (t >= 200) return 'football';
  return 'football-outline';
}

// ---- shared primitives ----
// Chunky, game-style (Clash Royale-ish) button: a darker bottom "lip" gives 3D
// depth, and pressing translates the face down into the lip for a tactile click.
const BTN_PALETTE: Record<string, [string, string]> = {
  primary: [theme.primary, theme.primaryDark],
  accent: [theme.accent, theme.accentDark],
  blue: [theme.blue, theme.blueDark],
  danger: [theme.danger, theme.dangerDark],
  ghost: ['transparent', theme.border],
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
  const [bg, lip] = BTN_PALETTE[kind] ?? BTN_PALETTE.primary!;
  const ghost = kind === 'ghost';
  const fg = ghost ? theme.text : '#06131F';
  const depth = ghost ? 0 : 5;
  const ty = press.interpolate({ inputRange: [0, 1], outputRange: [0, depth] });
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => Animated.timing(press, { toValue: 1, duration: 60, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 0, duration: 110, useNativeDriver: true }).start()}
      onPress={disabled ? undefined : onPress}
      style={{ opacity: disabled ? 0.45 : 1, marginVertical: 6 }}
    >
      <View style={{ backgroundColor: ghost ? 'transparent' : lip, borderRadius: 16, paddingBottom: depth }}>
        <Animated.View
          style={{
            transform: [{ translateY: ty }],
            backgroundColor: bg,
            borderRadius: 16,
            paddingVertical: big ? 18 : 14,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: ghost ? 2 : 0,
            borderColor: theme.border,
          }}
        >
          {icon ? <Ionicons name={icon} size={big ? 24 : 20} color={fg} style={{ marginRight: 9 }} /> : null}
          <Text style={{ color: fg, fontSize: big ? 18 : 15, fontWeight: '900', letterSpacing: 0.5 }}>{label}</Text>
        </Animated.View>
      </View>
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

function Screen({ children }: { children: ReactNode }) {
  // Keyboard-aware by default so inputs/buttons never get covered by the keyboard.
  // behavior 'padding' lifts content above the keyboard; the 44px offset matches
  // the app root's top padding so the avoided height is computed correctly.
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

// ---- Swipeable intro / onboarding (shown on first launch) ----
const SCREEN_W = Dimensions.get('window').width;

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

// ---- Interactive first-time tutorial (101 Plus-style guided simulation) ----
const TUT_TEAMS = ['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor', 'Real Madrid', 'Barcelona'];

export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const bubble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    bubble.setValue(0);
    Animated.spring(bubble, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }).start();
  }, [step]);
  const next = () => setStep((s) => s + 1);

  const TEXTS: { text: string; cta?: string }[] = [
    { text: "Crossover'a hoş geldin! 👋 Sana 30 saniyede nasıl oynanacağını göstereyim.", cta: 'DEVAM' },
    { text: 'Önce bir takım seçersin. Hadi, parlayan Galatasaray\'a dokun 👆' },
    { text: 'Rakibin de takımını seçti: Real Madrid. Şimdi iki takımda da oynamış bir futbolcu bulmalısın.', cta: 'DEVAM' },
    { text: 'İpucu: Hollandalı yıldız Wesley Sneijder hem Real Madrid hem Galatasaray\'da oynadı. Onu yazardın!', cta: 'DEVAM' },
    { text: 'Doğru! 🎉 Rakipten önce bilen turu kazanır. İlk 3 turu kazanan maçı ve kupayı alır.', cta: 'DEVAM' },
    { text: 'Harika, artık hazırsın! Bol şans ⚽', cta: 'BAŞLA' },
  ];
  const cur = TEXTS[Math.min(step, TEXTS.length - 1)]!;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 50, paddingHorizontal: 22, paddingBottom: 34 }}>
      <Pressable onPress={onDone} style={{ position: 'absolute', top: 50, right: 20, zIndex: 20 }} hitSlop={12}>
        <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 14 }}>Atla</Text>
      </Pressable>

      {/* Simulation stage */}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {step <= 0 ? (
          <View style={{ alignItems: 'center', gap: 14 }}>
            <Ionicons name="school" size={72} color={theme.primary} />
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>Nasıl Oynanır?</Text>
          </View>
        ) : step === 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
            {TUT_TEAMS.map((tname) => {
              const target = tname === 'Galatasaray';
              return (
                <Pressable
                  key={tname}
                  onPress={() => { if (target) next(); }}
                  style={{
                    width: '30%', alignItems: 'center', gap: 6, paddingVertical: 14,
                    backgroundColor: theme.card, borderRadius: 14,
                    borderWidth: 2, borderColor: target ? theme.primary : theme.border,
                    opacity: target ? 1 : 0.45,
                  }}
                >
                  <ClubBadge name={tname} size={42} logoUrl={null} />
                  <Text style={{ color: theme.text, fontSize: 10.5, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>{tname}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <ClubBadge name="Galatasaray" size={58} logoUrl={null} />
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Galatasaray</Text>
              </View>
              <Text style={{ color: theme.accent, fontSize: 22, fontWeight: '900' }}>✕</Text>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <ClubBadge name="Real Madrid" size={58} logoUrl={null} />
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Real Madrid</Text>
              </View>
            </View>
            {step >= 3 ? (
              <View style={{
                backgroundColor: theme.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 22,
                alignItems: 'center', gap: 4, borderWidth: 2, borderColor: step >= 4 ? theme.primary : theme.border,
              }}>
                <Text style={{ color: step >= 4 ? theme.primary : theme.text, fontSize: 18, fontWeight: '900' }}>Wesley Sneijder</Text>
                <Text style={{ color: step >= 4 ? theme.primary : theme.muted, fontSize: 12 }}>
                  {step >= 4 ? '✓ İki takımda da oynadı!' : '… ortak oyuncu'}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Coach bubble */}
      <Animated.View style={{ transform: [{ scale: bubble }], opacity: bubble, backgroundColor: theme.card, borderRadius: 18, borderWidth: 1, borderColor: theme.primary, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ionicons name="football" size={18} color={theme.primary} />
          <Text style={{ color: theme.primary, fontWeight: '900', fontSize: 12, letterSpacing: 1 }}>KOÇ</Text>
        </View>
        <Text style={{ color: theme.text, fontSize: 15, lineHeight: 22 }}>{cur.text}</Text>
        {cur.cta ? (
          <View style={{ marginTop: 12 }}>
            <Btn label={cur.cta} kind="primary" icon={cur.cta === 'BAŞLA' ? 'rocket' : 'arrow-forward'} onPress={cur.cta === 'BAŞLA' ? onDone : next} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

// ---- Emotes (Clash-Royale-style in-match reactions) ----

// One emote pop: springs in, holds, fades out. Re-mounted (via `key={n}`) on
// every new emote so the same sticker can replay.
function TransientCallout({ emoteId }: { emoteId: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setGone(false);
    Animated.spring(a, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(a, { toValue: 0, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setGone(true),
      );
    }, 3000);
    return () => clearTimeout(t);
  }, [a, emoteId]);
  if (gone) return null;
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }}>
      <EmoteCallout id={emoteId} />
    </Animated.View>
  );
}

// Floating emote button + picker sheet + the opponent/self callouts. Drop into
// any in-match screen; positions itself absolutely over the screen.
function EmoteLayer({ state, actions, fab = 'bottom-right' }: Props & { fab?: 'bottom-right' | 'top-right' }) {
  const [open, setOpen] = useState(false);
  const room = state.room;
  const youId = room?.youId;
  const oppId = room?.players.find((p) => p.id !== youId)?.id;
  const mine = youId ? state.emotes[youId] : undefined;
  const theirs = oppId ? state.emotes[oppId] : undefined;
  const emotes = availableEmotes(state.profile);

  return (
    <>
      <View pointerEvents="none" style={styles.emoteTop}>
        {theirs ? <TransientCallout key={`opp-${theirs.n}`} emoteId={theirs.emoteId} /> : null}
      </View>
      <View pointerEvents="none" style={styles.emoteBottom}>
        {mine ? <TransientCallout key={`you-${mine.n}`} emoteId={mine.emoteId} /> : null}
      </View>

      <Pressable
        style={[styles.emoteFab, fab === 'top-right' ? styles.emoteFabTop : styles.emoteFabBottom]}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="happy" size={26} color="#06131F" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.emoteSheetBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.emoteSheet} onPress={() => {}}>
            <View style={styles.emoteSheetHandle} />
            <Text style={styles.emoteSheetTitle}>{t('emote.send')}</Text>
            <View style={styles.emoteGrid}>
              {emotes.map((e) => (
                <Pressable
                  key={e.id}
                  style={styles.emoteCell}
                  onPress={() => {
                    actions.sendEmote(e.id);
                    setOpen(false);
                  }}
                >
                  <EmoteSticker id={e.id} size={52} />
                  <Text style={styles.emoteCellLabel} numberOfLines={1}>
                    {e.phrase}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.emoteHint}>{t('emote.moreInStore')}</Text>
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
const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };
const MODE_LABEL: Record<GameMode, string> = {
  'team-team': t('mode.teamTeam'),
  'country-team': t('mode.countryTeam'),
  'letter-team': t('mode.letterTeam'),
};
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
        <View style={styles.profileStat}>
          <Ionicons name="diamond" size={15} color="#5BC8FF" />
          <Text style={styles.profileStatVal}>{profile.diamonds}</Text>
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

export function HomeScreen({ actions, state }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [scope, setScope] = useState<Scope>({ type: 'all' });
  const [mode, setMode] = useState<GameMode>('team-team');
  const [picker, setPicker] = useState<Picker>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const opts: GameOptions = { scope, difficulty, mode };
  const profile = state.profile;
  const playerName = profile?.displayName ?? (name || 'Oyuncu');

  return (
    <Screen>
      {/* Hamburger menu (top right) */}
      <Pressable style={{ position: 'absolute', top: 4, right: 16, zIndex: 50 }} onPress={() => setMenuOpen(true)}>
        <Ionicons name="menu" size={26} color={theme.text} />
      </Pressable>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setMenuOpen(false)}>
          <View style={{ position: 'absolute', top: 60, right: 20, backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 6, minWidth: 200 }}>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14 }} onPress={() => { setMenuOpen(false); actions.openMatchHistory(); }}>
              <Ionicons name="time" size={20} color={theme.accent} />
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{t('menu.matchHistory')}</Text>
            </Pressable>
            <View style={{ height: 1, backgroundColor: theme.border }} />
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14 }} onPress={() => { setMenuOpen(false); actions.openLeaderboard(); }}>
              <Ionicons name="trophy" size={20} color={theme.accent} />
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{t('menu.leaderboard')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginTop: 2, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="football" size={28} color={theme.primary} />
            <Text style={[styles.logo, { marginTop: 0 }]}>CROSSOVER</Text>
          </View>
        </View>

        {profile ? <ProfileCard profile={profile} onPress={actions.openArenas} /> : null}

        {/* Game options — one tidy row */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 14 }}>
          <Chip icon={MODE_ICON[mode]} label={MODE_LABEL[mode]} onPress={() => setPicker('mode')} />
          <Chip icon="globe-outline" label={scopeLabel(scope)} onPress={() => setPicker('scopeType')} />
          <Chip icon="speedometer-outline" label={DIFF_LABEL[difficulty]} onPress={() => setPicker('difficulty')} />
        </View>

        {/* Primary action */}
        <Btn label={t('home.quickMatch')} icon="flash" kind="primary" big onPress={() => actions.findMatch(opts)} />

        {/* Secondary actions — even 2-up grid + join */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Btn label={t('home.createRoom')} icon="add-circle" kind="blue" onPress={() => actions.createRoom(playerName, opts)} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label={t('home.solo')} icon="game-controller" kind="accent" onPress={() => actions.createSolo(playerName, opts)} />
          </View>
        </View>
        <Btn label={t('home.joinRoom')} icon="enter" kind="ghost" onPress={() => setJoinOpen(true)} />

        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      </ScrollView>

      {/* Join-by-code sheet (kept off the main screen to reduce clutter) */}
      <Modal visible={joinOpen} transparent animationType="slide" onRequestClose={() => setJoinOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setJoinOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t('home.joinRoom')}</Text>
            <TextInput
              placeholder={t('home.codePlaceholder')}
              placeholderTextColor={theme.muted}
              keyboardAppearance="dark"
              value={code}
              autoCapitalize="characters"
              onChangeText={(v) => setCode(v.toUpperCase())}
              style={styles.input}
              autoFocus
            />
            <Btn
              label={t('home.joinRoom')}
              icon="enter"
              kind="primary"
              disabled={code.trim().length < 4}
              onPress={() => { setJoinOpen(false); actions.joinRoom(code, playerName); }}
            />
          </Pressable>
        </Pressable>
      </Modal>

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
                  <Text style={styles.modalRowText}>{DIFF_LABEL[d]}</Text>
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
                    <Text style={styles.modalRowText}>{MODE_LABEL[m]}</Text>
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
export function LobbyScreen({ state, actions }: Props) {
  const room = state.room!;
  const you = room.players.find((p) => p.id === room.youId);
  const canStart = !!you?.isHost && room.players.length === 2;
  const hasBot = room.players.some((p) => p.name === 'Bot');
  return (
    <Screen>
      {!hasBot ? (
        <>
          <Text style={styles.label}>{t('lobby.code')}</Text>
          <Text style={styles.code}>{room.code}</Text>
          <Text style={styles.muted}>{t('lobby.shareCode')}</Text>
        </>
      ) : (
        <>
          <Ionicons name="game-controller" size={44} color={theme.accent} style={{ alignSelf: 'center' }} />
          <Text style={styles.h1}>{t('lobby.botMatch')}</Text>
        </>
      )}
      <View style={styles.divider} />
      {room.players.map((p) => (
        <View key={p.id} style={styles.lobbyRow}>
          <Ionicons
            name={p.name === 'Bot' ? 'game-controller' : p.isHost ? 'star' : 'person'}
            size={18}
            color={p.isHost ? theme.accent : theme.muted}
          />
          <Text style={styles.lobbyName}>
            {p.name}
            {p.id === room.youId ? t('lobby.youSuffix') : ''}
          </Text>
        </View>
      ))}
      <View style={{ height: 24 }} />
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
      <Btn label={t('result.leave')} kind="ghost" icon="close" onPress={actions.leave} />
    </Screen>
  );
}

// ---- Countdown ----
export function CountdownScreen({ state }: Props) {
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.big}>{state.countdown ?? ''}</Text>
        <Text style={styles.muted}>{t('getReady')}</Text>
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

export function PickTeamScreen({ state, actions }: Props) {
  const [q, setQ] = useState('');
  const [countryQ, setCountryQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const role = state.pickRole ?? 'team';

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
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          <Text style={styles.muted}>{t('pick.picked')}</Text>
        </View>
      </Screen>
    );
  }

  // ---- Letter picker ----
  if (role === 'letter') {
    return (
      <Screen>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
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
        <EmoteLayer state={state} actions={actions} fab="top-right" />
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
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
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
            autoFocus
          />
        </View>
        <ScrollView style={{ alignSelf: 'stretch' }} keyboardShouldPersistTaps="handled">
          {filtered.map((n) => (
            <Pressable key={n.value} style={styles.clubRow} onPress={() => actions.pickCountry(n.value)}>
              <Text style={{ fontSize: 24 }}>{n.flag}</Text>
              <Text style={styles.clubText} numberOfLines={1}>{n.displayName}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </Pressable>
          ))}
          {filtered.length === 0 && countryQ.trim() ? <Text style={styles.muted}>{t('common.noResults')}</Text> : null}
        </ScrollView>
        <EmoteLayer state={state} actions={actions} fab="top-right" />
      </Screen>
    );
  }

  // ---- Team picker (default) ----
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginBottom: 8 }}>
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
          autoFocus
        />
      </View>
      <ScrollView
        style={{ alignSelf: 'stretch' }}
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
              borderWidth: 1, borderColor: theme.border, paddingVertical: 12, paddingHorizontal: 4,
            }}
          >
            <ClubBadge name={c.name} size={46} logoUrl={c.logoUrl} />
            <Text style={{ color: theme.text, fontSize: 10.5, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
              {c.name}
            </Text>
          </Pressable>
        ))}
        {state.clubResults.length === 0 && q.trim() ? (
          <Text style={[styles.muted, { width: '100%', marginTop: 20 }]}>{t('common.noResults')}</Text>
        ) : null}
      </ScrollView>
      <EmoteLayer state={state} actions={actions} fab="top-right" />
    </Screen>
  );
}

// ---- Reveal + Guess ----
export function GuessScreen({ state, actions }: Props) {
  const [text, setText] = useState('');
  const teams = state.teams;
  const room = state.room!;
  const youAnswered = state.locked?.byId === room.youId;
  const someoneElseAnswered = state.locked && state.locked.byId !== room.youId;

  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'guess' || !state.guessEndsAt) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((state.guessEndsAt! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.phase, state.guessEndsAt]);

  return (
    <Screen>
      <View style={styles.teamsRow}>
        <View style={styles.teamCard}>
          {state.revealMode === 'country-team' ? (
            <Text style={{ fontSize: 40 }}>{NATIONALITIES.find((n) => n.value === state.revealCountry)?.flag ?? '🏳️'}</Text>
          ) : state.revealMode === 'letter-team' ? (
            <Text style={{ color: theme.accent, fontSize: 36, fontWeight: '900' }}>{teams?.teamA.name ?? '?'}</Text>
          ) : (
            <ClubBadge name={teams?.teamA.name ?? '?'} size={44} logoUrl={teams?.teamA.logoUrl ?? null} />
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {state.revealMode === 'country-team'
              ? NATIONALITIES.find((n) => n.value === state.revealCountry)?.displayName ?? teams?.teamA.name ?? '…'
              : teams?.teamA.name ?? '…'}
          </Text>
        </View>
        <Ionicons name="add" size={26} color={theme.accent} />
        <View style={styles.teamCard}>
          <ClubBadge name={teams?.teamB.name ?? '?'} size={44} logoUrl={teams?.teamB.logoUrl ?? null} />
          <Text style={styles.teamName} numberOfLines={2}>
            {teams?.teamB.name ?? '…'}
          </Text>
        </View>
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
          ) : (
            <>
              <Text style={styles.h1}>
                {state.revealMode === 'country-team' && state.revealCountry && teams?.teamB
                  ? t('guess.titleCountry', { country: NATIONALITIES.find((n) => n.value === state.revealCountry)?.displayName ?? state.revealCountry, team: teams.teamB.name })
                  : state.revealMode === 'letter-team' && state.revealLetter && teams?.teamB
                  ? t('guess.titleLetter', { letter: state.revealLetter, team: teams.teamB.name })
                  : t('guess.title')}
              </Text>
              <TextInput
                placeholder={t('guess.placeholder')}
                placeholderTextColor={theme.muted}
          keyboardAppearance="dark"
                value={text}
                onChangeText={setText}
                style={styles.input}
                autoFocus
                editable={!youAnswered}
                onSubmitEditing={() => text.trim() && actions.submitGuess(text.trim())}
              />
              <Btn
                label={t('guess.send')}
                icon="send"
                onPress={() => actions.submitGuess(text.trim())}
                disabled={!text.trim() || youAnswered}
              />
            </>
          )}
        </>
      )}
      <EmoteLayer state={state} actions={actions} fab="top-right" />
    </Screen>
  );
}

// ---- Store ----
const DIAMOND_PACKS = [
  { id: 'pack1', amount: 100, price: '₺29,99', icon: 'diamond', color: '#5BC8FF', best: false },
  { id: 'pack2', amount: 500, price: '₺99,99', icon: 'diamond', color: '#5BC8FF', best: true },
  { id: 'pack3', amount: 1200, price: '₺199,99', icon: 'diamond', color: '#5BC8FF', best: false },
  { id: 'pack4', amount: 5000, price: '₺699,99', icon: 'diamond', color: '#A855F7', best: false },
];

function ChangeNameModal({ visible, diamonds, onClose, onConfirm }: {
  visible: boolean;
  diamonds: number;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const cost = 100;
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
              <Text style={{ color: canAfford ? '#5BC8FF' : theme.danger, fontWeight: '800', fontSize: 15 }}>{cost}</Text>
              <Ionicons name="diamond" size={14} color={canAfford ? '#5BC8FF' : theme.danger} />
            </View>
            <Text style={styles.muted}>{t('store.balance')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{diamonds}</Text>
              <Ionicons name="diamond" size={14} color="#5BC8FF" />
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

export function StoreScreen({ state, actions }: Props) {
  const profile = state.profile;
  const { adsWatched, canWatch, cooldownLeft, watchAd } = useAdState();
  const [showNameModal, setShowNameModal] = useState(false);

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <View style={styles.center}>
          <Ionicons name="diamond" size={36} color="#5BC8FF" />
          <Text style={styles.h1}>{t('store.title')}</Text>
          {profile ? (
            <View style={styles.storeBalance}>
              <Ionicons name="diamond" size={18} color="#5BC8FF" />
              <Text style={styles.storeBalanceText}>{profile.diamonds}</Text>
            </View>
          ) : null}
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
            <Text style={styles.storeAdReward}>{t('store.adReward')}</Text>
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
                <Ionicons name={pack.icon as any} size={28} color={pack.color} />
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

        {/* İfadeler (maç içi emote) */}
        <Text style={styles.sectionLabel}>{t('store.emotes')}</Text>
        {PREMIUM_EMOTES.map((e) => {
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
                <View style={styles.storeEmoteOwned}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                  <Text style={styles.storeEmoteOwnedText}>{t('store.owned')}</Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.storeEmoteBuy, !canAfford && { opacity: 0.5 }]}
                  onPress={() => canAfford && actions.buyEmote(e.id)}
                >
                  <Text style={styles.storeEmoteBuyText}>{e.premium?.price}</Text>
                  <Ionicons name="diamond" size={13} color="#06131F" />
                </Pressable>
              )}
            </View>
          );
        })}

        {/* Sosyal Paket */}
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

        {/* İsim değiştirme */}
        <Text style={styles.sectionLabel}>{t('store.other')}</Text>
        <Pressable style={styles.storeAdCard} onPress={() => setShowNameModal(true)}>
          <Ionicons name="create-outline" size={24} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.storeAdTitle}>{t('store.changeName')}</Text>
            <Text style={styles.muted}>{t('store.changeNameDesc')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>100</Text>
            <Ionicons name="diamond" size={14} color="#5BC8FF" />
          </View>
        </Pressable>
      </ScrollView>

      {/* İsim değiştirme popup */}
      <ChangeNameModal
        visible={showNameModal}
        diamonds={profile?.diamonds ?? 0}
        onClose={() => setShowNameModal(false)}
        onConfirm={(newName) => {
          actions.changeName(newName);
          setShowNameModal(false);
        }}
      />
    </Screen>
  );
}

// ---- Friends ----
export function FriendsScreen({ state, actions }: Props) {
  const [addInput, setAddInput] = useState('');
  const [searchMode, setSearchMode] = useState<'code' | 'username'>('code');
  const [friendTab, setFriendTab] = useState<'friends' | 'requests'>('friends');
  const [copied, setCopied] = useState(false);
  const [matchModal, setMatchModal] = useState<string | null>(null); // friendId
  const [socialPackPopup, setSocialPackPopup] = useState(false);
  const profile = state.profile;
  const hasSocialPack = profile?.socialPackUntil ? new Date(profile.socialPackUntil) > new Date() : false;
  const friends = state.friends;
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
        <View style={styles.center}>
          <Ionicons name="people" size={36} color={theme.primary} />
          <Text style={styles.h1}>{t('friends.title')}</Text>
        </View>

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
                backgroundColor: theme.card, borderRadius: 14, padding: 12, marginBottom: 6,
                borderWidth: 1, borderColor: theme.accent,
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
            <View key={f.userId} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: theme.card, borderRadius: 14, padding: 12, marginBottom: 8,
              borderWidth: 1, borderColor: theme.border,
            }}>
              <View style={{ position: 'relative' }}>
                <Ionicons name="person-circle" size={36} color={theme.accent} />
                {f.online ? <View style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.card }} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{f.displayName}</Text>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{f.arena.name}</Text>
              </View>
              <Pressable
                onPress={() => setMatchModal(f.userId)}
                style={{ backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Ionicons name="game-controller" size={16} color="#06131F" />
              </Pressable>
              <Pressable onPress={() => actions.removeFriend(f.userId)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={theme.muted} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      {/* Match mode selection modal */}
      <Modal visible={matchModal !== null} transparent animationType="fade" onRequestClose={() => setMatchModal(null)}>
        <Pressable style={styles.modalBg} onPress={() => setMatchModal(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
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
                      setSocialPackPopup(true);
                      return;
                    }
                    actions.inviteFriendMatch(matchModal!, { mode: m });
                    setMatchModal(null);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name={MODE_ICON[m]} size={18} color={locked ? theme.muted : theme.accent} />
                    <Text style={[styles.modalRowText, locked && { color: theme.muted }]}>{MODE_LABEL[m]}</Text>
                  </View>
                  {locked ? <Ionicons name="lock-closed" size={16} color={theme.muted} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Social pack popup */}
      <Modal visible={socialPackPopup} transparent animationType="fade" onRequestClose={() => setSocialPackPopup(false)}>
        <Pressable style={styles.modalBg} onPress={() => setSocialPackPopup(false)}>
          <Pressable style={styles.nameModalCard} onPress={() => {}}>
            <Ionicons name="lock-closed" size={32} color={theme.accent} />
            <Text style={styles.modalTitle}>Sosyal Paket Gerekli</Text>
            <Text style={[styles.muted, { marginBottom: 12 }]}>
              Ülke-Takım ve Harf-Takım modlarını dostluk maçlarında kullanmak için Sosyal Paket satın almalısın.
            </Text>
            <Btn label="Mağazaya Git" kind="accent" icon="diamond" onPress={() => { setSocialPackPopup(false); /* navigate to store tab */ }} />
            <View style={{ height: 6 }} />
            <Btn label="Vazgeç" kind="ghost" icon="close" onPress={() => setSocialPackPopup(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

// ---- Arenas ----
const ARENA_DATA = [
  { name: 'GOAT', min: 5000, max: 99999, color: '#FF4500', icon: 'flame' as IoniconName, win: '+15', loss: '-35', desc: 'Efsanelerin zirvesi. Sadece en iyiler ayakta kalır.' },
  { name: 'Dünya Kupası', min: 3500, max: 4999, color: '#FFD700', icon: 'trophy' as IoniconName, win: '+18', loss: '-30', desc: 'Dünya sahnesinde mücadele. Her hata çok ağır.' },
  { name: 'Efsaneler Arası', min: 2000, max: 3499, color: '#C0C0C0', icon: 'ribbon' as IoniconName, win: '+20', loss: '-26', desc: 'Efsaneler burada. Kayıplar acıtıyor.' },
  { name: 'Şampiyonlar Ligi', min: 1000, max: 1999, color: '#1E90FF', icon: 'medal' as IoniconName, win: '+22', loss: '-22', desc: 'Avrupa\'nın en prestijli arenası. Dengeli mücadele.' },
  { name: 'Profesyonel Lig', min: 500, max: 999, color: '#32CD32', icon: 'medal-outline' as IoniconName, win: '+25', loss: '-18', desc: 'Profesyonel seviye. Artık gerçek bir rakipsin.' },
  { name: 'Amatör Lig', min: 200, max: 499, color: '#FF8C00', icon: 'football' as IoniconName, win: '+28', loss: '-14', desc: 'İlk adımları attın. Yükselmeye devam!' },
  { name: 'Mahalle Sahası', min: 0, max: 199, color: '#8B4513', icon: 'football-outline' as IoniconName, win: '+30', loss: '-10', desc: 'Herkesin başladığı yer. Kolay tırmanış.' },
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

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Pressable onPress={actions.closeArenas}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={styles.h1}>Arenalar</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="trophy" size={16} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 15 }}>{trophies}</Text>
        </View>
      </View>

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
                  <View style={[styles.arenaIconBox, { backgroundColor: arena.color + '22' }]}>
                    <Ionicons name={arena.icon} size={28} color={arena.color} />
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
export function MatchHistoryScreen({ state, actions }: Props) {
  const history = state.matchHistory;
  const myName = state.profile?.displayName ?? '';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Pressable onPress={actions.closeMatchHistory}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={styles.h1}>{t('matchHistory.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

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
            return (
              <View key={m.id} style={{
                backgroundColor: theme.card, borderRadius: 14, borderWidth: 1,
                borderColor: m.won ? theme.primary : theme.danger, padding: 14, marginBottom: 10,
              }}>
                {/* Header: score + badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name={m.won ? 'trophy' : 'sad-outline'} size={20} color={m.won ? theme.accent : theme.muted} />
                    <Text style={{ color: m.won ? theme.primary : theme.danger, fontWeight: '900', fontSize: 13 }}>
                      {m.won ? t('matchHistory.won') : t('matchHistory.lost')}
                    </Text>
                  </View>
                  <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', letterSpacing: 2 }}>
                    {m.playerScore} - {m.opponentScore}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 10 }}>
                    {MODE_LABEL[(m.gameMode as GameMode) ?? 'team-team'] ?? m.gameMode}
                  </Text>
                </View>

                {/* Players side by side */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {/* My side */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Ionicons name="person" size={14} color={theme.primary} />
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>{myName}</Text>
                    </View>
                    {myRounds.length > 0 ? myRounds.map((r, i) => (
                      <View key={i} style={{ backgroundColor: theme.bg, borderRadius: 8, padding: 6, marginBottom: 4 }}>
                        <Text style={{ color: theme.muted, fontSize: 9 }}>{r.teamA} + {r.teamB}</Text>
                        <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 11 }}>{r.player}</Text>
                      </View>
                    )) : <Text style={{ color: theme.muted, fontSize: 10 }}>—</Text>}
                  </View>

                  <View style={{ width: 1, backgroundColor: theme.border }} />

                  {/* Opponent side */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Ionicons name="person" size={14} color={theme.danger} />
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>{m.opponentName}</Text>
                    </View>
                    {oppRounds.length > 0 ? oppRounds.map((r, i) => (
                      <View key={i} style={{ backgroundColor: theme.bg, borderRadius: 8, padding: 6, marginBottom: 4 }}>
                        <Text style={{ color: theme.muted, fontSize: 9 }}>{r.teamA} + {r.teamB}</Text>
                        <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 11 }}>{r.player}</Text>
                      </View>
                    )) : <Text style={{ color: theme.muted, fontSize: 10 }}>—</Text>}
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
      <View style={styles.center}>
        <Ionicons name="trophy" size={36} color={theme.accent} />
        <Text style={styles.h1}>Lider Tablosu</Text>
      </View>
      <ScrollView style={{ flex: 1, marginTop: 10 }} showsVerticalScrollIndicator={false}>
        {lb.map((entry) => (
          <View key={entry.rank} style={styles.lbRow}>
            <Text style={[styles.lbRank, entry.rank <= 3 ? { color: RANK_COLORS[entry.rank - 1] } : null]}>
              {entry.rank}
            </Text>
            <Ionicons name={arenaIcon(entry.arena)} size={18} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lbName} numberOfLines={1}>{entry.displayName}</Text>
              <Text style={styles.lbArena}>{entry.arena.name}</Text>
            </View>
            <View style={styles.lbTrophyBox}>
              <Ionicons name="trophy" size={12} color={theme.accent} />
              <Text style={styles.lbTrophies}>{entry.trophies}</Text>
            </View>
            <Text style={styles.lbWL}>{entry.wins}G {entry.losses}M</Text>
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

export function ResultScreen({ state, actions }: Props) {
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

        {/* Per-round detail (always shown, including the match-winning round) */}
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
      <EmoteLayer state={state} actions={actions} fab="top-right" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 22, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 6 },
  logo: { color: theme.primary, fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: 2, marginTop: 6 },
  tagline: { color: theme.muted, textAlign: 'center', marginBottom: 20, marginTop: 4, fontSize: 12 },
  h1: { color: theme.text, fontSize: 16, fontWeight: '800', textAlign: 'center', marginVertical: 6 },
  label: { color: theme.muted, fontSize: 10, letterSpacing: 2, textAlign: 'center' },
  sectionLabel: { color: theme.muted, fontSize: 10, letterSpacing: 2, marginTop: 12, marginBottom: 4 },
  code: { color: theme.accent, fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: 4 },
  big: { color: theme.text, fontSize: 64, fontWeight: '900' },
  muted: { color: theme.muted, textAlign: 'center', fontSize: 12 },
  error: { color: theme.danger, textAlign: 'center', marginTop: 10, fontSize: 12 },
  input: {
    backgroundColor: theme.card,
    color: theme.text,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
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
  teamCard: { flex: 1, backgroundColor: theme.card, borderRadius: 14, padding: 14, alignItems: 'center', gap: 8 },
  teamName: { color: theme.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  plus: { color: theme.accent, fontSize: 22, fontWeight: '900' },
  timer: { color: theme.accent, fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  playerPhoto: { width: 80, height: 80, borderRadius: 40, marginTop: 8, borderWidth: 2, borderColor: theme.border },
  matched: { color: theme.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  matchScore: { color: theme.text, fontSize: 44, fontWeight: '900', letterSpacing: 3, marginTop: 6 },
  matchBanner: { alignItems: 'center', gap: 2, backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, paddingVertical: 16, paddingHorizontal: 14, marginBottom: 14 },
  trophyDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  trophyDeltaText: { fontSize: 14, fontWeight: '800' },
  fixRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fixText: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  teamResultRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  teamResult: { flex: 1, backgroundColor: theme.card, borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: 'center', gap: 6 },
  teamResultName: { color: theme.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
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
  nameModalCard: { backgroundColor: theme.card, borderRadius: 20, padding: 24, marginHorizontal: 30, alignItems: 'center' as const, gap: 10, borderWidth: 1, borderColor: theme.border },
  nameModalCost: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginVertical: 6 },
  storeBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.card, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginTop: 6, borderWidth: 1, borderColor: theme.border },
  storeBalanceText: { color: '#5BC8FF', fontSize: 18, fontWeight: '800' },
  storeAdCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 12, padding: 14, marginVertical: 4, borderWidth: 1, borderColor: theme.border },
  storeAdTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
  storeAdReward: { color: '#5BC8FF', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  storeCooldown: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.bg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginVertical: 4 },
  storeCooldownText: { color: theme.accent, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  storePackCard: { backgroundColor: theme.card, borderRadius: 12, padding: 14, marginVertical: 4, borderWidth: 1, borderColor: theme.border, position: 'relative' as const },
  storePackBest: { borderColor: '#5BC8FF', borderWidth: 2 },
  storePackBadge: { position: 'absolute' as const, top: -10, right: 12, backgroundColor: '#5BC8FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  storePackBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  storePackIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  storePackAmount: { color: theme.text, fontSize: 16, fontWeight: '800' },
  storePackPriceBox: { backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  storePackPrice: { color: '#06131F', fontSize: 14, fontWeight: '800' },
  friendAddCard: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: theme.card, borderRadius: 12, padding: 14, marginVertical: 4, borderWidth: 1, borderColor: theme.border },
  friendDivider: { width: 1, height: 40, backgroundColor: theme.border, marginHorizontal: 10 },
  friendLabel: { color: theme.muted, fontSize: 10, fontWeight: '600', marginBottom: 4 },
  friendCode: { color: theme.accent, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  friendInput: { color: theme.text, fontSize: 14, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 4 },
  friendEmpty: { alignItems: 'center' as const, gap: 8, paddingVertical: 30 },
  arenaCard: { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 14, position: 'relative' },
  arenaIconBox: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
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
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  modalSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  modalSearchInput: { flex: 1, color: theme.text, paddingVertical: 10, fontSize: 13 },
  modalTitle: { color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
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
