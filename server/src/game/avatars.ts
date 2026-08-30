// Profile avatar catalog (server-authoritative for pricing/ownership rules).

const PREMIUM_FOOTBALLERS = new Set(['pp1', 'pp2', 'pp3', 'pp4', 'pp5', 'pp6', 'pp8', 'pp9', 'pp10']);
const PREMIUM_ANIMALS = new Set(['pp18', 'pp19', 'pp20']);
// pp.jpeg'ten eklenen yeni karakter avatarları: pp21-pp31 → 150, pp32-pp34 → 250
const NEW_150 = new Set(Array.from({ length: 11 }, (_, i) => `pp${21 + i}`)); // pp21..pp31
const NEW_250 = new Set(['pp32', 'pp33', 'pp34']); // kurukafa / uzaylı / korsan
// SEZON ÖDÜL AVATARLARI (2026-08-30): satın ALINAMAZ, yalnız sezon kapanışında
// dağıtılır. Mağaza fiyatı yoktur ve isFreeAvatar da değildir — kullanabilmek
// için owned_avatars'ta bulunmak ZORUNLUDUR. Prestij buradan gelir: sezonu
// oynamayan bir daha asla alamaz.
const SEASON_REWARD_AVATARS = new Set(['pp35']); // pp35 = S1 rozeti
const ALL_AVATARS = new Set([
  ...Array.from({ length: 34 }, (_, i) => `pp${i + 1}`),
  ...SEASON_REWARD_AVATARS,
]);
export function isSeasonRewardAvatar(id: string): boolean {
  return SEASON_REWARD_AVATARS.has(id);
}
export const DEFAULT_AVATAR_ID = 'pp7';

export function isAvatar(id: string): boolean {
  return ALL_AVATARS.has(id);
}

export function isFreeAvatar(id: string): boolean {
  return isAvatar(id) && !PREMIUM_FOOTBALLERS.has(id) && !PREMIUM_ANIMALS.has(id)
    && !NEW_150.has(id) && !NEW_250.has(id) && !SEASON_REWARD_AVATARS.has(id);
}

export function avatarPrice(id: string): number | null {
  if (!isAvatar(id)) return null;
  if (SEASON_REWARD_AVATARS.has(id)) return null; // satılık değil — yalnız sezon ödülü
  if (PREMIUM_FOOTBALLERS.has(id)) return 250;
  if (PREMIUM_ANIMALS.has(id)) return 350; // kartal / aslan / kanarya
  if (NEW_150.has(id)) return 150;
  if (NEW_250.has(id)) return 250; // kurukafa / uzaylı / korsan
  return 0;
}

export function canUseAvatar(owned: string[], avatarId: string | null): boolean {
  if (avatarId === null) return true;
  return isFreeAvatar(avatarId) || owned.includes(avatarId);
}
