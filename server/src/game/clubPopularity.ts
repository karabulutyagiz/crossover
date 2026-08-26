import { normalize } from './normalize.ts';
import type { KnowledgeDomain, BotArchetype } from '../matchmaking/botProfiles.ts';

export type ClubPopularityTier = 'GLOBAL_GIANT' | 'VERY_POPULAR' | 'POPULAR' | 'RECOGNIZABLE' | 'NICHE';

export interface ClubPopularityInput {
  name: string;
  nameNorm?: string;
  popularity?: number | null;
  league?: string | null;
  country?: string | null;
}

export interface ClubCatalogEntry {
  name: string;
  tier: ClubPopularityTier;
  tags: readonly ('turkish_giant' | 'global_giant' | 'european_giant' | 'secondary_turkish')[];
}

const TURKISH_GIANTS = ['galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor'];
const GLOBAL_GIANTS = [
  'real madrid', 'fc barcelona', 'barcelona', 'manchester united', 'man utd', 'manchester city', 'man city',
  'liverpool', 'arsenal', 'chelsea', 'bayern munchen', 'bayern munich', 'paris saint germain', 'psg',
  'juventus', 'inter', 'internazionale', 'ac milan', 'milan', 'atletico madrid', 'atletico de madrid',
];
const VERY_POPULAR = [
  'tottenham', 'borussia dortmund', 'dortmund', 'napoli', 'roma', 'as roma', 'benfica', 'fc porto', 'porto',
  'sporting cp', 'ajax', 'psv', 'feyenoord', 'lyon', 'olympique lyon', 'marseille', 'olympique de marseille',
  'sevilla', 'valencia', 'aston villa', 'lazio', 'atalanta', 'monaco', 'celtic', 'rangers',
];
const POPULAR = [
  'villarreal', 'real sociedad', 'real betis', 'fiorentina', 'lille', 'braga', 'az alkmaar', 'club brugge',
  'anderlecht', 'dinamo zagreb', 'shakhtar donetsk', 'salzburg', 'basaksehir', 'istanbul basaksehir',
  'bursaspor', 'samsunspor', 'goztepe', 'adana demirspor', 'konyaspor', 'sivasspor', 'antalyaspor', 'kasimpasa',
];

export const CLUB_CATALOG: readonly ClubCatalogEntry[] = [
  { name: 'Galatasaray', tier: 'GLOBAL_GIANT', tags: ['turkish_giant'] },
  { name: 'Fenerbahce', tier: 'GLOBAL_GIANT', tags: ['turkish_giant'] },
  { name: 'Besiktas', tier: 'GLOBAL_GIANT', tags: ['turkish_giant'] },
  { name: 'Trabzonspor', tier: 'GLOBAL_GIANT', tags: ['turkish_giant'] },
  { name: 'Real Madrid', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Barcelona', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Manchester United', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Manchester City', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Liverpool', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Arsenal', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Chelsea', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Bayern Munich', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'PSG', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Juventus', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Inter', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Milan', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Atletico Madrid', tier: 'GLOBAL_GIANT', tags: ['global_giant', 'european_giant'] },
  { name: 'Tottenham', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Borussia Dortmund', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Napoli', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Roma', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Benfica', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Porto', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Sporting CP', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Ajax', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'PSV', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Feyenoord', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Lyon', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Marseille', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Sevilla', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Valencia', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Aston Villa', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Lazio', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Atalanta', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Monaco', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Celtic', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Rangers', tier: 'VERY_POPULAR', tags: ['european_giant'] },
  { name: 'Villarreal', tier: 'POPULAR', tags: [] },
  { name: 'Real Sociedad', tier: 'POPULAR', tags: [] },
  { name: 'Real Betis', tier: 'POPULAR', tags: [] },
  { name: 'Fiorentina', tier: 'POPULAR', tags: [] },
  { name: 'Lille', tier: 'POPULAR', tags: [] },
  { name: 'Braga', tier: 'POPULAR', tags: [] },
  { name: 'AZ Alkmaar', tier: 'POPULAR', tags: [] },
  { name: 'Club Brugge', tier: 'POPULAR', tags: [] },
  { name: 'Anderlecht', tier: 'POPULAR', tags: [] },
  { name: 'Dinamo Zagreb', tier: 'POPULAR', tags: [] },
  { name: 'Shakhtar Donetsk', tier: 'POPULAR', tags: [] },
  { name: 'Salzburg', tier: 'POPULAR', tags: [] },
  { name: 'Basaksehir', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Bursaspor', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Samsunspor', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Goztepe', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Adana Demirspor', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Konyaspor', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Sivasspor', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Antalyaspor', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Kasimpasa', tier: 'POPULAR', tags: ['secondary_turkish'] },
  { name: 'Getafe', tier: 'NICHE', tags: [] },
  { name: 'Lecce', tier: 'NICHE', tags: [] },
  { name: 'Mainz', tier: 'NICHE', tags: [] },
  { name: 'Augsburg', tier: 'NICHE', tags: [] },
  { name: 'Empoli', tier: 'NICHE', tags: [] },
  { name: 'Alaves', tier: 'NICHE', tags: [] },
  { name: 'Bodo/Glimt', tier: 'NICHE', tags: [] },
  { name: 'Molde', tier: 'NICHE', tags: [] },
  { name: 'Midtjylland', tier: 'NICHE', tags: [] },
  { name: 'Qarabag', tier: 'NICHE', tags: [] },
  { name: 'Astana', tier: 'NICHE', tags: [] },
];

export function clubPopularityTier(input: ClubPopularityInput): ClubPopularityTier {
  const key = input.nameNorm ?? normalize(input.name);
  if (matchesAny(key, TURKISH_GIANTS) || matchesAny(key, GLOBAL_GIANTS)) return 'GLOBAL_GIANT';
  if (matchesAny(key, VERY_POPULAR)) return 'VERY_POPULAR';
  if (matchesAny(key, POPULAR)) return 'POPULAR';
  const pop = Number(input.popularity ?? 0);
  if (pop >= 250_000_000) return 'GLOBAL_GIANT';
  if (pop >= 80_000_000) return 'VERY_POPULAR';
  if (pop >= 18_000_000) return 'POPULAR';
  if (pop >= 3_000_000 || input.league === 'Süper Lig' || input.league === 'Premier League' || input.league === 'La Liga' || input.league === 'Serie A' || input.league === 'Bundesliga') return 'RECOGNIZABLE';
  return 'NICHE';
}

export function tierBaseWeight(tier: ClubPopularityTier): number {
  if (tier === 'GLOBAL_GIANT') return 15.5;
  if (tier === 'VERY_POPULAR') return 10.5;
  if (tier === 'POPULAR') return 5.8;
  if (tier === 'RECOGNIZABLE') return 2.2;
  return 0.34;
}

export function isNicheTier(tier: ClubPopularityTier): boolean {
  return tier === 'NICHE';
}

export function isTurkishGiantName(name: string): boolean {
  return matchesAny(normalize(name), TURKISH_GIANTS);
}

export function isGlobalGiantName(name: string): boolean {
  const key = normalize(name);
  return matchesAny(key, TURKISH_GIANTS) || matchesAny(key, GLOBAL_GIANTS);
}

/** Kulüp Türk mü (dev + ikincil)? Maç-planı Türk turu kararında kullanılır. */
export function isTurkishClub(name: string): boolean {
  const key = normalize(name);
  return matchesAny(key, TURKISH_GIANTS) || isSecondaryTurkish(key);
}

// turkishMode (2026-08-26): 'default' eski davranış; 'neutral' Türk çarpanlarını
// kapatır (bot bu turda Türk takımı DAYATMAZ); 'boost' hedef turda güçlü iter.
// Eskiden 2.25× daimî ağırlık her maçın İLK turunu Türk deviyle açıyordu —
// artık maç başına plan: %75 maçta, rastgele bir turda, bir kez.
export function audienceBiasMultiplier(name: string, favoriteDomains: readonly KnowledgeDomain[] = [], archetype?: BotArchetype | string | null, turkishMode: 'default' | 'neutral' | 'boost' = 'default'): number {
  const key = normalize(name);
  const isTk = matchesAny(key, TURKISH_GIANTS) || isSecondaryTurkish(key);
  let m = 1;
  if (turkishMode !== 'neutral') {
    if (matchesAny(key, TURKISH_GIANTS)) m *= turkishMode === 'boost' ? 2.25 : 1.0;
    else if (isSecondaryTurkish(key)) m *= turkishMode === 'boost' ? 1.24 : 1.0;
  }
  if (turkishMode === 'boost' && isTk) m *= 4.5;
  if (matchesAny(key, GLOBAL_GIANTS)) m *= 1.38;
  if (turkishMode !== 'neutral' && favoriteDomains.includes('turkey') && isTk) m *= 1.35;
  if (favoriteDomains.includes('europe_elite') && matchesAny(key, [...GLOBAL_GIANTS, ...VERY_POPULAR])) m *= 1.18;
  if (archetype === 'CASUAL' && !matchesAny(key, [...GLOBAL_GIANTS, ...TURKISH_GIANTS, ...VERY_POPULAR])) m *= 0.82;
  if (archetype === 'SPECIALIST' && isSecondaryTurkish(key)) m *= 1.14;
  return m;
}

function matchesAny(key: string, names: readonly string[]): boolean {
  return names.some((name) => {
    const n = normalize(name);
    return key === n || key.includes(n) || n.includes(key);
  });
}

function isSecondaryTurkish(name: string): boolean {
  const key = normalize(name);
  return ['basaksehir', 'bursaspor', 'samsunspor', 'goztepe', 'adana demirspor', 'konyaspor', 'sivasspor', 'antalyaspor', 'kasimpasa'].some((n) => key.includes(n));
}

function displayName(key: string): string {
  const names: Record<string, string> = {
    galatasaray: 'Galatasaray', fenerbahce: 'Fenerbahce', besiktas: 'Besiktas', trabzonspor: 'Trabzonspor',
    'fc barcelona': 'Barcelona', 'man utd': 'Manchester United', 'man city': 'Manchester City', 'bayern munchen': 'Bayern Munich',
    'paris saint germain': 'PSG', 'ac milan': 'Milan', 'atletico de madrid': 'Atletico Madrid', 'as roma': 'Roma',
    'fc porto': 'Porto', 'olympique de marseille': 'Marseille', 'istanbul basaksehir': 'Basaksehir',
    goztepe: 'Goztepe', kasimpasa: 'Kasimpasa', 'bodo glimt': 'Bodo/Glimt',
  };
  return names[key] ?? key.split(' ').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
