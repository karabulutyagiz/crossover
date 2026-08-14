// Emote catalog (server-authoritative for pricing, ownership & equip rules).
//
// Two kinds (Clash-Royale style):
//   - TEXT emotes: free quick-chat phrases ("İyi oyundu!"). Owned by everyone,
//     always available in a match — NOT stored, NOT equipped.
//   - VISUAL emotes: graphic stickers sold in the store as weekly drops (3/week).
//     Bought with diamonds (stored in users.owned_emotes), then the player
//     EQUIPS up to MAX_EQUIPPED into their loadout (users.equipped_emotes).
//     The 4 character faces are ALWAYS available in a match regardless of slots.
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
export const MAX_EQUIPPED = 8;

// Visual emotes, grouped by weekly drop (`week`). İfadelerin TEK kazanım yolu
// mağazadır (Seviye Yolu ifade vermez) — eski yol ifadeleri de burada satılır.
interface VisualDef { id: string; price: number; week: number }
const VISUAL_EMOTES: readonly VisualDef[] = [
  { id: 'ball', price: 300, week: 1 },       // Zıplayan Top
  { id: 'footballer', price: 250, week: 1 }, // Futbolcu
  { id: 'kick', price: 250, week: 1 },       // Şut!
  { id: 'squad', price: 300, week: 1 },      // Kadro
  { id: 'pitch', price: 300, week: 1 },      // Taktik Tahtası
  { id: 'euro2024', price: 500, week: 1 },   // EURO 2024
  { id: 'diez_jersey_raise', price: 500, week: 2 }, // El Diez Forma
];

const VISUAL_IDS = new Set(VISUAL_EMOTES.map((e) => e.id));

// Yalnız hesaba özel bahşedilen (satılmayan) animasyonlu ifadeler. Eski yol
// ifadeleri mağazaya taşındı; burada kalan tek örnek worldcup'tır.
export const ANIM_EMOTES: readonly string[] = ['worldcup'];
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
