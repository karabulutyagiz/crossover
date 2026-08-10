import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProfileView } from './protocol';
import { Avatar } from './Avatar';
import { theme } from './theme';

export interface AvatarMeta {
  id: string;
  label: string;
  price: number;
}

export const PREMIUM_FOOTBALLER_IDS = ['pp1', 'pp2', 'pp3', 'pp4', 'pp5', 'pp6', 'pp8', 'pp9', 'pp10'] as const;
export const PREMIUM_ANIMAL_IDS = ['pp18', 'pp19', 'pp20'] as const;
// pp.jpeg'ten eklenen yeni karakter avatarları: pp21-pp31 → 150, pp32-pp34 → 250
export const NEW_150_IDS: string[] = Array.from({ length: 11 }, (_, i) => `pp${21 + i}`); // pp21..pp31
export const NEW_250_IDS = ['pp32', 'pp33', 'pp34'] as const; // kurukafa, uzaylı, korsan

const LABELS: Record<string, string> = {
  pp1: 'Futbolcu 1',
  pp2: 'Futbolcu 2',
  pp3: 'Futbolcu 3',
  pp4: 'Futbolcu 4',
  pp5: 'Futbolcu 5',
  pp6: 'Futbolcu 6',
  pp7: 'Kaleci Eldiveni',
  pp8: 'Futbolcu 7',
  pp9: 'Futbolcu 8',
  pp10: 'Futbolcu 9',
  pp11: 'Top',
  pp12: 'Krampon',
  pp13: 'Tahta',
  pp14: 'Ninja',
  pp15: 'Kupa',
  pp16: 'Stadyum',
  pp17: 'Projektor',
  pp18: 'Kartal',
  pp19: 'Aslan',
  pp20: 'Kanarya',
  pp21: 'Kulaklıklı',
  pp22: 'Kapüşonlu',
  pp23: 'Yeşilli',
  pp24: 'Taraftar',
  pp25: 'Maskeli',
  pp26: 'Sporcu Kız',
  pp27: 'Mavi Kapüşon',
  pp28: 'Gözlüklü',
  pp29: 'Robot',
  pp30: 'Mor Kapüşon',
  pp31: 'Ninja II',
  pp32: 'Kurukafa',
  pp33: 'Uzaylı',
  pp34: 'Korsan',
};

const META = new Map<string, AvatarMeta>();
for (let i = 1; i <= 34; i++) {
  const id = `pp${i}`;
  META.set(id, {
    id,
    label: LABELS[id] ?? id.toUpperCase(),
    price: PREMIUM_FOOTBALLER_IDS.includes(id as any) ? 250
      : PREMIUM_ANIMAL_IDS.includes(id as any) ? 350
      : NEW_150_IDS.includes(id) ? 150
      : (NEW_250_IDS as readonly string[]).includes(id) ? 250
      : 0,
  });
}

export function avatarMeta(id?: string | null): AvatarMeta {
  return META.get(id ?? '') ?? { id: id ?? '', label: 'Klasik', price: 0 };
}

export function avatarPrice(id: string): number {
  return avatarMeta(id).price;
}

export function isPremiumAvatar(id: string): boolean {
  return avatarPrice(id) > 0;
}

export function ownsAvatar(profile: ProfileView | null, avatarId: string): boolean {
  return !isPremiumAvatar(avatarId) || Boolean(profile?.ownedAvatars?.includes(avatarId));
}

export function AvatarBadge({
  avatarId,
  size = 40,
  locked = false,
  dimmed = false,
  ringColor,
  frameId,
  frameFit,
}: {
  avatarId?: string | null;
  size?: number;
  locked?: boolean;
  dimmed?: boolean;
  ringColor?: string;
  frameId?: string | null; // takılı profil çerçevesi — avatarın etrafına oturur
  frameFit?: number; // sıkışık yerde çerçeveyi kutuya sığdır (taşmasın) — bkz. Avatar
}) {
  return (
    <View style={{ opacity: dimmed ? 0.55 : 1 }}>
      <Avatar avatar={avatarId ?? null} size={size} ring={ringColor} iconColor={ringColor ?? theme.muted} frameId={frameId} frameFit={frameFit} />
      {locked ? (
        <View style={{ position: 'absolute', right: -1, bottom: -1, width: Math.round(size * 0.42), height: Math.round(size * 0.42), borderRadius: size, backgroundColor: 'rgba(6,19,31,0.92)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF22' }}>
          <Ionicons name="lock-closed" size={Math.round(size * 0.18)} color="#F5C518" />
        </View>
      ) : null}
    </View>
  );
}
