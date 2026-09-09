import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { t, type MessageKey } from './i18n';
import { openingProgress } from './openingState';
import { warmOpeningAssets } from './openingAssets';

const ART = require('../assets/opening/crossover-arena-v1.png');
const TIPS: MessageKey[] = ['loading.tip1', 'loading.tip2', 'loading.tip3', 'loading.tip4'];
const NATIVE_COLOR = '#0B1838';

type OpeningProps = {
  onDone?: () => void;
  fontsReady?: boolean;
  bootReady?: boolean;
  onFirstFrameReady?: () => void;
  showStudio?: boolean;
  tipIndex?: number;
  blockedMessage?: string;
};

/** One mounted scene owns studio → arena → ready. No video or per-frame JS work. */
export function GameOpening({ onDone, fontsReady = true, bootReady = true, onFirstFrameReady,
  showStudio = true, tipIndex = 0, blockedMessage }: OpeningProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [laidOut, setLaidOut] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [artReady, setArtReady] = useState(false);
  const [homeArtReady, setHomeArtReady] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [arenaVisible, setArenaVisible] = useState(!showStudio);
  const [minimumShown, setMinimumShown] = useState(false);
  const [complete, setComplete] = useState(false);
  const studioOpacity = useRef(new Animated.Value(showStudio ? 1 : 0)).current;
  const arenaOpacity = useRef(new Animated.Value(showStudio ? 0 : 1)).current;
  const signature = useRef(new Animated.Value(0)).current;
  const artScale = useRef(new Animated.Value(1.025)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const kit = useRef(new Animated.Value(0)).current;
  const callbacks = useRef({ onDone, onFirstFrameReady });
  callbacks.current = { onDone, onFirstFrameReady };
  const firstFrameSent = useRef(false);
  const barWidth = Math.min(width - 56, 430);
  const innerWidth = barWidth - 10;
  // Anchor beneath the wordmark baked into the 841×1870 artwork, including
  // contentFit="cover" cropping on different screen aspect ratios.
  const artRatio = Math.max(width / 841, height / 1870);
  const creditTop = (height - 1870 * artRatio) / 2 + 865 * artRatio;
  const tip = TIPS[Math.abs(Math.floor(tipIndex)) % TIPS.length]!;

  useEffect(() => {
    let alive = true;
    setHomeArtReady(false);
    // Warm the first menu while the studio/arena are visible. Optional cache
    // failures never lock startup; the menu retains its normal image loading.
    const timer = setTimeout(() => { if (alive) setHomeArtReady(true); }, 3000);
    warmOpeningAssets(tipIndex).catch(() => {}).finally(() => {
      clearTimeout(timer);
      if (alive) setHomeArtReady(true);
    });
    return () => { alive = false; clearTimeout(timer); };
  }, [tipIndex]);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (alive) setReduceMotion(value);
    }).catch(() => { if (alive) setReduceMotion(true); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);

  useEffect(() => {
    if (!laidOut || !fontsReady || firstFrameSent.current) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        firstFrameSent.current = true;
        callbacks.current.onFirstFrameReady?.();
        setHandedOff(true);
      });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [fontsReady, laidOut]);

  useEffect(() => {
    if (!arenaVisible || artReady || artFailed) return;
    // A damaged asset must not trap a player on the launch screen.
    const timer = setTimeout(() => setArtFailed(true), 4500);
    return () => clearTimeout(timer);
  }, [arenaVisible, artReady, artFailed]);

  useEffect(() => {
    if (!handedOff || !fontsReady || reduceMotion === null || arenaVisible) return;
    // Start AFTER native handoff, never spend the signature behind LaunchScreen.
    signature.setValue(0);
    const intro = Animated.sequence([
      Animated.delay(180),
      Animated.timing(signature, { toValue: 1, duration: reduceMotion ? 0 : 2250, easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(reduceMotion ? 1500 : 450),
    ]);
    intro.start(({ finished }) => { if (finished) setArenaVisible(true); });
    return () => intro.stop();
  }, [handedOff, fontsReady, reduceMotion, arenaVisible, signature]);

  useEffect(() => {
    if (!arenaVisible || reduceMotion === null) return;
    const reveal = Animated.sequence([
      Animated.timing(studioOpacity, { toValue: 0, duration: reduceMotion ? 100 : 220, useNativeDriver: true }),
      Animated.delay(showStudio ? 80 : 0),
      Animated.parallel([
        Animated.timing(arenaOpacity, { toValue: 1, duration: reduceMotion ? 100 : 420, useNativeDriver: true }),
        Animated.timing(artScale, { toValue: 1, duration: reduceMotion ? 0 : 1250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]);
    reveal.start();
    return () => reveal.stop();
  }, [arenaVisible, reduceMotion, showStudio, studioOpacity, arenaOpacity, kit, artScale]);

  useEffect(() => {
    if (!arenaVisible || reduceMotion === null) return;
    const reveal = Animated.timing(kit, { toValue: 1, duration: reduceMotion ? 100 : 500, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    reveal.start();
    const timer = setTimeout(() => setMinimumShown(true), showStudio ? 1650 : 600);
    return () => { reveal.stop(); clearTimeout(timer); };
  }, [arenaVisible, reduceMotion, showStudio, kit]);

  const canFinish = fontsReady && (artReady || artFailed) && homeArtReady && bootReady && minimumShown && !blockedMessage;
  useEffect(() => {
    if (!canFinish) return;
    setComplete(true);
    const timer = setTimeout(() => callbacks.current.onDone?.(), 440);
    return () => clearTimeout(timer);
  }, [canFinish]);

  const progress = openingProgress({ fontsReady, artReady: (artReady || artFailed) && homeArtReady, bootReady, complete: complete && canFinish, blocked: Boolean(blockedMessage) });
  useEffect(() => {
    if (!arenaVisible) return;
    const animation = Animated.timing(fill, { toValue: progress, duration: reduceMotion ? 0 : 380, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, fill, arenaVisible]);

  return (
    <View style={styles.root} onLayout={() => setLaidOut(true)} testID="game-opening">
      <Animated.View style={[StyleSheet.absoluteFill, { width, height, opacity: arenaOpacity, transform: [{ scale: artScale }] }]}>
        <Image source={ART} style={{ width, height }} contentFit="cover" transition={0}
          priority="high" onDisplay={() => setArtReady(true)} onError={(event) => {
            if (__DEV__) console.warn('[opening] Artwork could not be displayed:', event.error);
            setArtFailed(true);
          }} accessible={false} />
        <View style={[styles.creditBlock, { top: creditTop }]} accessible accessibilityLabel="Developed by Miav Studios">
          <Text style={styles.developedBy}>DEVELOPED BY</Text>
          <Text style={styles.credit}>MIAV STUDIOS</Text>
        </View>
      </Animated.View>
      {artFailed && !artReady ? <View style={styles.fallback}><Text style={styles.fallbackTitle}>CROSSOVER</Text></View> : null}
      <View accessible accessibilityLabel="Crossover" style={styles.brandAccessibility} />

      <Animated.View style={[styles.loadingKit, { width: barWidth, bottom: Math.max(insets.bottom + 25, height * 0.075), opacity: kit,
        transform: [{ translateY: kit.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
        <Text style={styles.loadingLabel} accessibilityLiveRegion="polite">{blockedMessage || t('common.loading')}</Text>
        <View style={[styles.barFrame, { width: barWidth }]} accessibilityRole="progressbar"
          accessibilityLabel={t('common.loading')} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} testID="opening-progress">
          <View style={styles.barWell}>
            <Animated.View style={[styles.barFill, { width: innerWidth, transform: [{ translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-innerWidth, 0] }) }] }]}>
              <Svg width="100%" height="100%">
                <Defs><LinearGradient id="openingGold" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFF395" /><Stop offset="0.46" stopColor="#FFD343" />
                  <Stop offset="0.49" stopColor="#F8B923" /><Stop offset="1" stopColor="#ED9B0A" />
                </LinearGradient></Defs>
                <Rect width="100%" height="100%" fill="url(#openingGold)" />
              </Svg>
              <View style={styles.fillHighlight} /><View style={styles.fillLip} />
            </Animated.View>
          </View>
        </View>
        <Text style={styles.tip} numberOfLines={3}>{t(tip)}</Text>
      </Animated.View>

      {showStudio ? <Animated.View pointerEvents={arenaVisible ? 'none' : 'auto'}
        accessibilityElementsHidden={arenaVisible} importantForAccessibility={arenaVisible ? 'no-hide-descendants' : 'auto'}
        style={[StyleSheet.absoluteFill, styles.studio, { opacity: studioOpacity }]} testID="miav-studio-opening">
        <Animated.View style={[styles.studioLockup, { transform: [{ scale: reduceMotion ? 1 : signature.interpolate({ inputRange: [0, 0.13, 0.29, 0.46, 1], outputRange: [1, 0.97, 1.045, 1, 1] }) }] }]} accessible accessibilityLabel="Miav Studios">
          <Text style={styles.studioName}>MIAV</Text>
          <View style={styles.ruleStage}>
            <Animated.View style={[styles.studioRule, { transform: [{ scaleX: reduceMotion ? 1 : signature.interpolate({ inputRange: [0, 0.16, 0.34, 0.6, 1], outputRange: [1, 1, 3.4, 2.6, 2.6] }) }] }]} />
            {!reduceMotion ? ([-1, 1] as const).map(side => <Animated.View key={side} style={[styles.signatureLight, {
              backgroundColor: side < 0 ? '#57CFFF' : '#FFD76C',
              opacity: signature.interpolate({ inputRange: [0, 0.05, 0.24, 0.38, 1], outputRange: [0, 0.9, 1, 0, 0] }),
              transform: [
                { translateX: signature.interpolate({ inputRange: [0, 0.26, 0.4, 1], outputRange: [side * 125, 0, -side * 18, -side * 18] }) },
                { scaleX: signature.interpolate({ inputRange: [0, 0.2, 0.3, 1], outputRange: [0.35, 1.6, 0.25, 0.25] }) },
              ],
            }]} />) : null}
          </View>
          <Text style={styles.studioSubtitle}>S T U D I O S</Text>
          <Animated.Text style={[styles.studioPromise, {
            opacity: signature.interpolate({ inputRange: [0, 0.57, 0.78, 1], outputRange: [0, 0, 1, 1] }),
            transform: [{ translateY: reduceMotion ? 0 : signature.interpolate({ inputRange: [0, 0.57, 0.78, 1], outputRange: [5, 5, 0, 0] }) }],
          }]}>Good Games. Brighter Days.</Animated.Text>
          <Animated.View pointerEvents="none" style={[styles.signatureDiamond, {
            opacity: reduceMotion ? 0 : signature.interpolate({ inputRange: [0, 0.23, 0.3, 0.62, 1], outputRange: [0, 0, 1, 0, 0] }),
            transform: [{ rotate: '45deg' }, { scale: signature.interpolate({ inputRange: [0, 0.24, 0.36, 1], outputRange: [0.4, 0.4, 1.3, 0.6] }) }],
          }]} />
        </Animated.View>
      </Animated.View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NATIVE_COLOR, overflow: 'hidden', alignItems: 'center' },
  studio: { backgroundColor: NATIVE_COLOR, alignItems: 'center', justifyContent: 'center' },
  studioLockup: { alignItems: 'center', width: 260, height: 144, justifyContent: 'center' },
  studioName: { color: '#FFFFFF', fontSize: 68, lineHeight: 80, fontWeight: '900', includeFontPadding: false },
  ruleStage: { width: 260, height: 3, marginTop: 9, marginBottom: 15, alignItems: 'center', justifyContent: 'center' },
  studioRule: { width: 40, height: 3, backgroundColor: '#F5C451' },
  signatureLight: { position: 'absolute', width: 38, height: 3, borderRadius: 2, shadowColor: '#FFD76C', shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  signatureDiamond: { position: 'absolute', top: 94, width: 9, height: 9, backgroundColor: '#FFF0BD', borderRadius: 1 },
  studioSubtitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '700', includeFontPadding: false },
  studioPromise: { position: 'absolute', top: 166, color: '#B6C4DD', fontSize: 11, fontWeight: '500', letterSpacing: 0.5 },
  loadingKit: { position: 'absolute', alignItems: 'center' },
  loadingLabel: { color: '#FFFFFF', fontFamily: 'Poppins-ExtraBold', fontSize: 15, textAlign: 'center', marginBottom: 10, textShadowColor: '#031027', textShadowRadius: 2, textShadowOffset: { width: 0, height: 2 } },
  barFrame: { height: 31, borderRadius: 8, padding: 3, borderWidth: 2, borderColor: '#03122F', backgroundColor: '#6883AB', shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.65, shadowRadius: 0 },
  barWell: { flex: 1, backgroundColor: '#102348', borderRadius: 3, overflow: 'hidden' },
  barFill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 3, overflow: 'hidden' },
  fillHighlight: { position: 'absolute', top: 1, left: 2, right: 2, height: 2, backgroundColor: '#FFFAC6', opacity: 0.8 },
  fillLip: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#C37A05' },
  tip: { color: '#DEE9FB', fontFamily: 'Poppins-SemiBold', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 17, minHeight: 54, paddingHorizontal: 10 },
  creditBlock: { position: 'absolute', alignSelf: 'center', alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(5, 23, 55, 0.72)' },
  developedBy: { color: '#DCE9FB', fontSize: 8, fontWeight: '600', letterSpacing: 2.4 },
  credit: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  fallback: { ...StyleSheet.absoluteFillObject, backgroundColor: NATIVE_COLOR, alignItems: 'center', justifyContent: 'center' },
  fallbackTitle: { color: '#FFFFFF', fontFamily: 'Poppins-Black', fontSize: 36 },
  brandAccessibility: { position: 'absolute', top: '25%', width: 1, height: 1 },
});
