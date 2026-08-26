// Profil çerçeveleri (seviye ödülü). Görseller halka merkezi = tuval merkezi
// olacak şekilde üretildi; FRAME_SCALE, çerçeve deliğinin avatar dairesiyle
// birebir çakışması için tuval/delik oranıdır (extract-frames.py verisi).
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

export const FRAME_ART: Record<string, ImageSourcePropType> = {
  bronze: require('../assets/frames/frame-bronze.png'),
  silver: require('../assets/frames/frame-silver.png'),
  gold: require('../assets/frames/frame-gold.png'),
  diamond: require('../assets/frames/frame-diamond.png'),
  goat: require('../assets/frames/frame-goat.png'),
};

// tuval boyu / delik çapı — çerçeve bu katsayıyla avatarın etrafına tam oturur,
// fotoğrafı KAPATMAZ (delik avatar dairesiyle aynı çapta)
export const FRAME_SCALE: Record<string, number> = {
  bronze: 470 / 224,
  silver: 510 / 224,
  gold: 510 / 224,
  diamond: 500 / 220,
  goat: 680 / 216,
  fire_frame: 1.78,
  ice_frame: 1.7,
  champions_frame: 1.82,
  golden_frame: 1.72,
  neon_frame: 1.78,
  goat_frame: 1.95,
};

const STORE_FRAME_LOOK: Record<string, { ring: string; inner: string; glow: string; accent: string; sparks?: string[] }> = {
  fire_frame: { ring: '#FF7A3D', inner: '#FFE05C', glow: 'rgba(255,90,46,0.46)', accent: '#FF2E1F', sparks: ['#FFD35C', '#FF7A3D', '#FF2E1F'] },
  ice_frame: { ring: '#7FD7FF', inner: '#D9F7FF', glow: 'rgba(127,215,255,0.38)', accent: '#45A7FF', sparks: ['#D9F7FF', '#7FD7FF', '#45A7FF'] },
  champions_frame: { ring: '#37A8FF', inner: '#FFCE3A', glow: 'rgba(55,168,255,0.42)', accent: '#FFCE3A', sparks: ['#FFFFFF', '#37A8FF', '#FFCE3A'] },
  golden_frame: { ring: '#FFCE3A', inner: '#FFF1A6', glow: 'rgba(255,206,58,0.44)', accent: '#CF9A12', sparks: ['#FFF1A6', '#FFCE3A', '#CF9A12'] },
  neon_frame: { ring: '#27E58B', inner: '#7CFFB8', glow: 'rgba(39,229,139,0.45)', accent: '#37A8FF', sparks: ['#27E58B', '#37A8FF', '#7CFFB8'] },
  goat_frame: { ring: '#D9B4FF', inner: '#FFCE3A', glow: 'rgba(199,125,255,0.52)', accent: '#FF7A3D', sparks: ['#FFCE3A', '#D9B4FF', '#FFFFFF'] },
};

// Avatarın üstüne bindirilen çerçeve kaplaması. Yerleşimi etkilemez
// (absolute + pointerEvents none); avatarın olduğu HER yerde kullanılır.
// TIGHTEN: sanatın deliği yumuşak kenarlı olduğundan bire bir ölçek araya
// boşluk hissi bırakıyordu — çerçeve %10 sıkılır, halka avatarın kenarına
// bindirilir: boşluk kalmaz, çerçeve daha tok ve net okunur.
const FRAME_TIGHTEN = 0.9;

// ---- GOAT AŞAMALARI ---------------------------------------------------------
// GOAT (5000 kupa) son durak değil: kupa yükseldikçe çerçeve güçlenir.
// Aşama eşikleri kupadan türetilir — sunucu değişikliği gerektirmez, kupa her
// profil görünümünde zaten var. Aşama 1 = klasik GOAT PNG'si; 2+ aura katar.
export const GOAT_STAGE_THRESHOLDS = [5000, 5500, 6000, 6500, 7000] as const;
export function goatStageForTrophies(trophies?: number | null): number {
  if (typeof trophies !== 'number') return 0;
  let stage = 0;
  for (const t of GOAT_STAGE_THRESHOLDS) if (trophies >= t) stage++;
  return stage;
}
/** Arena adının yanına eklenen aşama son eki: "GOAT II" … "GOAT V" (1'de boş). */
export function goatStageLabel(trophies?: number | null): string {
  const stage = goatStageForTrophies(trophies);
  return stage >= 2 ? ` ${['', '', 'II', 'III', 'IV', 'V'][stage]}` : '';
}

// Aşama görünümleri: her kademe bir öncekinden okunur biçimde daha iddialı —
// kızıl köz → kraliyet moru → elmas → ebedi altın.
const GOAT_STAGE_LOOK: Record<number, { aura: string; ring: string; glints: string[]; rings: number; speed: number }> = {
  2: { aura: 'rgba(255,90,31,0.42)',  ring: '#FF7A3D', glints: ['#FFCE3A', '#FF7A3D'],            rings: 1, speed: 950 },
  3: { aura: 'rgba(155,107,255,0.46)', ring: '#C77DFF', glints: ['#EBD9FF', '#D9B4FF', '#FFFFFF'], rings: 1, speed: 900 },
  4: { aura: 'rgba(127,215,255,0.5)',  ring: '#EAFBFF', glints: ['#FFFFFF', '#D9F7FF'],            rings: 2, speed: 850 },
  5: { aura: 'rgba(255,206,58,0.55)',  ring: '#FFF1A6', glints: ['#FFFFFF', '#FFE9A3', '#FFCE3A'], rings: 2, speed: 700 },
};

function GoatStageAura({ stage, size }: { stage: number; size: number }) {
  const look = GOAT_STAGE_LOOK[Math.min(5, Math.max(2, stage))]!;
  const loop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(loop, { toValue: 1, duration: look.speed, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(loop, { toValue: 0, duration: look.speed, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [loop, stage, look.speed]);
  const glintCount = 2 + stage;
  const gs = Math.max(4, Math.round(size * 0.05));
  const radius = size * 0.47;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {/* nefes alan aura — aşama rengiyle */}
      <Animated.View style={{ position: 'absolute', inset: -size * 0.04, borderRadius: size, backgroundColor: look.aura, opacity: loop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.62] }), transform: [{ scale: loop.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.05] }) }] }} />
      {/* aşama halkaları */}
      <View style={{ position: 'absolute', inset: size * 0.075, borderRadius: size, borderWidth: Math.max(2, size * 0.022), borderColor: look.ring, opacity: 0.85 }} />
      {look.rings >= 2 ? (
        <Animated.View style={{ position: 'absolute', inset: size * 0.028, borderRadius: size, borderWidth: 1.5, borderColor: look.ring, opacity: loop.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }} />
      ) : null}
      {/* yörünge parıltıları — aşamayla çoğalır */}
      {Array.from({ length: glintCount }).map((_, i) => {
        const a = (Math.PI * 2 * i) / glintCount - Math.PI / 2;
        const color = look.glints[i % look.glints.length]!;
        const x = size / 2 + Math.cos(a) * radius - gs / 2;
        const y = size / 2 + Math.sin(a) * radius - gs / 2;
        return (
          <Animated.View key={i} style={{ position: 'absolute', left: x, top: y, width: gs, height: gs, opacity: loop.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ scale: loop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.2] }) }, { rotate: `${Math.round((a * 180) / Math.PI) + 45}deg` }] }}>
            <View style={{ position: 'absolute', left: gs * 0.4, top: 0, width: gs * 0.2, height: gs, borderRadius: gs, backgroundColor: color }} />
            <View style={{ position: 'absolute', left: 0, top: gs * 0.4, width: gs, height: gs * 0.2, borderRadius: gs, backgroundColor: color }} />
          </Animated.View>
        );
      })}
    </View>
  );
}

export function FrameOverlay({ frameId, size, trophies }: { frameId?: string | null; size: number; trophies?: number | null }) {
  const src = frameId ? FRAME_ART[frameId] : null;
  const look = frameId ? STORE_FRAME_LOOK[frameId] : null;
  if (!src && !look) return null;
  const f = Math.round(size * (FRAME_SCALE[frameId!] ?? 2.2) * FRAME_TIGHTEN);
  const off = Math.round((size - f) / 2);
  if (!src && look) return <ProceduralFrameOverlay frameId={frameId!} size={f} offset={off} look={look} />;
  if (!src) return null;
  const goatStage = frameId === 'goat' ? goatStageForTrophies(trophies) : 0;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: off, top: off, width: f, height: f }}>
      {goatStage >= 2 ? <GoatStageAura stage={goatStage} size={f} /> : null}
      <Image source={src} style={{ width: f, height: f }} resizeMode="contain" />
    </View>
  );
}

function ProceduralFrameOverlay({ frameId, size, offset, look }: { frameId: string; size: number; offset: number; look: { ring: string; inner: string; glow: string; accent: string; sparks?: string[] } }) {
  const loop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(loop, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(loop, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [loop, frameId]);
  const border = Math.max(5, Math.round(size * 0.055));
  const sparkSize = Math.max(5, Math.round(size * 0.055));
  const radius = size * 0.46;
  const sparkScale = loop.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.18] });
  const sparkOpacity = loop.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.95] });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: offset, top: offset, width: size, height: size }}>
      <Animated.View style={{ position: 'absolute', left: -border, top: -border, right: -border, bottom: -border, borderRadius: size, backgroundColor: look.glow, opacity: loop.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.58] }), transform: [{ scale: loop.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }] }} />
      <View style={{ position: 'absolute', inset: 0, borderRadius: size / 2, borderWidth: border, borderColor: look.ring }} />
      <View style={{ position: 'absolute', inset: border + 2, borderRadius: size / 2, borderWidth: Math.max(2, Math.round(border * 0.52)), borderColor: look.inner, opacity: 0.9 }} />
      <View style={{ position: 'absolute', inset: border * 2.3, borderRadius: size / 2, borderWidth: 1.5, borderColor: look.accent, opacity: 0.9 }} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        const color = look.sparks?.[i % (look.sparks.length || 1)] ?? look.accent;
        const x = size / 2 + Math.cos(a) * radius - sparkSize / 2;
        const y = size / 2 + Math.sin(a) * radius - sparkSize / 2;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: x, top: y,
              width: sparkSize, height: frameId === 'fire_frame' ? sparkSize * 1.55 : sparkSize,
              borderRadius: sparkSize,
              backgroundColor: color,
              opacity: sparkOpacity,
              transform: [{ scale: sparkScale }, { rotate: `${Math.round((a * 180) / Math.PI)}deg` }],
            }}
          />
        );
      })}
      {frameId === 'goat_frame' ? (
        <View style={{ position: 'absolute', top: -sparkSize * 0.4, left: size / 2 - sparkSize * 1.7, flexDirection: 'row', gap: sparkSize * 0.25 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: sparkSize * 0.9, height: sparkSize * (i === 1 ? 1.35 : 1), borderRadius: sparkSize, backgroundColor: i === 1 ? look.inner : look.ring }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
