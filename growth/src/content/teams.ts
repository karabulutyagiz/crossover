// Team Intelligence (bölüm 12): içerik motoru popüler takımlara ağırlık verir
// ama %20 keşif payı bırakır. Havuzlar oyunun clubPopularity.ts katalogundaki
// isimlendirmeyle uyumludur (name_norm eşleşmesi fuzzy yapılır).

export const TURKISH_GIANTS = ['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor'] as const;

export const EUROPEAN_GIANTS = [
  // "FC Barcelona" bilinçli: çıplak "Barcelona" fuzzy'de Barcelona S.C.'ye
  // (Ekvador) kayabiliyor.
  'Real Madrid', 'FC Barcelona', 'Manchester United', 'Manchester City',
  'Liverpool', 'Arsenal', 'Chelsea', 'Paris Saint-Germain', 'Bayern Munich',
  'Juventus', 'Inter', 'Milan', 'Atletico Madrid', 'Borussia Dortmund',
  'Tottenham', 'Napoli', 'Roma', 'Benfica', 'Porto', 'Ajax', 'Sevilla', 'Monaco',
] as const;

export const POPULAR_POOL: readonly string[] = [...TURKISH_GIANTS, ...EUROPEAN_GIANTS];

// Derbi eşleşmeleri (bölüm 10 - Derby Content).
export const DERBIES: readonly [string, string][] = [
  ['Galatasaray', 'Fenerbahçe'],
  ['Galatasaray', 'Beşiktaş'],
  ['Fenerbahçe', 'Beşiktaş'],
  ['Real Madrid', 'FC Barcelona'],
  ['Manchester United', 'Manchester City'],
  ['Inter', 'Milan'],
  ['Liverpool', 'Manchester United'],
  ['Arsenal', 'Tottenham'],
];

export interface RandomSource {
  next(): number; // [0,1) — testlerde deterministik enjekte edilir
}

export const defaultRandom: RandomSource = { next: () => Math.random() };

/** 80/20: exploitRatio olasılıkla popüler havuzdan, kalanında keşif listesinden seçer. */
export function pickTeamName(
  explorePool: readonly string[],
  exploitRatio: number,
  rnd: RandomSource = defaultRandom,
): string {
  const usePopular = explorePool.length === 0 || rnd.next() < exploitRatio;
  const pool = usePopular ? POPULAR_POOL : explorePool;
  const name = pool[Math.floor(rnd.next() * pool.length)];
  return name ?? POPULAR_POOL[0]!;
}

/** Ağırlıklı seçim — öğrenme döngüsünün ağırlıkları buradan uygulanır. */
export function pickWeighted<T extends string>(
  options: readonly T[],
  weights: Record<string, number>,
  rnd: RandomSource = defaultRandom,
): T {
  if (options.length === 0) throw new Error('pickWeighted: empty options');
  const w = options.map((o) => Math.max(0.05, weights[o] ?? 1));
  const total = w.reduce((a, b) => a + b, 0);
  let r = rnd.next() * total;
  for (let i = 0; i < options.length; i += 1) {
    r -= w[i]!;
    if (r <= 0) return options[i]!;
  }
  return options[options.length - 1]!;
}
