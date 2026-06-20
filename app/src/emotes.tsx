// Emote system: a small Clash-Royale-style catalog of in-match reaction stickers.
//
// Free emotes (owned by everyone) are simple text bubbles with an icon. Premium
// emotes are sold in the store and rendered as looping RN-`Animated` stickers —
// no GIF/sprite assets and no extra native deps, so they run fine in Expo Go.
// Keep these ids in sync with server/src/game/emotes.ts.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { theme } from './theme';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import type { ProfileView } from './protocol';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface EmoteMeta {
  id: string;
  kind: 'text' | 'animated' | 'face' | 'lottie';
  phrase?: string; // static caption (premium emotes); prefer phraseKey for i18n
  phraseKey?: MessageKey; // i18n key — resolved at render time so it follows language changes
  icon?: IoniconName; // text + generic animated emotes
  expr?: 'smile' | 'cry' | 'angry' | 'ok'; // face emotes: which expression to draw
  color: string;
  week?: number; // visual emotes: which weekly store drop it belongs to
  premium?: { name: string; price: number; desc: string };
  anim?: number; // 'lottie' emotes: the bundled animated WebP (require result)
}

// Resolve an emote's caption at render time (so it follows live language changes).
export function emotePhrase(e: EmoteMeta | undefined | null): string {
  if (!e) return '';
  if (e.phraseKey) return t(e.phraseKey);
  return e.phrase ?? '';
}

// Quick-chat TEXT messages — Clash-Royale style. Sent from the message icon, no emoji.
// Never collectible/equippable; always available in a match as a framed text line.
export const TEXT_EMOTES: EmoteMeta[] = [
  { id: 'gg', kind: 'text', phraseKey: 'emote.gg', icon: 'chatbubble-ellipses', color: theme.primary },
  { id: 'congrats', kind: 'text', phraseKey: 'emote.congrats', icon: 'chatbubble-ellipses', color: theme.accent },
  { id: 'luck', kind: 'text', phraseKey: 'emote.luck', icon: 'chatbubble-ellipses', color: theme.blue },
  { id: 'gotcha', kind: 'text', phraseKey: 'emote.thanks', icon: 'chatbubble-ellipses', color: theme.purple },
];

// The 4 character emotes (Clash-Royale style): smiling / crying / angry / OK-sign.
// Free for everyone, but COLLECTIBLE/EQUIPPABLE into the 6 loadout slots.
export const FACE_EMOTES: EmoteMeta[] = [
  { id: 'smile', kind: 'face', expr: 'smile', phraseKey: 'emote.face.smile', color: theme.accent },
  { id: 'cry', kind: 'face', expr: 'cry', phraseKey: 'emote.face.cry', color: theme.blue },
  { id: 'angry', kind: 'face', expr: 'angry', phraseKey: 'emote.face.angry', color: theme.danger },
  { id: 'ok', kind: 'face', expr: 'ok', phraseKey: 'emote.face.ok', color: theme.primary },
];

// All free (always-available) emotes = quick-chat text + the 4 character faces.
export const FREE_EMOTES: EmoteMeta[] = [...TEXT_EMOTES, ...FACE_EMOTES];

export const PREMIUM_EMOTES: EmoteMeta[] = [
  // No premium emotes currently — add new ones here with price 300.
];

// Animated emotes (rendered from the downloaded Lottie files into looping WebPs).
// NOT sold in the store (no `premium`, never in emoteWeeks) — added to the emote
// system and granted to specific accounts. Keep ids in sync with
// server/src/game/emotes.ts (ANIM_EMOTES).
// phrase intentionally empty — animated emotes are shown as just the animation, no caption.
export const ANIM_EMOTES: EmoteMeta[] = [
  { id: 'footballer', kind: 'lottie', phrase: '', color: theme.primary, anim: require('../assets/emotes/footballer.webp') },
  { id: 'worldcup',   kind: 'lottie', phrase: '', color: theme.gold,    anim: require('../assets/emotes/worldcup.webp') },
  { id: 'kick',       kind: 'lottie', phrase: '', color: theme.blue,    anim: require('../assets/emotes/kick.webp') },
  { id: 'squad',      kind: 'lottie', phrase: '', color: theme.accent,  anim: require('../assets/emotes/squad.webp') },
  { id: 'pitch',      kind: 'lottie', phrase: '', color: theme.purple,  anim: require('../assets/emotes/pitch.webp') },
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

const ALL = [...FREE_EMOTES, ...PREMIUM_EMOTES, ...ANIM_EMOTES];
const BY_ID = new Map(ALL.map((e) => [e.id, e]));

export function getEmote(id: string): EmoteMeta | undefined {
  return BY_ID.get(id);
}

const UNLOCK_ALL_EMOTES = false;

// Free emotes are available to everyone; premium ones must be purchased.
export function ownsEmote(profile: ProfileView | null, id: string): boolean {
  if (UNLOCK_ALL_EMOTES) return Boolean(getEmote(id));
  if (FREE_EMOTES.some((e) => e.id === id)) return true;
  return Boolean(profile?.ownedEmotes?.includes(id));
}

// Emotes the player can currently pick from in a match: the free text quick-chats
// (always) + the equipped sticker loadout (up to MAX_EQUIPPED faces/anim/premium).
// If the player hasn't set up a loadout yet, default the stickers to the 4 faces.
export function loadoutEmotes(profile: ProfileView | null): EmoteMeta[] {
  const equipped = (profile?.equippedEmotes ?? [])
    .map((id) => getEmote(id))
    .filter((e): e is EmoteMeta => Boolean(e));
  const stickers = equipped.length ? equipped : FACE_EMOTES;
  return [...TEXT_EMOTES, ...stickers];
}

// Owned emotes (for the store / inventory ownership display).
export function availableEmotes(profile: ProfileView | null): EmoteMeta[] {
  return ALL.filter((e) => ownsEmote(profile, e.id));
}

// ============================ The animated stickers ============================

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
  if (meta.kind === 'lottie' && meta.anim != null) {
    return <ExpoImage source={meta.anim} style={{ width: size, height: size }} contentFit="contain" autoplay />;
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
  const caption = emotePhrase(meta);
  if (!meta) return null;
  // Quick-chat TEXT phrases ("Good game!"): NOT a round bubble — just the phrase
  // inside a frame sized to the text, Clash-Royale style.
  if (meta.kind === 'text') {
    return <TextEmoteFrame text={caption} color={meta.color} fontSize={17} />;
  }
  // Animated (Lottie) emotes: keep the frame but make it SQUARE (not the rounded
  // pill), and show NO caption — just the looping animation inside.
  if (meta.kind === 'lottie') {
    return (
      <View style={[styles.callout, { borderRadius: 16, paddingVertical: 8, paddingHorizontal: 8, borderWidth: 1.5, borderColor: meta.color }]}>
        <EmoteSticker id={id} size={size} />
      </View>
    );
  }
  return (
    <View style={styles.callout}>
      <EmoteSticker id={id} size={size} />
      {caption ? <Text style={[styles.calloutText, { color: meta.color }]}>{caption}</Text> : null}
    </View>
  );
}

// A framed plain-text emote — the "ÇOK YAKINDA!" speech-bubble style: a white
// rounded bubble with a thick dark outline and bold dark text. The width hugs the
// text. (color is kept for the API but the bubble is uniform white/black.)
export function TextEmoteFrame({ text, fontSize = 16 }: { text: string; color?: string; fontSize?: number }) {
  return (
    <View style={{
      alignSelf: 'flex-start',
      backgroundColor: '#FCFCFC',
      borderRadius: 22,
      borderWidth: 3.5,
      borderColor: '#15171C',
      paddingHorizontal: 18,
      paddingVertical: 10,
      shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 6, shadowOffset: { width: 0, height: 5 }, elevation: 9,
    }}>
      <Text style={{ color: '#15171C', fontFamily: 'Poppins-ExtraBold', fontSize: fontSize + 1, letterSpacing: 0.3 }}>{text}</Text>
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
