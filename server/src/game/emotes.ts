// Emote catalog (server-authoritative for pricing, ownership & equip rules).
//
// Two kinds (Clash-Royale style):
//   - TEXT emotes: free quick-chat phrases ("İyi oyundu!"). Owned by everyone,
//     always available in a match — NOT stored, NOT equipped.
//   - VISUAL emotes: graphic stickers sold in the store as weekly drops (3/week).
//     Bought with diamonds (stored in users.owned_emotes), then the player
//     EQUIPS up to 3 into their loadout (users.equipped_emotes) for matches.
// Keep these ids in sync with app/src/emotes.tsx.

// Quick-chat TEXT phrases — free, always available in a match, NOT collectible
// and NOT equippable (they show as a framed text line, Clash-Royale style).
export const TEXT_EMOTES: readonly string[] = ['congrats', 'luck', 'gg', 'bring_it', 'gotcha'];

// The 4 character faces — free for everyone, but now COLLECTIBLE/EQUIPPABLE into
// the loadout slots like any other sticker emote.
export const FACE_EMOTES: readonly string[] = ['smile', 'cry', 'angry', 'ok'];
const FACE_IDS = new Set(FACE_EMOTES);

export const FREE_EMOTES: readonly string[] = [...TEXT_EMOTES, ...FACE_EMOTES];

// Max sticker emotes a player can equip at once (loadout slots).
export const MAX_EQUIPPED = 6;

// Visual emotes, grouped by weekly drop (`week`). Add 3 new each week.
interface VisualDef { id: string; price: number; week: number }
const VISUAL_EMOTES: readonly VisualDef[] = [
  // No premium emotes currently — add new ones here with price 300.
];

const VISUAL_IDS = new Set(VISUAL_EMOTES.map((e) => e.id));

// Animated (Lottie→WebP) emotes. NOT sold in the store (no price, never in the
// weekly drops) but they ARE equippable like visual emotes. Granted to specific
// accounts (see the owned_emotes grant). Keep ids in sync with app/src/emotes.tsx.
export const ANIM_EMOTES: readonly string[] = ['footballer', 'worldcup', 'kick', 'squad', 'pitch', 'euro2024'];
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

// Equippable into the loadout = character faces + visual (store) emotes + animated
// emotes. (Quick-chat TEXT phrases are never equipped.)
export function isEquippableEmote(id: string): boolean {
  return FACE_IDS.has(id) || VISUAL_IDS.has(id) || ANIM_IDS.has(id);
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
