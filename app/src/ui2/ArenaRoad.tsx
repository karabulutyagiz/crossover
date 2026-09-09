import { up } from './strings';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useMenuMotion } from './useMenuMotion';
import { Image, useImage } from 'expo-image';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, type MessageKey } from '../i18n';
import type { GameState } from './types';
import { ARENAS, arenaArt, arenaIndexFor } from './products';
import { Bar, ChunkyButton, OutlinedText, fmt } from './primitives';
import { IcGem, IcTrophy } from './icons-ui';
import { IcCheck, IcLock } from './icons';
import { C, F } from './tokens';

const ROAD = ARENAS.map((arena, index) => ({ ...arena, index })).reverse();
const BACKDROP = require('../../assets/ui2/arena-road-backdrop-v2.png');
const ROW_H = 530;
const STAIR_OFFSETS = [-20, -32, -18, 18, 32, 20];

// Decorative links between arena gates, never intermediate reward stops.
// Keep them inside each fixed-height row so centering and rail progress agree.
const ArenaStairs = memo(function ArenaStairs({ reached }: { reached: boolean }) {
  return <Svg pointerEvents="none" accessible={false} width={220} height={110} viewBox="0 0 220 110" style={styles.stairs} testID="arena-link-stairs">
    <Defs><LinearGradient id="stair-top" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={reached ? '#C6ECFF' : '#B4CADA'} />
      <Stop offset=".18" stopColor={reached ? '#9AD7FF' : '#96B0C6'} />
      <Stop offset="1" stopColor={reached ? '#64B4E8' : '#7192AF'} />
    </LinearGradient>
    <LinearGradient id="stair-face" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={reached ? '#387CAA' : '#496A87'} />
      <Stop offset="1" stopColor={reached ? '#1C4B78' : '#2A455F'} />
    </LinearGradient></Defs>
    {STAIR_OFFSETS.map((offset, step) => {
      // Broad overlapping treads form one winding flight, not floating tiles.
      const center = 110 + offset;
      const halfWidth = 41 + step * 2;
      const left = center - halfWidth;
      const right = center + halfWidth;
      const y = 3 + step * 17;
      return <G key={step}>
        <Path d={`M${left + 2} ${y + 15} H${right + 2} V${y + 21} H${left + 2} Z`} fill="#061C36" opacity={.45} />
        <Path d={`M${left} ${y + 12} H${right} V${y + 19} L${left} ${y + 19} Z`} fill="url(#stair-face)" stroke="#18354F" strokeWidth={1.2} />
        <Path d={`M${left + 7} ${y} H${right - 7} L${right} ${y + 12} H${left} Z`} fill="url(#stair-top)" stroke="#3D607F" strokeWidth={1.2} strokeLinejoin="round" />
        <Path d={`M${left + 8} ${y + 1.5} H${right - 8} M${left + 2} ${y + 12} H${right - 2}`} fill="none" stroke={reached ? '#D7F3FF' : '#D3E1EC'} strokeOpacity={.75} strokeWidth={1.2} />
      </G>;
    })}
  </Svg>;
});

function TrophyRail({ height, fillStart }: { height: number; fillStart: number }) {
  return <Svg pointerEvents="none" width={19} height={height} style={styles.rail} testID="arena-trophy-rail">
    <Defs>
      <LinearGradient id="rail-empty" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#3A6288" stopOpacity=".72" />
        <Stop offset=".3" stopColor="#254C72" stopOpacity=".55" />
        <Stop offset="1" stopColor="#102D4E" stopOpacity=".82" />
      </LinearGradient>
      <LinearGradient id="rail-blue" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#82C9FF" /><Stop offset=".32" stopColor="#55B5FC" />
        <Stop offset="1" stopColor="#278AE3" />
      </LinearGradient>
    </Defs>
    {/* One full-road strip, not seven disconnected cylinders. */}
    <Rect width={19} height={height} fill="#051B34" fillOpacity={.8} />
    <Rect x={2} width={13} height={height} fill="url(#rail-empty)" />
    <Rect x={2} y={fillStart} width={13} height={Math.max(0, height - fillStart)} fill="url(#rail-blue)" />
    <Rect x={2} y={fillStart} width={13} height={2} fill="#B7E9FF" />
    <Rect x={2} width={1} height={height} fill="#A5D1EF" opacity={.45} />
    <Rect x={15} width={2} height={height} fill="#6384A6" opacity={.65} />
  </Svg>;
}

function Enamel({ gold = false }: { gold?: boolean }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%" viewBox="0 0 260 54" preserveAspectRatio="none">
    <Defs><LinearGradient id="enamel" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={gold ? '#FFF4B1' : '#517BAA'} /><Stop offset=".12" stopColor={gold ? '#FFE16B' : '#285484'} />
      <Stop offset=".48" stopColor={gold ? '#F5BD39' : '#143866'} /><Stop offset="1" stopColor={gold ? '#B77515' : '#092346'} />
    </LinearGradient></Defs>
    <Path d="M12 3 H248 L258 13 V43 L248 53 H12 L2 43 V13 Z" fill="#03142F" />
    <Path d="M13 1 H247 L256 10 V40 L247 49 H13 L4 40 V10 Z" fill="url(#enamel)" stroke={gold ? '#C9953F' : '#7595B5'} strokeWidth="2" />
    <Path d="M15 5 H245 L251 11" fill="none" stroke={gold ? '#FFF7C6' : '#A9C4DB'} strokeOpacity=".8" strokeWidth="2" />
    <Path d="M10 40 L16 45 H244 L250 39" fill="none" stroke="#031A39" strokeOpacity=".5" strokeWidth="3" />
  </Svg></View>;
}

// There are only seven arena gates. No claim action: rewards are paid once by
// the server on reaching a gate; highestArenaRewarded remains authoritative.
const ArenaGate = memo(function ArenaGate({ index, current, rewarded, trophies, width }: {
  index: number; current: number; rewarded: number; trophies: number; width: number;
}) {
  const arena = ARENAS[index]!;
  const here = index === current;
  const locked = index > current;
  const claimed = index <= rewarded;
  const next = ARENAS[index + 1];
  return <View style={[styles.gate, { width }]} testID={`arena-gate-${arena.key}`}>
    <View pointerEvents="none" style={styles.railMilestone}><View style={styles.railTick} /><Text style={styles.railLabel}>{fmt(arena.min)}</Text></View>
    <Svg pointerEvents="none" width={width} height={260} style={{ position: 'absolute', top: 44 }}>
      <Defs><RadialGradient id="arenaHalo"><Stop offset="0" stopColor={here ? '#5AA9FF' : '#2764B7'} stopOpacity={here ? '.45' : '.18'} /><Stop offset="1" stopColor="#153D75" stopOpacity="0" /></RadialGradient></Defs>
      <Ellipse cx={width / 2} cy={134} rx={width * .48} ry={120} fill="url(#arenaHalo)" />
      <Ellipse cx={width / 2} cy={224} rx={width * .29} ry={17} fill="#001534" opacity=".4" />
    </Svg>
    <View style={styles.heading}>
      <Text style={styles.number}>ARENA {index + 1}</Text>
      <OutlinedText size={25} width={2} numberOfLines={1} fit>{up(t(`arena.${arena.key}` as MessageKey))}</OutlinedText>
    </View>
    <Image source={arenaArt(arena.key)} contentFit="contain" transition={0} accessible={false}
      style={{ position: 'absolute', top: 62, left: (width - Math.min(width * .86, 380)) / 2, width: Math.min(width * .86, 380), height: 224, opacity: locked ? .9 : 1 }} />
    <View style={styles.threshold}>
      <Enamel gold={here} />
      {locked ? <IcLock size={17} /> : <IcTrophy size={22} />}
      <Text style={[styles.thresholdText, here && { color: '#392908' }]}>{fmt(arena.min)}</Text>
      {here ? <View style={styles.here}><Text style={styles.hereText}>{t('arenas.here')}</Text></View> : null}
    </View>
    <View style={styles.reward} testID={`arena-reward-${arena.key}`}>
      <Enamel />
      <IcGem size={35} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rewardLabel}>{t('ui2.arenaReward')}</Text>
        <Text style={styles.rewardAmount}>+{fmt(arena.reward)} <Text style={styles.rewardStatus}>{claimed ? ` · ${t('ui2.rewardTaken')}` : ''}</Text></Text>
      </View>
      {claimed ? <IcCheck size={23} /> : locked ? <IcLock size={19} /> : null}
    </View>
    {here && next ? <View style={styles.progress}>
      <Bar value={Math.max(0, trophies - arena.min)} max={next.min - arena.min} height={8} color={C.gold} />
      <Text style={styles.remaining}>{t('ui2.toNextArena', { n: fmt(Math.max(0, next.min - trophies)) })}</Text>
    </View> : null}
    {index > 0 ? <ArenaStairs reached={!locked} /> : null}
  </View>;
});

export function ArenaRoad({ state, onClose, visible = true }: { state: GameState; onClose: () => void; visible?: boolean }) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const width = Math.min(screenWidth, 480);
  const trophies = Math.max(0, state.profile?.trophies ?? 0);
  const current = arenaIndexFor(trophies);
  const rewarded = state.profile?.highestArenaRewarded ?? 0;
  const list = useRef<FlatList<(typeof ROAD)[number]>>(null);
  const [backdropFailed, setBackdropFailed] = useState(false);
  const retryBackdrop = useRef<(() => void) | null>(null);
  // Keep a decoded native image, not only a hidden Image view / disk-cache entry.
  const backdrop = useImage(BACKDROP, {
    maxWidth: 887,
    onError: (_error, retry) => { retryBackdrop.current = retry; setBackdropFailed(true); },
  });
  const presented = visible && backdrop !== null;
  const { progress: enter, close, reduced } = useMenuMotion(onClose, 'page', presented);
  useEffect(() => {
    if (!visible || !backdropFailed) return;
    onClose();
    Alert.alert(t('arenas.title'), t('arenas.imageLoadError'));
  }, [visible, backdropFailed, onClose]);
  useEffect(() => {
    if (visible || !backdropFailed) return;
    setBackdropFailed(false);
    // Retry once on the next explicit open, not continuously in the background.
  }, [visible, backdropFailed]);
  useEffect(() => {
    if (visible && retryBackdrop.current) {
      const retry = retryBackdrop.current;
      retryBackdrop.current = null;
      retry();
    }
  }, [visible]);
  const footerBottom = Math.max(insets.bottom, 12);
  const viewport = screenHeight - (insets.top + 78) - (60 + footerBottom);
  const rowIndex = ROAD.length - 1 - current;
  // Symmetric end padding lets even the first/last arena sit in the center.
  const roadPadding = Math.max(0, (viewport - ROW_H) / 2);
  const active = ARENAS[current]!;
  const nextActive = ARENAS[current + 1];
  const fraction = nextActive ? Math.min(1, Math.max(0, (trophies - active.min) / (nextActive.min - active.min))) : 0;
  const fillStart = roadPadding + rowIndex * ROW_H + 290 - fraction * ROW_H;
  const offset = rowIndex * ROW_H;
  const initialOffset = useRef({ x: 0, y: offset }).current;
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [close, visible]);
  useEffect(() => {
    // Recenter while hidden; reopening never rebuilds the list.
    if (!visible) list.current?.scrollToOffset({ offset, animated: false });
  }, [visible, offset]);
  const renderItem = useCallback(({ item }: { item: (typeof ROAD)[number] }) =>
    <ArenaGate index={item.index} current={current} rewarded={rewarded} trophies={trophies} width={width} />,
  [current, rewarded, trophies, width]);
  return <Animated.View pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!presented} importantForAccessibility={presented ? 'auto' : 'no-hide-descendants'} accessibilityViewIsModal={presented} onAccessibilityEscape={close} testID="arena-road"
    style={[styles.root, { opacity: presented ? 1 : 0, transform: [{ translateY: reduced ? 0 : enter.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] }) }] }]}>
    <Image source={backdrop} contentFit="cover" transition={0} accessible={false} style={{ position: 'absolute', width: screenWidth, height: screenHeight }} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(2,16,40,.16)' }]} />
    <View style={{ flex: 1 }}>
    <View style={[styles.header, { height: insets.top + 78, paddingTop: insets.top + 10 }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}><OutlinedText size={28} width={2} align="left">{up(t('arenas.title'))}</OutlinedText>
          <View style={styles.balance}><IcTrophy size={24} /><Text style={styles.balanceText}>{fmt(trophies)}</Text></View>
        </View>
      </View>
    </View>
    <FlatList ref={list} testID="arena-road-list" data={ROAD} renderItem={renderItem} keyExtractor={item => item.key}
      style={{ flex: 1, width, alignSelf: 'center' }} initialScrollIndex={rowIndex}
      contentOffset={initialOffset}
      getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
      onScrollToIndexFailed={() => list.current?.scrollToOffset({ offset, animated: false })}
      initialNumToRender={3} maxToRenderPerBatch={3} windowSize={5} removeClippedSubviews={false}
      ListHeaderComponent={<View pointerEvents="none" style={{ height: roadPadding, overflow: 'visible' }}><TrophyRail height={ROAD.length * ROW_H + roadPadding * 2} fillStart={fillStart} /></View>}
      ListFooterComponent={<View style={{ height: roadPadding }} />}
      showsVerticalScrollIndicator={false} />
    <View style={[styles.footer, { height: 60 + footerBottom, paddingBottom: footerBottom }]}>
      <View style={styles.doneButton} testID="arena-road-done">
        <ChunkyButton kind="gold" label={t('settings.confirm')} height={50} size={24} onPress={close} />
      </View>
    </View>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#102C58' },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  balanceText: { color: '#FFE27E', fontFamily: F.black, fontSize: 18 },
  gate: { height: ROW_H, overflow: 'hidden', alignItems: 'center' },
  stairs: { position: 'absolute', bottom: 8, alignSelf: 'center' },
  rail: { position: 'absolute', left: 0, top: 0 },
  railMilestone: { position: 'absolute', left: 0, top: 282, flexDirection: 'row', alignItems: 'center', gap: 5 },
  railTick: { width: 19, height: 1, backgroundColor: '#AACBE9', opacity: .6 },
  railLabel: { color: '#E9F4FF', fontFamily: F.bold, fontSize: 10, textShadowColor: '#061B35', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  heading: { top: 16, alignItems: 'center', width: '86%' },
  number: { fontFamily: F.bold, color: '#EBD29B', fontSize: 10, letterSpacing: 2.5, marginBottom: 4 },
  threshold: { position: 'absolute', top: 272, width: 128, height: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 3 },
  thresholdText: { color: '#FFF0AF', fontFamily: F.black, fontSize: 18 },
  here: { position: 'absolute', bottom: 39, paddingHorizontal: 11, paddingVertical: 3, backgroundColor: '#FFDE77', borderRadius: 3, borderWidth: 1, borderColor: '#AF7D32' },
  hereText: { color: '#16325F', fontFamily: F.black, fontSize: 10 },
  reward: { position: 'absolute', top: 317, width: '68%', maxWidth: 274, height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 4 },
  rewardLabel: { color: '#D1DFF2', fontFamily: F.semi, fontSize: 10 },
  rewardAmount: { color: '#FFFFFF', fontFamily: F.black, fontSize: 17 },
  rewardStatus: { color: '#A4D8CB', fontFamily: F.bold, fontSize: 11 },
  progress: { position: 'absolute', top: 379, width: '66%' },
  remaining: { textAlign: 'center', fontFamily: F.semi, color: '#E9F5FF', fontSize: 10, marginTop: 1 },
  footer: { paddingHorizontal: 24, paddingTop: 10 },
  doneButton: { width: '58%', maxWidth: 240, alignSelf: 'center' },
});
