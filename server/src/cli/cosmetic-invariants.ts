import { COSMETIC_ITEMS, storeCatalog } from '../game/cosmetics.ts';

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ids = new Set<string>();
for (const item of COSMETIC_ITEMS) {
  check(!ids.has(item.id), `duplicate cosmetic id: ${item.id}`);
  ids.add(item.id);
  check(item.diamondPrice >= 0, `negative price: ${item.id}`);
  check(['common', 'rare', 'epic', 'legendary', 'mythic'].includes(item.rarity), `bad rarity: ${item.id}`);
  check(item.name.trim().length > 0, `missing name: ${item.id}`);
}

const catalog = storeCatalog(new Date('2026-08-25T12:00:00Z'));
check(catalog.items.length === COSMETIC_ITEMS.length, 'catalog item count drift');
check(catalog.featured.every((id) => ids.has(id)), 'featured references unknown item');
check(new Date(catalog.dailyResetAt).getTime() > new Date(catalog.serverTime).getTime(), 'daily reset must be server-future');

const bg = (id: string | null) => ({ cosmetics: { frameId: null, avatarId: null, nameEffectId: null, matchBackgroundId: id, ballId: 'classic_ball', introId: null, victoryEffectId: null, answerEffectId: null, emoteIds: [] } });
function resolveMatchBackground(localPlayer: ReturnType<typeof bg>, opponent: ReturnType<typeof bg>): string {
  const local = localPlayer?.cosmetics?.matchBackgroundId || null;
  const remote = opponent?.cosmetics?.matchBackgroundId || null;
  if (local) return local;
  if (remote) return remote;
  return 'default';
}
check(resolveMatchBackground(bg(null), bg(null)) === 'default', 'both default background failed');
check(resolveMatchBackground(bg('fire_arena'), bg(null)) === 'fire_arena', 'A custom / B default failed');
check(resolveMatchBackground(bg(null), bg('neon_pitch')) === 'neon_pitch', 'A default / B custom failed');
check(resolveMatchBackground(bg('fire_arena'), bg('neon_pitch')) === 'fire_arena', 'both custom must use local background');

console.log('✓ cosmetic invariants passed');
