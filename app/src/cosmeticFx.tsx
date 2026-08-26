// Kozmetik efekt motoru v2 — GERÇEK asset'lerle.
// Alev: ısı-yayılım simülasyonundan render edilmiş 16 karelik sprite şeridi
// (assets/fx/fire_strip.png) — kod-çizimi dikdörtgen yok. Parıltı/aura/şimşek/
// hüzme/kar tanesi: gauss bloom'lu render PNG'ler (beyaz+alfa, tintColor ile
// boyanır). Animasyon yalnız native-driver opacity/transform; pointerEvents
// her katmanda "none".
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, View, type LayoutChangeEvent } from 'react-native';

const FIRE_STRIP = require('../assets/fx/fire_strip.png');
const GLOW = require('../assets/fx/glow_radial.png');
const GLINT = require('../assets/fx/glint4.png');
const SNOWFLAKE = require('../assets/fx/snowflake.png');
const SHEEN = require('../assets/fx/sheen.png');
const BOLT = require('../assets/fx/bolt.png');
const BEAM = require('../assets/fx/beam.png');
const FIRE_FRAMES = 16;

/** 0→1 döngüsü: her katman kendi fazında akar (senkron robotik görünmesin). */
function usePhase(duration: number, delay = 0): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, duration, delay]);
  return v;
}

// ---------------------------------------------------------------------------
// ATEŞ — sprite şeridi oynatıcı. Kare atlama, çift duraklı interpolate ile
// native driver'da koşar (JS'e kare başına iş düşmez).
// ---------------------------------------------------------------------------
function FireSprite({ width, height, opacity = 1 }: { width: number; height: number; opacity?: number }) {
  const p = usePhase(1150);
  const inp: number[] = [0];
  const out: number[] = [0];
  for (let i = 1; i < FIRE_FRAMES; i++) {
    inp.push(i / FIRE_FRAMES, i / FIRE_FRAMES);
    out.push(-(i - 1) * width, -i * width);
  }
  inp.push(1);
  out.push(-(FIRE_FRAMES - 1) * width);
  return (
    <View pointerEvents="none" style={{ width, height, overflow: 'hidden', opacity }}>
      <Animated.Image
        source={FIRE_STRIP}
        fadeDuration={0}
        resizeMode="stretch"
        style={{ width: width * FIRE_FRAMES, height, transform: [{ translateX: p.interpolate({ inputRange: inp, outputRange: out }) }] }}
      />
    </View>
  );
}

/** İsim arkasında yükselen alev bandı + nefes alan taban ışıması. */
export function FlameField({ height = 16 }: { height?: number }) {
  const [w, setW] = useState(0);
  const glow = usePhase(900);
  const bandH = height * 2.1;
  return (
    <View
      style={{ position: 'absolute', left: -5, right: -5, top: -height * 1.05, bottom: -2 }}
      onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
    >
      <Animated.Image
        source={GLOW}
        resizeMode="stretch"
        style={{
          position: 'absolute', left: '4%', right: '4%', bottom: -height * 0.45, height: height * 1.15,
          tintColor: '#FF5A1F',
          opacity: glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.38, 0.62, 0.38] }),
        }}
      />
      {w > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, bottom: 0 }}>
          <FireSprite width={w} height={bandH} opacity={0.96} />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PARILTI — render edilmiş 4 uçlu glint (pop + çeyrek dönüş)
// ---------------------------------------------------------------------------
function StarGlint({ x, y, size, color, delay, duration }: {
  x: number; y: number; size: number; color: string; delay: number; duration: number;
}) {
  const p = usePhase(duration, delay);
  const pop = p.interpolate({ inputRange: [0, 0.2, 0.5, 0.8, 1], outputRange: [0, 1, 0.75, 1, 0] });
  return (
    <Animated.Image
      source={GLINT}
      style={{
        position: 'absolute', left: x, top: y, width: size, height: size, tintColor: color,
        opacity: pop,
        transform: [{ scale: pop }, { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }],
      }}
    />
  );
}

/** Metnin üzerinden geçen ışık süpürmesi (render şerit — lüks vitrin parlaması). */
function GleamSweep({ width, color, delay = 0, period = 2400 }: { width: number; color: string; delay?: number; period?: number }) {
  const p = usePhase(period, delay);
  return (
    <Animated.Image
      source={SHEEN}
      resizeMode="stretch"
      style={{
        position: 'absolute', top: -4, bottom: -4, height: undefined, width: 18,
        tintColor: color,
        opacity: p.interpolate({ inputRange: [0, 0.06, 0.3, 0.36, 1], outputRange: [0, 0.65, 0.65, 0, 0] }),
        transform: [
          { translateX: p.interpolate({ inputRange: [0, 0.36, 1], outputRange: [-12, width + 12, width + 12] }) },
          { rotate: '14deg' },
        ],
      }}
    />
  );
}

/** Nefes alan radyal ışıma (render glow — düz renkli kutu değil). */
function AuraGlow({ color, period = 1300, maxOpacity = 0.5, style }: { color: string; period?: number; maxOpacity?: number; style?: object }) {
  const p = usePhase(period);
  return (
    <Animated.Image
      source={GLOW}
      resizeMode="stretch"
      style={[{
        position: 'absolute',
        tintColor: color,
        opacity: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [maxOpacity * 0.55, maxOpacity, maxOpacity * 0.55] }),
        transform: [{ scale: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.96, 1.05, 0.96] }) }],
      }, style]}
    />
  );
}

// ---------------------------------------------------------------------------
// İSİM EFEKTLERİ
// ---------------------------------------------------------------------------
function FireNameFX() {
  return <FlameField height={14} />;
}

function IceFlake({ x, y, s, delay, period, dir, spin }: { x: number; y: number; s: number; delay: number; period: number; dir: 1 | -1; spin: Animated.Value }) {
  const tw = usePhase(period, delay);
  return (
    <Animated.Image
      source={SNOWFLAKE}
      style={{
        position: 'absolute', left: x, top: y, width: s, height: s, tintColor: '#EAFBFF',
        opacity: tw.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [0.15, 0.95, 0.6, 0.15] }),
        transform: [
          { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * dir}deg`] }) },
          { scale: tw.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.7, 1, 0.75] }) },
        ],
      }}
    />
  );
}

function IceNameFX() {
  const spin = usePhase(6000);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -10, right: -10, top: -12, bottom: -8 }}>
      <AuraGlow color="#7FD7FF" period={1700} maxOpacity={0.34} style={{ left: 0, right: 0, top: 0, bottom: 0 }} />
      <GleamSweep width={130} color="#D9F7FF" period={2600} />
      {/* kar kristalleri: render kar tanesi, ağır dönüş + parıldama */}
      <IceFlake x={-6} y={-8} s={16} delay={0} period={2300} dir={1} spin={spin} />
      <IceFlake x={40} y={12} s={11} delay={750} period={2600} dir={-1} spin={spin} />
      <IceFlake x={84} y={-9} s={14} delay={1400} period={2400} dir={1} spin={spin} />
      <IceFlake x={122} y={10} s={10} delay={1950} period={2800} dir={-1} spin={spin} />
    </View>
  );
}

function NeonNameFX() {
  const p = usePhase(2600);
  // tüp titremesi: düzensiz duraklarla gerçek neon stutter'ı
  const flick = p.interpolate({
    inputRange: [0, 0.05, 0.09, 0.12, 0.5, 0.54, 0.57, 1],
    outputRange: [0.95, 0.25, 0.95, 0.95, 0.95, 0.3, 1, 0.95],
  });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -6, right: -6, top: -6, bottom: -6 }}>
      {/* tüpün ışık banyosu: render glow, aynı titremeyle */}
      <Animated.Image source={GLOW} resizeMode="stretch" style={{ position: 'absolute', left: -4, right: -4, bottom: -10, height: 22, tintColor: '#27E58B', opacity: flick }} />
      {/* tüpün kendisi: ince parlak çizgi + yan kapaklar */}
      <Animated.View style={{ position: 'absolute', left: 2, right: 2, bottom: -2, height: 3, borderRadius: 3, backgroundColor: '#8CFFC9', opacity: flick }} />
      <Animated.View style={{ position: 'absolute', left: -2, bottom: -4, width: 3, height: 11, borderRadius: 3, backgroundColor: '#8CFFC9', opacity: flick }} />
      <Animated.View style={{ position: 'absolute', right: -2, bottom: -4, width: 3, height: 11, borderRadius: 3, backgroundColor: '#8CFFC9', opacity: flick }} />
    </View>
  );
}

function GoldNameFX() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -8, right: -8, top: -10, bottom: -6 }}>
      <GleamSweep width={130} color="#FFF3C4" period={2200} />
      <StarGlint x={2} y={-8} size={15} color="#FFE9A3" delay={150} duration={2000} />
      <StarGlint x={62} y={12} size={10} color="#FFE9A3" delay={950} duration={2000} />
      <StarGlint x={110} y={-6} size={13} color="#FFF3C4" delay={1700} duration={2000} />
      <AuraGlow color="#F5C518" period={1900} maxOpacity={0.26} style={{ left: '2%', right: '2%', bottom: -8, height: 16 }} />
    </View>
  );
}

function ChampionNameFX() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -10, right: -10, top: -12, bottom: -8 }}>
      <AuraGlow color="#FFE27A" period={1300} maxOpacity={0.44} style={{ left: 0, right: 0, top: 0, bottom: 0 }} />
      <GleamSweep width={140} color="#FFF7D6" period={1900} />
      <StarGlint x={-2} y={-9} size={14} color="#FFF3C4" delay={0} duration={1700} />
      <StarGlint x={46} y={13} size={10} color="#FFF3C4" delay={550} duration={1700} />
      <StarGlint x={92} y={-9} size={14} color="#FFF3C4" delay={1050} duration={1700} />
      <StarGlint x={128} y={11} size={9} color="#FFF3C4" delay={1500} duration={1700} />
    </View>
  );
}

function GoatNameFX() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -10, right: -10, top: -13, bottom: -8 }}>
      <AuraGlow color="#9B6BFF" period={1500} maxOpacity={0.5} style={{ left: 0, right: 0, top: 0, bottom: 0 }} />
      <GleamSweep width={130} color="#EBD9FF" period={2000} />
      {/* taç parıltıları: üst hatta üç lila glint */}
      <StarGlint x={8} y={-11} size={13} color="#EBD9FF" delay={0} duration={1800} />
      <StarGlint x={58} y={-14} size={17} color="#F4EAFF" delay={600} duration={1800} />
      <StarGlint x={108} y={-11} size={13} color="#EBD9FF" delay={1150} duration={1800} />
    </View>
  );
}

export function NameEffectFX({ effectId }: { effectId?: string | null }) {
  if (!effectId) return null;
  if (effectId === 'fire_name') return <FireNameFX />;
  if (effectId === 'ice_name') return <IceNameFX />;
  if (effectId === 'neon_name') return <NeonNameFX />;
  if (effectId === 'gold_name') return <GoldNameFX />;
  if (effectId === 'champion_glow_name') return <ChampionNameFX />;
  if (effectId === 'goat_name') return <GoatNameFX />;
  return null;
}

// ---------------------------------------------------------------------------
// MAĞAZA EFEKT SAHNELERİ — intro / victory_effect / answer_effect önizlemeleri
// ---------------------------------------------------------------------------
function BoltFlash({ size, delay = 0, mirror = false }: { size: number; delay?: number; mirror?: boolean }) {
  const p = usePhase(1400, delay);
  // çakma: kısa çift flaş (gerçek yıldırım ritmi), sonra karanlık
  const hit = p.interpolate({
    inputRange: [0, 0.06, 0.1, 0.16, 0.22, 0.3, 1],
    outputRange: [0, 1, 0.25, 0.9, 0.15, 0, 0],
  });
  return (
    <>
      <Animated.Image
        source={GLOW}
        style={{ position: 'absolute', left: size * 0.08, top: size * 0.04, width: size * 0.84, height: size * 0.84, tintColor: '#FFF6CC', opacity: p.interpolate({ inputRange: [0, 0.06, 0.1, 0.16, 0.22, 0.3, 1], outputRange: [0, 0.55, 0.14, 0.5, 0.08, 0, 0] }) }}
      />
      <Animated.Image
        source={BOLT}
        style={{
          position: 'absolute', left: size * (mirror ? 0.34 : 0.24), top: size * 0.08,
          width: size * 0.42, height: size * 0.8, tintColor: '#FFE05C',
          opacity: hit,
          transform: mirror ? [{ scaleX: -1 }] : [],
        }}
      />
    </>
  );
}

function SpotlightSweep({ size }: { size: number }) {
  const p = usePhase(2200);
  const beamH = size * 0.72;
  // Pivot hilesi: hüzme, 2×beamH yüksekliğindeki kabın ALT yarısında durur;
  // kabın merkezi (dönme noktası) tam lamba noktasına gelir.
  const swing = (dir: 1 | -1) => p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [`${-30 * dir}deg`, `${30 * dir}deg`, `${-30 * dir}deg`] });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: size * 0.02, alignItems: 'center' }}>
      {([1, -1] as const).map((dir, i) => (
        <Animated.View key={i} style={{ position: 'absolute', top: -beamH, width: size * 0.4, height: beamH * 2, alignItems: 'center', justifyContent: 'flex-end', transform: [{ rotate: swing(dir) }] }}>
          <Image source={BEAM} style={{ width: size * 0.36, height: beamH, tintColor: '#FFF7D6', opacity: 0.7 }} resizeMode="stretch" />
        </Animated.View>
      ))}
    </View>
  );
}

function ConfettiPiece({ size, x, delay, color }: { size: number; x: number; delay: number; color: string }) {
  const p = usePhase(1500, delay);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: size * x, top: 0, width: size * 0.09, height: size * 0.09,
      borderRadius: 2, backgroundColor: color,
      opacity: p.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 0.9, 0] }),
      transform: [
        { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [size * 0.05, size * 0.78] }) },
        { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '260deg'] }) },
        { translateX: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, size * 0.06, -size * 0.04] }) },
      ],
    }} />
  );
}

export function EffectSceneFX({ id, size }: { id: string; size: number }) {
  const aura = (color: string, maxOpacity: number) => (
    <AuraGlow color={color} maxOpacity={maxOpacity} style={{ left: size * 0.04, top: size * 0.04, width: size * 0.92, height: size * 0.92 }} />
  );
  if (id.includes('fire')) {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
        {aura('#FF5A1F', 0.5)}
        <View style={{ position: 'absolute', left: size * 0.12, bottom: size * 0.14 }}>
          <FireSprite width={size * 0.76} height={size * 0.52} />
        </View>
      </View>
    );
  }
  if (id.includes('lightning')) {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
        {aura('#FFE05C', 0.3)}
        <BoltFlash size={size} />
        <BoltFlash size={size * 0.7} delay={700} mirror />
      </View>
    );
  }
  if (id.includes('stadium')) {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
        {aura('#4DB8FF', 0.3)}
        <SpotlightSweep size={size} />
      </View>
    );
  }
  if (id.includes('champion') || id.includes('golden') || id.includes('champions')) {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
        {aura('#F5C518', 0.42)}
        <ConfettiPiece size={size} x={0.2} delay={0} color="#F5C518" />
        <ConfettiPiece size={size} x={0.48} delay={420} color="#FFFFFF" />
        <ConfettiPiece size={size} x={0.74} delay={840} color="#F5C518" />
        <StarGlint x={size * 0.1} y={size * 0.12} size={size * 0.2} color="#FFF3C4" delay={200} duration={1600} />
        <StarGlint x={size * 0.68} y={size * 0.18} size={size * 0.16} color="#FFF3C4" delay={900} duration={1600} />
      </View>
    );
  }
  if (id.includes('goat')) {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
        {aura('#9B6BFF', 0.5)}
        <StarGlint x={size * 0.14} y={size * 0.1} size={size * 0.22} color="#EBD9FF" delay={0} duration={1500} />
        <StarGlint x={size * 0.62} y={size * 0.28} size={size * 0.15} color="#EBD9FF" delay={650} duration={1500} />
        <StarGlint x={size * 0.36} y={size * 0.58} size={size * 0.18} color="#FFFFFF" delay={1100} duration={1500} />
      </View>
    );
  }
  if (id.includes('ice')) {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
        {aura('#7FD7FF', 0.42)}
        <IceSceneFlakes size={size} />
      </View>
    );
  }
  return <View pointerEvents="none">{aura('#B9C8E8', 0.3)}</View>;
}

function IceSceneFlakes({ size }: { size: number }) {
  const spin = usePhase(7000);
  const tw1 = usePhase(2100, 0);
  const tw2 = usePhase(2400, 800);
  const tw3 = usePhase(1900, 1500);
  const flake = (x: number, y: number, s: number, tw: Animated.Value, dir: 1 | -1) => (
    <Animated.Image
      source={SNOWFLAKE}
      style={{
        position: 'absolute', left: size * x, top: size * y, width: size * s, height: size * s, tintColor: '#EAFBFF',
        opacity: tw.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [0.2, 0.95, 0.6, 0.2] }),
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * dir}deg`] }) }],
      }}
    />
  );
  return (
    <>
      {flake(0.14, 0.14, 0.26, tw1, 1)}
      {flake(0.58, 0.3, 0.18, tw2, -1)}
      {flake(0.34, 0.56, 0.22, tw3, 1)}
    </>
  );
}
