// Profil çerçeveleri (seviye ödülü). Görseller halka merkezi = tuval merkezi
// olacak şekilde üretildi; FRAME_SCALE, çerçeve deliğinin avatar dairesiyle
// birebir çakışması için tuval/delik oranıdır (extract-frames.py verisi).
import { Image, View } from 'react-native';
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
};

// Avatarın üstüne bindirilen çerçeve kaplaması. Yerleşimi etkilemez
// (absolute + pointerEvents none); avatarın olduğu HER yerde kullanılır.
export function FrameOverlay({ frameId, size }: { frameId?: string | null; size: number }) {
  const src = frameId ? FRAME_ART[frameId] : null;
  if (!src) return null;
  const f = Math.round(size * (FRAME_SCALE[frameId!] ?? 2.2));
  const off = Math.round((size - f) / 2);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: off, top: off, width: f, height: f }}>
      <Image source={src} style={{ width: f, height: f }} resizeMode="contain" />
    </View>
  );
}
