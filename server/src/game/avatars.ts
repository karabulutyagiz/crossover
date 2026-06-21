// Profile avatar catalog (server-authoritative for pricing/ownership rules).

const PREMIUM_FOOTBALLERS = new Set(['pp1', 'pp2', 'pp3', 'pp4', 'pp5', 'pp6', 'pp8', 'pp9', 'pp10']);
const PREMIUM_ANIMALS = new Set(['pp18', 'pp19', 'pp20']);
const ALL_AVATARS = new Set(Array.from({ length: 20 }, (_, i) => `pp${i + 1}`));
export const DEFAULT_AVATAR_ID = 'pp7';

export function isAvatar(id: string): boolean {
  return ALL_AVATARS.has(id);
}

export function isFreeAvatar(id: string): boolean {
  return isAvatar(id) && !PREMIUM_FOOTBALLERS.has(id) && !PREMIUM_ANIMALS.has(id);
}

export function avatarPrice(id: string): number | null {
  if (!isAvatar(id)) return null;
  if (PREMIUM_FOOTBALLERS.has(id)) return 150;
  if (PREMIUM_ANIMALS.has(id)) return 250;
  return 0;
}

export function canUseAvatar(owned: string[], avatarId: string | null): boolean {
  if (avatarId === null) return true;
  return isFreeAvatar(avatarId) || owned.includes(avatarId);
}
