import type { CosmeticLoadoutView, ProfileView, StoreCatalogItem } from './protocol';
import { t } from './i18n';

/** Kozmetik adı — aktif dilde (anahtar yoksa sunucudan gelen ada düşer). */
export function cosmeticDisplayName(item: Pick<StoreCatalogItem, 'id' | 'name'>): string {
  const key = `cosmetic.${item.id}.name`;
  const v = t(key as never);
  return v === key ? item.name : v;
}

export const DEFAULT_BALL_ID = 'classic_ball';
export const DEFAULT_MATCH_BACKGROUND_ID = 'default';

export const RARITY_COLOR: Record<string, string> = {
  common: '#B9C8E8',
  rare: '#4DB8FF',
  epic: '#A06CD5',
  legendary: '#F5C518',
  mythic: '#FF5A7A',
};

export function profileLoadout(profile: ProfileView | null | undefined): CosmeticLoadoutView {
  return {
    frameId: profile?.selectedFrame ?? null,
    avatarId: profile?.avatar ?? profile?.selectedAvatar ?? null,
    nameEffectId: profile?.equippedNameEffectId ?? null,
    matchBackgroundId: profile?.equippedMatchBackgroundId ?? null,
    ballId: profile?.equippedBallId ?? DEFAULT_BALL_ID,
    introId: profile?.equippedIntroId ?? null,
    victoryEffectId: profile?.equippedVictoryEffectId ?? null,
    answerEffectId: profile?.equippedAnswerEffectId ?? null,
    emoteIds: profile?.equippedEmotes ?? [],
  };
}

export function ownsStoreCosmetic(profile: ProfileView | null | undefined, item: StoreCatalogItem): boolean {
  if (item.diamondPrice <= 0) return true;
  return Boolean(profile?.ownedCosmetics?.includes(item.id));
}

export function isEquippedCosmetic(profile: ProfileView | null | undefined, item: StoreCatalogItem): boolean {
  const l = profileLoadout(profile);
  if (item.type === 'frame') return l.frameId === item.id;
  if (item.type === 'name_effect') return l.nameEffectId === item.id;
  if (item.type === 'match_background') return l.matchBackgroundId === item.id;
  if (item.type === 'ball') return l.ballId === item.id;
  if (item.type === 'intro') return l.introId === item.id;
  if (item.type === 'victory_effect') return l.victoryEffectId === item.id;
  if (item.type === 'answer_effect') return l.answerEffectId === item.id;
  return false;
}

export function resolveMatchBackground(
  localPlayer: { cosmetics?: CosmeticLoadoutView | null } | null | undefined,
  opponent: { cosmetics?: CosmeticLoadoutView | null } | null | undefined,
): string {
  const local = localPlayer?.cosmetics?.matchBackgroundId || null;
  const remote = opponent?.cosmetics?.matchBackgroundId || null;
  if (local) return local;
  if (remote) return remote;
  return DEFAULT_MATCH_BACKGROUND_ID;
}

export function cosmeticVisual(itemOrId: StoreCatalogItem | string | null | undefined): { accent: string; icon: string } {
  const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id ?? '';
  const type = typeof itemOrId === 'string' ? '' : itemOrId?.type ?? '';
  if (type === 'frame' || id.includes('frame')) return { accent: '#F5C518', icon: 'radio-button-on' };
  if (type === 'name_effect' || id.includes('name')) return { accent: '#3DDC84', icon: 'text' };
  if (type === 'match_background' || id.includes('arena') || id.includes('stadium') || id.includes('pitch')) return { accent: '#4DB8FF', icon: 'stadium' };
  if (type === 'ball' || id.includes('ball')) return { accent: '#FFFFFF', icon: 'football' };
  if (type === 'intro') return { accent: '#A06CD5', icon: 'sparkles' };
  if (type === 'victory_effect') return { accent: '#F5C518', icon: 'trophy' };
  if (type === 'answer_effect') return { accent: '#FF7A3D', icon: 'flash' };
  return { accent: '#B9C8E8', icon: 'diamond' };
}

export function nameEffectColors(id: string | null | undefined): { color: string; glow: string } | null {
  if (!id) return null;
  if (id === 'gold_name') return { color: '#F5C518', glow: 'rgba(245,197,24,0.42)' };
  if (id === 'fire_name') return { color: '#FF7A3D', glow: 'rgba(255,90,46,0.45)' };
  if (id === 'ice_name') return { color: '#7FD7FF', glow: 'rgba(127,215,255,0.38)' };
  if (id === 'neon_name') return { color: '#27E58B', glow: 'rgba(39,229,139,0.42)' };
  if (id === 'champion_glow_name') return { color: '#FFE27A', glow: 'rgba(245,197,24,0.58)' };
  if (id === 'goat_name') return { color: '#D9B4FF', glow: 'rgba(199,125,255,0.55)' };
  return null;
}
