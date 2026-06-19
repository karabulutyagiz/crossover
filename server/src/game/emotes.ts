// Emote catalog (server-authoritative for pricing, ownership & equip rules).
//
// Two kinds (Clash-Royale style):
//   - TEXT emotes: free quick-chat phrases ("İyi oyundu!"). Owned by everyone,
//     always available in a match — NOT stored, NOT equipped.
//   - VISUAL emotes: graphic stickers sold in the store as weekly drops (3/week).
//     Bought with diamonds (stored in users.owned_emotes), then the player
//     EQUIPS up to 3 into their loadout (users.equipped_emotes) for matches.
// Keep these ids in sync with app/src/emotes.tsx.

export const FREE_EMOTES: readonly string[] = [
  // quick-chat text
  'congrats', 'luck', 'gg', 'bring_it', 'gotcha',
  // the 4 character faces (Clash-Royale style) — free for everyone
  'smile', 'cry', 'angry', 'ok',
];

// Max visual emotes a player can equip at once (loadout slots).
export const MAX_EQUIPPED = 3;

// Visual emotes, grouped by weekly drop (`week`). Add 3 new each week.
interface VisualDef { id: string; price: number; week: number }
const VISUAL_EMOTES: readonly VisualDef[] = [
  // No premium emotes currently — add new ones here with price 300.
];

const VISUAL_IDS = new Set(VISUAL_EMOTES.map((e) => e.id));

// Animated (Lottie→WebP) emotes. NOT sold in the store (no price, never in the
// weekly drops) but they ARE equippable like visual emotes. Granted to specific
// accounts (see the owned_emotes grant). Keep ids in sync with app/src/emotes.tsx.
export const ANIM_EMOTES: readonly string[] = ['footballer', 'worldcup', 'kick', 'squad', 'pitch'];
const ANIM_IDS = new Set(ANIM_EMOTES);

const PRICE = new Map<string, number>([
  ...FREE_EMOTES.map((id) => [id, 0] as const),
  ...VISUAL_EMOTES.map((e) => [e.id, e.price] as const),
]);

export function isEmote(id: string): boolean {
  return PRICE.has(id) || ANIM_IDS.has(id);
}

export function isFreeEmote(id: string): boolean {
  return FREE_EMOTES.includes(id);
}

export function isVisualEmote(id: string): boolean {
  return VISUAL_IDS.has(id);
}

// Equippable into the loadout = visual (store) emotes + animated emotes.
export function isEquippableEmote(id: string): boolean {
  return VISUAL_IDS.has(id) || ANIM_IDS.has(id);
}

// All non-free, collectible emote ids (store visuals + animated) — used to grant
// "every emote" to specific accounts.
export const ALL_COLLECTIBLE_EMOTES: readonly string[] = [
  ...VISUAL_EMOTES.map((e) => e.id),
  ...ANIM_EMOTES,
];

// null = unknown emote id.
export function emotePrice(id: string): number | null {
  return PRICE.get(id) ?? null;
}
