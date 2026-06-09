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
  kind: 'text' | 'animated';
  phrase: string; // Turkish caption shown with the emote
  icon?: IoniconName; // text emotes
  color: string;
  premium?: { name: string; price: number; desc: string };
}

export const FREE_EMOTES: EmoteMeta[] = [
  { id: 'congrats', kind: 'text', phrase: t('emote.congrats'), icon: 'trophy', color: theme.accent },
  { id: 'luck', kind: 'text', phrase: t('emote.luck'), icon: 'sparkles', color: theme.primary },
  { id: 'gg', kind: 'text', phrase: t('emote.gg'), icon: 'thumbs-up', color: theme.primary },
  { id: 'bring_it', kind: 'text', phrase: t('emote.bringIt'), icon: 'flame', color: theme.danger },
  { id: 'gotcha', kind: 'text', phrase: t('emote.gotcha'), icon: 'flash', color: theme.accent },
];

export const PREMIUM_EMOTES: EmoteMeta[] = [
  {
    id: 'jersey10',
    kind: 'animated',
    phrase: t('emote.jersey10.phrase'),
    color: '#1E50C8',
    premium: { name: t('emote.jersey10.name'), price: 250, desc: t('emote.jersey10.desc') },
  },
  {
    id: 'goal',
    kind: 'animated',
    phrase: t('emote.goal.phrase'),
    color: theme.primary,
    premium: { name: t('emote.goal.name'), price: 150, desc: t('emote.goal.desc') },
  },
  {
    id: 'champion',
    kind: 'animated',
    phrase: t('emote.champion.phrase'),
    color: theme.accent,
    premium: { name: t('emote.champion.name'), price: 300, desc: t('emote.champion.desc') },
  },
];

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

// Emotes the player can currently pick from in a match.
export function availableEmotes(profile: ProfileView | null): EmoteMeta[] {
  return ALL.filter((e) => ownsEmote(profile, e.id));
}

// ============================ The animated stickers ============================

// Flagship premium emote: a stylized footballer lifting a blue/red striped jersey
// (number 10) from behind their shoulders — a 1.5s proud-lift loop.
function JerseyLiftEmote({ size }: { size: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const headSize = size * 0.32;
  const bodyW = size * 0.5;
  const bodyH = size * 0.46;

  // Jersey rises from behind the shoulders, holds proudly, then tucks back to loop.
  const jerseyY = t.interpolate({ inputRange: [0, 0.4, 0.78, 1], outputRange: [size * 0.34, -size * 0.04, -size * 0.02, size * 0.34] });
  const jerseyScaleX = t.interpolate({ inputRange: [0, 0.4, 0.78, 1], outputRange: [0.55, 1.06, 1, 0.55] });
  const jerseyScaleY = t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.7, 1, 0.7] });
  const armLiftL = t.interpolate({ inputRange: [0, 0.4, 0.78, 1], outputRange: ['8deg', '-26deg', '-22deg', '8deg'] });
  const armLiftR = t.interpolate({ inputRange: [0, 0.4, 0.78, 1], outputRange: ['-8deg', '26deg', '22deg', '-8deg'] });
  const headBob = t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, -size * 0.02, 0] });

  const STRIPES = ['#1E50C8', '#E0263A', '#1E50C8', '#E0263A', '#1E50C8'];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Jersey (behind the head) */}
      <Animated.View
        style={{
          position: 'absolute',
          top: size * 0.16,
          transform: [{ translateY: jerseyY }, { scaleX: jerseyScaleX }, { scaleY: jerseyScaleY }],
        }}
      >
        {/* sleeves */}
        <View style={{ position: 'absolute', left: -size * 0.08, top: size * 0.02, width: size * 0.16, height: size * 0.14, backgroundColor: '#1E50C8', borderRadius: 6, transform: [{ rotate: '24deg' }] }} />
        <View style={{ position: 'absolute', right: -size * 0.08, top: size * 0.02, width: size * 0.16, height: size * 0.14, backgroundColor: '#E0263A', borderRadius: 6, transform: [{ rotate: '-24deg' }] }} />
        {/* body with vertical stripes */}
        <View style={{ width: bodyW, height: bodyH, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', borderWidth: 2, borderColor: 'rgba(0,0,0,0.18)' }}>
          {STRIPES.map((c, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: c }} />
          ))}
          {/* collar notch */}
          <View style={{ position: 'absolute', top: 0, alignSelf: 'center', width: bodyW * 0.28, height: bodyH * 0.12, backgroundColor: '#F2F4F8', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }} />
          {/* number */}
          <View style={StyleSheet.absoluteFill as any}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: bodyH * 0.5, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3 }}>10</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Arms reaching up behind the head to hold the jersey */}
      <Animated.View style={{ position: 'absolute', left: size * 0.2, top: size * 0.44, width: size * 0.1, height: size * 0.3, backgroundColor: '#E8B58A', borderRadius: size * 0.05, transformOrigin: 'bottom', transform: [{ rotate: armLiftL }] }} />
      <Animated.View style={{ position: 'absolute', right: size * 0.2, top: size * 0.44, width: size * 0.1, height: size * 0.3, backgroundColor: '#E8B58A', borderRadius: size * 0.05, transformOrigin: 'bottom', transform: [{ rotate: armLiftR }] }} />

      {/* Head (front) */}
      <Animated.View style={{ position: 'absolute', top: size * 0.28, alignItems: 'center', transform: [{ translateY: headBob }] }}>
        {/* hair */}
        <View style={{ width: headSize * 1.04, height: headSize * 0.6, backgroundColor: '#2A2118', borderTopLeftRadius: headSize, borderTopRightRadius: headSize, marginBottom: -headSize * 0.42, zIndex: 2 }} />
        {/* face */}
        <View style={{ width: headSize, height: headSize, borderRadius: headSize / 2, backgroundColor: '#F0C19B', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', gap: headSize * 0.18, marginTop: headSize * 0.18 }}>
            <View style={{ width: headSize * 0.1, height: headSize * 0.12, borderRadius: headSize * 0.05, backgroundColor: '#2A2118' }} />
            <View style={{ width: headSize * 0.1, height: headSize * 0.12, borderRadius: headSize * 0.05, backgroundColor: '#2A2118' }} />
          </View>
          {/* determined smile */}
          <View style={{ width: headSize * 0.38, height: headSize * 0.18, borderBottomLeftRadius: headSize * 0.2, borderBottomRightRadius: headSize * 0.2, borderWidth: headSize * 0.05, borderTopWidth: 0, borderColor: '#7A4B2B', marginTop: headSize * 0.08 }} />
        </View>
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
export function EmoteSticker({ id, size }: { id: string; size: number }) {
  const meta = getEmote(id);
  if (!meta) return null;
  if (meta.kind === 'animated') {
    if (id === 'jersey10') return <JerseyLiftEmote size={size} />;
    if (id === 'goal') return <GoalEmote size={size} />;
    if (id === 'champion') return <ChampionEmote size={size} />;
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
