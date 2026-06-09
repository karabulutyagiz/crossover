// Emote catalog (server-authoritative for pricing & ownership).
//
// Free emotes are owned by everyone implicitly and are NOT stored in
// users.owned_emotes. Premium emotes cost diamonds and, once bought, are
// appended to users.owned_emotes. Keep these ids in sync with app/src/emotes.tsx.

export interface EmoteDef {
  id: string;
  price: number; // diamonds; 0 = free / owned by everyone
}

export const FREE_EMOTES: readonly string[] = ['congrats', 'luck', 'gg', 'bring_it', 'gotcha'];

// Premium emotes sold in the store.
const PREMIUM_EMOTES: readonly EmoteDef[] = [
  { id: 'jersey10', price: 250 },
  { id: 'goal', price: 150 },
  { id: 'champion', price: 300 },
];

const PRICE = new Map<string, number>([
  ...FREE_EMOTES.map((id) => [id, 0] as const),
  ...PREMIUM_EMOTES.map((e) => [e.id, e.price] as const),
]);

export function isEmote(id: string): boolean {
  return PRICE.has(id);
}

export function isFreeEmote(id: string): boolean {
  return FREE_EMOTES.includes(id);
}

// null = unknown emote id.
export function emotePrice(id: string): number | null {
  return PRICE.get(id) ?? null;
}
