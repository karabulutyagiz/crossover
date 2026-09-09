import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { currentLang, t, type MessageKey } from '../i18n';
import { useDeadline } from '../performance/useDeadline';
import { OutlinedText, Plate } from './primitives';
import { F, mh, mk, SIDE, SW } from './tokens';

// Reuse the existing localized football facts, not the gameplay loading tips.
const TIPS: MessageKey[] = [
  'fact.1', 'fact.2', 'fact.3', 'fact.4', 'fact.5',
  'fact.6', 'fact.7', 'fact.8', 'fact.9', 'fact.10',
  'fact.11', 'fact.12', 'fact.13', 'fact.14', 'fact.15',
  'fact.16', 'fact.17', 'fact.18', 'fact.19', 'fact.20',
];
type Eta = { seconds: number; at: number } | null;

const SearchLens = memo(function SearchLens({ moving }: { moving: boolean }) {
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!moving) { sweep.setValue(0); return; }
    const step = (toValue: number) => Animated.timing(sweep, { toValue, duration: 1150, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [moving, sweep]);
  return <Animated.View style={{ width: 68, height: 82, transform: [
    { rotate: sweep.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '7deg'] }) },
    { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-2, 2] }) },
  ] }}>
    <Svg width="100%" height="100%" viewBox="0 0 80 96">
      <Defs>
        <LinearGradient id="homeSearchGlass" x1="0" y1="0" x2="1" y2="1"><Stop stopColor="#FFFFFF" /><Stop offset="0.5" stopColor="#BAE7FF" /><Stop offset="1" stopColor="#71A8D3" /></LinearGradient>
        <LinearGradient id="homeSearchMetal"><Stop stopColor="#F7FAFF" /><Stop offset="0.55" stopColor="#91A3B8" /><Stop offset="1" stopColor="#E3ECFA" /></LinearGradient>
        <LinearGradient id="homeSearchWood"><Stop stopColor="#E8B16C" /><Stop offset="0.55" stopColor="#AE703B" /><Stop offset="1" stopColor="#603B25" /></LinearGradient>
      </Defs>
      <G transform="rotate(-36 59 69)"><Rect x="51" y="49" width="17" height="42" rx="5" fill="url(#homeSearchWood)" stroke="#14233D" strokeWidth="3" /><Path d="M56 57V83" stroke="#F3C996" strokeWidth="2" opacity="0.65" /></G>
      <Circle cx="32" cy="33" r="28" fill="url(#homeSearchMetal)" stroke="#10223D" strokeWidth="3" />
      <Circle cx="32" cy="33" r="22" fill="url(#homeSearchGlass)" stroke="#5C789B" strokeWidth="2" />
      <Path d="M17 28Q20 14 35 16" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
      <Ellipse cx="42" cy="21" rx="4" ry="6" fill="#FFFFFF" transform="rotate(-30 42 21)" />
    </Svg>
  </Animated.View>;
});

const EtaLabel = memo(function EtaLabel({ eta }: { eta: NonNullable<Eta> }) {
  const left = useDeadline(eta.at + eta.seconds * 1000);
  return <Text style={s.eta}>{left > 0 ? t('searching.eta', { s: String(left) }) : t('searching.etaNow')}</Text>;
});

const Tip = memo(function Tip({ moving }: { moving: boolean }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const fade = useRef(new Animated.Value(1)).current;
  const nextTip = useCallback(() => {
    // Every tap advances once, including rapid taps; only the visual fade restarts.
    fade.stopAnimation();
    setIndex((value) => (value + 1) % TIPS.length);
    fade.setValue(moving ? 0.35 : 1);
    if (moving) Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true, isInteraction: false }).start();
  }, [fade, moving]);
  useEffect(() => {
    if (!moving) { fade.setValue(1); return; }
    // A manual advance gives the new fact a full reading interval.
    const id = setTimeout(nextTip, 6500);
    return () => clearTimeout(id);
  }, [moving, fade, nextTip, index]);
  useEffect(() => () => fade.stopAnimation(), [fade]);
  return <Pressable testID="search-next-fact" accessibilityRole="button" accessibilityLabel={`${t('searching.didYouKnow')}. ${t(TIPS[index]!)}`} accessibilityHint={t('searching.nextFact')} onPress={nextTip} style={s.tip}>
    <Text style={s.tipTitle}>{t('searching.didYouKnow')}</Text>
    <Animated.Text style={[s.tipBody, { opacity: fade }]}>{t(TIPS[index]!)}</Animated.Text>
  </Pressable>;
});

export function HomeSearchOverlay({ searching, progress, moving, eta, onCancel }: {
  searching: boolean; progress: Animated.Value; moving: boolean; eta: Eta; onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const cancel = currentLang() === 'tr' ? 'İptal' : t('searching.cancel');
  const opacity = progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, 1] });
  return <View pointerEvents={searching ? 'box-none' : 'none'} accessibilityElementsHidden={!searching} importantForAccessibility={searching ? 'auto' : 'no-hide-descendants'} style={StyleSheet.absoluteFill}>
    <Animated.View pointerEvents="none" style={[s.header, { top: insets.top + mh(54), opacity, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }]}>
      <View accessible accessibilityRole="header" accessibilityLabel={t('searching.header')} style={s.headingPlate}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.headingRow}>
          <SearchLens moving={moving} />
          <View style={{ flex: 1 }}>
            <OutlinedText size={mh(64)} width={mk(4)} color="#FFD14C" outline="#162139" align="left" numberOfLines={2} fit fitWidth={SW - SIDE * 2 - 92}>
              {currentLang() === 'tr' ? 'Rakip\nAranıyor...' : `${t('searching.header')}...`}
            </OutlinedText>
          </View>
        </View>
      </View>
      <View style={s.etaSlot}>{eta ? <EtaLabel eta={eta} /> : null}</View>
    </Animated.View>
    <Animated.View pointerEvents="box-none" style={[s.footer, { bottom: Math.max(insets.bottom, 16) + mh(18), opacity, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [55, 0] }) }] }]}>
      <Pressable testID="matchmaking-cancel" accessibilityRole="button" accessibilityLabel={cancel} onPress={onCancel} disabled={!searching} style={({ pressed }) => [{ width: mh(420), maxWidth: '75%', minWidth: 180, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Plate face="#F4424D" top="#FFABAB" lip="#AB1830" outline="#57213A" radius={mh(26)} outlineWidth={3} lipHeight={6} inner={{ minHeight: 64, justifyContent: 'center', alignItems: 'center' }}>
            <OutlinedText size={mh(68)} width={mk(4)} outline="#7D1627">{cancel}</OutlinedText>
          </Plate>
        </View>
      </Pressable>
      <Tip moving={moving} />
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  header: { position: 'absolute', left: SIDE, right: SIDE, alignItems: 'center' },
  headingPlate: { width: '100%', borderRadius: 12, backgroundColor: '#23374D', borderWidth: 2, borderColor: '#5D81A6', borderBottomColor: '#132039' },
  headingRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 12, gap: 8, paddingVertical: 3 },
  etaSlot: { minHeight: 26, marginTop: 9 },
  eta: { color: '#D7ECFF', fontSize: 12, fontFamily: 'Poppins-SemiBold', textAlign: 'center' },
  footer: { position: 'absolute', left: SIDE, right: SIDE, alignItems: 'center', gap: mh(66) },
  tip: { alignSelf: 'stretch', minHeight: 100, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 14, backgroundColor: '#99C4F0', borderRadius: 10, borderWidth: 2, borderColor: '#5387BE' },
  tipTitle: { position: 'absolute', top: -13, alignSelf: 'center', color: '#FFFFFF', fontFamily: F.title, fontSize: 22, textShadowColor: '#173964', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },
  tipBody: { textAlign: 'center', color: '#153354', fontFamily: 'Poppins-SemiBold', fontSize: 14, lineHeight: 20 },
});
