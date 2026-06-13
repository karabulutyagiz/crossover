// Emote catalog (server-authoritative for pricing, ownership & equip rules).
//
// Two kinds (Clash-Royale style):
//   - TEXT emotes: free quick-chat phrases ("İyi oyundu!"). Owned by everyone,
//     always available in a match — NOT stored, NOT equipped.
//   - VISUAL emotes: graphic stickers sold in the store as weekly drops (3/week).
//     Bought with diamonds (stored in users.owned_emotes), then the player
//     EQUIPS up to 3 into their loadout (users.equipped_emotes) for matches.
// Keep these ids in sync with app/src/emotes.tsx.

export const FREE_EMOTES: readonly string[] = ['congrats', 'luck', 'gg', 'bring_it', 'gotcha'];

// Max visual emotes a player can equip at once (loadout slots).
export const MAX_EQUIPPED = 3;

// Visual emotes, grouped by weekly drop (`week`). Add 3 new each week.
interface VisualDef { id: string; price: number; week: number }
const VISUAL_EMOTES: readonly VisualDef[] = [
  { id: 'jersey10', price: 250, week: 1 },
  { id: 'goal', price: 150, week: 1 },
  { id: 'champion', price: 300, week: 1 },
  { id: 'redcard', price: 150, week: 2 },
  { id: 'penalty', price: 180, week: 2 },
  { id: 'hattrick', price: 220, week: 2 },
];

const VISUAL_IDS = new Set(VISUAL_EMOTES.map((e) => e.id));

const PRICE = new Map<string, number>([
  ...FREE_EMOTES.map((id) => [id, 0] as const),
  ...VISUAL_EMOTES.map((e) => [e.id, e.price] as const),
]);

export function isEmote(id: string): boolean {
  return PRICE.has(id);
}

export function isFreeEmote(id: string): boolean {
  return FREE_EMOTES.includes(id);
}

export function isVisualEmote(id: string): boolean {
  return VISUAL_IDS.has(id);
}

// null = unknown emote id.
export function emotePrice(id: string): number | null {
  return PRICE.get(id) ?? null;
}
