// Profile pictures (avatars). The 20 options are cut from assets/avatars/pp1..pp20
// (circular PNGs with transparent corners). A user's chosen avatar id ('pp7') is
// stored on their profile; null falls back to a person/bot icon.
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { FrameOverlay } from './frames';
import { theme } from './theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// id → bundled image. require() must be static, so list them explicitly.
export const AVATARS: Record<string, number> = {
  pp1: require('../assets/avatars/pp1.png'),
  pp2: require('../assets/avatars/pp2.png'),
  pp3: require('../assets/avatars/pp3.png'),
  pp4: require('../assets/avatars/pp4.png'),
  pp5: require('../assets/avatars/pp5.png'),
  pp6: require('../assets/avatars/pp6.png'),
  pp7: require('../assets/avatars/pp7.png'),
  pp8: require('../assets/avatars/pp8.png'),
  pp9: require('../assets/avatars/pp9.png'),
  pp10: require('../assets/avatars/pp10.png'),
  pp11: require('../assets/avatars/pp11.png'),
  pp12: require('../assets/avatars/pp12.png'),
  pp13: require('../assets/avatars/pp13.png'),
  pp14: require('../assets/avatars/pp14.png'),
  pp15: require('../assets/avatars/pp15.png'),
  pp16: require('../assets/avatars/pp16.png'),
  pp17: require('../assets/avatars/pp17.png'),
  pp18: require('../assets/avatars/pp18.png'),
  pp19: require('../assets/avatars/pp19.png'),
  pp20: require('../assets/avatars/pp20.png'),
  pp21: require('../assets/avatars/pp21.png'),
  pp22: require('../assets/avatars/pp22.png'),
  pp23: require('../assets/avatars/pp23.png'),
  pp24: require('../assets/avatars/pp24.png'),
  pp25: require('../assets/avatars/pp25.png'),
  pp26: require('../assets/avatars/pp26.png'),
  pp27: require('../assets/avatars/pp27.png'),
  pp28: require('../assets/avatars/pp28.png'),
  pp29: require('../assets/avatars/pp29.png'),
  pp30: require('../assets/avatars/pp30.png'),
  pp31: require('../assets/avatars/pp31.png'),
  pp32: require('../assets/avatars/pp32.png'),
  pp33: require('../assets/avatars/pp33.png'),
  pp34: require('../assets/avatars/pp34.png'),
};

// Ordered list for the picker grid.
export const AVATAR_IDS: string[] = Array.from({ length: 34 }, (_, i) => `pp${i + 1}`);

export function avatarSource(avatar?: string | null): number | undefined {
  return avatar ? AVATARS[avatar] : undefined;
}

// A self-contained circular avatar: the chosen picture filling a circular frame,
// or a person/bot fallback icon. Replaces the old `<View circle><Ionicons person/></View>`.
export function Avatar({
  avatar, name, size, ring, ringWidth = 2, bg, iconColor, iconSize, frameId,
}: {
  avatar?: string | null;
  name?: string;          // used to pick the bot fallback icon
  size: number;
  ring?: string;          // border (ring) color; omit for no border
  ringWidth?: number;
  bg?: string;            // background behind a fallback icon
  iconColor?: string;
  iconSize?: number;
  frameId?: string | null; // takılı profil çerçevesi — daire kırpmasının DIŞINA çizilir
}) {
  const src = avatarSource(avatar);
  const fallback: IoniconName = name === 'Bot' ? 'game-controller' : 'person';
  const circle = (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: src ? '#0b1020' : (bg ?? theme.bg2),
      borderWidth: ring ? ringWidth : 0, borderColor: ring,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {src ? (
        <Image source={src} style={{ width: size * 1.06, height: size * 1.06 }} resizeMode="cover" />
      ) : (
        <Ionicons name={fallback} size={iconSize ?? size * 0.55} color={iconColor ?? theme.muted} />
      )}
    </View>
  );
  if (!frameId) return circle;
  // çerçeve daire kırpmasından etkilenmesin diye kırpmasız sarmalayıcı
  return (
    <View style={{ width: size, height: size }}>
      {circle}
      <FrameOverlay frameId={frameId} size={size} />
    </View>
  );
}
