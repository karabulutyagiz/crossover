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

// GÖRÜNÜR halkanın yüksekliği / tuval boyu (extract-frames ölçümü). Sığdırma
// (fit) modunda çerçeveyi taşmadan bir kutuya oturtmak için gerekir: çerçevenin
// opak sanatı tuvalin tamamını doldurmaz, üstte/altta şeffaf pay bırakır (özellikle
// goat tacı yukarı uzun). Bu oran, "görünür yükseklik = kutu × fit" olacak şekilde
// tuval render boyunu geri hesaplamayı sağlar.
export const FRAME_VIS: Record<string, number> = {
  bronze: 352 / 470,
  silver: 379 / 510,
  gold: 401 / 510,
  diamond: 413 / 500,
  goat: 549 / 680,
};

// Avatarın üstüne bindirilen çerçeve kaplaması. Yerleşimi etkilemez
// (absolute + pointerEvents none); avatarın olduğu HER yerde kullanılır.
// TIGHTEN: sanatın deliği yumuşak kenarlı olduğundan bire bir ölçek araya
// boşluk hissi bırakıyordu — çerçeve %10 sıkılır, halka avatarın kenarına
// bindirilir: boşluk kalmaz, çerçeve daha tok ve net okunur.
const FRAME_TIGHTEN = 0.9;
export function FrameOverlay({ frameId, size, fit }: { frameId?: string | null; size: number; fit?: number }) {
  const src = frameId ? FRAME_ART[frameId] : null;
  if (!src) return null;
  // fit modu (dar başlık gibi sıkışık yerler): çerçevenin GÖRÜNÜR halkası kutunun
  // ~`fit` katına sığar (varsayılan taşan mod DEĞİŞMEZ — fit verilmezse eski davranış).
  // Böylece taç ekran kenarına/butonlara/isme taşmaz; delik yine tuval merkezinde
  // olduğundan içteki (küçülmüş) avatarla hizalı kalır.
  const f = fit
    ? Math.round((size * fit) / (FRAME_VIS[frameId!] ?? 0.78))
    : Math.round(size * (FRAME_SCALE[frameId!] ?? 2.2) * FRAME_TIGHTEN);
  const off = Math.round((size - f) / 2);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: off, top: off, width: f, height: f }}>
      <Image source={src} style={{ width: f, height: f }} resizeMode="contain" />
    </View>
  );
}

// fit modunda çerçeve deliğine oturan avatar çapı: kutu × fit / (görünür-oran × delik-oranı).
// Böylece çerçeve tam görünür, avatar da tam deliği doldurur (kutunun DIŞINA taşmadan).
export function containedAvatarSize(frameId: string, size: number, fit: number): number {
  const vis = FRAME_VIS[frameId] ?? 0.78;
  const scale = FRAME_SCALE[frameId] ?? 2.2;
  return Math.min(size, Math.round((size * fit) / (vis * scale)));
}
