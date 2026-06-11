import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { normalize } from './normalize.ts';
import type { Scope } from '../protocol.ts';

// Build a scope WHERE-fragment + push its param. Returns '' for 'all'.
function scopeClause(scope: Scope, params: unknown[]): string {
  if (scope.type === 'league') {
    params.push(scope.value);
    return `AND c.league = $${params.length}`;
  }
  if (scope.type === 'country') {
    params.push(scope.value);
    return `AND c.country = $${params.length}`;
  }
  return '';
}

export interface ClubHit {
  id: number;
  name: string;
  logoUrl: string | null;
}

export interface SpellInfo {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  startYear: number | null;
  endYear: number | null;
}

export type VerifyReason = 'both' | 'not_both' | 'no_match';

export interface VerifyResult {
  correct: boolean;
  reason: VerifyReason;
  autocorrected: boolean; // true when a typo was auto-corrected to the matched player
  teamA: ClubHit;
  teamB: ClubHit;
  matchedPlayer: { id: number; name: string; sim: number; imageUrl: string | null } | null;
  spellsA: SpellInfo[]; // matched player's spell(s) at team A
  spellsB: SpellInfo[]; // matched player's spell(s) at team B
  allClubs: SpellInfo[]; // matched player's full club history (used on a wrong guess)
}

/**
 * Autocomplete / resolution for club names. Excludes national teams.
 *
 * Wikidata often has several entities for "the same" club (the main club, its
 * football section, reserve/B/C teams, women's team, historical duplicates).
 * Only the canonical one accumulates a real squad, so we rank by member count
 * (how many players link to it) — this reliably picks the real club over empty
 * duplicates like "Galatasaray SK" vs "Galatasaray S.K." or "Real Madrid C".
 */
// Keep only senior men's "A" teams: drop women's sides, youth/age categories,
// and reserve/B teams. Pattern-based on the normalized name (lowercase, accents
// stripped). Reused by both search and random pick.
const A_TEAM_ONLY = `
  AND c.name_norm !~* '(women|femen|femin|femmin|frauen|kadin|ladies)'
  AND c.name_norm !~* '(^|[^a-z])(u-?1[2-9]|u-?2[0-3]|sub-?[0-9]|youth|jugend|primavera|juvenil|altyapi|akademi|academy|junior|jeugd)([^a-z]|$)'
  AND c.name_norm !~* '( b| ii| iii| reserves?| castilla)$'
`;

export async function searchClubs(
  query: string,
  scope: Scope = { type: 'all' },
  limit = 8,
): Promise<ClubHit[]> {
  const norm = normalize(query);
  if (!norm) return [];
  const params: unknown[] = [norm];
  const scopeSql = scopeClause(scope, params);
  params.push(limit);
  const limitIdx = params.length;
  // Every club is searchable (incl. lower divisions) as long as it has a logo and
  // players. Rank: exact name, then real-league clubs (over reserves/obscure with
  // no league), then popularity (player count) so famous clubs surface first
  // (e.g. "bar" → Barcelona, not "FC Barcelona Atlètic"), then prefix, similarity.
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    `SELECT c.id, c.name, c.logo_url,
            similarity(c.name_norm, $1) AS sim,
            c.popularity AS members
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
        AND (c.name_norm LIKE '%' || $1 || '%' OR c.name_norm % $1)
        ${A_TEAM_ONLY}
        ${scopeSql}
      ORDER BY (c.name_norm = $1) DESC,
               (c.league IS NOT NULL) DESC,
               members DESC,
               (c.name_norm LIKE $1 || '%') DESC,
               sim DESC,
               length(c.name) ASC
      LIMIT $${limitIdx}`,
    params,
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, logoUrl: r.logo_url }));
}

// Allowed leagues in the game. 5 major leagues get their 2nd divisions too,
// plus Turkey, Netherlands, Brazil, Portugal, and England Championship.
// Other countries only their first division.
const ALLOWED_LEAGUES = [
  // 5 major leagues + their second divisions
  'Premier League', 'Championship',
  'La Liga', 'La Liga 2',
  'Serie A', 'Serie B',
  'Bundesliga', 'Bundesliga 2',
  'Ligue 1', 'Ligue 2',
  // Turkey
  'Süper Lig', 'TFF 1. Lig',
  // Netherlands, Brazil, Portugal
  'Eredivisie', 'Brazil Serie A', 'Brazil Serie B', 'Primeira Liga',
  // Other countries — first division only
  'Belgian Pro League', 'Scottish Premiership', 'Swiss Super League',
  'Austrian Bundesliga', 'Greek Super League', 'Russian Premier League',
  'Ukrainian Premier League', 'MLS', 'Liga MX',
  'Argentine Liga Profesional', 'Saudi Pro League', 'Danish Superliga',
  'Eliteserien', 'Allsvenskan', 'Ekstraklasa', 'Czech First League',
  'Croatian HNL', 'Serbian SuperLiga', 'Romanian Liga I',
  'Colombian Primera A', 'Chilean Primera', 'Uruguayan Primera',
  'J1 League', 'K League 1', 'Chinese Super League', 'A-League',
  'Egyptian Premier League', 'Qatar Stars League', 'UAE Pro League',
];

/**
 * A random club for the bot, chosen by POPULARITY (clubs.popularity = player
 * count). Data-driven — no hardcoded ids, no league whitelist — so every famous
 * club is reachable and it survives data rebuilds.
 * - 'easy':   random among the ~120 most popular clubs (mega-famous)
 * - 'medium': random among the ~700 most popular (well-known)
 * - 'hard':   any club with a logo + players in scope (incl. obscure / lower divisions)
 */
const EASY_TOP = 120;
const MEDIUM_TOP = 700;

export async function randomClub(
  scope: Scope = { type: 'all' },
  difficulty: 'easy' | 'medium' | 'hard' = 'hard',
): Promise<ClubHit | null> {
  const params: unknown[] = [];
  const scopeSql = scopeClause(scope, params);
  const base = `
    SELECT c.id, c.name, c.logo_url, c.popularity
      FROM clubs c
     WHERE c.is_national = false
       AND c.logo_url IS NOT NULL
       AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
       ${A_TEAM_ONLY}
       ${scopeSql}`;
  const topN = difficulty === 'easy' ? EASY_TOP : difficulty === 'medium' ? MEDIUM_TOP : null;
  const sql = topN
    ? `SELECT id, name, logo_url FROM (${base} ORDER BY c.popularity DESC LIMIT ${topN}) t ORDER BY random() LIMIT 1`
    : `${base} ORDER BY random() LIMIT 1`;
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(sql, params);
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
}

export interface ScopeOption {
  value: string;
  displayName?: string;
  count: number;
  logoUrl?: string | null;
}

// API-Football league IDs for logo URLs.
const LEAGUE_LOGOS: Record<string, number> = {
  'Premier League': 39, Championship: 40, 'La Liga': 140, 'La Liga 2': 141,
  'Serie A': 135, 'Serie B': 136, Bundesliga: 78, 'Bundesliga 2': 79,
  'Ligue 1': 61, 'Ligue 2': 62, Eredivisie: 88, 'Primeira Liga': 94,
  'Süper Lig': 203, 'TFF 1. Lig': 204, 'Belgian Pro League': 144,
  'Scottish Premiership': 179, 'Swiss Super League': 207, 'Austrian Bundesliga': 218,
  'Greek Super League': 197, 'Russian Premier League': 235, 'Ukrainian Premier League': 333,
  MLS: 253, 'Liga MX': 262, 'Brazil Serie A': 71, 'Brazil Serie B': 72,
  'Argentine Liga Profesional': 128, 'Saudi Pro League': 307, 'League One': 41,
  'League Two': 42, 'Scottish Championship': 180, 'Liga Portugal 2': 95,
  'Danish Superliga': 119, Eliteserien: 103, Allsvenskan: 113, Ekstraklasa: 106,
  'Czech First League': 345, 'Croatian HNL': 210, 'Serbian SuperLiga': 286,
  'Romanian Liga I': 283, 'Colombian Primera A': 239, 'Chilean Primera': 265,
  'Uruguayan Primera': 270, 'J1 League': 98, 'K League 1': 292,
  'Chinese Super League': 169, 'A-League': 188, 'Egyptian Premier League': 233,
  'Qatar Stars League': 305, 'UAE Pro League': 301,
};

function leagueLogoUrl(name: string): string | null {
  const id = LEAGUE_LOGOS[name];
  return id ? `https://media.api-sports.io/football/leagues/${id}.png` : null;
}

// ISO 3166-1 alpha-2 country code → flag emoji conversion.
const COUNTRY_FLAGS: Record<string, string> = {
  TR: '🇹🇷', EN: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ES: '🇪🇸', IT: '🇮🇹', DE: '🇩🇪', FR: '🇫🇷', PT: '🇵🇹',
  NL: '🇳🇱', BE: '🇧🇪', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', CH: '🇨🇭', AT: '🇦🇹', GR: '🇬🇷',
  RU: '🇷🇺', UA: '🇺🇦', US: '🇺🇸', MX: '🇲🇽', BR: '🇧🇷', AR: '🇦🇷',
  SA: '🇸🇦', DK: '🇩🇰', NO: '🇳🇴', SE: '🇸🇪', PL: '🇵🇱', CZ: '🇨🇿',
  HR: '🇭🇷', RS: '🇷🇸', RO: '🇷🇴', CO: '🇨🇴', CL: '🇨🇱', UY: '🇺🇾',
  JP: '🇯🇵', KR: '🇰🇷', CN: '🇨🇳', AU: '🇦🇺', EG: '🇪🇬', QA: '🇶🇦', AE: '🇦🇪',
  // Full country names (as stored in DB from API-Football)
  Turkey: '🇹🇷', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Spain: '🇪🇸', Italy: '🇮🇹', Germany: '🇩🇪',
  France: '🇫🇷', Portugal: '🇵🇹', Netherlands: '🇳🇱', Belgium: '🇧🇪', Switzerland: '🇨🇭',
  Austria: '🇦🇹', Greece: '🇬🇷', Russia: '🇷🇺', Ukraine: '🇺🇦', USA: '🇺🇸',
  Mexico: '🇲🇽', Brazil: '🇧🇷', Argentina: '🇦🇷', 'Saudi-Arabia': '🇸🇦',
  'Saudi Arabia': '🇸🇦', Denmark: '🇩🇰', Norway: '🇳🇴', Sweden: '🇸🇪',
  Poland: '🇵🇱', 'Czech-Republic': '🇨🇿', Croatia: '🇭🇷', Serbia: '🇷🇸',
  Romania: '🇷🇴', Colombia: '🇨🇴', Chile: '🇨🇱', Uruguay: '🇺🇾',
  Japan: '🇯🇵', 'Korea-South': '🇰🇷', 'South-Korea': '🇰🇷', China: '🇨🇳',
  Australia: '🇦🇺', Egypt: '🇪🇬', Qatar: '🇶🇦', 'United-Arab-Emirates': '🇦🇪',
  Ireland: '🇮🇪', Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Northern-Ireland': '🇬🇧',
  Hungary: '🇭🇺', Bulgaria: '🇧🇬', Slovakia: '🇸🇰', Slovenia: '🇸🇮',
  Finland: '🇫🇮', Iceland: '🇮🇸', Paraguay: '🇵🇾', Peru: '🇵🇪',
  Ecuador: '🇪🇨', Venezuela: '🇻🇪', Bolivia: '🇧🇴',
  Canada: '🇨🇦', CA: '🇨🇦', 'New-Zealand': '🇳🇿', 'New Zealand': '🇳🇿', NZ: '🇳🇿',
};

function countryFlag(name: string): string | null {
  return COUNTRY_FLAGS[name] ?? null;
}

const COUNTRY_NAME_TR: Record<string, string> = {
  Turkey: 'Türkiye', England: 'İngiltere', Spain: 'İspanya', Italy: 'İtalya',
  Germany: 'Almanya', France: 'Fransa', Portugal: 'Portekiz', Netherlands: 'Hollanda',
  Belgium: 'Belçika', Scotland: 'İskoçya', Switzerland: 'İsviçre', Austria: 'Avusturya',
  Greece: 'Yunanistan', Russia: 'Rusya', Ukraine: 'Ukrayna', USA: 'ABD',
  Mexico: 'Meksika', Brazil: 'Brezilya', Argentina: 'Arjantin',
  'Saudi-Arabia': 'Suudi Arabistan', 'Saudi Arabia': 'Suudi Arabistan',
  Denmark: 'Danimarka', Norway: 'Norveç', Sweden: 'İsveç', Poland: 'Polonya',
  'Czech-Republic': 'Çekya', Croatia: 'Hırvatistan', Serbia: 'Sırbistan',
  Romania: 'Romanya', Colombia: 'Kolombiya', Chile: 'Şili', Uruguay: 'Uruguay',
  Japan: 'Japonya', 'Korea-South': 'Güney Kore', 'South-Korea': 'Güney Kore',
  China: 'Çin', Australia: 'Avustralya', Egypt: 'Mısır', Qatar: 'Katar',
  'United-Arab-Emirates': 'BAE', Ireland: 'İrlanda', Wales: 'Galler',
  'Northern-Ireland': 'Kuzey İrlanda', Hungary: 'Macaristan', Bulgaria: 'Bulgaristan',
  Slovakia: 'Slovakya', Slovenia: 'Slovenya', Finland: 'Finlandiya', Iceland: 'İzlanda',
  Paraguay: 'Paraguay', Peru: 'Peru', Ecuador: 'Ekvador', Venezuela: 'Venezuela',
  Bolivia: 'Bolivya', Canada: 'Kanada', 'New-Zealand': 'Yeni Zelanda',
  'New Zealand': 'Yeni Zelanda',
};

/** Available leagues and countries (for the scope picker). Only allowed leagues. */
export async function listScopes(): Promise<{ leagues: ScopeOption[]; countries: ScopeOption[] }> {
  const leagues = await pool.query<{ value: string; count: string }>(
    `SELECT league AS value, count(*) AS count FROM clubs
      WHERE league = ANY($1::text[]) GROUP BY league ORDER BY league`,
    [ALLOWED_LEAGUES],
  );
  const countries = await pool.query<{ value: string; count: string }>(
    `SELECT country AS value, count(*) AS count FROM clubs
      WHERE country IS NOT NULL AND league = ANY($1::text[])
      GROUP BY country ORDER BY country`,
    [ALLOWED_LEAGUES],
  );
  return {
    leagues: leagues.rows.map((r) => ({
      value: r.value,
      count: Number(r.count),
      logoUrl: leagueLogoUrl(r.value),
    })),
    countries: countries.rows.map((r) => ({
      value: r.value,
      displayName: COUNTRY_NAME_TR[r.value] ?? r.value,
      count: Number(r.count),
      logoUrl: countryFlag(r.value),
    })),
  };
}

/**
 * Players who played for BOTH teams — used by the practice bot to find a valid
 * answer. Ordered by career length (longer = more recognizable) so the bot
 * tends to name a well-known player. Returns [] when no common player exists.
 */
export async function commonPlayers(
  teamAId: number,
  teamBId: number,
  limit = 6,
): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT p.name
       FROM players p
      WHERE EXISTS (SELECT 1 FROM player_clubs a WHERE a.player_id = p.id AND a.club_id = $1)
        AND EXISTS (SELECT 1 FROM player_clubs b WHERE b.player_id = p.id AND b.club_id = $2)
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = p.id) DESC
      LIMIT $3`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r) => r.name);
}

export interface CommonPlayerInfo {
  name: string;
  imageUrl: string | null;
}

/** Players who played for BOTH teams — with photo URLs for display. */
export async function commonPlayersDetailed(
  teamAId: number,
  teamBId: number,
  limit = 5,
): Promise<CommonPlayerInfo[]> {
  const { rows } = await pool.query<{ name: string; image_url: string | null }>(
    `SELECT p.name, p.image_url
       FROM players p
      WHERE EXISTS (SELECT 1 FROM player_clubs a WHERE a.player_id = p.id AND a.club_id = $1)
        AND EXISTS (SELECT 1 FROM player_clubs b WHERE b.player_id = p.id AND b.club_id = $2)
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = p.id) DESC
      LIMIT $3`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r) => ({ name: r.name, imageUrl: r.image_url }));
}

// ---- Country-Team & Letter-Team helpers ----

/** Players who played for the club AND have the given nationality. */
export async function commonPlayersCountryTeam(
  clubId: number,
  country: string,
  limit = 5,
): Promise<CommonPlayerInfo[]> {
  const { rows } = await pool.query<{ name: string; image_url: string | null }>(
    `SELECT p.name, p.image_url
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1 AND p.nationality = $2
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC
      LIMIT $3`,
    [clubId, country, limit],
  );
  return rows.map((r) => ({ name: r.name, imageUrl: r.image_url }));
}

/** Players who played for the club AND whose normalized name starts with the letter. */
export async function commonPlayersLetterTeam(
  clubId: number,
  letter: string,
  limit = 5,
): Promise<CommonPlayerInfo[]> {
  const prefix = letter.toLowerCase();
  const { rows } = await pool.query<{ name: string; image_url: string | null }>(
    `SELECT p.name, p.image_url
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1 AND p.name_norm LIKE $2 || '%'
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC
      LIMIT $3`,
    [clubId, prefix, limit],
  );
  return rows.map((r) => ({ name: r.name, imageUrl: r.image_url }));
}

/** Are there any valid players for a country-team combination? */
export async function hasPlayersCountryTeam(clubId: number, country: string): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1 AND p.nationality = $2
      LIMIT 1`,
    [clubId, country],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Are there any valid players for a letter-team combination? */
export async function hasPlayersLetterTeam(clubId: number, letter: string): Promise<boolean> {
  const prefix = letter.toLowerCase();
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1 AND p.name_norm LIKE $2 || '%'
      LIMIT 1`,
    [clubId, prefix],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Verify a guess in country-team mode: the player must have played for the club
 * AND be of the given nationality.
 */
export async function verifyCountryTeamGuess(
  clubId: number,
  country: string,
  guess: string,
): Promise<VerifyResult> {
  const club = await getClub(clubId);
  if (!club) throw new Error('Unknown club id');

  const pseudoCountry: ClubHit = { id: 0, name: country, logoUrl: null };
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = {
    autocorrected: false,
    teamA: pseudoCountry,
    teamB: club,
    spellsA: [],
    spellsB: [],
    allClubs: [],
  };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };

  // Fuzzy candidates among players who played for the club AND have the nationality
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT p.id, p.name, p.image_url, word_similarity($1, p.name_norm) AS sim
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $2
        AND p.nationality = $3
        AND word_similarity($1, p.name_norm) >= $4
      ORDER BY sim DESC,
               (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC
      LIMIT 15`,
    [norm, clubId, country, config.verifyMatchThreshold],
  );

  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  let matched = eligible[0]!;
  let correct: boolean;
  let autocorrected = false;

  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) {
    matched = exactCluster[0]!;
    correct = true;
  } else {
    matched = eligible[0]!;
    correct = true;
    autocorrected = true;
  }

  const allClubs = await getPlayerSpells(matched.id);
  const spellsB = allClubs.filter((s) => s.clubId === clubId);

  return {
    correct,
    reason: 'both',
    autocorrected,
    teamA: pseudoCountry,
    teamB: club,
    matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl },
    spellsA: [],
    spellsB,
    allClubs,
  };
}

/**
 * Verify a guess in letter-team mode: the player must have played for the club
 * AND their normalized name must start with the given letter.
 */
export async function verifyLetterTeamGuess(
  clubId: number,
  letter: string,
  guess: string,
): Promise<VerifyResult> {
  const club = await getClub(clubId);
  if (!club) throw new Error('Unknown club id');

  const prefix = letter.toLowerCase();
  const pseudoLetter: ClubHit = { id: 0, name: letter.toUpperCase(), logoUrl: null };
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = {
    autocorrected: false,
    teamA: pseudoLetter,
    teamB: club,
    spellsA: [],
    spellsB: [],
    allClubs: [],
  };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };

  // Fuzzy candidates among players who played for the club AND whose name starts with the letter
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT p.id, p.name, p.image_url, word_similarity($1, p.name_norm) AS sim
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $2
        AND p.name_norm LIKE $3 || '%'
        AND word_similarity($1, p.name_norm) >= $4
      ORDER BY sim DESC,
               (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC
      LIMIT 15`,
    [norm, clubId, prefix, config.verifyMatchThreshold],
  );

  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  let matched = eligible[0]!;
  let correct: boolean;
  let autocorrected = false;

  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) {
    matched = exactCluster[0]!;
    correct = true;
  } else {
    matched = eligible[0]!;
    correct = true;
    autocorrected = true;
  }

  const allClubs = await getPlayerSpells(matched.id);
  const spellsB = allClubs.filter((s) => s.clubId === clubId);

  return {
    correct,
    reason: 'both',
    autocorrected,
    teamA: pseudoLetter,
    teamB: club,
    matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl },
    spellsA: [],
    spellsB,
    allClubs,
  };
}

/** Available nationalities for the country picker (countries with enough players). */
export async function listNationalities(minPlayers = 10): Promise<{ value: string; count: number }[]> {
  const { rows } = await pool.query<{ nationality: string; count: string }>(
    `SELECT p.nationality, count(DISTINCT p.id) AS count
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE p.nationality IS NOT NULL
      GROUP BY p.nationality
     HAVING count(DISTINCT p.id) >= $1
      ORDER BY count DESC`,
    [minPlayers],
  );
  return rows.map((r) => ({ value: r.nationality, count: Number(r.count) }));
}

async function getClub(id: number): Promise<ClubHit | null> {
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    'SELECT id, name, logo_url FROM clubs WHERE id = $1',
    [id],
  );
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
}

async function getPlayerSpells(playerId: number): Promise<SpellInfo[]> {
  const { rows } = await pool.query<{
    club_id: string;
    club_name: string;
    logo_url: string | null;
    start_year: number | null;
    end_year: number | null;
  }>(
    `SELECT pc.club_id, c.name AS club_name, c.logo_url,
            pc.start_year, pc.end_year
       FROM player_clubs pc
       JOIN clubs c ON c.id = pc.club_id
      WHERE pc.player_id = $1
        AND c.is_national = false
      ORDER BY pc.start_year NULLS LAST`,
    [playerId],
  );
  return rows.map((r) => ({
    clubId: Number(r.club_id),
    clubName: r.club_name,
    logoUrl: r.logo_url,
    startYear: r.start_year,
    endYear: r.end_year,
  }));
}

/**
 * Verify whether `guess` names a player who played for BOTH teams.
 *
 * Matching is fuzzy (pg_trgm) and Turkish/accent-insensitive. Among the players
 * whose name is close enough to the guess (>= threshold), if any played for both
 * teams the guess is correct; otherwise we surface the best-matching player so
 * the UI can show "you meant X — here are X's actual clubs".
 */
export async function verifyGuess(
  teamAId: number,
  teamBId: number,
  guess: string,
): Promise<VerifyResult> {
  const [teamA, teamB] = await Promise.all([getClub(teamAId), getClub(teamBId)]);
  if (!teamA || !teamB) {
    throw new Error('Unknown team id(s)');
  }

  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = {
    autocorrected: false,
    teamA,
    teamB,
    spellsA: [],
    spellsB: [],
    allClubs: [],
  };
  if (!norm) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  // 1) Fuzzy candidates by name. word_similarity lets "Sneijder" match
  // "Wesley Sneijder". When similarity scores are equal, prefer the most
  // notable player (more clubs = bigger career, has photo = Wikipedia-notable).
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT p.id, p.name, p.image_url, word_similarity($1, p.name_norm) AS sim
       FROM players p
      WHERE word_similarity($1, p.name_norm) >= $2
      ORDER BY sim DESC,
               (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = p.id) DESC
      LIMIT 25`,
    [norm, config.verifyMatchThreshold],
  );

  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));

  if (eligible.length === 0) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  // 2) Which eligible candidates played for both teams?
  const ids = eligible.map((c) => c.id);
  const { rows: membership } = await pool.query<{
    player_id: string;
    in_a: boolean;
    in_b: boolean;
  }>(
    `SELECT player_id,
            bool_or(club_id = $2) AS in_a,
            bool_or(club_id = $3) AS in_b
       FROM player_clubs
      WHERE player_id = ANY($1::bigint[])
      GROUP BY player_id`,
    [ids, teamAId, teamBId],
  );
  const memberBy = new Map<number, { inA: boolean; inB: boolean }>(
    membership.map((m) => [Number(m.player_id), { inA: m.in_a, inB: m.in_b }]),
  );
  const playedBoth = (id: number) => {
    const m = memberBy.get(id);
    return Boolean(m?.inA && m?.inB);
  };

  // Candidates are ordered by similarity descending; the best is index 0.
  let matched = eligible[0]!;
  let correct: boolean;
  let autocorrected = false;

  // Players matched strongly enough to be "the specific name you typed" (covers
  // same-name variants like R9 "Ronaldo" vs "Cristiano Ronaldo").
  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);

  if (exactCluster.length > 0) {
    // You clearly named a specific player → judge them strictly. If any of the
    // same-name players played both, that's who you meant. ("Ronaldinho" has no
    // such variant, so it stays wrong — never auto-corrected to "Ronaldo".)
    const both = exactCluster.find((c) => playedBoth(c.id));
    matched = both ?? exactCluster[0]!;
    correct = Boolean(both);
  } else {
    // Approximate spelling (a typo) → auto-correct to the closest player who
    // actually played BOTH teams, and accept it. No "wrong" for a misspelling.
    const both = eligible.find((c) => playedBoth(c.id));
    if (both) {
      matched = both;
      correct = true;
      autocorrected = true;
    } else {
      correct = false;
    }
  }

  const allClubs = await getPlayerSpells(matched.id);
  const spellsA = allClubs.filter((s) => s.clubId === teamAId);
  const spellsB = allClubs.filter((s) => s.clubId === teamBId);

  return {
    correct,
    reason: correct ? 'both' : 'not_both',
    autocorrected,
    teamA,
    teamB,
    matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl },
    spellsA,
    spellsB,
    allClubs,
  };
}
