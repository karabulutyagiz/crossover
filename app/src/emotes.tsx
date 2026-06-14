// Emote system: a small Clash-Royale-style catalog of in-match reaction stickers.
//
// Free emotes (owned by everyone) are simple text bubbles with an icon. Premium
// emotes are sold in the store and rendered as looping RN-`Animated` stickers —
// no GIF/sprite assets and no extra native deps, so they run fine in Expo Go.
// Keep these ids in sync with server/src/game/emotes.ts.
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { theme } from './theme';
import { t } from './i18n';
import type { ProfileView } from './protocol';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface EmoteMeta {
  id: string;
  kind: 'text' | 'animated' | 'face';
  phrase: string; // Turkish caption shown with the emote
  icon?: IoniconName; // text + generic animated emotes
  expr?: 'smile' | 'cry' | 'angry' | 'ok'; // face emotes: which expression to draw
  color: string;
  week?: number; // visual emotes: which weekly store drop it belongs to
  premium?: { name: string; price: number; desc: string };
}

// Quick-chat TEXT messages — Clash-Royale style. Sent from the message icon, no emoji.
export const TEXT_EMOTES: EmoteMeta[] = [
  { id: 'gg', kind: 'text', phrase: t('emote.gg'), icon: 'chatbubble-ellipses', color: theme.primary },
  { id: 'congrats', kind: 'text', phrase: t('emote.congrats'), icon: 'chatbubble-ellipses', color: theme.accent },
  { id: 'luck', kind: 'text', phrase: t('emote.luck'), icon: 'chatbubble-ellipses', color: theme.blue },
  { id: 'gotcha', kind: 'text', phrase: t('emote.thanks'), icon: 'chatbubble-ellipses', color: theme.purple },
];

// The 4 character emotes (Clash-Royale style): smiling / crying / angry / OK-sign.
export const FACE_EMOTES: EmoteMeta[] = [
  { id: 'smile', kind: 'face', expr: 'smile', phrase: t('emote.face.smile'), color: theme.accent },
  { id: 'cry', kind: 'face', expr: 'cry', phrase: t('emote.face.cry'), color: theme.blue },
  { id: 'angry', kind: 'face', expr: 'angry', phrase: t('emote.face.angry'), color: theme.danger },
  { id: 'ok', kind: 'face', expr: 'ok', phrase: t('emote.face.ok'), color: theme.primary },
];

// All free (always-available) emotes = quick-chat text + the 4 character faces.
export const FREE_EMOTES: EmoteMeta[] = [...TEXT_EMOTES, ...FACE_EMOTES];

export const PREMIUM_EMOTES: EmoteMeta[] = [
  // ---- Week 1 ----
  {
    id: 'jersey10',
    kind: 'animated',
    phrase: t('emote.jersey10.phrase'),
    color: '#1E50C8',
    week: 1,
    premium: { name: t('emote.jersey10.name'), price: 250, desc: t('emote.jersey10.desc') },
  },
  {
    id: 'goal',
    kind: 'animated',
    phrase: t('emote.goal.phrase'),
    color: theme.primary,
    week: 1,
    premium: { name: t('emote.goal.name'), price: 150, desc: t('emote.goal.desc') },
  },
  {
    id: 'champion',
    kind: 'animated',
    phrase: t('emote.champion.phrase'),
    color: theme.accent,
    week: 1,
    premium: { name: t('emote.champion.name'), price: 300, desc: t('emote.champion.desc') },
  },
  // ---- Week 2 ---- (generic animated sticker: a springy icon)
  {
    id: 'redcard',
    kind: 'animated',
    phrase: 'Kırmızı kart! 🟥',
    icon: 'square',
    color: '#E0263A',
    week: 2,
    premium: { name: 'Kırmızı Kart', price: 150, desc: 'Rakibe kırmızı göster' },
  },
  {
    id: 'penalty',
    kind: 'animated',
    phrase: 'Penaltı! 🎯',
    icon: 'football',
    color: theme.primary,
    week: 2,
    premium: { name: 'Penaltı', price: 180, desc: 'Baskı anı' },
  },
  {
    id: 'hattrick',
    kind: 'animated',
    phrase: 'Hat-trick! ⚽⚽⚽',
    icon: 'flame',
    color: theme.accent,
    week: 2,
    premium: { name: 'Hat-trick', price: 220, desc: 'Üç gol coşkusu' },
  },
];

// Visual (premium) emotes grouped by their weekly drop, newest first.
export function emoteWeeks(): { week: number; emotes: EmoteMeta[] }[] {
  const byWeek = new Map<number, EmoteMeta[]>();
  for (const e of PREMIUM_EMOTES) {
    const w = e.week ?? 1;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(e);
  }
  return [...byWeek.entries()].sort((a, b) => b[0] - a[0]).map(([week, emotes]) => ({ week, emotes }));
}

export const LATEST_WEEK = Math.max(...PREMIUM_EMOTES.map((e) => e.week ?? 1));

const ALL = [...FREE_EMOTES, ...PREMIUM_EMOTES];
const BY_ID = new Map(ALL.map((e) => [e.id, e]));

export function getEmote(id: string): EmoteMeta | undefined {
  return BY_ID.get(id);
}

// TEMPORARY: unlock every emote (incl. premium) so they can be tried without
// buying. Set back to false to restore store-gated ownership.
const UNLOCK_ALL_EMOTES = true;

// Free emotes are available to everyone; premium ones must be purchased.
export function ownsEmote(profile: ProfileView | null, id: string): boolean {
  if (UNLOCK_ALL_EMOTES) return Boolean(getEmote(id));
  if (FREE_EMOTES.some((e) => e.id === id)) return true;
  return Boolean(profile?.ownedEmotes?.includes(id));
}

// Emotes the player can currently pick from in a match: free text quick-chats
// (always) + the equipped visual emotes (the max-3 loadout).
export function loadoutEmotes(profile: ProfileView | null): EmoteMeta[] {
  const equipped = (profile?.equippedEmotes ?? [])
    .map((id) => getEmote(id))
    .filter((e): e is EmoteMeta => Boolean(e));
  return [...FREE_EMOTES, ...equipped];
}

// Owned emotes (for the store / inventory ownership display).
export function availableEmotes(profile: ProfileView | null): EmoteMeta[] {
  return ALL.filter((e) => ownsEmote(profile, e.id));
}

// ============================ The animated stickers ============================

// Flagship premium emote: a character holding a striped #10 jersey, turning head
// to the side with a smug raised-eyebrow expression. 2s loop.
//
// Timeline:
//   0.0s — Jersey held, neutral face, looking forward
//   0.3s — Eyes glance right
//   0.6s — Head turns right
//   0.9s — Left eyebrow rises
//   1.2s — Mouth shifts to one-sided smirk
//   1.5s — Smug look holds
//   2.0s — Return to neutral / loop
function JerseyLiftEmote({ size }: { size: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const h = size * 0.30; // head size
  const skin = '#D4956A';
  const hair = '#3B2314';
  const beard = '#4A3020';
  const jerseyW = size * 0.42;
  const jerseyH = size * 0.40;

  // Head rotation: 0→stays→turns right→holds→returns
  const headRot = t.interpolate({
    inputRange: [0, 0.15, 0.30, 0.75, 0.90, 1],
    outputRange: ['0deg', '0deg', '-14deg', '-14deg', '0deg', '0deg'],
  });
  // Head tilt (slight lean when smirking)
  const headTilt = t.interpolate({
    inputRange: [0, 0.30, 0.45, 0.75, 0.90, 1],
    outputRange: ['0deg', '0deg', '5deg', '5deg', '0deg', '0deg'],
  });
  // Eye glance (moves slightly before head)
  const eyeX = t.interpolate({
    inputRange: [0, 0.10, 0.25, 0.75, 0.88, 1],
    outputRange: [0, 0, -h * 0.08, -h * 0.08, 0, 0],
  });
  // Left eyebrow raise
  const browLY = t.interpolate({
    inputRange: [0, 0.35, 0.45, 0.75, 0.88, 1],
    outputRange: [0, 0, -h * 0.10, -h * 0.10, 0, 0],
  });
  // Smirk: right side of mouth goes up
  const smirkY = t.interpolate({
    inputRange: [0, 0.50, 0.60, 0.75, 0.88, 1],
    outputRange: [0, 0, -h * 0.04, -h * 0.04, 0, 0],
  });
  const smirkRot = t.interpolate({
    inputRange: [0, 0.50, 0.60, 0.75, 0.88, 1],
    outputRange: ['0deg', '0deg', '-8deg', '-8deg', '0deg', '0deg'],
  });
  // Jersey gentle sway
  const jerseySway = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '2deg', '0deg', '-2deg', '0deg'],
  });
  // Left arm (holding jersey) — slight up/down
  const armLY = t.interpolate({
    inputRange: [0, 0.3, 0.75, 1],
    outputRange: [0, -size * 0.01, -size * 0.01, 0],
  });
  // Right arm pointing up
  const fingerBob = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -size * 0.02, 0, -size * 0.02, 0],
  });

  const STRIPES = ['#1E50C8', '#A31545', '#1E50C8', '#A31545', '#1E50C8'];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* ── Torso (dark blue shirt) ── */}
      <View style={{
        position: 'absolute', bottom: 0, width: size * 0.52, height: size * 0.36,
        backgroundColor: '#1A2B5C', borderTopLeftRadius: size * 0.14, borderTopRightRadius: size * 0.14,
        borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
      }} />

      {/* ── Left arm + jersey ── */}
      <Animated.View style={{
        position: 'absolute', left: size * 0.04, bottom: size * 0.18,
        alignItems: 'center', transform: [{ translateY: armLY }],
      }}>
        {/* Upper arm */}
        <View style={{ width: size * 0.10, height: size * 0.22, backgroundColor: '#1A2B5C', borderRadius: size * 0.05, transform: [{ rotate: '15deg' }] }} />
        {/* Hand */}
        <View style={{ width: size * 0.08, height: size * 0.06, backgroundColor: skin, borderRadius: size * 0.03, marginTop: -2 }} />
      </Animated.View>

      {/* ── Jersey (held by left hand) ── */}
      <Animated.View style={{
        position: 'absolute', left: -size * 0.02, bottom: size * 0.08,
        transform: [{ rotate: jerseySway }],
      }}>
        <View style={{
          width: jerseyW, height: jerseyH, borderRadius: 8, overflow: 'hidden',
          flexDirection: 'row', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)',
        }}>
          {STRIPES.map((c, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: c }} />
          ))}
          {/* Collar */}
          <View style={{
            position: 'absolute', top: 0, left: jerseyW * 0.32, width: jerseyW * 0.36,
            height: jerseyH * 0.10, backgroundColor: '#E8E8E8',
            borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
          }} />
          {/* Number 10 */}
          <View style={StyleSheet.absoluteFill as any}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: jerseyH * 0.06 }}>
              <Text style={{
                color: '#FFD700', fontSize: jerseyH * 0.42, fontWeight: '900',
                textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2,
              }}>10</Text>
            </View>
          </View>
        </View>
        {/* Left sleeve */}
        <View style={{
          position: 'absolute', left: -size * 0.04, top: size * 0.01,
          width: size * 0.10, height: size * 0.10, backgroundColor: '#1E50C8',
          borderRadius: 5, transform: [{ rotate: '20deg' }],
        }} />
        {/* Right sleeve */}
        <View style={{
          position: 'absolute', right: -size * 0.04, top: size * 0.01,
          width: size * 0.10, height: size * 0.10, backgroundColor: '#A31545',
          borderRadius: 5, transform: [{ rotate: '-20deg' }],
        }} />
      </Animated.View>

      {/* ── Right arm pointing up ── */}
      <Animated.View style={{
        position: 'absolute', right: size * 0.06, bottom: size * 0.38,
        alignItems: 'center', transform: [{ translateY: fingerBob }],
      }}>
        {/* Upper arm */}
        <View style={{
          width: size * 0.09, height: size * 0.20, backgroundColor: '#1A2B5C',
          borderRadius: size * 0.05, transform: [{ rotate: '-10deg' }],
        }} />
        {/* Forearm */}
        <View style={{
          width: size * 0.07, height: size * 0.14, backgroundColor: skin,
          borderRadius: size * 0.035, marginTop: -2,
        }} />
        {/* Pointing finger */}
        <View style={{
          width: size * 0.04, height: size * 0.08, backgroundColor: skin,
          borderRadius: size * 0.02, marginTop: -1,
        }} />
      </Animated.View>

      {/* ── Head ── */}
      <Animated.View style={{
        position: 'absolute', top: size * 0.02, right: size * 0.18,
        alignItems: 'center',
        transform: [{ rotate: headRot }, { rotate: headTilt }],
      }}>
        {/* Hair (spiky top) */}
        <View style={{
          width: h * 1.06, height: h * 0.55, backgroundColor: hair,
          borderTopLeftRadius: h * 0.4, borderTopRightRadius: h * 0.2,
          marginBottom: -h * 0.35, zIndex: 2,
        }}>
          {/* Spiky strand */}
          <View style={{
            position: 'absolute', top: -h * 0.08, right: h * 0.12,
            width: h * 0.20, height: h * 0.22, backgroundColor: hair,
            borderTopLeftRadius: h * 0.15, borderTopRightRadius: h * 0.05,
            transform: [{ rotate: '10deg' }],
          }} />
        </View>

        {/* Face */}
        <View style={{
          width: h, height: h * 1.05, borderRadius: h * 0.42,
          backgroundColor: skin, alignItems: 'center', overflow: 'visible',
        }}>
          {/* Eyebrows */}
          <View style={{ flexDirection: 'row', gap: h * 0.20, marginTop: h * 0.22 }}>
            {/* Left eyebrow (the one that raises) */}
            <Animated.View style={{
              width: h * 0.16, height: h * 0.05, backgroundColor: hair,
              borderRadius: 2, transform: [{ translateY: browLY }],
            }} />
            {/* Right eyebrow */}
            <View style={{ width: h * 0.16, height: h * 0.05, backgroundColor: hair, borderRadius: 2 }} />
          </View>

          {/* Eyes */}
          <Animated.View style={{
            flexDirection: 'row', gap: h * 0.18, marginTop: h * 0.04,
            transform: [{ translateX: eyeX }],
          }}>
            <View style={{ width: h * 0.12, height: h * 0.10, borderRadius: h * 0.06, backgroundColor: '#1A1108' }} />
            <View style={{ width: h * 0.12, height: h * 0.10, borderRadius: h * 0.06, backgroundColor: '#1A1108' }} />
          </Animated.View>

          {/* Nose */}
          <View style={{
            width: h * 0.08, height: h * 0.08, backgroundColor: '#C0825A',
            borderRadius: h * 0.04, marginTop: h * 0.04,
          }} />

          {/* Mouth (neutral → smirk) */}
          <Animated.View style={{
            marginTop: h * 0.04,
            transform: [{ translateY: smirkY }, { rotate: smirkRot }],
          }}>
            <View style={{
              width: h * 0.28, height: h * 0.06,
              borderBottomLeftRadius: h * 0.08, borderBottomRightRadius: h * 0.08,
              backgroundColor: '#8B4D30',
            }} />
          </Animated.View>

          {/* Beard */}
          <View style={{
            position: 'absolute', bottom: -h * 0.02, width: h * 0.70, height: h * 0.28,
            backgroundColor: beard, borderBottomLeftRadius: h * 0.25, borderBottomRightRadius: h * 0.25,
            opacity: 0.65,
          }} />
        </View>

        {/* Side hair / sideburn (right side, visible when turning) */}
        <View style={{
          position: 'absolute', right: -h * 0.02, top: h * 0.30,
          width: h * 0.10, height: h * 0.30, backgroundColor: hair,
          borderBottomRightRadius: h * 0.08,
        }} />
      </Animated.View>
    </View>
  );
}

// "Süper Gol!" — a spinning football with a celebratory pop.
function GoalEmote({ size }: { size: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.sequence([
      Animated.timing(pop, { toValue: 1, duration: 400, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.timing(pop, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(500),
    ]));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [spin, pop]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.25] }) }], opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }}>
        <Ionicons name="flash" size={size * 0.92} color={theme.accent} />
      </Animated.View>
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
        <Ionicons name="football" size={size * 0.62} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

// "Şampiyon!" — a pulsing trophy ringed by orbiting sparkles.
function ChampionEmote({ size }: { size: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    const b = Animated.loop(Animated.timing(orbit, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [pulse, orbit]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.1] });
  const rotate = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size * 0.9, height: size * 0.9, transform: [{ rotate }] }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ position: 'absolute', top: 0, left: '46%', transform: [{ rotate: `${i * 120}deg` }] }}>
            <Ionicons name="sparkles" size={size * 0.18} color={theme.accent} />
          </View>
        ))}
      </Animated.View>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name="trophy" size={size * 0.6} color={theme.accent} />
      </Animated.View>
    </View>
  );
}

// Renders an emote's visual at the given size (no caption). Used in previews,
// the picker, and the in-match overlay.
// Generic springy sticker for visual emotes without a bespoke animation.
function GenericAnimatedEmote({ size, icon, color }: { size: number; icon: IoniconName; color: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 550, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.12] });
  const rotate = a.interpolate({ inputRange: [0, 1], outputRange: ['-9deg', '9deg'] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ width: size * 0.82, height: size * 0.82, borderRadius: size * 0.41, backgroundColor: color + '22', borderWidth: 3, borderColor: color, alignItems: 'center', justifyContent: 'center', transform: [{ scale }, { rotate }] }}>
        <Ionicons name={icon} size={size * 0.44} color={color} />
      </Animated.View>
    </View>
  );
}

// The 4 character emotes (smiling / crying / angry / OK-sign), drawn with plain RN
// Views + a gentle bob/tilt loop — no assets, runs in Expo Go.
function FaceEmote({ size, expr }: { size: number; expr: 'smile' | 'cry' | 'angry' | 'ok' }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  const bob = a.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.04] });
  const rot = a.interpolate({ inputRange: [0, 1], outputRange: [expr === 'angry' ? '-5deg' : '-3deg', expr === 'angry' ? '5deg' : '3deg'] });

  const D = size * 0.80;
  const skin = expr === 'angry' ? '#F0A062' : '#F8CB80';
  const eyeC = '#2A2233';
  const mouth = '#7A2E2E';
  const eyeT = D * 0.36;
  const eyeW = D * 0.12;
  return (
    <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: bob }, { rotate: rot }] }}>
      <View style={{ width: D, height: D, borderRadius: D / 2, backgroundColor: skin, borderWidth: 2, borderColor: 'rgba(0,0,0,0.16)' }}>
        {/* eyebrows */}
        {expr === 'angry' && (<>
          <View style={{ position: 'absolute', top: eyeT - D * 0.11, left: D * 0.18, width: D * 0.22, height: D * 0.06, backgroundColor: eyeC, borderRadius: 2, transform: [{ rotate: '24deg' }] }} />
          <View style={{ position: 'absolute', top: eyeT - D * 0.11, right: D * 0.18, width: D * 0.22, height: D * 0.06, backgroundColor: eyeC, borderRadius: 2, transform: [{ rotate: '-24deg' }] }} />
        </>)}
        {expr === 'cry' && (<>
          <View style={{ position: 'absolute', top: eyeT - D * 0.09, left: D * 0.18, width: D * 0.18, height: D * 0.05, backgroundColor: eyeC, borderRadius: 2, transform: [{ rotate: '-18deg' }] }} />
          <View style={{ position: 'absolute', top: eyeT - D * 0.09, right: D * 0.18, width: D * 0.18, height: D * 0.05, backgroundColor: eyeC, borderRadius: 2, transform: [{ rotate: '18deg' }] }} />
        </>)}
        {/* eyes */}
        {expr === 'ok' ? (<>
          <View style={{ position: 'absolute', top: eyeT, left: D * 0.24, width: eyeW, height: eyeW, borderRadius: eyeW / 2, backgroundColor: eyeC }} />
          {/* winking eye */}
          <View style={{ position: 'absolute', top: eyeT + eyeW * 0.35, right: D * 0.22, width: eyeW * 1.3, height: D * 0.035, borderRadius: 2, backgroundColor: eyeC }} />
        </>) : (<>
          <View style={{ position: 'absolute', top: eyeT, left: D * 0.24, width: eyeW, height: expr === 'angry' ? eyeW * 0.78 : eyeW, borderRadius: eyeW / 2, backgroundColor: eyeC }} />
          <View style={{ position: 'absolute', top: eyeT, right: D * 0.24, width: eyeW, height: expr === 'angry' ? eyeW * 0.78 : eyeW, borderRadius: eyeW / 2, backgroundColor: eyeC }} />
        </>)}
        {/* tears */}
        {expr === 'cry' && (<>
          <View style={{ position: 'absolute', top: eyeT + eyeW * 1.1, left: D * 0.25, width: D * 0.10, height: D * 0.22, backgroundColor: '#5AB8FF', borderTopLeftRadius: D * 0.05, borderTopRightRadius: D * 0.05, borderBottomLeftRadius: D * 0.06, borderBottomRightRadius: D * 0.06, opacity: 0.92 }} />
          <View style={{ position: 'absolute', top: eyeT + eyeW * 1.1, right: D * 0.25, width: D * 0.10, height: D * 0.16, backgroundColor: '#5AB8FF', borderTopLeftRadius: D * 0.05, borderTopRightRadius: D * 0.05, borderBottomLeftRadius: D * 0.06, borderBottomRightRadius: D * 0.06, opacity: 0.92 }} />
        </>)}
        {/* mouth */}
        {(expr === 'smile' || expr === 'ok') && (
          <View style={{ position: 'absolute', bottom: D * 0.18, left: D * 0.29, width: D * 0.42, height: D * 0.22, borderBottomLeftRadius: D * 0.22, borderBottomRightRadius: D * 0.22, backgroundColor: mouth }} />
        )}
        {expr === 'angry' && (
          <View style={{ position: 'absolute', bottom: D * 0.20, left: D * 0.34, width: D * 0.32, height: D * 0.15, borderTopLeftRadius: D * 0.16, borderTopRightRadius: D * 0.16, backgroundColor: mouth }} />
        )}
        {expr === 'cry' && (
          <View style={{ position: 'absolute', bottom: D * 0.15, left: D * 0.36, width: D * 0.28, height: D * 0.20, borderRadius: D * 0.12, borderWidth: D * 0.045, borderColor: mouth, backgroundColor: '#3A1414' }} />
        )}
      </View>
      {/* OK-sign hand */}
      {expr === 'ok' && (
        <View style={{ position: 'absolute', right: size * 0.0, bottom: size * 0.12 }}>
          <View style={{ width: size * 0.20, height: size * 0.20, borderRadius: size * 0.10, borderWidth: size * 0.055, borderColor: skin, backgroundColor: 'transparent' }} />
          <View style={{ position: 'absolute', right: -size * 0.015, top: -size * 0.07, flexDirection: 'row', gap: size * 0.012 }}>
            <View style={{ width: size * 0.028, height: size * 0.10, borderRadius: size * 0.014, backgroundColor: skin }} />
            <View style={{ width: size * 0.028, height: size * 0.12, borderRadius: size * 0.014, backgroundColor: skin }} />
            <View style={{ width: size * 0.028, height: size * 0.09, borderRadius: size * 0.014, backgroundColor: skin }} />
          </View>
        </View>
      )}
    </Animated.View>
  );
}

export function EmoteSticker({ id, size }: { id: string; size: number }) {
  const meta = getEmote(id);
  if (!meta) return null;
  if (meta.kind === 'face') return <FaceEmote size={size} expr={meta.expr ?? 'smile'} />;
  if (meta.kind === 'animated') {
    if (id === 'jersey10') return <JerseyLiftEmote size={size} />;
    if (id === 'goal') return <GoalEmote size={size} />;
    if (id === 'champion') return <ChampionEmote size={size} />;
    return <GenericAnimatedEmote size={size} icon={meta.icon ?? 'star'} color={meta.color} />;
  }
  // text emote: icon badge
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4, backgroundColor: meta.color + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: meta.color }}>
        <Ionicons name={meta.icon ?? 'happy'} size={size * 0.42} color={meta.color} />
      </View>
    </View>
  );
}

// A full emote "card" with the sticker + its caption — what pops up over the
// match when a player reacts.
export function EmoteCallout({ id, size = 88 }: { id: string; size?: number }) {
  const meta = getEmote(id);
  const caption = useMemo(() => meta?.phrase ?? '', [meta]);
  if (!meta) return null;
  return (
    <View style={styles.callout}>
      <EmoteSticker id={id} size={size} />
      <Text style={[styles.calloutText, { color: meta.color }]}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    alignItems: 'center',
    backgroundColor: 'rgba(11,16,32,0.82)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  calloutText: { fontSize: 14, fontWeight: '900', marginTop: 2 },
});
