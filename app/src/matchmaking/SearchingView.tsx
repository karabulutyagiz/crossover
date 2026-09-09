import { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { currentLang, t, type MessageKey } from '../i18n';
import { useDeadline } from '../performance/useDeadline';
import { F } from '../ui2/tokens';
import { OutlinedText, Plate } from '../ui2/primitives';

const STADIUM = require('../../assets/matchmaking/search-stadium.png');
const TIPS: MessageKey[] = ['loading.tip1', 'loading.tip2', 'loading.tip3', 'loading.tip4'];
type Eta = { seconds: number; at: number } | null;

function useMotionEnabled() {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', (value) => setForeground(value === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  return foreground && !reduced;
}

// Crisp native artwork: the ball and lens are different surfaces, not a moving screenshot.
const Football = memo(function Football() {
  return <Svg width="100%" height="100%" viewBox="0 0 260 260">
    <Defs>
      <RadialGradient id="searchBall" cx="34%" cy="22%" r="80%">
        <Stop offset="0" stopColor="#FFFFFF" /><Stop offset="0.5" stopColor="#E5F3FF" />
        <Stop offset="0.85" stopColor="#7E9DBC" /><Stop offset="1" stopColor="#273F61" />
      </RadialGradient>
      <LinearGradient id="searchPanel" x1="0" y1="0" x2="1" y2="1">
        <Stop stopColor="#233B5D" /><Stop offset="1" stopColor="#050F24" />
      </LinearGradient>
    </Defs>
    <Circle cx="130" cy="130" r="121" fill="url(#searchBall)" stroke="#06152C" strokeWidth="5" />
    <G stroke="#536F8B" strokeWidth="2.5" strokeLinejoin="round">
      <Path d="M91 90 167 82 207 140 174 209 96 216 49 158Z M91 90 73 39 M167 82 190 31 M207 140 248 132 M174 209 185 239 M96 216 77 237 M49 158 13 151" fill="none" />
      <Path d="M104 81 154 76 182 119 158 160 108 157 81 117Z" fill="url(#searchPanel)" />
      <Path d="M42 49 73 39 79 72 54 100 17 94Q23 68 42 49Z M190 31 220 53 231 90 204 99 181 72Z M222 167 244 162Q235 200 210 222L184 205 190 177Z M86 224 93 243Q62 232 38 207L48 184 77 189Z" fill="url(#searchPanel)" />
    </G>
    <Path d="M37 91C55 42 101 17 148 22" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
    <Ellipse cx="79" cy="49" rx="22" ry="9" fill="#FFFFFF" opacity="0.55" transform="rotate(-30 79 49)" />
  </Svg>;
});

const Magnifier = memo(function Magnifier() {
  return <Svg width="100%" height="100%" viewBox="0 0 300 300">
    <Defs>
      <LinearGradient id="searchGold" x1="0" y1="0" x2="0.8" y2="1">
        <Stop stopColor="#FFF7C0" /><Stop offset="0.2" stopColor="#FFD454" />
        <Stop offset="0.5" stopColor="#D99719" /><Stop offset="0.8" stopColor="#FFC840" /><Stop offset="1" stopColor="#976017" />
      </LinearGradient>
      <LinearGradient id="searchWood" x1="0" y1="0" x2="1" y2="0">
        <Stop stopColor="#FFC185" /><Stop offset="0.28" stopColor="#C98143" /><Stop offset="0.75" stopColor="#8A4B24" /><Stop offset="1" stopColor="#4F2D1D" />
      </LinearGradient>
      <RadialGradient id="searchLens" cx="32%" cy="24%" r="85%">
        <Stop stopColor="#DDF7FF" stopOpacity="0.22" /><Stop offset="0.6" stopColor="#55BCF4" stopOpacity="0.34" /><Stop offset="1" stopColor="#0B60B0" stopOpacity="0.7" />
      </RadialGradient>
    </Defs>
    <G transform="rotate(-43 217 220)">
      <Rect x="200" y="175" width="36" height="105" rx="10" fill="url(#searchWood)" stroke="#291B16" strokeWidth="5" />
      <Path d="M210 192V264M217 195V264" stroke="#E0A16A" strokeWidth="3" opacity="0.6" />
      <Rect x="198" y="177" width="40" height="16" rx="5" fill="url(#searchGold)" stroke="#6D4510" strokeWidth="3" />
      <Rect x="198" y="265" width="40" height="17" rx="5" fill="url(#searchGold)" stroke="#6D4510" strokeWidth="3" />
    </G>
    <Circle cx="120" cy="118" r="86" fill="none" stroke="#0B1426" strokeWidth="24" />
    <Circle cx="120" cy="116" r="85" fill="none" stroke="url(#searchGold)" strokeWidth="19" />
    <Circle cx="120" cy="116" r="94" fill="none" stroke="#FFE98B" strokeWidth="2" />
    <Circle cx="120" cy="116" r="76" fill="url(#searchLens)" stroke="#795017" strokeWidth="5" />
    <Circle cx="120" cy="116" r="72" fill="none" stroke="#B2E9FF" strokeWidth="2" opacity="0.7" />
    <Path d="M64 73Q87 45 126 49" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" opacity="0.65" />
    <Ellipse cx="137" cy="60" rx="12" ry="8" fill="#FFFFFF" transform="rotate(25 137 60)" opacity="0.94" />
    <Path d="M158 63Q181 78 184 107" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" opacity="0.45" />
  </Svg>;
});

const SearchArtwork = memo(function SearchArtwork({ size, moving }: { size: number; moving: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!moving) { spin.setValue(0); sweep.setValue(0); breathe.setValue(0); return; }
    const timing = (value: Animated.Value, toValue: number, duration: number) => Animated.timing(value, {
      toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false,
    });
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 5400, easing: Easing.linear, useNativeDriver: true, isInteraction: false })),
      Animated.loop(Animated.sequence([timing(sweep, 1, 1700), timing(sweep, 0, 1700)])),
      Animated.loop(Animated.sequence([timing(breathe, 1, 1500), timing(breathe, 0, 1500)])),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [moving, spin, sweep, breathe]);
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.8] }), transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.03] }) }] }]}>
      <Svg width="100%" height="100%" viewBox="0 0 340 340">
        <Defs><RadialGradient id="searchHalo"><Stop stopColor="#79E5FF" stopOpacity="0.7" /><Stop offset="1" stopColor="#138CF8" stopOpacity="0" /></RadialGradient></Defs>
        <Circle cx="170" cy="170" r="168" fill="url(#searchHalo)" />
        <Circle cx="170" cy="170" r="158" fill="none" stroke="#60CFFF" strokeWidth="1.5" opacity="0.4" />
      </Svg>
    </Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
      <Svg width="100%" height="100%" viewBox="0 0 340 340">
        <Circle cx="170" cy="170" r="143" fill="none" stroke="#25A5F4" strokeWidth="3" opacity="0.45" />
        <Circle cx="170" cy="170" r="143" fill="none" stroke="#58DFFF" strokeWidth="5" strokeDasharray="150 120 80 549" strokeLinecap="round" />
        <Circle cx="170" cy="27" r="4" fill="#D8FFFF" />
      </Svg>
    </Animated.View>
    <Animated.View style={{ position: 'absolute', width: '74%', height: '74%', left: '13%', top: '13%', transform: [{ translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [4, -4] }) }, { rotate: breathe.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '3deg'] }) }] }}><Football /></Animated.View>
    <Animated.View style={{ position: 'absolute', width: '85%', height: '85%', left: '15%', top: '17%', transform: [
      { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.045, size * 0.045] }) },
      { translateY: sweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [size * 0.025, -size * 0.025, size * 0.01] }) },
      { rotate: sweep.interpolate({ inputRange: [0, 1], outputRange: ['-9deg', '7deg'] }) },
    ] }}><Magnifier /></Animated.View>
  </View>;
});

const SearchEta = memo(function SearchEta({ eta }: { eta: NonNullable<Eta> }) {
  const seconds = useDeadline(eta.at + eta.seconds * 1000);
  return <Text style={styles.eta}>{seconds > 0 ? t('searching.eta', { s: String(seconds) }) : t('searching.etaNow')}</Text>;
});

const SearchTip = memo(function SearchTip({ moving }: { moving: boolean }) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!moving) { opacity.setValue(1); return; }
    const timer = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true, isInteraction: false }).start(({ finished }) => {
        if (!finished) return;
        setIndex((value) => (value + 1) % TIPS.length);
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true, isInteraction: false }).start();
      });
    }, 6500);
    return () => { clearInterval(timer); opacity.stopAnimation(); };
  }, [moving, opacity]);
  return <View style={styles.tipOuter}>
    <View style={styles.tipInner}>
      <Svg width="44" height="60" viewBox="0 0 44 60" accessible={false}>
        <Path d="M15 41C15 35 6 32 6 20a16 16 0 0 1 32 0c0 12-9 15-9 21Z" fill="#FFD34B" stroke="#102845" strokeWidth="3" />
        <Path d="M16 17Q18 11 24 12" fill="none" stroke="#FFF6BF" strokeWidth="4" strokeLinecap="round" />
        <Path d="M15 41H29V51L23 56 16 52Z" fill="#43B5ED" stroke="#102845" strokeWidth="3" />
        <Path d="M16 46H29M17 51H27" stroke="#102845" strokeWidth="2" />
      </Svg>
      <View style={styles.tipCopy}>
        <Text style={styles.tipTitle}>{t('searching.didYouKnow')}</Text>
        <Animated.Text style={[styles.tipBody, { opacity }]}>{t(TIPS[index]!)}</Animated.Text>
      </View>
    </View>
  </View>;
});

export const SearchingView = memo(function SearchingView({ eta, onCancel }: { eta: Eta; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const [layout, setLayout] = useState({ width: 402, height: 874 });
  const moving = useMotionEnabled();
  const pressed = useRef(new Animated.Value(1)).current;
  const usableHeight = layout.height - insets.top - insets.bottom;
  const artSize = Math.max(130, Math.min(layout.width * 0.88, usableHeight - 465, 390));
  const titleWidth = Math.min(layout.width - 40, 430);
  const cancelLabel = currentLang() === 'tr' ? 'İptal' : t('searching.cancel');
  const press = (scale: number) => Animated.spring(pressed, { toValue: scale, speed: 35, bounciness: 0, useNativeDriver: true, isInteraction: false }).start();
  useEffect(() => () => pressed.stopAnimation(), [pressed]);
  return <View testID="matchmaking-search" style={styles.root} onLayout={({ nativeEvent: { layout: next } }) => {
    setLayout((prev) => prev.width === next.width && prev.height === next.height ? prev : { width: next.width, height: next.height });
  }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Image source={STADIUM} contentFit="cover" style={StyleSheet.absoluteFill} transition={0} />
    </View>
    <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 18) + 16 }]}>
      <View accessible accessibilityRole="header" accessibilityLabel={t('searching.header')} style={{ width: titleWidth }}>
        <Plate face="#1D2B40" top="#6B839C" lip="#0A1629" outline="#0A1429" radius={18} outlineWidth={3} lipHeight={5} inner={styles.headingInner}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {currentLang() === 'tr' ? <>
              <OutlinedText size={40} width={2} outline="#080F1B">Rakip</OutlinedText>
              <OutlinedText size={43} width={2} outline="#080F1B" color="#FFD13F" style={{ marginTop: -7 }}>Aranıyor...</OutlinedText>
            </> : <OutlinedText size={36} width={2} outline="#080F1B" color="#FFD13F" numberOfLines={2} fit fitWidth={titleWidth - 32}>{t('searching.header')}...</OutlinedText>}
          </View>
        </Plate>
      </View>
      <View style={styles.heroZone}>
        <SearchArtwork size={artSize} moving={moving} />
        <View style={styles.etaSlot}>{eta ? <SearchEta eta={eta} /> : null}</View>
      </View>
      <View style={styles.footer}>
        <SearchTip moving={moving} />
        <Animated.View style={[styles.cancelWrap, { transform: [{ scale: pressed }] }]}>
          <Pressable testID="matchmaking-cancel" accessibilityRole="button" accessibilityLabel={cancelLabel} onPress={onCancel} onPressIn={() => press(0.97)} onPressOut={() => press(1)} hitSlop={6}>
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Plate face="#F33C49" top="#FF9C9D" lip="#A20E2A" outline="#420D21" outlineWidth={3} lipHeight={7} radius={16} inner={styles.cancelInner}>
                <View style={styles.cancelShine} />
                <OutlinedText size={38} outline="#771123" width={2}>{cancelLabel}</OutlinedText>
              </Plate>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#061C3D' },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  headingInner: { paddingVertical: 9, paddingHorizontal: 12, minHeight: 106, justifyContent: 'center' },
  heroZone: { flex: 1, minHeight: 160, justifyContent: 'center', alignItems: 'center', paddingVertical: 8 },
  etaSlot: { minHeight: 25, marginTop: 5 },
  eta: { fontFamily: 'Poppins-SemiBold', fontSize: 12, color: '#D7EDFF', textAlign: 'center', textShadowColor: '#062044', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  footer: { width: '100%', maxWidth: 410, alignItems: 'center', gap: 24 },
  tipOuter: { width: '100%', padding: 3, paddingBottom: 7, backgroundColor: '#36516E', borderRadius: 16, borderTopWidth: 2, borderTopColor: '#CEE8FF' },
  tipInner: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 102, borderRadius: 12, backgroundColor: '#A7BED7', paddingVertical: 13, paddingHorizontal: 15 },
  tipCopy: { flex: 1 },
  tipTitle: { fontFamily: F.title, fontSize: 24, color: '#10213A', marginBottom: 4 },
  tipBody: { fontFamily: 'Poppins-SemiBold', fontSize: 15, lineHeight: 21, color: '#1A2E49', minHeight: 63 },
  cancelWrap: { width: '64%', minWidth: 200, maxWidth: 280 },
  cancelInner: { height: 68, alignItems: 'center', justifyContent: 'center' },
  cancelShine: { position: 'absolute', left: 4, right: 4, top: 4, height: 22, borderRadius: 9, backgroundColor: '#FF7F86', opacity: 0.35 },
});
