// Emote system: a small Clash-Royale-style catalog of in-match reaction stickers.
//
// Free emotes (owned by everyone) are simple text bubbles with an icon. Premium
// emotes are sold in the store and rendered as looping RN-`Animated` stickers —
// no GIF/sprite assets and no extra native deps, so they run fine in Expo Go.
// Keep these ids in sync with server/src/game/emotes.ts.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image as RNImage, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import type { ComponentProps } from 'react';
import { theme, engrave } from './theme';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import type { ProfileView } from './protocol';
import cryingEmoji from './cryingEmoji';
import angryEmoji from './angryEmoji';
import smileEmoji from './smileEmoji';
import okEmoji from './okEmoji';
import logoEmoji from './logoEmoji';
import ballEmoji from './ballEmoji';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Local copy of the kit's darken() (screens.tsx imports this module, so importing
// it back from there would create a require cycle).
function darkenHex(hex: string, amt = 0.34): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export interface EmoteMeta {
  id: string;
  kind: 'text' | 'animated' | 'face' | 'lottie' | 'lottieJson';
  phrase?: string; // static caption (premium emotes); prefer phraseKey for i18n
  phraseKey?: MessageKey; // i18n key — resolved at render time so it follows language changes
  icon?: IoniconName; // text + generic animated emotes
  expr?: 'smile' | 'cry' | 'angry' | 'ok'; // face emotes: which expression to draw
  color: string;
  week?: number; // visual emotes: which weekly store drop it belongs to
  premium?: { name: string; price: number; desc: string };
  anim?: number; // 'lottie' emotes: the bundled animated WebP (require result)
  animJson?: object;
  still?: number;            // static preview (require result) shown when the emote must not animate
  previewProgress?: number;  // lottieJson static-preview frame (0..1) — for anims whose frame 0 is blank
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
  { id: 'smile', kind: 'lottieJson', color: theme.accent, animJson: smileEmoji },
  { id: 'cry', kind: 'lottieJson', color: theme.blue, animJson: cryingEmoji },
  { id: 'angry', kind: 'lottieJson', color: theme.danger, animJson: angryEmoji },
  { id: 'ok', kind: 'lottieJson', color: theme.primary, animJson: okEmoji },
];

// All free (always-available) emotes = quick-chat text + the 4 character faces.
export const FREE_EMOTES: EmoteMeta[] = [...TEXT_EMOTES, ...FACE_EMOTES];

export const PREMIUM_EMOTES: EmoteMeta[] = [
  // Zıplayan Top — bouncing-ball Lottie premium emote (weekly drop 1). previewProgress:1
  // shows the settled final frame as a static preview (this animation's frame 0 is blank).
  { id: 'ball', kind: 'lottieJson', color: theme.gold, week: 1, animJson: ballEmoji, previewProgress: 1,
    premium: { name: 'Zıplayan Top', price: 300, desc: 'Top sekiyor, rakip şaşırıyor!' } },
  // Mağazada satılan diğer ifadeler — vitrin yalnız 3 ürün, hepsi tek bölümde.
  { id: 'footballer', kind: 'lottie', phrase: '', color: theme.primary, week: 1, anim: require('../assets/emotes/footballer.webp'), still: require('../assets/emotes/still-footballer.png'),
    premium: { name: 'Futbolcu', price: 250, desc: '' } },
  { id: 'kick', kind: 'lottie', phrase: '', color: theme.blue, week: 1, anim: require('../assets/emotes/kick.webp'), still: require('../assets/emotes/still-kick.png'),
    premium: { name: 'Şut!', price: 250, desc: '' } },
  { id: 'squad', kind: 'lottie', phrase: '', color: theme.accent, week: 1, anim: require('../assets/emotes/squad.webp'), still: require('../assets/emotes/still-squad.png'),
    premium: { name: 'Kadro', price: 300, desc: '' } },
  { id: 'pitch', kind: 'lottie', phrase: '', color: theme.purple, week: 1, anim: require('../assets/emotes/pitch.webp'), still: require('../assets/emotes/still-pitch.png'),
    premium: { name: 'Taktik Tahtası', price: 300, desc: '' } },
  { id: 'euro2024', kind: 'lottieJson', phrase: '', color: theme.gold, week: 1, animJson: logoEmoji,
    premium: { name: 'EURO 2024', price: 500, desc: '' } },
  { id: 'diez_jersey_raise', kind: 'lottie', phrase: '', color: theme.gold, week: 2, anim: require('../assets/emotes/diez-jersey-raise.webp'), still: require('../assets/emotes/still-diez-jersey-raise.png'),
    premium: { name: 'El Diez Forma', price: 500, desc: '' } },
];

// Animated emotes (rendered from the downloaded Lottie files into looping WebPs).
// NOT sold in the store (no `premium`, never in emoteWeeks) — added to the emote
// system and granted to specific accounts. Keep ids in sync with
// server/src/game/emotes.ts (ANIM_EMOTES).
// phrase intentionally empty — animated emotes are shown as just the animation, no caption.
// `still`: ilk kareden üretilmiş GERÇEK PNG (assets/emotes/still-*.png).
// Duraklatılmış WebP hiçbir çizim yolunda güvenilir donmuyor (yeni mimaride
// RN Image bile animasyonu oynatabiliyor — dünya kupasının ışınları dönmeye
// devam ediyordu); PNG'nin ise oynayacak karesi yok. Garanti durağan.
export const ANIM_EMOTES: EmoteMeta[] = [
  // Satılmayan (yalnız bahşedilen) ifadeler.
  { id: 'worldcup',   kind: 'lottie', phrase: '', color: theme.gold,    anim: require('../assets/emotes/worldcup.webp'),   still: require('../assets/emotes/still-worldcup.png') },
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
// + the 4 character faces (HERKESTE, slota eklense de eklenmese de) + the equipped
// sticker loadout. Slottaki yüzler filtrelenir ki panelde iki kez görünmesinler.
export function loadoutEmotes(profile: ProfileView | null): EmoteMeta[] {
  const faceIds = new Set(FACE_EMOTES.map((e) => e.id));
  const equipped = (profile?.equippedEmotes ?? [])
    .map((id) => getEmote(id))
    .filter((e): e is EmoteMeta => Boolean(e) && !faceIds.has(e!.id));
  return [...TEXT_EMOTES, ...FACE_EMOTES, ...equipped];
}

// Owned emotes (for the store / inventory ownership display).
export function availableEmotes(profile: ProfileView | null): EmoteMeta[] {
  return ALL.filter((e) => ownsEmote(profile, e.id));
}

// ============================ The animated stickers ============================

// The 4 character emotes (smiling / crying / angry / OK-sign), drawn with plain RN
// Views + a gentle bob/tilt loop — no assets, runs in Expo Go.
function FaceEmote({ size, expr, play = true }: { size: number; expr: 'smile' | 'cry' | 'angry' | 'ok'; play?: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!play) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a, play]);
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

// Animated-WebP sticker (the `lottie` kind). Duraklatılmış hal, animasyonlu
// WebP'nin HİÇBİR çizim yoluna emanet edilmez (expo-image autoplay={false},
// stopAnimating(), hatta RN Image — yeni mimaride hepsi kareyi oynatabiliyor;
// dünya kupasının ışınları kesintiden sonra dönmeye devam ediyordu). Bunun
// yerine ilk kareden üretilmiş gerçek PNG (`still`) gösterilir — oynayacak
// karesi olmayan görsel garantili durağandır.
function WebpSticker({ source, still, size, play }: { source: number; still?: number; size: number; play: boolean }) {
  if (!play) {
    return <RNImage source={still ?? source} style={{ width: size, height: size }} resizeMode="contain" />;
  }
  return <ExpoImage source={source} style={{ width: size, height: size }} contentFit="contain" autoplay />;
}

// ---- Ön ısıtma: animasyonlu WebP çıkartmaları -------------------------------
// 250-470KB'lik animasyonlu WebP'ler İLK kullanımda decode ediliyordu: rakibin
// emote'u tahmin ekranına düşünce decode pop-in yayıyla yarışıyor, emote paneli
// de açılış yayı sırasında tüm çıkartmaları birden çözüyordu. Bu katman 5 WebP'yi
// (rakip hangisine sahipse gelsin diye HEPSİNİ) görünmezce, EmoteCallout'un
// GERÇEK boyutunda oynatıp expo-image bellek önbelleğine çözer — 1x1 ısıtma işe
// yaramaz, expo-image decode'u görünüm boyutuna küçültür. Oturum başına bir kez
// koşar. Sayaç ekranı gibi KISA ÖMÜRLÜ, maç öncesi sakin bir yere monte edilir
// (CountdownScreen); yanlış bir yere monte edilse bile süresiz gizli döngüye
// dönüşmesin diye kendini birkaç saniyede söndürür (arka plan animasyon yasağı).
let emotesWarmed = false;
const WARM_SIZE = 88; // EmoteCallout'un varsayılan sticker boyutuyla AYNI kalmalı
export function EmoteWarmup() {
  const [active, setActive] = useState(() => !emotesWarmed);
  useEffect(() => {
    if (!active) return;
    emotesWarmed = true;
    // Decode toplamda birkaç yüz ms sürer; 6sn her cihaza yeter. Sonra katman
    // kendini kaldırır — çözülmüş kareler expo-image bellek önbelleğinde kalır.
    const id = setTimeout(() => setActive(false), 6000);
    return () => clearTimeout(id);
  }, [active]);
  if (!active) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: WARM_SIZE, height: WARM_SIZE, opacity: 0, overflow: 'hidden' }}>
      {[...PREMIUM_EMOTES, ...ANIM_EMOTES]
        .filter((e) => e.kind === 'lottie' && e.anim != null)
        .map((e) => (
          <ExpoImage key={e.id} source={e.anim} style={{ width: WARM_SIZE, height: WARM_SIZE }} contentFit="contain" autoplay />
        ))}
    </View>
  );
}

export function EmoteSticker({ id, size, play = true, loop = false, onFinish }: {
  id: string; size: number; play?: boolean; loop?: boolean; onFinish?: () => void;
}) {
  const meta = getEmote(id);
  if (!meta) return null;
  if (meta.kind === 'face') return <FaceEmote size={size} expr={meta.expr ?? 'smile'} play={play} />;
  if (meta.kind === 'lottieJson' && meta.animJson) {
    if (!play) {
      return <LottieView source={meta.animJson as any} autoPlay={false} loop={false} progress={meta.previewProgress ?? 0} style={{ width: size, height: size }} />;
    }
    // loop: mağaza önizlemesi gibi sürekli oynaması gereken yerler (onFinish yok)
    return <LottieView source={meta.animJson as any} autoPlay loop={loop} onAnimationFinish={loop ? undefined : onFinish} style={{ width: size, height: size }} />;
  }
  if (meta.kind === 'lottie' && meta.anim != null) {
    return <WebpSticker source={meta.anim} still={meta.still} size={size} play={play} />;
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
  // LottieJson emotes (cry, angry): square frame, no caption.
  if (meta.kind === 'lottie' || meta.kind === 'lottieJson') {
    return (
      <View style={[styles.callout, { borderRadius: 16, paddingVertical: 8, paddingHorizontal: 8, borderColor: meta.color, borderBottomColor: darkenHex(meta.color) }]}>
        <EmoteSticker id={id} size={size} />
      </View>
    );
  }
  return (
    <View style={[styles.callout, { borderColor: meta.color, borderBottomColor: darkenHex(meta.color) }]}>
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
    backgroundColor: theme.panelInk, // opaque ink plate (spec §14 — no translucent surfaces)
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomColor: theme.cardLip,
  },
  calloutText: { fontSize: 14, fontFamily: 'Poppins-ExtraBold', marginTop: 2, ...engrave('sm') },
});
